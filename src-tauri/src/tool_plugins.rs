//! Installed native tools. The core owns authorization/lifecycle, not tool protocols.
use crate::{
    plugins::{Dirs, ToolManifest},
    rpc::Rpc,
    workspace::{err, hash, Res},
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};

pub fn platform() -> String {
    format!("{}-{}", std::env::consts::ARCH, std::env::consts::OS)
}
fn relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() < 240
        && !path.contains(['\\', '\0'])
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}
fn asset(dir: &Path, path: &str, limit: u64) -> Res<PathBuf> {
    if !relative(path) {
        return Err("Invalid tool asset path".into());
    }
    let root = dir.canonicalize().map_err(err)?;
    let target = root.join(path).canonicalize().map_err(err)?;
    let meta = std::fs::metadata(&target).map_err(err)?;
    if !target.starts_with(root) || !meta.is_file() || meta.len() > limit {
        return Err("Invalid or oversized tool asset".into());
    }
    Ok(target)
}
pub fn feature(method:&str)->Option<&'static str>{
 if method.starts_with("git"){Some("phpforge.git")}else if method.starts_with("terminal")||method=="dockerTerminal"{Some("phpforge.terminal")}else if method.starts_with("docker"){Some("phpforge.docker-services")}else if method.starts_with("agent"){Some("phpforge.agents")}else if method.starts_with("database"){Some("phpforge.database")}else if method.starts_with("language")||method=="searchSymbols"{Some("phpforge.php-intelligence")}else{None}
}
pub fn require_feature(dirs:&Dirs,id:&str)->Res<()> {
 let entry=dirs.discover(env!("CARGO_PKG_VERSION")).into_iter().find(|entry|entry.manifest.as_ref().is_ok_and(|m|m.id==id)).ok_or_else(||format!("Install and enable {id} in Plugins"))?;
 dirs.allowed(&entry.key,"workbench")?;
 if dirs.describe(&entry)["needsConsent"]==true{return Err(format!("Review permissions for {id} in Plugins"))}
 let m=entry.manifest.as_ref().map_err(Clone::clone)?;
 for permission in &m.permissions{dirs.allowed(&entry.key,permission)?;}Ok(())
}
pub fn service_permission(method:&str)->Option<&'static str>{
 match method {
  "agentCancel"=>Some("process"),
  "agentDiscard"=>Some("process"),
  "agentKeep"=>Some("process"),
  "agentMode"=>Some("process"),
  "agentPermission"=>Some("process"),
  "agentPrompt"=>Some("process"),
  "agentReset"=>Some("process"),
  "agentStart"=>Some("process"),
  "agents"=>Some("process"),
  "composerCancel"=>Some("project.read"),
  "composerProbe"=>Some("project.read"),
  "composerRun"=>Some("project.read"),
  "composerSearch"=>Some("project.read"),
  "composerVersions"=>Some("project.read"),
  "database"=>Some("network"),
  "databaseCancel"=>Some("network"),
  "databaseCompletionContext"=>Some("network"),
  "databaseCompletionPage"=>Some("network"),
  "databaseConnect"=>Some("network"),
  "databaseDdl"=>Some("network"),
  "databaseDdlData"=>Some("network"),
  "databaseDisconnect"=>Some("network"),
  "databaseExecute"=>Some("network"),
  "databaseForgetPassword"=>Some("network"),
  "databaseImportLaravel"=>Some("network"),
  "databaseLaravelFiles"=>Some("network"),
  "databaseModel"=>Some("network"),
  "databasePage"=>Some("network"),
  "databasePasswordStored"=>Some("network"),
  "databasePickFile"=>Some("network"),
  "databaseRedisEdit"=>Some("network"),
  "databaseSaveSources"=>Some("network"),
  "databaseSources"=>Some("network"),
  "databaseTables"=>Some("network"),
  "dockerCancel"=>Some("process"),
  "dockerCompose"=>Some("process"),
  "dockerComposeFiles"=>Some("process"),
  "dockerContainerAction"=>Some("process"),
  "dockerContexts"=>Some("process"),
  "dockerLogs"=>Some("process"),
  "dockerPull"=>Some("process"),
  "dockerSnapshot"=>Some("process"),
  "dockerTerminal"=>Some("process"),
  "fileCopy"=>Some("project.write"),
  "fileCreate"=>Some("project.write"),
  "fileDelete"=>Some("project.write"),
  "fileExists"=>Some("project.read"),
  "fileHistory"=>Some("project.read"),
  "fileHistoryContent"=>Some("project.read"),
  "fileHistoryRestore"=>Some("project.write"),
  "fileMove"=>Some("project.write"),
  "fileOpenDefault"=>Some("project.read"),
  "fileRename"=>Some("project.write"),
  "fileReveal"=>Some("project.read"),
  "fileSearch"=>Some("project.read"),
  "formatDocument"=>Some("project.read"),
  "gitAccount"=>Some("process"),
  "gitApplyHunk"=>Some("process"),
  "gitBranches"=>Some("process"),
  "gitCommit"=>Some("process"),
  "gitCommitMessage"=>Some("process"),
  "gitConflict"=>Some("process"),
  "gitDiff"=>Some("process"),
  "gitEditorBase"=>Some("process"),
  "gitHistory"=>Some("process"),
  "gitHistoryDiff"=>Some("process"),
  "gitHunks"=>Some("process"),
  "gitIgnored"=>Some("process"),
  "gitLineInfo"=>Some("process"),
  "gitLog"=>Some("process"),
  "gitOperation"=>Some("process"),
  "gitResolve"=>Some("process"),
  "gitResolveSide"=>Some("process"),
  "gitSaveAccount"=>Some("process"),
  "gitStage"=>Some("process"),
  "gitStatus"=>Some("process"),
  "gitTestAccount"=>Some("process"),
  "gitTools"=>Some("process"),
  "language"=>Some("project.read"),
  "languageApply"=>Some("project.write"),
  "languageStub"=>Some("process"),
  "listFiles"=>Some("project.read"),
  "onComposerProgress"=>Some("workbench"),
  "onDockerProgress"=>Some("workbench"),
  "onEvent"=>Some("workbench"),
  "onTerminalEvent"=>Some("workbench"),
  "phpMethodFamily"=>Some("process"),
  "phpMethodRename"=>Some("process"),
  "phpMethodUsages"=>Some("process"),
  "read"=>Some("project.read"),
  "readImage"=>Some("project.read"),
  "save"=>Some("project.write"),
  "searchSymbols"=>Some("process"),
  "terminalAck"=>Some("process"),
  "terminalClose"=>Some("process"),
  "terminalCreate"=>Some("process"),
  "terminalResize"=>Some("process"),
  "terminalWrite"=>Some("process"),
  "testCancel"=>Some("project.read"),
  "testRun"=>Some("project.read"),
  "tree"=>Some("project.read"),
  "workspace"=>Some("workbench"),
  _=>None,
 }
}
pub fn validate_workbench(workbench:&crate::plugins::WorkbenchManifest,dir:&Path)->Res<()> {
 if workbench.services.len()>128 || workbench.services.iter().any(|name|service_permission(name).is_none()){return Err("Unknown workbench service".into())}
 if workbench.api_version!=1 {return Err("Unsupported workbench API".into())}
 asset(dir,&workbench.main,8*1024*1024)?;asset(dir,&workbench.style,512*1024)?;Ok(())
}
pub fn authorize_service(dirs:&Dirs,key:&str,method:&str)->Res<Value>{
 let entry=dirs.allowed(key,"workbench")?;
 if dirs.describe(&entry)["needsConsent"]==true{return Err("Review plugin permissions before activation".into())}
 let manifest=entry.manifest.as_ref().map_err(Clone::clone)?;
 let wb=manifest.workbench.as_ref().ok_or("No standalone workbench entry")?;
 if !["read","readImage","language","workspace"].contains(&method)&&!wb.services.iter().any(|s|s==method){return Err("Undeclared workbench service".into())}
 let permission=service_permission(method).ok_or("Unknown workbench service")?;
 dirs.allowed(key,permission)?;Ok(Value::Null)
}
pub fn workbench_source(dirs:&Dirs,key:&str)->Res<Value>{
 let entry=dirs.allowed(key,"workbench")?;
 if dirs.describe(&entry)["needsConsent"]==true{return Err("Review plugin permissions before activation".into())}
 let manifest=entry.manifest.as_ref().map_err(Clone::clone)?;
 let wb=manifest.workbench.as_ref().ok_or("Plugin has no standalone workbench entry")?;
 validate_workbench(wb,&entry.dir)?;
 for method in &wb.services {dirs.allowed(key,service_permission(method).ok_or("Unknown workbench service")?)?;}
 Ok(json!({"key":key,"manifest":manifest,"code":std::fs::read_to_string(asset(&entry.dir,&wb.main,8*1024*1024)?).map_err(err)?,"style":std::fs::read_to_string(asset(&entry.dir,&wb.style,512*1024)?).map_err(err)?}))
}
pub fn validate(tool: &ToolManifest, dir: &Path) -> Res<()> {
    if tool.protocol_version != 1
        || tool.methods.is_empty()
        || tool.methods.len() > 64
        || tool
            .methods
            .iter()
            .any(|m| m.len() > 80 || m.is_empty() || !m.bytes().all(|b| b.is_ascii_alphanumeric()))
    {
        return Err("Unsupported tool protocol or methods".into());
    }
    if tool
        .methods
        .iter()
        .collect::<std::collections::HashSet<_>>()
        .len()
        != tool.methods.len()
    {
        return Err("Duplicate tool methods".into());
    }
    if [
        "project-changed",
        "event",
        "terminal-event",
        "plugin-tool-event",
    ]
    .contains(&tool.event.as_str())
    {
        return Err("Reserved host event".into());
    }
    if tool.event.len() > 80
        || tool.event.is_empty()
        || !tool
            .event
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid tool event".into());
    }
    asset(dir, &tool.workbench, 2 * 1024 * 1024)?;
    asset(dir, &tool.style, 512 * 1024)?;
    if tool.binaries.is_empty() || tool.binaries.len() > 8 {
        return Err("Tool package has no supported binaries".into());
    }
    for binary in tool.binaries.values() {
        if !relative(&binary.path)
            || binary.sha256.len() != 64
            || !binary.sha256.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Err("Invalid native tool checksum/path".into());
        }
    }
    Ok(())
}
fn authorized(dirs: &Dirs, key: &str) -> Res<(crate::plugins::Entry, ToolManifest)> {
    let entry = dirs.allowed(key, "native.tool")?;
    dirs.allowed(key, "workbench")?;
    if dirs.describe(&entry)["needsConsent"] == true {
        return Err("Review plugin permissions before starting its tool".into());
    }
    let tool = entry
        .manifest
        .as_ref()
        .map_err(Clone::clone)?
        .tool
        .clone()
        .ok_or("Plugin does not provide a native tool")?;
    Ok((entry, tool))
}
fn executable(dir: &Path, tool: &ToolManifest) -> Res<PathBuf> {
    let binary = tool.binaries.get(&platform()).ok_or_else(|| {
        format!(
            "Plugin has no binary for {}. Update the plugin or choose a supported platform.",
            platform()
        )
    })?;
    let path = asset(dir, &binary.path, 16 * 1024 * 1024)?;
    if hash(std::fs::read(&path).map_err(err)?) != binary.sha256 {
        return Err("Native plugin checksum mismatch. Reinstall the package.".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(&path).map_err(err)?.permissions();
        permissions.set_mode(0o700);
        std::fs::set_permissions(&path, permissions).map_err(err)?;
    }
    Ok(path)
}
pub fn source(dirs: &Dirs, key: &str) -> Res<Value> {
    let (entry, tool) = authorized(dirs, key)?;
    executable(&entry.dir, &tool)?;
    Ok(
        json!({"key":key,"manifest":entry.manifest.as_ref().map_err(Clone::clone)?,"code":std::fs::read_to_string(asset(&entry.dir,&tool.workbench,2*1024*1024)?).map_err(err)?,"style":std::fs::read_to_string(asset(&entry.dir,&tool.style,512*1024)?).map_err(err)?}),
    )
}
pub fn provider(dirs: &Dirs, method: &str) -> Res<Option<String>> {
    let matches: Vec<_> = dirs
        .discover(env!("CARGO_PKG_VERSION"))
        .into_iter()
        .filter(|e| {
            e.manifest
                .as_ref()
                .ok()
                .and_then(|m| m.tool.as_ref())
                .is_some_and(|t| t.methods.iter().any(|m| m == method))
        })
        .collect();
    if matches.len() > 1 {
        return Err(format!(
            "Multiple installed plugins provide {method}; disable or remove the duplicate provider"
        ));
    }
    Ok(matches.first().map(|e| e.key.clone()))
}
struct Running {
    key: String,
    rpc: Arc<Rpc>,
    fingerprint: String,
    active: Arc<AtomicBool>,
    initialized: tokio::sync::OnceCell<()>,
}
#[derive(Default)]
pub struct Host {
    running: tokio::sync::Mutex<HashMap<String, Arc<Running>>>,
    revoked: Mutex<Vec<std::sync::Weak<Running>>>,
}
impl Host {
    pub fn stop(&self, key: &str) {
        if let Ok(mut handles) = self.revoked.lock() {
            handles.retain(|weak| {
                if let Some(p) = weak.upgrade() {
                    if p.key == key {
                        p.active.store(false, Ordering::Release);
                        p.rpc.stop();
                        return false;
                    }
                    true
                } else {
                    false
                }
            });
        }
    }
    pub fn stop_all(&self) {
        if let Ok(mut handles) = self.revoked.lock() {
            for weak in handles.drain(..) {
                if let Some(p) = weak.upgrade() {
                    p.active.store(false, Ordering::Release);
                    p.rpc.stop();
                }
            }
        }
    }
    pub async fn call(
        &self,
        dirs: &Dirs,
        key: &str,
        method: &str,
        args: &[Value],
        app: &tauri::AppHandle,
        docker: &str,
    ) -> Res<Value> {
        let state = app.state::<crate::Backend>();
        let project = state.project.read().await;
        if project.root != dirs.root {
            return Err("Project scope changed".into());
        }
        let (entry, tool) = authorized(dirs, key)?;
        if !tool.methods.iter().any(|m| m == method) {
            return Err("Operation not declared by this plugin".into());
        }
        if serde_json::to_vec(args).map_err(err)?.len() > 2 * 1024 * 1024 {
            return Err("Tool request too large".into());
        }
        let binary = executable(&entry.dir, &tool)?;
        let fingerprint = hash(format!(
            "{}:{}:{}",
            dirs.root.display(),
            entry.dir.display(),
            serde_json::to_string(entry.manifest.as_ref().map_err(Clone::clone)?).map_err(err)?
        ));
        let process = {
            let mut map = self.running.lock().await;
            if map
                .get(key)
                .is_some_and(|p| p.fingerprint != fingerprint || !p.active.load(Ordering::Acquire))
            {
                if let Some(p) = map.remove(key) {
                    p.active.store(false, Ordering::Release);
                    p.rpc.stop();
                }
            }
            if let Some(p) = map.get(key) {
                p.clone()
            } else {
                let active = Arc::new(AtomicBool::new(true));
                let current = active.clone();
                let events = app.clone();
                let channel = tool.event.clone();
                let plugin = key.to_owned();
                let root = dirs.root.to_string_lossy().to_string();
                let owner = root.clone();
                let notify = Arc::new(move |message: Value| {
                    if current.load(Ordering::Acquire) && message["method"] == "tool/event" {
                        let _=events.emit("plugin-tool-event",json!({"key":plugin,"root":owner,"channel":channel,"payload":message["params"]}));
                        // Compatibility event is emitted only for the current owned provider generation.
                        let _ = events.emit(&channel, &message["params"]);
                    }
                });
                let rpc = Rpc::spawn_tool(
                    binary.to_str().ok_or("Invalid executable encoding")?,
                    &[root, docker.into()],
                    &dirs.root,
                    notify,
                )?;
                let p = Arc::new(Running {
                    key: key.into(),
                    rpc,
                    fingerprint,
                    active,
                    initialized: tokio::sync::OnceCell::new(),
                });
                self.revoked.lock().map_err(err)?.push(Arc::downgrade(&p));
                map.insert(key.into(), p.clone());
                p
            }
        };
        drop(project);
        process
            .initialized
            .get_or_try_init(|| async {
                let hello = process.rpc.request("initialize", json!({}), 5).await?;
                if hello["protocolVersion"] != 1 {
                    process.rpc.stop();
                    return Err("Unsupported native tool protocol".to_owned());
                }
                Ok(())
            })
            .await?;
        let result = process
            .rpc
            .request(method, json!({"args":args}), 1900)
            .await;
        if !process.active.load(Ordering::Acquire) {
            process.rpc.stop();
            return Err("Plugin stopped or permissions changed".into());
        }
        if authorized(dirs, key).is_err() {
            process.active.store(false, Ordering::Release);
            process.rpc.stop();
            return Err("Plugin authorization was revoked".into());
        }
        result
    }
}
impl Drop for Host {
    fn drop(&mut self) {
        self.stop_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_and_platform() {
        assert!(!relative("../tool"));
        assert!(!relative("/tmp/tool"));
        assert!(!relative("bin/../tool"));
        assert!(relative("bin/arm64/tool"));
        assert!(platform().contains('-'));
    }
    #[test]
    fn standalone_workbench_is_confined_without_native_binary() {
        let temp=tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("ui.js"),"export{};").unwrap();
        std::fs::write(temp.path().join("ui.css"),"").unwrap();
        let mut wb=crate::plugins::WorkbenchManifest{api_version:1,main:"ui.js".into(),style:"ui.css".into(),services:vec![]};
        validate_workbench(&wb,temp.path()).unwrap();
        wb.main="../ui.js".into();assert!(validate_workbench(&wb,temp.path()).is_err());
        wb.main="ui.js".into();wb.api_version=2;assert!(validate_workbench(&wb,temp.path()).is_err());
    }
    #[test]
    fn binary_checksum_and_escape() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("ui.js"), "export{};").unwrap();
        std::fs::write(temp.path().join("ui.css"), "").unwrap();
        std::fs::write(temp.path().join("tool"), "native").unwrap();
        let mut t:ToolManifest=serde_json::from_value(json!({"protocolVersion":1,"methods":["fixtureRun"],"event":"fixture-progress","workbench":"ui.js","style":"ui.css","binaries":{platform():{"path":"tool","sha256":hash("native")}}})).unwrap();
        validate(&t, temp.path()).unwrap();
        executable(temp.path(), &t).unwrap();
        std::fs::write(temp.path().join("tool"), "changed").unwrap();
        assert!(executable(temp.path(), &t)
            .unwrap_err()
            .contains("checksum"));
        t.workbench = "../ui.js".into();
        assert!(validate(&t, temp.path()).is_err());
    }
}
