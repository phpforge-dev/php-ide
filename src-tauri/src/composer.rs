// Composer: só comandos fixos (install, update, require, remove, dump-autoload, run-script,
// validate) com nomes de pacote, restrições e scripts validados, sem shell e com cwd na raiz do
// projeto. O executável vem do PATH, de um caminho escolhido (`composer`/`composer*.phar`) ou da
// imagem Docker oficial com só a raiz do projeto montada. Saída em streaming por `composer-progress`.
use crate::workspace::{confined, err, Res};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tokio::{io::AsyncReadExt, process::Command, sync::oneshot};

const OUTPUT_LIMIT: usize = 512 * 1024;
const TIMEOUT: Duration = Duration::from_secs(1800);

#[derive(Default)]
pub struct Composer {
    running: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[derive(Debug, PartialEq)]
pub enum Runner {
    Auto,
    Path(PathBuf),
    Docker(String),
}

pub fn runner(value: &Value) -> Res<Runner> {
    let s = |key: &str| value.get(key).and_then(Value::as_str).unwrap_or("").trim();
    match s("mode") {
        "" | "auto" => Ok(Runner::Auto),
        "path" => {
            let path = PathBuf::from(s("path"));
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !path.is_absolute() || !name.starts_with("composer") {
                return Err("Caminho do Composer inválido: escolha o arquivo composer ou composer.phar (caminho absoluto).".into());
            }
            if !path.is_file() {
                return Err(format!(
                    "Composer não encontrado em {}. Corrija o caminho do executável.",
                    path.display()
                ));
            }
            Ok(Runner::Path(path))
        }
        "docker" => {
            let image = if s("image").is_empty() {
                "composer:2"
            } else {
                s("image")
            };
            if image.len() > 200
                || !image.as_bytes()[0].is_ascii_alphanumeric()
                || !image
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._:/@-".contains(&c))
            {
                return Err("Imagem Docker do Composer inválida".into());
            }
            Ok(Runner::Docker(image.to_owned()))
        }
        _ => Err("Modo de execução do Composer desconhecido".into()),
    }
}

fn php() -> String {
    std::env::var("PHP_IDE_PHP_BIN").unwrap_or_else(|_| "php".into())
}

fn on_path(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) {
        &[".bat", ".exe", ""]
    } else {
        &[""]
    };
    std::env::split_paths(&paths)
        .flat_map(|dir| names.iter().map(move |ext| dir.join(format!("{name}{ext}"))))
        .find(|p| p.is_file())
}

/// Programa e argumentos iniciais; `.phar` roda pelo PHP configurado.
pub fn resolve(root: &Path, runner: &Runner, docker: &str) -> Res<(String, Vec<String>)> {
    let path = match runner {
        Runner::Docker(image) => {
            let mut args = vec![
                "run".into(),
                "--rm".into(),
                "--volume".into(),
                format!("{}:/app", root.display()),
                "--workdir".into(),
                "/app".into(),
                "--env".into(),
                "COMPOSER_NO_INTERACTION=1".into(),
                "--env".into(),
                "COMPOSER_HOME=/tmp/composer".into(),
            ];
            #[cfg(unix)]
            if let Ok(meta) = std::fs::metadata(root) {
                use std::os::unix::fs::MetadataExt;
                // Arquivos criados em vendor ficam com o dono do projeto, não root.
                args.extend(["--user".into(), format!("{}:{}", meta.uid(), meta.gid())]);
            }
            args.push(image.clone());
            return Ok((docker.to_owned(), args));
        }
        Runner::Path(path) => path.clone(),
        Runner::Auto => match std::env::var_os("PHP_IDE_COMPOSER_BIN").map(PathBuf::from) {
            Some(path) => path,
            None => match on_path("composer") {
                Some(path) => path,
                None if root.join("composer.phar").is_file() => {
                    return Ok((php(), vec![confined(root, "composer.phar")?.to_string_lossy().to_string()]));
                }
                None => return Err("Composer não encontrado no PATH. Configure o caminho do executável (composer ou composer.phar) ou use a imagem Docker composer:2.".into()),
            },
        },
    };
    if path.extension().is_some_and(|e| e == "phar") {
        Ok((php(), vec![path.to_string_lossy().to_string()]))
    } else {
        Ok((path.to_string_lossy().to_string(), vec![]))
    }
}

