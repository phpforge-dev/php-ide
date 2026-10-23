use crate::{
    process::{git, run},
    workspace::{self, err, hash, Res},
};
use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};
pub fn s(v: &Value) -> Res<&str> {
    v.as_str().ok_or_else(|| "Campo de texto inválido".into())
}
fn conflicted(v: &Value) -> bool {
    ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].contains(
        &format!(
            "{}{}",
            v["index"].as_str().unwrap_or(""),
            v["worktree"].as_str().unwrap_or("")
        )
        .as_str(),
    )
}
async fn repository(root: &Path) -> Res<()> {
    let top = git(root, &["rev-parse", "--show-toplevel"]).await?;
    if Path::new(top.trim()).canonicalize().map_err(err)? != root {
        return Err("Abra a raiz do repositório Git".into());
    }
    Ok(())
}
async fn reference(root: &Path, name: &str) -> Option<String> {
    git(root, &["rev-parse", "--verify", "--quiet", name])
        .await
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}
/// Operação Git em andamento, a partir do estado em `.git` (não do texto de saída).
async fn operation(root: &Path, conflicts: bool) -> Option<&'static str> {
    for dir in ["rebase-merge", "rebase-apply"] {
        if let Ok(p) = git(root, &["rev-parse", "--git-path", dir]).await {
            if root.join(p.trim()).is_dir() {
                return Some("rebase");
            }
        }
    }
    for (name, kind) in [
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ] {
        if reference(root, name).await.is_some() {
            return Some(kind);
        }
    }
    // Conflito sem estado de operação: tipicamente `stash apply`.
    conflicts.then_some("conflict")
}
/// Query only requested visible paths; Git owns ignore precedence and tracked-file rules.
pub async fn ignored(root: &Path, paths: &Value) -> Res<Value> {
    let paths = paths.as_array().ok_or("Lista de caminhos inválida")?;
    if paths.len() > 10000 { return Err("Lista de caminhos excede o limite".into()); }
    let mut input = String::new();
    for value in paths {
        let path = s(value)?;
        if path.is_empty() || path.contains('\0') { return Err("Caminho inválido".into()); }
        // Keep relative input names for Git output, and tolerate rows removed during refresh.
        let relative = if Path::new(path).is_absolute() { Path::new(path).strip_prefix(root).map_err(err)?.to_string_lossy().into_owned() } else { path.to_string() };
        if Path::new(&relative).components().any(|c| matches!(c, std::path::Component::ParentDir)) { return Err("Caminho inválido".into()); }
        if !root.join(&relative).try_exists().map_err(err)? { continue; }
        workspace::confined(root, &relative)?;
        input.push_str(&relative); input.push('\0');
    }
    if input.len() > 1024 * 1024 { return Err("Lista de caminhos excede 1 MiB".into()); }
    if paths.is_empty() { return Ok(json!([])); }
    if git(root, &["rev-parse", "--is-inside-work-tree"]).await.is_err() { return Ok(json!([])); }
    let raw = match run(root, "git", &["check-ignore".into(), "--stdin".into(), "-z".into()], Some(&input)).await {
        Ok(raw) => raw,
        Err(error) if error.trim().is_empty() => String::new(), // exit 1: no matches
        Err(error) => return Err(error),
    };
    Ok(json!(raw.split('\0').filter(|p| !p.is_empty()).collect::<Vec<_>>()))
}

