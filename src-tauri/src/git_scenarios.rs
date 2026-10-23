//! Cenários Git locais (merge, rebase, cherry-pick, revert, stash) e remotos SSH/HTTPS
//! servidos por containers descartáveis (`scripts/check-git-remotes.mjs`).
use super::*;
use std::process::Command;

fn command(root: &Path, args: &[&str]) -> String {
    let result = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_EDITOR", "true")
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "git {:?}: {}",
        args,
        String::from_utf8_lossy(&result.stderr)
    );
    String::from_utf8_lossy(&result.stdout).trim().to_string()
}
fn repo() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().canonicalize().unwrap();
    for args in [
        &["init", "-q", "-b", "main"][..],
        &["config", "user.name", "Fixture"],
        &["config", "user.email", "fixture@example.invalid"],
        &["config", "commit.gpgsign", "false"],
        &["config", "core.autocrlf", "false"],
    ] {
        command(&root, args);
    }
    (dir, root)
}
fn commit(root: &Path, file: &str, text: &str, message: &str) -> String {
    fs::write(root.join(file), text).unwrap();
    command(root, &["add", "--", file]);
    command(root, &["commit", "-qm", message]);
    command(root, &["rev-parse", "HEAD"])
}
async fn op(root: &Path, kind: &str, target: &str) -> Res<Value> {
    let st = status(root).await?;
    dispatch(
        root,
        "gitOperation",
        &[json!({"kind":kind,"target":target,"expectedHead":st["head"],"expectedBranch":st["branch"]})],
    )
    .await
}
fn paths(state: &Value, conflicts: bool) -> Vec<String> {
    state["changes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|c| conflicted(c) == conflicts)
        .map(|c| c["path"].as_str().unwrap().to_string())
        .collect()
}
async fn resolve(root: &Path, path: &str, text: &str) -> Value {
    let c = dispatch(root, "gitConflict", &[json!(path)]).await.unwrap();
    dispatch(root, "gitResolve", &[json!(path), json!(text), c["token"].clone()])
        .await
        .unwrap();
    c
}
async fn commit_all(root: &Path, message: &str) -> Res<Value> {
    let st = status(root).await?;
    dispatch(root, "gitCommit", &[json!(message), st["indexToken"].clone()]).await
}
/// main e feature alteram a mesma linha de `a.txt`; feature também cria `f.txt`.
fn diverged() -> (tempfile::TempDir, PathBuf) {
    let (dir, root) = repo();
    commit(&root, "a.txt", "one\ntwo\nthree\n", "Base");
    command(&root, &["switch", "-qc", "feature"]);
    commit(&root, "a.txt", "one\nfeature\nthree\n", "Feature edit");
    commit(&root, "f.txt", "feature only\n", "Feature file");
    command(&root, &["switch", "-q", "main"]);
    commit(&root, "a.txt", "one\nmain\nthree\n", "Main edit");
    (dir, root)
}

#[tokio::test]
async fn merge_without_conflict_creates_merge_commit() {
    let (_d, root) = repo();
    commit(&root, "a.txt", "a\n", "Base");
    command(&root, &["switch", "-qc", "feature"]);
    commit(&root, "f.txt", "f\n", "Feature");
    command(&root, &["switch", "-q", "main"]);
    let main = commit(&root, "m.txt", "m\n", "Main");
    op(&root, "merge", "feature").await.unwrap();
    let st = status(&root).await.unwrap();
    assert!(st["changes"].as_array().unwrap().is_empty());
    assert!(st["mergeHead"].is_null());
    assert_eq!(st["operation"], Value::Null);
    let parents = command(&root, &["show", "-s", "--format=%P", "HEAD"]);
    assert_eq!(parents.split_whitespace().next(), Some(main.as_str()));
    assert_eq!(parents.split_whitespace().count(), 2);
    assert!(root.join("f.txt").exists());
    // Merge de branch já integrada ou da própria branch é recusado/no-op seguro.
    assert!(op(&root, "merge", "main").await.is_err());
    op(&root, "merge", "feature").await.unwrap();
    assert_eq!(status(&root).await.unwrap()["head"], st["head"]);
}

#[tokio::test]
async fn merge_conflict_resolves_commits_and_aborts() {
    let (_d, root) = diverged();
    assert!(op(&root, "merge", "feature").await.is_err());
    let st = status(&root).await.unwrap();
    assert_eq!(paths(&st, true), vec!["a.txt"]);
    assert_eq!(st["operation"], "merge");
    assert!(st["mergeHead"].is_string());
    // Commit e operações que mudam a árvore ficam bloqueados enquanto houver conflito.
    assert!(commit_all(&root, "Too early").await.unwrap_err().contains("conflitos"));
    assert!(op(&root, "rebase", "feature").await.is_err());
    assert!(diff(&root, "a.txt", false).await.is_err());
    let c = dispatch(&root, "gitConflict", &[json!("a.txt")]).await.unwrap();
    assert_eq!(c["operation"], "merge");
    assert_eq!(c["base"], "one\ntwo\nthree\n");
    assert_eq!(c["ours"], "one\nmain\nthree\n");
    assert_eq!(c["theirs"], "one\nfeature\nthree\n");
    assert_eq!(c["oursLabel"], "main");
    assert!(c["result"].as_str().unwrap().contains("<<<<<<<"));
    assert!(dispatch(&root, "gitResolve", &[json!("a.txt"), c["result"].clone(), c["token"].clone()])
        .await
        .unwrap_err()
        .contains("marcadores"));
    // Alteração externa do arquivo em conflito invalida o token da resolução.
    fs::write(root.join("a.txt"), "edited outside\n").unwrap();
    assert!(dispatch(&root, "gitResolve", &[json!("a.txt"), json!("x\n"), c["token"].clone()])
        .await
        .unwrap_err()
        .contains("mudou"));
    resolve(&root, "a.txt", "one\nmain\nfeature\nthree\n").await;
    let st = status(&root).await.unwrap();
    assert!(paths(&st, true).is_empty());
    let head = commit_all(&root, "Merge feature").await.unwrap();
    assert_eq!(command(&root, &["show", "-s", "--format=%P", head.as_str().unwrap()]).split_whitespace().count(), 2);
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\nmain\nfeature\nthree\n");
    assert!(status(&root).await.unwrap()["mergeHead"].is_null());

    // Abort restaura HEAD e a árvore anteriores.
    let (_d2, root) = diverged();
    let before = status(&root).await.unwrap();
    assert!(op(&root, "merge", "feature").await.is_err());
    op(&root, "merge-abort", "").await.unwrap();
    let st = status(&root).await.unwrap();
    assert!(st["changes"].as_array().unwrap().is_empty());
    assert_eq!(st["head"], before["head"]);
    assert_eq!(st["operation"], Value::Null);
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\nmain\nthree\n");
}

#[tokio::test]
async fn rebase_conflict_continue_and_abort() {
    let (_d, root) = diverged();
    let main = command(&root, &["rev-parse", "main"]);
    command(&root, &["switch", "-q", "feature"]);
    assert!(op(&root, "rebase", "main").await.is_err());
    let st = status(&root).await.unwrap();
    assert_eq!(st["operation"], "rebase");
    assert!(st["branch"].as_str().unwrap().starts_with("HEAD destacado"));
    assert_eq!(paths(&st, true), vec!["a.txt"]);
    let c = resolve(&root, "a.txt", "one\nmain+feature\nthree\n").await;
    assert_eq!(c["operation"], "rebase");
    assert_eq!(c["ours"], "one\nmain\nthree\n");
    assert_eq!(c["theirs"], "one\nfeature\nthree\n");
    // Continuar com conflito ainda aberto falharia; aqui já foi resolvido e o segundo commit aplica limpo.
    op(&root, "rebase-continue", "").await.unwrap();
    let st = status(&root).await.unwrap();
    assert_eq!(st["branch"], "feature");
    assert_eq!(st["operation"], Value::Null);
    assert!(st["changes"].as_array().unwrap().is_empty());
    let log = command(&root, &["log", "--format=%s", "main..feature"]);
    assert_eq!(log.lines().collect::<Vec<_>>(), vec!["Feature file", "Feature edit"]);
    assert_eq!(command(&root, &["merge-base", "main", "feature"]), main);
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\nmain+feature\nthree\n");
    // Abort depois de resolver parcialmente volta à branch original.
    let (_d2, root) = diverged();
    command(&root, &["switch", "-q", "feature"]);
    assert!(op(&root, "rebase", "main").await.is_err());
    resolve(&root, "a.txt", "resolved\n").await;
    assert!(op(&root, "rebase-abort", "").await.is_ok());
    let st = status(&root).await.unwrap();
    assert_eq!(st["branch"], "feature");
    assert_eq!(st["operation"], Value::Null);
    assert_eq!(st["head"].as_str().unwrap(), command(&root, &["rev-parse", "feature"]));
    assert_ne!(st["head"].as_str().unwrap(), main);
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "one\nfeature\nthree\n");
}

