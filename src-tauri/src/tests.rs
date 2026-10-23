// Execução de testes Pest/PHPUnit: só `php vendor/bin/{pest,phpunit}` do próprio projeto,
// com caminho confinado à raiz e filtro passado como um único argumento (`--filter=`),
// sem shell. O relatório JUnit vai para um arquivo temporário fora do projeto e é
// devolvido ao renderer, que o interpreta.
use crate::workspace::{confined, err, Res};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
    time::{Duration, Instant},
};
use tokio::{io::AsyncReadExt, process::Command, sync::oneshot};

const OUTPUT_LIMIT: usize = 256 * 1024;
const JUNIT_LIMIT: u64 = 8 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct Tests {
    running: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[derive(Debug)]
pub struct Plan {
    pub binary: String,
    pub target: String,
    pub filter: Option<String>,
}

/// Valida a requisição do renderer e monta os argumentos sem executar nada.
pub fn plan(root: &Path, framework: &str, path: &str, filter: &str) -> Res<Plan> {
    if !["pest", "phpunit"].contains(&framework) {
        return Err("Framework de testes desconhecido".into());
    }
    let binary = format!("vendor/bin/{framework}");
    if !root.join(&binary).exists() || !confined(root, &binary)?.is_file() {
        return Err(format!(
            "{binary} não encontrado. Rode composer install no projeto e tente novamente."
        ));
    }
    let target = confined(root, if path.is_empty() { "." } else { path })?;
    if !(target.is_dir() || target.extension().is_some_and(|e| e == "php")) {
        return Err("Escolha um arquivo .php ou uma pasta de testes".into());
    }
    let target = target
        .strip_prefix(root)
        .map_err(err)?
        .to_string_lossy()
        .replace('\\', "/");
    if filter.len() > 1000 || filter.contains(['\n', '\r', '\0']) {
        return Err("Filtro de teste inválido".into());
    }
    Ok(Plan {
        binary,
        target: if target.is_empty() {
            ".".into()
        } else {
            target
        },
        filter: (!filter.is_empty()).then(|| filter.to_owned()),
    })
}

fn php() -> String {
    std::env::var("PHP_IDE_PHP_BIN").unwrap_or_else(|_| "php".into())
}

/// Lê o fluxo até o fim mantendo só os últimos `OUTPUT_LIMIT` bytes (o resumo fica no final).
async fn tail(mut reader: impl tokio::io::AsyncRead + Unpin) -> Vec<u8> {
    let mut out = Vec::new();
    let mut chunk = [0u8; 8192];
    while let Ok(n) = reader.read(&mut chunk).await {
        if n == 0 {
            break;
        }
        out.extend_from_slice(&chunk[..n]);
        if out.len() > OUTPUT_LIMIT * 2 {
            out.drain(..out.len() - OUTPUT_LIMIT);
        }
    }
    if out.len() > OUTPUT_LIMIT {
        out.drain(..out.len() - OUTPUT_LIMIT);
    }
    out
}

impl Tests {
    pub async fn dispatch(&self, root: &Path, method: &str, args: &[Value]) -> Res<Value> {
        let s = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
        let id = s(0);
        if id.is_empty()
            || id.len() > 64
            || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err("Identificador de execução inválido".into());
        }
        match method {
            "testRun" => self.run(root, id, plan(root, s(1), s(2), s(3))?).await,
            "testCancel" => {
                if let Some(stop) = self.running.lock().map_err(err)?.remove(id) {
                    let _ = stop.send(());
                }
                Ok(Value::Null)
            }
            _ => Err("Comando de testes desconhecido".into()),
        }
    }

    async fn run(&self, root: &Path, id: &str, plan: Plan) -> Res<Value> {
        let (stop, cancelled) = oneshot::channel();
        {
            let mut running = self.running.lock().map_err(err)?;
            if !running.is_empty() {
                return Err(
                    "Já há testes em execução. Aguarde ou interrompa a execução atual.".into(),
                );
            }
            running.insert(id.to_owned(), stop);
        }
        let result = execute(root, &plan, cancelled).await;
        if let Ok(mut running) = self.running.lock() {
            running.remove(id);
        }
        result
    }
}

async fn execute(root: &Path, plan: &Plan, cancelled: oneshot::Receiver<()>) -> Res<Value> {
    let junit: PathBuf =
        std::env::temp_dir().join(format!("php-ide-junit-{}.xml", uuid::Uuid::new_v4()));
    let mut args = vec![plan.binary.clone(), plan.target.clone()];
    if let Some(filter) = &plan.filter {
        args.push(format!("--filter={filter}"));
    }
    let program = php();
    let command = format!("{program} {}", args.join(" "));
    args.extend([
        "--log-junit".into(),
        junit.to_string_lossy().to_string(),
        "--colors=never".into(),
    ]);
    let started = Instant::now();
    let mut child = Command::new(&program)
        .args(&args)
        .current_dir(root)
        .env("NO_COLOR", "1")
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Não foi possível iniciar {program}: {e}. Instale PHP 8.2+ ou defina PHP_IDE_PHP_BIN."))?;
    let stdout = tokio::spawn(tail(child.stdout.take().ok_or("stdout indisponível")?));
    let stderr = tokio::spawn(tail(child.stderr.take().ok_or("stderr indisponível")?));
    let (code, stopped, timed_out) = tokio::select! {
        status = child.wait() => (status.map_err(err)?.code(), false, false),
        _ = cancelled => { let _ = child.kill().await; (None, true, false) }
        _ = tokio::time::sleep(TIMEOUT) => { let _ = child.kill().await; (None, false, true) }
    };
    let mut output = stdout.await.unwrap_or_default();
    output.extend(stderr.await.unwrap_or_default());
    let report = match std::fs::metadata(&junit) {
        Ok(meta) if meta.len() <= JUNIT_LIMIT => std::fs::read_to_string(&junit).ok(),
        _ => None,
    };
    let _ = std::fs::remove_file(&junit);
    Ok(json!({
        "command": command,
        "exitCode": code,
        "cancelled": stopped,
        "timedOut": timed_out,
        "durationMs": started.elapsed().as_millis() as u64,
        "junit": report,
        "output": String::from_utf8_lossy(&output),
    }))
}

