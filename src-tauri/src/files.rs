// Ações da árvore do projeto (criar, renomear, mover, copiar, excluir, abrir no sistema,
// buscar texto) e histórico local. Caminhos chegam relativos à raiz e são confinados; o
// histórico fica no cache do aplicativo, fora do projeto, e guarda conteúdo antes de cada
// alteração feita pela IDE (salvar, renomear, mover, excluir, restaurar).
use crate::workspace::{confined, err, hash, Res};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

const SNAPSHOT_LIMIT: u64 = 5 * 1024 * 1024;
const HISTORY_LIMIT: usize = 3000;
const SEARCH_LIMIT: usize = 500;
const SKIPPED: [&str; 9] = [
    ".git",
    ".idea",
    "node_modules",
    ".tools",
    ".cache",
    ".php-ide",
    "dist",
    "dist-electron",
    "target",
];

#[derive(Serialize, Deserialize, Clone)]
struct Revision {
    id: String,
    path: String,
    time: i64,
    label: String,
    blob: String,
    size: u64,
}

pub struct History {
    dir: Option<PathBuf>,
    index: Mutex<Vec<Revision>>,
}

fn relative(root: &Path, path: &Path) -> Res<String> {
    Ok(path
        .strip_prefix(root)
        .map_err(err)?
        .to_string_lossy()
        .replace('\\', "/"))
}

/// Caminho novo (ainda inexistente) dentro da raiz: sem `..`, absoluto ou symlink no pai.
fn fresh(root: &Path, input: &str) -> Res<PathBuf> {
    let rel = Path::new(input);
    if input.is_empty()
        || rel.is_absolute()
        || rel.components().any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Caminho inválido".into());
    }
    let path = root.join(rel);
    let parent = path.parent().ok_or("Caminho inválido")?;
    if parent.exists() {
        confined(root, parent.to_str().ok_or("Caminho inválido")?)?;
    }
    if fs::symlink_metadata(&path).is_ok() {
        return Err(format!("Já existe: {input}"));
    }
    Ok(path)
}

fn name(value: &str) -> Res<&str> {
    let value = value.trim();
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains(['/', '\\', '\0'])
        || value.chars().any(char::is_control)
    {
        return Err("Nome inválido".into());
    }
    Ok(value)
}

fn directory(root: &Path, input: &str) -> Res<PathBuf> {
    let dir = if input.is_empty() {
        root.to_path_buf()
    } else {
        confined(root, input)?
    };
    if !dir.is_dir() {
        return Err("Destino precisa ser um diretório".into());
    }
    Ok(dir)
}

/// Arquivos regulares de um caminho (ele mesmo ou a subárvore), sem seguir symlinks.
fn files(path: &Path) -> Vec<PathBuf> {
    walkdir::WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect()
}

