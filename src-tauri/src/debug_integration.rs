// Integração real com Xdebug 3 num container descartável (scripts/check-xdebug.mjs).
// Ignorado por padrão: precisa de Docker e da imagem em PHP_IDE_XDEBUG_IMAGE.
use super::*;

const SCRIPT: &str = r#"<?php
function greet(string $name): string
{
    $message = "Olá, " . $name;
    return $message;
}
$numbers = range(1, 250);
$user = ['name' => 'Ana', 'tags' => ['a', 'b']];
$total = 0;
for ($i = 0; $i < 10; $i++) {
    $total += $i;
}
$greeting = greet($user['name']);
echo $greeting, "\n";
"#;

struct Events(tokio::sync::mpsc::UnboundedReceiver<Value>, String);
impl Events {
    /// Espera o próximo evento do tipo `kind`, acumulando a saída do script.
    async fn until(&mut self, kind: &str) -> Value {
        loop {
            let ev = tokio::time::timeout(Duration::from_secs(60), self.0.recv())
                .await
                .unwrap_or_else(|_| panic!("timeout esperando {kind}"))
                .expect("canal de eventos fechado");
            if std::env::var_os("PHP_IDE_XDEBUG_TRACE").is_some() { eprintln!("ev {ev}"); }
            if ev["kind"] == "output" {
                self.1.push_str(ev["text"].as_str().unwrap_or(""));
            }
            if ev["kind"] == "error" && kind != "error" {
                eprintln!("evento de erro: {ev}");
            }
            if ev["kind"] == kind {
                return ev;
            }
        }
    }
}

fn image() -> String {
    std::env::var("PHP_IDE_XDEBUG_IMAGE").expect("defina PHP_IDE_XDEBUG_IMAGE (scripts/check-xdebug.mjs)")
}
fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port()
}

#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn xdebug_container_with_path_mapping() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    std::fs::write(root.join("app.php"), SCRIPT).unwrap();
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<Value>();
    let emit: Emit = Arc::new(move |v| {
        let _ = tx.send(v);
    });
    let mut events = Events(rx, String::new());
    let d = Debugger::default();
    let call = |method: &'static str, args: Vec<Value>| {
        let (d, root, emit) = (&d, root.clone(), emit.clone());
        async move { d.dispatch(&root, method, &args, emit).await }
    };
    let port = free_port();
    let mapping = json!([{"server": "/app", "local": ""}]);
    call("debugConfig", vec![json!([{"path": "app.php", "line": 9}, {"path": "app.php", "line": 11, "condition": "$i == 7"}]), mapping.clone(), json!(false)]).await.unwrap();
    let all = std::env::var_os("PHP_IDE_XDEBUG_BIND_ALL").is_some();
    call("debugListen", vec![json!(port), json!(all)]).await.unwrap();

    let mut container = std::process::Command::new("docker")
        .args(["run", "--rm", "--add-host=host.docker.internal:host-gateway", "-v"])
        .arg(format!("{}:/app", root.display()))
        .arg(image())
        .args(["php", "-dxdebug.mode=debug", "-dxdebug.start_with_request=yes", "-dxdebug.client_host=host.docker.internal"])
        .arg(format!("-dxdebug.client_port={port}"))
        .arg("/app/app.php")
        .spawn()
        .unwrap();

    let session = events.until("session").await;
    assert_eq!(session["info"]["server"], "/app/app.php");
    assert_eq!(session["info"]["local"], "app.php");
    let id = session["session"].as_str().unwrap().to_owned();

    // Breakpoint de linha.
    let brk = events.until("break").await;
    assert_eq!(brk["frames"][0]["local"], "app.php", "{brk}");
    assert_eq!(brk["frames"][0]["line"], 9);
    let contexts = call("debugContexts", vec![json!(id), json!(0)]).await.unwrap();
    assert!(contexts.as_array().unwrap().iter().any(|c| c["name"] == "Locals"), "{contexts}");
    let vars = call("debugVariables", vec![json!(id), json!(0), json!(0)]).await.unwrap();
    let numbers = vars.as_array().unwrap().iter().find(|v| v["name"] == "$numbers").expect("$numbers").clone();
    assert_eq!(numbers["numchildren"], 250);
    assert_eq!(numbers["items"].as_array().unwrap().len(), 100);
    // Paginação de filhos.
    let page1 = call("debugProperty", vec![json!(id), json!(0), json!(0), json!("$numbers"), json!(1)]).await.unwrap();
    assert_eq!(page1["items"].as_array().unwrap().len(), 100);
    assert_eq!(page1["items"][0]["value"], "101");
    let page2 = call("debugProperty", vec![json!(id), json!(0), json!(0), json!("$numbers"), json!(2)]).await.unwrap();
    assert_eq!(page2["items"].as_array().unwrap().len(), 50);
    let user = call("debugProperty", vec![json!(id), json!(0), json!(0), json!("$user['tags']"), json!(0)]).await.unwrap();
    assert_eq!(user["items"][1]["value"], "b");
    let user = vars.as_array().unwrap().iter().find(|v| v["name"] == "$user").unwrap();
    assert_eq!(user["items"][0]["value"], "Ana");
    let value = call("debugEval", vec![json!(id), json!("count($numbers) * 2")]).await.unwrap();
    assert_eq!(value["value"], "500");
    let bad = call("debugEval", vec![json!(id), json!("$undefined->x(")]).await;
    assert!(bad.is_err(), "{bad:?}");

    // Breakpoint condicional.
    call("debugContinue", vec![json!(id), json!("run")]).await.unwrap();
    assert!(call("debugStack", vec![json!(id)]).await.is_err(), "comandos devem ser recusados durante a execução");
    let brk = events.until("break").await;
    assert_eq!(brk["frames"][0]["line"], 11);
    assert_eq!(call("debugEval", vec![json!(id), json!("$i")]).await.unwrap()["value"], "7");

    // Troca de breakpoints com a sessão pausada: remove o condicional, adiciona a linha 13.
    call("debugConfig", vec![json!([{"path": "app.php", "line": 13}]), mapping, json!(false)]).await.unwrap();
    tokio::time::sleep(Duration::from_millis(500)).await;
    call("debugContinue", vec![json!(id), json!("run")]).await.unwrap();
    let brk = events.until("break").await;
    assert_eq!(brk["frames"][0]["line"], 13, "{brk}");

    // Passos.
    call("debugContinue", vec![json!(id), json!("step_into")]).await.unwrap();
    let brk = events.until("break").await;
    assert_eq!(brk["frames"][0]["where"], "greet");
    assert_eq!(brk["frames"][0]["line"], 4);
    assert_eq!(brk["frames"].as_array().unwrap().len(), 2);
    call("debugContinue", vec![json!(id), json!("step_over")]).await.unwrap();
    assert_eq!(events.until("break").await["frames"][0]["line"], 5);
    let frame1 = call("debugVariables", vec![json!(id), json!(1), json!(0)]).await.unwrap();
    assert!(frame1.as_array().unwrap().iter().any(|v| v["name"] == "$total" && v["value"] == "45"), "{frame1}");
    call("debugContinue", vec![json!(id), json!("step_out")]).await.unwrap();
    let brk = events.until("break").await;
    assert_eq!(brk["frames"][0]["where"], "{main}");
    call("debugContinue", vec![json!(id), json!("run")]).await.unwrap();
    events.until("ended").await;
    assert!(events.1.contains("Olá, Ana"), "saída copiada via DBGp stdout: {:?}", events.1);
    assert!(container.wait().unwrap().success());
    call("debugUnlisten", vec![]).await.unwrap();
}

