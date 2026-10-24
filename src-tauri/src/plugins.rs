//! Plugins de terceiros: manifesto `plugin.json`, descoberta (usuário e projeto),
//! instalação a partir de pasta/.zip, consentimento e operações privilegiadas.
//! O código do plugin roda num Web Worker da interface; tudo que sai do worker passa
//! pela ponte da interface e, para escrita, processos e rede, é conferido de novo aqui.
use crate::workspace::{self, err, hash, Res};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

pub const PERMISSIONS: [&str; 4] = ["project.read", "project.write", "process", "network"];
/// Linguagens aceitas em `activation.languages`; o mapeamento para arquivos fica na interface.
pub const LANGUAGES: [&str; 17] = [
    "php",
    "blade",
    "markdown",
    "json",
    "yaml",
    "javascript",
    "typescript",
    "vue",
    "css",
    "scss",
    "html",
    "twig",
    "xml",
    "dotenv",
    "sql",
    "ignore",
    "text",
];
const MANIFEST: &str = "plugin.json";
const MAX_FILES: usize = 2000;
const MAX_BYTES: u64 = 20 * 1024 * 1024;
static STATE: Mutex<()> = Mutex::new(());

#[derive(Deserialize, Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Activation {
    #[serde(default)]
    pub languages: Vec<String>,
    /// Padrões de caminho relativo (`*`, `**`, `?`) dos documentos atendidos.
    #[serde(default)]
    pub documents: Vec<String>,
    /// Arquivos marcadores: o plugin só se aplica ao projeto se algum existir.
    #[serde(default)]
    pub files: Vec<String>,
}
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub min_ide_version: String,
    pub main: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub activation: Activation,
    #[serde(default)]
    pub permissions: Vec<String>,
}
#[derive(Deserialize, Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub enabled: bool,
    pub consented: bool,
    /// Permissões declaradas que o usuário já viu no consentimento.
    #[serde(default)]
    pub reviewed: Vec<String>,
    #[serde(default)]
    pub granted: Vec<String>,
}
#[derive(Clone, Debug)]
pub struct Entry {
    pub key: String,
    pub scope: &'static str,
    pub dir: PathBuf,
    pub manifest: Result<Manifest, String>,
    state_key: String,
}

