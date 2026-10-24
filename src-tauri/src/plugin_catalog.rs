//! Catalog lookup and staged Git installs. Repository code is never executed during installation.
use crate::{
    plugins::{self, Dirs},
    workspace::{err, hash, Res},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::process::Command;

const CATALOG_URL: &str =
    "https://raw.githubusercontent.com/phpforge-dev/plugins/main/catalog.json";
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogPlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub version: String,
    pub repository: String,
    pub revision: String,
    pub min_ide_version: String,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    schema_version: u32,
    plugins: Vec<CatalogPlugin>,
}
fn repository(input: &str) -> Res<String> {
    let u = url::Url::parse(input.trim()).map_err(|_| "Informe a URL HTTPS do repositório")?;
    if u.scheme() != "https"
        || u.host_str().is_none()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path().trim_matches('/').is_empty()
        || input.len() > 500
    {
        return Err(
            "Use uma URL HTTPS de repositório, sem credenciais, parâmetros ou fragmentos".into(),
        );
    }
    Ok(u.to_string().trim_end_matches('/').to_owned())
}
fn revision(input: &str) -> Res<&str> {
    if input.is_empty()
        || input.len() > 100
        || input.starts_with(['-', '/'])
        || input.contains("..")
        || !input
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._/-".contains(&b))
    {
        return Err("Informe uma tag, branch ou commit válido".into());
    }
    Ok(input)
}
fn catalog(text: &str) -> Res<Catalog> {
    if text.len() > 1024 * 1024 {
        return Err("Catálogo acima de 1 MB".into());
    }
    let c: Catalog = serde_json::from_str(text).map_err(|e| format!("Catálogo inválido: {e}"))?;
    if c.schema_version != 1 || c.plugins.len() > 2000 {
        return Err("Versão ou tamanho de catálogo não suportado".into());
    }
    let mut ids = std::collections::BTreeSet::new();
    for p in &c.plugins {
        repository(&p.repository)?;
        if !plugins::id_ok(&p.id)
            || !ids.insert(&p.id)
            || plugins::version(&p.version).is_none()
            || plugins::version(&p.min_ide_version).is_none()
            || p.name.is_empty()
            || p.name.len() > 100
            || p.description.len() > 600
            || p.author.len() > 100
            || p.revision.len() != 40
            || !p.revision.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Entrada inválida ou duplicada no catálogo".into());
        }
    }
    Ok(c)
}
fn base(dirs: &Dirs) -> PathBuf {
    dirs.state.with_file_name("plugin-downloads")
}
async fn git(root: &Path, args: &[&str]) -> Res<String> {
    let mut cmd = Command::new("git");
    let hooks = root.join("empty-hooks");
    fs::create_dir_all(&hooks).map_err(err)?;
    cmd.args([
        "-c",
        &format!("core.hooksPath={}", hooks.display()),
        "-c",
        "protocol.allow=never",
        "-c",
        "protocol.https.allow=always",
        "-c",
        "credential.helper=",
        "-c",
        "core.askPass=",
    ])
    .args(args)
    .current_dir(root)
    .kill_on_drop(true);
    for (key, _) in std::env::vars() {
        if key.starts_with("GIT_") {
            cmd.env_remove(key);
        }
    }
    cmd.env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1");
    let out = tokio::time::timeout(Duration::from_secs(60), cmd.output())
        .await
        .map_err(|_| "Download do plugin excedeu 60 segundos. Tente novamente.")?
        .map_err(err)?;
    if !out.status.success() {
        return Err(format!(
            "Não foi possível ler o repositório: {}",
            String::from_utf8_lossy(&out.stderr)
                .chars()
                .take(1000)
                .collect::<String>()
        ));
    }
    String::from_utf8(out.stdout).map_err(err)
}
fn preview_path(dirs: &Dirs, token: &str) -> Res<PathBuf> {
    let id = uuid::Uuid::parse_str(token).map_err(|_| "Prévia inválida")?;
    Ok(base(dirs).join(id.to_string()))
}
async fn inspect(
    dirs: &Dirs,
    repo: &str,
    reference: &str,
    expected: Option<&CatalogPlugin>,
) -> Res<Value> {
    let repo = repository(repo)?;
    if !reference.is_empty() {
        revision(reference)?;
    }
    fs::create_dir_all(base(dirs)).map_err(err)?;
    for e in fs::read_dir(base(dirs))
        .map_err(err)?
        .filter_map(Result::ok)
    {
        let name = e.file_name().to_string_lossy().to_string();
        if (uuid::Uuid::parse_str(&name).is_ok() || name.starts_with("download-"))
            && e.file_type().is_ok_and(|t| t.is_dir())
            && e.metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age.as_secs() > 86400)
        {
            let _ = fs::remove_dir_all(e.path());
        }
    }
    // TempDir cleans failed downloads; successful previews remain until confirmation/cancellation.
    let temp = tempfile::Builder::new()
        .prefix("download-")
        .tempdir_in(base(dirs))
        .map_err(err)?;
    let target = temp.path().join("checkout");
    git(
        temp.path(),
        &[
            "clone",
            "--depth=1",
            "--no-checkout",
            "--no-tags",
            "--",
            &repo,
            "checkout",
        ],
    )
    .await?;
    if !reference.is_empty() {
        git(
            temp.path(),
            &[
                "-C",
                "checkout",
                "fetch",
                "--depth=1",
                "--no-tags",
                "origin",
                reference,
            ],
        )
        .await?;
    }
    let head = if reference.is_empty() {
        "HEAD"
    } else {
        "FETCH_HEAD"
    };
    git(
        temp.path(),
        &[
            "-C",
            "checkout",
            "-c",
            "core.symlinks=true",
            "checkout",
            "--detach",
            head,
        ],
    )
    .await?;
    let commit = git(temp.path(), &["-C", "checkout", "rev-parse", "HEAD"])
        .await?
        .trim()
        .to_owned();
    fs::remove_dir_all(target.join(".git")).map_err(err)?;
    let m = plugins::read_manifest(&target, env!("CARGO_PKG_VERSION"))?;
    if let Some(p) = expected {
        if m.id != p.id || m.version != p.version || commit != p.revision {
            return Err("O plugin baixado não corresponde à versão publicada no catálogo".into());
        }
    }
    // Apply the same file-count, size and symlink rules before offering installation.
    let checked = temp.path().join("checked");
    fs::create_dir(&checked).map_err(err)?;
    plugins::copy_tree(&target, &checked, &mut (0, 0))?;
    let digest = hash(&fs::read(target.join(&m.main)).map_err(err)?);
    let origin =
        json!({"repository":repo,"revision":commit,"version":m.version,"entryHash":digest});
    fs::write(
        temp.path().join("origin.json"),
        serde_json::to_vec(&origin).map_err(err)?,
    )
    .map_err(err)?;
    let token = uuid::Uuid::new_v4().to_string();
    fs::rename(temp.path(), preview_path(dirs, &token)?).map_err(err)?;
    Ok(json!({"token":token,"manifest":m,"origin":origin}))
}
pub async fn dispatch(dirs: &Dirs, method: &str, args: &[Value]) -> Res<Value> {
    let arg = |i: usize| {
        args.get(i)
            .and_then(Value::as_str)
            .ok_or_else(|| "Argumento inválido".to_owned())
    };
    match method {
        "pluginCatalog" => {
            let cache = dirs.state.with_file_name("plugin-catalog.json");
            let result = async {
                let text = crate::process::run(
                    &dirs.root,
                    "curl",
                    &[
                        "-q",
                        "-fsSL",
                        "--proto",
                        "=https",
                        "--proto-redir",
                        "=https",
                        "--max-time",
                        "15",
                        "--max-filesize",
                        "1048576",
                        CATALOG_URL,
                    ]
                    .map(str::to_owned),
                    None,
                )
                .await?;
                let c = catalog(&text)?;
                if let Some(parent) = cache.parent() {
                    fs::create_dir_all(parent).map_err(err)?;
                }
                fs::write(&cache, text).map_err(err)?;
                Ok::<_, String>(c)
            }
            .await;
            match result {
                Ok(c) => Ok(json!({"plugins":c.plugins,"cached":false})),
                Err(e) => match fs::read_to_string(cache).ok().and_then(|s| catalog(&s).ok()) {
                    Some(c) => Ok(json!({"plugins":c.plugins,"cached":true,"warning":format!("Sem conexão com o catálogo. Mostrando a última lista salva. {e}")})),
                    None => Err(format!("Não foi possível carregar o catálogo. Tente novamente ou instale pela URL Git. {e}")),
                }
            }
        }
        "pluginInspectGit" => {
            inspect(
                dirs,
                arg(0)?,
                args.get(1).and_then(Value::as_str).unwrap_or(""),
                None,
            )
            .await
        }
        "pluginInspectCatalog" => {
            let text = fs::read_to_string(dirs.state.with_file_name("plugin-catalog.json"))
                .map_err(|_| "Atualize o catálogo antes de instalar")?;
            let c = catalog(&text)?;
            let p = c
                .plugins
                .iter()
                .find(|p| p.id == arg(0).unwrap_or(""))
                .ok_or("Plugin não encontrado no catálogo")?;
            inspect(dirs, &p.repository, &p.revision, Some(p)).await
        }
        "pluginDiscardPreview" => {
            let p = preview_path(dirs, arg(0)?)?;
            if p.exists() {
                fs::remove_dir_all(p).map_err(err)?;
            }
            Ok(Value::Null)
        }
        "pluginConfirmInstall" => {
            let p = preview_path(dirs, arg(0)?)?;
            let origin: Value = serde_json::from_slice(
                &fs::read(p.join("origin.json"))
                    .map_err(|_| "Prévia expirada. Consulte o repositório novamente.")?,
            )
            .map_err(err)?;
            let source = p.join("checkout");
            let m = plugins::read_manifest(&source, env!("CARGO_PKG_VERSION"))?;
            if origin["entryHash"].as_str()
                != Some(hash(&fs::read(source.join(&m.main)).map_err(err)?).as_str())
                || origin["version"].as_str() != Some(m.version.as_str())
            {
                return Err("A prévia mudou no disco. Consulte o repositório novamente.".into());
            }
            let entry = plugins::install(dirs, &source, env!("CARGO_PKG_VERSION"))?;
            fs::write(
                entry.dir.join(".php-ide-origin.json"),
                serde_json::to_vec(&origin).map_err(err)?,
            )
            .map_err(err)?;
            fs::remove_dir_all(p).map_err(err)?;
            Ok(dirs.describe(&entry))
        }
        _ => Err("Comando de catálogo desconhecido".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn preview_confirmation_preserves_installed_version_on_invalid_package() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        fs::create_dir(&root).unwrap();
        let mut dirs = Dirs::new(&tmp.path().join("config"), &root);
        dirs.user = tmp.path().join("plugins");
        let token = uuid::Uuid::new_v4().to_string();
        let p = preview_path(&dirs, &token).unwrap();
        fs::create_dir_all(p.join("checkout")).unwrap();
        let manifest = json!({"id":"acme.preview","name":"Preview","version":"1.0.0","minIdeVersion":"0.2.0","main":"main.js","permissions":[]});
        fs::write(
            p.join("checkout/plugin.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        fs::write(p.join("checkout/main.js"), "ide.register({})").unwrap();
        let origin = json!({"repository":"https://github.com/acme/preview","revision":"a".repeat(40),"version":"1.0.0","entryHash":hash(b"ide.register({})")});
        fs::write(p.join("origin.json"), serde_json::to_vec(&origin).unwrap()).unwrap();
        let installed = dispatch(&dirs, "pluginConfirmInstall", &[json!(token)])
            .await
            .unwrap();
        assert_eq!(installed["needsConsent"], true);
        assert_eq!(installed["origin"]["revision"], "a".repeat(40));
        assert!(!p.exists());
        fs::create_dir_all(p.join("checkout")).unwrap();
        fs::write(
            p.join("checkout/plugin.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        fs::write(p.join("checkout/main.js"), "changed after preview").unwrap();
        fs::write(p.join("origin.json"), serde_json::to_vec(&origin).unwrap()).unwrap();
        assert!(dispatch(&dirs, "pluginConfirmInstall", &[json!(token)])
            .await
            .unwrap_err()
            .contains("prévia mudou"));
        assert_eq!(
            fs::read_to_string(dirs.user.join("acme.preview/main.js")).unwrap(),
            "ide.register({})"
        );
        dispatch(&dirs, "pluginDiscardPreview", &[json!(token)])
            .await
            .unwrap();
        assert!(!p.exists());
        assert!(preview_path(&dirs, "../escape").is_err());
    }
    #[tokio::test]
    async fn bundled_packages_can_be_disabled_removed_and_stay_removed() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("root");
        fs::create_dir(&root).unwrap();
        let mut dirs = Dirs::new(&tmp.path().join("config"), &root);
        dirs.user = tmp.path().join("plugins");
        plugins::seed_bundled(&dirs).unwrap();
        let list = plugins::dispatch(&dirs, "pluginList", &[]).await.unwrap();
        assert_eq!(list["plugins"].as_array().unwrap().len(), 4);
        plugins::dispatch(
            &dirs,
            "pluginSetState",
            &[json!("user:phpforge.bash"), json!({"enabled":false})],
        )
        .await
        .unwrap();
        plugins::dispatch(&dirs, "pluginRemove", &[json!("user:phpforge.bash")])
            .await
            .unwrap();
        plugins::seed_bundled(&dirs).unwrap();
        assert!(!dirs.user.join("phpforge.bash").exists());
    }
    #[test]
    fn rejects_commands_credentials_and_unpinned_catalogs() {
        for bad in [
            "git clone https://github.com/a/b",
            "file:///tmp/repo",
            "https://user:pass@github.com/a/b",
            "ssh://git@github.com/a/b",
            "https://github.com/a/b?token=secret",
        ] {
            assert!(repository(bad).is_err(), "{bad}");
        }
        assert!(repository("https://github.com/phpforge-dev/plugin-bash.git").is_ok());
        for bad in ["--upload-pack=evil", "a..b", "main;touch x", "HEAD~1"] {
            assert!(revision(bad).is_err());
        }
        assert!(revision("feature/support-bash").is_ok());
        let input = r#"{"schemaVersion":1,"plugins":[{"id":"acme.test","name":"Test","description":"Test","author":"Author","version":"1.0.0","minIdeVersion":"0.2.0","repository":"https://github.com/a/b","revision":"main"}]}"#;
        assert!(catalog(input).is_err());
        assert!(catalog(&input.replace("\"main\"", &format!("\"{}\"", "a".repeat(40)))).is_ok());
    }
}