#[tokio::test]
async fn rebase_continue_rejects_unresolved_and_skips_empty_commit() {
    let (_d, root) = diverged();
    command(&root, &["switch", "-q", "feature"]);
    assert!(op(&root, "rebase", "main").await.is_err());
    // Continuar sem resolver mantém o rebase e o conflito.
    assert!(op(&root, "rebase-continue", "").await.is_err());
    assert_eq!(status(&root).await.unwrap()["operation"], "rebase");
    // Resolver ficando igual à base (commit vazio) não deixa o rebase preso.
    resolve(&root, "a.txt", "one\nmain\nthree\n").await;
    op(&root, "rebase-continue", "").await.unwrap();
    let st = status(&root).await.unwrap();
    assert_eq!(st["branch"], "feature");
    assert_eq!(st["operation"], Value::Null);
    assert_eq!(command(&root, &["log", "--format=%s", "main..feature"]), "Feature file");
}

#[tokio::test]
async fn cherry_pick_clean_conflict_commit_and_abort() {
    let (_d, root) = diverged();
    let file = command(&root, &["rev-parse", "feature"]);
    let edit = command(&root, &["rev-parse", "feature~1"]);
    op(&root, "cherry-pick", &file).await.unwrap();
    assert_eq!(command(&root, &["log", "-1", "--format=%s"]), "Feature file");
    assert!(op(&root, "cherry-pick", "feature").await.unwrap_err().contains("Commit inválido"));
    assert!(op(&root, "cherry-pick", &edit).await.is_err());
    let st = status(&root).await.unwrap();
    assert_eq!(st["operation"], "cherry-pick");
    let c = resolve(&root, "a.txt", "one\npicked\nthree\n").await;
    assert_eq!(c["operation"], "cherry-pick");
    assert_eq!(c["theirsLabel"], &edit[..8]);
    commit_all(&root, "Feature edit (picked)").await.unwrap();
    let st = status(&root).await.unwrap();
    assert_eq!(st["operation"], Value::Null);
    assert!(reference(&root, "CHERRY_PICK_HEAD").await.is_none());
    assert_eq!(command(&root, &["show", "HEAD:a.txt"]), "one\npicked\nthree");

    let (_d2, root) = diverged();
    let head = command(&root, &["rev-parse", "HEAD"]);
    let edit = command(&root, &["rev-parse", "feature~1"]);
    assert!(op(&root, "cherry-pick", &edit).await.is_err());
    op(&root, "cherry-pick-abort", "").await.unwrap();
    let st = status(&root).await.unwrap();
    assert_eq!(st["operation"], Value::Null);
    assert_eq!(st["head"].as_str().unwrap(), head);
    assert!(st["changes"].as_array().unwrap().is_empty());
    // Abort sem operação em andamento falha sem alterar nada.
    assert!(op(&root, "cherry-pick-abort", "").await.is_err());
    assert!(op(&root, "merge-abort", "").await.is_err());
}