pub(crate) fn version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    let out = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(out)
}
fn relative_ok(p: &str) -> bool {
    !p.is_empty()
        && p.len() <= 200
        && !p.contains('\\')
        && !p.contains('\0')
        && !Path::new(p).is_absolute()
        && Path::new(p)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
pub(crate) fn id_ok(id: &str) -> bool {
    let label = |s: &str| {
        !s.is_empty()
            && s.len() <= 40
            && s.bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && !s.starts_with('-')
            && !s.ends_with('-')
    };
    // Exige `editor.nome`: evita colisão com os plugins internos (`laravel`, `dotenv`…).
    id.len() <= 80 && id.split('.').count() >= 2 && id.split('.').all(label)
}
pub fn validate(m: &Manifest, dir: &Path, ide: &str) -> Res<()> {
    if !id_ok(&m.id) {
        return Err(format!(
            "id inválido \"{}\": use editor.nome em minúsculas (ex.: acme.todo)",
            m.id
        ));
    }
    if m.name.trim().is_empty()
        || m.name.chars().count() > 80
        || m.name.chars().any(char::is_control)
    {
        return Err("name deve ter de 1 a 80 caracteres".into());
    }
    if m.description
        .as_ref()
        .is_some_and(|d| d.chars().count() > 300)
    {
        return Err("description acima de 300 caracteres".into());
    }
    if version(&m.version).is_none() {
        return Err(format!("version inválida \"{}\" (use x.y.z)", m.version));
    }
    let need = version(&m.min_ide_version)
        .ok_or(format!("minIdeVersion inválida \"{}\"", m.min_ide_version))?;
    if need > version(ide).unwrap_or_default() {
        return Err(format!(
            "Requer PHP IDE {} ou superior (atual: {ide})",
            m.min_ide_version
        ));
    }
    for p in &m.permissions {
        if !PERMISSIONS.contains(&p.as_str()) {
            return Err(format!("Permissão desconhecida \"{p}\""));
        }
    }
    for l in &m.activation.languages {
        if !LANGUAGES.contains(&l.as_str()) {
            return Err(format!("Linguagem de ativação desconhecida \"{l}\""));
        }
    }
    let a = &m.activation;
    if a.documents.len() > 20 || a.files.len() > 20 || a.languages.len() > 20 {
        return Err("activation aceita até 20 itens por lista".into());
    }
    if let Some(bad) = a.documents.iter().chain(&a.files).find(|p| !relative_ok(p)) {
        return Err(format!("Caminho de ativação inválido \"{bad}\""));
    }
    if !relative_ok(&m.main) || !m.main.ends_with(".js") {
        return Err("main deve ser um arquivo .js relativo à pasta do plugin".into());
    }
    entry_file(dir, &m.main).map(|_| ())
}
/// Ponto de entrada canônico dentro da pasta do plugin (links não escapam).
fn entry_file(dir: &Path, main: &str) -> Res<PathBuf> {
    let dir = dir.canonicalize().map_err(err)?;
    let file = dir
        .join(main)
        .canonicalize()
        .map_err(|_| format!("Ponto de entrada \"{main}\" não encontrado"))?;
    let meta = fs::metadata(&file).map_err(err)?;
    if !file.starts_with(&dir) || !meta.is_file() {
        return Err("Ponto de entrada fora da pasta do plugin".into());
    }
    if meta.len() > 8 * 1024 * 1024 {
        return Err("Ponto de entrada acima de 8 MB".into());
    }
    Ok(file)
}
pub(crate) fn read_manifest(dir: &Path, ide: &str) -> Result<Manifest, String> {
    let path = dir.join(MANIFEST);
    let meta = fs::symlink_metadata(&path).map_err(|_| "plugin.json ausente".to_owned())?;
    if !meta.is_file() || meta.len() > 64 * 1024 {
        return Err("plugin.json inválido (arquivo comum de até 64 KB)".into());
    }
    let m: Manifest = serde_json::from_slice(&fs::read(&path).map_err(err)?)
        .map_err(|e| format!("plugin.json: {e}"))?;
    validate(&m, dir, ide)?;
    Ok(m)
}

pub struct Dirs {
    pub user: PathBuf,
    pub state: PathBuf,
    pub project: PathBuf,
    pub root: PathBuf,
}
impl Dirs {
    pub fn new(config: &Path, root: &Path) -> Self {
        Self {
            user: std::env::var_os("PHP_IDE_PLUGINS_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| config.join("plugins")),
            state: config.join("plugins-state.json"),
            project: root.join(".php-ide").join("plugins"),
            root: root.to_path_buf(),
        }
    }
    fn project_tag(&self) -> String {
        hash(self.root.to_string_lossy().as_bytes())[..16].to_owned()
    }
    pub fn discover(&self, ide: &str) -> Vec<Entry> {
        let mut out: Vec<Entry> = vec![];
        for (scope, base) in [("user", &self.user), ("project", &self.project)] {
            let Ok(read) = fs::read_dir(base) else {
                continue;
            };
            let mut dirs: Vec<_> = read
                .filter_map(Result::ok)
                .filter(|e| {
                    e.file_type().is_ok_and(|t| t.is_dir())
                        && !e.file_name().to_string_lossy().starts_with('.')
                })
                .map(|e| e.path())
                .collect();
            dirs.sort();
            for dir in dirs.into_iter().take(200) {
                let name = dir
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let mut manifest = read_manifest(&dir, ide);
                let id = manifest
                    .as_ref()
                    .map(|m| m.id.clone())
                    .unwrap_or_else(|_| format!("dir:{name}"));
                let key = format!("{scope}:{id}");
                if manifest.is_ok() && out.iter().any(|e| e.key == key) {
                    manifest = Err(format!("id \"{id}\" duplicado em outra pasta"));
                }
                let state_key = if scope == "user" {
                    key.clone()
                } else {
                    format!("project:{}:{id}", self.project_tag())
                };
                out.push(Entry {
                    key,
                    scope,
                    dir,
                    manifest,
                    state_key,
                });
            }
        }
        out
    }
    fn find(&self, key: &str) -> Res<Entry> {
        self.discover(env!("CARGO_PKG_VERSION"))
            .into_iter()
            .find(|e| e.key == key)
            .ok_or_else(|| format!("Plugin {key} não encontrado"))
    }
    fn states(&self) -> BTreeMap<String, State> {
        fs::read(&self.state)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }
    fn state(&self, e: &Entry) -> State {
        // Plugin novo começa ativado, mas só carrega depois do consentimento.
        self.states().get(&e.state_key).cloned().unwrap_or(State {
            enabled: true,
            ..State::default()
        })
    }
    fn store(&self, key: &str, state: Option<State>) -> Res<()> {
        let _lock = STATE.lock().map_err(err)?;
        let mut all = self.states();
        match state {
            Some(s) => all.insert(key.to_owned(), s),
            None => all.remove(key),
        };
        if let Some(parent) = self.state.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        let tmp = self
            .state
            .with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        fs::write(&tmp, serde_json::to_vec_pretty(&all).map_err(err)?).map_err(err)?;
        fs::rename(&tmp, &self.state).map_err(err)
    }
    pub fn describe(&self, e: &Entry) -> Value {
        let s = self.state(e);
        let declared = e
            .manifest
            .as_ref()
            .map(|m| m.permissions.clone())
            .unwrap_or_default();
        let needs = !s.consented || declared.iter().any(|p| !s.reviewed.contains(p));
        let granted: Vec<_> = declared.iter().filter(|p| s.granted.contains(p)).collect();
        json!({"key":e.key,"scope":e.scope,"dir":e.dir,"manifest":e.manifest.as_ref().ok(),"error":e.manifest.as_ref().err(),
            "enabled":s.enabled,"consented":s.consented,"needsConsent":needs,"granted":granted,"origin":fs::read(e.dir.join(".php-ide-origin.json")).ok().filter(|b|b.len()<4096).and_then(|b|serde_json::from_slice::<Value>(&b).ok())})
    }
    /// Confere de novo, no backend, que o plugin está ativo, consentido e com a permissão concedida.
    pub fn allowed(&self, key: &str, permission: &str) -> Res<Entry> {
        let e = self.find(key)?;
        let m = e.manifest.as_ref().map_err(Clone::clone)?;
        let s = self.state(&e);
        if !s.enabled
            || !s.consented
            || !m.permissions.iter().any(|p| p == permission)
            || !s.granted.iter().any(|p| p == permission)
        {
            return Err(format!("PermissionDenied: {permission}"));
        }
        Ok(e)
    }
}

/// Only metadata is shipped; executable packages come from pinned public repositories.
#[derive(Deserialize)]
pub struct DefaultPlugin {
    pub plugin: crate::plugin_catalog::CatalogPlugin,
    pub sha256: String,
    pub permissions: Vec<String>,
}
pub fn defaults() -> Res<Vec<DefaultPlugin>> {
    serde_json::from_str(include_str!("../../default-plugins.json")).map_err(err)
}
fn completed_defaults(dirs: &Dirs) -> Res<std::collections::BTreeSet<String>> {
    let path = dirs.state.with_file_name("default-plugins.json");
    let mut done: std::collections::BTreeSet<String> = match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(err)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Default::default(),
        Err(e) => return Err(err(e)),
    };
    // Preserve removals and permission decisions made before the repository migration.
    if dirs.state.with_file_name("bundled-plugins-v1.json").exists() {
        done.extend(["laravel", "dotenv", "docker", "bash"].map(|n| format!("phpforge.{n}")));
    }
    Ok(done)
}
fn finish_default(dirs: &Dirs, id: &str) -> Res<()> {
    let mut done = completed_defaults(dirs)?;
    done.insert(id.to_owned());
    fs::create_dir_all(dirs.state.parent().ok_or("Invalid state directory")?).map_err(err)?;
    let path = dirs.state.with_file_name("default-plugins.json");
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec(&done).map_err(err)?).map_err(err)?;
    fs::rename(temp, path).map_err(err)
}
fn default_status(dirs: &Dirs) -> Res<Value> {
    let done = completed_defaults(dirs)?;
    Ok(json!(defaults()?.iter().map(|p| json!({
        "id":p.plugin.id,"name":p.plugin.name,"repository":p.plugin.repository,
        "pending":!done.contains(&p.plugin.id) && !dirs.user.join(&p.plugin.id).exists()
    })).collect::<Vec<_>>()))
}
static DEFAULT_INSTALL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
async fn install_default(dirs: &Dirs, id: &str) -> Res<Value> {
    let _lock = DEFAULT_INSTALL.lock().await;
    let p = defaults()?.into_iter().find(|p| p.plugin.id == id).ok_or("Unknown default plugin")?;
    if completed_defaults(dirs)?.contains(id) { return Ok(Value::Null); }
    // Never overwrite an existing installation or change its permissions.
    if dirs.user.join(id).exists() { finish_default(dirs, id)?; return Ok(Value::Null); }
    let installed = crate::plugin_catalog::install_default(dirs, &p).await?;
    if installed.is_null() { finish_default(dirs, id)?; return Ok(Value::Null); }
    let e = dirs.find(installed["key"].as_str().ok_or("Invalid installed plugin")?)?;
    dirs.store(&e.state_key, Some(State {
        enabled: true, consented: true, reviewed: p.permissions.clone(), granted: p.permissions,
    }))?;
    finish_default(dirs, id)?;
    Ok(dirs.describe(&e))
}