impl History {
    pub fn new(dir: Option<PathBuf>) -> Self {
        let index = dir
            .as_ref()
            .and_then(|d| fs::read(d.join("index.json")).ok())
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        Self {
            dir,
            index: Mutex::new(index),
        }
    }
    pub fn for_project(cache: Option<PathBuf>, root: &Path) -> Self {
        Self::new(cache.map(|c| {
            c.join("history")
                .join(&hash(root.to_string_lossy().as_bytes())[..24])
        }))
    }
    fn persist(&self, index: &mut Vec<Revision>) -> Res<()> {
        let dir = self.dir.as_ref().ok_or("Histórico local indisponível")?;
        if index.len() > HISTORY_LIMIT {
            let drop = index.len() - HISTORY_LIMIT;
            index.drain(..drop);
            let used: std::collections::HashSet<_> = index.iter().map(|r| r.blob.clone()).collect();
            if let Ok(items) = fs::read_dir(dir.join("blobs")) {
                for item in items.flatten() {
                    if !used.contains(&*item.file_name().to_string_lossy()) {
                        let _ = fs::remove_file(item.path());
                    }
                }
            }
        }
        let tmp = dir.join(format!("index-{}.json", uuid::Uuid::new_v4()));
        fs::write(&tmp, serde_json::to_vec(index).map_err(err)?).map_err(err)?;
        fs::rename(tmp, dir.join("index.json")).map_err(err)
    }
    /// Guarda o conteúdo atual dos arquivos em `path` (arquivo ou diretório). Arquivos acima
    /// do limite são ignorados; o retorno diz quantos ficaram de fora.
    pub fn snapshot(&self, root: &Path, path: &Path, label: &str) -> Res<usize> {
        let Some(dir) = self.dir.as_ref() else {
            return Ok(0);
        };
        fs::create_dir_all(dir.join("blobs")).map_err(err)?;
        let mut index = self.index.lock().map_err(err)?;
        let mut skipped = 0;
        let time = chrono::Utc::now().timestamp_millis();
        for file in files(path) {
            let meta = fs::metadata(&file).map_err(err)?;
            if meta.len() > SNAPSHOT_LIMIT {
                skipped += 1;
                continue;
            }
            let bytes = fs::read(&file).map_err(err)?;
            let blob = hash(&bytes);
            let rel = relative(root, &file)?;
            if index
                .iter()
                .rev()
                .find(|r| r.path == rel)
                .is_some_and(|r| r.blob == blob && label.starts_with("Antes de salvar"))
            {
                continue;
            }
            let target = dir.join("blobs").join(&blob);
            if !target.exists() {
                fs::write(target, &bytes).map_err(err)?;
            }
            index.push(Revision {
                id: uuid::Uuid::new_v4().to_string(),
                path: rel,
                time,
                label: label.into(),
                blob,
                size: meta.len(),
            });
        }
        self.persist(&mut index)?;
        Ok(skipped)
    }
    /// Revisões acompanham o arquivo quando ele é renomeado ou movido.
    fn moved(&self, from: &str, to: &str) -> Res<()> {
        if self.dir.is_none() {
            return Ok(());
        }
        let mut index = self.index.lock().map_err(err)?;
        for revision in index.iter_mut() {
            if revision.path == from {
                revision.path = to.into();
            } else if let Some(rest) = revision.path.strip_prefix(&format!("{from}/")) {
                revision.path = format!("{to}/{rest}");
            }
        }
        self.persist(&mut index)
    }
    fn list(&self, path: &str) -> Res<Value> {
        let index = self.index.lock().map_err(err)?;
        let prefix = format!("{path}/");
        Ok(json!(index
            .iter()
            .rev()
            .filter(|r| path.is_empty() || r.path == path || r.path.starts_with(&prefix))
            .take(500)
            .map(|r| json!({"id":r.id,"path":r.path,"time":r.time,"label":r.label,"size":r.size}))
            .collect::<Vec<_>>()))
    }
    fn revision(&self, id: &str) -> Res<(Revision, Vec<u8>)> {
        let dir = self.dir.as_ref().ok_or("Histórico local indisponível")?;
        let revision = self
            .index
            .lock()
            .map_err(err)?
            .iter()
            .find(|r| r.id == id)
            .cloned()
            .ok_or("Revisão não encontrada")?;
        let bytes = fs::read(dir.join("blobs").join(&revision.blob)).map_err(err)?;
        Ok((revision, bytes))
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        matches!((fs::symlink_metadata(a), fs::symlink_metadata(b)), (Ok(x), Ok(y)) if x.dev() == y.dev() && x.ino() == y.ino())
    }
    #[cfg(not(unix))]
    {
        b.canonicalize().ok().is_some_and(|t| t == a)
    }
}

fn copy_tree(from: &Path, to: &Path) -> Res<()> {
    let meta = fs::symlink_metadata(from).map_err(err)?;
    if meta.is_dir() {
        fs::create_dir(to).map_err(err)?;
        for item in fs::read_dir(from).map_err(err)? {
            let item = item.map_err(err)?;
            copy_tree(&item.path(), &to.join(item.file_name()))?;
        }
    } else if meta.is_file() {
        fs::copy(from, to).map_err(err)?;
    }
    Ok(())
}

