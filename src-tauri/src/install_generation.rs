//! Uninstalling the app removes the bundle and leaves the profile in the user
//! config directory. A replaced bundle must show plugin setup again and must
//! not reopen the previous project. An in-app update writes a short-lived
//! continuation first, so that restart keeps the profile.

use crate::{
    recent,
    workspace::{err, Res},
};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const STAMP: &str = "install-stamp.json";
const CONTINUATION: &str = "install-continuation.json";
const CONTINUATION_SECS: u64 = 15 * 60;
const PROFILE_MARKERS: &[&str] = &[
    "app-preferences.json",
    "recent-projects.json",
    "startup-project.json",
    "plugins-state.json",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Launch {
    Continue,
    Reinstall,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Identity {
    birth: u64,
    inode: u64,
}

pub fn prepare(config: &Path) -> Res<Launch> {
    if cfg!(any(debug_assertions, test))
        || std::env::var_os("PHP_IDE_STATE_DIR").is_some()
        || std::env::var_os("PHP_IDE_NATIVE_SMOKE").is_some()
    {
        return Ok(Launch::Continue);
    }
    let Some(current) = current_identity() else {
        return Ok(Launch::Continue);
    };
    apply(config, Some(current), unix_now(), env!("CARGO_PKG_VERSION"))
}

pub fn mark_update(config: &Path, version: &str) -> Res<()> {
    write_continuation(config, version, unix_now())
}

fn apply(config: &Path, current: Option<Identity>, now: u64, version: &str) -> Res<Launch> {
    let Some(current) = current else {
        return Ok(Launch::Continue);
    };
    let stored = read_identity(&config.join(STAMP));
    if stored == Some(current) {
        return Ok(Launch::Continue);
    }
    let continued = consume_continuation(config, version, now)?;
    let launch = classify(stored, current, continued, profile_birth(config));
    write_json(
        &config.join(STAMP),
        &json!({"birth": current.birth, "inode": current.inode}),
    )?;
    if launch == Launch::Reinstall {
        recent::Store::new(config.to_path_buf()).session(None)?;
    }
    Ok(launch)
}

fn classify(
    stored: Option<Identity>,
    current: Identity,
    continued: bool,
    profile_birth: Option<u64>,
) -> Launch {
    if continued || stored == Some(current) {
        return Launch::Continue;
    }
    if stored.is_some() {
        return Launch::Reinstall;
    }
    match profile_birth {
        Some(birth) if current.birth > birth => Launch::Reinstall,
        _ => Launch::Continue,
    }
}

fn current_identity() -> Option<Identity> {
    let target = install_target()?;
    let meta = fs::metadata(&target).ok()?;
    Some(Identity {
        birth: instant(&meta)?,
        inode: inode_of(&meta),
    })
}

fn install_target() -> Option<PathBuf> {
    if let Some(appimage) = std::env::var_os("APPIMAGE") {
        return Some(PathBuf::from(appimage));
    }
    let exe = std::env::current_exe().ok()?;
    Some(bundle_root(&exe).unwrap_or(exe))
}

fn bundle_root(exe: &Path) -> Option<PathBuf> {
    let bundle = exe.parent()?.parent()?.parent()?;
    bundle
        .extension()
        .is_some_and(|ext| ext == "app")
        .then(|| bundle.to_path_buf())
}

fn profile_birth(config: &Path) -> Option<u64> {
    PROFILE_MARKERS
        .iter()
        .filter_map(|name| file_birth(&config.join(name)))
        .min()
}

fn file_birth(path: &Path) -> Option<u64> {
    instant(&fs::metadata(path).ok()?)
}

fn instant(meta: &fs::Metadata) -> Option<u64> {
    let time = meta.created().or_else(|_| meta.modified()).ok()?;
    time.duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs())
}

#[cfg(unix)]
fn inode_of(meta: &fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.ino()
}

#[cfg(not(unix))]
fn inode_of(_meta: &fs::Metadata) -> u64 {
    0
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn read_identity(path: &Path) -> Option<Identity> {
    let value: Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    Some(Identity {
        birth: value.get("birth")?.as_u64()?,
        inode: value.get("inode")?.as_u64()?,
    })
}

fn consume_continuation(config: &Path, version: &str, now: u64) -> Res<bool> {
    let path = config.join(CONTINUATION);
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(err(error)),
    };
    let _ = fs::remove_file(&path);
    let value: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    let marked = value.get("version").and_then(Value::as_str) == Some(version);
    let at = value.get("at").and_then(Value::as_u64).unwrap_or(0);
    Ok(marked && at <= now && now.saturating_sub(at) < CONTINUATION_SECS)
}

fn write_continuation(config: &Path, version: &str, at: u64) -> Res<()> {
    write_json(
        &config.join(CONTINUATION),
        &json!({"version": version, "at": at}),
    )
}

fn write_json(path: &Path, value: &Value) -> Res<()> {
    let parent = path.parent().ok_or("Diretório de configuração inválido")?;
    fs::create_dir_all(parent).map_err(err)?;
    let temp = parent.join(format!(".install-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        fs::write(&temp, serde_json::to_vec(value).map_err(err)?).map_err(err)?;
        fs::rename(&temp, path).map_err(err)
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity(birth: u64, inode: u64) -> Identity {
        Identity { birth, inode }
    }

    #[test]
    fn same_bundle_keeps_the_profile_and_a_replacement_clears_only_the_session() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path();
        fs::write(
            config.join("recent-projects.json"),
            "[{\"path\":\"/keep\",\"name\":\"keep\"}]",
        )
        .unwrap();
        fs::write(config.join("startup-project.json"), "\"/keep\"").unwrap();
        let first = identity(10, 1);
        assert_eq!(
            apply(config, Some(first), 1_000, "0.2.14").unwrap(),
            Launch::Continue
        );
        assert_eq!(
            fs::read(config.join("startup-project.json")).unwrap(),
            b"\"/keep\""
        );

        let replaced = identity(90, 2);
        assert_eq!(
            apply(config, Some(replaced), 2_000, "0.2.14").unwrap(),
            Launch::Reinstall
        );
        assert_eq!(
            fs::read(config.join("startup-project.json")).unwrap(),
            b"null"
        );
        assert!(fs::read_to_string(config.join("recent-projects.json"))
            .unwrap()
            .contains("keep"));
        assert_eq!(
            apply(config, Some(replaced), 2_100, "0.2.14").unwrap(),
            Launch::Continue
        );
        assert_eq!(
            fs::read(config.join("startup-project.json")).unwrap(),
            b"null"
        );
    }

    #[test]
    fn fresh_update_continuation_keeps_the_session_until_it_expires_or_mismatches() {
        let temp = tempfile::tempdir().unwrap();
        let config = temp.path();
        fs::write(config.join(STAMP), r#"{"birth":10,"inode":1}"#).unwrap();
        fs::write(config.join("startup-project.json"), "\"/keep\"").unwrap();
        write_continuation(config, "0.2.15", 5_000).unwrap();
        assert_eq!(
            apply(config, Some(identity(80, 4)), 5_100, "0.2.15").unwrap(),
            Launch::Continue
        );
        assert_eq!(
            fs::read(config.join("startup-project.json")).unwrap(),
            b"\"/keep\""
        );
        assert!(!config.join(CONTINUATION).exists());

        write_continuation(config, "0.2.15", 5_000).unwrap();
        assert_eq!(
            apply(
                config,
                Some(identity(81, 5)),
                5_000 + CONTINUATION_SECS,
                "0.2.15"
            )
            .unwrap(),
            Launch::Reinstall
        );
        fs::write(config.join("startup-project.json"), "\"/keep\"").unwrap();
        write_continuation(config, "0.2.14", 9_000).unwrap();
        assert_eq!(
            apply(config, Some(identity(82, 6)), 9_100, "0.2.15").unwrap(),
            Launch::Reinstall
        );
    }

    #[test]
    fn missing_stamp_uses_bundle_age_against_the_existing_profile() {
        let older = identity(50, 2);
        let newer = identity(200, 2);
        assert_eq!(classify(None, newer, false, Some(100)), Launch::Reinstall);
        assert_eq!(classify(None, older, false, Some(100)), Launch::Continue);
        assert_eq!(classify(None, newer, true, Some(100)), Launch::Continue);
        assert_eq!(classify(None, newer, false, None), Launch::Continue);
        assert_eq!(
            classify(Some(identity(10, 1)), identity(10, 1), false, Some(1)),
            Launch::Continue
        );
    }

    #[test]
    fn isolated_runs_do_not_record_a_bundle_stamp() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(prepare(temp.path()).unwrap(), Launch::Continue);
        assert!(!temp.path().join(STAMP).exists());
    }
}