#[tokio::test]
async fn delete_and_binary_conflicts_accept_a_side() {
    let binary = if cfg!(windows) { "bin literal.dat" } else { "bin*.dat" };
    let (_d, root) = repo();
    commit(&root, "gone.txt", "base\n", "Base");
    fs::write(root.join(binary), [0u8, 1, 2]).unwrap();
    fs::write(root.join("bin1.dat"), [9u8]).unwrap();
    command(&root, &["add", "."]);
    command(&root, &["commit", "-qm", "Binary"]);
    command(&root, &["switch", "-qc", "feature"]);
    command(&root, &["rm", "-q", "gone.txt"]);
    fs::write(root.join(binary), [0u8, 3]).unwrap();
    command(&root, &["commit", "-qam", "Delete and binary"]);
    command(&root, &["switch", "-q", "main"]);
    fs::write(root.join("gone.txt"), "edited\n").unwrap();
    fs::write(root.join(binary), [0u8, 4]).unwrap();
    fs::write(root.join("bin1.dat"), [8u8]).unwrap();
    command(&root, &["commit", "-qam", "Edit both"]);
    assert!(op(&root, "merge", "feature").await.is_err());
    let st = status(&root).await.unwrap();
    let mut conflicts = paths(&st, true);
    conflicts.sort();
    assert_eq!(conflicts, vec![binary, "gone.txt"]);
    // O merge editor textual recusa; aceitar um lado resolve.
    assert!(dispatch(&root, "gitConflict", &[json!("gone.txt")]).await.is_err());
    assert!(dispatch(&root, "gitConflict", &[json!(binary)]).await.is_err());
    assert!(dispatch(&root, "gitResolveSide", &[json!("gone.txt"), json!("left"), st["indexToken"].clone()]).await.is_err());
    assert!(dispatch(&root, "gitResolveSide", &[json!("gone.txt"), json!("theirs"), json!("stale")]).await.is_err());
    dispatch(&root, "gitResolveSide", &[json!("gone.txt"), json!("theirs"), st["indexToken"].clone()]).await.unwrap();
    assert!(!root.join("gone.txt").exists());
    let st = status(&root).await.unwrap();
    dispatch(&root, "gitResolveSide", &[json!(binary), json!("theirs"), st["indexToken"].clone()]).await.unwrap();
    assert_eq!(fs::read(root.join(binary)).unwrap(), vec![0u8, 3]);
    // Pathspec literal: `bin1.dat` (casaria com o glob) fica intacto.
    assert_eq!(fs::read(root.join("bin1.dat")).unwrap(), vec![8u8]);
    assert!(paths(&status(&root).await.unwrap(), true).is_empty());
    commit_all(&root, "Merge").await.unwrap();
    assert!(command(&root, &["ls-files"]).lines().all(|l| l != "gone.txt"));

    // Lado "ours" mantém o arquivo editado.
    let (_d2, root) = repo();
    commit(&root, "gone.txt", "base\n", "Base");
    command(&root, &["switch", "-qc", "feature"]);
    command(&root, &["rm", "-q", "gone.txt"]);
    command(&root, &["commit", "-qm", "Delete"]);
    command(&root, &["switch", "-q", "main"]);
    commit(&root, "gone.txt", "edited\n", "Edit");
    assert!(op(&root, "merge", "feature").await.is_err());
    let st = status(&root).await.unwrap();
    dispatch(&root, "gitResolveSide", &[json!("gone.txt"), json!("ours"), st["indexToken"].clone()]).await.unwrap();
    assert_eq!(fs::read_to_string(root.join("gone.txt")).unwrap(), "edited\n");
    commit_all(&root, "Merge").await.unwrap();
}

