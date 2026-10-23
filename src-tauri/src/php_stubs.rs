// Leitura somente leitura dos stubs PHP (JetBrains phpstorm-stubs, Apache-2.0)
// embutidos no phpactor.phar. O Phpactor responde definições de funções/classes
// nativas com URIs `phar://`; a interface abre o texto como biblioteca, sem gravar.
// Formato PHAR conforme a documentação pública do PHP (manifesto + entradas).
use crate::workspace::{err, Res};
use flate2::read::DeflateDecoder;
use serde_json::{json, Value};
use std::{
    io::Read,
    path::{Component, Path},
};

const STUBS: &str = "vendor/jetbrains/phpstorm-stubs/";
const LIMIT: usize = 4 * 1024 * 1024;

pub fn read(tools: &Path, uri: &str) -> Res<Value> {
    let rest = uri.strip_prefix("phar://").ok_or("URI de stub inválida")?;
    let rest = url::Url::parse(&format!("file://{}", rest))
        .ok()
        .and_then(|u| u.to_file_path().ok())
        .ok_or("URI de stub inválida")?;
    let phar = tools.join("phpactor.phar");
    let entry = dunce::simplified(&rest)
        .strip_prefix(dunce::simplified(&phar))
        .or_else(|_| {
            phar.canonicalize()
                .map_err(err)
                .and_then(|p| dunce::simplified(&rest).strip_prefix(dunce::simplified(&p)).map_err(err))
        })
        .map_err(|_| "Stub fora do pacote de stubs do Phpactor")?;
    if entry
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Stub inválido".into());
    }
    let name = entry.to_string_lossy().replace('\\', "/");
    if !name.starts_with(STUBS) || !name.ends_with(".php") {
        return Err("Somente stubs PHP podem ser abertos".into());
    }
    let bytes = std::fs::read(&phar).map_err(err)?;
    let text = entry_text(&bytes, &name)?;
    Ok(json!({"uri": uri, "text": text, "readOnly": true}))
}