#[cfg(test)]
mod test {
    use super::*;

    fn project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("vendor/bin")).unwrap();
        std::fs::create_dir_all(root.join("tests/Unit")).unwrap();
        std::fs::write(root.join("tests/Unit/ExampleTest.php"), "<?php\n").unwrap();
        (dir, root)
    }

    #[test]
    fn plan_rejeita_entradas_fora_do_contrato() {
        let (_dir, root) = project();
        assert!(plan(&root, "phpunit", "tests", "")
            .unwrap_err()
            .contains("composer install"));
        std::fs::write(root.join("vendor/bin/phpunit"), "<?php\n").unwrap();
        assert!(plan(&root, "sh", "tests", "").is_err());
        assert!(plan(&root, "phpunit", "../", "").is_err());
        assert!(plan(&root, "phpunit", "/etc/passwd", "").is_err());
        assert!(
            plan(&root, "phpunit", "vendor/bin/phpunit", "").is_err(),
            "só .php ou pasta"
        );
        assert!(plan(&root, "phpunit", "tests", "a\nb").is_err());
        let ok = plan(&root, "phpunit", "tests/Unit/ExampleTest.php", "/::testA$/").unwrap();
        assert_eq!(ok.target, "tests/Unit/ExampleTest.php");
        assert_eq!(ok.filter.as_deref(), Some("/::testA$/"));
        assert_eq!(plan(&root, "phpunit", "", "").unwrap().target, ".");
    }

    #[test]
    fn binario_fora_do_projeto_e_recusado() {
        let (_dir, root) = project();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("pest"), "<?php\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(outside.path().join("pest"), root.join("vendor/bin/pest"))
            .unwrap();
        #[cfg(unix)]
        assert!(plan(&root, "pest", "tests", "").is_err());
    }

    /// Runner falso em PHP: grava os argumentos recebidos como relatório JUnit.
    #[tokio::test]
    async fn executa_sem_shell_e_devolve_junit() {
        if std::process::Command::new(php())
            .arg("-v")
            .output()
            .is_err()
        {
            eprintln!("PHP indisponível; teste ignorado");
            return;
        }
        let (_dir, root) = project();
        std::fs::write(
            root.join("vendor/bin/phpunit"),
            "<?php\n$i = array_search('--log-junit', $argv);\nfile_put_contents($argv[$i + 1], json_encode(array_slice($argv, 1)));\necho \"saida\\n\";\nexit(1);\n",
        )
        .unwrap();
        let tests = Tests::default();
        let filter = "x; rm -rf / $(touch pwned)";
        let out = tests
            .dispatch(
                &root,
                "testRun",
                &[
                    json!("run-1"),
                    json!("phpunit"),
                    json!("tests/Unit/ExampleTest.php"),
                    json!(filter),
                ],
            )
            .await
            .unwrap();
        assert_eq!(out["exitCode"], 1);
        assert!(out["output"].as_str().unwrap().contains("saida"));
        let args: Vec<String> = serde_json::from_str(out["junit"].as_str().unwrap()).unwrap();
        assert_eq!(args[0], "tests/Unit/ExampleTest.php");
        assert_eq!(args[1], format!("--filter={filter}"));
        assert!(!root.join("pwned").exists());
        assert!(tests.running.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn cancelamento_interrompe_o_processo() {
        if std::process::Command::new(php())
            .arg("-v")
            .output()
            .is_err()
        {
            return;
        }
        let (_dir, root) = project();
        std::fs::write(root.join("vendor/bin/pest"), "<?php\nsleep(30);\n").unwrap();
        let tests = std::sync::Arc::new(Tests::default());
        let runner = tests.clone();
        let root2 = root.clone();
        let job = tokio::spawn(async move {
            runner
                .dispatch(
                    &root2,
                    "testRun",
                    &[json!("run-2"), json!("pest"), json!("tests"), json!("")],
                )
                .await
        });
        while tests.running.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        let busy = tests
            .dispatch(
                &root,
                "testRun",
                &[json!("run-3"), json!("pest"), json!("tests"), json!("")],
            )
            .await;
        assert!(busy.unwrap_err().contains("em execução"));
        tests
            .dispatch(&root, "testCancel", &[json!("run-2")])
            .await
            .unwrap();
        let out = tokio::time::timeout(Duration::from_secs(10), job)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(out["cancelled"], true);
        assert!(out["junit"].is_null());
    }
}
