use crate::workspace::{err, Res};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub path: String,
    pub name: String,
}
#[derive(Serialize)]
pub struct Recent {
    pub path: String,
    pub name: String,
    pub available: bool,
}
pub struct Store {
    file: PathBuf,
}
struct Lock(fs::File);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}
impl Store {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            file: directory.join("recent-projects.json"),
        }
    }
    fn load(&self) -> Res<Vec<Entry>> {
        match fs::read(&self.file) {
   Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "Histórico de projetos inválido. Preserve recent-projects.json e corrija seu conteúdo.".into()),
   Err(e) if e.kind()==std::io::ErrorKind::NotFound => Ok(vec![]), Err(e)=>Err(err(e))
  }
    }
    fn edit(&self, f: impl FnOnce(&mut Vec<Entry>)) -> Res<()> {
        let parent = self
            .file
            .parent()
            .ok_or("Diretório de configuração inválido")?;
        fs::create_dir_all(parent).map_err(err)?;
        // OS lock is released even after a crash; the lock file may persist.
        let handle = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.file.with_extension("lock"))
            .map_err(err)?;
        handle
            .try_lock()
            .map_err(|e| format!("Histórico ocupado ou indisponível; tente novamente: {e}"))?;
        let _guard = Lock(handle);
        let mut list = self.load()?;
        f(&mut list);
        list.truncate(30);
        let temp = parent.join(format!(".recent-{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| {
            fs::write(&temp, serde_json::to_vec_pretty(&list).map_err(err)?).map_err(err)?;
            fs::rename(&temp, &self.file).map_err(err)
        })();
        let _ = fs::remove_file(temp);
        result
    }
    pub fn session(&self, root: Option<&Path>) -> Res<()> {
        let file = self.file.with_file_name("startup-project.json");
        fs::create_dir_all(file.parent().ok_or("Configuração inválida")?).map_err(err)?;
        let temp = file.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        fs::write(&temp, serde_json::to_vec(&root).map_err(err)?).map_err(err)?;
        fs::rename(temp, file).map_err(err)
    }
    pub fn restore(&self) -> Option<PathBuf> {
        let file = self.file.with_file_name("startup-project.json");
        match fs::read(file) {
            Ok(bytes) => serde_json::from_slice::<Option<PathBuf>>(&bytes)
                .ok()
                .flatten()
                .filter(|p| p.is_dir()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => self
                .list()
                .ok()?
                .into_iter()
                .find(|p| p.available)
                .map(|p| PathBuf::from(p.path)),
            Err(_) => None,
        }
    }
    pub fn list(&self) -> Res<Vec<Recent>> {
        Ok(self
            .load()?
            .into_iter()
            .map(|e| Recent {
                available: Path::new(&e.path).is_dir(),
                path: e.path,
                name: e.name,
            })
            .collect())
    }
    pub fn remember(&self, root: &Path) -> Res<()> {
        let root = root.canonicalize().map_err(err)?;
        if !root.is_dir() {
            return Err("O projeto precisa ser uma pasta".into());
        }
        let path = root.to_string_lossy().to_string();
        let name = root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        self.edit(|list| {
            list.retain(|e| e.path != path);
            list.insert(0, Entry { path, name });
        })
    }
    pub fn resolve(&self, path: &str) -> Res<PathBuf> {
        if !self.load()?.iter().any(|e| e.path == path) {
            return Err("Projeto não está na lista de recentes".into());
        }
        let root=PathBuf::from(path).canonicalize().map_err(|_|"Projeto não encontrado. Abra a nova pasta por Abrir projeto ou remova esta entrada.".to_string())?;
        if !root.is_dir() {
            return Err("A pasta do projeto não está disponível".into());
        }
        Ok(root)
    }
    pub fn forget(&self, path: &str) -> Res<()> {
        self.edit(|list| list.retain(|e| e.path != path))
    }
    pub fn clear(&self) -> Res<()> {
        self.edit(|list| list.clear())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_close_preserves_history_and_missing_does_not_restore() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        fs::create_dir(&project).unwrap();
        let store = Store::new(temp.path().join("state"));
        assert!(store.restore().is_none());
        store.remember(&project).unwrap();
        store.session(Some(&project)).unwrap();
        assert_eq!(store.restore(), Some(project.clone()));
        store.session(None).unwrap();
        assert!(store.restore().is_none());
        assert_eq!(store.list().unwrap().len(), 1);
        store.session(Some(&project)).unwrap();
        fs::remove_dir(project).unwrap();
        assert!(store.restore().is_none());
    }
    #[test]
    fn persistent_mru_missing_and_removal() {
        let temp = tempfile::tempdir().unwrap();
        let a = temp.path().join("a");
        let b = temp.path().join("b");
        fs::create_dir(&a).unwrap();
        fs::create_dir(&b).unwrap();
        let dir = temp.path().join("config");
        let s = Store::new(dir.clone());
        s.remember(&a).unwrap();
        s.remember(&b).unwrap();
        s.remember(&a).unwrap();
        let s = Store::new(dir);
        let list = s.list().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, "a");
        assert!(list[0].available);
        fs::remove_dir(&b).unwrap();
        assert!(!s.list().unwrap()[1].available);
        assert!(s.resolve(&list[1].path).is_err());
        assert!(s.resolve("/unregistered").is_err());
        s.forget(&list[1].path).unwrap();
        assert!(a.exists());
        assert_eq!(s.list().unwrap().len(), 1);
        s.clear().unwrap();
        assert!(s.list().unwrap().is_empty());
        assert!(a.exists());
    }
    #[test]
    fn corrupt_file_is_preserved_and_lock_prevents_lost_updates() {
        let temp = tempfile::tempdir().unwrap();
        let s = Store::new(temp.path().to_path_buf());
        fs::write(&s.file, "broken").unwrap();
        assert!(s.clear().is_err());
        assert_eq!(fs::read_to_string(&s.file).unwrap(), "broken");
        fs::write(&s.file, "[]").unwrap();
        let lock = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(s.file.with_extension("lock"))
            .unwrap();
        lock.try_lock().unwrap();
        assert!(s.clear().is_err());
        assert_eq!(fs::read_to_string(&s.file).unwrap(), "[]");
        lock.unlock().unwrap();
        drop(lock);
        s.clear().unwrap();
    }
}
