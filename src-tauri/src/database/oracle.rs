//! Driver Oracle em Rust puro (`oracle-rs`, protocolo TNS "thin"): não exige Instant Client.
use super::{endpoint, ssl, text, Rows};
use crate::workspace::Res;
use oracle_rs::{Config, Connection, OracleType, Statement, TlsConfig, Value};
use serde_json::Value as Json;
use std::time::Duration;

/// Mensagem de erro com dica para os códigos ORA mais comuns na conexão.
pub(super) fn error(e: oracle_rs::Error) -> String {
    let text = e.to_string();
    let hint = if text.contains("ORA-01017") {
        " — usuário ou senha inválidos"
    } else if text.contains("ORA-12514") || text.contains("ORA-12505") || text.contains("refused by server") {
        " — o listener recusou: confira o Service name/SID na aba Geral"
    } else if text.contains("ORA-28000") {
        " — conta bloqueada"
    } else {
        ""
    };
    format!("{text}{hint}")
}

pub(super) async fn open(input: &Json) -> Res<Connection> {
    let (host, port) = endpoint(input)?;
    let target = text(input, "database").trim();
    if target.is_empty() {
        return Err("Informe o Service name ou SID do Oracle".into());
    }
    let (user, password) = (text(input, "user"), text(input, "password"));
    let mut config = if text(input, "connectType") == "sid" {
        Config::with_sid(host, port, target, user, password)
    } else {
        Config::new(host, port, target, user, password)
    }
    .connect_timeout(Duration::from_secs(8))
    // Sem cache: cursores reaproveitados não reenviam colunas e o console executa SQL arbitrário.
    .with_statement_cache_size(0);
    let (mode, ca) = ssl(input)?;
    match mode {
        "disable" | "prefer" => {}
        "require" => config = config.tls_config(TlsConfig::new().danger_accept_invalid_certs()),
        _ => {
            let mut tls = TlsConfig::new();
            if let Some(ca) = ca {
                tls = tls.with_ca_cert(ca);
            }
            config = config.tls_config(tls);
        }
    }
    Connection::connect_with_config(config).await.map_err(error)
}

pub(super) async fn version(c: &Connection) -> String {
    let info = c.server_info().await;
    let banner = if info.banner.trim().is_empty() { info.version } else { info.banner };
    if banner.to_ascii_lowercase().contains("oracle") {
        banner
    } else {
        format!("Oracle {banner}")
    }
}

async fn cell(c: &Connection, value: &Value, kind: OracleType) -> Option<String> {
    let hex = |b: &[u8]| b.iter().map(|b| format!("{b:02X}")).collect::<String>();
    Some(match value {
        Value::Null => return None,
        Value::String(v) => v.clone(),
        Value::Bytes(v) => hex(v),
        Value::Json(v) => v.to_string(),
        Value::Lob(oracle_rs::LobValue::Null) => return None,
        Value::Lob(oracle_rs::LobValue::Empty) => String::new(),
        Value::Lob(oracle_rs::LobValue::Inline(v)) => {
            if kind == OracleType::Blob {
                hex(v)
            } else {
                String::from_utf8_lossy(v).to_string()
            }
        }
        Value::Lob(oracle_rs::LobValue::Locator(l)) if l.size() <= 1 << 20 => match c.read_lob(l).await {
            Ok(oracle_rs::LobData::String(v)) => v,
            Ok(oracle_rs::LobData::Bytes(v)) => hex(&v),
            Err(e) => format!("[LOB: {}]", error(e)),
        },
        other => other.to_string(),
    })
}

/// Executa um comando. Consultas param no limite; os demais são confirmados (auto-commit).
pub(super) async fn rows(c: &Connection, sql: &str, params: &[&str], limit: usize) -> Res<Rows> {
    let values: Vec<Value> = params.iter().map(|p| Value::String(p.to_string())).collect();
    let mut out = Rows::new();
    if Statement::new(sql).is_query() {
        let mut result = c.query(sql, &values).await.map_err(error)?;
        let columns = result.columns.clone();
        let cursor = result.cursor_id;
        out.names = columns.iter().map(|c| c.name.clone()).collect();
        loop {
            for row in std::mem::take(&mut result.rows) {
                out.total += 1;
                if out.rows.len() < limit {
                    let mut cells = vec![];
                    for (i, v) in row.values().iter().enumerate() {
                        cells.push(cell(c, v, columns.get(i).map(|c| c.oracle_type).unwrap_or(OracleType::Varchar)).await);
                    }
                    out.rows.push(cells);
                }
            }
            if !result.has_more_rows || out.total > limit {
                break;
            }
            result = c.fetch_more(cursor, &columns, 100).await.map_err(error)?;
        }
    } else {
        let result = c.execute(sql, &values).await.map_err(error)?;
        out.affected = result.rows_affected;
        c.commit().await.map_err(error)?;
    }
    Ok(out)
}

