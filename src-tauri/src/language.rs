use crate::{
    files::History,
    git::s,
    rpc::{default_handler, Handler, Rpc},
    workspace::{confined, err, hash, Res},
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;
type Shared<T> = Arc<std::sync::Mutex<T>>;
pub struct Language {
    rpc: Option<Arc<Rpc>>,
    documents: HashMap<String, (i64, String)>,
    container: Option<String>,
    /// `workspace/applyEdit` recebidos durante `workspace/executeCommand`: viram prévia, não escrita.
    edits: Shared<Vec<Value>>,
    /// Último `textDocument/publishDiagnostics` por URI, com a versão do documento.
    diagnostics: Shared<HashMap<String, (i64, Value)>>,
    messages: Shared<Vec<String>>,
}
impl Default for Language {
    fn default() -> Self {
        Self {
            rpc: None,
            documents: HashMap::new(),
            container: None,
            edits: Arc::default(),
            diagnostics: Arc::default(),
            messages: Arc::default(),
        }
    }
}
/// Comandos do servidor que só produzem edições (prévia antes de aplicar). Comandos que criam
/// arquivos ficam de fora até a transação suportar criação.
const COMMANDS: &[&str] = &[
    "name_import",
    "import_all_unresolved_names",
    "replace_qualifier_with_import",
    "extract_method",
    "extract_expression",
    "extract_constant",
    "generate_member",
    "generate_accessors",
    "generate_mutators",
    "override_method",
    "transform",
];
fn handler(edits: Shared<Vec<Value>>) -> Handler {
    let fallback = default_handler();
    Arc::new(move |message| {
        if message["method"] != "workspace/applyEdit" {
            return fallback(message);
        }
        if let Ok(mut list) = edits.lock() {
            list.push(message["params"]["edit"].clone());
        }
        Box::pin(async { Ok(json!({"applied":true})) })
    })
}
impl Language {
    pub async fn symbols(
        &mut self,
        root: &Path,
        tools: &Path,
        cache: &Path,
        app: &AppHandle,
        query: &str,
    ) -> Res<Value> {
        if query.trim().is_empty() || query.len() > 256 {
            return Err("Busca de símbolos inválida".into());
        }
        self.start(root, tools, cache, app)
            .await?
            .request("workspace/symbol", json!({"query":query}), 30)
            .await
    }
    async fn start(
        &mut self,
        root: &Path,
        tools: &Path,
        cache: &Path,
        app: &AppHandle,
    ) -> Res<Arc<Rpc>> {
        if let Some(r) = &self.rpc {
            return Ok(r.clone());
        }
        std::fs::create_dir_all(cache).map_err(err)?;
        if !tools.join("phpactor.phar").is_file() {
            return Err("Execute npm run setup:php antes de usar PHP".into());
        }
        let ready = Arc::new(AtomicBool::new(false));
        let indexed = Arc::new(Notify::new());
        let flag = ready.clone();
        let completed = indexed.clone();
        let status = app.clone();
        let token = Arc::new(std::sync::Mutex::new(Value::Null));
        let diagnostics = self.diagnostics.clone();
        let messages = self.messages.clone();
        let notify = Arc::new(move |m: Value| {
            if m["method"] == "textDocument/publishDiagnostics" {
                if let (Some(uri), Ok(mut map)) = (m["params"]["uri"].as_str(), diagnostics.lock())
                {
                    map.insert(
                        uri.to_string(),
                        (
                            m["params"]["version"].as_i64().unwrap_or(-1),
                            m["params"]["diagnostics"].clone(),
                        ),
                    );
                }
                return;
            }
            if m["method"] == "window/showMessage" && m["params"]["type"].as_i64() == Some(1) {
                if let (Some(text), Ok(mut list)) =
                    (m["params"]["message"].as_str(), messages.lock())
                {
                    list.push(text.chars().take(500).collect());
                }
                return;
            }
            if m["method"] == "$/progress" {
                let v = &m["params"]["value"];
                if v["kind"] == "begin" && v["title"] == "Indexing workspace" {
                    if let Ok(mut t) = token.lock() {
                        *t = m["params"]["token"].clone();
                    }
                }
                if v["kind"] == "end"
                    && token
                        .lock()
                        .map(|t| !t.is_null() && *t == m["params"]["token"])
                        .unwrap_or(false)
                {
                    flag.store(true, Ordering::Release);
                    completed.notify_waiters();
                }
                let text = v["message"]
                    .as_str()
                    .or(v["title"].as_str())
                    .unwrap_or("Análise PHP atualizada");
                let _ = status.emit("event", json!({"type":"language","message":text}));
            }
        });
        let mut php = std::env::var("PHP_IDE_PHP_BIN").ok();
        if php.is_none() {
            for candidate in [
                "php",
                "/opt/homebrew/opt/php@8.3/bin/php",
                "/usr/local/opt/php@8.3/bin/php",
            ] {
                let probe = tokio::process::Command::new(candidate)
                    .args(["-r", "exit(PHP_VERSION_ID >= 80200 ? 0 : 1);"])
                    .kill_on_drop(true)
                    .output();
                if tokio::time::timeout(std::time::Duration::from_secs(3), probe)
                    .await
                    .is_ok_and(|r| r.is_ok_and(|o| o.status.success()))
                {
                    php = Some(candidate.to_string());
                    break;
                }
            }
        }
        if php.is_none() {
            let probe = tokio::process::Command::new("docker")
                .args(["info", "--format", "{{.ServerVersion}}"])
                .kill_on_drop(true)
                .output();
            if !tokio::time::timeout(std::time::Duration::from_secs(4), probe)
                .await
                .is_ok_and(|r| r.is_ok_and(|o| o.status.success()))
            {
                return Err("Análise PHP indisponível. Instale PHP 8.2+ (no macOS: brew install php@8.3) ou inicie o Docker. Depois tente autocomplete ou navegação novamente.".into());
            }
        }
        let (program, mut args) = if let Some(php) = php {
            (
                php,
                vec![
                    tools.join("phpactor.phar").to_string_lossy().to_string(),
                    "language-server".into(),
                ],
            )
        } else {
            let name = format!("php-ide-rust-{}", uuid::Uuid::new_v4());
            self.container = Some(name.clone());
            (
                "docker".into(),
                vec![
                    "run".into(),
                    "--name".into(),
                    name,
                    "--rm".into(),
                    "-i".into(),
                    "--network".into(),
                    "none".into(),
                    "-e".into(),
                    "XDG_CACHE_HOME=/cache".into(),
                    "-v".into(),
                    format!("{}:{}:ro", root.display(), root.display()),
                    "-v".into(),
                    format!("{}:/tools:ro", tools.display()),
                    "-v".into(),
                    format!("{}:/cache", cache.display()),
                    "-w".into(),
                    root.to_string_lossy().to_string(),
                    "php:8.3-cli".into(),
                    "php".into(),
                    "/tools/phpactor.phar".into(),
                    "language-server".into(),
                ],
            )
        };
        args.push(format!(
            "--config-extra={}",
            json!({"indexer.enabled_watchers":["lsp"],"indexer.include_patterns":["/**/*.php"]})
        ));
        let rpc = Rpc::spawn(
            &program,
            &args,
            root,
            true,
            true,
            notify,
            handler(self.edits.clone()),
        )?;
        let uri = url::Url::from_directory_path(root).map_err(|_| "URI inválida")?;
        rpc.request("initialize",json!({"processId":std::process::id(),"rootUri":uri.as_str().trim_end_matches('/'),"workspaceFolders":[{"uri":uri.as_str().trim_end_matches('/'),"name":root.file_name().unwrap_or_default().to_string_lossy()}],"capabilities":{"window":{"workDoneProgress":true},"workspace":{"configuration":true,"applyEdit":true,"workspaceEdit":{"documentChanges":true},"didChangeWatchedFiles":{"dynamicRegistration":true}},"general":{"positionEncodings":["utf-16"]},"textDocument":{"completion":{"completionItem":{"snippetSupport":true,"labelDetailsSupport":true}},"definition":{"linkSupport":true},"hover":{"contentFormat":["markdown","plaintext"]},"rename":{"prepareSupport":true},"codeAction":{"codeActionLiteralSupport":{"codeActionKind":{"valueSet":["quickfix","refactor","refactor.extract","refactor.inline","source"]}}},"publishDiagnostics":{"versionSupport":true}}}}),60).await?;
        rpc.notify("initialized", json!({})).await?;
        let wait = async {
            loop {
                let n = indexed.notified();
                if ready.load(Ordering::Acquire) {
                    break;
                }
                n.await;
            }
        };
        tokio::time::timeout(std::time::Duration::from_secs(90), wait)
            .await
            .map_err(|_| "Indexação excedeu 90 segundos".to_string())?;
        self.rpc = Some(rpc.clone());
        Ok(rpc)
    }
    pub async fn request(
        &mut self,
        root: &Path,
        tools: &Path,
        cache: &Path,
        app: &AppHandle,
        input: &Value,
    ) -> Res<Value> {
        let method = s(&input["method"])?;
        if ![
            "completionItem/resolve",
            "textDocument/definition",
            "textDocument/completion",
            "textDocument/hover",
            "textDocument/references",
            "textDocument/implementation",
            "textDocument/prepareRename",
            "textDocument/rename",
            "textDocument/codeAction",
            "workspace/executeCommand",
            "php/diagnostics",
        ]
        .contains(&method)
        {
            return Err("Método PHP inválido".into());
        }
        let text = s(&input["text"])?;
        let version = input["version"]
            .as_i64()
            .filter(|v| *v >= 0)
            .ok_or("Versão inválida")?;
        let position = &input["position"];
        if text.len() > 2097152
            || position["line"].as_u64().is_none()
            || position["character"].as_u64().is_none()
        {
            return Err("Documento inválido".into());
        }
        let path = confined(root, s(&input["path"])?)?;
        let uri = url::Url::from_file_path(&path)
            .map_err(|_| "URI inválida")?
            .to_string();
        let rpc = self.start(root, tools, cache, app).await?;
        if !self.sync(&rpc, &uri, version, text).await? {
            return Err("Documento obsoleto".into());
        }
        // Refatorações enxergam os buffers abertos (inclusive não salvos) de outros arquivos.
        if let Some(others) = input["documents"].as_array() {
            if others.len() > 200 {
                return Err("Documentos demais".into());
            }
            for doc in others {
                let (Ok(path), Ok(body), Some(v)) =
                    (s(&doc["path"]), s(&doc["text"]), doc["version"].as_i64())
                else {
                    return Err("Documento inválido".into());
                };
                if body.len() > 2097152 || !path.ends_with(".php") {
                    continue;
                }
                let other = url::Url::from_file_path(confined(root, path)?)
                    .map_err(|_| "URI inválida")?
                    .to_string();
                if other != uri {
                    self.sync(&rpc, &other, v, body).await?;
                }
            }
        }
        match method {
            "php/diagnostics" => {
                let entry = self.diagnostics.lock().map_err(err)?.get(&uri).cloned();
                return Ok(match entry {
                    Some((v, list)) => {
                        json!({"current":v == version,"version":v,"diagnostics":list})
                    }
                    None => json!({"current":false,"diagnostics":[]}),
                });
            }
            "textDocument/rename" => {
                let name = s(&input["newName"])?;
                if name.is_empty() || name.len() > 256 || name.chars().any(char::is_control) {
                    return Err("Nome inválido".into());
                }
                let params = json!({"textDocument":{"uri":uri},"position":position,"newName":name});
                return rpc.request(method, params, 60).await;
            }
            "textDocument/codeAction" => {
                let range = &input["range"];
                for end in ["start", "end"] {
                    if range[end]["line"].as_u64().is_none()
                        || range[end]["character"].as_u64().is_none()
                    {
                        return Err("Intervalo inválido".into());
                    }
                }
                let mut context = json!({"diagnostics":input["diagnostics"].as_array().cloned().unwrap_or_default()});
                if let Some(only) = input["only"].as_array() {
                    context["only"] = json!(only);
                }
                let params = json!({"textDocument":{"uri":uri},"range":range,"context":context});
                return rpc.request(method, params, 30).await;
            }
            "workspace/executeCommand" => {
                let command = s(&input["command"])?;
                if !COMMANDS.contains(&command) {
                    return Err(format!("Comando PHP não permitido: {command}"));
                }
                let arguments = input["arguments"].as_array().cloned().unwrap_or_default();
                self.edits.lock().map_err(err)?.clear();
                self.messages.lock().map_err(err)?.clear();
                let result = rpc
                    .request(method, json!({"command":command,"arguments":arguments}), 60)
                    .await?;
                let edits = std::mem::take(&mut *self.edits.lock().map_err(err)?);
                let messages = std::mem::take(&mut *self.messages.lock().map_err(err)?);
                return Ok(json!({"result":result,"edits":edits,"messages":messages}));
            }
            _ => {}
        }
        let mut params = json!({"textDocument":{"uri":uri},"position":position});
        if method == "textDocument/references" {
            params["context"] = json!({"includeDeclaration":false});
        }
        // Return candidates immediately. Serial resolution of 80 entries could
        // hold the language mutex for minutes and block navigation as well.
        if method == "completionItem/resolve" {
            let item = input
                .get("completionItem")
                .filter(|v| v.is_object())
                .ok_or("Sugestão inválida")?;
            return rpc.request(method, item.clone(), 5).await;
        }
        let result = rpc.request(method, params, 30).await?;
        Ok(result)
    }
    /// Envia o texto ao servidor (didOpen/didChange). Falso quando a versão é anterior à conhecida.
    // A versão do Monaco recomeça quando o arquivo é reaberto ou o projeto é trocado, então ela
    // não serve para descartar pedidos: o texto recebido é sempre o atual daquele pedido e o
    // servidor recebe uma versão própria e crescente.
    async fn sync(&mut self, rpc: &Rpc, uri: &str, _version: i64, text: &str) -> Res<bool> {
        let version = if let Some((old, previous)) = self.documents.get(uri) {
            if previous == text {
                return Ok(true);
            }
            let next = old + 1;
            rpc.notify("textDocument/didChange",json!({"textDocument":{"uri":uri,"version":next},"contentChanges":[{"text":text}]})).await?;
            next
        } else {
            rpc.notify("textDocument/didOpen",json!({"textDocument":{"uri":uri,"languageId":"php","version":1,"text":text}})).await?;
            1
        };
        self.documents
            .insert(uri.to_string(), (version, text.into()));
        Ok(true)
    }
    /// Aplica uma refatoração em disco como transação: confere o hash de todos os arquivos antes
    /// de escrever, grava revisões no histórico local e desfaz o que já foi escrito se algo falhar.
    pub async fn apply(&mut self, root: &Path, history: &History, input: &Value) -> Res<Value> {
        let label = input["label"].as_str().unwrap_or("Refatoração");
        let label: String = label
            .chars()
            .filter(|c| !c.is_control())
            .take(120)
            .collect();
        let changes = input["changes"].as_array().ok_or("Alterações inválidas")?;
        if changes.is_empty() || changes.len() > 500 {
            return Err("Refatoração sem arquivos ou com arquivos demais".into());
        }
        let mut plan = Vec::new();
        for c in changes {
            let rel = s(&c["path"])?;
            let path = confined(root, rel)?;
            let text = s(&c["text"])?;
            if text.len() > 2097152 || text.contains('\0') {
                return Err(format!("Texto inválido para {rel}"));
            }
            if plan
                .iter()
                .any(|(p, _, _, _): &(std::path::PathBuf, _, _, _)| *p == path)
            {
                return Err(format!("Arquivo repetido na refatoração: {rel}"));
            }
            let before = std::fs::read(&path).map_err(err)?;
            if hash(&before) != s(&c["etag"])? {
                return Err(format!(
                    "{rel} mudou no disco depois da prévia. Nada foi alterado; refaça a refatoração."
                ));
            }
            plan.push((path, rel.to_string(), before, text.to_string()));
        }
        for (path, _, _, _) in &plan {
            history.snapshot(root, path, &format!("Antes de refatorar: {label}"))?;
        }
        let mut done: Vec<usize> = Vec::new();
        let mut etags = serde_json::Map::new();
        for (i, (path, rel, _, text)) in plan.iter().enumerate() {
            match write(path, text.as_bytes()) {
                Ok(()) => {
                    done.push(i);
                    etags.insert(rel.clone(), json!(hash(text)));
                }
                Err(e) => {
                    let mut failed = Vec::new();
                    for j in done.iter().rev() {
                        let (p, r, original, _) = &plan[*j];
                        if write(p, original).is_err() {
                            failed.push(r.clone());
                        }
                    }
                    return Err(if failed.is_empty() {
                        format!("Falha ao gravar {rel}: {e}. Nenhum arquivo ficou alterado.")
                    } else {
                        format!("Falha ao gravar {rel}: {e}. Não foi possível restaurar {}; use o Histórico local.", failed.join(", "))
                    });
                }
            }
        }
        // O servidor volta a ler do disco os arquivos que tinha abertos com o texto antigo.
        if let Some(rpc) = &self.rpc {
            for (path, _, _, _) in &plan {
                if let Ok(uri) = url::Url::from_file_path(path) {
                    if self.documents.remove(uri.as_str()).is_some() {
                        let _ = rpc
                            .notify("textDocument/didClose", json!({"textDocument":{"uri":uri}}))
                            .await;
                    }
                }
            }
        }
        Ok(json!({"etags":etags}))
    }
    pub async fn synthetic(
        &mut self,
        root: &Path,
        tools: &Path,
        cache: &Path,
        app: &AppHandle,
        input: &Value,
        expression: &str,
        at: usize,
    ) -> Res<Value> {
        if expression.len() > 10000 || at > expression.len() {
            return Err("Expressão inválida".into());
        }
        let path = confined(root, s(&input["path"])?)?;
        let text = s(&input["text"])?;
        let full = format!("{}\n{}", text, expression);
        let uri = url::Url::from_file_path(
            path.parent()
                .ok_or("Caminho inválido")?
                .join(format!(".php-ide-probe-{}.php", uuid::Uuid::new_v4())),
        )
        .map_err(|_| "URI inválida")?
        .to_string();
        let rpc = self.start(root, tools, cache, app).await?;
        rpc.notify(
            "textDocument/didOpen",
            json!({"textDocument":{"uri":uri,"languageId":"php","version":1,"text":full}}),
        )
        .await?;
        let result=rpc.request("textDocument/definition",json!({"textDocument":{"uri":uri},"position":{"line":text.bytes().filter(|b|*b==b'\n').count()+1,"character":at}}),30).await;
        let _ = rpc
            .notify("textDocument/didClose", json!({"textDocument":{"uri":uri}}))
            .await;
        result
    }
    pub async fn changed(&self, path: &Path) {
        if let Some(r) = &self.rpc {
            if let Ok(uri) = url::Url::from_file_path(path) {
                let _ = r
                    .notify(
                        "workspace/didChangeWatchedFiles",
                        json!({"changes":[{"uri":uri,"type":2}]}),
                    )
                    .await;
                let _ = r
                    .request("phpactor/indexer/reindex", json!({"soft":true}), 30)
                    .await;
            }
        }
    }
}
/// Escrita atômica (arquivo temporário + rename) preservando permissões.
fn write(path: &Path, bytes: &[u8]) -> Res<()> {
    use std::io::Write;
    let tmp = path.with_file_name(format!(".php-ide-refactor-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(err)?;
        f.set_permissions(std::fs::metadata(path).map_err(err)?.permissions())
            .map_err(err)?;
        f.write_all(bytes).map_err(err)?;
        f.sync_all().map_err(err)?;
        std::fs::rename(&tmp, path).map_err(err)
    })();
    let _ = std::fs::remove_file(&tmp);
    result
}
impl Drop for Language {
    fn drop(&mut self) {
        if let Some(r) = &self.rpc {
            r.stop();
        }
        if let Some(name) = self.container.take() {
            let _ = std::process::Command::new("docker")
                .args(["rm", "-f", &name])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> (tempfile::TempDir, std::path::PathBuf, History) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::write(root.join("src/A.php"), "<?php class A {}").unwrap();
        std::fs::write(root.join("src/B.php"), "<?php new A();").unwrap();
        let root = root.canonicalize().unwrap();
        let history = History::new(Some(dir.path().join("history")));
        (dir, root, history)
    }
    fn etag(root: &Path, p: &str) -> String {
        hash(std::fs::read(root.join(p)).unwrap())
    }
    #[tokio::test]
    async fn aplica_transacao_e_grava_historico() {
        let (_d, root, history) = project();
        let mut l = Language::default();
        let input = json!({"label":"Renomear A","changes":[
            {"path":"src/A.php","etag":etag(&root,"src/A.php"),"text":"<?php class Z {}"},
            {"path":"src/B.php","etag":etag(&root,"src/B.php"),"text":"<?php new Z();"}]});
        let out = l.apply(&root, &history, &input).await.unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("src/B.php")).unwrap(),
            "<?php new Z();"
        );
        assert_eq!(out["etags"]["src/A.php"], json!(hash("<?php class Z {}")));
        let revisions =
            crate::files::dispatch(&root, &history, "fileHistory", &[json!("")]).unwrap();
        assert_eq!(
            revisions
                .as_array()
                .unwrap()
                .iter()
                .filter(|r| r["label"] == "Antes de refatorar: Renomear A")
                .count(),
            2
        );
        // Desfazer é outra transação com o texto anterior e o hash novo.
        let undo = json!({"label":"Desfazer","changes":[
            {"path":"src/A.php","etag":out["etags"]["src/A.php"],"text":"<?php class A {}"},
            {"path":"src/B.php","etag":out["etags"]["src/B.php"],"text":"<?php new A();"}]});
        l.apply(&root, &history, &undo).await.unwrap();
        assert_eq!(etag(&root, "src/A.php"), hash("<?php class A {}"));
        assert_eq!(etag(&root, "src/B.php"), hash("<?php new A();"));
    }
    #[tokio::test]
    async fn hash_divergente_nao_altera_nada() {
        let (_d, root, history) = project();
        let mut l = Language::default();
        let input = json!({"changes":[
            {"path":"src/A.php","etag":etag(&root,"src/A.php"),"text":"<?php class Z {}"},
            {"path":"src/B.php","etag":"velho","text":"<?php new Z();"}]});
        assert!(l
            .apply(&root, &history, &input)
            .await
            .unwrap_err()
            .contains("src/B.php mudou"));
        assert_eq!(
            std::fs::read_to_string(root.join("src/A.php")).unwrap(),
            "<?php class A {}"
        );
        assert!(l
            .apply(
                &root,
                &history,
                &json!({"changes":[{"path":"../x.php","etag":"","text":""}]})
            )
            .await
            .is_err());
        assert!(l
            .apply(&root, &history, &json!({"changes":[]}))
            .await
            .is_err());
    }
    #[cfg(unix)]
    #[tokio::test]
    async fn falha_de_escrita_restaura_arquivos_ja_gravados() {
        use std::os::unix::fs::PermissionsExt;
        let (_d, root, history) = project();
        std::fs::create_dir_all(root.join("ro")).unwrap();
        std::fs::write(root.join("ro/C.php"), "<?php A::x();").unwrap();
        std::fs::set_permissions(root.join("ro"), std::fs::Permissions::from_mode(0o555)).unwrap();
        let mut l = Language::default();
        let input = json!({"changes":[
            {"path":"src/A.php","etag":etag(&root,"src/A.php"),"text":"<?php class Z {}"},
            {"path":"ro/C.php","etag":etag(&root,"ro/C.php"),"text":"<?php Z::x();"}]});
        let error = l.apply(&root, &history, &input).await.unwrap_err();
        std::fs::set_permissions(root.join("ro"), std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(error.contains("Nenhum arquivo ficou alterado"), "{error}");
        assert_eq!(
            std::fs::read_to_string(root.join("src/A.php")).unwrap(),
            "<?php class A {}"
        );
    }
}
