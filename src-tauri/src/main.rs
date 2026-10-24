mod app_maintenance;
mod install_generation;
use phpforge_agents as agents;
use phpforge_database as database;
use phpforge_database::laravel_database;
use phpforge_docker_services as docker;
mod files;
use phpforge_git as git;
use phpforge_php_intelligence as language;
use phpforge_php_intelligence::php_stubs;
mod plugins;
mod tool_plugins;
mod plugin_catalog;
mod process;
mod recent;
mod rpc;
mod startup;
mod native_splash;
mod shell;
use phpforge_terminal as terminal;
mod workspace;
use notify::Watcher;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager};
use workspace::{err, Res};
impl phpforge_php_intelligence::SnapshotHistory for files::History {
 fn snapshot(&self,root:&std::path::Path,path:&std::path::Path,label:&str)->Result<usize,String>{files::History::snapshot(self,root,path,label)}
}
struct Project {
    root: PathBuf,
    git: tokio::sync::Mutex<()>,
    terminals: Mutex<terminal::Terminals>,
    database: database::Database,
    language: std::sync::Arc<tokio::sync::Mutex<language::Language>>,
    agents: agents::Agents,
    history: files::History,
    _watcher: Option<notify::RecommendedWatcher>,
}
impl Project {
    fn new(root: PathBuf, app: tauri::AppHandle) -> Self {
        let language = std::sync::Arc::new(tokio::sync::Mutex::new(language::Language::default()));
        let weak = std::sync::Arc::downgrade(&language);
        let status = app.clone();
        let pending = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mut watcher =
            notify::recommended_watcher(move |event: Result<notify::Event, notify::Error>| {
                if let Ok(event) = event {
                    for path in event.paths {
                        if !workspace::watched(&path) {
                            continue;
                        }
                        let _ = status.emit("project-changed", json!({"path":path}));
                        if path.extension().is_some_and(|v| v == "php")
                            && !pending.swap(true, std::sync::atomic::Ordering::AcqRel)
                        {
                            let language = weak.clone();
                            let pending = pending.clone();
                            tauri::async_runtime::spawn(async move {
                                tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                pending.store(false, std::sync::atomic::Ordering::Release);
                                if let Some(language) = language.upgrade() {
                                    language.lock().await.changed(&path).await;
                                }
                            });
                        }
                    }
                }
            })
            .ok();
        if let Some(w) = watcher.as_mut() {
            let _ = w.watch(&root, notify::RecursiveMode::Recursive);
        }
        let database = database::Database::new(
            std::env::var_os("PHP_IDE_STATE_DIR")
                .map(PathBuf::from)
                .or(app.path().app_config_dir().ok()),
            &root,
        );
        Self {
            database,
            history: files::History::for_project(
                std::env::var_os("PHP_IDE_STATE_DIR")
                    .map(PathBuf::from)
                    .or(app.path().app_cache_dir().ok()),
                &root,
            ),
            agents: agents::Agents::new(root.clone(), app),
            language,
            root,
            git: tokio::sync::Mutex::new(()),
            terminals: Mutex::new(terminal::Terminals::default()),
            _watcher: watcher,
        }
    }
}

