use crate::workspace::{err, Res};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{Arc, Condvar, Mutex},
};
use tauri::{AppHandle, Emitter};
struct Flow {
    pending: usize,
    alive: bool,
}
struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    flow: Arc<(Mutex<Flow>, Condvar)>,
}
#[derive(Default)]
pub struct Terminals {
    sessions: HashMap<String, Session>,
}
impl Terminals {
    pub fn create(
        &mut self,
        app: AppHandle,
        root: &Path,
        id: &str,
        cols: u16,
        rows: u16,
    ) -> Res<Value> {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| {
            if cfg!(windows) {
                "powershell.exe"
            } else {
                "/bin/sh"
            }
            .into()
        });
        let mut cmd = CommandBuilder::new(&shell);
        if cfg!(windows) {
            cmd.arg("-NoLogo");
        } else {
            cmd.arg("-l");
        }
        let label = Path::new(&shell)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.spawn(app, root, id, (cols, rows), cmd, &label)
    }
    pub fn create_docker(
        &mut self,
        app: AppHandle,
        root: &Path,
        id: &str,
        program: &str,
        context: &str,
        container: &str,
    ) -> Res<Value> {
        let mut cmd = CommandBuilder::new(program);
        cmd.args(["--context", context, "exec", "-it", container, "/bin/sh"]);
        self.spawn(app, root, id, (100, 30), cmd, "Docker /bin/sh")
    }
    fn spawn(
        &mut self,
        app: AppHandle,
        root: &Path,
        id: &str,
        dimensions: (u16, u16),
        mut cmd: CommandBuilder,
        label: &str,
    ) -> Res<Value> {
        let (cols, rows) = dimensions;
        size(cols, rows)?;
        uuid::Uuid::parse_str(id).map_err(err)?;
        if self.sessions.contains_key(id) || self.sessions.len() >= 8 {
            return Err("Sessão existente ou limite de oito terminais".into());
        }
        let pair = native_pty_system()
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(err)?;
        cmd.cwd(root);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        let mut child = pair.slave.spawn_command(cmd).map_err(err)?;
        drop(pair.slave);
        let killer = child.clone_killer();
        let mut reader = pair.master.try_clone_reader().map_err(err)?;
        let writer = pair.master.take_writer().map_err(err)?;
        let flow = Arc::new((
            Mutex::new(Flow {
                pending: 0,
                alive: true,
            }),
            Condvar::new(),
        ));
        let f = flow.clone();
        let identifier = id.to_owned();
        let handle = app.clone();
        std::thread::spawn(move || {
            let mut bytes = [0; 8192];
            let mut tail = vec![];
            while let Ok(n) = reader.read(&mut bytes) {
                if n == 0 {
                    break;
                }
                tail.extend_from_slice(&bytes[..n]);
                let valid = match std::str::from_utf8(&tail) {
                    Ok(_) => tail.len(),
                    Err(e) => {
                        if e.error_len().is_some() {
                            tail.len()
                        } else {
                            e.valid_up_to()
                        }
                    }
                };
                if valid == 0 {
                    continue;
                }
                let data = String::from_utf8_lossy(&tail[..valid]).to_string();
                tail.drain(..valid);
                let count = data.encode_utf16().count();
                let (lock, cv) = &*f;
                let mut state = match lock.lock() {
                    Ok(v) => v,
                    Err(_) => break,
                };
                while state.alive && state.pending > 262144 {
                    state = match cv.wait(state) {
                        Ok(v) => v,
                        Err(_) => return,
                    };
                }
                if !state.alive {
                    break;
                }
                state.pending += count;
                drop(state);
                let _ = handle.emit(
                    "terminal-event",
                    json!({"type":"output","id":identifier,"data":data}),
                );
            }
        });
        let identifier = id.to_owned();
        let f = flow.clone();
        std::thread::spawn(move || {
            let code = child.wait().map(|v| v.exit_code() as i32).unwrap_or(-1);
            if let Ok(mut state) = f.0.lock() {
                state.alive = false;
            }
            f.1.notify_all();
            let _ = app.emit(
                "terminal-event",
                json!({"type":"exit","id":identifier,"code":code}),
            );
        });
        self.sessions.insert(
            id.into(),
            Session {
                master: pair.master,
                writer,
                killer,
                flow,
            },
        );
        Ok(json!({"shell":label}))
    }
    pub fn write(&mut self, id: &str, data: &str) -> Res<Value> {
        if data.len() > 65536 {
            return Err("Entrada excedeu 64 KiB".into());
        }
        let s = self.sessions.get_mut(id).ok_or("Sessão encerrada")?;
        if !s.flow.0.lock().map_err(err)?.alive {
            return Err("Sessão encerrada".into());
        }
        s.writer.write_all(data.as_bytes()).map_err(err)?;
        Ok(Value::Null)
    }
    pub fn resize(&mut self, id: &str, cols: u16, rows: u16) -> Res<Value> {
        size(cols, rows)?;
        if let Some(s) = self.sessions.get(id) {
            s.master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(err)?;
        }
        Ok(Value::Null)
    }
    pub fn ack(&self, id: &str, count: usize) -> Res<Value> {
        if let Some(s) = self.sessions.get(id) {
            let mut f = s.flow.0.lock().map_err(err)?;
            if count > f.pending {
                return Err("Confirmação inválida".into());
            }
            f.pending -= count;
            s.flow.1.notify_all();
        }
        Ok(Value::Null)
    }
    pub fn close(&mut self, id: &str) -> Value {
        if let Some(mut s) = self.sessions.remove(id) {
            if let Ok(mut f) = s.flow.0.lock() {
                f.alive = false;
            }
            s.flow.1.notify_all();
            let _ = s.killer.kill();
        }
        Value::Null
    }
}
impl Drop for Terminals {
    fn drop(&mut self) {
        let ids: Vec<_> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.close(&id);
        }
    }
}
fn size(cols: u16, rows: u16) -> Res<()> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("Dimensões inválidas".into());
    }
    Ok(())
}
