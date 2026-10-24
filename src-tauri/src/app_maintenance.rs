//! Profile-wide first-run choices, resumable plugin downloads and signed app updates.
use crate::{
    install_generation::Launch,
    plugin_catalog, plugins,
    workspace::{err, Res},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const RELEASES: &str = "https://api.github.com/repos/phpforge-dev/php-ide/releases/latest";
const RELEASE_PAGE: &str = "https://github.com/phpforge-dev/php-ide/releases/latest";
const UPDATE_ENDPOINT: &str =
    "https://github.com/phpforge-dev/php-ide/releases/latest/download/latest.json";
fn signing_key() -> Option<&'static str> {
    option_env!("PHP_IDE_UPDATER_PUBLIC_KEY").filter(|key| !key.trim().is_empty())
}
fn signed_updater_available() -> bool {
    !cfg!(debug_assertions)
        && signing_key().is_some()
        && (!cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Preferences {
    pub setup_complete: bool,
    pub auto_update_plugins: bool,
    pub auto_update_ide: bool,
    pub check_updates: bool,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            setup_complete: false,
            auto_update_plugins: false,
            auto_update_ide: false,
            check_updates: true,
        }
    }
}
impl Preferences {
    fn fresh() -> Self {
        Self::default()
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    id: String,
    name: String,
    kind: String,
    status: String,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    permissions: Vec<String>,
    #[serde(default)]
    approved: Vec<String>,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    target: Option<plugin_catalog::CatalogPlugin>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    preferences: Preferences,
    #[serde(default)]
    jobs: Vec<Job>,
}
struct State {
    saved: Saved,
    working: bool,
    checking: bool,
    resumed: bool,
    checked_at: Option<u64>,
    updates: Vec<Value>,
    ide: Option<Value>,
    errors: Vec<String>,
    ide_progress: Value,
    signed: Option<tauri_plugin_updater::Update>,
    bytes: Option<Vec<u8>>,
}
pub struct Maintenance {
    config: PathBuf,
    state: Mutex<State>,
    ide_install: tokio::sync::Mutex<()>,
}
fn save(path: &Path, saved: &Saved) -> Res<()> {
    fs::create_dir_all(path).map_err(err)?;
    let temp = path.join("app-preferences.tmp");
    fs::write(&temp, serde_json::to_vec_pretty(saved).map_err(err)?).map_err(err)?;
    fs::rename(temp, path.join("app-preferences.json")).map_err(err)
}
fn existing_profile(config: &Path) -> bool {
    [
        "default-plugins.json",
        "bundled-plugins-v1.json",
        "plugins-state.json",
        "recent-projects.json",
    ]
    .iter()
    .any(|name| config.join(name).exists())
        || config
            .join("plugins")
            .read_dir()
            .is_ok_and(|mut entries| entries.next().is_some())
}
impl Maintenance {
    pub fn open(config: PathBuf, launch: Launch) -> Res<Self> {
        let path = config.join("app-preferences.json");
        let mut warnings = vec![];
        let mut saved = match fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<Saved>(&bytes) {
                Ok(saved) => saved,
                Err(_) => {
                    fs::rename(
                        &path,
                        config.join(format!(
                            "app-preferences.invalid-{}.json",
                            uuid::Uuid::new_v4()
                        )),
                    )
                    .map_err(err)?;
                    warnings.push("Update preferences were damaged. A backup was preserved and automatic updates remain off.".into());
                    let mut preferences = Preferences::fresh();
                    preferences.setup_complete = existing_profile(&config);
                    Saved {
                        preferences,
                        jobs: vec![],
                    }
                }
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let mut preferences = Preferences::fresh();
                preferences.setup_complete = existing_profile(&config);
                Saved {
                    preferences,
                    jobs: vec![],
                }
            }
            Err(e) => return Err(err(e)),
        };
        if launch == Launch::Reinstall {
            saved.preferences.setup_complete = false;
        }
        // An interrupted download is retried on the next application launch.
        for job in &mut saved.jobs {
            if job.status == "downloading" {
                job.status = "queued".into();
            }
        }
        save(&config, &saved)?;
        Ok(Self {
            config,
            ide_install: tokio::sync::Mutex::new(()),
            state: Mutex::new(State {
                saved,
                working: false,
                checking: false,
                resumed: false,
                checked_at: None,
                updates: vec![],
                ide: None,
                errors: warnings,
                ide_progress: Value::Null,
                signed: None,
                bytes: None,
            }),
        })
    }
    fn snapshot(&self) -> Res<Value> {
        let s = self.state.lock().map_err(err)?;
        let defaults=plugins::defaults()?.into_iter().map(|p|json!({"id":p.plugin.id,"name":p.plugin.name,"description":p.plugin.description,"permissions":p.permissions})).collect::<Vec<_>>();
        Ok(
            json!({"preferences":s.saved.preferences,"jobs":s.saved.jobs,"defaults":defaults,"checking":s.checking,"checkedAt":s.checked_at,"updates":s.updates,"ide":s.ide,"errors":s.errors,"ideProgress":s.ide_progress,"ideAutoUpdateAvailable":signed_updater_available(),"ideVersion":env!("CARGO_PKG_VERSION")}),
        )
    }
    pub(crate) fn note_pending_update(&self, version: &str) -> Res<()> {
        crate::install_generation::mark_update(&self.config, version)
    }
    fn change(&self, change: impl FnOnce(&mut State)) -> Res<()> {
        let mut state = self.state.lock().map_err(err)?;
        let previous = state.saved.clone();
        change(&mut state);
        if let Err(error) = save(&self.config, &state.saved) {
            state.saved = previous;
            return Err(error);
        }
        Ok(())
    }
}
fn emit(app: &tauri::AppHandle) {
    let _ = app.emit("app-maintenance", ());
}
fn dirs(app: &tauri::AppHandle) -> Res<plugins::Dirs> {
    let service = app.state::<Maintenance>();
    let root = service.config.join("maintenance-workspace");
    fs::create_dir_all(&root).map_err(err)?;
    Ok(plugins::Dirs::new(&service.config, &root))
}
/// GitHub answers 404 for `/releases/latest` when every tag is a draft or prerelease.
fn published_release(response: &str) -> Res<Option<Value>> {
    let (body, status) = response.rsplit_once('\n').unwrap_or((response, ""));
    match status.trim() {
        "404" => Ok(None),
        "200" => Ok(Some(serde_json::from_str(body).map_err(err)?)),
        code => Err(format!(
            "Não foi possível consultar as versões publicadas (HTTP {code})."
        )),
    }
}
fn newer(a: &str, b: &str) -> bool {
    matches!((plugins::version(a),plugins::version(b)),(Some(a),Some(b)) if a>b)
}
fn same_source(current: &Value, candidate: &plugin_catalog::CatalogPlugin) -> bool {
    current["scope"] == "user"
        && current["origin"]["repository"].as_str() == Some(candidate.repository.as_str())
        && current["manifest"]["version"]
            .as_str()
            .is_some_and(|version| newer(&candidate.version, version))
        && plugins::version(&candidate.min_ide_version)
            <= plugins::version(env!("CARGO_PKG_VERSION"))
}
fn permission_growth(current: &[String], next: &[String]) -> Vec<String> {
    next.iter()
        .filter(|permission| !current.contains(permission))
        .cloned()
        .collect()
}
fn preferences_patch(current: &Preferences, value: &Value, signed: bool) -> Res<Preferences> {
    let mut next = current.clone();
    if let Some(value) = value["autoUpdatePlugins"].as_bool() {
        next.auto_update_plugins = value;
        if value {
            next.check_updates = true;
        }
    }
    if let Some(value) = value["autoUpdateIde"].as_bool() {
        if value && !signed {
            return Err("Signed IDE updates are not configured for this build".into());
        }
        next.auto_update_ide = value;
        if value {
            next.check_updates = true;
        }
    }
    if let Some(value) = value["checkUpdates"].as_bool() {
        next.check_updates = value;
        if !value {
            next.auto_update_plugins = false;
            next.auto_update_ide = false;
        }
    }
    Ok(next)
}
async fn approve_first_install(
    d: &plugins::Dirs,
    entry: &plugins::Entry,
    permissions: &[String],
) -> Res<()> {
    let installed = d.describe(entry);
    // Never undo an enable/permission decision made in the manager during a download.
    if installed["consented"] != true && installed["enabled"] == true {
        plugins::dispatch(
            d,
            "pluginSetState",
            &[
                json!(entry.key),
                json!({"consent":true,"enabled":true,"granted":permissions}),
            ],
        )
        .await?;
    }
    Ok(())
}
async fn download_plugin(
    app: &tauri::AppHandle,
    job: &Job,
) -> Res<(String, Option<String>, Vec<String>)> {
    let d = dirs(app)?;
    if job.kind == "install" {
        let package = plugins::defaults()?
            .into_iter()
            .find(|p| p.plugin.id == job.id)
            .ok_or("Unknown plugin")?;
        if !permission_growth(&job.permissions, &package.permissions).is_empty() {
            return Ok(("review".into(), None, package.permissions));
        }
        let result = plugins::dispatch(&d, "pluginInstallDefault", &[json!(job.id)]).await?;
        let entry = d.find(&format!("user:{}", job.id))?;
        if result.is_null() {
            // A crash may occur after atomic installation but before permission persistence.
            // Replay consent only for the exact release the user selected, never an unrelated install.
            let installed = d.describe(&entry);
            let manifest = entry.manifest.as_ref().map_err(Clone::clone)?;
            let digest =
                crate::workspace::hash(&fs::read(entry.dir.join(&manifest.main)).map_err(err)?);
            plugin_catalog::verify_default(&package, manifest, Some(&digest))?;
            if installed["origin"]["repository"] != package.plugin.repository
                || installed["origin"]["revision"] != package.plugin.revision
            {
                return Err("Existing plugin has a different origin. Review it in Plugins before replacing it.".into());
            }
        }
        approve_first_install(&d, &entry, &job.permissions).await?;
        return Ok(("installed".into(), None, vec![]));
    }
    let target = job.target.as_ref().ok_or("Missing update target")?;
    let current = d.find(&format!("user:{}", job.id))?;
    let current = d.describe(&current);
    if !same_source(&current, target) {
        return Err("Plugin origin or installed version changed. Check for updates again.".into());
    }
    // Reuse the exact checked catalog entry; no caller-controlled repository or revision.
    let preview = plugin_catalog::inspect_package(&d, target).await?;
    let token = preview["token"]
        .as_str()
        .ok_or("Missing download token")?
        .to_owned();
    let manifest: plugins::Manifest =
        serde_json::from_value(preview["manifest"].clone()).map_err(err)?;
    let old: plugins::Manifest =
        serde_json::from_value(current["manifest"].clone()).map_err(err)?;
    let added = permission_growth(&old.permissions, &manifest.permissions);
    if added.iter().any(|p| !job.approved.contains(p)) {
        plugin_catalog::dispatch(&d, "pluginDiscardPreview", &[json!(token)]).await?;
        return Ok(("review".into(), None, added));
    }
    Ok(("staged".into(), Some(token), manifest.permissions))
}
fn start_worker(app: tauri::AppHandle) {
    {
        let service = app.state::<Maintenance>();
        let Ok(mut s) = service.state.lock() else {
            return;
        };
        if s.working {
            return;
        }
        s.working = true;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            let service = app.state::<Maintenance>();
            let job = {
                let Ok(mut s) = service.state.lock() else {
                    return;
                };
                match s.saved.jobs.iter_mut().find(|j| j.status == "queued") {
                    Some(job) => {
                        job.status = "downloading".into();
                        job.error = None;
                        let job = job.clone();
                        match save(&service.config, &s.saved) {
                            Ok(()) => Some(job),
                            Err(error) => {
                                let current =
                                    s.saved.jobs.iter_mut().find(|j| j.id == job.id).unwrap();
                                current.status = "failed".into();
                                current.error = Some(error);
                                s.working = false;
                                None
                            }
                        }
                    }
                    None => {
                        s.working = false;
                        None
                    }
                }
            };
            emit(&app);
            let Some(job) = job else { break };
            let result = download_plugin(&app, &job).await;
            let persisted = service.change(|s| {
                if let Some(current) = s.saved.jobs.iter_mut().find(|j| j.id == job.id) {
                    match result {
                        Ok((status, token, permissions)) => {
                            current.status = status;
                            current.token = token;
                            current.permissions = permissions;
                        }
                        Err(error) => {
                            current.status = "failed".into();
                            current.error = Some(error);
                        }
                    }
                }
            });
            if let Err(error) = persisted {
                if let Ok(mut s) = service.state.lock() {
                    if let Some(current) = s.saved.jobs.iter_mut().find(|j| j.id == job.id) {
                        current.status = "failed".into();
                        current.error = Some(error);
                    }
                    s.working = false;
                }
                emit(&app);
                break;
            }
            emit(&app);
        }
    });
}
async fn resume(app: &tauri::AppHandle) -> Res<Value> {
    let d = dirs(app)?;
    let service = app.state::<Maintenance>();
    {
        let mut s = service.state.lock().map_err(err)?;
        if s.resumed {
            drop(s);
            return service.snapshot();
        }
        s.resumed = true;
    }
    let jobs = service.state.lock().map_err(err)?.saved.jobs.clone();
    // Apply verified plugin updates before mounting any workspace or starting feature processes.
    for job in jobs.iter().filter(|job| job.status == "staged") {
        let result = async {
            let entry = d.find(&format!("user:{}", job.id))?;
            let old = d.describe(&entry);
            if !job
                .target
                .as_ref()
                .is_some_and(|target| same_source(&old, target))
            {
                return Err("Installed plugin changed; check for updates again".into());
            }
            let mut grants: Vec<String> =
                serde_json::from_value(old["granted"].clone()).map_err(err)?;
            grants.extend(
                job.approved
                    .iter()
                    .filter(|p| !grants.contains(p))
                    .cloned()
                    .collect::<Vec<_>>(),
            );
            let installed =
                plugin_catalog::dispatch(&d, "pluginConfirmInstall", &[json!(job.token)]).await?;
            plugins::dispatch(
                &d,
                "pluginSetState",
                &[
                    installed["key"].clone(),
                    json!({"enabled":old["enabled"],"granted":grants}),
                ],
            )
            .await?;
            Ok::<_, String>(())
        }
        .await;
        service.change(|s| {
            if let Some(current) = s.saved.jobs.iter_mut().find(|j| j.id == job.id) {
                match result {
                    Ok(()) => {
                        current.status = "installed".into();
                        current.token = None;
                    }
                    Err(error) => {
                        current.status = "failed".into();
                        current.error = Some(error);
                    }
                }
            }
        })?;
    }
    start_worker(app.clone());
    service.snapshot()
}
fn enqueue(app: &tauri::AppHandle, id: &str, update: bool) -> Res<Value> {
    let service = app.state::<Maintenance>();
    let job = if update {
        let s = service.state.lock().map_err(err)?;
        let target = s
            .updates
            .iter()
            .find(|p| p["id"].as_str() == Some(id))
            .ok_or("Check for updates first")?;
        let target: plugin_catalog::CatalogPlugin =
            serde_json::from_value(target["release"].clone()).map_err(err)?;
        Job {
            id: id.into(),
            name: target.name.clone(),
            kind: "update".into(),
            status: "queued".into(),
            error: None,
            permissions: vec![],
            approved: vec![],
            token: None,
            target: Some(target),
        }
    } else {
        let p = plugins::defaults()?
            .into_iter()
            .find(|p| p.plugin.id == id)
            .ok_or("Unknown plugin")?;
        Job {
            id: id.into(),
            name: p.plugin.name,
            kind: "install".into(),
            status: "queued".into(),
            error: None,
            permissions: p.permissions,
            approved: vec![],
            token: None,
            target: None,
        }
    };
    service.change(|s| {
        if let Some(previous) = s.saved.jobs.iter_mut().find(|j| j.id == id) {
            if ["queued", "downloading", "staged", "review"].contains(&previous.status.as_str()) {
                return;
            }
            *previous = job;
        } else {
            s.saved.jobs.push(job)
        }
    })?;
    start_worker(app.clone());
    emit(app);
    service.snapshot()
}
async fn check(app: &tauri::AppHandle) -> Res<Value> {
    let service = app.state::<Maintenance>();
    let d = dirs(app)?;
    {
        let mut s = service.state.lock().map_err(err)?;
        if s.checking {
            drop(s);
            return service.snapshot();
        }
        s.checking = true;
        s.errors.clear();
    }
    emit(app);
    let catalog = plugin_catalog::dispatch(&d, "pluginCatalog", &[]).await;
    let mut updates = vec![];
    let mut errors = vec![];
    match catalog {
        Ok(c) => {
            if let Some(warning) = c["warning"].as_str() {
                errors.push(warning.into());
            }
            let installed = d.discover(env!("CARGO_PKG_VERSION"));
            for p in c["plugins"].as_array().into_iter().flatten() {
                if let Ok(release) =
                    serde_json::from_value::<plugin_catalog::CatalogPlugin>(p.clone())
                {
                    if let Some(entry) = installed
                        .iter()
                        .find(|e| e.key == format!("user:{}", release.id))
                    {
                        let current = d.describe(entry);
                        if same_source(&current, &release) {
                            updates.push(json!({"id":release.id,"name":release.name,"currentVersion":current["manifest"]["version"],"version":release.version,"release":release}));
                        }
                    }
                }
            }
        }
        Err(error) => errors.push(error),
    }
    let ide_result = match check_ide(app).await {
        Ok(value) => Ok(value),
        Err(error) if signed_updater_available() => {
            errors.push(error);
            check_release(app).await
        }
        Err(error) => Err(error),
    };
    service.change(|s| {
        s.checking = false;
        s.checked_at = Some(now());
        s.updates = updates;
        s.errors = errors;
        match ide_result {
            Ok((ide, signed)) => {
                if !matches!(
                    s.ide_progress["status"].as_str(),
                    Some("downloading" | "ready" | "installed")
                ) {
                    s.ide = ide;
                    s.signed = signed;
                }
            }
            Err(error) => s.errors.push(error),
        }
    })?;
    let (auto_plugins, auto_ide, ids) = {
        let s = service.state.lock().map_err(err)?;
        (
            s.saved.preferences.auto_update_plugins,
            s.saved.preferences.auto_update_ide,
            s.updates
                .iter()
                .filter_map(|p| p["id"].as_str().map(String::from))
                .collect::<Vec<_>>(),
        )
    };
    if auto_plugins {
        for id in ids {
            let _ = enqueue(app, &id, true);
        }
    }
    if auto_ide {
        let _ = prepare_ide(app);
    }
    emit(app);
    service.snapshot()
}
async fn check_ide(
    app: &tauri::AppHandle,
) -> Res<(Option<Value>, Option<tauri_plugin_updater::Update>)> {
    if let Some(key) = signing_key().filter(|_| signed_updater_available()) {
        let update = app
            .updater_builder()
            .pubkey(key)
            .endpoints(vec![UPDATE_ENDPOINT.parse().map_err(err)?])
            .map_err(err)?
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(err)?
            .check()
            .await
            .map_err(err)?;
        if let Some(update) = update {
            if update.download_url.scheme() != "https" {
                return Err("Update download must use HTTPS".into());
            }
            return Ok((
                Some(json!({"version":update.version,"notes":update.body,"signed":true})),
                Some(update),
            ));
        }
        return Ok((None, None));
    }
    check_release(app).await
}
async fn check_release(
    app: &tauri::AppHandle,
) -> Res<(Option<Value>, Option<tauri_plugin_updater::Update>)> {
    let d = dirs(app)?;
    let text = crate::process::run(
        &d.root,
        "curl",
        &[
            "-q",
            "-sS",
            "-L",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--max-time",
            "15",
            "--max-filesize",
            "1048576",
            "-H",
            "Accept: application/vnd.github+json",
            "-w",
            "\n%{http_code}",
            RELEASES,
        ]
        .map(str::to_owned),
        None,
    )
    .await?;
    let Some(release) = published_release(&text)? else {
        return Ok((None, None));
    };
    let version = release["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v');
    if release["draft"] == true
        || release["prerelease"] == true
        || !newer(version, env!("CARGO_PKG_VERSION"))
    {
        return Ok((None, None));
    }
    Ok((
        Some(json!({"version":version,"notes":release["body"],"signed":false})),
        None,
    ))
}
fn prepare_ide(app: &tauri::AppHandle) -> Res<()> {
    let service = app.state::<Maintenance>();
    let update = {
        let mut s = service.state.lock().map_err(err)?;
        if matches!(
            s.ide_progress["status"].as_str(),
            Some("downloading" | "ready" | "installed")
        ) {
            return Ok(());
        }
        let mut update = s
            .signed
            .clone()
            .ok_or("This build has no signed updater. Download the release installer instead.")?;
        update.timeout = Some(Duration::from_secs(300));
        s.ide_progress = json!({"status":"downloading","bytes":0});
        update
    };
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut downloaded = 0u64;
        let result = update
            .download(
                |chunk, total| {
                    downloaded += chunk as u64;
                    let service = handle.state::<Maintenance>();
                    if let Ok(mut s) = service.state.lock() {
                        s.ide_progress =
                            json!({"status":"downloading","bytes":downloaded,"total":total});
                    }
                    emit(&handle);
                },
                || {},
            )
            .await;
        let service = handle.state::<Maintenance>();
        if let Ok(mut s) = service.state.lock() {
            match result {
                Ok(bytes) => {
                    s.bytes = Some(bytes);
                    s.ide_progress = json!({"status":"ready"});
                }
                Err(error) => s.ide_progress = json!({"status":"failed","error":error.to_string()}),
            }
        }
        emit(&handle);
    });
    emit(app);
    Ok(())
}
fn install_ready_ide(service: &Maintenance, restart: bool) -> Res<()> {
    let (update, bytes) = {
        let mut s = service.state.lock().map_err(err)?;
        (
            s.signed.clone().ok_or("No signed update")?,
            s.bytes.take().ok_or("Download update first")?,
        )
    };
    if let Err(error) = service.note_pending_update(&update.version) {
        service.state.lock().map_err(err)?.bytes = Some(bytes);
        return Err(error);
    }
    if let Err(error) = update.restart_after_install(restart).install(&bytes) {
        service.state.lock().map_err(err)?.bytes = Some(bytes);
        return Err(err(error));
    }
    service.state.lock().map_err(err)?.ide_progress = json!({"status":"installed"});
    Ok(())
}
pub async fn dispatch(app: &tauri::AppHandle, method: &str, args: &[Value]) -> Res<Value> {
    let service = app.state::<Maintenance>();
    let id = || {
        args.first()
            .and_then(Value::as_str)
            .ok_or("Invalid plugin id")
    };
    match method {
        "appMaintenanceState" => service.snapshot(),
        "appMaintenanceResume" => resume(app).await,
        "appSetupComplete" => {
            service.change(|s| s.saved.preferences.setup_complete = true)?;
            service.snapshot()
        }
        "appMaintenancePreferences" => {
            let value = args.first().ok_or("Missing preferences")?;
            let preferences = preferences_patch(
                &service.state.lock().map_err(err)?.saved.preferences,
                value,
                signed_updater_available(),
            )?;
            service.change(|s| s.saved.preferences = preferences)?;
            emit(app);
            service.snapshot()
        }
        "appQueuePlugin" => enqueue(app, id()?, false),
        "appQueuePluginUpdate" => enqueue(app, id()?, true),
        "appApprovePluginUpdate" => {
            let id = id()?;
            service.change(|s| {
                if let Some(job) = s
                    .saved
                    .jobs
                    .iter_mut()
                    .find(|j| j.id == id && j.status == "review")
                {
                    job.approved = job.permissions.clone();
                    job.status = "queued".into();
                }
            })?;
            start_worker(app.clone());
            service.snapshot()
        }
        "appCheckUpdates" => check(app).await,
        "appPrepareIdeUpdate" => {
            prepare_ide(app)?;
            service.snapshot()
        }
        "appRestart" => app.restart(),
        "appInstallIdeUpdate" => {
            let _install = service.ide_install.lock().await;
            install_ready_ide(&service, true)?;
            emit(app);
            service.snapshot()
        }
        "appApplyIdeOnExit" => {
            let _install = service.ide_install.lock().await;
            let apply = {
                let s = service.state.lock().map_err(err)?;
                s.saved.preferences.auto_update_ide && s.bytes.is_some()
            };
            if apply {
                install_ready_ide(
                    &service,
                    args.first().and_then(Value::as_bool).unwrap_or(false),
                )?;
                emit(app);
            }
            Ok(Value::Null)
        }
        "appCloseWindow" => {
            app.get_webview_window("main")
                .ok_or("Missing main window")?
                .destroy()
                .map_err(err)?;
            Ok(Value::Null)
        }
        "appOpenReleases" => {
            #[cfg(target_os = "macos")]
            let mut command = std::process::Command::new("open");
            #[cfg(target_os = "linux")]
            let mut command = std::process::Command::new("xdg-open");
            #[cfg(target_os = "windows")]
            let mut command = {
                let mut c = std::process::Command::new("cmd");
                c.args(["/C", "start", ""]);
                c
            };
            command.arg(RELEASE_PAGE).spawn().map_err(err)?;
            Ok(Value::Null)
        }
        _ => Err("Unknown application maintenance command".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updater_configuration_initializes_without_a_private_key_and_binds_signed_versions() {
        let app: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let config: tauri_plugin_updater::Config =
            serde_json::from_value(app["plugins"]["updater"].clone()).unwrap();
        assert!(config.require_signed_version);
        assert!(!config.allow_downgrades);
        assert!(!config.dangerous_insecure_transport_protocol);
    }
    #[test]
    fn failed_preference_write_does_not_change_the_live_automation_policy() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path().join("profile");
        let service = Maintenance::open(config.clone(), Launch::Continue).unwrap();
        fs::rename(&config, temp.path().join("backup")).unwrap();
        fs::write(&config, "blocked").unwrap();
        assert!(service
            .change(|s| s.saved.preferences.auto_update_plugins = true)
            .is_err());
        assert_eq!(
            service.snapshot().unwrap()["preferences"]["autoUpdatePlugins"],
            false
        );
    }
    #[test]
    fn first_run_and_upgrade_keep_auto_updates_off() {
        let temp = tempfile::tempdir().unwrap();
        let m = Maintenance::open(temp.path().into(), Launch::Continue).unwrap();
        let s = m.snapshot().unwrap();
        assert_eq!(s["preferences"]["setupComplete"], false);
        assert_eq!(s["preferences"]["autoUpdatePlugins"], false);
        assert_eq!(s["preferences"]["autoUpdateIde"], false);
        assert_eq!(s["preferences"]["checkUpdates"], true);
        m.change(|s| s.saved.preferences.setup_complete = true)
            .unwrap();
        assert_eq!(
            Maintenance::open(temp.path().into(), Launch::Continue)
                .unwrap()
                .snapshot()
                .unwrap()["preferences"]["setupComplete"],
            true
        );
        let migrated = tempfile::tempdir().unwrap();
        fs::write(migrated.path().join("recent-projects.json"), "[]").unwrap();
        assert_eq!(
            Maintenance::open(migrated.path().into(), Launch::Continue)
                .unwrap()
                .snapshot()
                .unwrap()["preferences"]["setupComplete"],
            true
        );
        fs::write(
            migrated.path().join("app-preferences.json"),
            serde_json::to_vec(&json!({
                "preferences": {"setupComplete": true, "autoUpdatePlugins": false, "autoUpdateIde": false, "checkUpdates": true},
                "jobs": []
            }))
            .unwrap(),
        )
        .unwrap();
        let reinstalled = Maintenance::open(migrated.path().into(), Launch::Reinstall)
            .unwrap()
            .snapshot()
            .unwrap();
        assert_eq!(reinstalled["preferences"]["setupComplete"], false);
        assert_eq!(reinstalled["preferences"]["autoUpdatePlugins"], false);
        assert_eq!(reinstalled["preferences"]["autoUpdateIde"], false);
    }
    #[test]
    fn interrupted_downloads_resume_without_regranting_permissions() {
        let temp = tempfile::tempdir().unwrap();
        let m = Maintenance::open(temp.path().into(), Launch::Continue).unwrap();
        m.change(|s| {
            s.saved.jobs.push(Job {
                id: "acme.example".into(),
                name: "Example".into(),
                kind: "update".into(),
                status: "downloading".into(),
                error: None,
                permissions: vec!["process".into()],
                approved: vec![],
                token: None,
                target: None,
            })
        })
        .unwrap();
        let m = Maintenance::open(temp.path().into(), Launch::Continue).unwrap();
        assert_eq!(m.snapshot().unwrap()["jobs"][0]["status"], "queued");
        assert_eq!(m.snapshot().unwrap()["jobs"][0]["approved"], json!([]));
        assert_eq!(
            permission_growth(
                &["project.read".into()],
                &["project.read".into(), "process".into()]
            ),
            vec!["process"]
        );
    }
    #[test]
    fn missing_stable_release_is_not_an_update_error() {
        let missing = "{\n  \"message\": \"Not Found\",\n  \"status\": \"404\"\n}\n404";
        assert!(published_release(missing).unwrap().is_none());
        let stable = "{\"tag_name\":\"v9.0.0\",\"draft\":false,\"prerelease\":false,\"body\":\"notes\"}\n200";
        assert_eq!(
            published_release(stable).unwrap().unwrap()["tag_name"],
            "v9.0.0"
        );
        assert!(published_release("unavailable\n500").is_err());
    }
    #[test]
    fn updates_require_same_origin_and_newer_compatible_version() {
        let mut release = plugins::defaults().unwrap().remove(0).plugin;
        release.version = "1.2.0".into();
        release.min_ide_version = "0.0.1".into();
        let mut current = json!({"scope":"user","manifest":{"version":"1.1.0"},"origin":{"repository":release.repository}});
        assert!(same_source(&current, &release));
        current["origin"]["repository"] = json!("https://example.invalid/other");
        assert!(!same_source(&current, &release));
        current["origin"]["repository"] = json!(release.repository);
        current["scope"] = json!("project");
        assert!(!same_source(&current, &release));
        assert!(!newer("1.1.0", "1.2.0"));
    }
    #[test]
    fn disabling_checks_disables_automation_and_unsigned_builds_cannot_opt_in() {
        let preferences = preferences_patch(
            &Preferences::fresh(),
            &json!({"autoUpdatePlugins":true}),
            false,
        )
        .unwrap();
        assert!(preferences.auto_update_plugins && preferences.check_updates);
        let preferences =
            preferences_patch(&preferences, &json!({"checkUpdates":false}), false).unwrap();
        assert!(
            !preferences.auto_update_plugins
                && !preferences.auto_update_ide
                && !preferences.check_updates
        );
        assert!(preferences_patch(&preferences, &json!({"autoUpdateIde":true}), false).is_err());
    }
    #[test]
    fn corrupt_preferences_are_preserved_without_enabling_automation() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("app-preferences.json"), "not-json").unwrap();
        let m = Maintenance::open(temp.path().into(), Launch::Continue).unwrap();
        let state = m.snapshot().unwrap();
        assert_eq!(state["preferences"]["autoUpdatePlugins"], false);
        assert_eq!(state["errors"].as_array().unwrap().len(), 1);
        assert!(fs::read_dir(temp.path()).unwrap().any(|p| p
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("app-preferences.invalid-")));
    }
    #[tokio::test]
    async fn install_consent_does_not_undo_a_later_user_decision() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("plugin.json"),serde_json::to_vec(&json!({"id":"acme.choice","name":"Choice","version":"1.0.0","minIdeVersion":"0.0.1","main":"main.js","permissions":["process"]})).unwrap()).unwrap();
        fs::write(source.join("main.js"), "export default {};").unwrap();
        let dirs = plugins::Dirs::new(&temp.path().join("config"), temp.path());
        let entry = plugins::install(&dirs, &source, env!("CARGO_PKG_VERSION")).unwrap();
        approve_first_install(&dirs, &entry, &["process".into()])
            .await
            .unwrap();
        let accepted = dirs.describe(&entry);
        assert_eq!(accepted["granted"], json!(["process"]));
        assert_eq!(accepted["consented"], true);
        assert_eq!(accepted["needsConsent"], false);
        plugins::dispatch(
            &dirs,
            "pluginSetState",
            &[json!(entry.key), json!({"enabled":false,"granted":[]})],
        )
        .await
        .unwrap();
        approve_first_install(&dirs, &entry, &["process".into()])
            .await
            .unwrap();
        let state = dirs.describe(&entry);
        assert_eq!(state["enabled"], false);
        assert_eq!(state["granted"], json!([]));
    }
}
