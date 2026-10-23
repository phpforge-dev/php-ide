use crate::{
    git::s,
    workspace::{err, hash, Res},
};
use futures_util::TryStreamExt;
use serde_json::{json, Value};
use sqlx::{
    mysql::{MySqlConnectOptions, MySqlConnection, MySqlSslMode},
    postgres::{PgConnectOptions, PgConnection, PgSslMode},
    sqlite::{SqliteConnectOptions, SqliteConnection},
    Column, Connection, Either, Executor, Row, ValueRef,
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
type MsClient = tiberius::Client<Compat<tokio::net::TcpStream>>;
mod oracle;
mod redis_edit;
/// Família de protocolo; MariaDB usa o protocolo MySQL.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Pg,
    My,
    Lite,
    Ms,
    Redis,
    Ora,
}
impl Kind {
    fn of(input: &Value) -> Res<Self> {
        match input["driver"].as_str() {
            Some("postgres") => Ok(Self::Pg),
            Some("mysql") | Some("mariadb") => Ok(Self::My),
            Some("sqlite") => Ok(Self::Lite),
            Some("sqlserver") => Ok(Self::Ms),
            Some("redis") => Ok(Self::Redis),
            Some("oracle") => Ok(Self::Ora),
            _ => Err("Driver não suportado".into()),
        }
    }
    fn ph(self, n: usize) -> String {
        match self {
            Self::Pg => format!("${n}"),
            Self::Ms => format!("@P{n}"),
            Self::Ora => format!(":{n}"),
            _ => "?".into(),
        }
    }
    fn quote(self, value: &str) -> Res<String> {
        valid(value)?;
        Ok(match self {
            Self::Pg | Self::Lite | Self::Ora => format!("\"{}\"", value.replace('"', "\"\"")),
            Self::My => format!("`{}`", value.replace('`', "``")),
            Self::Ms => format!("[{}]", value.replace(']', "]]")),
            Self::Redis => return Err("Redis não usa identificadores SQL".into()),
        })
    }
}
enum Conn {
    Pg(PgConnection),
    My(MySqlConnection),
    Lite(SqliteConnection),
    Ms(Box<MsClient>),
    Redis(redis::aio::MultiplexedConnection),
    Ora(Box<oracle_rs::Connection>),
}
/// Processo `ssh -L` do sistema; encerrado junto com a sessão.
struct Tunnel(#[allow(dead_code)] tokio::process::Child);
struct Session {
    input: Value,
    kind: Kind,
    conn: tokio::sync::Mutex<Conn>,
    pid: i64,
    /// Comandos executados na conexão Oracle atual (oracle-rs não fecha cursores no servidor).
    used: std::sync::atomic::AtomicUsize,
    _tunnel: Option<Tunnel>,
}
pub struct Database {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    /// Senhas "até reiniciar": só em memória, por fonte de dados.
    passwords: Mutex<HashMap<String, String>>,
    sources: Option<PathBuf>,
}
fn valid(value: &str) -> Res<()> {
    if value.is_empty() || value.len() > 256 || value.contains('\0') {
        return Err("Nome de objeto inválido".into());
    }
    Ok(())
}
fn text<'a>(input: &'a Value, key: &str) -> &'a str {
    input[key].as_str().unwrap_or("")
}
fn ssl(input: &Value) -> Res<(&str, Option<&str>)> {
    if input["ssl"].is_object() {
        let mode = text(&input["ssl"], "mode");
        if !["disable", "prefer", "require", "verify-ca", "verify-full"].contains(&mode) {
            return Err("Modo SSL inválido".into());
        }
        let ca = Some(text(&input["ssl"], "ca")).filter(|v| !v.trim().is_empty());
        return Ok((mode, ca));
    }
    Ok((
        if input["tls"].as_bool().unwrap_or(false) {
            "verify-full"
        } else {
            "disable"
        },
        None,
    ))
}
fn endpoint(input: &Value) -> Res<(&str, u16)> {
    let host = text(input, "host");
    let port = input["port"]
        .as_u64()
        .filter(|v| (1..=65535).contains(v))
        .ok_or("Porta inválida")? as u16;
    if host.trim().is_empty() {
        return Err("Host inválido".into());
    }
    Ok((host, port))
}
fn redis_db(input: &Value) -> Res<i64> {
    let db = text(input, "database").trim().trim_start_matches("db");
    if db.is_empty() {
        return Ok(0);
    }
    db.parse::<i64>()
        .ok()
        .filter(|v| (0..=1024).contains(v))
        .ok_or("Banco Redis deve ser um índice numérico".into())
}
async fn redis_open(input: &Value, db: i64) -> Res<redis::aio::MultiplexedConnection> {
    let (host, port) = endpoint(input)?;
    let (mode, ca) = ssl(input)?;
    let addr = match mode {
        "disable" | "prefer" => redis::ConnectionAddr::Tcp(host.into(), port),
        _ => redis::ConnectionAddr::TcpTls {
            host: host.into(),
            port,
            insecure: mode == "require",
            tls_params: None,
        },
    };
    let user = text(input, "user");
    let password = text(input, "password");
    let tls = matches!(addr, redis::ConnectionAddr::TcpTls { .. });
    let info = redis::ConnectionInfo {
        addr,
        redis: redis::RedisConnectionInfo {
            db,
            username: Some(user.to_string()).filter(|v| !v.is_empty()),
            password: Some(password.to_string()).filter(|v| !v.is_empty()),
            protocol: redis::ProtocolVersion::RESP2,
        },
    };
    // verify-ca e verify-full validam a cadeia e o nome do host (rustls não separa as duas checagens).
    let client = match ca {
        Some(ca) if tls && mode != "require" => {
            let pem = fs::read(ca).map_err(|e| format!("Arquivo CA {ca}: {e}"))?;
            redis::Client::build_with_tls(
                info,
                redis::TlsCertificates {
                    client_tls: None,
                    root_cert: Some(pem),
                },
            )
        }
        _ => redis::Client::open(info),
    }
    .map_err(err)?;
    client
        .get_multiplexed_async_connection()
        .await
        .map_err(err)
}
async fn ms_open(input: &Value) -> Res<MsClient> {
    let (host, port) = endpoint(input)?;
    let (mode, ca) = ssl(input)?;
    let mut config = tiberius::Config::new();
    config.host(host);
    config.port(port);
    config.application_name("PHP IDE");
    let db = text(input, "database");
    if !db.is_empty() {
        config.database(db);
    }
    config.authentication(tiberius::AuthMethod::sql_server(
        text(input, "user"),
        text(input, "password"),
    ));
    config.encryption(match mode {
        "disable" => tiberius::EncryptionLevel::NotSupported,
        "prefer" => tiberius::EncryptionLevel::Off,
        _ => tiberius::EncryptionLevel::Required,
    });
    match (mode, ca) {
        ("disable" | "prefer" | "require", _) => config.trust_cert(),
        (_, Some(ca)) => config.trust_cert_ca(ca),
        _ => {}
    }
    let tcp = tokio::net::TcpStream::connect(config.get_addr())
        .await
        .map_err(err)?;
    tcp.set_nodelay(true).map_err(err)?;
    tiberius::Client::connect(config, tcp.compat_write())
        .await
        .map_err(err)
}
async fn connect(input: &Value) -> Res<Conn> {
    let read_only = input["readOnly"].as_bool().unwrap_or(false);
    Ok(match Kind::of(input)? {
        Kind::Pg => {
            let (host, port) = endpoint(input)?;
            let (mode, ca) = ssl(input)?;
            let mut options = PgConnectOptions::new()
                .host(host)
                .port(port)
                .database(text(input, "database"))
                .username(text(input, "user"))
                .password(text(input, "password"))
                .ssl_mode(match mode {
                    "disable" => PgSslMode::Disable,
                    "prefer" => PgSslMode::Prefer,
                    "require" => PgSslMode::Require,
                    "verify-ca" => PgSslMode::VerifyCa,
                    _ => PgSslMode::VerifyFull,
                });
            if let Some(ca) = ca {
                options = options.ssl_root_cert(ca);
            }
            Conn::Pg(PgConnection::connect_with(&options).await.map_err(err)?)
        }
        Kind::My => {
            let (host, port) = endpoint(input)?;
            let (mode, ca) = ssl(input)?;
            let mut options = MySqlConnectOptions::new()
                .host(host)
                .port(port)
                .database(text(input, "database"))
                .username(text(input, "user"))
                .password(text(input, "password"))
                .ssl_mode(match mode {
                    "disable" => MySqlSslMode::Disabled,
                    "prefer" => MySqlSslMode::Preferred,
                    "require" => MySqlSslMode::Required,
                    "verify-ca" => MySqlSslMode::VerifyCa,
                    _ => MySqlSslMode::VerifyIdentity,
                });
            if let Some(ca) = ca {
                options = options.ssl_ca(ca);
            }
            Conn::My(MySqlConnection::connect_with(&options).await.map_err(err)?)
        }
        Kind::Lite => {
            let file = text(input, "file");
            if file.trim().is_empty() {
                return Err("Informe o arquivo SQLite".into());
            }
            if !Path::new(file).is_file() {
                return Err(format!("Arquivo SQLite não encontrado: {file}"));
            }
            Conn::Lite(
                SqliteConnection::connect_with(
                    &SqliteConnectOptions::new()
                        .filename(file)
                        .create_if_missing(false)
                        .read_only(read_only),
                )
                .await
                .map_err(err)?,
            )
        }
        Kind::Ms => {
            if read_only {
                return Err("Somente leitura ainda não é garantido para SQL Server".into());
            }
            Conn::Ms(Box::new(ms_open(input).await?))
        }
        Kind::Redis => {
            if read_only {
                return Err("Somente leitura não é suportado para Redis".into());
            }
            Conn::Redis(redis_open(input, redis_db(input)?).await?)
        }
        Kind::Ora => {
            if read_only {
                return Err("Somente leitura ainda não é garantido para Oracle".into());
            }
            Conn::Ora(Box::new(oracle::open(input).await?))
        }
    })
}
/// Abre a conexão, aplica somente leitura e o script de inicialização de cada conexão.
async fn open(input: &Value) -> Res<Conn> {
    let mut conn = tokio::time::timeout(Duration::from_secs(8), connect(input))
        .await
        .map_err(|_| "Conexão excedeu 8 segundos".to_string())??;
    if input["readOnly"].as_bool().unwrap_or(false) {
        match &mut conn {
            Conn::Pg(c) => {
                c.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
                    .await
                    .map_err(err)?;
            }
            Conn::My(c) => {
                c.execute("SET SESSION TRANSACTION READ ONLY")
                    .await
                    .map_err(err)?;
            }
            _ => {}
        }
    }
    if let Some(startup) = input["startup"].as_array() {
        if matches!(conn, Conn::Redis(_)) {
            return Err("Script de inicialização não se aplica ao Redis".into());
        }
        let mut list = startup
            .iter()
            .take(20)
            .map(|v| s(v).map(str::to_string))
            .collect::<Res<Vec<_>>>()?;
        if matches!(conn, Conn::Ora(_)) {
            list = oracle::split(&list.join(";\n"));
        }
        for sql in &list {
            if !sql.trim().is_empty() {
                query(&mut conn, sql, &[], 0)
                    .await
                    .map_err(|e| format!("Script de inicialização: {e}"))?;
            }
        }
    }
    Ok(conn)
}
/// Encaminha a porta do banco por `ssh -N -L`, usando chave ou agente do usuário (sem senha).
async fn tunnel(input: &Value) -> Res<(Option<Tunnel>, Value)> {
    let ssh = &input["ssh"];
    let host = text(ssh, "host").trim();
    if host.is_empty() {
        return Ok((None, input.clone()));
    }
    let user = text(ssh, "user").trim();
    let key = text(ssh, "key").trim();
    let port = ssh["port"].as_u64().unwrap_or(22);
    let (target, target_port) = endpoint(input)?;
    for v in [host, user, key, target] {
        if v.starts_with('-') || v.chars().any(|c| c.is_whitespace() || c == '\0') {
            return Err("Parâmetro SSH inválido".into());
        }
    }
    if !(1..=65535).contains(&port) {
        return Err("Porta SSH inválida".into());
    }
    let local = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map_err(err)?
        .port();
    let mut command = tokio::process::Command::new("ssh");
    command
        .args(["-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes"])
        .args(["-o", "ConnectTimeout=8", "-p", &port.to_string(), "-L"])
        .arg(format!("127.0.0.1:{local}:{target}:{target_port}"));
    if !key.is_empty() {
        command.args(["-i", key, "-o", "IdentitiesOnly=yes"]);
    }
    command
        .arg(if user.is_empty() {
            host.to_string()
        } else {
            format!("{user}@{host}")
        })
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|e| format!("Não foi possível iniciar ssh: {e}"))?;
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(err)? {
            let mut message = String::new();
            if let Some(mut stderr) = child.stderr.take() {
                use tokio::io::AsyncReadExt;
                let _ = stderr.read_to_string(&mut message).await;
            }
            return Err(format!(
                "Túnel SSH falhou ({status}): {}",
                message.trim().lines().last().unwrap_or("sem detalhes")
            ));
        }
        if tokio::net::TcpStream::connect(("127.0.0.1", local))
            .await
            .is_ok()
        {
            break;
        }
        if started.elapsed() > Duration::from_secs(10) {
            return Err("Túnel SSH excedeu 10 segundos".into());
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    let mut effective = input.clone();
    effective["host"] = json!("127.0.0.1");
    effective["port"] = json!(local);
    Ok((Some(Tunnel(child)), effective))
}
fn pg_cell(row: &sqlx::postgres::PgRow, i: usize) -> Option<String> {
    let raw = row.try_get_raw(i).ok()?;
    if raw.is_null() {
        return None;
    }
    if let Ok(v) = row.try_get::<String, _>(i) {
        return Some(v);
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<i32, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<i16, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<f32, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<bool, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<Value, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<chrono::DateTime<chrono::Utc>, _>(i) {
        return Some(v.to_rfc3339());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
        return Some(v.to_string());
    }
    Some(format!(
        "[{}: prévia indisponível]",
        row.columns()[i].type_info()
    ))
}
fn my_cell(row: &sqlx::mysql::MySqlRow, i: usize) -> Option<String> {
    let raw = row.try_get_raw(i).ok()?;
    if raw.is_null() {
        return None;
    }
    if let Ok(v) = row.try_get::<String, _>(i) {
        return Some(v);
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
        return Some(String::from_utf8_lossy(&v).to_string());
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<u64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveDateTime, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<chrono::NaiveDate, _>(i) {
        return Some(v.to_string());
    }
    Some(format!(
        "[{}: prévia indisponível]",
        row.columns()[i].type_info()
    ))
}
fn lite_cell(row: &sqlx::sqlite::SqliteRow, i: usize) -> Option<String> {
    let raw = row.try_get_raw(i).ok()?;
    if raw.is_null() {
        return None;
    }
    if let Ok(v) = row.try_get::<String, _>(i) {
        return Some(v);
    }
    if let Ok(v) = row.try_get::<i64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<f64, _>(i) {
        return Some(v.to_string());
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(i) {
        return Some(String::from_utf8_lossy(&v).to_string());
    }
    Some(format!(
        "[{}: prévia indisponível]",
        row.columns()[i].type_info()
    ))
}
fn ms_cell(data: tiberius::ColumnData<'static>) -> Option<String> {
    use tiberius::{ColumnData as D, FromSql};
    match &data {
        D::U8(v) => v.map(|v| v.to_string()),
        D::I16(v) => v.map(|v| v.to_string()),
        D::I32(v) => v.map(|v| v.to_string()),
        D::I64(v) => v.map(|v| v.to_string()),
        D::F32(v) => v.map(|v| v.to_string()),
        D::F64(v) => v.map(|v| v.to_string()),
        D::Bit(v) => v.map(|v| v.to_string()),
        D::String(v) => v.as_ref().map(|v| v.to_string()),
        D::Guid(v) => v.map(|v| v.to_string()),
        D::Binary(v) => v.as_ref().map(|v| {
            "0x".to_string() + &v.iter().map(|b| format!("{b:02X}")).collect::<String>()
        }),
        D::Numeric(v) => v.map(|v| v.to_string()),
        D::Xml(v) => v.as_ref().map(|v| v.to_string()),
        _ => {
            if let Ok(v) = chrono::NaiveDateTime::from_sql(&data) {
                return v.map(|v| v.to_string());
            }
            if let Ok(v) = chrono::NaiveDate::from_sql(&data) {
                return v.map(|v| v.to_string());
            }
            if let Ok(v) = chrono::NaiveTime::from_sql(&data) {
                return v.map(|v| v.to_string());
            }
            if let Ok(v) = chrono::DateTime::<chrono::FixedOffset>::from_sql(&data) {
                return v.map(|v| v.to_rfc3339());
            }
            Some("[prévia indisponível]".into())
        }
    }
}
struct Rows {
    names: Vec<String>,
    rows: Vec<Vec<Option<String>>>,
    affected: u64,
    total: usize,
}
impl Rows {
    fn new() -> Self {
        Self {
            names: vec![],
            rows: vec![],
            affected: 0,
            total: 0,
        }
    }
    fn maps(&self) -> Vec<Value> {
        self.rows
            .iter()
            .map(|row| {
                Value::Object(
                    self.names
                        .iter()
                        .map(|v| v.to_ascii_lowercase())
                        .zip(row.iter().map(|v| json!(v)))
                        .collect(),
                )
            })
            .collect()
    }
    fn first(&self) -> Option<String> {
        self.rows.first().and_then(|r| r.first()).cloned().flatten()
    }
}
macro_rules! sqlx_rows {
    ($c:expr, $sql:expr, $params:expr, $limit:expr, $out:expr, $cell:ident) => {{
        if let Ok(d) = $c.describe($sql).await {
            $out.names = d.columns().iter().map(|c| c.name().to_string()).collect();
        }
        let mut q = sqlx::query($sql);
        for p in $params {
            q = q.bind(*p);
        }
        #[allow(deprecated)]
        let mut stream = $c.fetch_many(q);
        while let Some(item) = stream.try_next().await.map_err(err)? {
            match item {
                Either::Left(v) => $out.affected = v.rows_affected(),
                Either::Right(row) => {
                    if $out.names.is_empty() {
                        $out.names = row.columns().iter().map(|v| v.name().to_string()).collect();
                    }
                    $out.total += 1;
                    if $out.rows.len() < $limit {
                        $out.rows
                            .push((0..row.columns().len()).map(|i| $cell(&row, i)).collect());
                    }
                }
            }
        }
    }};
}
async fn ms_rows(c: &mut MsClient, sql: &str, params: &[&str], limit: usize) -> Res<Rows> {
    let mut out = Rows::new();
    let values: Vec<&dyn tiberius::ToSql> =
        params.iter().map(|p| p as &dyn tiberius::ToSql).collect();
    let mut stream = if params.is_empty() {
        c.simple_query(sql).await
    } else {
        c.query(sql, &values).await
    }
    .map_err(err)?;
    let mut described = false;
    while let Some(item) = stream.try_next().await.map_err(err)? {
        match item {
            tiberius::QueryItem::Metadata(m) => {
                if !described {
                    out.names = m.columns().iter().map(|c| c.name().to_string()).collect();
                    described = true;
                }
            }
            tiberius::QueryItem::Row(row) => {
                if row.result_index() == 0 {
                    out.total += 1;
                    if out.rows.len() < limit {
                        out.rows.push(row.into_iter().map(ms_cell).collect());
                    }
                }
            }
        }
    }
    drop(stream);
    if !described {
        let count = c
            .simple_query("SELECT @@ROWCOUNT")
            .await
            .map_err(err)?
            .into_row()
            .await
            .map_err(err)?;
        out.affected = count
            .and_then(|r| r.get::<i32, _>(0))
            .unwrap_or(0)
            .max(0) as u64;
    }
    Ok(out)
}
async fn query(conn: &mut Conn, sql: &str, params: &[&str], limit: usize) -> Res<Rows> {
    let mut out = Rows::new();
    match conn {
        Conn::Pg(c) => sqlx_rows!(c, sql, params, limit, out, pg_cell),
        Conn::My(c) => sqlx_rows!(c, sql, params, limit, out, my_cell),
        Conn::Lite(c) => sqlx_rows!(c, sql, params, limit, out, lite_cell),
        Conn::Ms(c) => return ms_rows(c, sql, params, limit).await,
        Conn::Redis(c) => return redis_command(c, sql, limit).await,
        Conn::Ora(c) => return oracle::rows(c, sql, params, limit).await,
    }
    Ok(out)
}
/// Divide uma linha de comando Redis respeitando aspas simples e duplas.
fn redis_args(line: &str) -> Res<Vec<String>> {
    let mut args = vec![];
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    let mut chars = line.chars();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some('"'), '\\') => {
                if let Some(next) = chars.next() {
                    current.push(match next {
                        'n' => '\n',
                        't' => '\t',
                        other => other,
                    });
                }
            }
            (Some(_), c) => current.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                started = true;
            }
            (None, c) if c.is_whitespace() => {
                if started || !current.is_empty() {
                    args.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            (None, c) => current.push(c),
        }
    }
    if quote.is_some() {
        return Err("Aspas sem fechamento no comando Redis".into());
    }
    if started || !current.is_empty() {
        args.push(current);
    }
    Ok(args)
}
fn redis_text(value: &redis::Value) -> Option<String> {
    use redis::Value as V;
    match value {
        V::Nil => None,
        V::Int(v) => Some(v.to_string()),
        V::BulkString(v) => Some(String::from_utf8_lossy(v).to_string()),
        V::SimpleString(v) => Some(v.clone()),
        V::Okay => Some("OK".into()),
        V::Double(v) => Some(v.to_string()),
        V::Boolean(v) => Some(v.to_string()),
        V::VerbatimString { text, .. } => Some(text.clone()),
        V::BigNumber(v) => Some(v.to_string()),
        V::ServerError(e) => Some(format!("{e:?}")),
        V::Array(items) | V::Set(items) | V::Push { data: items, .. } => Some(format!(
            "[{}]",
            items
                .iter()
                .map(|v| redis_text(v).unwrap_or_else(|| "nil".into()))
                .collect::<Vec<_>>()
                .join(", ")
        )),
        V::Map(items) | V::Attribute { data: _, attributes: items } => Some(format!(
            "{{{}}}",
            items
                .iter()
                .map(|(k, v)| format!(
                    "{}: {}",
                    redis_text(k).unwrap_or_default(),
                    redis_text(v).unwrap_or_else(|| "nil".into())
                ))
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}
async fn redis_command(
    c: &mut redis::aio::MultiplexedConnection,
    line: &str,
    limit: usize,
) -> Res<Rows> {
    let args = redis_args(line)?;
    let name = args.first().ok_or("Comando Redis vazio")?.to_ascii_uppercase();
    if [
        "SUBSCRIBE",
        "PSUBSCRIBE",
        "SSUBSCRIBE",
        "MONITOR",
        "SYNC",
        "PSYNC",
        "SELECT",
        "QUIT",
        "RESET",
    ]
    .contains(&name.as_str())
    {
        return Err(format!(
            "{name} não é suportado no console; use uma fonte de dados por banco"
        ));
    }
    let mut cmd = redis::cmd(&name);
    for a in &args[1..] {
        cmd.arg(a);
    }
    let value: redis::Value = cmd.query_async(c).await.map_err(err)?;
    let mut out = Rows::new();
    match &value {
        redis::Value::Array(items) | redis::Value::Set(items) => {
            out.names = vec!["#".into(), "value".into()];
            out.total = items.len();
            for (i, v) in items.iter().take(limit).enumerate() {
                out.rows.push(vec![Some((i + 1).to_string()), redis_text(v)]);
            }
        }
        redis::Value::Map(items) => {
            out.names = vec!["key".into(), "value".into()];
            out.total = items.len();
            for (k, v) in items.iter().take(limit) {
                out.rows.push(vec![redis_text(k), redis_text(v)]);
            }
        }
        other => {
            out.names = vec!["result".into()];
            out.total = 1;
            out.rows.push(vec![redis_text(other)]);
        }
    }
    Ok(out)
}
async fn redis_info(c: &mut redis::aio::MultiplexedConnection, db: i64) -> Res<Value> {
    let info: String = redis::cmd("INFO").query_async(c).await.map_err(err)?;
    let mut version = String::new();
    let mut dbs = vec![db];
    for line in info.lines() {
        if let Some(v) = line.strip_prefix("redis_version:") {
            version = format!("Redis {}", v.trim());
        } else if let Some((name, _)) = line.split_once(":keys=") {
            if let Ok(n) = name.trim_start_matches("db").parse::<i64>() {
                dbs.push(n);
            }
        }
    }
    dbs.sort_unstable();
    dbs.dedup();
    Ok(json!({"version":version,"schemas":dbs.iter().map(|d|format!("db{d}")).collect::<Vec<_>>()}))
}
/// SCAN limitado: no máximo 2.000 chaves e 400 iterações, sem enumerar o keyspace inteiro.
async fn redis_keys(c: &mut redis::aio::MultiplexedConnection) -> Res<Vec<Value>> {
    let mut cursor = 0u64;
    let mut keys: Vec<String> = vec![];
    for _ in 0..400 {
        let (next, batch): (u64, Vec<String>) = redis::cmd("SCAN")
            .arg(cursor)
            .arg("COUNT")
            .arg(500)
            .query_async(c)
            .await
            .map_err(err)?;
        keys.extend(batch);
        cursor = next;
        if cursor == 0 || keys.len() >= 2000 {
            break;
        }
    }
    keys.sort();
    keys.dedup();
    keys.truncate(2000);
    let mut pipe = redis::pipe();
    for key in &keys {
        pipe.cmd("TYPE").arg(key);
    }
    let kinds: Vec<String> = if keys.is_empty() {
        vec![]
    } else {
        pipe.query_async(c).await.map_err(err)?
    };
    Ok(keys
        .into_iter()
        .zip(kinds)
        .map(|(name, kind)| json!({"name":name,"kind":kind}))
        .collect())
}
const ORA_REOPEN_AFTER: usize = 200;
const ORA_SCHEMAS: &str = "SELECT username AS name FROM all_users WHERE oracle_maintained='N' UNION SELECT USER FROM dual ORDER BY 1";
fn column(name: &str, kind: &str, primary: bool) -> Value {
    json!({"name":name,"type":kind,"nullable":false,"primary":primary})
}
fn clip(v: Option<String>) -> Option<String> {
    v.map(|v| v.chars().take(513).collect())
}
fn label(input: &Value) -> Res<String> {
    let name = text(input, "name").trim();
    if !name.is_empty() {
        return Ok(name.to_string());
    }
    Ok(match Kind::of(input)? {
        Kind::Lite => Path::new(text(input, "file"))
            .file_name()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_else(|| "SQLite".into()),
        Kind::Redis => format!(
            "{}:{}/db{}",
            text(input, "host"),
            input["port"],
            redis_db(input)?
        ),
        _ => format!(
            "{}@{}:{}",
            text(input, "database"),
            text(input, "host"),
            input["port"]
        ),
    })
}
fn sanitize(source: &Value) -> Res<Value> {
    let mut source = source.clone();
    let object = source.as_object_mut().ok_or("Fonte de dados inválida")?;
    let id = object.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() || id.len() > 64 {
        return Err("Fonte de dados sem identificador".into());
    }
    Kind::of(&Value::Object(object.clone()))?;
    object.remove("password");
    Ok(source)
}
impl Database {
    pub fn new(state: Option<PathBuf>, root: &Path) -> Self {
        // oracle-rs habilita aws-lc-rs no rustls; com ring também presente, o provedor padrão
        // do processo fica ambíguo e clientes que usam `ClientConfig::builder()` (Redis) entram em pânico.
        let _ = rustls::crypto::ring::default_provider().install_default();
        Self {
            sessions: Mutex::default(),
            passwords: Mutex::default(),
            sources: state.map(|s| {
                s.join("data-sources")
                    .join(format!("{}.json", &hash(root.to_string_lossy().as_bytes())[..24]))
            }),
        }
    }
    fn session(&self, id: &str) -> Res<Arc<Session>> {
        self.sessions
            .lock()
            .map_err(err)?
            .get(id)
            .cloned()
            .ok_or("Conexão encerrada".into())
    }
    fn load_sources(&self) -> Res<Vec<Value>> {
        let Some(file) = &self.sources else {
            return Ok(vec![]);
        };
        match fs::read(file) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|_| "Fontes de dados inválidas; corrija ou remova data-sources".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
            Err(e) => Err(err(e)),
        }
    }
    fn save_sources(&self, list: &[Value]) -> Res<Vec<Value>> {
        if list.len() > 200 {
            return Err("Limite de 200 fontes de dados".into());
        }
        let list = list.iter().map(sanitize).collect::<Res<Vec<_>>>()?;
        let file = self.sources.as_ref().ok_or("Armazenamento indisponível")?;
        let dir = file.parent().ok_or("Diretório inválido")?;
        fs::create_dir_all(dir).map_err(err)?;
        let temp = dir.join(format!(".sources-{}.tmp", uuid::Uuid::new_v4()));
        fs::write(&temp, serde_json::to_vec_pretty(&list).map_err(err)?).map_err(err)?;
        fs::rename(temp, file).map_err(err)?;
        Ok(list)
    }
    /// Completa a senha "até reiniciar" guardada em memória para a fonte de dados.
    fn resolve(&self, input: &Value) -> Res<Value> {
        let mut input = input.clone();
        let source = text(&input, "sourceId").to_string();
        if text(&input, "password").is_empty() && text(&input, "auth") != "none" && !source.is_empty() {
            if let Some(p) = self.passwords.lock().map_err(err)?.get(&source) {
                input["password"] = json!(p);
            }
        }
        if text(&input, "auth") == "none" {
            input["user"] = json!("");
            input["password"] = json!("");
        }
        Ok(input)
    }
    fn remember(&self, input: &Value) -> Res<()> {
        let source = text(input, "sourceId");
        if source.is_empty() {
            return Ok(());
        }
        let mut passwords = self.passwords.lock().map_err(err)?;
        match text(input, "savePassword") {
            "session" if !text(input, "password").is_empty() => {
                passwords.insert(source.into(), text(input, "password").into());
            }
            "never" => {
                passwords.remove(source);
            }
            _ => {}
        }
        Ok(())
    }
    async fn rows(&self, id: &str, sql: &str, params: &[&str], limit: usize) -> Res<Rows> {
        let session = self.session(id)?;
        let mut conn = session.conn.lock().await;
        if matches!(*conn, Conn::Ora(_))
            && session.used.fetch_add(1, std::sync::atomic::Ordering::Relaxed) >= ORA_REOPEN_AFTER
        {
            // Reabre antes de esgotar OPEN_CURSORS (padrão 300); o console é auto-commit.
            *conn = open(&session.input).await?;
            session.used.store(1, std::sync::atomic::Ordering::Relaxed);
        }
        let result = tokio::time::timeout(
            Duration::from_secs(300),
            query(&mut conn, sql, params, limit),
        )
        .await
        .map_err(|_| "Consulta excedeu 300 segundos".to_owned())?;
        // oracle-rs encerra a conexão em alguns erros do servidor; reabre para a sessão seguir utilizável.
        if let (Err(e), Conn::Ora(c)) = (&result, &mut *conn) {
            if c.is_closed() || c.ping().await.is_err() {
                return match open(&session.input).await {
                    Ok(fresh) => {
                        *conn = fresh;
                        session.used.store(0, std::sync::atomic::Ordering::Relaxed);
                        Err(format!("{e} (conexão Oracle reaberta; alterações não confirmadas e estado de sessão foram perdidos)"))
                    }
                    Err(again) => Err(format!("{e}; reconexão falhou: {again}")),
                };
            }
        }
        result
    }
    /// Metadados e prévias usam conexão própria, em transação somente leitura quando possível.
    async fn preview_rows(&self, id: &str, sql: &str, params: &[&str], limit: usize) -> Res<Rows> {
        let session = self.session(id)?;
        let mut input = session.input.clone();
        if session.kind == Kind::Lite {
            input["readOnly"] = json!(true);
        }
        let mut conn = open(&input).await?;
        match &mut conn {
            Conn::Pg(c) => {
                c.execute("BEGIN READ ONLY").await.map_err(err)?;
            }
            Conn::My(c) => {
                c.execute("START TRANSACTION READ ONLY").await.map_err(err)?;
            }
            _ => {}
        }
        tokio::time::timeout(Duration::from_secs(8), query(&mut conn, sql, params, limit))
            .await
            .map_err(|_| "Prévia excedeu 8 segundos".to_string())?
    }
    async fn redis_at(&self, id: &str, schema: &str) -> Res<redis::aio::MultiplexedConnection> {
        let session = self.session(id)?;
        let db = redis_db(&json!({ "database": schema }))?;
        tokio::time::timeout(Duration::from_secs(8), redis_open(&session.input, db))
            .await
            .map_err(|_| "Conexão excedeu 8 segundos".to_string())?
    }
    async fn inspect(input: &Value) -> Res<(Conn, Value)> {
        let mut c = open(input).await?;
        let kind = Kind::of(input)?;
        if let Conn::Redis(r) = &mut c {
            let info = redis_info(r, redis_db(input)?).await?;
            return Ok((c, info));
        }
        if let Conn::Ora(o) = &mut c {
            let version = oracle::version(o).await;
            let schemas = oracle::rows(o, ORA_SCHEMAS, &[], 2000).await?;
            let schemas: Vec<_> = schemas.rows.iter().filter_map(|r| r.first().cloned().flatten()).collect();
            return Ok((c, json!({"version":version,"schemas":schemas})));
        }
        let (version, schemas) = match kind {
            Kind::Pg => ("SELECT version() AS version", "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' ORDER BY schema_name"),
            Kind::My => ("SELECT VERSION() AS version", "SELECT schema_name AS name FROM information_schema.schemata ORDER BY schema_name"),
            Kind::Lite => ("SELECT 'SQLite ' || sqlite_version() AS version", "SELECT name FROM pragma_database_list WHERE name<>'temp' ORDER BY seq"),
            Kind::Ms => ("SELECT @@VERSION AS version", "SELECT name FROM sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest') AND name NOT LIKE 'db[_]%' ORDER BY name"),
            Kind::Redis | Kind::Ora => unreachable!(),
        };
        let version = query(&mut c, version, &[], 1).await?;
        let schemas = query(&mut c, schemas, &[], 2000).await?;
        Ok((
            c,
            json!({"version":version.first().unwrap_or_default(),"schemas":schemas.rows.iter().filter_map(|r|r.first().cloned().flatten()).collect::<Vec<_>>()}),
        ))
    }
    async fn columns(&self, id: &str, schema: &str, table: &str) -> Res<Vec<Value>> {
        let kind = self.session(id)?.kind;
        let mut columns = if kind == Kind::Lite {
            let sql = format!("SELECT name, type, CASE WHEN \"notnull\"=0 THEN 'YES' ELSE 'NO' END AS nullable, pk FROM {}.pragma_table_info(?) ORDER BY cid", kind.quote(schema)?);
            self.preview_rows(id, &sql, &[table], 129).await?.maps()
        } else if kind == Kind::Ora {
            let sql = "SELECT column_name AS name, data_type AS type, CASE nullable WHEN 'Y' THEN 'YES' ELSE 'NO' END AS nullable FROM all_tab_columns WHERE owner=:1 AND table_name=:2 ORDER BY column_id";
            self.preview_rows(id, sql, &[schema, table], 129).await?.maps()
        } else {
            let sql=format!("SELECT column_name AS name, data_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = {} AND table_name = {} ORDER BY ordinal_position",kind.ph(1),kind.ph(2));
            self.preview_rows(id, &sql, &[schema, table], 129)
                .await?
                .maps()
        };
        if columns.is_empty() || columns.len() > 128 {
            return Err("Tabela ausente ou excede 128 colunas".into());
        }
        let keys = if kind == Kind::Lite {
            columns
                .iter()
                .filter(|c| c["pk"].as_str().is_some_and(|v| v != "0"))
                .map(|c| json!({"name":c["name"]}))
                .collect()
        } else if kind == Kind::Ora {
            let sql = "SELECT cc.column_name AS name FROM all_constraints c JOIN all_cons_columns cc ON c.owner=cc.owner AND c.constraint_name=cc.constraint_name WHERE c.constraint_type='P' AND c.owner=:1 AND c.table_name=:2 ORDER BY cc.position";
            self.preview_rows(id, sql, &[schema, table], 128).await?.maps()
        } else {
            let sql=format!("SELECT k.column_name AS name FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON t.constraint_name=k.constraint_name AND t.table_schema=k.table_schema AND t.table_name=k.table_name WHERE t.constraint_type='PRIMARY KEY' AND t.table_schema={} AND t.table_name={} ORDER BY k.ordinal_position",kind.ph(1),kind.ph(2));
            self.preview_rows(id, &sql, &[schema, table], 128)
                .await?
                .maps()
        };
        for c in &mut columns {
            c["primary"] = json!(keys.iter().any(|k| k["name"] == c["name"]));
            c["nullable"] = json!(c["nullable"] == "YES");
            if let Some(o) = c.as_object_mut() {
                o.remove("pk");
            }
        }
        Ok(columns)
    }
    async fn tables(&self, id: &str, schema: &str) -> Res<Vec<Value>> {
        valid(schema)?;
        let kind = self.session(id)?.kind;
        let sql = match kind {
            Kind::Redis => {
                let mut c = self.redis_at(id, schema).await?;
                return redis_keys(&mut c).await;
            }
            Kind::Lite => format!("SELECT name, upper(type) AS kind FROM {}.sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name LIMIT 2000", kind.quote(schema)?),
            Kind::Ora => "SELECT object_name AS name, object_type AS kind FROM all_objects WHERE owner=:1 AND object_type IN ('TABLE','VIEW') AND object_name NOT LIKE 'BIN$%' ORDER BY object_name FETCH FIRST 2000 ROWS ONLY".into(),
            Kind::Ms => format!("SELECT TOP 2000 table_name AS name, table_type AS kind FROM information_schema.tables WHERE table_schema={} ORDER BY table_name", kind.ph(1)),
            _ => format!("SELECT table_name AS name, table_type AS kind FROM information_schema.tables WHERE table_schema={} ORDER BY table_name LIMIT 2000", kind.ph(1)),
        };
        let params: &[&str] = if kind == Kind::Lite { &[] } else { &[schema] };
        Ok(self.preview_rows(id, &sql, params, 2000).await?.maps())
    }
    fn cell_expr(kind: Kind, column: &Value, alias: &str) -> Res<String> {
        let name = kind.quote(s(&column["name"])?)?;
        let alias = kind.quote(alias)?;
        Ok(match kind {
            Kind::Pg => format!("LEFT(CAST({name} AS text),513) AS {alias}"),
            Kind::My => format!("LEFT(CAST({name} AS CHAR),513) AS {alias}"),
            Kind::Lite => format!("substr(CAST({name} AS TEXT),1,513) AS {alias}"),
            Kind::Ms => {
                let dtype = column["type"].as_str().unwrap_or("").to_ascii_lowercase();
                let value = match dtype.as_str() {
                    "binary" | "varbinary" | "image" | "timestamp" | "rowversion" => {
                        format!("CONVERT(VARCHAR(MAX), CAST({name} AS VARBINARY(MAX)), 1)")
                    }
                    "geography" | "geometry" | "hierarchyid" => format!("{name}.ToString()"),
                    _ => format!("CAST({name} AS NVARCHAR(MAX))"),
                };
                format!("LEFT({value},513) AS {alias}")
            }
            Kind::Ora => format!("{} AS {alias}", oracle::cell_expr(&name, column["type"].as_str().unwrap_or(""))),
            Kind::Redis => return Err("Redis não usa colunas".into()),
        })
    }
    async fn ms_ddl(&self, id: &str, schema: &str, table: &str) -> Res<String> {
        let kind = Kind::Ms;
        let c=self.preview_rows(id,"SELECT column_name AS name, data_type AS dtype, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale, is_nullable AS nullable FROM information_schema.columns WHERE table_schema=@P1 AND table_name=@P2 ORDER BY ordinal_position",&[schema,table],128).await?.maps();
        if c.is_empty() {
            return Err("Tabela não encontrada".into());
        }
        let keys = self.columns(id, schema, table).await?;
        let mut lines = vec![];
        for col in &c {
            let dtype = s(&col["dtype"])?;
            let size = match (dtype, col["len"].as_str(), col["prec"].as_str(), col["scale"].as_str()) {
                ("decimal" | "numeric", _, Some(p), Some(sc)) => format!("({p},{sc})"),
                (_, Some("-1"), _, _) => "(max)".into(),
                (_, Some(len), _, _) if !dtype.contains("text") && dtype != "xml" => format!("({len})"),
                _ => String::new(),
            };
            lines.push(format!(
                "    {} {}{}{}",
                kind.quote(s(&col["name"])?)?,
                dtype,
                size,
                if col["nullable"] == "NO" { " NOT NULL" } else { "" }
            ));
        }
        let pk = keys
            .iter()
            .filter(|c| c["primary"] == true)
            .map(|c| kind.quote(c["name"].as_str().unwrap_or("")))
            .collect::<Res<Vec<_>>>()?;
        if !pk.is_empty() {
            lines.push(format!("    PRIMARY KEY ({})", pk.join(", ")));
        }
        Ok(format!("-- metadata preview; defaults, foreign keys and indexes not included\nCREATE TABLE {}.{} (\n{}\n);\n",kind.quote(schema)?,kind.quote(table)?,lines.join(",\n")))
    }
    async fn ora_ddl(&self, id: &str, schema: &str, table: &str) -> Res<String> {
        let kind = Kind::Ora;
        let c = self.preview_rows(id, "SELECT column_name AS name, data_type AS dtype, data_length AS len, char_length AS char_length, char_used AS char_used, data_precision AS prec, data_scale AS scale, nullable AS nullable FROM all_tab_columns WHERE owner=:1 AND table_name=:2 ORDER BY column_id", &[schema, table], 1000).await?.maps();
        if c.is_empty() {
            return Err("Tabela não encontrada".into());
        }
        let keys = self.columns(id, schema, table).await?;
        let mut lines = vec![];
        for col in &c {
            lines.push(format!(
                "    {} {}{}",
                kind.quote(s(&col["name"])?)?,
                oracle::column_type(col),
                if col["nullable"] == "N" { " NOT NULL" } else { "" }
            ));
        }
        let pk = keys
            .iter()
            .filter(|c| c["primary"] == true)
            .map(|c| kind.quote(c["name"].as_str().unwrap_or("")))
            .collect::<Res<Vec<_>>>()?;
        if !pk.is_empty() {
            lines.push(format!("    PRIMARY KEY ({})", pk.join(", ")));
        }
        Ok(format!("-- metadata preview; defaults, foreign keys and indexes not included\nCREATE TABLE {}.{} (\n{}\n);\n",kind.quote(schema)?,kind.quote(table)?,lines.join(",\n")))
    }
    /// Modelo para autocompletar: uma consulta por schema visível (padrão: schema atual).
    async fn ora_model(&self, id: &str, input: &Value, source: String) -> Res<Value> {
        let current = self
            .preview_rows(id, "SELECT SYS_CONTEXT('USERENV','CURRENT_SCHEMA') AS name FROM dual", &[], 1)
            .await?
            .first()
            .unwrap_or_default();
        let mut names: Vec<String> = input["schemas"]
            .as_array()
            .map(|v| v.iter().filter_map(Value::as_str).map(String::from).collect())
            .unwrap_or_default();
        if names.is_empty() {
            names.push(current.clone());
        }
        let mut result = vec![];
        for name in names.iter().take(20) {
            let rows = self.preview_rows(id, "SELECT c.table_name AS t, o.object_type AS k, c.column_name AS c, c.data_type AS d FROM all_tab_columns c JOIN all_objects o ON o.owner=c.owner AND o.object_name=c.table_name AND o.object_type IN ('TABLE','VIEW') WHERE c.owner=:1 AND c.table_name NOT LIKE 'BIN$%' ORDER BY c.table_name, c.column_id", &[name], 50000).await?;
            let mut tables: Vec<Value> = vec![];
            for r in rows.rows {
                let get = |i: usize| r.get(i).cloned().flatten().unwrap_or_default();
                if tables.last().is_none_or(|t| t["name"] != get(0)) {
                    tables.push(json!({"name":get(0),"kind":if get(1)=="VIEW"{"view"}else{"table"},"columns":[]}));
                }
                if let Some(columns) = tables.last_mut().and_then(|t| t["columns"].as_array_mut()) {
                    columns.push(json!({"name":get(2),"type":get(3)}));
                }
            }
            result.push(json!({"name":name,"tables":tables}));
        }
        Ok(json!({"label":source,"database":input["database"],"defaultSchema":current,"schemas":result}))
    }
    /// DDL textual para drivers sem geração no frontend (MySQL, SQLite, SQL Server).
    async fn text_ddl(&self, id: &str, kind: Kind, schema: &str, table: &str) -> Res<Option<String>> {
        Ok(Some(match kind {
            Kind::My => {
                let q = format!("SHOW CREATE TABLE {}.{}", kind.quote(schema)?, kind.quote(table)?);
                let r = self.preview_rows(id, &q, &[], 1).await?;
                format!(
                    "-- auto-generated definition\n{};\n",
                    r.rows.first().and_then(|r| r.get(1)).cloned().flatten().unwrap_or_default()
                )
            }
            Kind::Lite => {
                let q = format!("SELECT sql FROM {}.sqlite_master WHERE name=?", kind.quote(schema)?);
                let r = self.preview_rows(id, &q, &[table], 1).await?;
                format!(
                    "-- auto-generated definition\n{};\n",
                    r.first().ok_or("Tabela não encontrada")?
                )
            }
            Kind::Ms => self.ms_ddl(id, schema, table).await?,
            Kind::Ora => self.ora_ddl(id, schema, table).await?,
            Kind::Redis => return Err("Redis não possui DDL".into()),
            Kind::Pg => return Ok(None),
        }))
    }
    async fn establish(&self, input: &Value) -> Res<(Conn, Value, Option<Tunnel>, Value)> {
        let input = self.resolve(input)?;
        let (tunnel, effective) = tunnel(&input).await?;
        let (conn, info) = Self::inspect(&effective).await?;
        self.remember(&input)?;
        Ok((conn, info, tunnel, effective))
    }
    pub async fn dispatch(&self, method: &str, args: &[Value]) -> Res<Value> {
        let a = |i| args.get(i).unwrap_or(&Value::Null);
        match method {
            "database" => Ok(self.establish(a(0)).await?.1),
            "databaseSources" => Ok(json!(self.load_sources()?)),
            "databaseSaveSources" => Ok(json!(self.save_sources(
                a(0).as_array().ok_or("Lista de fontes inválida")?
            )?)),
            "databasePasswordStored" => Ok(json!(self
                .passwords
                .lock()
                .map_err(err)?
                .contains_key(s(a(0))?))),
            "databaseForgetPassword" => {
                self.passwords.lock().map_err(err)?.remove(s(a(0))?);
                Ok(Value::Null)
            }
            "databasePickFile" => {
                let title = match a(0).as_str() {
                    Some("sqlite") => "Arquivo SQLite",
                    Some("key") => "Chave privada SSH",
                    _ => "Certificado CA",
                };
                Ok(rfd::AsyncFileDialog::new()
                    .set_title(title)
                    .pick_file()
                    .await
                    .map(|f| json!(f.path()))
                    .unwrap_or(Value::Null))
            }
            "databaseConnect" => {
                if self.sessions.lock().map_err(err)?.len() >= 10 {
                    return Err("Limite de dez conexões".into());
                }
                let (mut conn, info, tunnel, input) = self.establish(a(0)).await?;
                let kind = Kind::of(&input)?;
                let pid_sql = match kind {
                    Kind::Pg => Some("SELECT pg_backend_pid() AS pid"),
                    Kind::My => Some("SELECT CONNECTION_ID() AS pid"),
                    Kind::Ms => Some("SELECT CAST(@@SPID AS BIGINT) AS pid"),
                    Kind::Ora => Some("SELECT SYS_CONTEXT('USERENV','SID') AS pid FROM dual"),
                    _ => None,
                };
                let pid = match pid_sql {
                    Some(sql) => query(&mut conn, sql, &[], 1)
                        .await?
                        .first()
                        .unwrap_or_else(|| "0".into())
                        .parse::<i64>()
                        .map_err(err)?,
                    None => 0,
                };
                if kind == Kind::Pg {
                    query(&mut conn, "SET statement_timeout=300000", &[], 0).await?;
                }
                let id = uuid::Uuid::new_v4().to_string();
                let wanted: Vec<&str> = input["schemas"]
                    .as_array()
                    .map(|v| v.iter().filter_map(Value::as_str).collect())
                    .unwrap_or_default();
                let schemas: Vec<&Value> = info["schemas"]
                    .as_array()
                    .ok_or("Schemas inválidos")?
                    .iter()
                    .filter(|v| {
                        let name = v.as_str().unwrap_or("");
                        if !wanted.is_empty() {
                            return wanted.contains(&name);
                        }
                        !["information_schema", "mysql", "performance_schema", "sys"].contains(&name)
                    })
                    .collect();
                let result = json!({"id":id,"driver":input["driver"],"sourceId":input["sourceId"],"label":label(&input)?,"version":info["version"],"readOnly":input["readOnly"].as_bool().unwrap_or(false),"schemas":schemas});
                self.sessions.lock().map_err(err)?.insert(
                    id,
                    Arc::new(Session {
                        input,
                        kind,
                        conn: tokio::sync::Mutex::new(conn),
                        pid,
                        used: Default::default(),
                        _tunnel: tunnel,
                    }),
                );
                Ok(result)
            }
            "databaseDisconnect" => {
                self.sessions.lock().map_err(err)?.remove(s(a(0))?);
                Ok(Value::Null)
            }
            "databaseCancel" => {
                let session = self.session(s(a(0))?)?;
                let sql = match session.kind {
                    Kind::Pg => format!("SELECT pg_cancel_backend({})", session.pid),
                    Kind::My => format!("KILL QUERY {}", session.pid),
                    _ => return Err("Cancelamento ainda não é suportado para este driver".into()),
                };
                let mut c = open(&session.input).await?;
                query(&mut c, &sql, &[], 1).await?;
                Ok(Value::Null)
            }
            "databaseTables" => Ok(json!(self.tables(s(a(0))?, s(a(1))?).await?)),
            "databasePage" => {
                let id = s(a(0))?;
                let schema = s(a(1))?;
                let table = s(a(2))?;
                let kind = self.session(id)?.kind;
                let offset = a(3)
                    .as_u64()
                    .filter(|v| (kind == Kind::Redis || *v <= 1000000) && v % 50 == 0)
                    .ok_or("Página inválida")?;
                if kind == Kind::Redis {
                    if table.is_empty() || table.len() > 4096 {
                        return Err("Chave inválida".into());
                    }
                    let mut c = self.redis_at(id, schema).await?;
                    return redis_edit::page(&mut c, table, offset, a(4).as_str()).await;
                }
                let c = self.columns(id, schema, table).await?;
                let expr = c
                    .iter()
                    .enumerate()
                    .map(|(i, c)| Self::cell_expr(kind, c, &format!("c{i}")))
                    .collect::<Res<Vec<_>>>()?;
                let keys = c
                    .iter()
                    .filter(|c| c["primary"] == true)
                    .map(|c| kind.quote(c["name"].as_str().unwrap_or("")))
                    .collect::<Res<Vec<_>>>()?;
                let from = format!("{}.{}", kind.quote(schema)?, kind.quote(table)?);
                let sql = if kind == Kind::Ora {
                    format!(
                        "SELECT {} FROM {}{} OFFSET {} ROWS FETCH NEXT 51 ROWS ONLY",
                        expr.join(","),
                        from,
                        if keys.is_empty() { String::new() } else { format!(" ORDER BY {}", keys.join(",")) },
                        offset
                    )
                } else if kind == Kind::Ms {
                    format!(
                        "SELECT {} FROM {} ORDER BY {} OFFSET {} ROWS FETCH NEXT 51 ROWS ONLY",
                        expr.join(","),
                        from,
                        if keys.is_empty() { "(SELECT NULL)".into() } else { keys.join(",") },
                        offset
                    )
                } else {
                    let order = if keys.is_empty() {
                        String::new()
                    } else {
                        format!(" ORDER BY {}", keys.join(","))
                    };
                    format!("SELECT {} FROM {}{} LIMIT 51 OFFSET {}", expr.join(","), from, order, offset)
                };
                let rows = self.preview_rows(id, &sql, &[], 51).await?;
                Ok(
                    json!({"columns":c,"rows":rows.rows.iter().take(50).collect::<Vec<_>>(),"offset":offset,"hasMore":rows.total>50,"ordered":!keys.is_empty(),"cellLimit":512}),
                )
            }
            "databaseRedisEdit" => {
                let id = s(a(0))?;
                if self.session(id)?.kind != Kind::Redis {
                    return Err("Edição de valores disponível só para Redis".into());
                }
                let mut c = self.redis_at(id, s(a(1))?).await?;
                redis_edit::edit(&mut c, a(2)).await
            }
            "databaseModel" => {
                let id = s(a(0))?;
                let session = self.session(id)?;
                let kind = session.kind;
                let source = label(&session.input)?;
                if kind == Kind::Redis {
                    let db = format!("db{}", redis_db(&session.input)?);
                    return Ok(json!({"label":source,"database":db,"defaultSchema":db,"schemas":[]}));
                }
                if kind == Kind::Ora {
                    return self.ora_model(id, &session.input, source).await;
                }
                let schema_sql = match kind {
                    Kind::Pg => "SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema') AND schema_name NOT LIKE 'pg_%' ORDER BY schema_name",
                    Kind::My => "SELECT DATABASE() AS name",
                    Kind::Lite => "SELECT name FROM pragma_database_list WHERE name<>'temp' ORDER BY seq",
                    _ => "SELECT name FROM sys.schemas WHERE name NOT IN ('sys','INFORMATION_SCHEMA','guest') AND name NOT LIKE 'db[_]%' ORDER BY name",
                };
                let schemas = self.preview_rows(id, schema_sql, &[], 2000).await?.maps();
                let mut result = vec![];
                for schema in schemas {
                    let name = s(&schema["name"])?;
                    let tables = self.tables(id, name).await?;
                    let mut list = vec![];
                    for table in tables {
                        let t = s(&table["name"])?;
                        let cols = self.columns(id, name, t).await?;
                        list.push(json!({"name":t,"kind":if table["kind"].as_str().unwrap_or("").contains("VIEW"){"view"}else{"table"},"columns":cols.iter().map(|c|json!({"name":c["name"],"type":c["type"]})).collect::<Vec<_>>()}));
                    }
                    result.push(json!({"name":name,"tables":list}));
                }
                let current = match kind {
                    Kind::Pg => self.preview_rows(id, "SELECT current_schema() AS name", &[], 1).await?.first().unwrap_or_default(),
                    Kind::Ms => self.preview_rows(id, "SELECT SCHEMA_NAME() AS name", &[], 1).await?.first().unwrap_or_default(),
                    Kind::Lite => "main".into(),
                    _ => text(&session.input, "database").into(),
                };
                let database = if kind == Kind::Lite { json!(source) } else { session.input["database"].clone() };
                Ok(json!({"label":source,"database":database,"defaultSchema":current,"schemas":result}))
            }
            "databaseExecute" => {
                let id = s(a(0))?;
                let mut statements = a(1)
                    .as_array()
                    .ok_or("Comandos SQL inválidos")?
                    .iter()
                    .map(|v| s(v).map(str::to_string))
                    .collect::<Res<Vec<_>>>()?;
                // O frontend divide por `;`; blocos PL/SQL precisam ser remontados.
                if self.session(id)?.kind == Kind::Ora {
                    statements = oracle::split(&statements.join(";\n"));
                }
                let mut results = vec![];
                for statement in statements.iter().take(100) {
                    let statement = statement.as_str();
                    if statement.len() > 1000000 {
                        return Err("SQL excedeu 1 MB".into());
                    }
                    let started = Instant::now();
                    let query = self.rows(id, statement, &[], 501).await;
                    let result = match query {
                        Ok(r) => {
                            if r.names.is_empty() {
                                json!({"statement":statement,"ms":started.elapsed().as_millis(),"kind":"update","affected":r.affected})
                            } else {
                                let rows: Vec<_> = r
                                    .rows
                                    .into_iter()
                                    .take(500)
                                    .map(|row| {
                                        row.into_iter()
                                            .map(|c| {
                                                c.map(|v| {
                                                    if v.chars().count() > 512 {
                                                        v.chars().take(512).collect::<String>()
                                                            + "…"
                                                    } else {
                                                        v
                                                    }
                                                })
                                            })
                                            .collect::<Vec<_>>()
                                    })
                                    .collect();
                                json!({"statement":statement,"ms":started.elapsed().as_millis(),"kind":"rows","columns":r.names,"rows":rows,"truncated":r.total>500})
                            }
                        }
                        Err(error) => {
                            json!({"statement":statement,"ms":started.elapsed().as_millis(),"kind":"error","error":error})
                        }
                    };
                    let stop = result["kind"] == "error";
                    results.push(result);
                    if stop {
                        break;
                    }
                }
                Ok(json!(results))
            }
            "databaseDdlData" | "databaseDdl" => {
                let id = s(a(0))?;
                let schema = s(a(1))?;
                let table = s(a(2))?;
                valid(schema)?;
                valid(table)?;
                let kind = self.session(id)?.kind;
                if let Some(ddl) = self.text_ddl(id, kind, schema, table).await? {
                    return Ok(json!(ddl));
                }
                if method == "databaseDdl" {
                    return self.pg_preview_ddl(id, schema, table).await;
                }
                let columns=self.preview_rows(id,"SELECT column_name AS name, data_type AS dtype, udt_name AS udt, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale, is_nullable AS nullable, column_default AS def FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",&[schema,table],128).await?.maps();
                if columns.is_empty() {
                    return Err("Tabela não encontrada".into());
                }
                let keys=self.preview_rows(id,"SELECT tc.constraint_type AS kind, tc.constraint_name AS cname, kcu.column_name AS col, ccu.table_schema AS fschema, ccu.table_name AS ftable, ccu.column_name AS fcol FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type='FOREIGN KEY' AND ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.table_schema WHERE tc.table_schema=$1 AND tc.table_name=$2 AND tc.constraint_type IN ('PRIMARY KEY','FOREIGN KEY','UNIQUE') ORDER BY kcu.ordinal_position",&[schema,table],2000).await?.maps();
                let primary=self.preview_rows(id,"SELECT kcu.table_schema AS s, kcu.table_name AS t, kcu.column_name AS c FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema WHERE tc.constraint_type='PRIMARY KEY'",&[],50000).await?.maps();
                let owner=self.preview_rows(id,"SELECT tableowner AS owner FROM pg_tables WHERE schemaname=$1 AND tablename=$2",&[schema,table],1).await?.maps();
                let current = self
                    .preview_rows(id, "SELECT current_schema() AS name", &[], 1)
                    .await?
                    .first()
                    .unwrap_or_default();
                Ok(
                    json!({"name":if schema==current{table.to_string()}else{format!("{}.{}",schema,table)},"columns":columns,"keys":keys,"primaryKeys":primary,"current":current,"owner":owner.first().and_then(|v|v["owner"].as_str())}),
                )
            }
            _ => Err("Comando de banco desconhecido".into()),
        }
    }
    async fn pg_preview_ddl(&self, id: &str, schema: &str, table: &str) -> Res<Value> {
        let kind = Kind::Pg;
        let c = self.columns(id, schema, table).await?;
        let mut lines = vec![];
        for col in &c {
            lines.push(format!(
                "    {} {}{}",
                kind.quote(s(&col["name"])?)?,
                s(&col["type"])?,
                if col["nullable"] == false {
                    " NOT NULL"
                } else {
                    ""
                }
            ));
        }
        let keys = c
            .iter()
            .filter(|c| c["primary"] == true)
            .map(|c| kind.quote(c["name"].as_str().unwrap_or("")))
            .collect::<Res<Vec<_>>>()?;
        if !keys.is_empty() {
            lines.push(format!("    PRIMARY KEY ({})", keys.join(", ")));
        }
        Ok(json!(format!("-- metadata preview; defaults, foreign keys and indexes not included\nCREATE TABLE {}.{} (\n{}\n);\n",kind.quote(schema)?,kind.quote(table)?,lines.join(",\n"))))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redis_arguments_respect_quotes() {
        assert_eq!(
            redis_args(r#"SET "a key" 'x y' plain"#).unwrap(),
            vec!["SET", "a key", "x y", "plain"]
        );
        assert_eq!(redis_args(r#"SET k """#).unwrap(), vec!["SET", "k", ""]);
        assert_eq!(redis_args("GET \"a\\nb\"").unwrap(), vec!["GET", "a\nb"]);
        assert!(redis_args("GET \"open").is_err());
    }
    #[test]
    fn identifiers_are_quoted_per_dialect() {
        assert_eq!(Kind::Pg.quote("a\"b").unwrap(), "\"a\"\"b\"");
        assert_eq!(Kind::My.quote("a`b").unwrap(), "`a``b`");
        assert_eq!(Kind::Ms.quote("a]b").unwrap(), "[a]]b]");
        assert_eq!(Kind::Lite.quote("t").unwrap(), "\"t\"");
        assert!(Kind::Pg.quote("").is_err());
        assert_eq!(Kind::Ms.ph(2), "@P2");
    }
    #[test]
    fn ssl_modes_and_legacy_tls() {
        assert_eq!(ssl(&json!({"tls":true})).unwrap().0, "verify-full");
        assert_eq!(ssl(&json!({})).unwrap().0, "disable");
        assert_eq!(ssl(&json!({"ssl":{"mode":"require","ca":""}})).unwrap(), ("require", None));
        assert!(ssl(&json!({"ssl":{"mode":"bogus"}})).is_err());
    }
    #[test]
    fn sources_never_keep_passwords() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::new(Some(dir.path().into()), Path::new("/projeto"));
        let saved = db
            .save_sources(&[json!({"id":"a","driver":"postgres","password":"secreta","host":"h"})])
            .unwrap();
        assert!(saved[0].get("password").is_none());
        let raw = fs::read_to_string(db.sources.as_ref().unwrap()).unwrap();
        assert!(!raw.contains("secreta"));
        assert_eq!(db.load_sources().unwrap()[0]["host"], "h");
        assert!(db.save_sources(&[json!({"id":"b","driver":"mongodb"})]).is_err());
        assert!(db.save_sources(&[json!({"id":"c","driver":"oracle","connectType":"sid"})]).is_ok());
    }
    #[test]
    fn session_passwords_stay_in_memory() {
        let db = Database::new(None, Path::new("/p"));
        let input = json!({"sourceId":"s","password":"x","savePassword":"session"});
        db.remember(&input).unwrap();
        assert_eq!(db.resolve(&json!({"sourceId":"s","password":""})).unwrap()["password"], "x");
        assert_eq!(db.resolve(&json!({"sourceId":"s","auth":"none","password":""})).unwrap()["password"], "");
        db.remember(&json!({"sourceId":"s","savePassword":"never"})).unwrap();
        assert_eq!(db.resolve(&json!({"sourceId":"s","password":""})).unwrap()["password"], "");
    }
    #[tokio::test]
    async fn sqlite_browse_page_and_ddl() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("fixture.sqlite");
        let mut c = SqliteConnection::connect_with(
            &SqliteConnectOptions::new().filename(&file).create_if_missing(true),
        )
        .await
        .unwrap();
        c.execute("CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT, notes TEXT); CREATE VIEW names AS SELECT name FROM people;")
            .await
            .unwrap();
        for i in 1..=55 {
            sqlx::query("INSERT INTO people (id,name,notes) VALUES (?,?,?)")
                .bind(i)
                .bind(format!("Pessoa {i}"))
                .bind(if i == 1 { None } else { Some("x".repeat(600)) })
                .execute(&mut c)
                .await
                .unwrap();
        }
        drop(c);
        let db = Database::new(None, dir.path());
        let input = json!({"driver":"sqlite","file":file,"name":"Fixture"});
        let session = db.dispatch("databaseConnect", &[input]).await.unwrap();
        let id = session["id"].as_str().unwrap().to_string();
        assert_eq!(session["schemas"], json!(["main"]));
        assert_eq!(session["label"], "Fixture");
        let tables = db.dispatch("databaseTables", &[json!(id), json!("main")]).await.unwrap();
        assert!(tables.as_array().unwrap().iter().any(|t| t["name"] == "people" && t["kind"] == "TABLE"));
        assert!(tables.as_array().unwrap().iter().any(|t| t["name"] == "names" && t["kind"] == "VIEW"));
        let page = db
            .dispatch("databasePage", &[json!(id), json!("main"), json!("people"), json!(0)])
            .await
            .unwrap();
        assert_eq!(page["rows"].as_array().unwrap().len(), 50);
        assert_eq!(page["rows"][0][0], "1");
        assert!(page["rows"][0][2].is_null());
        assert_eq!(page["rows"][1][2].as_str().unwrap().len(), 513);
        assert_eq!(page["columns"][0]["primary"], true);
        assert_eq!(page["hasMore"], true);
        let second = db
            .dispatch("databasePage", &[json!(id), json!("main"), json!("people"), json!(50)])
            .await
            .unwrap();
        assert_eq!(second["rows"].as_array().unwrap().len(), 5);
        assert!(db
            .dispatch("databasePage", &[json!(id), json!("main"), json!("people\"; DROP TABLE people; --"), json!(0)])
            .await
            .is_err());
        let ddl = db
            .dispatch("databaseDdl", &[json!(id), json!("main"), json!("people")])
            .await
            .unwrap();
        assert!(ddl.as_str().unwrap().contains("CREATE TABLE people"));
        let result = db
            .dispatch("databaseExecute", &[json!(id), json!(["UPDATE people SET name='X' WHERE id<3", "SELECT count(*) AS n FROM people"])])
            .await
            .unwrap();
        assert_eq!(result[0]["affected"], 2);
        assert_eq!(result[1]["rows"][0][0], "55");
        let model = db.dispatch("databaseModel", &[json!(id)]).await.unwrap();
        assert_eq!(model["defaultSchema"], "main");
        assert!(model["schemas"][0]["tables"].as_array().unwrap().iter().any(|t| t["name"] == "people"));
        db.dispatch("databaseDisconnect", &[json!(id)]).await.unwrap();
        let ro = db
            .dispatch("databaseConnect", &[json!({"driver":"sqlite","file":file,"readOnly":true})])
            .await
            .unwrap();
        let denied = db
            .dispatch("databaseExecute", &[ro["id"].clone(), json!(["DELETE FROM people"])])
            .await
            .unwrap();
        assert_eq!(denied[0]["kind"], "error");
        assert!(db
            .dispatch("database", &[json!({"driver":"sqlite","file":dir.path().join("missing.db")})])
            .await
            .is_err());
    }

    /// Bancos descartáveis criados por scripts/check-databases-native.mjs.
    #[tokio::test]
    #[ignore]
    async fn live_fixtures() {
        let list: Vec<Value> =
            serde_json::from_str(&std::env::var("PHP_IDE_TEST_DATABASES").unwrap()).unwrap();
        for input in list {
            let driver = input["driver"].as_str().unwrap().to_string();
            let db = Database::new(None, Path::new("/live"));
            let mut ready = Err(String::new());
            for _ in 0..if driver == "oracle" { 300 } else { 90 } {
                ready = db.dispatch("database", std::slice::from_ref(&input)).await;
                if ready.is_ok() {
                    break;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            let info = ready.unwrap_or_else(|e| panic!("{driver}: {e}"));
            assert!(!info["version"].as_str().unwrap().is_empty(), "{driver}: versão");
            let mut wrong = input.clone();
            wrong["password"] = json!("wrong-password");
            assert!(db.dispatch("database", &[wrong]).await.is_err(), "{driver}: senha errada aceita");
            let session = db.dispatch("databaseConnect", std::slice::from_ref(&input)).await.unwrap();
            let id = session["id"].clone();
            if driver == "redis" {
                let mut setup = vec![
                    "SET s \"hello world\"".to_string(),
                    "EXPIRE s 300".into(),
                    "HSET h f1 v1 f2 v2".into(),
                    "SADD st x y".into(),
                    "ZADD z 1 a 2 b".into(),
                    "XADD x * k v".into(),
                ];
                setup.push(format!("RPUSH l {}", (0..60).map(|i| format!("i{i}")).collect::<Vec<_>>().join(" ")));
                let r = db.dispatch("databaseExecute", &[id.clone(), json!(setup)]).await.unwrap();
                assert!(r.as_array().unwrap().iter().all(|r| r["kind"] != "error"), "{r}");
                let tables = db.dispatch("databaseTables", &[id.clone(), json!("db0")]).await.unwrap();
                for (key, kind) in [("s", "string"), ("h", "hash"), ("st", "set"), ("z", "zset"), ("x", "stream"), ("l", "list")] {
                    assert!(tables.as_array().unwrap().iter().any(|t| t["name"] == key && t["kind"] == kind), "{key} {tables}");
                }
                let page = db.dispatch("databasePage", &[id.clone(), json!("db0"), json!("s"), json!(0)]).await.unwrap();
                assert_eq!(page["rows"][0][0], "hello world");
                assert!(page["meta"].as_str().unwrap().contains("TTL"));
                let list = db.dispatch("databasePage", &[id.clone(), json!("db0"), json!("l"), json!(0)]).await.unwrap();
                assert_eq!(list["rows"].as_array().unwrap().len(), 50);
                assert_eq!(list["hasMore"], true);
                let rest = db.dispatch("databasePage", &[id.clone(), json!("db0"), json!("l"), json!(50)]).await.unwrap();
                assert_eq!(rest["rows"].as_array().unwrap().len(), 10);
                let hash = db.dispatch("databasePage", &[id.clone(), json!("db0"), json!("h"), json!(0)]).await.unwrap();
                assert_eq!(hash["rows"].as_array().unwrap().len(), 2);
                let get = db.dispatch("databaseExecute", &[id.clone(), json!(["HGETALL h", "MONITOR"])]).await.unwrap();
                assert_eq!(get[0]["kind"], "rows");
                assert_eq!(get[1]["kind"], "error");
                redis_live(&db, &id, &input).await;
            } else {
                let schema = match driver.as_str() {
                    "postgres" => "public".to_string(),
                    "sqlserver" => "dbo".into(),
                    "oracle" => input["user"].as_str().unwrap().to_uppercase(),
                    _ => input["database"].as_str().unwrap().to_string(),
                };
                assert!(session["schemas"].as_array().unwrap().iter().any(|s| s == &json!(schema)), "{driver}: {session}");
                let values = (1..=55)
                    .map(|i| format!("({i}, 'Pessoa {i}', {})", if i == 1 { "NULL".into() } else { format!("'{}'", "x".repeat(600)) }))
                    .collect::<Vec<_>>()
                    .join(",");
                // oracle-rs recusa SQL muito longo (ver sonda em oracle_live); dados gerados no servidor.
                let insert = if driver == "oracle" {
                    "INSERT INTO people (id,name,notes) SELECT level, 'Pessoa ' || level, CASE WHEN level > 1 THEN RPAD('x',600,'x') END FROM dual CONNECT BY level <= 55".to_string()
                } else {
                    format!("INSERT INTO people (id,name,notes) VALUES {values}")
                };
                let r = db
                    .dispatch("databaseExecute", &[id.clone(), json!(["CREATE TABLE people (id INTEGER PRIMARY KEY, name VARCHAR(60), notes VARCHAR(1000))", insert, "SELECT id, name FROM people WHERE id < 3 ORDER BY id"])])
                    .await
                    .unwrap();
                assert!(r.as_array().unwrap().iter().all(|r| r["kind"] != "error"), "{driver}: {r}");
                assert_eq!(r[1]["affected"], 55, "{driver}: affected");
                assert_eq!(r[2]["rows"][1][1], "Pessoa 2");
                let people = if driver == "oracle" { "PEOPLE" } else { "people" };
                let tables = db.dispatch("databaseTables", &[id.clone(), json!(schema)]).await.unwrap();
                assert!(tables.as_array().unwrap().iter().any(|t| t["name"] == people), "{driver}: {tables}");
                let page = db.dispatch("databasePage", &[id.clone(), json!(schema), json!(people), json!(0)]).await.unwrap();
                assert_eq!(page["rows"].as_array().unwrap().len(), 50, "{driver}");
                assert_eq!(page["rows"][0][0], "1");
                assert!(page["rows"][0][2].is_null());
                assert_eq!(page["rows"][1][2].as_str().unwrap().len(), 513);
                assert_eq!(page["columns"][0]["primary"], true);
                let second = db.dispatch("databasePage", &[id.clone(), json!(schema), json!(people), json!(50)]).await.unwrap();
                assert_eq!(second["rows"].as_array().unwrap().len(), 5, "{driver}");
                assert_eq!(second["hasMore"], false);
                let ddl = db.dispatch("databaseDdlData", &[id.clone(), json!(schema), json!(people)]).await.unwrap();
                assert!(ddl.is_object() || ddl.as_str().unwrap().to_lowercase().contains("create table"), "{driver}: {ddl}");
                let model = db.dispatch("databaseModel", std::slice::from_ref(&id)).await.unwrap();
                assert!(model["schemas"].as_array().unwrap().iter().any(|s| s["tables"].as_array().unwrap().iter().any(|t| t["name"] == people)), "{driver}: modelo");
                if driver == "oracle" {
                    oracle_live(&db, &id, &input).await;
                }
                let mut ro = input.clone();
                ro["readOnly"] = json!(true);
                if driver == "sqlserver" || driver == "oracle" {
                    assert!(db.dispatch("database", &[ro]).await.is_err());
                } else {
                    let ro = db.dispatch("databaseConnect", &[ro]).await.unwrap();
                    let denied = db.dispatch("databaseExecute", &[ro["id"].clone(), json!(["DELETE FROM people"])]).await.unwrap();
                    assert_eq!(denied[0]["kind"], "error", "{driver}: somente leitura");
                    db.dispatch("databaseDisconnect", &[ro["id"].clone()]).await.unwrap();
                }
            }
            db.dispatch("databaseDisconnect", std::slice::from_ref(&id)).await.unwrap();
            assert!(db.dispatch("databaseTables", &[id, json!("x")]).await.is_err());
            println!("{driver}: conexão, senha inválida, navegação, prévia, console e desconexão OK");
        }
    }
    async fn exec(db: &Database, id: &Value, list: Value) -> Value {
        let r = db.dispatch("databaseExecute", &[id.clone(), list]).await.unwrap();
        assert!(r.as_array().unwrap().iter().all(|r| r["kind"] != "error"), "{r}");
        r
    }
    async fn oracle_live(db: &Database, id: &Value, input: &Value) {
        let owner = input["user"].as_str().unwrap().to_uppercase();
        let script = "CREATE TABLE notes_t (id NUMBER(10) PRIMARY KEY, body CLOB, price NUMBER(10,2), at DATE, label VARCHAR2(30 CHAR) NOT NULL);\nBEGIN\n  FOR i IN 1..3 LOOP\n    INSERT INTO notes_t VALUES (i, 'texto; ' || i, i * 1.5, DATE '2026-01-02', 'L' || i);\n  END LOOP;\nEND;\n/\nSELECT id, body, price, at FROM notes_t ORDER BY id";
        // Como o frontend: dividido por `;`; o backend remonta o bloco PL/SQL.
        let mut parts = vec![];
        let (mut quoted, mut start) = (false, 0);
        for (i, c) in script.char_indices() {
            if c == '\'' {
                quoted = !quoted;
            } else if c == ';' && !quoted {
                parts.push(script[start..i].trim());
                start = i + 1;
            }
        }
        parts.push(script[start..].trim());
        let r = exec(db, id, json!(parts)).await;
        assert_eq!(r.as_array().unwrap().len(), 3, "{r}");
        assert_eq!(r[2]["rows"][0][1], "texto; 1", "{r}");
        assert_eq!(r[2]["rows"][1][2], "3", "{r}");
        let ddl = db.dispatch("databaseDdl", &[id.clone(), json!(owner), json!("NOTES_T")]).await.unwrap();
        let ddl = ddl.as_str().unwrap();
        assert!(ddl.contains("\"PRICE\" NUMBER(10,2)") && ddl.contains("\"LABEL\" VARCHAR2(30 CHAR) NOT NULL") && ddl.contains("PRIMARY KEY (\"ID\")"), "{ddl}");
        let page = db.dispatch("databasePage", &[id.clone(), json!(owner), json!("NOTES_T"), json!(0)]).await.unwrap();
        assert_eq!(page["rows"][0][1], "texto; 1", "{page}");
        let error = db.dispatch("databaseExecute", &[id.clone(), json!(["SELECT * FROM missing_table"])]).await.unwrap();
        // O servidor pode encerrar a conexão sem o ORA-00942; a sessão é reaberta e segue utilizável.
        assert_eq!(error[0]["kind"], "error", "{error}");
        println!("oracle: erro de tabela ausente -> {}", error[0]["error"]);
        exec(db, id, json!(["SELECT 1 FROM dual"])).await;
        // Muitos comandos distintos na mesma sessão (cursores não podem se esgotar).
        for batch in 0..4 {
            let list: Vec<String> = (0..100).map(|i| format!("SELECT {} AS n FROM dual", batch * 100 + i)).collect();
            exec(db, id, json!(list)).await;
        }
        exec(db, id, json!(["DROP TABLE notes_t PURGE"])).await;
        for size in [4000usize, 8000, 16000, 32000, 33000] {
            let sql = format!("SELECT '{}' AS t FROM dual", "y".repeat(size.min(3900)));
            let sql = format!("{sql}{}", " ".repeat(size.saturating_sub(sql.len())));
            let r = db.dispatch("databaseExecute", &[id.clone(), json!([sql])]).await.unwrap();
            println!("oracle: SQL de {size} bytes -> {}", if r[0]["kind"] == "error" { r[0]["error"].as_str().unwrap().chars().take(80).collect::<String>() } else { "ok".into() });
        }
        let mut sid = input.clone();
        sid["connectType"] = json!("sid");
        sid["database"] = json!("NOPE");
        let e = db.dispatch("database", &[sid]).await.unwrap_err();
        assert!(e.contains("Service name/SID"), "{e}");
        let mut startup = input.clone();
        startup["startup"] = json!(["BEGIN DBMS_APPLICATION_INFO.SET_MODULE('php-ide', NULL); END;"]);
        let s = db.dispatch("databaseConnect", &[startup.clone()]).await.unwrap();
        let r = exec(db, &s["id"], json!(["SELECT SYS_CONTEXT('USERENV','MODULE') FROM dual"])).await;
        assert_eq!(r[0]["rows"][0][0], "php-ide");
        db.dispatch("databaseDisconnect", &[s["id"].clone()]).await.unwrap();
        startup["startup"] = json!(["ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY'"]);
        println!("oracle: ALTER SESSION no script de inicialização -> {:?}", db.dispatch("database", &[startup]).await.err());
        let r = db.dispatch("databaseExecute", &[id.clone(), json!(["ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY'", "SELECT 1 FROM dual"])]).await.unwrap();
        println!("oracle: ALTER SESSION no console -> {} / seguinte: {}", r[0]["kind"], r.get(1).map(|v| v["kind"].to_string()).unwrap_or_default());
        exec(db, id, json!(["SELECT 1 FROM dual"])).await;
        println!("oracle: PL/SQL, CLOB, DDL, erro ORA, 400 comandos, SID inválido e script de inicialização OK");
    }
    async fn edit(db: &Database, id: &Value, op: Value) -> Result<Value, String> {
        db.dispatch("databaseRedisEdit", &[id.clone(), json!("db0"), op]).await
    }
    async fn page(db: &Database, id: &Value, key: &str, offset: u64, cursor: &Value) -> Value {
        db.dispatch("databasePage", &[id.clone(), json!("db0"), json!(key), json!(offset), cursor.clone()]).await.unwrap()
    }
    async fn redis_live(db: &Database, id: &Value, input: &Value) {
        exec(db, id, json!([
            "EVAL \"for i=1,12000 do redis.call('HSET',KEYS[1],'f'..i,i) end return 1\" 1 big",
            "EVAL \"for i=1,10500 do redis.call('SADD',KEYS[1],'m'..i) end return 1\" 1 bigset",
            "EVAL \"for i=1,120 do redis.call('XADD',KEYS[1],'*','n',i) end return 1\" 1 bigstream",
        ])).await;
        for (key, total) in [("big", 12000), ("bigset", 10500)] {
            let mut seen = std::collections::HashSet::new();
            let (mut cursor, mut offset, mut pages) = (Value::Null, 0, 0);
            loop {
                let p = page(db, id, key, offset, &cursor).await;
                assert!(p["rows"].as_array().unwrap().len() <= 50);
                for row in p["rows"].as_array().unwrap() {
                    seen.insert(row[0].as_str().unwrap().to_string());
                }
                pages += 1;
                if p["hasMore"] != true {
                    break;
                }
                cursor = p["cursor"].clone();
                offset += 50;
            }
            assert_eq!(seen.len(), total, "{key}: itens únicos");
            assert!(pages >= total / 50, "{key}: {pages} páginas");
        }
        let mut ids = vec![];
        let mut cursor = Value::Null;
        for offset in [0, 50, 100] {
            let p = page(db, id, "bigstream", offset, &cursor).await;
            ids.extend(p["rows"].as_array().unwrap().iter().map(|r| r[0].as_str().unwrap().to_string()));
            assert_eq!(p["hasMore"], offset < 100);
            cursor = p["cursor"].clone();
        }
        assert_eq!(ids.len(), 120);
        assert_eq!(ids.iter().collect::<std::collections::HashSet<_>>().len(), 120);
        // String: compara-e-grava preservando TTL.
        assert!(edit(db, id, json!({"op":"set","key":"s","old":"outro","value":"x"})).await.is_err());
        edit(db, id, json!({"op":"set","key":"s","old":"hello world","value":"novo valor"})).await.unwrap();
        let p = page(db, id, "s", 0, &Value::Null).await;
        assert_eq!(p["rows"][0][0], "novo valor");
        assert!(p["ttl"].as_i64().unwrap() > 0, "KEEPTTL");
        assert_eq!(edit(db, id, json!({"op":"get","kind":"string","key":"s"})).await.unwrap()["value"], "novo valor");
        // Hash: editar valor, renomear campo, adicionar e excluir.
        assert_eq!(edit(db, id, json!({"op":"get","kind":"hash","key":"h","field":"f1"})).await.unwrap()["value"], "v1");
        edit(db, id, json!({"op":"hset","key":"h","field":"f1","old":"v1","newField":"f9","value":"v9"})).await.unwrap();
        assert!(edit(db, id, json!({"op":"hset","key":"h","field":"f2","value":"x"})).await.is_err(), "campo duplicado");
        edit(db, id, json!({"op":"hset","key":"h","field":"f3","value":"v3"})).await.unwrap();
        edit(db, id, json!({"op":"hdel","key":"h","field":"f2"})).await.unwrap();
        let r = exec(db, id, json!(["HGETALL h"])).await;
        let flat: Vec<&str> = r[0]["rows"].as_array().unwrap().iter().map(|r| r[1].as_str().unwrap()).collect();
        assert!(flat.contains(&"f9") && flat.contains(&"v9") && flat.contains(&"f3") && !flat.contains(&"f1") && !flat.contains(&"f2"), "{flat:?}");
        // Lista: editar e excluir por índice com conferência do valor.
        edit(db, id, json!({"op":"lset","key":"l","index":0,"old":"i0","value":"zero"})).await.unwrap();
        assert!(edit(db, id, json!({"op":"lset","key":"l","index":1,"old":"errado","value":"x"})).await.is_err());
        edit(db, id, json!({"op":"ldel","key":"l","index":1,"old":"i1"})).await.unwrap();
        edit(db, id, json!({"op":"rpush","key":"l","value":"fim"})).await.unwrap();
        let p = page(db, id, "l", 0, &Value::Null).await;
        assert_eq!(p["rows"][0][1], "zero");
        assert_eq!(p["rows"][1][1], "i2");
        assert_eq!(p["size"], 60);
        // Set e zset.
        edit(db, id, json!({"op":"sreplace","key":"st","member":"x","value":"x2"})).await.unwrap();
        assert!(edit(db, id, json!({"op":"sadd","key":"st","member":"y"})).await.is_err());
        edit(db, id, json!({"op":"sadd","key":"st","member":"z"})).await.unwrap();
        edit(db, id, json!({"op":"srem","key":"st","member":"y"})).await.unwrap();
        let r = exec(db, id, json!(["SMEMBERS st"])).await;
        assert_eq!(r[0]["rows"].as_array().unwrap().len(), 2, "{r}");
        edit(db, id, json!({"op":"zadd","key":"z","member":"a","score":5})).await.unwrap();
        edit(db, id, json!({"op":"zadd","key":"z","old":"b","member":"c","score":1})).await.unwrap();
        edit(db, id, json!({"op":"zadd","key":"z","member":"d","score":9.5})).await.unwrap();
        edit(db, id, json!({"op":"zrem","key":"z","member":"d"})).await.unwrap();
        let p = page(db, id, "z", 0, &Value::Null).await;
        assert_eq!(p["rows"], json!([["c", "1"], ["a", "5"]]), "{p}");
        assert!(edit(db, id, json!({"op":"zadd","key":"z","member":"a","score":"x"})).await.is_err());
        assert!(edit(db, id, json!({"op":"hdel","key":"s","field":"x"})).await.is_err(), "tipo errado");
        // TTL, renomear e excluir chave.
        edit(db, id, json!({"op":"ttl","key":"h","ttl":100})).await.unwrap();
        assert!(page(db, id, "h", 0, &Value::Null).await["ttl"].as_i64().unwrap() > 0);
        edit(db, id, json!({"op":"ttl","key":"h","ttl":0})).await.unwrap();
        assert_eq!(page(db, id, "h", 0, &Value::Null).await["ttl"], -1);
        assert!(edit(db, id, json!({"op":"ttl","key":"missing","ttl":0})).await.is_err());
        edit(db, id, json!({"op":"rename","key":"s","to":"s2"})).await.unwrap();
        assert!(edit(db, id, json!({"op":"rename","key":"s2","to":"h"})).await.is_err(), "não sobrescreve");
        edit(db, id, json!({"op":"delete","key":"s2"})).await.unwrap();
        assert!(edit(db, id, json!({"op":"delete","key":"s2"})).await.is_err());
        // TLS com CA próprio: sem o CA a verificação falha com erro recuperável.
        if input["ssl"]["ca"].as_str().is_some_and(|v| !v.is_empty()) {
            let mut no_ca = input.clone();
            no_ca["ssl"]["ca"] = json!("");
            assert!(db.dispatch("database", &[no_ca]).await.is_err(), "TLS sem CA deveria falhar");
            let mut insecure = input.clone();
            insecure["ssl"] = json!({"mode":"require","ca":""});
            db.dispatch("database", &[insecure]).await.unwrap();
            let mut missing = input.clone();
            missing["ssl"]["ca"] = json!("/nonexistent/ca.pem");
            assert!(db.dispatch("database", &[missing]).await.unwrap_err().contains("Arquivo CA"));
            println!("redis TLS: CA próprio, falha sem CA e modo require OK");
        }
        println!("redis: HSCAN/SSCAN além de 10.000, XRANGE por cursor e edição OK");
    }
}