struct Backend {
    project: tokio::sync::RwLock<Project>,
    tools: PathBuf,
    cache: PathBuf,
    recent: recent::Store,
    docker: docker::Docker,
    tool_plugins: tool_plugins::Host,
    active: std::sync::atomic::AtomicBool,
}
fn arg(args: &[Value], i: usize) -> &Value {
    args.get(i).unwrap_or(&Value::Null)
}
async fn release_plugin(state:&Backend,id:&str)->Res<()> {
 let project=state.project.read().await;
 match id {
  "phpforge.terminal"=>{*project.terminals.lock().map_err(err)?=terminal::Terminals::default();},
  "phpforge.agents"=>project.agents.stop(),
  "phpforge.database"=>project.database.shutdown().await,
  "phpforge.docker-services"=>state.docker.shutdown(),
  "phpforge.php-intelligence"=>{*project.language.lock().await=language::Language::default();},
  _=>{},
 }Ok(())
}
#[tauri::command]
async fn ide(
    method: String,
    args: Vec<Value>,
    state: tauri::State<'_, Backend>,
    app: tauri::AppHandle,
) -> Res<Value> {
    if method.starts_with("app") { return app_maintenance::dispatch(&app,&method,&args).await; }
    if method == "nativeSmokeDiagnostic" {
        let report=std::env::var("PHP_IDE_NATIVE_SMOKE").map_err(err)?;
        let path=PathBuf::from(report).with_extension("diagnostic.json");
        let mut sample=arg(&args,0).clone();
        if let Some(window)=app.get_webview_window("main") {
            sample["nativeWindow"]=json!({"visible":window.is_visible().ok(),"focused":window.is_focused().ok(),"minimized":window.is_minimized().ok(),"size":window.inner_size().ok().map(|size|json!({"width":size.width,"height":size.height}))});
        }
        static DIAGNOSTIC_LOCK:Mutex<()>=Mutex::new(());
        let _guard=DIAGNOSTIC_LOCK.lock().map_err(err)?;
        let mut samples=std::fs::read(&path).ok().and_then(|bytes|serde_json::from_slice::<Vec<Value>>(&bytes).ok()).unwrap_or_default();
        samples.push(sample);
        std::fs::write(path,serde_json::to_vec_pretty(&samples).map_err(err)?).map_err(err)?;
        return Ok(Value::Null);
    }
    if method == "startupInfo" {
        return Ok(json!({"project":state.active.load(std::sync::atomic::Ordering::Acquire)}));
    }
    if method == "pickProjectParent" {
        return Ok(rfd::AsyncFileDialog::new()
            .set_title(if arg(&args, 0).as_str() == Some("en") {
                "Project location"
            } else {
                "Pasta onde guardar o projeto"
            })
            .pick_folder()
            .await
            .map(|f| json!(f.path()))
            .unwrap_or(Value::Null));
    }
    if method == "closeProject" {
        state.docker.shutdown();
        state.tool_plugins.stop_all();
        let empty = state.cache.join("empty-workspace");
        std::fs::create_dir_all(&empty).map_err(err)?;
        state.recent.session(None)?;
        *state.project.write().await = Project::new(empty, app);
        state.tool_plugins.stop_all();
        state
            .active
            .store(false, std::sync::atomic::Ordering::Release);
        return Ok(Value::Null);
    }
    if method == "createProject" || method == "cloneProject" {
        let root = startup::prepare(
            git::s(arg(&args, 0))?,
            git::s(arg(&args, 1))?,
            if method == "cloneProject" {
                Some(git::s(arg(&args, 2))?)
            } else {
                None
            },
        )
        .await?;
        state.tool_plugins.stop_all();
        state.recent.remember(&root)?;
        state.recent.session(Some(&root))?;
        state.docker.shutdown();
        *state.project.write().await = Project::new(root.clone(), app);
        state.tool_plugins.stop_all();
        state
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        return Ok(json!({"root":root}));
    }
    if method == "nativeInfo" {
        return Ok(
            json!({"runtime":"tauri","backend":"rust","startupSmoke":std::env::var("PHP_IDE_STARTUP_SMOKE").ok(),"docker":if std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some(){std::env::var("PHP_IDE_SMOKE_DOCKER").ok().and_then(|s|serde_json::from_str::<Value>(&s).ok())}else{None},"smoke":std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some(),"database":if std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some(){std::env::var("PHP_IDE_SMOKE_DATABASE").ok().and_then(|s|serde_json::from_str::<Value>(&s).ok())}else{None}}),
        );
    }
    if method == "nativeSmokeProgress" {
        let path = PathBuf::from(std::env::var("PHP_IDE_NATIVE_SMOKE").map_err(err)?)
            .with_extension("progress");
        std::fs::write(path, git::s(arg(&args, 0))?).map_err(err)?;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(Value::Null);
    }
    if method == "nativeSmokeReport" {
        let path = std::env::var("PHP_IDE_NATIVE_SMOKE").map_err(err)?;
        std::fs::write(path, serde_json::to_vec_pretty(arg(&args, 0)).map_err(err)?)
            .map_err(err)?;
        app.exit(if arg(&args, 0)["ok"] == true { 0 } else { 1 });
        return Ok(Value::Null);
    }
    if method == "recentProjects" {
        return serde_json::to_value(state.recent.list()?).map_err(err);
    }
    if method == "forgetRecentProject" {
        state.recent.forget(git::s(arg(&args, 0))?)?;
        return Ok(Value::Null);
    }
    if method == "clearRecentProjects" {
        state.recent.clear()?;
        return Ok(Value::Null);
    }
    if method == "openProject" || method == "openRecentProject" {
        let root = if method == "openRecentProject" {
            Some(state.recent.resolve(git::s(arg(&args, 0))?)?)
        } else {
            rfd::AsyncFileDialog::new()
                .set_title(if arg(&args, 0).as_str() == Some("en") {
                    "Open project"
                } else {
                    "Abrir projeto"
                })
                .pick_folder()
                .await
                .map(|f| f.path().to_path_buf())
        };
        if let Some(root) = root {
            let root = root.canonicalize().map_err(err)?;
            if !root.is_dir() {
                return Err("Escolha uma pasta de projeto".into());
            }
            let info = json!({"root":root,"rootUri":url::Url::from_directory_path(&root).map_err(|_|"URI inválida")?.to_string(),"name":root.file_name().unwrap_or_default().to_string_lossy()});
            state.recent.remember(&root)?;
            state.recent.session(Some(&root))?;
            state
                .active
                .store(true, std::sync::atomic::Ordering::Release);
            let mut project = state.project.write().await;
            if project.root != root {
                state.docker.shutdown();
                state.tool_plugins.stop_all();
                *project = Project::new(root, app);
            }
            return Ok(info);
        }
        return Ok(Value::Null);
    }
    if let Some(feature)=tool_plugins::feature(&method) {
        let config=std::env::var_os("PHP_IDE_STATE_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir().map_err(err)?);
        let root=state.project.read().await.root.clone();
        tool_plugins::require_feature(&plugins::Dirs::new(&config,&root),feature)?;
        if feature=="phpforge.docker-services"{state.docker.resume();}
    }
    if method=="pluginReleaseResources" {
        let config=std::env::var_os("PHP_IDE_STATE_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir().map_err(err)?);
        let root=state.project.read().await.root.clone();
        if arg(&args,1).as_str()!=root.to_str(){return Ok(Value::Null)}
        let dirs=plugins::Dirs::new(&config,&root);
        if let Some(entry)=dirs.discover(env!("CARGO_PKG_VERSION")).into_iter().find(|e|Some(e.key.as_str())==arg(&args,0).as_str()) {
            if let Ok(manifest)=entry.manifest{release_plugin(&state,&manifest.id).await?;}
        }
        return Ok(Value::Null);
    }
    if method == "dockerCancel" {
        return state.docker.cancel(git::s(arg(&args, 0))?);
    }
    if method == "pluginAuthorizeService" || method == "pluginWorkbenchSource" || method == "pluginToolSource" || method == "pluginToolCall" || method == "pluginToolStop" {
        let config = std::env::var_os("PHP_IDE_STATE_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir().map_err(err)?);
        let root = state.project.read().await.root.clone();
        let dirs = plugins::Dirs::new(&config, &root);
        let key = git::s(arg(&args, 0))?;
        return match method.as_str() {
            "pluginToolSource" => tool_plugins::source(&dirs, key),
            "pluginWorkbenchSource" => tool_plugins::workbench_source(&dirs,key),
            "pluginAuthorizeService"=>tool_plugins::authorize_service(&dirs,key,git::s(arg(&args,1))?),
            "pluginToolStop" => { state.tool_plugins.stop(key); Ok(Value::Null) },
            _ => state.tool_plugins.call(&dirs, key, git::s(arg(&args, 1))?, arg(&args, 2).as_array().ok_or("Invalid tool arguments")?, &app, state.docker.executable()).await,
        };
    }
    // Plugin downloads must not hold the workspace guard while waiting for the network.
    if method.starts_with("plugin") && method != "plugins" {
        if ["pluginSetState", "pluginRemove"].contains(&method.as_str()) { if let Some(key)=arg(&args,0).as_str(){state.tool_plugins.stop(key);} }
        if method=="pluginConfirmInstall" {state.tool_plugins.stop_all();}
        let config = std::env::var_os("PHP_IDE_STATE_DIR")
            .map(PathBuf::from)
            .unwrap_or(app.path().app_config_dir().map_err(err)?);
        let root = state.project.read().await.root.clone();
        let dirs = plugins::Dirs::new(&config, &root);
        if ["pluginSetState","pluginRemove"].contains(&method.as_str()) {
            if let Some(entry)=dirs.discover(env!("CARGO_PKG_VERSION")).into_iter().find(|e|Some(e.key.as_str())==arg(&args,0).as_str()) {
                if let Ok(manifest)=entry.manifest{release_plugin(&state,&manifest.id).await?;}
            }
        }
        return plugins::dispatch(&dirs, &method, &args).await;
    }
    let project = state.project.read().await;
    let root = &project.root;
    let s = |i| git::s(arg(&args, i));
    if method == "dockerTerminal" {
        let config=std::env::var_os("PHP_IDE_STATE_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir().map_err(err)?);
        tool_plugins::require_feature(&plugins::Dirs::new(&config,root),"phpforge.docker-services")?;state.docker.resume();
        let context = s(1)?;
        let container = s(2)?;
        state.docker.validate_context(root, context).await?;
        docker::container_id(container)?;
        let mut terms = project.terminals.lock().map_err(err)?;
        return terms.create_docker(
            app,
            root,
            s(0)?,
            state.docker.executable(),
            context,
            container,
        );
    }
    if method.starts_with("docker") {
        return state.docker.dispatch(root, &app, &method, &args).await;
    }
    if method == "gitIgnored" { return git::ignored(root, arg(&args, 0)).await; }
    if method == "shellValidate" { return shell::validate(root, s(0)?, s(1)?).await; }
    if method == "languageSynthetic" {
        return project
            .language
            .lock()
            .await
            .synthetic(
                root,
                &state.tools,
                &state.cache,
                &app,
                arg(&args, 0),
                language::Probe {
                    expression: s(1)?,
                    offset: arg(&args, 2).as_u64().ok_or("Posição inválida")? as usize,
                },
            )
            .await;
    }
    if method == "languageStub" {
        return php_stubs::read(&state.tools, s(0)?);
    }
    if method == "language" {
        return project
            .language
            .lock()
            .await
            .request(root, &state.tools, &state.cache, &app, arg(&args, 0))
            .await;
    }
    if method == "languageApply" {
        return project
            .language
            .lock()
            .await
            .apply(root, &project.history, arg(&args, 0))
            .await;
    }
    if method == "searchSymbols" {
        return project
            .language
            .lock()
            .await
            .symbols(root, &state.tools, &state.cache, &app, s(0)?)
            .await;
    }
    if method == "agents" {
        return Ok(agents::list(&state.tools));
    }
    if method.starts_with("agent") {
        return project.agents.dispatch(&method, &args, &state.tools).await;
    }
    if method == "plugins" {
        return Err("Plugins são executados pela camada de linguagem da interface".into());
    }
    if method.starts_with("git") {
        let _lock = project.git.lock().await;
        return git::dispatch(root, &method, &args).await;
    }
    if method.starts_with("file") && method != "fileExists" {
        return files::dispatch(root, &project.history, &method, &args);
    }
    if method == "databaseLaravelFiles" { return laravel_database::files(root); }
    if method == "databaseImportLaravel" { return laravel_database::import(root, s(0)?); }
    if method.starts_with("database") {
        return project.database.dispatch(&method, &args).await;
    }
    if method.starts_with("terminal") {
        let mut terms = project.terminals.lock().map_err(err)?;
        let n = |i| {
            arg(&args, i)
                .as_u64()
                .and_then(|v| u16::try_from(v).ok())
                .ok_or("Dimensão inválida".to_owned())
        };
        return match method.as_str() {
            "terminalCreate" => {
                // Diretório inicial opcional (Abrir em › Terminal), confinado ao projeto.
                let cwd = match arg(&args, 3).as_str() {
                    Some(dir) if !dir.is_empty() => workspace::confined(root, dir)?,
                    _ => root.clone(),
                };
                if !cwd.is_dir() {
                    return Err("Diretório do terminal inválido".into());
                }
                terms.create(app, &cwd, s(0)?, n(1)?, n(2)?)
            }
            "terminalWrite" => terms.write(s(0)?, s(1)?),
            "terminalResize" => terms.resize(s(0)?, n(1)?, n(2)?),
            "terminalAck" => terms.ack(
                s(0)?,
                arg(&args, 1).as_u64().ok_or("Confirmação inválida")? as usize,
            ),
            "terminalClose" => Ok(terms.close(s(0)?)),
            _ => Err("Comando de terminal desconhecido".into()),
        };
    }
    match method.as_str() {
        "workspace" => Ok(
            json!({"root":root,"rootUri":url::Url::from_directory_path(root).map_err(|_|"URI inválida")?.to_string(),"name":root.file_name().unwrap_or_default().to_string_lossy()}),
        ),
        "fileExists" => {
            workspace::confined(root, s(0)?)?;
            Ok(Value::Bool(true))
        }
        "listFiles" => {
            let dir = workspace::confined(root, s(0)?)?;
            let vendor = arg(&args, 1).as_bool().unwrap_or(false);
            let paths = walkdir::WalkDir::new(&dir)
                .follow_links(false)
                .into_iter()
                .filter_entry(|e| {
                    let name = e.file_name().to_string_lossy();
                    ![
                        ".git",
                        "node_modules",
                        ".tools",
                        "dist",
                        "dist-electron",
                        "target",
                        ".cache",
                    ]
                    .contains(&name.as_ref())
                        && (vendor || name != "vendor")
                })
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .take(50000)
                .filter_map(|e| {
                    e.path()
                        .strip_prefix(root)
                        .ok()
                        .map(|p| p.to_string_lossy().to_string())
                })
                .collect::<Vec<_>>();
            Ok(json!(paths))
        }
        "tree" => workspace::tree(root, s(0)?),
        "read" => workspace::read(root, s(0)?),
        "readImage" => workspace::image(root, s(0)?),
        "save" => {
            if let Ok(path) = workspace::confined(root, s(0)?) {
                project.history.snapshot(root, &path, "Antes de salvar")?;
            }
            let result = workspace::save(root, s(0)?, s(1)?, s(2)?)?;
            Ok(result)
        }
        _ => {
            let root=project.root.clone();
            drop(project);
            let config=std::env::var_os("PHP_IDE_STATE_DIR").map(PathBuf::from).unwrap_or(app.path().app_config_dir().map_err(err)?);
            let dirs=plugins::Dirs::new(&config,&root);
            match tool_plugins::provider(&dirs,&method)? {
                Some(key)=>state.tool_plugins.call(&dirs,&key,&method,&args,&app,state.docker.executable()).await,
                None=>Err(format!("Comando desconhecido: {method}. Instale ou ative o plugin correspondente em Plugins.")),
            }
        },
    }
}
fn configure_path() {
    let mut paths = std::env::var_os("PATH")
        .map(|v| std::env::split_paths(&v).collect::<Vec<_>>())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME") {
        let home = PathBuf::from(home);
        for path in [
            home.join(".cargo/bin"),
            home.join(".local/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ] {
            if path.is_dir() && !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    if let Ok(value) = std::env::join_paths(paths) {
        std::env::set_var("PATH", value);
    }
}
fn config_placeholder(cache: &std::path::Path) -> PathBuf {
    cache.join("empty-workspace")
}
fn main() {
    configure_path();
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    #[cfg(debug_assertions)]
    if std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some() {
        if let Ok(port) = std::env::var("PHP_IDE_NATIVE_PORT") {
            let port: u16 = port.parse().expect("Invalid native test port");
            assert!(port > 0, "Invalid native test port");
            context.config_mut().build.dev_url = Some(format!("http://127.0.0.1:{port}").parse().expect("Invalid native test URL"));
        }
    }
    #[cfg(target_os = "macos")]
    if let Some(window) = context
        .config_mut()
        .app
        .windows
        .iter_mut()
        .find(|w| w.label == "main")
    {
        window.visible = false;
        window.create = false;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            native_splash::show();
            let resources = app.path().resource_dir()?;
            let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
            let base = if cfg!(debug_assertions) {
                dev
            } else {
                resources
            };
            let config = std::env::var_os("PHP_IDE_STATE_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_config_dir()?);
            let launch = install_generation::prepare(&config)?;
            app.manage(app_maintenance::Maintenance::open(config.clone(), launch)?);
            let recent = recent::Store::new(config);
            let requested = std::env::var_os("PHP_IDE_PROJECT")
                .map(PathBuf::from)
                .or_else(|| match launch {
                    install_generation::Launch::Reinstall => None,
                    install_generation::Launch::Continue => recent.restore(),
                });
            let active = requested.as_ref().is_some_and(|p| p.is_dir());
            let empty = config_placeholder(&app.path().app_cache_dir()?);
            std::fs::create_dir_all(&empty)?;
            let root = requested
                .filter(|p| p.is_dir())
                .unwrap_or(empty)
                .canonicalize()?;
            let tools = std::env::var_os("PHP_IDE_TOOLS")
                .map(PathBuf::from)
                .unwrap_or_else(|| base.join(".tools"))
                .canonicalize()?;
            let cache = app.path().app_cache_dir()?.join("php");
            if active {
                let _ = recent.remember(&root);
                let _ = recent.session(Some(&root));
            }
            app.manage(Backend {
                project: tokio::sync::RwLock::new(Project::new(root, app.handle().clone())),
                tools,
                cache,
                recent,
                docker: docker::Docker::default(),
                tool_plugins: tool_plugins::Host::default(),
                active: std::sync::atomic::AtomicBool::new(active),
            });
            #[cfg(target_os = "macos")]
            {
                let config = app.config().app.windows.iter()
                    .find(|w| w.label == "main")
                    .ok_or("Missing main window configuration")?;
                native_splash::trace("creating-webview");
                tauri::WebviewWindowBuilder::from_config(app, config)?.build()?;
            }
            if std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_position(tauri::LogicalPosition::new(80.0, 80.0));
                }
            }
            native_splash::watchdog(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(state) = window.try_state::<Backend>() {
                    state.tool_plugins.stop_all();
                    if let Ok(project) = state.project.try_read() {
                        if let Ok(mut terminals) = project.terminals.lock() {
                            drop(std::mem::take(&mut *terminals));
                        }
                        if let Ok(mut language) = project.language.try_lock() {
                            drop(std::mem::take(&mut *language));
                        }
                        project.agents.stop();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![ide, native_splash::startup_ready])
        .run(context)
        .expect("Falha ao iniciar Tauri");
}
