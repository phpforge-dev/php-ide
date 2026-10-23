use crate::workspace::{err, Res};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};
pub async fn run(root: &Path, program: &str, args: &[String], input: Option<&str>) -> Res<String> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .current_dir(root)
        .kill_on_drop(true)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if program == "git" {
        for (key, _) in std::env::vars() {
            if key.starts_with("GIT_") {
                cmd.env_remove(key);
            }
        }
        cmd.env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_OPTIONAL_LOCKS", "0");
        if args.first().is_some_and(|a| {
            [
                "status",
                "diff",
                "diff-tree",
                "ls-files",
                "add",
                "reset",
                "rm",
            ]
            .contains(&a.as_str())
        }) {
            cmd.env("GIT_LITERAL_PATHSPECS", "1");
        }
    }
    let mut child = cmd.spawn().map_err(err)?;
    let mut stdin = child.stdin.take().ok_or("stdin indisponível")?;
    let bytes = input.unwrap_or("").as_bytes().to_vec();
    let send = tokio::spawn(async move {
        let _ = stdin.write_all(&bytes).await;
    });
    let mut stdout = child
        .stdout
        .take()
        .ok_or("stdout indisponível")?
        .take(2097153);
    let mut stderr = child
        .stderr
        .take()
        .ok_or("stderr indisponível")?
        .take(16384);
    let result = tokio::time::timeout(Duration::from_secs(30), async {
        let mut out = vec![];
        let mut error = vec![];
        tokio::try_join!(stdout.read_to_end(&mut out), stderr.read_to_end(&mut error))
            .map_err(err)?;
        if out.len() > 2097152 || error.len() >= 16384 {
            return Err("Saída do processo excedeu o limite".into());
        }
        let status = child.wait().await.map_err(err)?;
        if !status.success() {
            return Err(String::from_utf8_lossy(&error).chars().take(1500).collect());
        }
        String::from_utf8(out).map_err(err)
    })
    .await;
    send.abort();
    result.map_err(|_| "Processo excedeu 30 segundos".to_owned())?
}
pub async fn git(root: &Path, args: &[&str]) -> Res<String> {
    run(
        root,
        "git",
        &args.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
        None,
    )
    .await
}
