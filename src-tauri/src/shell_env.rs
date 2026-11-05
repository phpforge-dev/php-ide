//! Apps opened from Finder/Dock get launchd's minimal environment, so tools set up in the
//! user's shell profile (nvm, asdf, pyenv, Homebrew) are missing. Git hooks such as husky
//! then fail with `npm: command not found`. Read the environment of the user's login and
//! interactive shell once at startup, as terminal-launched apps already inherit it.
use std::ffi::OsString;
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const MARKER: &str = "__PHP_IDE_SHELL_ENV__";
const TIMEOUT: Duration = Duration::from_secs(5);
/// Shell bookkeeping that must not leak into the IDE process.
const SKIP: &[&str] = &["PWD", "OLDPWD", "SHLVL", "_", "PHP_IDE_RESOLVING_SHELL_ENV"];

/// Parse `env -0` output framed by markers; profile noise before/after is ignored.
pub(crate) fn parse(output: &[u8]) -> Option<Vec<(String, String)>> {
    let text = String::from_utf8_lossy(output);
    let start = text.find(MARKER)? + MARKER.len();
    let end = start + text[start..].find(MARKER)?;
    Some(
        text[start..end]
            .split('\0')
            .filter_map(|entry| entry.split_once('='))
            .filter(|(key, _)| !key.is_empty() && !SKIP.contains(key))
            .map(|(key, value)| (key.to_owned(), value.to_owned()))
            .collect(),
    )
}

/// Login-shell PATH entries first, then any current entry the shell did not list.
pub(crate) fn merge_path(shell: &str, current: Option<OsString>) -> Option<OsString> {
    let mut paths: Vec<_> = std::env::split_paths(shell).collect();
    for path in current.iter().flat_map(std::env::split_paths) {
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    std::env::join_paths(paths).ok()
}

#[cfg(unix)]
fn capture() -> Option<Vec<(String, String)>> {
    // A terminal launch (dev, smoke tests, `open` from a shell) already carries the shell
    // environment; keep it exactly. Also avoid recursion and let users opt out.
    if std::env::var_os("TERM").is_some()
        || std::env::var_os("PHP_IDE_RESOLVING_SHELL_ENV").is_some()
        || std::env::var("PHP_IDE_SHELL_ENV").as_deref() == Ok("0")
    {
        return None;
    }
    let shell = std::env::var("SHELL").ok().filter(|s| s.starts_with('/')).unwrap_or_else(|| "/bin/zsh".into());
    let script = format!("printf '%s' {MARKER}; /usr/bin/env -0; printf '%s' {MARKER}");
    let mut child = Command::new(&shell)
        .args(["-i", "-l", "-c", &script])
        .env("PHP_IDE_RESOLVING_SHELL_ENV", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        let _ = stdout.read_to_end(&mut buffer);
        buffer
    });
    let deadline = Instant::now() + TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                eprintln!("php-ide: shell environment from {shell} timed out; using the launch PATH");
                return None;
            }
        }
    }
    parse(&reader.join().ok()?)
}

#[cfg(not(unix))]
fn capture() -> Option<Vec<(String, String)>> {
    None
}

/// Must run before any other thread starts: it mutates the process environment.
pub(crate) fn import() {
    let Some(vars) = capture() else { return };
    for (key, value) in vars {
        if key == "PATH" {
            if let Some(path) = merge_path(&value, std::env::var_os("PATH")) {
                std::env::set_var("PATH", path);
            }
        } else if std::env::var_os(&key).is_none() {
            std::env::set_var(key, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_framed_env_and_ignores_profile_noise() {
        let output = format!("welcome!\n{MARKER}PATH=/nvm/bin:/usr/bin\0NVM_DIR=/home/.nvm\0SHLVL=2\0EMPTY=\0MULTI=a\nb\0{MARKER}bye");
        let vars = parse(output.as_bytes()).unwrap();
        assert_eq!(
            vars,
            vec![
                ("PATH".into(), "/nvm/bin:/usr/bin".into()),
                ("NVM_DIR".into(), "/home/.nvm".into()),
                ("EMPTY".into(), "".into()),
                ("MULTI".into(), "a\nb".into()),
            ]
        );
        assert!(parse(b"no markers here").is_none());
    }

    #[test]
    fn shell_path_first_then_launch_only_entries() {
        let merged = merge_path("/nvm/bin:/usr/bin", Some("/usr/bin:/opt/homebrew/bin".into())).unwrap();
        assert_eq!(merged, OsString::from("/nvm/bin:/usr/bin:/opt/homebrew/bin"));
    }
}
