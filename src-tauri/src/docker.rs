use crate::workspace::{confined, err, Res};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter};
use tokio::{io::AsyncReadExt, process::Command, sync::Mutex};

pub struct Docker {
    program: String,
    mutation: Mutex<()>,
    operations: StdMutex<HashMap<String, Arc<tokio::sync::Notify>>>,
}
struct Operation<'a> {
    owner: &'a Docker,
    id: String,
}
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        if let Ok(mut ops) = self.owner.operations.lock() {
            ops.remove(&self.id);
        }
    }
}
impl Default for Docker {
    fn default() -> Self {
        Self {
            program: if std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some() {
                std::env::var("PHP_IDE_DOCKER_BIN").unwrap_or_else(|_| "docker".into())
            } else {
                "docker".into()
            },
            mutation: Mutex::new(()),
            operations: StdMutex::new(HashMap::new()),
        }
    }
}
pub fn container_id(id: &str) -> Res<()> {
    if !(12..=64).contains(&id.len()) || !id.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Identificador de container inválido".into());
    }
    Ok(())
}
fn image_reference(reference: &str) -> Res<()> {
    if reference.len() > 255
        || reference.is_empty()
        || !reference.as_bytes()[0].is_ascii_alphanumeric()
        || !reference
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._:/@-".contains(&c))
    {
        return Err("Referência de imagem inválida".into());
    }
    Ok(())
}
fn lines(text: &str) -> Res<Vec<Value>> {
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).map_err(err))
        .collect()
}
impl Docker {
    pub fn executable(&self) -> &str {
        &self.program
    }
    async fn run(&self, root: &Path, args: &[String], seconds: u64) -> Res<(String, String)> {
        self.run_report(root, args, seconds, None).await
    }
    async fn run_report(
        &self,
        root: &Path,
        args: &[String],
        seconds: u64,
        progress: Option<(AppHandle, String)>,
    ) -> Res<(String, String)> {
        let mut guard = None;
        let cancel = if let Some((_, id)) = &progress {
            let signal = Arc::new(tokio::sync::Notify::new());
            let mut ops = self.operations.lock().map_err(err)?;
            if ops.contains_key(id) {
                return Err("Operação Docker já existe".into());
            }
            ops.insert(id.clone(), signal.clone());
            guard = Some(Operation {
                owner: self,
                id: id.clone(),
            });
            Some(signal)
        } else {
            None
        };
        let _guard = guard;
        let mut child=Command::new(&self.program).args(args).current_dir(root).env("DOCKER_CLI_HINTS","false").env("COMPOSE_ANSI","never").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true).spawn().map_err(|e|format!("Docker CLI indisponível: {e}. Instale Docker Desktop ou adicione docker ao PATH."))?;
        let stdout = child.stdout.take().ok_or("stdout Docker ausente")?;
        let stderr = child.stderr.take().ok_or("stderr Docker ausente")?;
        let work = tokio::time::timeout(Duration::from_secs(seconds), async {
            let (out, error) =
                tokio::try_join!(capture(stdout, progress.clone()), capture(stderr, progress))?;
            let status = child.wait().await.map_err(err)?;
            if !status.success() {
                return Err(format!(
                    "Docker: {}",
                    if error.is_empty() { out } else { error }
                        .chars()
                        .take(3000)
                        .collect::<String>()
                ));
            }
            Ok((out, error))
        });
        tokio::select! {
            result=work=>result.map_err(|_|format!("Docker não respondeu em {seconds}s. Verifique se o engine está iniciado e se o contexto é acessível; tente conectar novamente."))?,
            _=async{if let Some(signal)=cancel{signal.notified().await;}else{std::future::pending::<()>().await;}}=>Err("Operação Docker interrompida. Atualize os recursos para conferir o estado do engine; cancelar o CLI não reverte alterações já realizadas.".into())
        }
    }
    pub fn cancel(&self, id: &str) -> Res<Value> {
        uuid::Uuid::parse_str(id).map_err(err)?;
        let signal = self
            .operations
            .lock()
            .map_err(err)?
            .get(id)
            .cloned()
            .ok_or("Operação já finalizada ou ainda conectando. Tente novamente em instantes.")?;
        signal.notify_one();
        Ok(Value::Null)
    }
    pub async fn contexts(&self, root: &Path) -> Res<Vec<Value>> {
        let (out, _) = self
            .run(
                root,
                &[
                    "context".into(),
                    "ls".into(),
                    "--format".into(),
                    "{{json .}}".into(),
                ],
                8,
            )
            .await?;
        Ok(lines(&out)?
            .into_iter()
            .map(
                |v| json!({"name":v["Name"],"endpoint":v["DockerEndpoint"],"current":v["Current"]}),
            )
            .collect())
    }
    pub async fn validate_context(&self, root: &Path, context: &str) -> Res<()> {
        if context.len() > 255
            || !self
                .contexts(root)
                .await?
                .iter()
                .any(|v| v["name"] == context)
        {
            return Err("Contexto Docker não encontrado. Atualize a lista de conexões.".into());
        }
        Ok(())
    }
    async fn command(
        &self,
        root: &Path,
        context: &str,
        args: &[&str],
        seconds: u64,
    ) -> Res<(String, String)> {
        let mut argv = vec!["--context".into(), context.into()];
        argv.extend(args.iter().map(|s| s.to_string()));
        self.run(root, &argv, seconds).await
    }
    async fn command_report(
        &self,
        root: &Path,
        context: &str,
        args: &[&str],
        seconds: u64,
        progress: Option<(AppHandle, String)>,
    ) -> Res<(String, String)> {
        let mut argv = vec!["--context".into(), context.into()];
        argv.extend(args.iter().map(|s| s.to_string()));
        self.run_report(root, &argv, seconds, progress).await
    }
    pub fn compose_files(root: &Path) -> Vec<String> {
        [
            "compose.yaml",
            "compose.yml",
            "docker-compose.yaml",
            "docker-compose.yml",
        ]
        .iter()
        .filter(|p| confined(root, p).is_ok_and(|p| p.is_file()))
        .map(|s| s.to_string())
        .collect()
    }
    pub async fn dispatch(
        &self,
        root: &Path,
        app: &AppHandle,
        method: &str,
        args: &[Value],
    ) -> Res<Value> {
        if method == "dockerContexts" {
            return Ok(json!(self.contexts(root).await?));
        }
        if method == "dockerComposeFiles" {
            return Ok(json!(Self::compose_files(root)));
        }
        let get = |i| {
            args.get(i)
                .and_then(Value::as_str)
                .ok_or_else(|| "Parâmetro Docker inválido".to_string())
        };
        let context = get(0)?;
        self.validate_context(root, context).await?;
        match method {
            "dockerSnapshot" => {
                let (version, containers, images, volumes, networks) = tokio::try_join!(
                    self.command(
                        root,
                        context,
                        &["version", "--format", "{{json .Server}}"],
                        8
                    ),
                    self.command(
                        root,
                        context,
                        &[
                            "container",
                            "ls",
                            "--all",
                            "--no-trunc",
                            "--format",
                            "{{json .}}"
                        ],
                        8
                    ),
                    self.command(
                        root,
                        context,
                        &["image", "ls", "--no-trunc", "--format", "{{json .}}"],
                        8
                    ),
                    self.command(
                        root,
                        context,
                        &["volume", "ls", "--format", "{{json .}}"],
                        8
                    ),
                    self.command(
                        root,
                        context,
                        &["network", "ls", "--format", "{{json .}}"],
                        8
                    )
                )?;
                let version: Value = serde_json::from_str(&version.0).map_err(err)?;
                let containers=lines(&containers.0)?.into_iter().map(|v|json!({"id":v["ID"],"name":v["Names"],"image":v["Image"],"state":v["State"],"status":v["Status"],"ports":v["Ports"]})).collect::<Vec<_>>();
                let images=lines(&images.0)?.into_iter().map(|v|json!({"id":v["ID"],"repository":v["Repository"],"tag":v["Tag"],"size":v["Size"]})).collect::<Vec<_>>();
                let volumes = lines(&volumes.0)?
                    .into_iter()
                    .map(|v| json!({"name":v["Name"],"driver":v["Driver"]}))
                    .collect::<Vec<_>>();
                let networks = lines(&networks.0)?
                    .into_iter()
                    .map(|v| json!({"name":v["Name"],"driver":v["Driver"],"id":v["ID"]}))
                    .collect::<Vec<_>>();
                Ok(
                    json!({"version":version["Version"],"os":version["Os"],"containers":containers,"images":images,"volumes":volumes,"networks":networks}),
                )
            }
            "dockerLogs" => {
                let id = get(1)?;
                container_id(id)?;
                let (out, error) = self
                    .command(
                        root,
                        context,
                        &["logs", "--tail", "200", "--timestamps", id],
                        8,
                    )
                    .await?;
                Ok(json!(format!("{out}{error}")))
            }
            "dockerContainerAction" => {
                let id = get(1)?;
                container_id(id)?;
                let action = get(2)?;
                if !["start", "stop", "restart", "rm"].contains(&action) {
                    return Err("Ação Docker inválida".into());
                }
                let _lock = self.mutation.lock().await;
                let output = if action == "stop" || action == "restart" {
                    self.command(
                        root,
                        context,
                        &["container", action, "--time", "10", id],
                        30,
                    )
                    .await?
                } else {
                    self.command(root, context, &["container", action, id], 30)
                        .await?
                };
                Ok(json!(format!("{}{}", output.0, output.1)))
            }
            "dockerPull" => {
                let reference = get(1)?;
                image_reference(reference)?;
                let _lock = self.mutation.lock().await;
                let (out, error) = self
                    .command_report(
                        root,
                        context,
                        &["image", "pull", reference],
                        180,
                        progress(app, args.get(2))?,
                    )
                    .await?;
                Ok(json!(format!("{out}{error}")))
            }
            "dockerCompose" => {
                let file = get(1)?;
                if !Self::compose_files(root).iter().any(|f| f == file) {
                    return Err("Selecione um arquivo Compose da raiz do projeto".into());
                }
                confined(root, file)?;
                let action = get(2)?;
                let mut argv = vec!["compose", "--ansi", "never", "-f", file];
                match action {
                    "services" => argv.extend(["config", "--services"]),
                    "up" => argv.extend(["up", "-d"]),
                    "stop" => argv.push("stop"),
                    "build" => argv.push("build"),
                    _ => return Err("Ação Compose inválida".into()),
                }
                let _lock = self.mutation.lock().await;
                let (out, error) = self
                    .command_report(
                        root,
                        context,
                        &argv,
                        if action == "services" { 8 } else { 180 },
                        progress(app, args.get(3))?,
                    )
                    .await?;
                Ok(json!(format!("{out}{error}")))
            }
            _ => Err("Comando Docker desconhecido".into()),
        }
    }
}
fn progress(app: &AppHandle, value: Option<&Value>) -> Res<Option<(AppHandle, String)>> {
    match value.filter(|v| !v.is_null()) {
        None => Ok(None),
        Some(v) => {
            let id = v.as_str().ok_or("ID de operação inválido")?;
            uuid::Uuid::parse_str(id).map_err(err)?;
            Ok(Some((app.clone(), id.into())))
        }
    }
}
async fn capture(
    mut stream: impl tokio::io::AsyncRead + Unpin,
    progress: Option<(AppHandle, String)>,
) -> Res<String> {
    let mut bytes = Vec::new();
    let mut chunk = [0; 4096];
    loop {
        let n = stream.read(&mut chunk).await.map_err(err)?;
        if n == 0 {
            break;
        }
        if bytes.len() + n > 1048576 {
            return Err(
                "Saída Docker excedeu 1 MiB. Reduza o volume de logs e tente novamente.".into(),
            );
        }
        bytes.extend_from_slice(&chunk[..n]);
        if let Some((app, id)) = &progress {
            let _ = app.emit(
                "docker-progress",
                json!({"id":id,"text":String::from_utf8_lossy(&chunk[..n])}),
            );
        }
    }
    Ok(String::from_utf8_lossy(&bytes).to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn arguments_are_not_shell_commands() {
        assert!(container_id("abcdef012345").is_ok());
        for id in ["--all", "abc; rm -rf /", "x", "../etc"] {
            assert!(container_id(id).is_err());
        }
        for image in [
            "php:8.3-cli",
            "registry.example/a/image:v1",
            "redis@sha256:abc",
        ] {
            assert!(image_reference(image).is_ok());
        }
        for image in ["--privileged", "php;echo x", "a b", ""] {
            assert!(image_reference(image).is_err());
        }
    }
    #[test]
    fn compose_paths_are_project_confined() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("compose.yaml"), "services: {}\n").unwrap();
        assert_eq!(
            Docker::compose_files(&d.path().canonicalize().unwrap()),
            vec!["compose.yaml"]
        );
    }
}