fn plsql_start(statement: &str) -> bool {
    let words: Vec<String> = statement
        .split_whitespace()
        .take(6)
        .map(|w| w.trim_end_matches(';').to_ascii_uppercase())
        .collect();
    let w = |i: usize| words.get(i).map(String::as_str).unwrap_or("");
    if w(0) == "BEGIN" || w(0) == "DECLARE" {
        return true;
    }
    if w(0) != "CREATE" {
        return false;
    }
    let mut i = 1;
    if w(1) == "OR" && w(2) == "REPLACE" {
        i = 3;
    }
    if w(i) == "EDITIONABLE" || w(i) == "NONEDITIONABLE" {
        i += 1;
    }
    ["PROCEDURE", "FUNCTION", "PACKAGE", "TRIGGER", "TYPE"].contains(&w(i))
}

/// Remove comentários e espaços iniciais (o driver classifica pelo primeiro termo).
fn strip_leading(mut s: &str) -> &str {
    loop {
        s = s.trim_start();
        if let Some(rest) = s.strip_prefix("--") {
            s = rest.split_once('\n').map(|(_, r)| r).unwrap_or("");
        } else if let Some(rest) = s.strip_prefix("/*") {
            s = rest.split_once("*/").map(|(_, r)| r).unwrap_or("");
        } else {
            return s;
        }
    }
}

/// Divide um script no estilo SQL*Plus: `;` termina SQL; blocos PL/SQL (BEGIN, DECLARE,
/// CREATE PROCEDURE/FUNCTION/PACKAGE/TRIGGER/TYPE) vão até uma linha só com `/`.
pub(super) fn split(script: &str) -> Vec<String> {
    let mut out = vec![];
    let mut current = String::new();
    let chars: Vec<char> = script.chars().collect();
    let mut i = 0;
    let mut line_start = true;
    let push = |current: &mut String, out: &mut Vec<String>| {
        let statement = strip_leading(current.trim()).trim_end().to_string();
        if !statement.is_empty() && statement != "/" {
            out.push(statement);
        }
        current.clear();
    };
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if line_start && c == '/' {
            let rest: String = chars[i + 1..].iter().take_while(|c| **c != '\n').collect();
            if rest.trim().is_empty() {
                push(&mut current, &mut out);
                i += 1 + rest.chars().count();
                continue;
            }
        }
        let start = i;
        match (c, next) {
            ('\'', _) => {
                i += 1;
                while i < chars.len() {
                    if chars[i] == '\'' && chars.get(i + 1) == Some(&'\'') {
                        i += 2;
                    } else if chars[i] == '\'' {
                        break;
                    } else {
                        i += 1;
                    }
                }
            }
            ('"', _) => {
                i += 1;
                while i < chars.len() && chars[i] != '"' {
                    i += 1;
                }
            }
            ('-', Some('-')) => {
                while i + 1 < chars.len() && chars[i + 1] != '\n' {
                    i += 1;
                }
            }
            ('/', Some('*')) => {
                i += 2;
                while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i += 1;
            }
            (';', _) if !plsql_start(strip_leading(&current)) => {
                push(&mut current, &mut out);
                i += 1;
                line_start = false;
                continue;
            }
            _ => {}
        }
        let end = (i + 1).min(chars.len());
        current.extend(&chars[start..end]);
        if c == '\n' {
            line_start = true;
        } else if !c.is_whitespace() {
            line_start = false;
        }
        i = end;
    }
    push(&mut current, &mut out);
    out
}