#[tokio::test]
async fn revert_conflict_and_abort() {
    let (_d, root) = repo();
    commit(&root, "a.txt", "v1\n", "One");
    let target = commit(&root, "a.txt", "v2\n", "Two");
    commit(&root, "a.txt", "v3\n", "Three");
    let head = command(&root, &["rev-parse", "HEAD"]);
    assert!(op(&root, "revert", &target).await.is_err());
    let st = status(&root).await.unwrap();
    assert_eq!(st["operation"], "revert");
    assert_eq!(dispatch(&root, "gitConflict", &[json!("a.txt")]).await.unwrap()["operation"], "revert");
    op(&root, "revert-abort", "").await.unwrap();
    let st = status(&root).await.unwrap();
    assert_eq!(st["head"].as_str().unwrap(), head);
    assert_eq!(st["operation"], Value::Null);
    assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "v3\n");
}

#[tokio::test]
async fn stash_apply_conflict_keeps_stash_and_resolves() {
    let (_d, root) = repo();
    commit(&root, "a.txt", "base\n", "Base");
    fs::write(root.join("a.txt"), "stashed\n").unwrap();
    fs::write(root.join("new.txt"), "untracked\n").unwrap();
    op(&root, "stash", "work in progress").await.unwrap();
    assert!(status(&root).await.unwrap()["changes"].as_array().unwrap().is_empty());
    assert!(!root.join("new.txt").exists());
    commit(&root, "a.txt", "committed\n", "Diverge");
    // Aplicar com alterações locais é recusado antes de tocar a árvore.
    fs::write(root.join("dirty.txt"), "x").unwrap();
    assert!(op(&root, "stash-apply", "stash@{0}").await.unwrap_err().contains("stash"));
    fs::remove_file(root.join("dirty.txt")).unwrap();
    assert!(op(&root, "stash-apply", "stash@{0}; rm").await.is_err());
    assert!(op(&root, "stash-apply", "stash@{0}").await.is_err());
    let st = status(&root).await.unwrap();
    assert_eq!(paths(&st, true), vec!["a.txt"]);
    assert_eq!(st["operation"], "conflict");
    let c = dispatch(&root, "gitConflict", &[json!("a.txt")]).await.unwrap();
    assert_eq!(c["ours"], "committed\n");
    assert_eq!(c["theirs"], "stashed\n");
    assert_eq!(c["operation"], "conflict");
    resolve(&root, "a.txt", "committed\nstashed\n").await;
    assert_eq!(fs::read_to_string(root.join("new.txt")).unwrap(), "untracked\n");
    let tools = dispatch(&root, "gitTools", &[]).await.unwrap();
    assert_eq!(tools["stashes"].as_array().unwrap().len(), 1, "apply preserva o stash");
    assert!(tools["stashes"][0]["subject"].as_str().unwrap().contains("work in progress"));
    commit_all(&root, "Apply stash").await.unwrap();
    assert_eq!(status(&root).await.unwrap()["operation"], Value::Null);
}