pub async fn status(root: &Path) -> Res<Value> {
    repository(root).await?;
    let raw = git(
        root,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )
    .await?;
    let fields: Vec<_> = raw.split('\0').collect();
    let mut changes = vec![];
    let mut i = 0;
    while i < fields.len() && !fields[i].is_empty() {
        let item = fields[i];
        if item.len() < 3 {
            return Err("Status Git inválido".into());
        }
        let mut change = json!({"path":&item[3..],"index":&item[..1],"worktree":&item[1..2]});
        if item[..2].contains(['R', 'C']) {
            i += 1;
            change["originalPath"] = json!(fields.get(i).ok_or("Rename inválido")?);
        }
        changes.push(change);
        i += 1;
    }
    let head = reference(root, "HEAD").await;
    let merge = reference(root, "MERGE_HEAD").await;
    let branch = git(root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .unwrap_or_else(|_| {
            format!(
                "HEAD destacado · {}",
                head.as_deref()
                    .unwrap_or("")
                    .chars()
                    .take(8)
                    .collect::<String>()
            )
        })
        .trim()
        .to_string();
    let index = git(root, &["ls-files", "--stage", "-z"]).await?;
    let operation = operation(root, changes.iter().any(conflicted)).await;
    Ok(
        json!({"branch":branch,"head":head,"mergeHead":merge,"operation":operation,"changes":changes,"indexToken":hash(format!("{}\0{}\0{}",head.as_deref().unwrap_or(""),merge.as_deref().unwrap_or(""),index))}),
    )
}
fn local(root: &Path, path: &str) -> Res<String> {
    let meta = fs::symlink_metadata(root.join(path)).map_err(err)?;
    if !meta.is_file() {
        return Err("Diff de symlink/submódulo não suportado".into());
    }
    let v = workspace::read(root, path)?;
    Ok(s(&v["text"])?.into())
}
async fn blob(root: &Path, spec: &str) -> Res<String> {
    let size = git(root, &["cat-file", "-s", spec])
        .await?
        .trim()
        .parse::<usize>()
        .map_err(err)?;
    if size > 2097152 {
        return Err("Arquivo grande demais".into());
    }
    let value = git(root, &["cat-file", "blob", spec]).await?;
    if value.contains('\0') {
        return Err("Diff binário não suportado".into());
    }
    Ok(value)
}
fn change(state: &Value, path: &str) -> Res<Value> {
    if path.is_empty()
        || Path::new(path).is_absolute()
        || path.contains('\0')
        || Path::new(path)
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("Caminho inválido".into());
    }
    state["changes"]
        .as_array()
        .ok_or("Status inválido")?
        .iter()
        .find(|v| v["path"] == path)
        .cloned()
        .ok_or("Arquivo mudou. Atualize a lista.".into())
}
pub async fn diff(root: &Path, path: &str, staged: bool) -> Res<Value> {
    let state = status(root).await?;
    let c = change(&state, path)?;
    if conflicted(&c) {
        return Err("Resolva o conflito primeiro".into());
    }
    let index = s(&c["index"])?;
    let work = s(&c["worktree"])?;
    let untracked = index == "?";
    if staged && (index == " " || untracked) {
        return Err("Arquivo não preparado".into());
    }
    let before = if staged {
        if state["head"].is_null() || index == "A" {
            String::new()
        } else {
            blob(
                root,
                &format!(
                    "{}:{}",
                    s(&state["head"])?,
                    c["originalPath"].as_str().unwrap_or(path)
                ),
            )
            .await?
        }
    } else if untracked || index == "D" {
        String::new()
    } else {
        blob(root, &format!(":{}", path)).await?
    };
    let after = if staged {
        if index == "D" {
            String::new()
        } else {
            blob(root, &format!(":{}", path)).await?
        }
    } else if work == "D" {
        String::new()
    } else {
        local(root, path)?
    };
    let token = hash(json!([state["indexToken"], c, before, after]).to_string());
    Ok(
        json!({"path":path,"before":before,"after":after,"beforeLabel":if staged{"HEAD"}else if untracked{"Não rastreado (vazio)"}else{"Preparado (index)"},"afterLabel":if staged{"Preparado (index)"}else{"Disco"},"token":token}),
    )
}
async fn branches(root: &Path) -> Res<Value> {
    repository(root).await?;
    let text = git(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .await?;
    Ok(json!(text.lines().filter(|v|!v.is_empty()).map(|line|{let p:Vec<_>=line.split('\0').collect();json!({"name":p[0].trim_start_matches("refs/heads/").trim_start_matches("refs/remotes/"),"current":p.get(1)==Some(&"*"),"remote":p[0].starts_with("refs/remotes/"),"upstream":p.get(2).unwrap_or(&""),"tracking":p.get(3).unwrap_or(&"")})}).collect::<Vec<_>>()))
}
fn valid_hash(v: &str) -> Res<()> {
    if !(40..=64).contains(&v.len()) || !v.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Commit inválido".into());
    }
    Ok(())
}
async fn history(root: &Path, id: &str) -> Res<Value> {
    valid_hash(id)?;
    let parents = git(root, &["show", "-s", "--format=%P", id]).await?;
    let parents: Vec<_> = parents.split_whitespace().collect();
    let mut args = vec![
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--name-status",
        "-r",
        "-M",
        "-z",
    ];
    if let Some(p) = parents.first() {
        args.push(p);
    }
    args.push(id);
    let raw = git(root, &args).await?;
    let p: Vec<_> = raw.split('\0').collect();
    let mut files = vec![];
    let mut i = 0;
    while i + 1 < p.len() && !p[i].is_empty() {
        let code = p[i];
        let first = p[i + 1];
        i += 2;
        if code.starts_with(['R', 'C']) {
            let path = p.get(i).ok_or("Rename inválido")?;
            i += 1;
            files.push(json!({"status":code,"oldPath":first,"path":path}));
        } else {
            files.push(json!({"status":code,"path":first}));
        }
    }
    Ok(json!({"hash":id,"parents":parents,"files":files}))
}
async fn hunks(root: &Path, path: &str, staged: bool) -> Res<(String, String, Vec<String>)> {
    let value = diff(root, path, staged).await?;
    let c = change(&status(root).await?, path)?;
    if c[if staged { "index" } else { "worktree" }] != "M" {
        return Err("Trechos disponíveis apenas para modificações textuais".into());
    }
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--unified=0",
    ];
    if staged {
        args.push("--cached");
    }
    args.extend(["--", path]);
    let patch = git(root, &args).await?;
    let start = patch.find("\n@@ ").ok_or("Sem trechos textuais")? + 1;
    let prefix = patch[..start].to_string();
    if prefix
        .lines()
        .any(|l| l.starts_with("old mode") || l.starts_with("new mode"))
    {
        return Err("Permissões exigem arquivo inteiro".into());
    }
    let mut chunks = vec![];
    let mut current = String::new();
    for line in patch[start..].split_inclusive('\n') {
        if line.starts_with("@@ ") && !current.is_empty() {
            chunks.push(std::mem::take(&mut current));
        }
        current.push_str(line);
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    Ok((s(&value["token"])?.into(), prefix, chunks))
}
async fn conflict(root: &Path, path: &str) -> Res<Value> {
    let state = status(root).await?;
    if !conflicted(&change(&state, path)?) {
        return Err("Arquivo não está em conflito".into());
    }
    let text = git(root, &["ls-files", "--unmerged", "-z", "--", path]).await?;
    let mut stages = std::collections::HashMap::new();
    for row in text.split('\0').filter(|v| !v.is_empty()) {
        let fields: Vec<_> = row.split('\t').next().unwrap_or("").split(' ').collect();
        if fields.len() != 3 || !["100644", "100755"].contains(&fields[0]) {
            return Err("Conflito não textual".into());
        }
        stages.insert(fields[2], fields[1]);
    }
    let ours = blob(
        root,
        stages
            .get("2")
            .ok_or("Conflito de exclusão exige resolução externa")?,
    )
    .await?;
    let theirs = blob(
        root,
        stages
            .get("3")
            .ok_or("Conflito de exclusão exige resolução externa")?,
    )
    .await?;
    let base = if let Some(v) = stages.get("1") {
        blob(root, v).await?
    } else {
        String::new()
    };
    let result = local(root, path)?;
    let op = state["operation"].as_str().unwrap_or("conflict");
    let mut ours_label = s(&state["branch"])?.to_string();
    let incoming = match op {
        "merge" => Some("MERGE_HEAD"),
        "cherry-pick" => Some("CHERRY_PICK_HEAD"),
        "revert" => Some("REVERT_HEAD"),
        "rebase" => Some("REBASE_HEAD"),
        _ => None,
    };
    let theirs_label = match incoming {
        Some(name) => reference(root, name)
            .await
            .unwrap_or_default()
            .chars()
            .take(8)
            .collect::<String>(),
        None => "stash/externo".into(),
    };
    if op == "rebase" {
        ours_label = "base do rebase".into();
    }
    Ok(
        json!({"path":path,"base":base,"ours":ours,"theirs":theirs,"result":result,"operation":op,"oursLabel":ours_label,"theirsLabel":theirs_label,"token":hash(json!([state["indexToken"],path,result]).to_string())}),
    )
}
async fn config(root: &Path, key: &str, local: bool) -> Option<String> {
    let args = if local {
        vec!["config", "--local", "--no-includes", "--get", key]
    } else {
        vec!["config", "--includes", "--get", key]
    };
    git(root, &args).await.ok().map(|v| v.trim_end().to_owned())
}
fn ssh(path: &str) -> String {
    format!(
        "ssh -o BatchMode=yes -o IdentitiesOnly=yes -i '{}'",
        path.replace('\'', "'\"'\"'")
    )
}
async fn config_file(root: &Path) -> Res<(PathBuf, String, String)> {
    let p = git(root, &["rev-parse", "--git-path", "config"]).await?;
    let path = root.join(p.trim());
    if !fs::symlink_metadata(&path)
        .map_err(err)?
        .file_type()
        .is_file()
    {
        return Err("Configuração precisa ser arquivo regular".into());
    }
    let text = fs::read_to_string(&path).map_err(err)?;
    let token = hash(format!("{}\0{}", root.display(), text));
    Ok((path, text, token))
}
async fn account(root: &Path) -> Res<Value> {
    let (_, _, token) = config_file(root).await?;
    let name = config(root, "user.name", false).await.unwrap_or_default();
    let email = config(root, "user.email", false).await.unwrap_or_default();
    let author = git(root, &["var", "GIT_AUTHOR_IDENT"])
        .await
        .unwrap_or_default();
    let parsed = regex::Regex::new(r"^(.*) <([^>]*)> ").map_err(err)?;
    let identity = parsed.captures(&author);
    let name = identity
        .as_ref()
        .and_then(|v| v.get(1))
        .map(|v| v.as_str().to_string())
        .unwrap_or(name);
    let email = identity
        .as_ref()
        .and_then(|v| v.get(2))
        .map(|v| v.as_str().to_string())
        .unwrap_or(email);
    let key = config(root, "phpide.sshKey", false)
        .await
        .unwrap_or_default();
    let command = config(root, "core.sshCommand", false)
        .await
        .unwrap_or_default();
    let mut remotes = vec![];
    let redact = regex::Regex::new(r"(https?://)[^/@\s]+@").map_err(err)?;
    for name in git(root, &["remote"]).await?.lines() {
        let fetch = git(root, &["remote", "get-url", "--", name]).await?;
        let push = git(root, &["remote", "get-url", "--push", "--", name]).await?;
        let clean = |v: &str| {
            redact
                .replace_all(v.trim(), "${1}[credencial omitida]@")
                .split(['?', '#'])
                .next()
                .unwrap_or("")
                .to_string()
        };
        remotes.push(json!({"name":name,"fetch":clean(&fetch),"push":clean(&push)}));
    }
    Ok(
        json!({"token":token,"name":name,"email":email,"localName":config(root,"user.name",true).await,"localEmail":config(root,"user.email",true).await,"username":config(root,"credential.username",false).await.unwrap_or_default(),"sshKey":if command==ssh(&key){key}else{String::new()},"sshConfigured":!command.is_empty(),"helperConfigured":config(root,"credential.helper",false).await.is_some(),"remotes":remotes}),
    )
}
struct Lock(PathBuf);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
async fn save_account(root: &Path, input: &Value) -> Res<Value> {
    let identity = s(&input["identity"])?;
    let auth = s(&input["authentication"])?;
    if !["local", "inherit"].contains(&identity)
        || !["keep", "https", "ssh", "inherit"].contains(&auth)
    {
        return Err("Configuração inválida".into());
    }
    for key in ["name", "email", "username", "sshKey"] {
        let v = s(&input[key])?;
        if v.len() > 4096 || v.contains(['\0', '\r', '\n']) {
            return Err("Campo inválido".into());
        }
    }
    if identity == "local"
        && (s(&input["name"])?.trim().is_empty()
            || !s(&input["email"])?.contains('@')
            || format!("{}{}", s(&input["name"])?, s(&input["email"])?).contains(['<', '>']))
    {
        return Err("Informe nome e e-mail válidos".into());
    }
    if auth == "ssh"
        && (!Path::new(s(&input["sshKey"])?).is_absolute()
            || !fs::metadata(s(&input["sshKey"])?).map_err(err)?.is_file())
    {
        return Err("Chave SSH inválida".into());
    }
    if auth == "https"
        && (s(&input["username"])?.trim().is_empty()
            || s(&input["username"])?.contains([':', '@', ' ', '\t']))
    {
        return Err("Usuário HTTPS inválido".into());
    }
    let (path, text, token) = config_file(root).await?;
    if input["token"] != token {
        return Err("Configuração mudou. Reabra o painel.".into());
    }
    let lock = path.with_file_name("config.lock");
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&lock)
        .map_err(err)?;
    let _guard = Lock(lock.clone());
    file.set_permissions(fs::metadata(&path).map_err(err)?.permissions())
        .map_err(err)?;
    file.write_all(text.as_bytes()).map_err(err)?;
    drop(file);
    let mut edits = vec![
        (
            "user.name",
            if identity == "local" {
                Some(s(&input["name"])?.trim().to_string())
            } else {
                None
            },
        ),
        (
            "user.email",
            if identity == "local" {
                Some(s(&input["email"])?.trim().to_string())
            } else {
                None
            },
        ),
    ];
    if auth != "keep" {
        edits.extend([
            (
                "core.sshCommand",
                if auth == "ssh" {
                    Some(ssh(s(&input["sshKey"])?))
                } else {
                    None
                },
            ),
            (
                "phpide.sshKey",
                if auth == "ssh" {
                    Some(s(&input["sshKey"])?.into())
                } else {
                    None
                },
            ),
            (
                "credential.username",
                if auth == "https" {
                    Some(s(&input["username"])?.into())
                } else {
                    None
                },
            ),
            (
                "credential.useHttpPath",
                if auth == "https" {
                    Some("true".into())
                } else {
                    None
                },
            ),
        ]);
    }
    for (key, value) in edits {
        let mut args = vec![
            "config".into(),
            "--file".into(),
            dunce::simplified(&lock).to_string_lossy().to_string(),
        ];
        if let Some(v) = value {
            args.extend(["--replace-all".into(), key.into(), v]);
            run(root, "git", &args, None).await?;
        } else if run(
            root,
            "git",
            &[
                "config".into(),
                "--file".into(),
                dunce::simplified(&lock).to_string_lossy().to_string(),
                "--get-all".into(),
                key.into(),
            ],
            None,
        )
        .await
        .is_ok()
        {
            args.extend(["--unset-all".into(), key.into()]);
            run(root, "git", &args, None).await?;
        }
    }
    if config_file(root).await?.2 != token {
        return Err("Configuração mudou durante gravação".into());
    }
    fs::rename(lock, path).map_err(err)?;
    account(root).await
}
pub async fn dispatch(root: &Path, method: &str, args: &[Value]) -> Res<Value> {
    repository(root).await?;
    let a = |i| args.get(i).unwrap_or(&Value::Null);
    match method {
        "gitStatus" => status(root).await,
        "gitEditorBase" => {
            let path = workspace::confined(root, s(a(0))?)?;
            let relative = path
                .strip_prefix(root)
                .map_err(err)?
                .to_str()
                .ok_or("Caminho inválido")?;
            let state = status(root).await?;
            let c = state["changes"]
                .as_array()
                .and_then(|v| v.iter().find(|v| v["path"] == relative));
            if state["head"].is_null() || c.is_some_and(|v| v["index"] == "?" || v["index"] == "A")
            {
                return Ok(json!({"text":"","label":"Novo arquivo → editor"}));
            }
            let original = c
                .and_then(|v| v["originalPath"].as_str())
                .unwrap_or(relative);
            let text = blob(root, &format!("HEAD:{}", original)).await?;
            Ok(json!({"text":text,"label":"HEAD → editor"}))
        }
        "gitLineInfo" => {
            let path = workspace::confined(root, s(a(0))?)?;
            let relative = path
                .strip_prefix(root)
                .map_err(err)?
                .to_str()
                .ok_or("Caminho inválido")?;
            let line = a(1).as_u64().filter(|n| *n > 0).ok_or("Linha inválida")?;
            let text = s(a(2))?;
            if text.len() > 2097152 || line as usize > text.split('\n').count() {
                return Err("Documento inválido".into());
            }
            let output = crate::process::run(
                root,
                "git",
                &[
                    "blame".into(),
                    "--line-porcelain".into(),
                    "-L".into(),
                    format!("{0},{0}", line),
                    "--contents".into(),
                    "-".into(),
                    "--".into(),
                    relative.into(),
                ],
                Some(text),
            )
            .await?;
            let hash = output.split_whitespace().next().unwrap_or("");
            let value = |key: &str| {
                output
                    .lines()
                    .find_map(|l| l.strip_prefix(key))
                    .unwrap_or("")
                    .to_string()
            };
            let timestamp = value("author-time ").parse::<i64>().unwrap_or(0);
            let date = chrono::DateTime::from_timestamp(timestamp, 0)
                .map(|d| d.to_rfc3339())
                .unwrap_or_default();
            Ok(
                json!({"hash":hash,"author":value("author "),"date":date,"summary":value("summary "),"uncommitted":hash.chars().all(|c|c=='0')}),
            )
        }
        "gitDiff" => diff(root, s(a(0))?, a(1).as_bool().ok_or("Comparação inválida")?).await,
        "gitStage" => {
            let path = s(a(0))?;
            let staged = a(1).as_bool().ok_or("Comparação inválida")?;
            let d = diff(root, path, staged).await?;
            if d["token"] != *a(2) {
                return Err("Diff mudou. Reabra antes de preparar.".into());
            }
            let state = status(root).await?;
            let c = change(&state, path)?;
            let mut argv = if !staged {
                vec!["add", "--"]
            } else if state["head"].is_null() {
                vec!["rm", "--cached", "-f", "--"]
            } else {
                vec!["reset", "-q", "HEAD", "--"]
            };
            argv.push(path);
            if let Some(old) = c["originalPath"].as_str() {
                argv.push(old);
            }
            git(root, &argv).await?;
            Ok(Value::Null)
        }
        "gitCommitMessage" => Ok(json!(git(root, &["log", "-1", "--format=%B"]).await?.trim_end())),
        "gitCommit" => {
            let amend = a(2).as_bool().unwrap_or(false);
            let message = s(a(0))?;
            if message.trim().is_empty() || message.len() > 10000 || message.contains('\0') {
                return Err("Mensagem inválida".into());
            }
            let state = status(root).await?;
            if state["indexToken"] != *a(1) {
                return Err("Index mudou. Revise novamente.".into());
            }
            let c = state["changes"].as_array().ok_or("Status inválido")?;
            if c.iter().any(conflicted) {
                return Err("Resolva os conflitos".into());
            }
            if amend && (state["head"].is_null() || !state["operation"].is_null() || !state["mergeHead"].is_null()) {
                return Err("Amend exige um commit e nenhuma operação em andamento".into());
            }
            if !amend && state["mergeHead"].is_null()
                && !c.iter().any(|v| v["index"] != " " && v["index"] != "?")
            {
                return Err("Nada preparado".into());
            }
            if amend { git(root, &["commit", "--amend", "-m", message]).await?; }
            else { git(root, &["commit", "-m", message]).await?; }
            Ok(json!(reference(root, "HEAD").await))
        }
        "gitLog" => {
            let requested = args.first().and_then(Value::as_str).unwrap_or("HEAD");
            if requested != "HEAD" && requested != "--all" {
                let refs = git(
                    root,
                    &[
                        "for-each-ref",
                        "--format=%(refname)",
                        "refs/heads",
                        "refs/remotes",
                    ],
                )
                .await?;
                if !refs.lines().any(|r| r == requested) {
                    return Err("Branch inválida para histórico".into());
                }
            }
            if reference(root, "HEAD").await.is_none() {
                return Ok(json!([]));
            }
            let output = git(
                root,
                &[
                    "log",
                    "-100",
                    "--topo-order",
                    "--format=%H%x00%an%x00%aI%x00%s%x00%P%x00%D%x00",
                    requested,
                    "--",
                ],
            )
            .await?;
            let p: Vec<_> = output.split('\0').collect();
            Ok(json!(p
                .chunks(6)
                .filter(|v| v.len() == 6)
                .map(|p| json!({"hash":p[0].trim(),"author":p[1],"date":p[2],"subject":p[3],"parents":p[4].split_whitespace().collect::<Vec<_>>(),"refs":p[5]}))
                .collect::<Vec<_>>()))
        }
        "gitBranches" => branches(root).await,
        "gitTools" => {
            let b = branches(root).await?;
            let r = git(root, &["remote"]).await?;
            let stash = git(root, &["stash", "list", "--format=%gd%x00%s"]).await?;
            Ok(
                json!({"branches":b,"remotes":r.lines().collect::<Vec<_>>(),"stashes":stash.lines().map(|l|{let(ref_,subject)=l.split_once('\0').unwrap_or((l,""));json!({"ref":ref_,"subject":subject})}).collect::<Vec<_>>()}),
            )
        }
        "gitHistory" => history(root, s(a(0))?).await,
        "gitHistoryDiff" => {
            let id = s(a(0))?;
            let path = s(a(1))?;
            let h = history(root, id).await?;
            let f = h["files"]
                .as_array()
                .ok_or("Histórico inválido")?
                .iter()
                .find(|v| v["path"] == path)
                .ok_or("Arquivo não pertence ao commit")?;
            let parent = h["parents"][0].as_str();
            let before = if parent.is_none() || f["status"] == "A" {
                String::new()
            } else {
                blob(
                    root,
                    &format!(
                        "{}:{}",
                        parent.unwrap_or(""),
                        f["oldPath"].as_str().unwrap_or(path)
                    ),
                )
                .await?
            };
            let after = if f["status"] == "D" {
                String::new()
            } else {
                blob(root, &format!("{}:{}", id, path)).await?
            };
            Ok(
                json!({"path":path,"before":before,"after":after,"beforeLabel":parent.unwrap_or("Árvore vazia").chars().take(8).collect::<String>(),"afterLabel":id.chars().take(8).collect::<String>(),"token":id}),
            )
        }
        "gitHunks" | "gitApplyHunk" => {
            let (token, prefix, chunks) =
                hunks(root, s(a(0))?, a(1).as_bool().ok_or("Comparação inválida")?).await?;
            if method == "gitHunks" {
                return Ok(
                    json!({"token":token,"hunks":chunks.iter().enumerate().map(|(id,patch)|json!({"id":id,"patch":patch})).collect::<Vec<_>>()}),
                );
            }
            if *a(2) != token {
                return Err("Diff mudou".into());
            }
            let index = a(3).as_u64().ok_or("Trecho inválido")? as usize;
            let patch = prefix + chunks.get(index).ok_or("Trecho inválido")?;
            let mut argv = vec!["apply".into(), "--cached".into(), "--unidiff-zero".into()];
            if a(1) == true {
                argv.push("--reverse".into());
            }
            let mut check = argv.clone();
            check.extend(["--check".into(), "-".into()]);
            run(root, "git", &check, Some(&patch)).await?;
            argv.push("-".into());
            run(root, "git", &argv, Some(&patch)).await?;
            Ok(Value::Null)
        }
        "gitConflict" => conflict(root, s(a(0))?).await,
        "gitResolve" => {
            let path = s(a(0))?;
            let text = s(a(1))?;
            let c = conflict(root, path).await?;
            if c["token"] != *a(2) {
                return Err("Conflito mudou".into());
            }
            if text.lines().any(|l| {
                ["<<<<<<<", "=======", ">>>>>>>", "|||||||"]
                    .iter()
                    .any(|m| l.starts_with(m))
            }) {
                return Err("Remova marcadores de conflito".into());
            }
            let f = workspace::read(root, path)?;
            workspace::save(root, path, text, s(&f["etag"])?)?;
            git(root, &["add", "--", path]).await?;
            Ok(Value::Null)
        }
        "gitResolveSide" => {
            // Aceita um lado inteiro; cobre também conflitos de exclusão e binários.
            let path = s(a(0))?;
            let side = s(a(1))?;
            let state = status(root).await?;
            if !conflicted(&change(&state, path)?) {
                return Err("Arquivo não está em conflito".into());
            }
            if state["indexToken"] != *a(2) {
                return Err("Conflito mudou".into());
            }
            let stage = match side {
                "ours" => "2",
                "theirs" => "3",
                _ => return Err("Lado inválido".into()),
            };
            let rows = git(root, &["ls-files", "--unmerged", "-z", "--", path]).await?;
            let present = rows.split('\0').any(|row| {
                row.split('\t').next().unwrap_or("").split(' ').nth(2) == Some(stage)
            });
            if present {
                // `checkout` não recebe GIT_LITERAL_PATHSPECS em process.rs.
                let literal = format!(":(literal){}", path);
                git(root, &["checkout", &format!("--{}", side), "--", &literal]).await?;
                git(root, &["add", "--", path]).await?;
            } else {
                git(root, &["rm", "-q", "-f", "--", path]).await?;
            }
            Ok(Value::Null)
        }
        "gitAccount" => account(root).await,
        "gitSaveAccount" => save_account(root, a(0)).await,
        "gitTestAccount" => {
            let state = account(root).await?;
            if state["token"] != *a(1) {
                return Err("Configuração mudou".into());
            }
            let remote = s(a(0))?;
            if remote.starts_with('-')
                || !state["remotes"]
                    .as_array()
                    .ok_or("Remotos inválidos")?
                    .iter()
                    .any(|r| r["name"] == remote)
            {
                return Err("Selecione remoto existente".into());
            }
            git(root, &["ls-remote", "--", remote])
                .await
                .map_err(|_| "Falha ao ler remoto. Confira URL, rede e credenciais.".to_string())?;
            Ok(json!(
                "Leitura do remoto concluída. Não comprova permissão de push ou a conta usada."
            ))
        }
        "gitOperation" => {
            let input = a(0);
            let state = status(root).await?;
            if state["head"] != input["expectedHead"] {
                return Err("HEAD mudou".into());
            }
            if input
                .get("expectedBranch")
                .is_some_and(|branch| branch != &state["branch"])
            {
                return Err("Branch atual mudou; reabra a lista de branches".into());
            }
            let kind = s(&input["kind"])?;
            let target = input["target"].as_str().unwrap_or("");
            if target.starts_with('-') || target.contains(['\0', '\r', '\n']) {
                return Err("Destino inválido".into());
            }
            if [
                "switch",
                "checkout-remote",
                "create-branch",
                "merge",
                "rebase",
                "cherry-pick",
                "revert",
                "pull",
                "stash-apply",
            ]
            .contains(&kind)
                && state["changes"].as_array().is_some_and(|v| !v.is_empty())
            {
                return Err("Faça commit ou stash antes desta operação".into());
            }
            let argv: Vec<String> = match kind {
                "create-branch" => {
                    git(root, &["check-ref-format", "--branch", target]).await?;
                    if input["checkout"] == false {
                        vec!["branch", "--", target]
                    } else {
                        vec!["switch", "-c", target]
                    }
                }
                "checkout-remote" => {
                    if !branches(root)
                        .await?
                        .as_array()
                        .ok_or("Branches inválidas")?
                        .iter()
                        .any(|b| b["remote"] == true && b["name"] == target)
                        || target.ends_with("/HEAD")
                    {
                        return Err("Selecione branch remota existente".into());
                    }
                    let remotes = git(root, &["remote"]).await?;
                    let remote = remotes
                        .lines()
                        .filter(|r| target.starts_with(&format!("{}/", r)))
                        .max_by_key(|r| r.len())
                        .ok_or("Remoto inválido")?;
                    let local = &target[remote.len() + 1..];
                    git(root, &["check-ref-format", "--branch", local]).await?;
                    // Never overwrite an existing local branch or reset local commits.
                    return Ok(json!(
                        git(
                            root,
                            &[
                                "switch",
                                "--track",
                                "-c",
                                local,
                                &format!("refs/remotes/{}", target)
                            ]
                        )
                        .await?
                    ));
                }
                "switch" | "delete-branch" | "merge" | "rebase" => {
                    if !branches(root)
                        .await?
                        .as_array()
                        .ok_or("Branches inválidas")?
                        .iter()
                        .any(|v| {
                            v["name"] == target && v["remote"] == false && v["current"] == false
                        })
                    {
                        return Err("Selecione branch local existente".into());
                    }
                    match kind {
                        "switch" => vec!["switch", "--no-guess", target],
                        "delete-branch" => vec!["branch", "-d", "--", target],
                        "merge" => vec!["merge", "--no-edit", target],
                        _ => vec!["rebase", target],
                    }
                }
                "cherry-pick" | "revert" => {
                    valid_hash(target)?;
                    if kind == "revert" {
                        vec!["revert", "--no-edit", target]
                    } else {
                        vec!["cherry-pick", target]
                    }
                }
                "fetch" => {
                    if target.is_empty() {
                        return Ok(json!(git(root, &["fetch", "--all"]).await?));
                    }
                    if !git(root, &["remote"]).await?.lines().any(|v| v == target) {
                        return Err("Remoto inválido".into());
                    }
                    vec!["fetch", "--", target]
                }
                "pull" => vec!["pull", "--ff-only", "--no-rebase"],
                "push" => {
                    let branch = s(&state["branch"])?;
                    let remote = config(root, &format!("branch.{}.remote", branch), false)
                        .await
                        .ok_or("Configure upstream")?;
                    let dest = config(root, &format!("branch.{}.merge", branch), false)
                        .await
                        .ok_or("Configure upstream")?;
                    if remote.starts_with('-') || !dest.starts_with("refs/heads/") {
                        return Err("Upstream inválido".into());
                    }
                    return Ok(json!(
                        run(
                            root,
                            "git",
                            &[
                                "push".into(),
                                "--porcelain".into(),
                                "--".into(),
                                remote,
                                format!("HEAD:{}", dest)
                            ],
                            None
                        )
                        .await?
                    ));
                }
                "stash" => vec![
                    "stash",
                    "push",
                    "--include-untracked",
                    "-m",
                    if target.is_empty() { "PHP IDE" } else { target },
                ],
                "stash-apply" => {
                    if !regex::Regex::new(r"^stash@\{\d+\}$")
                        .map_err(err)?
                        .is_match(target)
                    {
                        return Err("Stash inválido".into());
                    }
                    vec!["stash", "apply", "--index", target]
                }
                "merge-abort" => vec!["merge", "--abort"],
                "cherry-pick-abort" => vec!["cherry-pick", "--abort"],
                "revert-abort" => vec!["revert", "--abort"],
                "rebase-abort" => vec!["rebase", "--abort"],
                "rebase-continue" => vec!["-c", "core.editor=true", "rebase", "--continue"],
                _ => return Err("Operação não suportada".into()),
            }
            .into_iter()
            .map(String::from)
            .collect();
            Ok(json!(run(root, "git", &argv, None).await?))
        }
        _ => Err("Comando Git desconhecido".into()),
    }
}