fn u32_at(bytes: &[u8], at: usize) -> Res<u32> {
    bytes
        .get(at..at + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .ok_or_else(|| "PHAR truncado".to_string())
}

pub(crate) fn entry_text(bytes: &[u8], wanted: &str) -> Res<String> {
    let marker = b"__HALT_COMPILER();";
    let mut at = bytes
        .windows(marker.len())
        .position(|w| w == marker)
        .ok_or("PHAR sem __HALT_COMPILER")?
        + marker.len();
    while bytes.get(at) == Some(&b' ') {
        at += 1;
    }
    if bytes.get(at..at + 2) == Some(b"?>") {
        at += 2;
    }
    if bytes.get(at..at + 2) == Some(b"\r\n") {
        at += 2;
    } else if bytes.get(at) == Some(&b'\n') {
        at += 1;
    }
    let manifest_len = u32_at(bytes, at)? as usize;
    let data_start = at + 4 + manifest_len;
    let count = u32_at(bytes, at + 4)? as usize;
    // API (2 bytes) e flags globais (4 bytes) não alteram a leitura das entradas.
    let mut p = at + 14;
    let alias = u32_at(bytes, p)? as usize;
    p += 4 + alias;
    let meta = u32_at(bytes, p)? as usize;
    p += 4 + meta;
    let mut offset = data_start;
    for _ in 0..count {
        let len = u32_at(bytes, p)? as usize;
        let name = bytes.get(p + 4..p + 4 + len).ok_or("PHAR truncado")?;
        p += 4 + len;
        let size = u32_at(bytes, p)? as usize;
        let compressed = u32_at(bytes, p + 8)? as usize;
        let flags = u32_at(bytes, p + 16)?;
        let meta = u32_at(bytes, p + 20)? as usize;
        p += 24 + meta;
        if name == wanted.as_bytes() {
            if size > LIMIT {
                return Err("Stub grande demais".into());
            }
            let raw = bytes
                .get(offset..offset + compressed)
                .ok_or("PHAR truncado")?;
            let mut out = Vec::with_capacity(size);
            match flags & 0xF000 {
                0 => out.extend_from_slice(raw),
                0x1000 => {
                    DeflateDecoder::new(raw)
                        .take(LIMIT as u64)
                        .read_to_end(&mut out)
                        .map_err(err)?;
                }
                _ => return Err("Compressão de stub não suportada".into()),
            }
            return String::from_utf8(out).map_err(|_| "Stub não é UTF-8".into());
        }
        offset += compressed;
    }
    Err("Stub não encontrado".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::{write::DeflateEncoder, Compression};
    use std::io::Write;

    fn phar(entries: &[(&str, &str, bool)]) -> Vec<u8> {
        let mut manifest = Vec::new();
        let mut data = Vec::new();
        for (name, text, gz) in entries {
            let body = if *gz {
                let mut e = DeflateEncoder::new(Vec::new(), Compression::default());
                e.write_all(text.as_bytes()).unwrap();
                e.finish().unwrap()
            } else {
                text.as_bytes().to_vec()
            };
            manifest.extend((name.len() as u32).to_le_bytes());
            manifest.extend(name.as_bytes());
            for v in [text.len() as u32, 0, body.len() as u32, 0, if *gz { 0x1000 } else { 0 }, 0] {
                manifest.extend(v.to_le_bytes());
            }
            data.extend(body);
        }
        let mut header = Vec::new();
        header.extend((entries.len() as u32).to_le_bytes());
        header.extend(0x1100u16.to_le_bytes());
        header.extend(0u32.to_le_bytes());
        header.extend(0u32.to_le_bytes()); // alias
        header.extend(0u32.to_le_bytes()); // metadata
        header.extend(manifest);
        let mut out = b"<?php __HALT_COMPILER(); ?>\r\n".to_vec();
        out.extend((header.len() as u32).to_le_bytes());
        out.extend(header);
        out.extend(data);
        out
    }

    #[test]
    fn reads_plain_and_deflated_entries() {
        let bytes = phar(&[
            ("vendor/jetbrains/phpstorm-stubs/Core/Core.php", "<?php function strlen(string $s): int {}", true),
            ("README.md", "x", false),
        ]);
        assert_eq!(
            entry_text(&bytes, "vendor/jetbrains/phpstorm-stubs/Core/Core.php").unwrap(),
            "<?php function strlen(string $s): int {}"
        );
        assert_eq!(entry_text(&bytes, "README.md").unwrap(), "x");
        assert!(entry_text(&bytes, "missing.php").is_err());
        assert!(entry_text(b"not a phar", "x").is_err());
    }

    #[test]
    fn confines_to_stub_directory() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = phar(&[
            ("vendor/jetbrains/phpstorm-stubs/Core/Core.php", "<?php // stub", true),
            ("lib/Secret.php", "<?php // not a stub", false),
        ]);
        std::fs::write(dir.path().join("phpactor.phar"), bytes).unwrap();
        let base = format!("phar://{}/phpactor.phar/", dir.path().display());
        let ok = read(dir.path(), &format!("{}vendor/jetbrains/phpstorm-stubs/Core/Core.php", base)).unwrap();
        assert_eq!(ok["text"], "<?php // stub");
        assert_eq!(ok["readOnly"], true);
        assert!(read(dir.path(), &format!("{}lib/Secret.php", base)).is_err());
        assert!(read(dir.path(), &format!("{}vendor/jetbrains/phpstorm-stubs/../../lib/Secret.php", base)).is_err());
        assert!(read(dir.path(), "phar:///etc/other.phar/vendor/jetbrains/phpstorm-stubs/a.php").is_err());
        assert!(read(dir.path(), "file:///etc/passwd").is_err());
    }

    #[test]
    fn reads_real_phpactor_stub_when_installed() {
        let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("../.tools");
        let phar = tools.join("phpactor.phar");
        if !phar.is_file() {
            return;
        }
        let uri = format!("phar://{}/{}Core/Core.php", phar.display(), STUBS);
        let text = read(&tools, &uri).unwrap()["text"].as_str().unwrap().to_string();
        assert!(text.contains("function strlen("));
    }
}