#[tokio::test]
async fn stash_with_staged_changes_conflict_reports_without_partial_state() {
    let (_d, root) = repo();
    commit(&root, "a.txt", "base\n", "Base");
    fs::write(root.join("a.txt"), "staged\n").unwrap();
    command(&root, &["add", "a.txt"]);
    op(&root, "stash", "").await.unwrap();
    commit(&root, "a.txt", "committed\n", "Diverge");
    let head = command(&root, &["rev-parse", "HEAD"]);
    let result = op(&root, "stash-apply", "stash@{0}").await;
    let st = status(&root).await.unwrap();
    match result {
        // Git recusa `--index` com conflito no index: nada deve ter mudado.
        Err(e) if st["changes"].as_array().unwrap().is_empty() => {
            assert!(!e.is_empty());
            assert_eq!(fs::read_to_string(root.join("a.txt")).unwrap(), "committed\n");
        }
        _ => assert_eq!(paths(&st, true), vec!["a.txt"]),
    }
    assert_eq!(st["head"].as_str().unwrap(), head);
}

#[tokio::test]
async fn operations_reject_stale_head_or_branch() {
    let (_d, root) = diverged();
    let st = status(&root).await.unwrap();
    // Outro processo comita entre a leitura do estado e a operação.
    commit(&root, "z.txt", "z\n", "Concurrent");
    let stale = dispatch(&root, "gitOperation", &[json!({"kind":"merge","target":"feature","expectedHead":st["head"],"expectedBranch":st["branch"]})]).await;
    assert!(stale.unwrap_err().contains("HEAD mudou"));
    let st = status(&root).await.unwrap();
    command(&root, &["switch", "-q", "feature"]);
    command(&root, &["switch", "-q", "main"]);
    let wrong = dispatch(&root, "gitOperation", &[json!({"kind":"merge","target":"feature","expectedHead":st["head"],"expectedBranch":"feature"})]).await;
    assert!(wrong.unwrap_err().contains("Branch atual mudou"));
    assert!(status(&root).await.unwrap()["mergeHead"].is_null());
}

// ---- Remotos SSH/HTTPS reais em container descartável ----