#[cfg(test)]
#[path = "git_scenarios.rs"]
mod scenarios;
#[cfg(test)]
mod tests {
    use super::*;
    fn command(root: &Path, args: &[&str]) {
        let result = std::process::Command::new("git")
            .arg("-C")
            .arg(root)
            .args(args)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
    }
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        command(dir.path(), &["init", "-q", "-b", "main"]);
        command(dir.path(), &["config", "user.name", "Fixture"]);
        command(
            dir.path(),
            &["config", "user.email", "fixture@example.invalid"],
        );
        dir
    }
    #[tokio::test]
    async fn amend_preserves_unstaged_content_and_rejects_stale_review() {
        let dir = fixture(); let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("file.txt"), "initial").unwrap();
        command(&root, &["add", "."]);
        command(&root, &["commit", "-qm", "Subject\n\nFull message body"]);
        let original = status(&root).await.unwrap();
        assert_eq!(dispatch(&root, "gitCommitMessage", &[]).await.unwrap(), "Subject\n\nFull message body");
        fs::write(root.join("file.txt"), "unstaged").unwrap();
        let hash = dispatch(&root,"gitCommit",&[json!("Edited message"),original["indexToken"].clone(),json!(true)]).await.unwrap();
        assert_ne!(hash, original["head"]);
        assert_eq!(git(&root,&["show","HEAD:file.txt"]).await.unwrap(),"initial");
        assert_eq!(fs::read_to_string(root.join("file.txt")).unwrap(),"unstaged");
        assert_eq!(git(&root,&["rev-list","--count","HEAD"]).await.unwrap().trim(),"1");
        assert!(dispatch(&root,"gitCommit",&[json!("Stale"),original["indexToken"].clone(),json!(true)]).await.is_err());
        let diff = diff(&root,"file.txt",false).await.unwrap();
        dispatch(&root,"gitStage",&[json!("file.txt"),json!(false),diff["token"].clone()]).await.unwrap();
        let staged = status(&root).await.unwrap();
        dispatch(&root,"gitCommit",&[json!("Amended content"),staged["indexToken"].clone(),json!(true)]).await.unwrap();
        assert_eq!(git(&root,&["show","HEAD:file.txt"]).await.unwrap(),"unstaged");
        let empty = fixture(); let empty_root=empty.path().canonicalize().unwrap();
        let state=status(&empty_root).await.unwrap();
        assert!(dispatch(&empty_root,"gitCommit",&[json!("Invalid"),state["indexToken"].clone(),json!(true)]).await.is_err());
    }

    #[tokio::test]
    async fn branches_fetch_pull_and_tracking_preserve_local_commits() {
        let dir = fixture();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("a.txt"), "initial\n").unwrap();
        command(&root, &["add", "."]);
        command(&root, &["commit", "-qm", "Initial"]);
        let remote = tempfile::tempdir().unwrap();
        command(remote.path(), &["init", "--bare", "-q", "-b", "main"]);
        command(
            &root,
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        command(&root, &["push", "-qu", "origin", "main"]);
        async fn op(root: &Path, kind: &str, target: &str, checkout: bool) -> Res<Value> {
            let st = status(root).await?;
            dispatch(root,"gitOperation",&[json!({"kind":kind,"target":target,"checkout":checkout,"expectedHead":st["head"],"expectedBranch":st["branch"]})]).await
        }
        op(&root, "create-branch", "feature/new", false)
            .await
            .unwrap();
        assert_eq!(status(&root).await.unwrap()["branch"], "main");
        op(&root, "switch", "feature/new", true).await.unwrap();
        op(&root, "switch", "main", true).await.unwrap();
        op(&root, "delete-branch", "feature/new", true)
            .await
            .unwrap();
        assert!(op(&root, "create-branch", "bad..name", true).await.is_err());
        let peer = fixture();
        command(
            peer.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        );
        command(peer.path(), &["fetch", "-q", "origin"]);
        command(peer.path(), &["switch", "-q", "--track", "origin/main"]);
        fs::write(peer.path().join("remote.txt"), "incoming\n").unwrap();
        command(peer.path(), &["add", "."]);
        command(peer.path(), &["commit", "-qm", "Incoming"]);
        command(peer.path(), &["push", "-q", "origin", "main"]);
        command(peer.path(), &["branch", "feature/remote"]);
        command(peer.path(), &["push", "-q", "origin", "feature/remote"]);
        fs::write(root.join("a.txt"), "unsaved on disk\n").unwrap();
        let before = status(&root).await.unwrap();
        op(&root, "fetch", "", true).await.unwrap();
        assert_eq!(status(&root).await.unwrap()["head"], before["head"]);
        assert_eq!(
            fs::read_to_string(root.join("a.txt")).unwrap(),
            "unsaved on disk\n"
        );
        assert!(op(&root, "pull", "", true).await.is_err());
        fs::write(root.join("a.txt"), "initial\n").unwrap();
        op(&root, "pull", "", true).await.unwrap();
        assert!(root.join("remote.txt").exists());
        op(&root, "checkout-remote", "origin/feature/remote", true)
            .await
            .unwrap();
        assert_eq!(status(&root).await.unwrap()["branch"], "feature/remote");
        assert_eq!(
            config(&root, "branch.feature/remote.merge", false)
                .await
                .unwrap(),
            "refs/heads/feature/remote"
        );
        fs::write(root.join("local.txt"), "local\n").unwrap();
        command(&root, &["add", "."]);
        command(&root, &["commit", "-qm", "Local only"]);
        let local = status(&root).await.unwrap()["head"].clone();
        op(&root, "switch", "main", true).await.unwrap();
        assert!(op(&root, "delete-branch", "feature/remote", true)
            .await
            .is_err());
        assert!(op(&root, "checkout-remote", "origin/feature/remote", true)
            .await
            .is_err());
        assert_eq!(
            git(&root, &["rev-parse", "feature/remote"])
                .await
                .unwrap()
                .trim(),
            local.as_str().unwrap()
        );
        let st = status(&root).await.unwrap();
        assert!(dispatch(&root,"gitOperation",&[json!({"kind":"switch","target":"feature/remote","expectedHead":st["head"],"expectedBranch":"stale"})]).await.is_err());
        let main_log = dispatch(&root, "gitLog", &[json!("refs/heads/main")])
            .await
            .unwrap();
        assert!(!main_log
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["subject"] == "Local only"));
        let feature_log = dispatch(&root, "gitLog", &[json!("refs/heads/feature/remote")])
            .await
            .unwrap();
        assert!(feature_log
            .as_array()
            .unwrap()
            .iter()
            .any(|c| c["subject"] == "Local only"));
        for entry in feature_log.as_array().unwrap() {
            let parents = git(&root, &["show", "-s", "--format=%P", entry["hash"].as_str().unwrap()]).await.unwrap();
            assert_eq!(entry["parents"], json!(parents.split_whitespace().collect::<Vec<_>>()));
            assert!(entry["refs"].is_string());
        }
        assert!(dispatch(&root, "gitLog", &[json!("--help")]).await.is_err());
    }
    #[tokio::test]
    async fn editor_baseline_and_blame_include_unsaved_buffer() {
        let dir = fixture();
        let root = dir.path().canonicalize().unwrap();
        fs::write(root.join("a.php"), "<?php\nfirst();\nsecond();\n").unwrap();
        command(&root, &["add", "a.php"]);
        command(&root, &["commit", "-qm", "Original methods"]);
        let base = dispatch(&root, "gitEditorBase", &[json!("a.php")])
            .await
            .unwrap();
        assert_eq!(base["text"], "<?php\nfirst();\nsecond();\n");
        let info = dispatch(
            &root,
            "gitLineInfo",
            &[json!("a.php"), json!(2), base["text"].clone()],
        )
        .await
        .unwrap();
        assert_eq!(info["author"], "Fixture");
        assert_eq!(info["summary"], "Original methods");
        assert_eq!(info["uncommitted"], false);
        let modified = "<?php\nchanged();\nsecond();\n";
        let info = dispatch(
            &root,
            "gitLineInfo",
            &[json!("a.php"), json!(2), json!(modified)],
        )
        .await
        .unwrap();
        assert_eq!(info["uncommitted"], true);
        assert_eq!(
            fs::read_to_string(root.join("a.php")).unwrap(),
            base["text"].as_str().unwrap()
        );
        assert!(dispatch(
            &root,
            "gitLineInfo",
            &[json!("../escape"), json!(1), json!(modified)]
        )
        .await
        .is_err());
        assert!(dispatch(
            &root,
            "gitLineInfo",
            &[json!("a.php"), json!(0), json!(modified)]
        )
        .await
        .is_err());
        fs::write(root.join("new.php"), "<?php\n").unwrap();
        assert_eq!(
            dispatch(&root, "gitEditorBase", &[json!("new.php")])
                .await
                .unwrap()["text"],
            ""
        );
    }
    #[tokio::test]
    async fn staged_content_preserves_disk_and_rejects_stale() {
        let d = fixture();
        let root = d.path().canonicalize().unwrap();
        fs::write(root.join("file space.txt"), "initial\n").unwrap();
        command(&root, &["add", "."]);
        command(&root, &["commit", "-qm", "Initial"]);
        fs::write(root.join("file space.txt"), "index\n").unwrap();
        let diff = diff(&root, "file space.txt", false).await.unwrap();
        dispatch(
            &root,
            "gitStage",
            &[json!("file space.txt"), json!(false), diff["token"].clone()],
        )
        .await
        .unwrap();
        fs::write(root.join("file space.txt"), "disk\n").unwrap();
        let state = status(&root).await.unwrap();
        dispatch(
            &root,
            "gitCommit",
            &[json!("Preserve disk"), state["indexToken"].clone()],
        )
        .await
        .unwrap();
        assert_eq!(
            fs::read_to_string(root.join("file space.txt")).unwrap(),
            "disk\n"
        );
        assert_eq!(
            git(&root, &["show", "HEAD:file space.txt"]).await.unwrap(),
            "index\n"
        );
        assert!(dispatch(
            &root,
            "gitStage",
            &[json!("file space.txt"), json!(false), diff["token"].clone()]
        )
        .await
        .is_err());
    }
    #[tokio::test]
    async fn local_accounts_are_isolated_and_stale_config_rejected() {
        let a = fixture();
        let b = fixture();
        let root = a.path().canonicalize().unwrap();
        let other = b.path().canonicalize().unwrap();
        let before = fs::read(other.join(".git/config")).unwrap();
        let state = account(&root).await.unwrap();
        let input = json!({"token":state["token"],"identity":"local","name":"Company","email":"company@example.invalid","authentication":"https","username":"company","sshKey":""});
        let after = save_account(&root, &input).await.unwrap();
        assert_eq!(after["email"], "company@example.invalid");
        assert_eq!(after["username"], "company");
        assert_eq!(fs::read(other.join(".git/config")).unwrap(), before);
        assert!(save_account(&root, &input).await.is_err());
    }
    #[tokio::test]
    async fn rename_and_hunks_are_native() {
        let d = fixture();
        let root = d.path().canonicalize().unwrap();
        fs::write(
            root.join("a.txt"),
            (0..20).map(|n| format!("line {}\n", n)).collect::<String>(),
        )
        .unwrap();
        command(&root, &["add", "."]);
        command(&root, &["commit", "-qm", "Initial"]);
        let value = fs::read_to_string(root.join("a.txt"))
            .unwrap()
            .replace("line 1\n", "first\n")
            .replace("line 18\n", "second\n");
        fs::write(root.join("a.txt"), &value).unwrap();
        let data = dispatch(&root, "gitHunks", &[json!("a.txt"), json!(false)])
            .await
            .unwrap();
        assert_eq!(data["hunks"].as_array().unwrap().len(), 2);
        dispatch(
            &root,
            "gitApplyHunk",
            &[
                json!("a.txt"),
                json!(false),
                data["token"].clone(),
                json!(0),
            ],
        )
        .await
        .unwrap();
        let staged = git(&root, &["show", ":a.txt"]).await.unwrap();
        assert!(staged.contains("first"));
        assert!(!staged.contains("second"));
        assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), value);
    }
}

