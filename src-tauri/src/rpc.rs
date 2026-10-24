use crate::workspace::{err, Res};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    future::Future,
    path::Path,
    pin::Pin,
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
};
type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Res<Value>>>>>;
pub type Handler =
    Arc<dyn Fn(Value) -> Pin<Box<dyn Future<Output = Res<Value>> + Send>> + Send + Sync>;
pub struct Rpc {
    writer: Arc<Mutex<ChildStdin>>,
    pending: Pending,
    count: AtomicU64,
    lsp: bool,
    jsonrpc: bool,
    child: std::sync::Mutex<Child>,
    owned_group: bool,
}
/// Trecho de stderr que explica falhas: a linha "Error:" do processo e as seguintes,
/// ou as últimas linhas quando não houver uma.
fn summary(text: &str) -> String {
    let lines: Vec<&str> = text.trim().lines().collect();
    match lines
        .iter()
        .position(|l| l.trim_start().starts_with("Error:"))
    {
        Some(i) => lines[i..lines.len().min(i + 3)].join("\n"),
        None => lines[lines.len().saturating_sub(4)..].join("\n"),
    }
}
async fn send(writer: &Mutex<ChildStdin>, mut value: Value, lsp: bool, jsonrpc: bool) -> Res<()> {
    if jsonrpc {
        value["jsonrpc"] = json!("2.0");
    }
    let bytes = serde_json::to_vec(&value).map_err(err)?;
    let mut input = writer.lock().await;
    if lsp {
        input
            .write_all(format!("Content-Length: {}\r\n\r\n", bytes.len()).as_bytes())
            .await
            .map_err(err)?;
    }
    input.write_all(&bytes).await.map_err(err)?;
    if !lsp {
        input.write_all(b"\n").await.map_err(err)?;
    }
    input.flush().await.map_err(err)
}
impl Rpc {
    pub fn spawn_tool(
        program: &str,
        args: &[String],
        root: &Path,
        notify: Arc<dyn Fn(Value) + Send + Sync>,
    ) -> Res<Arc<Self>> {
        Self::spawn_config(
            program,
            args,
            root,
            false,
            false,
            notify,
            default_handler(),
            true,
        )
    }
    #[allow(clippy::too_many_arguments)]
    fn spawn_config(
        program: &str,
        args: &[String],
        root: &Path,
        lsp: bool,
        jsonrpc: bool,
        notify: Arc<dyn Fn(Value) + Send + Sync>,
        request: Handler,
        owned_group: bool,
    ) -> Res<Arc<Self>> {
        let mut command = Command::new(program);
        command
            .args(args)
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        if owned_group {
            command.process_group(0);
        }
        let mut child = command.spawn().map_err(err)?;
        let writer = Arc::new(Mutex::new(child.stdin.take().ok_or("stdin ausente")?));
        let stdout = child.stdout.take().ok_or("stdout ausente")?;
        let mut stderr = child.stderr.take().ok_or("stderr ausente")?;
        // Guarda só o final de stderr (4 KB) para explicar falhas de inicialização ao usuário.
        let tail = Arc::new(std::sync::Mutex::new(String::new()));
        let collected = tail.clone();
        tokio::spawn(async move {
            let mut bytes = [0u8; 4096];
            while let Ok(n) = stderr.read(&mut bytes).await {
                if n == 0 {
                    break;
                }
                if let Ok(mut text) = collected.lock() {
                    text.push_str(&String::from_utf8_lossy(&bytes[..n]));
                    if text.len() > 4096 {
                        let mut cut = text.len() - 4096;
                        while !text.is_char_boundary(cut) {
                            cut += 1;
                        }
                        text.drain(..cut);
                    }
                }
            }
        });
        let closing = tail.clone();
        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let response = pending.clone();
        let input = writer.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let result: Res<()> = async {
                loop {
                    let mut line = String::new();
                    if (&mut reader)
                        .take(16_777_217)
                        .read_line(&mut line)
                        .await
                        .map_err(err)?
                        == 0
                    {
                        break;
                    }
                    let payload = if lsp {
                        let mut length = None;
                        loop {
                            if line.len() > 8192 {
                                return Err("Cabeçalho LSP grande".into());
                            }
                            if let Some((key, value)) = line.split_once(':') {
                                if key.eq_ignore_ascii_case("content-length") {
                                    length = value.trim().parse::<usize>().ok();
                                }
                            }
                            line.clear();
                            reader.read_line(&mut line).await.map_err(err)?;
                            if line == "\r\n" || line == "\n" {
                                break;
                            }
                        }
                        let n = length
                            .filter(|v| *v <= 16777216)
                            .ok_or("Cabeçalho LSP inválido")?;
                        let mut bytes = vec![0; n];
                        reader.read_exact(&mut bytes).await.map_err(err)?;
                        bytes
                    } else {
                        if line.len() > 16777216 {
                            return Err("Mensagem grande demais".into());
                        }
                        line.into_bytes()
                    };
                    let message: Value = serde_json::from_slice(&payload).map_err(err)?;
                    if message.get("method").is_some() {
                        if let Some(id) = message.get("id").cloned() {
                            let request = request.clone();
                            let input = input.clone();
                            tokio::spawn(async move {
                                let result = request(message).await;
                                let value = match result {
                                    Ok(result) => json!({"id":id,"result":result}),
                                    Err(error) => {
                                        json!({"id":id,"error":{"code":-32602,"message":error}})
                                    }
                                };
                                let _ = send(&input, value, lsp, jsonrpc).await;
                            });
                        } else {
                            notify(message);
                        }
                    } else if let Some(id) = message["id"].as_u64() {
                        if let Some(sender) = response.lock().await.remove(&id) {
                            let value = if let Some(error) = message.get("error") {
                                let text = error["message"].as_str().unwrap_or("Erro RPC");
                                Err(match error["data"]["details"].as_str() {
                                    Some(details) => format!("{}: {}", text, details),
                                    None => text.to_owned(),
                                })
                            } else {
                                Ok(message["result"].clone())
                            };
                            let _ = sender.send(value);
                        }
                    }
                }
                Ok(())
            }
            .await;
            let mut reason = result.err().unwrap_or_else(|| "Processo encerrado".into());
            let detail = closing.lock().map(|t| summary(&t)).unwrap_or_default();
            if !detail.is_empty() {
                reason = format!("{}\n{}", reason, detail);
            }
            for (_, tx) in response.lock().await.drain() {
                let _ = tx.send(Err(reason.clone()));
            }
        });
        Ok(Arc::new(Self {
            writer,
            pending,
            count: AtomicU64::new(0),
            lsp,
            jsonrpc,
            child: std::sync::Mutex::new(child),
            owned_group,
        }))
    }
    pub async fn request(&self, method: &str, params: Value, seconds: u64) -> Res<Value> {
        let id = self.count.fetch_add(1, Ordering::Relaxed) + 1;
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);
        if let Err(e) = self
            .notify_value(json!({"id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&id);
            return Err(e);
        }
        let result = tokio::time::timeout(Duration::from_secs(seconds), rx).await;
        self.pending.lock().await.remove(&id);
        result
            .map_err(|_| format!("Tempo esgotado: {}", method))?
            .map_err(err)?
    }
    async fn notify_value(&self, value: Value) -> Res<()> {
        send(&self.writer, value, self.lsp, self.jsonrpc).await
    }
    pub fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            if self.owned_group && child.try_wait().ok().flatten().is_none() {
                if let Some(pid) = child.id() {
                    #[cfg(unix)]
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGKILL);
                    }
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/T", "/F"])
                            .spawn();
                    }
                }
            }
            let _ = child.start_kill();
        }
    }
}
impl Drop for Rpc {
    fn drop(&mut self) {
        self.stop();
    }
}
pub fn default_handler() -> Handler {
    Arc::new(|message| {
        Box::pin(async move {
            if message["method"] == "workspace/configuration" {
                Ok(json!(message["params"]["items"]
                    .as_array()
                    .map(|v| v.iter().map(|_| Value::Null).collect::<Vec<_>>())
                    .unwrap_or_default()))
            } else {
                Ok(Value::Null)
            }
        })
    })
}
#[cfg(test)]
mod tests {
    use super::summary;
    #[test]
    fn stderr_prefere_linha_de_erro() {
        let text = "aviso\nError: Claude Code cannot be launched inside another Claude Code session.\nNested sessions share runtime resources.\nTo bypass, unset CLAUDECODE.\n{\n  code: -32603\n}";
        assert_eq!(summary(text), "Error: Claude Code cannot be launched inside another Claude Code session.\nNested sessions share runtime resources.\nTo bypass, unset CLAUDECODE.");
        assert_eq!(summary("a\nb\nc\nd\ne\n"), "b\nc\nd\ne");
        assert_eq!(summary(""), "");
    }
}