fn system(program: &str, args: &[&std::ffi::OsStr]) -> Res<Value> {
    std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Não foi possível executar {program}: {e}"))?;
    Ok(Value::Null)
}

fn reveal(path: &Path, select: bool) -> Res<Value> {
    if cfg!(target_os = "macos") {
        if select {
            system("open", &["-R".as_ref(), path.as_os_str()])
        } else {
            system("open", &[path.as_os_str()])
        }
    } else if cfg!(windows) {
        if select {
            let arg = std::ffi::OsString::from(format!("/select,{}", path.display()));
            system("explorer", &[arg.as_os_str()])
        } else {
            system("explorer", &[path.as_os_str()])
        }
    } else {
        let target = if select && !path.is_dir() {
            path.parent().unwrap_or(path)
        } else {
            path
        };
        system("xdg-open", &[target.as_os_str()])
    }
}

fn search(root: &Path, needle: &str) -> Res<Value> {
    if needle.trim().len() < 2 {
        return Err("Informe ao menos dois caracteres".into());
    }
    let mut found = vec![];
    let walker = walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !SKIPPED.contains(&name.as_ref()) && name != "vendor"
        });
    'files: for entry in walker.filter_map(Result::ok) {
        if !entry.file_type().is_file()
            || entry
                .metadata()
                .map(|m| m.len() > 2 * 1024 * 1024)
                .unwrap_or(true)
        {
            continue;
        }
        let Ok(text) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if text.contains('\0') {
            continue;
        }
        let path = relative(root, entry.path())?;
        for (line, content) in text.lines().enumerate() {
            if let Some(column) = content.find(needle) {
                let preview: String = content.trim().chars().take(240).collect();
                found.push(json!({"path":path,"line":line+1,"column":content[..column].chars().count()+1,"text":preview}));
                if found.len() >= SEARCH_LIMIT {
                    break 'files;
                }
            }
        }
    }
    Ok(json!({"matches":found,"truncated":found.len()>=SEARCH_LIMIT}))
}

