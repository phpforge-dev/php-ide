//! Syntax-only shell checks. Fixed executable and argv, clean environment, stdin buffer.
use crate::workspace::{confined, Res};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command};

fn dialect(path: &str, text: &str) -> Option<&'static str> {
    let first = text.lines().next().unwrap_or("");
    if let Some(line) = first.strip_prefix("#!") {
        let mut words = line.split_whitespace();
        let executable = Path::new(words.next()?).file_name()?.to_str()?;
        let name = if executable == "env" { let next = words.next()?; if next == "-S" { words.next()? } else { next } } else { executable };
        return match name { "bash" => Some("bash"), "sh" => Some("sh"), _ => None };
    }
    let name = Path::new(path).file_name()?.to_str()?;
    if name == ".profile" { return Some("sh"); }
    if [".bashrc", ".bash_profile", ".bash_login", ".bash_logout", ".bash_aliases"].contains(&name) || path.to_ascii_lowercase().ends_with(".sh") || path.to_ascii_lowercase().ends_with(".bash") { Some("bash") } else { None }
}
fn diagnostic(line: usize, code: &str, message: &str, severity: &str) -> Value {
    json!({"range":{"start":{"line":line,"character":0},"end":{"line":line,"character":1}},"code":code,"message":message,"severity":severity})
}
pub async fn validate(root: &Path, path: &str, text: &str) -> Res<Value> {
    confined(root, path)?;
    if text.len() > 1024 * 1024 { return Ok(json!([diagnostic(0,"bash.size","Análise Bash limitada a arquivos de até 1 MiB.","warning")])); }
    let kind = dialect(path, text).ok_or("Documento não reconhecido como Bash/sh")?;
    // Do not follow the shebang executable, source project files or inherit BASH_ENV/functions.
    let executable = if kind == "sh" { "/bin/sh" } else { "/bin/bash" };
    if !cfg!(unix) || !Path::new(executable).is_file() { return Ok(json!([diagnostic(0,"bash.unavailable","Verificação de sintaxe indisponível: shell do sistema não encontrado.","warning")])); }
    let mut command = Command::new(executable);
    if kind == "bash" { command.args(["--noprofile", "--norc"]); }
    command.args(["-n", "-s"]).env_clear().env("LC_ALL", "C").env("PATH", "/usr/bin:/bin").current_dir(root).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::piped()).kill_on_drop(true);
    let mut child = command.spawn().map_err(|_| "Não foi possível iniciar a verificação de sintaxe".to_string())?;
    let mut input = child.stdin.take().ok_or("Entrada do verificador indisponível")?;
    let output = tokio::time::timeout(Duration::from_secs(3), async {
        // Syntax errors can make the reader exit early; BrokenPipe still leaves useful stderr.
        let _ = input.write_all(text.as_bytes()).await;
        drop(input);
        child.wait_with_output().await
    }).await.map_err(|_| "Verificação de sintaxe excedeu 3 segundos".to_string())?.map_err(|_| "Falha ao verificar a sintaxe".to_string())?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    if output.status.success() && stderr.is_empty() { return Ok(json!([])); }
    let lines = text.lines().count().max(1);
    let finder = regex::Regex::new(r"line (\d+)").unwrap();
    let line = finder.captures(&stderr).and_then(|c| c[1].parse::<usize>().ok()).unwrap_or(lines).saturating_sub(1).min(lines - 1);
    let message = if output.status.success() { "Aviso do shell do sistema. Revise a sintaxe nesta linha." } else { "Sintaxe inválida para o shell do sistema. Revise esta linha, aspas e blocos anteriores." };
    Ok(json!([diagnostic(line,if output.status.success(){"bash.warning"}else{"bash.syntax"},message,if output.status.success(){"warning"}else{"error"})]))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn syntax_checks_buffers_without_execution() {
        if !cfg!(unix) { return; }
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();
        std::fs::write(root.join("script.sh"), "echo disk\n").unwrap();
        let marker=root.join("executed");
        let text=format!("#!/bin/bash\nsource /never/source/this\nname=$(touch '{}')\necho hello > '{}'\n",marker.display(),marker.display());
        assert_eq!(validate(&root,"script.sh",&text).await.unwrap(),json!([]));
        assert!(!marker.exists());
        assert_eq!(std::fs::read_to_string(root.join("script.sh")).unwrap(),"echo disk\n");
        let invalid=validate(&root,"script.sh","if true; then\n echo fixture-secret\n").await.unwrap();
        assert_eq!(invalid[0]["code"],"bash.syntax");
        assert!(!invalid.to_string().contains("fixture-secret"));
        assert_eq!(validate(&root,"script.sh","if true; then\n echo ok\nfi\n").await.unwrap(),json!([]));
    }
    #[tokio::test]
    async fn confines_paths_and_rejects_other_interpreters() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();std::fs::write(root.join("run"),"").unwrap();
        assert!(validate(&root,"run","#!/bin/zsh\necho hello").await.is_err());
        assert!(validate(&root,"../outside.sh","echo hello").await.is_err());
        assert_eq!(dialect("run","#!/usr/bin/env -S bash -e\n"),Some("bash"));
        assert_eq!(dialect("x.sh","#!/usr/bin/env python3\n"),None);
        assert_eq!(dialect(".profile",""),Some("sh"));
    }
    #[tokio::test]
    async fn quotes_substitutions_and_heredocs_use_real_shell_grammar() {
        if !cfg!(unix) { return; }
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();std::fs::write(root.join("fixture.sh"),"").unwrap();
        let script="#!/bin/bash\nname='literal'\ngreet() { printf '%s\\n' \"$name\"; }\nfor n in a b; do greet; done\ncat <<'EOF'\nif this is not code\nEOF\n";
        assert_eq!(validate(&root,"fixture.sh",script).await.unwrap(),json!([]));
        
    }
}