/// Expressão textual limitada a 513 caracteres por tipo de coluna.
pub(super) fn cell_expr(name: &str, dtype: &str) -> String {
    let t = dtype.to_ascii_uppercase();
    match t.as_str() {
        "CLOB" | "NCLOB" => format!("DBMS_LOB.SUBSTR({name},513,1)"),
        "BLOB" => format!("RAWTOHEX(DBMS_LOB.SUBSTR({name},256,1))"),
        "RAW" => format!("SUBSTR(RAWTOHEX({name}),1,513)"),
        "ROWID" | "UROWID" => format!("ROWIDTOCHAR({name})"),
        "JSON" => format!("SUBSTR(JSON_SERIALIZE({name}),1,513)"),
        "BOOLEAN" => format!("CASE WHEN {name} THEN 'true' WHEN NOT {name} THEN 'false' END"),
        _ if t.starts_with("LONG") || t == "BFILE" || t.contains("XMLTYPE") => format!("'[{t}: prévia indisponível]'"),
        _ if [
            "NUMBER", "FLOAT", "BINARY_FLOAT", "BINARY_DOUBLE", "VARCHAR2", "NVARCHAR2", "CHAR", "NCHAR", "DATE",
        ]
        .contains(&t.as_str())
            || t.starts_with("TIMESTAMP")
            || t.starts_with("INTERVAL") =>
        {
            format!("SUBSTR(TO_CHAR({name}),1,513)")
        }
        _ => format!("'[{t}: prévia indisponível]'"),
    }
}

/// Tipo declarado a partir de ALL_TAB_COLUMNS.
pub(super) fn column_type(c: &Json) -> String {
    let get = |k: &str| c[k].as_str().unwrap_or("");
    let t = get("dtype");
    match t {
        "VARCHAR2" | "NVARCHAR2" | "CHAR" | "NCHAR" => {
            if get("char_used") == "C" {
                format!("{t}({} CHAR)", get("char_length"))
            } else {
                format!("{t}({})", get("len"))
            }
        }
        "RAW" => format!("RAW({})", get("len")),
        "NUMBER" => match (get("prec"), get("scale")) {
            ("", "0") => "NUMBER(*,0)".into(),
            ("", _) => "NUMBER".into(),
            (p, "0" | "") => format!("NUMBER({p})"),
            (p, s) => format!("NUMBER({p},{s})"),
        },
        "FLOAT" if !get("prec").is_empty() => format!("FLOAT({})", get("prec")),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn split_handles_plsql_blocks_and_slash() {
        let script = "SELECT 1 FROM dual;\n-- comentário\nINSERT INTO t VALUES ('a;b');\nBEGIN\n  x := 1;\n  NULL;\nEND;\n/\nCREATE OR REPLACE PROCEDURE p AS BEGIN NULL; END;\n/\nSELECT 2 FROM dual";
        assert_eq!(
            split(script),
            vec![
                "SELECT 1 FROM dual",
                "INSERT INTO t VALUES ('a;b')",
                "BEGIN\n  x := 1;\n  NULL;\nEND;",
                "CREATE OR REPLACE PROCEDURE p AS BEGIN NULL; END;",
                "SELECT 2 FROM dual",
            ]
        );
        assert_eq!(split("SELECT 1 / 2 FROM dual;"), vec!["SELECT 1 / 2 FROM dual"]);
        assert_eq!(split("CREATE TABLE t (id NUMBER);\n/* x; */ DROP TABLE t"), vec!["CREATE TABLE t (id NUMBER)", "DROP TABLE t"]);
        assert_eq!(split("BEGIN NULL; END;"), vec!["BEGIN NULL; END;"]);
    }
    #[test]
    fn types_and_cells() {
        assert_eq!(column_type(&json!({"dtype":"VARCHAR2","char_used":"C","char_length":"60","len":"240"})), "VARCHAR2(60 CHAR)");
        assert_eq!(column_type(&json!({"dtype":"NUMBER","prec":"10","scale":"2"})), "NUMBER(10,2)");
        assert_eq!(column_type(&json!({"dtype":"NUMBER","prec":"","scale":"0"})), "NUMBER(*,0)");
        assert_eq!(column_type(&json!({"dtype":"DATE"})), "DATE");
        assert!(cell_expr("\"C\"", "CLOB").starts_with("DBMS_LOB.SUBSTR"));
        assert!(cell_expr("\"C\"", "TIMESTAMP(6)").starts_with("SUBSTR(TO_CHAR"));
        assert!(cell_expr("\"C\"", "MY_TYPE").contains("indisponível"));
    }
}
