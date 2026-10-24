use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
pub type Res<T> = Result<T, String>;
pub fn hash(data: impl AsRef<[u8]>) -> String {
    format!("{:x}", Sha256::digest(data.as_ref()))
}
pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn confined(root: &Path, input: &str) -> Res<PathBuf> {
    let path = if Path::new(input).is_absolute() {
        PathBuf::from(input)
    } else {
        root.join(input)
    };
    let path = path.canonicalize().map_err(err)?;
    if !path.starts_with(root) {
        return Err("Arquivo fora do projeto".into());
    }
    Ok(path)
}
/// Caminhos do watcher que viram `project-changed`: ignora metadados/dependências e o
/// arquivo temporário do salvamento atômico (`save`), cujo rename já notifica o destino.
pub fn watched(path: &Path) -> bool {
    !path.components().any(|c| {
        [".git", "node_modules", "target", ".tools"]
            .iter()
            .any(|n| c.as_os_str() == *n)
    }) && !path
        .file_name()
        .is_some_and(|n| n.to_string_lossy().starts_with(".php-ide-"))
}
pub fn text(bytes: Vec<u8>) -> Res<String> {
    if bytes.len() > 2 * 1024 * 1024 || bytes.contains(&0) {
        return Err("Abra texto UTF-8 de até 2 MB".into());
    }
    String::from_utf8(bytes).map_err(err)
}
pub fn read(root: &Path, input: &str) -> Res<Value> {
    let path = confined(root, input)?;
    let meta = fs::metadata(&path).map_err(err)?;
    if !meta.is_file() || meta.len() > 2097152 {
        return Err("Abra texto UTF-8 de até 2 MB".into());
    }
    let value = text(fs::read(&path).map_err(err)?)?;
    Ok(
        json!({"path":path.strip_prefix(root).map_err(err)?.to_string_lossy(),"uri":url::Url::from_file_path(&path).map_err(|_|"URI inválida")?.as_str(),"etag":hash(&value),"text":value}),
    )
}
fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            out.push(if i <= chunk.len() {
                T[(n >> shift & 63) as usize] as char
            } else {
                '='
            });
        }
    }
    out
}
/// Imagem do projeto como data URI para as prévias de imagem e Markdown (a CSP só permite `self` e `data:`).
pub fn image(root: &Path, input: &str) -> Res<Value> {
    let path = confined(root, input)?;
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        _ => return Err("Formato de imagem não suportado na prévia".into()),
    };
    let meta = fs::metadata(&path).map_err(err)?;
    if !meta.is_file() || meta.len() > 5 * 1024 * 1024 {
        return Err("Imagem acima de 5 MB não é exibida na prévia".into());
    }
    let bytes = fs::read(&path).map_err(err)?;
    Ok(json!(format!("data:{};base64,{}", mime, base64(&bytes))))
}
pub fn tree(root: &Path, input: &str) -> Res<Value> {
    let path = confined(root, input)?;
    let mut entries = vec![];
    for item in fs::read_dir(path).map_err(err)? {
        let item = item.map_err(err)?;
        let kind = item.file_type().map_err(err)?;
        let name = item.file_name().to_string_lossy().into_owned();
        if kind.is_symlink()
            || [".git", ".tools", ".php-ide"]
            .contains(&name.as_str())
        {
            continue;
        }
        entries.push(json!({"name":name,"path":item.path().strip_prefix(root).map_err(err)?.to_string_lossy(),"directory":kind.is_dir()}));
    }
    entries.sort_by(|a, b| {
        b["directory"]
            .as_bool()
            .cmp(&a["directory"].as_bool())
            .then(a["name"].as_str().cmp(&b["name"].as_str()))
    });
    entries.truncate(2000);
    Ok(json!(entries))
}
pub fn save(root: &Path, input: &str, value: &str, etag: &str) -> Res<Value> {
    if value.len() > 2097152 || value.contains('\0') {
        return Err("Texto inválido".into());
    }
    let before = read(root, input)?;
    if before["etag"] != etag {
        return Err("Arquivo mudou no disco. Reabra antes de salvar.".into());
    }
    let path = confined(root, input)?;
    let tmp = path.with_file_name(format!(".php-ide-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut f = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .map_err(err)?;
        f.set_permissions(fs::metadata(&path).map_err(err)?.permissions())
            .map_err(err)?;
        f.write_all(value.as_bytes()).map_err(err)?;
        f.sync_all().map_err(err)?;
        if read(root, input)?["etag"] != etag {
            return Err("Alteração externa durante salvamento".into());
        }
        fs::rename(&tmp, path).map_err(err)?;
        Ok(json!(hash(value)))
    })();
    let _ = fs::remove_file(tmp);
    result
}
pub fn create(root: &Path, input: &str, value: &str) -> Res<Value> {
    if value.len() > 2097152 {
        return Err("Texto muito grande".into());
    }
    let relative = Path::new(input);
    if relative.is_absolute()
        || relative
            .components()
            .any(|x| matches!(x, std::path::Component::ParentDir))
    {
        return Err("Caminho inválido".into());
    }
    let path = root.join(relative);
    let mut parent = root.to_path_buf();
    if let Some(parts) = relative.parent() {
        for part in parts.components() {
            parent.push(part);
            if !parent.exists() {
                fs::create_dir(&parent).map_err(err)?;
            }
            confined(root, parent.to_str().ok_or("Caminho inválido")?)?;
        }
    }
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(err)?;
    file.write_all(value.as_bytes()).map_err(err)?;
    Ok(json!(hash(value)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confinement_and_conflicts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("a.php"), "<?php").unwrap();
        let a = read(&root, "a.php").unwrap();
        save(&root, "a.php", "new", a["etag"].as_str().unwrap()).unwrap();
        assert!(save(&root, "a.php", "stale", a["etag"].as_str().unwrap()).is_err());
        assert!(confined(&root, "..").is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/etc/passwd", root.join("escape")).unwrap();
            assert!(read(&root, "escape").is_err());
            assert!(image(&root, "escape").is_err());
        }
    }
    #[test]
    fn external_changes_reject_stale_saves() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("a.php"), "<?php 1;").unwrap();
        let opened = read(&root, "a.php").unwrap();
        let etag = opened["etag"].as_str().unwrap();
        // Outro processo altera o arquivo aberto: salvar com etag antigo é recusado e o disco preservado.
        fs::write(root.join("a.php"), "<?php external;").unwrap();
        assert!(save(&root, "a.php", "<?php mine;", etag).unwrap_err().contains("mudou no disco"));
        assert_eq!(fs::read_to_string(root.join("a.php")).unwrap(), "<?php external;");
        // Duas janelas com o mesmo etag: só a primeira grava.
        let fresh = read(&root, "a.php").unwrap();
        let tag = fresh["etag"].as_str().unwrap();
        let first = save(&root, "a.php", "<?php first;", tag).unwrap();
        assert_eq!(first, json!(hash("<?php first;")));
        assert!(save(&root, "a.php", "<?php second;", tag).is_err());
        assert_eq!(read(&root, "a.php").unwrap()["etag"], first);
        // Arquivo removido ou renomeado fora da IDE não é recriado pelo salvamento.
        fs::rename(root.join("a.php"), root.join("b.php")).unwrap();
        assert!(save(&root, "a.php", "<?php lost;", first.as_str().unwrap()).is_err());
        assert!(!root.join("a.php").exists());
        // Permissões são preservadas e nenhum temporário sobra.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(root.join("b.php"), fs::Permissions::from_mode(0o755)).unwrap();
            let b = read(&root, "b.php").unwrap();
            save(&root, "b.php", "#!/usr/bin/env php\n", b["etag"].as_str().unwrap()).unwrap();
            assert_eq!(fs::metadata(root.join("b.php")).unwrap().permissions().mode() & 0o777, 0o755);
        }
        assert!(fs::read_dir(&root).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".php-ide-")));
    }
    #[test]
    fn watcher_reports_external_and_atomic_saves() {
        use notify::Watcher;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/a.php"), "<?php 1;").unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |e: Result<notify::Event, notify::Error>| {
            if let Ok(e) = e {
                for p in e.paths {
                    let _ = tx.send(p);
                }
            }
        })
        .unwrap();
        watcher.watch(&root, notify::RecursiveMode::Recursive).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(300));
        let seen = |want: &Path| {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            let mut got = vec![];
            while std::time::Instant::now() < deadline {
                if let Ok(p) = rx.recv_timeout(std::time::Duration::from_millis(100)) {
                    let p = p.canonicalize().unwrap_or(p);
                    got.push(p.clone());
                    if p == want {
                        return got;
                    }
                }
            }
            panic!("sem evento para {}: {:?}", want.display(), got)
        };
        fs::write(root.join("src/new.php"), "<?php new;").unwrap();
        assert!(watched(&seen(&root.join("src/new.php")).pop().unwrap()));
        let a = read(&root, "src/a.php").unwrap();
        save(&root, "src/a.php", "<?php saved;", a["etag"].as_str().unwrap()).unwrap();
        let events = seen(&root.join("src/a.php"));
        assert!(events.iter().filter(|p| watched(p)).all(|p| !p.to_string_lossy().contains(".php-ide-")));
        fs::write(root.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();
        assert!(!watched(&root.join(".git/HEAD")));
        assert!(!watched(&root.join("vendor/x/node_modules/y.js")));
        assert!(!watched(&root.join("src/.php-ide-0d4c")));
        assert!(watched(&root.join("src/gitignore.php")));
    }
    #[test]
    fn preview_images() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("dot.png"), [0x89, b'P', b'N', b'G']).unwrap();
        fs::write(root.join("a.svg"), "<svg/>").unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        assert_eq!(
            image(&root, "dot.png").unwrap(),
            json!("data:image/png;base64,iVBORw==")
        );
        assert_eq!(
            image(&root, "a.svg").unwrap(),
            json!("data:image/svg+xml;base64,PHN2Zy8+")
        );
        for (ext, mime) in [
            ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("gif", "image/gif"),
            ("webp", "image/webp"), ("bmp", "image/bmp"), ("ico", "image/x-icon"),
            ("avif", "image/avif"), ("PNG", "image/png"),
        ] {
            let name = format!("preview.{ext}");
            fs::write(root.join(&name), [1, 2, 3]).unwrap();
            assert_eq!(image(&root, &name).unwrap(), json!(format!("data:{mime};base64,AQID")));
        }
        let large = fs::File::create(root.join("large.png")).unwrap();
        large.set_len(5 * 1024 * 1024 + 1).unwrap();
        assert!(image(&root, "large.png").is_err());
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.png"), [1]).unwrap();
        assert!(image(&root, outside.path().join("secret.png").to_str().unwrap()).is_err());
        #[cfg(unix)] {
            std::os::unix::fs::symlink(outside.path().join("secret.png"), root.join("escape.png")).unwrap();
            assert!(image(&root, "escape.png").is_err());
        }
        assert!(image(&root, "notes.txt").is_err());
        assert!(image(&root, "../outside.png").is_err());
    }
}