struct Remote {
    ssh: String,
    https: String,
    key: String,
    known_hosts: String,
    ca: String,
    user: String,
}
fn remote_fixture() -> Option<Remote> {
    let v: Value = serde_json::from_str(&std::env::var("PHP_IDE_TEST_GIT_REMOTES").ok()?).ok()?;
    let f = |k: &str| v[k].as_str().unwrap().to_string();
    Some(Remote {
        ssh: f("ssh"),
        https: f("https"),
        key: f("key"),
        known_hosts: f("knownHosts"),
        ca: f("ca"),
        user: f("user"),
    })
}
async fn save(root: &Path, input: Value) -> Res<Value> {
    let state = account(root).await?;
    let mut input = input;
    input["token"] = state["token"].clone();
    for key in ["name", "email", "username", "sshKey"] {
        if input[key].is_null() {
            input[key] = json!("");
        }
    }
    save_account(root, &input).await
}
async fn test_remote(root: &Path, name: &str) -> Res<Value> {
    let state = account(root).await?;
    dispatch(root, "gitTestAccount", &[json!(name), state["token"].clone()]).await
}
/// Push, fetch e pull fast-forward entre dois clones locais através do remoto `origin`.
async fn round_trip(a: &Path, b: &Path, branch: &str) {
    commit(a, "remote.txt", &format!("{branch} 1\n"), "Remote one");
    command(a, &["switch", "-qc", branch]);
    command(a, &["config", &format!("branch.{branch}.remote"), "origin"]);
    command(a, &["config", &format!("branch.{branch}.merge"), &format!("refs/heads/{branch}")]);
    let pushed = op(a, "push", "").await.unwrap();
    assert!(pushed.as_str().unwrap().contains(&format!("refs/heads/{branch}")), "{pushed}");
    op(b, "fetch", "origin").await.unwrap();
    op(b, "checkout-remote", &format!("origin/{branch}")).await.unwrap();
    assert_eq!(fs::read_to_string(b.join("remote.txt")).unwrap(), format!("{branch} 1\n"));
    commit(a, "remote.txt", &format!("{branch} 2\n"), "Remote two");
    op(a, "push", "").await.unwrap();
    op(b, "pull", "").await.unwrap();
    assert_eq!(fs::read_to_string(b.join("remote.txt")).unwrap(), format!("{branch} 2\n"));
    // Pull só avança: histórico divergente é recusado sem merge implícito.
    commit(a, "remote.txt", &format!("{branch} 3\n"), "Remote three");
    op(a, "push", "").await.unwrap();
    commit(b, "local.txt", "local\n", "Local diverge");
    let local = command(b, &["rev-parse", "HEAD"]);
    assert!(op(b, "pull", "").await.is_err());
    assert_eq!(command(b, &["rev-parse", "HEAD"]), local);
    // Push não força: rejeitado e nada muda no remoto.
    assert!(op(b, "push", "").await.is_err());
    op(b, "fetch", "origin").await.unwrap();
    assert_eq!(
        command(b, &["rev-parse", &format!("origin/{branch}")]),
        command(a, &["rev-parse", "HEAD"])
    );
}

#[tokio::test]
#[ignore]
async fn live_ssh_remote() {
    let Some(r) = remote_fixture() else {
        panic!("PHP_IDE_TEST_GIT_REMOTES ausente; use scripts/check-git-remotes.mjs")
    };
    let (_a, a) = repo();
    let (_b, b) = repo();
    for root in [&a, &b] {
        command(root, &["remote", "add", "origin", &r.ssh]);
    }
    // Sem perfil SSH a chave do usuário não é usada (IdentitiesOnly) e host desconhecido falha sem prompt.
    let unknown = save(&a, json!({"identity":"inherit","authentication":"ssh","sshKey":r.key})).await.unwrap();
    assert_eq!(unknown["sshKey"], r.key);
    // Isola de ~/.ssh do usuário: nenhum known_hosts real é lido ou gravado.
    let product = config(&a, "core.sshCommand", true).await.unwrap();
    command(&a, &["config", "core.sshCommand", &format!("{product} -F /dev/null -o UserKnownHostsFile=/dev/null")]);
    let started = std::time::Instant::now();
    assert!(test_remote(&a, "origin").await.is_err(), "host key desconhecida aceita");
    assert!(started.elapsed().as_secs() < 25, "ssh pediu confirmação");
    command(&a, &["config", "core.sshCommand", &product]);
    for root in [&a, &b] {
        if root != &a {
            save(root, json!({"identity":"inherit","authentication":"ssh","sshKey":r.key})).await.unwrap();
        }
        let ssh = config(root, "core.sshCommand", true).await.unwrap();
        command(root, &["config", "core.sshCommand", &format!("{ssh} -F /dev/null -o StrictHostKeyChecking=yes -o UserKnownHostsFile='{}'", r.known_hosts)]);
    }
    assert!(test_remote(&a, "origin").await.unwrap().as_str().unwrap().contains("Leitura do remoto concluída"));
    // Chave errada é rejeitada pelo servidor.
    let (_c, c) = repo();
    command(&c, &["remote", "add", "origin", &r.ssh]);
    let wrong = c.join("wrong");
    let gen = Command::new("ssh-keygen").args(["-q", "-t", "ed25519", "-N", "", "-f"]).arg(&wrong).status().unwrap();
    assert!(gen.success());
    save(&c, json!({"identity":"inherit","authentication":"ssh","sshKey":wrong})).await.unwrap();
    let ssh = config(&c, "core.sshCommand", true).await.unwrap();
    command(&c, &["config", "core.sshCommand", &format!("{ssh} -F /dev/null -o StrictHostKeyChecking=yes -o UserKnownHostsFile='{}'", r.known_hosts)]);
    assert!(test_remote(&c, "origin").await.is_err(), "chave não autorizada aceita");
    round_trip(&a, &b, "ssh-branch").await;
}