#[cfg(test)]
mod ignored_tree_tests {
    use super::*;
    #[tokio::test]
    async fn git_ignore_rules_tracked_exceptions_nested_and_literal_names() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();
        let literal = if cfg!(windows) { "line space.ignored" } else { "line\nname.ignored" };
        git(&root,&["init","-q"]).await.unwrap();
        fs::create_dir_all(root.join("node_modules/pkg")).unwrap();fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join(".gitignore"),"node_modules/\n*.ignored\nfolder/*\n!folder/keep.txt\n").unwrap();
        fs::write(root.join("node_modules/pkg/file.txt"),"fixture").unwrap();
        for path in ["cache.ignored","tracked.ignored","folder/drop.txt","folder/keep.txt","local.txt",literal] { fs::write(root.join(path),"fixture").unwrap(); }
        fs::write(root.join(".git/info/exclude"),"local.txt\n").unwrap();
        git(&root,&["add","-f","--","tracked.ignored"]).await.unwrap();
        let paths=json!(["node_modules","node_modules/pkg/file.txt","cache.ignored","tracked.ignored","folder/drop.txt","folder/keep.txt","local.txt",literal]);
        let found=ignored(&root,&paths).await.unwrap();let found=found.as_array().unwrap();
        for path in ["node_modules","node_modules/pkg/file.txt","cache.ignored","folder/drop.txt","local.txt",literal] { assert!(found.contains(&json!(path)),"{path}"); }
        assert!(!found.contains(&json!("tracked.ignored")));assert!(!found.contains(&json!("folder/keep.txt")));
        fs::write(root.join(".gitignore"),"").unwrap();assert_eq!(ignored(&root,&json!(["cache.ignored"])).await.unwrap(),json!([]));
        assert_eq!(ignored(&root,&json!(["removed-row.txt"])).await.unwrap(),json!([]));
    }
    #[tokio::test]
    async fn no_repository_has_no_ignored_status_and_outside_paths_are_rejected() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();fs::write(root.join("plain.txt"),"fixture").unwrap();
        assert_eq!(ignored(&root,&json!(["plain.txt"])).await.unwrap(),json!([]));
        assert!(ignored(&root,&json!(["../outside.txt"])).await.is_err());
        assert!(ignored(&root,&json!(["bad\0path"])).await.is_err());
    }
    #[test]
    fn project_tree_keeps_ignored_candidates_visible_without_recursing() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();
        for path in ["node_modules","dist","target",".cache",".git",".tools",".php-ide"] { fs::create_dir(root.join(path)).unwrap(); }
        let entries=workspace::tree(&root,"").unwrap();let entries=entries.as_array().unwrap();
        for path in ["node_modules","dist","target",".cache"]{assert!(entries.iter().any(|e|e["path"]==path));}
        assert_eq!(entries.len(),4);
    }
}