pub fn dispatch(root: &Path, history: &History, method: &str, args: &[Value]) -> Res<Value> {
    let s = |i: usize| -> Res<&str> {
        args.get(i)
            .and_then(Value::as_str)
            .ok_or_else(|| "Argumento inválido".to_string())
    };
    match method {
        "fileCreate" => {
            let path = fresh(root, s(0)?)?;
            if s(1)? == "directory" {
                fs::create_dir_all(&path).map_err(err)?;
            } else {
                crate::workspace::create(root, s(0)?, s(2).unwrap_or(""))?;
            }
            Ok(json!(relative(root, &path)?))
        }
        "fileRename" | "fileMove" | "fileCopy" => {
            let from = confined(root, s(0)?)?;
            if from == root {
                return Err("A raiz do projeto não pode ser alterada aqui".into());
            }
            let old = relative(root, &from)?;
            let original = from
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let (dir, base) = match method {
                "fileRename" => (
                    from.parent().ok_or("Caminho inválido")?.to_path_buf(),
                    name(s(1)?)?.to_string(),
                ),
                "fileMove" => (directory(root, s(1)?)?, original),
                _ => (directory(root, s(1)?)?, name(s(2)?)?.to_string()),
            };
            if dir.starts_with(&from) {
                return Err("Não é possível colocar um diretório dentro dele mesmo".into());
            }
            let target = dir.join(&base);
            // Em sistemas sem diferença de maiúsculas, renomear só a caixa aponta para o mesmo arquivo.
            let same = same_file(&from, &target);
            if fs::symlink_metadata(&target).is_ok() && !(same && method == "fileRename") {
                return Err(format!("Já existe {} no destino", base));
            }
            let new = relative(root, &target)?;
            if method == "fileCopy" {
                copy_tree(&from, &target)?;
                return Ok(json!(new));
            }
            let label = if method == "fileRename" {
                format!("Antes de renomear para {base}")
            } else {
                format!(
                    "Antes de mover para {}",
                    if new.contains('/') {
                        new.rsplit_once('/').unwrap().0
                    } else {
                        "a raiz"
                    }
                )
            };
            history.snapshot(root, &from, &label)?;
            if same {
                let tmp = dir.join(format!(".php-ide-rename-{}", uuid::Uuid::new_v4()));
                fs::rename(&from, &tmp).map_err(err)?;
                fs::rename(&tmp, &target).map_err(err)?;
            } else {
                fs::rename(&from, &target).map_err(err)?;
            }
            history.moved(&old, &new)?;
            Ok(json!(new))
        }
        "fileDelete" => {
            let path = confined(root, s(0)?)?;
            if path == root {
                return Err("A raiz do projeto não pode ser excluída".into());
            }
            let force = args.get(1).and_then(Value::as_bool).unwrap_or(false);
            let large = files(&path)
                .iter()
                .filter(|f| {
                    fs::metadata(f)
                        .map(|m| m.len() > SNAPSHOT_LIMIT)
                        .unwrap_or(false)
                })
                .count();
            if large > 0 && !force {
                return Ok(json!({"deleted":false,"unrecoverable":large}));
            }
            history.snapshot(root, &path, "Antes de excluir")?;
            if fs::symlink_metadata(&path).map_err(err)?.is_dir() {
                fs::remove_dir_all(&path).map_err(err)?;
            } else {
                fs::remove_file(&path).map_err(err)?;
            }
            Ok(json!({"deleted":true,"unrecoverable":large}))
        }
        "fileReveal" => reveal(&confined(root, s(0)?)?, true),
        "fileOpenDefault" => reveal(&confined(root, s(0)?)?, false),
        "fileSearch" => search(root, s(0)?),
        "fileHistory" => history.list(s(0)?.trim_end_matches('/')),
        "fileHistoryContent" => {
            let (revision, bytes) = history.revision(s(0)?)?;
            let text = String::from_utf8(bytes).ok().filter(|t| !t.contains('\0'));
            Ok(json!({"path":revision.path,"text":text}))
        }
        "fileHistoryRestore" => {
            let (revision, bytes) = history.revision(s(0)?)?;
            let path = match confined(root, &revision.path) {
                Ok(path) if path.is_file() => {
                    history.snapshot(root, &path, "Antes de restaurar")?;
                    path
                }
                Ok(_) => return Err("O caminho agora é um diretório".into()),
                Err(_) => {
                    let path = fresh(root, &revision.path)?;
                    fs::create_dir_all(path.parent().ok_or("Caminho inválido")?).map_err(err)?;
                    path
                }
            };
            fs::write(&path, bytes).map_err(err)?;
            Ok(json!(revision.path))
        }
        _ => Err(format!("Comando de arquivo desconhecido: {method}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn project() -> (tempfile::TempDir, PathBuf, History) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let history = History::new(Some(dir.path().join("history")));
        (dir, root, history)
    }
    fn call(root: &Path, history: &History, method: &str, args: Value) -> Res<Value> {
        dispatch(root, history, method, args.as_array().unwrap())
    }
    #[test]
    fn create_rename_move_copy_and_history() {
        let (_dir, root, history) = project();
        call(
            &root,
            &history,
            "fileCreate",
            json!(["src/App", "directory"]),
        )
        .unwrap();
        call(
            &root,
            &history,
            "fileCreate",
            json!(["src/User.php", "file", "<?php\n"]),
        )
        .unwrap();
        assert!(call(
            &root,
            &history,
            "fileCreate",
            json!(["src/User.php", "file", ""])
        )
        .is_err());
        assert!(call(
            &root,
            &history,
            "fileCreate",
            json!(["../x.php", "file", ""])
        )
        .is_err());
        assert_eq!(
            call(
                &root,
                &history,
                "fileRename",
                json!(["src/User.php", "Account.php"])
            )
            .unwrap(),
            json!("src/Account.php")
        );
        assert!(call(
            &root,
            &history,
            "fileRename",
            json!(["src/Account.php", "a/b.php"])
        )
        .is_err());
        assert_eq!(
            call(
                &root,
                &history,
                "fileMove",
                json!(["src/Account.php", "src/App"])
            )
            .unwrap(),
            json!("src/App/Account.php")
        );
        assert!(call(&root, &history, "fileMove", json!(["src", "src/App"])).is_err());
        assert_eq!(
            call(&root, &history, "fileCopy", json!(["src/App", "", "Copy"])).unwrap(),
            json!("Copy")
        );
        assert_eq!(
            fs::read_to_string(root.join("Copy/Account.php")).unwrap(),
            "<?php\n"
        );
        assert!(call(&root, &history, "fileCopy", json!(["src/App", "", "Copy"])).is_err());
        // Histórico acompanha renomear e mover.
        let list = call(
            &root,
            &history,
            "fileHistory",
            json!(["src/App/Account.php"]),
        )
        .unwrap();
        assert_eq!(list.as_array().unwrap().len(), 2, "{list}");
        let rename_case = call(&root, &history, "fileRename", json!(["Copy", "copy"])).unwrap();
        assert_eq!(rename_case, json!("copy"));
    }
    #[test]
    fn delete_and_restore_from_history() {
        let (_dir, root, history) = project();
        fs::create_dir(root.join("app")).unwrap();
        fs::write(root.join("app/a.txt"), "one").unwrap();
        history
            .snapshot(&root, &root.join("app/a.txt"), "Antes de salvar")
            .unwrap();
        history
            .snapshot(&root, &root.join("app/a.txt"), "Antes de salvar")
            .unwrap();
        assert_eq!(
            call(&root, &history, "fileHistory", json!(["app"]))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(call(&root, &history, "fileDelete", json!([""])).is_err());
        assert_eq!(
            call(&root, &history, "fileDelete", json!(["app"])).unwrap()["deleted"],
            true
        );
        assert!(!root.join("app").exists());
        let list = call(&root, &history, "fileHistory", json!(["app"])).unwrap();
        let id = list[0]["id"].as_str().unwrap();
        assert_eq!(list[0]["label"], "Antes de excluir");
        assert_eq!(
            call(&root, &history, "fileHistoryContent", json!([id])).unwrap()["text"],
            "one"
        );
        call(&root, &history, "fileHistoryRestore", json!([id])).unwrap();
        assert_eq!(fs::read_to_string(root.join("app/a.txt")).unwrap(), "one");
        // Índice persiste entre instâncias.
        let reopened = History::new(history.dir.clone());
        assert_eq!(reopened.list("app").unwrap().as_array().unwrap().len(), 2);
    }
    #[test]
    fn search_and_confinement() {
        let (_dir, root, history) = project();
        fs::create_dir_all(root.join("vendor/x")).unwrap();
        fs::write(root.join("vendor/x/a.php"), "User.php").unwrap();
        fs::write(root.join("b.md"), "see [User](src/User.php)\n").unwrap();
        let found = call(&root, &history, "fileSearch", json!(["User.php"])).unwrap();
        assert_eq!(found["matches"].as_array().unwrap().len(), 1);
        assert_eq!(found["matches"][0]["column"], 16);
        assert!(call(&root, &history, "fileReveal", json!(["../"])).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/tmp", root.join("escape")).unwrap();
            assert!(call(
                &root,
                &history,
                "fileCreate",
                json!(["escape/x.txt", "file", ""])
            )
            .is_err());
        }
    }
}