#[tokio::test]
#[ignore]
async fn live_https_remote() {
    let Some(r) = remote_fixture() else {
        panic!("PHP_IDE_TEST_GIT_REMOTES ausente; use scripts/check-git-remotes.mjs")
    };
    let password = std::env::var("PHP_IDE_TEST_GIT_PASSWORD").unwrap();
    let helper = std::env::var("PHP_IDE_TEST_GIT_HELPER").unwrap();
    let (_a, a) = repo();
    let (_b, b) = repo();
    for root in [&a, &b] {
        command(root, &["config", "credential.helper", ""]);
        command(root, &["remote", "add", "origin", &r.https]);
        command(root, &["config", "http.sslCAInfo", &r.ca]);
    }
    // TLS sem CA confiável falha; sem credencial falha sem prompt (GIT_TERMINAL_PROMPT=0).
    // `credential.helper=""` zera helpers herdados (ex.: osxkeychain do sistema) para não tocar o chaveiro real.
    let (_c, c) = repo();
    command(&c, &["config", "credential.helper", ""]);
    command(&c, &["remote", "add", "origin", &r.https]);
    assert!(test_remote(&c, "origin").await.is_err(), "certificado não confiável aceito");
    command(&c, &["config", "http.sslCAInfo", &r.ca]);
    let started = std::time::Instant::now();
    assert!(test_remote(&c, "origin").await.is_err(), "acesso sem credencial");
    assert!(started.elapsed().as_secs() < 25, "pedido de senha travou");
    // Credencial embutida na URL é omitida no painel.
    command(&c, &["remote", "add", "leak", &r.https.replacen("https://", &format!("https://{}:{}@", r.user, password), 1)]);
    let shown = account(&c).await.unwrap().to_string();
    assert!(!shown.contains(&password), "senha exposta: {shown}");
    assert!(shown.contains("[credencial omitida]"));
    // Senha errada pelo helper é rejeitada.
    command(&c, &["config", "--add", "credential.helper", &format!("{helper} wrong")]);
    save(&c, json!({"identity":"inherit","authentication":"https","username":r.user})).await.unwrap();
    assert!(test_remote(&c, "origin").await.is_err(), "senha errada aceita");
    for root in [&a, &b] {
        save(root, json!({"identity":"inherit","authentication":"https","username":r.user})).await.unwrap();
        // Helper de teste lê a senha do ambiente; nada é gravado em arquivo.
        command(root, &["config", "--add", "credential.helper", &helper]);
    }
    for root in [&a, &b] {
        let text = fs::read_to_string(root.join(".git/config")).unwrap();
        assert!(!text.contains(&password), "senha persistida");
    }
    assert!(test_remote(&a, "origin").await.unwrap().as_str().unwrap().contains("Leitura do remoto concluída"));
    round_trip(&a, &b, "https-branch").await;
}
