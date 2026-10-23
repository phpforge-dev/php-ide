use crate::{
    process,
    workspace::{err, Res},
};
use std::path::PathBuf;
pub async fn prepare(parent: &str, name: &str, repository: Option<&str>) -> Res<PathBuf> {
    if name.is_empty()
        || name.len() > 100
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || "-_ .".contains(c))
    {
        return Err("Use um nome de pasta válido, sem barras".into());
    }
    let parent = PathBuf::from(parent).canonicalize().map_err(err)?;
    if !parent.is_dir() {
        return Err("Selecione uma pasta existente".into());
    }
    let target = parent.join(name);
    if target.exists() {
        return Err(
            "A pasta de destino já existe. Escolha outro nome; nenhum arquivo foi alterado.".into(),
        );
    }
    if let Some(url) = repository {
        if url.is_empty()
            || url.starts_with('-')
            || url.contains(['\n', '\r'])
            || url.contains('\0')
            || url.contains("::")
        {
            return Err("Informe um repositório Git válido".into());
        }
        // Git receives distinct argv values. No shell, hooks or project commands are run by the IDE.
        process::git(&parent,&["-c","core.hooksPath=","-c","protocol.ext.allow=never","clone","--",url,dunce::simplified(&target).to_str().ok_or("Caminho inválido")?]).await.map_err(|e|format!("Não foi possível clonar: {e}. Se uma pasta parcial existir, verifique-a antes de tentar novamente."))?;
    } else {
        std::fs::create_dir(&target).map_err(err)?;
        std::fs::write(
            target.join("index.php"),
            "<?php\n\ndeclare(strict_types=1);\n\necho 'Olá, PHP!';\n",
        )
        .map_err(err)?;
    }
    target.canonicalize().map_err(err)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn create_and_reject_overwrite_or_escape() {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().to_str().unwrap();
        assert!(prepare(parent, "../escape", None).await.is_err());
        let root = prepare(parent, "hello-php", None).await.unwrap();
        assert!(root.join("index.php").is_file());
        std::fs::write(root.join("index.php"), "preserve").unwrap();
        assert!(prepare(parent, "hello-php", None).await.is_err());
        assert_eq!(
            std::fs::read_to_string(root.join("index.php")).unwrap(),
            "preserve"
        );
    }
    #[tokio::test]
    async fn clone_local_repository() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        std::fs::create_dir(&source).unwrap();
        process::git(&source, &["init"]).await.unwrap();
        std::fs::write(source.join("hello.php"), "<?php").unwrap();
        process::git(&source, &["add", "."]).await.unwrap();
        process::git(
            &source,
            &[
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                "fixture",
            ],
        )
        .await
        .unwrap();
        let root = prepare(
            dir.path().to_str().unwrap(),
            "cloned",
            Some(source.to_str().unwrap()),
        )
        .await
        .unwrap();
        assert!(root.join("hello.php").is_file());
    }
}