/// "Debug script": `php` local substituído por um wrapper que executa o mesmo caminho no container.
#[tokio::test(flavor = "multi_thread")]
#[ignore]
async fn xdebug_debug_script() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    std::fs::write(root.join("app.php"), SCRIPT).unwrap();
    let wrapper = root.join(".php-wrapper.sh");
    std::fs::write(
        &wrapper,
        format!(
            "#!/bin/bash\nargs=()\nfor a in \"$@\"; do args+=(\"${{a/client_host=127.0.0.1/client_host=host.docker.internal}}\"); done\nexec docker run --rm -i --add-host=host.docker.internal:host-gateway -e XDEBUG_SESSION -v '{0}:{0}' -w \"$PWD\" '{1}' php \"${{args[@]}}\"\n",
            root.display(),
            image()
        ),
    )
    .unwrap();
    std::process::Command::new("chmod").arg("+x").arg(&wrapper).status().unwrap();
    std::env::set_var("PHP_IDE_PHP_BIN", &wrapper);
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<Value>();
    let emit: Emit = Arc::new(move |v| {
        let _ = tx.send(v);
    });
    let mut events = Events(rx, String::new());
    let d = Debugger::default();
    let port = free_port();
    let err = d.dispatch(&root, "debugRun", &[json!("app.php")], emit.clone()).await.unwrap_err();
    assert!(err.contains("escutar"), "{err}");
    d.dispatch(&root, "debugConfig", &[json!([{"path": "app.php", "line": 13}]), json!([]), json!(true)], emit.clone()).await.unwrap();
    d.dispatch(&root, "debugListen", &[json!(port), json!(std::env::var_os("PHP_IDE_XDEBUG_BIND_ALL").is_some())], emit.clone()).await.unwrap();
    assert!(d.dispatch(&root, "debugRun", &[json!("../etc/passwd")], emit.clone()).await.is_err());
    let run = d.dispatch(&root, "debugRun", &[json!("app.php")], emit.clone()).await.unwrap();
    let session = events.until("session").await;
    assert_eq!(session["info"]["run"], run["run"]);
    assert_eq!(session["info"]["local"], "app.php", "mesmo caminho dentro e fora do container");
    let id = session["session"].as_str().unwrap().to_owned();
    // break_first: para na primeira linha antes do breakpoint.
    let brk = events.until("break").await;
    assert!(brk["frames"][0]["line"].as_u64().unwrap() < 13, "{brk}");
    d.dispatch(&root, "debugContinue", &[json!(id), json!("run")], emit.clone()).await.unwrap();
    assert_eq!(events.until("break").await["frames"][0]["line"], 13);
    d.dispatch(&root, "debugContinue", &[json!(id), json!("stop")], emit.clone()).await.unwrap();
    events.until("ended").await;
    let exit = events.until("exit").await;
    assert_eq!(exit["run"], run["run"]);
    std::env::remove_var("PHP_IDE_PHP_BIN");
    d.dispatch(&root, "debugUnlisten", &[], emit).await.unwrap();
}