/// Nome de pacote do schema do Composer (`vendor/projeto`) ou de plataforma (`php`, `ext-*`, `lib-*`).
fn package(name: &str, wildcard: bool) -> Res<()> {
    let pattern = if wildcard {
        r"^[a-z0-9*]([_.-]?[a-z0-9*]+)*/[a-z0-9*](([_.]|-{1,2})?[a-z0-9*]+)*$"
    } else {
        r"^([a-z0-9]([_.-]?[a-z0-9]+)*/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*|php|ext-[a-z0-9_-]+|lib-[a-z0-9_-]+)$"
    };
    if name.len() > 214 || !regex::Regex::new(pattern).map_err(err)?.is_match(name) {
        return Err(format!("Nome de pacote inválido: {name}"));
    }
    Ok(())
}
fn constraint(value: &str) -> Res<()> {
    if value.is_empty()
        || value.len() > 100
        || value.starts_with('-')
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b" .*^~<>=|,@_!-".contains(&c))
    {
        return Err(format!("Restrição de versão inválida: {value}"));
    }
    Ok(())
}

/// Argumentos do Composer para um pedido do renderer, sem executar nada.
pub fn plan(root: &Path, request: &Value) -> Res<Vec<String>> {
    let flag = |key: &str| request.get(key).and_then(Value::as_bool).unwrap_or(false);
    let packages: Vec<String> = match request.get("packages") {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(list)) if list.len() <= 50 => list
            .iter()
            .map(|v| v.as_str().map(str::trim).map(str::to_owned).ok_or("Pacote inválido"))
            .collect::<Result<_, _>>()?,
        _ => return Err("Lista de pacotes inválida".into()),
    };
    if !root.join("composer.json").is_file() && request["action"] != "require" {
        return Err("composer.json não encontrado na raiz do projeto".into());
    }
    let mut args: Vec<String> = match request.get("action").and_then(Value::as_str).unwrap_or("") {
        "install" => vec!["install".into()],
        "update" => {
            for p in &packages {
                package(p, true)?;
            }
            let mut a = vec!["update".to_owned()];
            if flag("lock") {
                a.push("--lock".into());
            }
            a.extend(packages);
            a
        }
        "require" | "remove" => {
            let action = request["action"].as_str().unwrap_or_default();
            if packages.is_empty() {
                return Err("Informe ao menos um pacote".into());
            }
            let mut a = vec![action.to_owned()];
            if flag("dev") {
                a.push("--dev".into());
            }
            for p in packages {
                let (name, version) = match p.split_once(':') {
                    Some((n, v)) if action == "require" => (n.to_owned(), Some(v.trim().to_owned())),
                    _ => (p.clone(), None),
                };
                package(&name, false)?;
                if let Some(v) = &version {
                    constraint(v)?;
                }
                a.push(match version {
                    Some(v) => format!("{name}:{v}"),
                    None => name,
                });
            }
            a
        }
        "dump-autoload" => {
            let mut a = vec!["dump-autoload".to_owned()];
            if flag("optimize") {
                a.push("--optimize".into());
            }
            a
        }
        "validate" => vec!["validate".into(), "--no-check-publish".into()],
        "run-script" => {
            let script = request.get("script").and_then(Value::as_str).unwrap_or("");
            if script.is_empty()
                || script.len() > 100
                || script.starts_with('-')
                || !script
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
            {
                return Err("Nome de script inválido".into());
            }
            let json: Value = serde_json::from_str(
                &std::fs::read_to_string(confined(root, "composer.json")?).map_err(err)?,
            )
            .map_err(|e| format!("composer.json inválido: {e}"))?;
            if json["scripts"].get(script).is_none() {
                return Err(format!("Script {script} não existe em composer.json"));
            }
            vec!["run-script".into(), script.to_owned()]
        }
        _ => return Err("Ação do Composer desconhecida".into()),
    };
    args.extend(["--no-interaction".into(), "--no-ansi".into()]);
    Ok(args)
}