fn s(args: &[Value], i: usize) -> Res<&str> {
    args.get(i)
        .and_then(Value::as_str)
        .ok_or_else(|| "Argumento inválido".into())
}
pub async fn dispatch(dirs: &Dirs, method: &str, args: &[Value]) -> Res<Value> {
    let ide = env!("CARGO_PKG_VERSION");
    if [
        "pluginCatalog",
        "pluginInspectGit",
        "pluginInspectCatalog",
        "pluginDiscardPreview",
        "pluginConfirmInstall",
    ]
    .contains(&method)
    {
        return crate::plugin_catalog::dispatch(dirs, method, args).await;
    }
    match method {
        "pluginInstallDefault" => install_default(dirs, s(args, 0)?).await,
        "pluginList" => Ok(
            json!({"ideVersion":ide,"userDir":dirs.user,"projectDir":dirs.project,"permissions":PERMISSIONS,
            "defaults":default_status(dirs)?,"plugins":dirs.discover(ide).iter().map(|e|dirs.describe(e)).collect::<Vec<_>>()}),
        ),
        "pluginSource" => {
            let e = dirs.find(s(args, 0)?)?;
            let m = e.manifest.as_ref().map_err(Clone::clone)?;
            let d = dirs.describe(&e);
            if d["enabled"] != true || d["needsConsent"] == true {
                return Err("Plugin desativado ou sem consentimento".into());
            }
            let code = String::from_utf8(fs::read(entry_file(&e.dir, &m.main)?).map_err(err)?).map_err(err)?;
            Ok(
                json!({"code":code,"manifest":m,"rootUri":url::Url::from_directory_path(&dirs.root).map_err(|_|"URI inválida")?.to_string()}),
            )
        }
        "pluginSetState" => {
            let e = dirs.find(s(args, 0)?)?;
            let options = args.get(1).cloned().unwrap_or(Value::Null);
            let declared = e
                .manifest
                .as_ref()
                .map(|m| m.permissions.clone())
                .unwrap_or_default();
            let mut state = dirs.state(&e);
            if let Some(enabled) = options["enabled"].as_bool() {
                state.enabled = enabled;
            }
            if let Some(list) = options["granted"].as_array() {
                state.granted = declared
                    .iter()
                    .filter(|p| list.iter().any(|v| v.as_str() == Some(p.as_str())))
                    .cloned()
                    .collect();
            }
            if options["consent"] == true {
                state.consented = true;
                state.reviewed = declared;
            }
            if options["consent"] == false {
                state = State {
                    enabled: false,
                    ..State::default()
                };
            }
            dirs.store(&e.state_key, Some(state))?;
            Ok(dirs.describe(&e))
        }
        "pluginInstall" => {
            let kind = args.get(1).and_then(Value::as_str).unwrap_or("folder");
            let source = match args.first().and_then(Value::as_str) {
                Some(p) if !p.is_empty() => PathBuf::from(p),
                _ => {
                    let dialog = rfd::AsyncFileDialog::new().set_title("Instalar plugin");
                    let picked = if kind == "zip" {
                        dialog
                            .add_filter("Plugin (.zip)", &["zip"])
                            .pick_file()
                            .await
                    } else {
                        dialog.pick_folder().await
                    };
                    match picked {
                        Some(f) => f.path().to_path_buf(),
                        None => return Ok(Value::Null),
                    }
                }
            };
            let e = install(dirs, &source, ide)?;
            Ok(dirs.describe(&e))
        }
        "pluginRemove" => {
            let _lock = DEFAULT_INSTALL.lock().await;
            let e = dirs.find(s(args, 0)?)?;
            if e.scope != "user" {
                return Err(
                    "Plugins do projeto são removidos apagando a pasta em .php-ide/plugins".into(),
                );
            }
            let dir = e.dir.canonicalize().map_err(err)?;
            if !dir.starts_with(dirs.user.canonicalize().map_err(err)?) {
                return Err("Pasta do plugin fora da pasta de plugins".into());
            }
            if let Ok(m) = &e.manifest {
                if defaults()?.iter().any(|p| p.plugin.id == m.id) { finish_default(dirs, &m.id)?; }
            }
            fs::remove_dir_all(&dir).map_err(err)?;
            dirs.store(&e.state_key, None)?;
            Ok(Value::Null)
        }
        "pluginExec" => {
            dirs.allowed(s(args, 0)?, "process")?;
            let program = s(args, 1)?;
            let list: Vec<String> = args
                .get(2)
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default();
            if program.is_empty()
                || program.contains('\0')
                || list.len() > 64
                || list.iter().any(|a| a.len() > 4096 || a.contains('\0'))
            {
                return Err("Comando inválido".into());
            }
            // Sem shell: programa e argumentos vão direto ao sistema, na raiz do projeto.
            crate::process::run(
                &dirs.root,
                program,
                &list,
                args.get(3).and_then(Value::as_str),
            )
            .await
            .map(Value::String)
        }
        "pluginWrite" => {
            dirs.allowed(s(args, 0)?, "project.write")?;
            write(&dirs.root, s(args, 1)?, s(args, 2)?)
        }
        "pluginFetch" => {
            dirs.allowed(s(args, 0)?, "network")?;
            fetch(&dirs.root, s(args, 1)?, args.get(2).unwrap_or(&Value::Null)).await
        }
        _ => Err(format!("Comando de plugin desconhecido: {method}")),
    }
}
fn write(root: &Path, input: &str, text: &str) -> Res<Value> {
    if !relative_ok(input) {
        return Err("Caminho inválido".into());
    }
    // Plugin não altera Git nem a configuração/código de plugins do projeto.
    let first = Path::new(input)
        .components()
        .next()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .unwrap_or_default();
    if [".git", ".php-ide"].contains(&first.as_str()) {
        return Err("PermissionDenied: escrita em pasta protegida".into());
    }
    match workspace::read(root, input) {
        Ok(before) => workspace::save(
            root,
            input,
            text,
            before["etag"].as_str().unwrap_or_default(),
        ),
        Err(_) if !root.join(input).exists() => workspace::create(root, input, text),
        Err(e) => Err(e),
    }
}
async fn fetch(root: &Path, url: &str, options: &Value) -> Res<Value> {
    let parsed = url::Url::parse(url).map_err(|_| "URL inválida")?;
    if !["http", "https"].contains(&parsed.scheme()) {
        return Err("Somente URLs http/https".into());
    }
    let method = options["method"].as_str().unwrap_or("GET").to_uppercase();
    if !["GET", "POST", "PUT", "DELETE", "HEAD"].contains(&method.as_str()) {
        return Err("Método HTTP não suportado".into());
    }
    // curl sem arquivo de configuração do usuário, só http(s), tempo e tamanho limitados.
    let mut list: Vec<String> = [
        "-q",
        "-sS",
        "-L",
        "--max-redirs",
        "3",
        "--proto",
        "=http,https",
        "--proto-redir",
        "=http,https",
        "--max-time",
        "20",
        "--max-filesize",
        "2000000",
        "-X",
        &method,
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    if let Some(headers) = options["headers"].as_object() {
        for (name, value) in headers.iter().take(20) {
            let value = value.as_str().unwrap_or_default();
            if name.is_empty()
                || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || value.contains(['\r', '\n'])
            {
                return Err("Cabeçalho HTTP inválido".into());
            }
            list.extend(["-H".into(), format!("{name}: {value}")]);
        }
    }
    let body = options["body"].as_str();
    if body.is_some() {
        list.extend(["--data-binary".into(), "@-".into()]);
    }
    list.extend([
        "-w".into(),
        "\n%{http_code}".into(),
        "--".into(),
        parsed.to_string(),
    ]);
    let out = crate::process::run(root, "curl", &list, body).await?;
    let (text, status) = out.rsplit_once('\n').unwrap_or(("", &out));
    Ok(json!({"status":status.trim().parse::<u16>().unwrap_or(0),"body":text}))
}

/// Copia (pasta) ou extrai (.zip) para uma área temporária, valida e move para a pasta do usuário.
pub fn install(dirs: &Dirs, source: &Path, ide: &str) -> Res<Entry> {
    let _lock = STATE.lock().map_err(err)?;
    fs::create_dir_all(&dirs.user).map_err(err)?;
    let staging = dirs.user.join(format!(".staging-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&staging).map_err(err)?;
    let result: Res<String> = (|| {
        let meta =
            fs::metadata(source).map_err(|_| "Origem do plugin não encontrada".to_owned())?;
        if meta.is_dir() {
            copy_tree(source, &staging, &mut (0, 0))?;
        } else if source
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
        {
            if meta.len() > MAX_BYTES {
                return Err("Arquivo .zip acima de 20 MB".into());
            }
            extract_zip(&fs::read(source).map_err(err)?, &staging)?;
        } else {
            return Err("Escolha uma pasta de plugin ou um arquivo .zip".into());
        }
        // Zips costumam embrulhar o plugin numa pasta única.
        let mut base = staging.clone();
        if !base.join(MANIFEST).exists() {
            let inner: Vec<_> = fs::read_dir(&base)
                .map_err(err)?
                .filter_map(Result::ok)
                .collect();
            if let [only] = inner.as_slice() {
                if only.file_type().map_err(err)?.is_dir() {
                    base = only.path();
                }
            }
        }
        let m = read_manifest(&base, ide)?;
        let target = dirs.user.join(&m.id);
        let _ = fs::remove_file(base.join(".php-ide-origin.json"));
        let backup = dirs.user.join(format!(".backup-{}", uuid::Uuid::new_v4()));
        let replacing = target.exists();
        if replacing {
            fs::rename(&target, &backup).map_err(err)?;
        }
        if let Err(e) = fs::rename(&base, &target) {
            if replacing {
                let _ = fs::rename(&backup, &target);
            }
            return Err(err(e));
        }
        if replacing {
            let _ = fs::remove_dir_all(backup);
        }
        Ok(m.id)
    })();
    let _ = fs::remove_dir_all(&staging);
    let id = result?;
    dirs.find(&format!("user:{id}"))
}
pub(crate) fn copy_tree(from: &Path, to: &Path, count: &mut (usize, u64)) -> Res<()> {
    for item in fs::read_dir(from).map_err(err)? {
        let item = item.map_err(err)?;
        let kind = item.file_type().map_err(err)?;
        let name = item.file_name();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        let target = to.join(&name);
        if kind.is_symlink() {
            return Err(format!(
                "Link simbólico não é permitido no plugin: {}",
                name.to_string_lossy()
            ));
        } else if kind.is_dir() {
            fs::create_dir(&target).map_err(err)?;
            copy_tree(&item.path(), &target, count)?;
        } else if kind.is_file() {
            count.0 += 1;
            count.1 += item.metadata().map_err(err)?.len();
            if count.0 > MAX_FILES || count.1 > MAX_BYTES {
                return Err("Plugin acima do limite (2000 arquivos / 20 MB)".into());
            }
            fs::copy(item.path(), &target).map_err(err)?;
        }
    }
    Ok(())
}
fn u16le(b: &[u8], at: usize) -> Res<usize> {
    b.get(at..at + 2)
        .map(|x| u16::from_le_bytes([x[0], x[1]]) as usize)
        .ok_or_else(|| "Zip truncado".into())
}
fn u32le(b: &[u8], at: usize) -> Res<usize> {
    b.get(at..at + 4)
        .map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]) as usize)
        .ok_or_else(|| "Zip truncado".into())
}
/// Leitor mínimo de .zip (armazenado e deflate, sem Zip64/criptografia) que recusa caminhos
/// absolutos, `..`, links simbólicos e conteúdo acima dos limites, conferindo o CRC.
pub fn extract_zip(bytes: &[u8], dest: &Path) -> Res<()> {
    let search = bytes.len().saturating_sub(65557);
    let end = (search..bytes.len().saturating_sub(21))
        .rev()
        .find(|&i| bytes[i..i + 4] == [0x50, 0x4b, 0x05, 0x06])
        .ok_or("Arquivo .zip inválido")?;
    let entries = u16le(bytes, end + 10)?;
    let mut at = u32le(bytes, end + 16)?;
    if entries > MAX_FILES || at == 0xffff_ffff {
        return Err("Zip com entradas demais ou Zip64 (não suportado)".into());
    }
    let mut total = 0u64;
    for _ in 0..entries {
        if u32le(bytes, at)? != 0x0201_4b50 {
            return Err("Diretório central do .zip inválido".into());
        }
        let flags = u16le(bytes, at + 8)?;
        let method = u16le(bytes, at + 10)?;
        let crc = u32le(bytes, at + 16)? as u32;
        let size = u32le(bytes, at + 20)?;
        let name_len = u16le(bytes, at + 28)?;
        let extra = u16le(bytes, at + 30)?;
        let comment = u16le(bytes, at + 32)?;
        let mode = (u32le(bytes, at + 38)? >> 16) as u32;
        let local = u32le(bytes, at + 42)?;
        let name = std::str::from_utf8(
            bytes
                .get(at + 46..at + 46 + name_len)
                .ok_or("Zip truncado")?,
        )
        .map_err(|_| "Nome inválido no .zip")?
        .to_owned();
        at += 46 + name_len + extra + comment;
        if flags & 1 != 0 {
            return Err("Zip criptografado não é suportado".into());
        }
        if mode & 0o170000 == 0o120000 {
            return Err(format!("Link simbólico não é permitido no plugin: {name}"));
        }
        let dir = name.ends_with('/');
        let clean = name.trim_end_matches('/');
        if clean.is_empty() || !relative_ok(clean) || clean.contains(':') {
            return Err(format!("Caminho inseguro no .zip: {name}"));
        }
        let target = dest.join(clean);
        if dir {
            fs::create_dir_all(&target).map_err(err)?;
            continue;
        }
        if u32le(bytes, local)? != 0x0403_4b50 {
            return Err("Cabeçalho local do .zip inválido".into());
        }
        let start = local + 30 + u16le(bytes, local + 26)? + u16le(bytes, local + 28)?;
        let data = bytes.get(start..start + size).ok_or("Zip truncado")?;
        let mut out = vec![];
        let limit = MAX_BYTES - total + 1;
        match method {
            0 => out.extend_from_slice(data),
            8 => {
                flate2::read::DeflateDecoder::new(data)
                    .take(limit)
                    .read_to_end(&mut out)
                    .map_err(|_| "Conteúdo deflate inválido")?;
            }
            _ => return Err(format!("Compressão {method} não suportada em {name}")),
        }
        total += out.len() as u64;
        if total > MAX_BYTES {
            return Err("Plugin acima de 20 MB descompactado".into());
        }
        let mut sum = flate2::Crc::new();
        sum.update(&out);
        if sum.sum() != crc {
            return Err(format!("CRC incorreto em {name}"));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        fs::write(&target, out).map_err(err)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn zip(files: &[(&str, &[u8], u32)]) -> Vec<u8> {
        let (mut out, mut central) = (vec![], vec![]);
        for (name, data, mode) in files {
            let mut c = flate2::Crc::new();
            c.update(data);
            let mut enc =
                flate2::write::DeflateEncoder::new(vec![], flate2::Compression::default());
            enc.write_all(data).unwrap();
            let packed = enc.finish().unwrap();
            let offset = out.len() as u32;
            let head = |sig: u32| {
                let mut h = sig.to_le_bytes().to_vec();
                h.extend([20, 0, 0, 0, 8, 0, 0, 0, 0, 0]);
                h.extend(c.sum().to_le_bytes());
                h.extend((packed.len() as u32).to_le_bytes());
                h.extend((data.len() as u32).to_le_bytes());
                h.extend((name.len() as u16).to_le_bytes());
                h.extend([0, 0]);
                h
            };
            out.extend(head(0x0403_4b50));
            out.extend(name.as_bytes());
            out.extend(&packed);
            let mut h = 0x0201_4b50u32.to_le_bytes().to_vec();
            h.extend([20, 3]);
            h.extend(head(0)[4..].iter());
            h.extend([0, 0, 0, 0, 0, 0]);
            h.extend((mode << 16).to_le_bytes());
            h.extend(offset.to_le_bytes());
            h.extend(name.as_bytes());
            central.extend(h);
        }
        let at = out.len() as u32;
        let n = files.len() as u16;
        let size = central.len() as u32;
        out.extend(central);
        out.extend(0x0605_4b50u32.to_le_bytes());
        out.extend([0, 0, 0, 0]);
        out.extend(n.to_le_bytes());
        out.extend(n.to_le_bytes());
        out.extend(size.to_le_bytes());
        out.extend(at.to_le_bytes());
        out.extend([0, 0]);
        out
    }
    const MANIFEST_JSON: &str = r#"{"id":"acme.todo","name":"TODO","version":"1.0.0","minIdeVersion":"0.1.0","main":"main.js","permissions":["project.read","process"]}"#;
    fn setup() -> (tempfile::TempDir, Dirs) {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        fs::create_dir_all(base.join("root")).unwrap();
        let mut dirs = Dirs::new(&base.join("config"), &base.join("root"));
        dirs.user = base.join("config/plugins");
        (tmp, dirs)
    }
    #[tokio::test]
    async fn defaults_preserve_existing_permissions_and_removals_without_network() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root"); fs::create_dir(&root).unwrap();
        let mut dirs = Dirs::new(&tmp.path().join("config"), &root);
        dirs.user = tmp.path().join("plugins");
        let source = tmp.path().join("source"); fs::create_dir(&source).unwrap();
        fs::write(source.join("plugin.json"), r#"{"id":"phpforge.bash","name":"Existing","version":"1.0.0","minIdeVersion":"0.2.0","main":"main.js","permissions":["project.read"]}"#).unwrap();
        fs::write(source.join("main.js"), "ide.register({})").unwrap();
        let entry = install(&dirs, &source, env!("CARGO_PKG_VERSION")).unwrap();
        // An existing manually installed package must still require its original consent.
        assert_eq!(dirs.describe(&entry)["needsConsent"], true);
        install_default(&dirs, "phpforge.bash").await.unwrap();
        assert_eq!(dirs.describe(&entry)["needsConsent"], true);
        dispatch(&dirs, "pluginRemove", &[json!("user:phpforge.bash")]).await.unwrap();
        install_default(&dirs, "phpforge.bash").await.unwrap();
        assert!(!dirs.user.join("phpforge.bash").exists());
        assert!(completed_defaults(&dirs).unwrap().contains("phpforge.bash"));
        assert!(install_default(&dirs, "unknown.plugin").await.is_err());
        assert!(!completed_defaults(&dirs).unwrap().contains("phpforge.prettier"));
    }
    #[tokio::test]
    async fn defaults_migrate_previous_removals_and_keep_new_packages_pending() {
        let tmp = tempfile::tempdir().unwrap();
        let dirs = Dirs::new(tmp.path(), tmp.path());
        fs::write(tmp.path().join("bundled-plugins-v1.json"), "{}" ).unwrap();
        install_default(&dirs, "phpforge.docker").await.unwrap();
        let status = default_status(&dirs).unwrap();
        assert_eq!(status.as_array().unwrap().iter().filter(|p| p["pending"] == true).count(), 1);
        assert_eq!(status[4]["id"], "phpforge.prettier");
        assert!(!dirs.user.exists());
    }
    #[test]
    fn default_repositories_are_pinned_and_permissions_are_read_only() {
        let packages = defaults().unwrap();
        assert_eq!(packages.len(), 5);
        for p in packages {
            assert_eq!(p.plugin.repository, format!("https://github.com/phpforge-dev/plugin-{}", p.plugin.id.strip_prefix("phpforge.").unwrap()));
            assert_eq!(p.plugin.revision.len(), 40);
            assert!(p.plugin.revision.bytes().all(|b| b.is_ascii_hexdigit()));
            assert_eq!(p.sha256.len(), 64);
            assert!(p.sha256.bytes().all(|b| b.is_ascii_hexdigit()));
            assert!(p.permissions.iter().all(|p| p == "project.read"));
        }
    }

    #[test]
    fn manifest_rules() {
        let (tmp, _) = setup();
        let dir = tmp.path().join("p");
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("main.js"), "ide.register({})").unwrap();
        let base: Manifest = serde_json::from_str(MANIFEST_JSON).unwrap();
        assert!(validate(&base, &dir, "0.2.0").is_ok());
        let bad = |f: &dyn Fn(&mut Manifest)| {
            let mut m = base.clone();
            f(&mut m);
            validate(&m, &dir, "0.2.0").unwrap_err()
        };
        assert!(
            bad(&|m| m.id = "laravel".into()).contains("id inválido"),
            "sem editor: colide com internos"
        );
        assert!(bad(&|m| m.min_ide_version = "9.0.0".into()).contains("Requer PHP IDE 9.0.0"));
        assert!(
            bad(&|m| m.permissions = vec!["clipboard".into()]).contains("Permissão desconhecida")
        );
        assert!(bad(&|m| m.main = "../x.js".into()).contains("main deve"));
        assert!(bad(&|m| m.main = "missing.js".into()).contains("não encontrado"));
        assert!(
            bad(&|m| m.activation.files = vec!["/etc/passwd".into()]).contains("ativação inválido")
        );
        assert!(bad(&|m| m.activation.languages = vec!["cobol".into()]).contains("desconhecida"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc/hosts", dir.join("link.js")).unwrap();
            assert!(bad(&|m| m.main = "link.js".into()).contains("fora da pasta"));
        }
    }
    #[test]
    fn zip_install_and_unsafe_archives() {
        let (tmp, dirs) = setup();
        let good = tmp.path().join("good.zip");
        fs::write(
            &good,
            zip(&[
                ("todo/plugin.json", MANIFEST_JSON.as_bytes(), 0o100644),
                ("todo/main.js", b"ide.register({})", 0o100644),
            ]),
        )
        .unwrap();
        let e = install(&dirs, &good, "0.2.0").unwrap();
        assert_eq!(e.key, "user:acme.todo");
        assert!(dirs.user.join("acme.todo/main.js").is_file());
        let d = dirs.describe(&e);
        assert_eq!(
            (d["enabled"].clone(), d["needsConsent"].clone()),
            (json!(true), json!(true)),
            "ativo mas aguardando consentimento"
        );
        for (name, mode) in [
            ("../evil.js", 0o100644),
            ("/abs.js", 0o100644),
            ("a/../../x", 0o100644),
            ("link", 0o120777),
        ] {
            let out = tmp.path().join("x");
            let _ = fs::remove_dir_all(&out);
            fs::create_dir(&out).unwrap();
            assert!(
                extract_zip(&zip(&[(name, b"x", mode)]), &out).is_err(),
                "{name}"
            );
            assert_eq!(fs::read_dir(&out).unwrap().count(), 0);
        }
        let mut corrupt = zip(&[("a.txt", b"hello", 0o100644)]);
        let central = corrupt
            .windows(4)
            .position(|w| w == [0x50, 0x4b, 0x01, 0x02])
            .unwrap();
        corrupt[central + 16] ^= 1;
        assert!(extract_zip(&corrupt, &tmp.path().join("y"))
            .unwrap_err()
            .contains("CRC"));
        assert!(dirs.user.read_dir().unwrap().all(|e| !e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".staging")));
        // A synthetic package keeps Rust folder-install tests offline and independent of plugin repos.
        let fixture = tmp.path().join("folder-plugin");
        fs::create_dir(&fixture).unwrap();
        fs::write(fixture.join("plugin.json"), r#"{"id":"example.todo-hints","name":"Folder fixture","version":"1.0.0","minIdeVersion":"0.2.0","main":"main.js","permissions":["project.read"]}"#).unwrap();
        fs::write(fixture.join("main.js"), "ide.register({})").unwrap();
        let e = install(&dirs, &fixture, env!("CARGO_PKG_VERSION")).unwrap();
        assert_eq!(e.key, "user:example.todo-hints");
        assert_eq!(
            e.manifest.unwrap().permissions,
            vec!["project.read".to_owned()]
        );
    }
    #[test]
    fn consent_and_backend_permission_checks() {
        let (_tmp, dirs) = setup();
        let p = dirs.project.join("todo");
        fs::create_dir_all(&p).unwrap();
        fs::write(
            p.join("plugin.json"),
            MANIFEST_JSON.replace("\"process\"", "\"process\",\"project.write\""),
        )
        .unwrap();
        fs::write(p.join("main.js"), "").unwrap();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let call = |m: &str, a: Value| rt.block_on(dispatch(&dirs, m, a.as_array().unwrap()));
        let list = call("pluginList", json!([])).unwrap();
        assert_eq!(list["plugins"][0]["key"], "project:acme.todo");
        assert!(
            call("pluginSource", json!(["project:acme.todo"])).is_err(),
            "sem consentimento não entrega código"
        );
        assert_eq!(
            call("pluginExec", json!(["project:acme.todo", "echo", ["x"]])).unwrap_err(),
            "PermissionDenied: process"
        );
        let d = call("pluginSetState", json!(["project:acme.todo", {"consent":true,"enabled":true,"granted":["project.read","network"]}])).unwrap();
        assert_eq!(
            (d["needsConsent"].clone(), d["granted"].clone()),
            (json!(false), json!(["project.read"])),
            "não concede o que não foi declarado"
        );
        assert!(call("pluginSource", json!(["project:acme.todo"])).unwrap()["code"].is_string());
        // Minified browser bundles may contain NUL inside a valid JavaScript literal.
        let minified = "ide.register({format(){return {text:'a\0b'};}});";
        fs::write(p.join("main.js"), minified).unwrap();
        assert_eq!(call("pluginSource", json!(["project:acme.todo"])).unwrap()["code"], minified);

        assert_eq!(
            call("pluginExec", json!(["project:acme.todo", "echo", ["x"]])).unwrap_err(),
            "PermissionDenied: process",
            "negada no consentimento"
        );
        assert_eq!(
            call("pluginWrite", json!(["project:acme.todo", "a.txt", "x"])).unwrap_err(),
            "PermissionDenied: project.write"
        );
        call(
            "pluginSetState",
            json!(["project:acme.todo", {"granted":["process","project.write"]}]),
        )
        .unwrap();
        assert_eq!(
            call("pluginExec", json!(["project:acme.todo", "echo", ["ok"]])).unwrap(),
            json!("ok\n")
        );
        call(
            "pluginWrite",
            json!(["project:acme.todo", "out/a.txt", "1"]),
        )
        .unwrap();
        call(
            "pluginWrite",
            json!(["project:acme.todo", "out/a.txt", "2"]),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(dirs.root.join("out/a.txt")).unwrap(),
            "2"
        );
        assert!(call(
            "pluginWrite",
            json!(["project:acme.todo", ".php-ide/plugins/todo/main.js", "x"])
        )
        .unwrap_err()
        .contains("protegida"));
        assert!(call("pluginWrite", json!(["project:acme.todo", "../x", "x"])).is_err());
        assert_eq!(
            call(
                "pluginFetch",
                json!(["project:acme.todo", "https://example.com"])
            )
            .unwrap_err(),
            "PermissionDenied: network"
        );
        // Nova versão pede permissão nova: volta a exigir consentimento.
        fs::write(
            p.join("plugin.json"),
            MANIFEST_JSON.replace("\"process\"", "\"process\",\"project.write\",\"network\""),
        )
        .unwrap();
        assert_eq!(
            call("pluginList", json!([])).unwrap()["plugins"][0]["needsConsent"],
            true
        );
        assert!(
            call("pluginRemove", json!(["project:acme.todo"])).is_err(),
            "plugin do projeto não é apagado pela IDE"
        );
        call(
            "pluginSetState",
            json!(["project:acme.todo", {"consent":false}]),
        )
        .unwrap();
        assert_eq!(
            call("pluginList", json!([])).unwrap()["plugins"][0]["enabled"],
            false
        );
    }
}