fn search_url(query: &str) -> Res<url::Url> {
    let query = query.trim();
    if query.is_empty() || query.len() > 100 || query.contains(['\n', '\r', '\0']) {
        return Err("Busca inválida".into());
    }
    url::Url::parse_with_params(
        "https://packagist.org/search.json",
        &[("q", query), ("per_page", "30")],
    )
    .map_err(err)
}
fn versions_url(name: &str) -> Res<String> {
    package(name, false)?;
    if !name.contains('/') {
        return Err("Pacote de plataforma não tem versões no Packagist".into());
    }
    Ok(format!("https://repo.packagist.org/p2/{name}.json"))
}
pub fn parse_search(body: &str) -> Res<Value> {
    let data: Value = serde_json::from_str(body).map_err(|e| format!("Resposta inesperada do Packagist: {e}"))?;
    let results = data["results"].as_array().cloned().unwrap_or_default();
    Ok(Value::Array(
        results
            .iter()
            .filter_map(|r| {
                Some(json!({
                    "name": r["name"].as_str()?,
                    "description": r["description"].as_str().unwrap_or(""),
                    "downloads": r["downloads"].as_u64().unwrap_or(0),
                    "favers": r["favers"].as_u64().unwrap_or(0),
                    "abandoned": !r["abandoned"].is_null() && r["abandoned"] != false,
                }))
            })
            .collect(),
    ))
}
/// Versões do metadado v2 do Packagist, estáveis primeiro, sem `dev-*`.
pub fn parse_versions(body: &str, name: &str) -> Res<Value> {
    let data: Value = serde_json::from_str(body).map_err(|e| format!("Resposta inesperada do Packagist: {e}"))?;
    let list = data["packages"][name].as_array().cloned().unwrap_or_default();
    let versions: Vec<&str> = list
        .iter()
        .filter_map(|v| v["version"].as_str())
        .filter(|v| !v.starts_with("dev-") && !v.ends_with("-dev"))
        .collect();
    let stable = |v: &&str| !v.contains('-');
    let (mut out, rest): (Vec<&str>, Vec<&str>) = versions.into_iter().partition(stable);
    out.extend(rest);
    out.truncate(40);
    Ok(json!(out))
}
async fn fetch(url: &str) -> Res<String> {
    let out = Command::new("curl")
        .args(["--silent", "--show-error", "--fail", "--location", "--proto", "=https", "--max-time", "20", "--max-filesize", "20000000", url])
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("curl indisponível para consultar o Packagist ({e}). Digite o nome do pacote manualmente."))?;
    if !out.status.success() {
        return Err(format!(
            "Packagist indisponível: {}. Verifique a conexão ou digite o nome do pacote manualmente.",
            String::from_utf8_lossy(&out.stderr).trim().chars().take(300).collect::<String>()
        ));
    }
    String::from_utf8(out.stdout).map_err(err)
}

fn run_id(id: &str) -> Res<()> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Identificador de execução inválido".into());
    }
    Ok(())
}

impl Composer {
    pub async fn dispatch(&self, root: &Path, app: &AppHandle, docker: &str, method: &str, args: &[Value]) -> Res<Value> {
        let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
        match method {
            "composerRun" => {
                run_id(s(0))?;
                let (program, mut prefix) = resolve(root, &runner(args.get(1).unwrap_or(&Value::Null))?, docker)?;
                prefix.extend(plan(root, args.get(2).unwrap_or(&Value::Null))?);
                let app = app.clone();
                let id = s(0).to_owned();
                let emit = move |text: String| {
                    let _ = app.emit("composer-progress", json!({"id": id, "text": text}));
                };
                self.run(root, s(0), &program, &prefix, Arc::new(emit)).await
            }
            "composerCancel" => {
                run_id(s(0))?;
                if let Some(stop) = self.running.lock().map_err(err)?.remove(s(0)) {
                    let _ = stop.send(());
                }
                Ok(Value::Null)
            }
            "composerProbe" => {
                let (program, mut prefix) = resolve(root, &runner(args.first().unwrap_or(&Value::Null))?, docker)?;
                prefix.extend(["--version".into(), "--no-ansi".into()]);
                let command = display(&program, &prefix);
                let output = Command::new(&program)
                    .args(&prefix)
                    .current_dir(root)
                    .stdin(Stdio::null())
                    .kill_on_drop(true)
                    .output();
                let out = tokio::time::timeout(Duration::from_secs(120), output)
                    .await
                    .map_err(|_| "Composer não respondeu em 120 s".to_owned())?
                    .map_err(|e| format!("Composer não encontrado: não foi possível iniciar {program} ({e}). Corrija o caminho do executável."))?;
                let text = String::from_utf8_lossy(&out.stdout).to_string() + &String::from_utf8_lossy(&out.stderr);
                if !out.status.success() {
                    return Err(format!("{command} falhou: {}", text.trim().chars().take(1500).collect::<String>()));
                }
                let version = text.lines().find(|l| l.contains("Composer")).unwrap_or(text.trim()).trim().to_owned();
                Ok(json!({"command": command, "version": version}))
            }
            "composerSearch" => parse_search(&fetch(search_url(s(0))?.as_str()).await?),
            "composerVersions" => parse_versions(&fetch(&versions_url(s(0))?).await?, s(0)),
            _ => Err("Comando do Composer desconhecido".into()),
        }
    }

    async fn run(&self, root: &Path, id: &str, program: &str, args: &[String], emit: Arc<dyn Fn(String) + Send + Sync>) -> Res<Value> {
        let (stop, cancelled) = oneshot::channel();
        {
            let mut running = self.running.lock().map_err(err)?;
            if !running.is_empty() {
                return Err("O Composer já está em execução. Aguarde ou interrompa a execução atual.".into());
            }
            running.insert(id.to_owned(), stop);
        }
        let result = execute(root, program, args, cancelled, emit).await;
        if let Ok(mut running) = self.running.lock() {
            running.remove(id);
        }
        result
    }
}

fn display(program: &str, args: &[String]) -> String {
    let name = Path::new(program).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| program.to_owned());
    std::iter::once(name).chain(args.iter().cloned()).collect::<Vec<_>>().join(" ")
}

async fn pump(mut reader: impl tokio::io::AsyncRead + Unpin, emit: Arc<dyn Fn(String) + Send + Sync>, out: Arc<Mutex<Vec<u8>>>) {
    let mut chunk = [0u8; 8192];
    while let Ok(n) = reader.read(&mut chunk).await {
        if n == 0 {
            break;
        }
        emit(String::from_utf8_lossy(&chunk[..n]).to_string());
        if let Ok(mut out) = out.lock() {
            out.extend_from_slice(&chunk[..n]);
            if out.len() > OUTPUT_LIMIT * 2 {
                let excess = out.len() - OUTPUT_LIMIT;
                out.drain(..excess);
            }
        }
    }
}

pub async fn execute(root: &Path, program: &str, args: &[String], cancelled: oneshot::Receiver<()>, emit: Arc<dyn Fn(String) + Send + Sync>) -> Res<Value> {
    let command = display(program, args);
    emit(format!("$ {command}\n"));
    let started = Instant::now();
    let mut child = Command::new(program)
        .args(args)
        .current_dir(root)
        .env("COMPOSER_NO_INTERACTION", "1")
        .env("NO_COLOR", "1")
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Composer não encontrado: não foi possível iniciar {program} ({e}). Corrija o caminho do executável ou use Docker."))?;
    let output = Arc::new(Mutex::new(Vec::new()));
    let stdout = tokio::spawn(pump(child.stdout.take().ok_or("stdout indisponível")?, emit.clone(), output.clone()));
    let stderr = tokio::spawn(pump(child.stderr.take().ok_or("stderr indisponível")?, emit.clone(), output.clone()));
    let (code, stopped, timed_out) = tokio::select! {
        status = child.wait() => (status.map_err(err)?.code(), false, false),
        _ = cancelled => { let _ = child.kill().await; (None, true, false) }
        _ = tokio::time::sleep(TIMEOUT) => { let _ = child.kill().await; (None, false, true) }
    };
    let _ = stdout.await;
    let _ = stderr.await;
    let mut text = output.lock().map_err(err)?.clone();
    if text.len() > OUTPUT_LIMIT {
        text.drain(..text.len() - OUTPUT_LIMIT);
    }
    Ok(json!({
        "command": command,
        "exitCode": code,
        "cancelled": stopped,
        "timedOut": timed_out,
        "durationMs": started.elapsed().as_millis() as u64,
        "output": String::from_utf8_lossy(&text),
    }))
}

#[cfg(test)]
mod test {
    use super::*;

    fn project(scripts: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::write(root.join("composer.json"), format!(r#"{{"name":"a/b","scripts":{{{scripts}}}}}"#)).unwrap();
        (dir, root)
    }

    #[test]
    fn plano_aceita_so_acoes_e_argumentos_validos() {
        let (_dir, root) = project(r#""lint":"php -l x.php","cache:clear":"x""#);
        let p = |v: Value| plan(&root, &v);
        assert_eq!(p(json!({"action":"install"})).unwrap(), ["install", "--no-interaction", "--no-ansi"]);
        assert_eq!(p(json!({"action":"update","packages":["symfony/*","monolog/monolog"]})).unwrap()[..3], ["update", "symfony/*", "monolog/monolog"]);
        assert_eq!(p(json!({"action":"update","lock":true})).unwrap()[..2], ["update", "--lock"]);
        assert_eq!(p(json!({"action":"require","dev":true,"packages":["phpunit/phpunit:^11.0 || ^12.0","ext-intl"]})).unwrap()[..4], ["require", "--dev", "phpunit/phpunit:^11.0 || ^12.0", "ext-intl"]);
        assert_eq!(p(json!({"action":"remove","packages":["a/b"]})).unwrap()[..2], ["remove", "a/b"]);
        assert_eq!(p(json!({"action":"dump-autoload","optimize":true})).unwrap()[..2], ["dump-autoload", "--optimize"]);
        assert_eq!(p(json!({"action":"run-script","script":"cache:clear"})).unwrap()[..2], ["run-script", "cache:clear"]);
        for bad in [
            json!({"action":"exec"}),
            json!({"action":"require","packages":[]}),
            json!({"action":"require","packages":["--dev"]}),
            json!({"action":"require","packages":["a/b:--x"]}),
            json!({"action":"require","packages":["A/B"]}),
            json!({"action":"require","packages":["a/b; rm -rf /"]}),
            json!({"action":"remove","packages":["a/b:^1"]}),
            json!({"action":"update","packages":["../x"]}),
            json!({"action":"run-script","script":"missing"}),
            json!({"action":"run-script","script":"--help"}),
            json!({"action":"update","packages":"a/b"}),
        ] {
            assert!(p(bad.clone()).is_err(), "{bad}");
        }
        std::fs::remove_file(root.join("composer.json")).unwrap();
        assert!(p(json!({"action":"install"})).unwrap_err().contains("composer.json"));
    }

    #[test]
    fn executavel_por_caminho_docker_ou_phar() {
        let (_dir, root) = project("");
        assert_eq!(runner(&json!({})).unwrap(), Runner::Auto);
        assert!(runner(&json!({"mode":"path","path":"composer"})).is_err(), "relativo");
        assert!(runner(&json!({"mode":"path","path":"/bin/sh"})).is_err(), "nome fora do contrato");
        assert!(runner(&json!({"mode":"path","path":root.join("missing/composer")})).unwrap_err().contains("não encontrado"));
        let phar = root.join("composer.phar");
        std::fs::write(&phar, "<?php").unwrap();
        let r = runner(&json!({"mode":"path","path":phar})).unwrap();
        assert_eq!(resolve(&root, &r, "docker").unwrap(), (php(), vec![phar.to_string_lossy().to_string()]));
        assert!(runner(&json!({"mode":"docker","image":"x; rm"})).is_err());
        let (program, args) = resolve(&root, &runner(&json!({"mode":"docker"})).unwrap(), "docker").unwrap();
        assert_eq!(program, "docker");
        assert!(args.contains(&format!("{}:/app", root.display())));
        assert_eq!(args.last().unwrap(), "composer:2");
        assert!(runner(&json!({"mode":"x"})).is_err());
    }

    #[test]
    fn packagist_url_e_respostas() {
        assert_eq!(search_url("symfony console").unwrap().as_str(), "https://packagist.org/search.json?q=symfony+console&per_page=30");
        assert!(search_url("").is_err() && search_url("a\nb").is_err());
        assert_eq!(versions_url("monolog/monolog").unwrap(), "https://repo.packagist.org/p2/monolog/monolog.json");
        assert!(versions_url("../../x").is_err() && versions_url("php").is_err());
        let found = parse_search(r#"{"results":[{"name":"a/b","description":"d","downloads":5,"favers":1,"abandoned":"c/d"},{"name":"e/f","downloads":1}],"total":2}"#).unwrap();
        assert_eq!(found, json!([{"name":"a/b","description":"d","downloads":5,"favers":1,"abandoned":true},{"name":"e/f","description":"","downloads":1,"favers":0,"abandoned":false}]));
        let versions = parse_versions(r#"{"packages":{"a/b":[{"version":"2.0.0-RC1"},{"version":"1.2.0"},{"version":"dev-main"},{"version":"1.1.0"}]}}"#, "a/b").unwrap();
        assert_eq!(versions, json!(["1.2.0", "1.1.0", "2.0.0-RC1"]));
        assert!(parse_search("<html>").is_err());
    }

    /// Composer falso em PHP: ecoa os argumentos; prova que não há shell nem interpolação.
    #[tokio::test]
    async fn executa_sem_shell_com_streaming_e_cancelamento() {
        if std::process::Command::new(php()).arg("-v").output().is_err() {
            eprintln!("PHP indisponível; teste ignorado");
            return;
        }
        let (_dir, root) = project(r#""slow":"x""#);
        std::fs::write(root.join("composer.phar"), "<?php\nif (($argv[1] ?? '') === 'run-script') { sleep(30); }\necho json_encode(array_slice($argv, 1)), \"\\n\";\nfwrite(STDERR, \"aviso\\n\");\nexit(2);\n").unwrap();
        let runner = runner(&json!({"mode":"path","path":root.join("composer.phar")})).unwrap();
        let (program, mut args) = resolve(&root, &runner, "docker").unwrap();
        assert!(plan(&root, &json!({"action":"require","packages":["a/b:^1.0 || $(touch pwned)"]})).is_err());
        args.extend(plan(&root, &json!({"action":"require","packages":["a/b:^1.0 || <2.0"]})).unwrap());
        let chunks = Arc::new(Mutex::new(String::new()));
        let sink = chunks.clone();
        let composer = Composer::default();
        let out = composer.run(&root, "c-1", &program, &args, Arc::new(move |t: String| sink.lock().unwrap().push_str(&t))).await.unwrap();
        assert_eq!(out["exitCode"], 2);
        assert!(out["output"].as_str().unwrap().contains("aviso"));
        assert!(chunks.lock().unwrap().starts_with("$ "), "comando aparece antes da saída");
        assert!(chunks.lock().unwrap().contains(r#""require","a\/b:^1.0 || <2.0""#));
        assert!(!root.join("pwned").exists());

        let composer = Arc::new(composer);
        let (program2, mut args2) = resolve(&root, &runner, "docker").unwrap();
        args2.extend(plan(&root, &json!({"action":"run-script","script":"slow"})).unwrap());
        let job = {
            let composer = composer.clone();
            let root = root.clone();
            tokio::spawn(async move { composer.run(&root, "c-2", &program2, &args2, Arc::new(|_| {})).await })
        };
        while composer.running.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let busy = composer.run(&root, "c-3", &program, &args, Arc::new(|_| {})).await;
        assert!(busy.unwrap_err().contains("em execução"));
        if let Some(stop) = composer.running.lock().unwrap().remove("c-2") {
            stop.send(()).unwrap();
        }
        let out = tokio::time::timeout(Duration::from_secs(10), job).await.unwrap().unwrap().unwrap();
        assert_eq!(out["cancelled"], true);
    }
}
