// Depurador PHP via protocolo DBGp (especificação pública: https://xdebug.org/docs/dbgp).
// O IDE escuta numa porta TCP (padrão 9003, a do Xdebug 3) e o Xdebug conecta-se a ela.
// Cada pacote do motor é `<tamanho>\0<xml>\0`; cada comando do IDE é
// `comando -i <transação> [-opção valor]... [-- base64]\0`.
// Os comandos IPC aceitos são uma lista fechada; caminhos locais ficam confinados ao projeto.
use crate::workspace::{confined, err, Res};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{tcp::OwnedWriteHalf, TcpListener, TcpStream},
    process::Command,
    sync::{oneshot, Mutex as AsyncMutex},
};

pub type Emit = Arc<dyn Fn(Value) + Send + Sync>;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
const PACKET_LIMIT: usize = 64 * 1024 * 1024;
const OUTPUT_LIMIT: usize = 64 * 1024;

// ---------- XML mínimo para as respostas DBGp ----------

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Xml {
    pub name: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<Xml>,
    pub text: String,
}
impl Xml {
    pub fn attr(&self, key: &str) -> Option<&str> {
        self.attrs
            .iter()
            .find(|(k, _)| k == key || k.rsplit(':').next() == Some(key))
            .map(|(_, v)| v.as_str())
    }
    /// Filhos pelo nome local (ignora prefixos como `xdebug:`).
    pub fn all<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Xml> + 'a {
        self.children
            .iter()
            .filter(move |c| c.name == name || c.name.rsplit(':').next() == Some(name))
    }
    pub fn child(&self, name: &str) -> Option<&Xml> {
        self.children
            .iter()
            .find(|c| c.name == name || c.name.rsplit(':').next() == Some(name))
    }
}

fn unescape(s: &str) -> String {
    if !s.contains('&') {
        return s.to_owned();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(end) = rest.find(';').filter(|&e| e <= 12) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let entity = &rest[1..end];
        let decoded = match entity {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32)
            }
            _ if entity.starts_with('#') => entity[1..].parse().ok().and_then(char::from_u32),
            _ => None,
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

struct Parser<'a> {
    s: &'a str,
    i: usize,
}
impl<'a> Parser<'a> {
    fn starts(&self, p: &str) -> bool {
        self.s[self.i..].starts_with(p)
    }
    fn skip_ws(&mut self) {
        while self.s[self.i..].starts_with(|c: char| c.is_ascii_whitespace()) {
            self.i += 1;
        }
    }
    /// Avança até depois de `end`, devolvendo o trecho anterior.
    fn until(&mut self, end: &str) -> Res<&'a str> {
        let at = self.s[self.i..]
            .find(end)
            .ok_or("XML DBGp incompleto")?;
        let out = &self.s[self.i..self.i + at];
        self.i += at + end.len();
        Ok(out)
    }
    fn name(&mut self) -> Res<String> {
        let len = self.s[self.i..]
            .find(|c: char| c.is_ascii_whitespace() || c == '/' || c == '>' || c == '=')
            .ok_or("XML DBGp incompleto")?;
        if len == 0 {
            return Err("Nome XML inválido".into());
        }
        let name = self.s[self.i..self.i + len].to_owned();
        self.i += len;
        Ok(name)
    }
    fn element(&mut self, depth: usize) -> Res<Xml> {
        if depth > 256 {
            return Err("XML DBGp aninhado demais".into());
        }
        if !self.starts("<") {
            return Err("XML DBGp inválido".into());
        }
        self.i += 1;
        let mut el = Xml {
            name: self.name()?,
            ..Xml::default()
        };
        loop {
            self.skip_ws();
            if self.starts("/>") {
                self.i += 2;
                return Ok(el);
            }
            if self.starts(">") {
                self.i += 1;
                break;
            }
            let key = self.name()?;
            self.skip_ws();
            if !self.starts("=") {
                return Err("Atributo XML inválido".into());
            }
            self.i += 1;
            self.skip_ws();
            let quote = if self.starts("\"") {
                "\""
            } else if self.starts("'") {
                "'"
            } else {
                return Err("Atributo XML sem aspas".into());
            };
            self.i += 1;
            let value = unescape(self.until(quote)?);
            el.attrs.push((key, value));
        }
        loop {
            if self.i >= self.s.len() {
                return Err("XML DBGp incompleto".into());
            }
            if self.starts("</") {
                self.i += 2;
                let name = self.until(">")?.trim();
                if name != el.name {
                    return Err("Fechamento XML inesperado".into());
                }
                return Ok(el);
            }
            if self.starts("<![CDATA[") {
                self.i += 9;
                el.text.push_str(self.until("]]>")?);
            } else if self.starts("<!--") {
                self.until("-->")?;
            } else if self.starts("<") {
                el.children.push(self.element(depth + 1)?);
            } else {
                let end = self.s[self.i..].find('<').unwrap_or(self.s.len() - self.i);
                el.text.push_str(&unescape(&self.s[self.i..self.i + end]));
                self.i += end;
            }
        }
    }
}

pub fn parse_xml(s: &str) -> Res<Xml> {
    let mut p = Parser { s, i: 0 };
    loop {
        p.skip_ws();
        if p.starts("<?") {
            p.until("?>")?;
        } else if p.starts("<!--") {
            p.until("-->")?;
        } else if p.starts("<!") {
            p.until(">")?;
        } else {
            break;
        }
    }
    p.element(0)
}

// ---------- Base64 (dados de comandos e valores codificados) ----------

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
pub fn base64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            out.push(if i <= chunk.len() {
                B64[(n >> shift & 63) as usize] as char
            } else {
                '='
            });
        }
    }
    out
}
pub fn base64_decode(text: &str) -> Res<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in text.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            c if c.is_ascii_whitespace() => continue,
            _ => return Err("Base64 inválido na resposta DBGp".into()),
        } as u32;
        acc = acc << 6 | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits & 0xff) as u8);
        }
    }
    Ok(out)
}

// ---------- Pacotes e comandos ----------

/// Lê um pacote `<tamanho>\0<xml>\0`; `None` quando a conexão terminou.
pub async fn read_packet<R: AsyncBufRead + Unpin>(r: &mut R) -> Res<Option<String>> {
    let mut len = Vec::new();
    if r.read_until(0, &mut len).await.map_err(err)? == 0 {
        return Ok(None);
    }
    if len.pop() != Some(0) {
        return Ok(None);
    }
    let len: usize = std::str::from_utf8(&len)
        .ok()
        .and_then(|v| v.trim().parse().ok())
        .ok_or("Tamanho de pacote DBGp inválido")?;
    if len > PACKET_LIMIT {
        return Err("Pacote DBGp grande demais".into());
    }
    let mut buf = vec![0; len + 1];
    r.read_exact(&mut buf).await.map_err(err)?;
    if buf.pop() != Some(0) {
        return Err("Pacote DBGp sem terminador".into());
    }
    Ok(Some(String::from_utf8_lossy(&buf).into_owned()))
}

fn quote_arg(v: &str) -> String {
    if !v.is_empty() && !v.contains([' ', '"', '\\', '\t']) {
        return v.to_owned();
    }
    format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Monta um comando DBGp já com terminador NUL.
pub fn command(name: &str, tx: u32, args: &[(&str, String)], data: Option<&str>) -> Res<Vec<u8>> {
    let mut out = format!("{name} -i {tx}");
    for (k, v) in args {
        if v.contains(['\0', '\n', '\r']) {
            return Err("Argumento DBGp inválido".into());
        }
        out.push_str(&format!(" {k} {}", quote_arg(v)));
    }
    if let Some(data) = data {
        out.push_str(" -- ");
        out.push_str(&base64_encode(data.as_bytes()));
    }
    let mut bytes = out.into_bytes();
    bytes.push(0);
    Ok(bytes)
}

fn response_error(x: &Xml) -> Option<String> {
    let e = x.child("error")?;
    let code = e.attr("code").unwrap_or("?");
    let message = e
        .child("message")
        .map(|m| m.text.trim().to_owned())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| {
            match code {
                "5" => "Comando não disponível neste estado",
                "200" | "201" | "202" | "203" => "Breakpoint não pôde ser definido",
                "205" => "Breakpoint inexistente",
                "206" => "Erro ao avaliar a expressão",
                "300" => "Propriedade não encontrada",
                "301" | "302" => "Pilha ou contexto inválido",
                _ => "Erro do Xdebug",
            }
            .to_owned()
        });
    Some(format!("{message} (DBGp {code})"))
}

// ---------- URIs e mapeamento servidor ↔ local ----------

pub fn path_to_uri(path: &str) -> String {
    let path = path.replace('\\', "/");
    let mut out = String::from("file://");
    if !path.starts_with('/') {
        out.push('/');
    }
    for b in path.bytes() {
        if b.is_ascii_alphanumeric() || b"/-_.~:".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
pub fn uri_to_path(uri: &str) -> String {
    let Some(rest) = uri.strip_prefix("file://") else {
        return uri.to_owned();
    };
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    let bytes = rest.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3])
                .ok()
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    let path = String::from_utf8_lossy(&out).into_owned();
    // file:///C:/x → C:/x
    let b = path.as_bytes();
    if b.len() > 2 && b[0] == b'/' && b[1].is_ascii_alphabetic() && b[2] == b':' {
        return path[1..].to_owned();
    }
    path
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Mapping {
    pub server: String,
    #[serde(default)]
    pub local: String,
}

fn trim_slash(p: &str) -> &str {
    let t = p.trim_end_matches(['/', '\\']);
    if t.is_empty() && !p.is_empty() {
        "/"
    } else {
        t
    }
}
/// `prefix` cobre `path` por componentes (`/app` cobre `/app/x`, não `/application`).
fn under<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    let prefix = trim_slash(prefix);
    if prefix == "/" {
        return path.strip_prefix('/');
    }
    let rest = path.strip_prefix(prefix)?;
    if rest.is_empty() {
        Some("")
    } else {
        rest.strip_prefix(['/', '\\'])
    }
}

/// Caminho local absoluto → caminho no servidor (mapeamento de prefixo mais longo).
pub fn to_server(root: &Path, mappings: &[Mapping], local: &Path) -> String {
    let local_s = local.to_string_lossy().replace('\\', "/");
    mappings
        .iter()
        .filter_map(|m| {
            let base = root.join(&m.local).to_string_lossy().replace('\\', "/");
            under(&local_s, &base).map(|rest| (base.len(), m, rest.to_owned()))
        })
        .max_by_key(|(len, _, _)| *len)
        .map(|(_, m, rest)| {
            let server = trim_slash(&m.server);
            match (server, rest.is_empty()) {
                (s, true) => s.to_owned(),
                ("/", false) => format!("/{rest}"),
                (s, false) => format!("{s}/{rest}"),
            }
        })
        .unwrap_or(local_s)
}

/// Caminho no servidor → caminho relativo ao projeto, ou `None` se não houver mapeamento.
pub fn to_local(root: &Path, mappings: &[Mapping], server: &str) -> Option<String> {
    let mapped = mappings
        .iter()
        .filter_map(|m| under(server, &m.server).map(|rest| (trim_slash(&m.server).len(), m, rest)))
        .max_by_key(|(len, _, _)| *len)
        .map(|(_, m, rest)| root.join(&m.local).join(rest));
    let candidate = mapped.unwrap_or_else(|| PathBuf::from(server));
    let real = candidate.canonicalize().ok()?;
    if !real.is_file() {
        return None;
    }
    real.strip_prefix(root)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

// ---------- Valores ----------

pub fn property(x: &Xml) -> Value {
    let decode = |el: &Xml| -> String {
        if el.attr("encoding") == Some("base64") {
            base64_decode(el.text.trim())
                .map(|b| String::from_utf8_lossy(&b).into_owned())
                .unwrap_or_default()
        } else {
            el.text.clone()
        }
    };
    let name = x
        .child("name")
        .map(decode)
        .or_else(|| x.attr("name").map(str::to_owned))
        .unwrap_or_default();
    let fullname = x
        .child("fullname")
        .map(decode)
        .or_else(|| x.attr("fullname").map(str::to_owned))
        .unwrap_or_default();
    let value = x.child("value").map(decode).unwrap_or_else(|| decode(x));
    let num = |k: &str| x.attr(k).and_then(|v| v.parse::<u64>().ok());
    json!({
        "name": name,
        "fullname": fullname,
        "type": x.attr("type").unwrap_or(""),
        "classname": x.attr("classname"),
        "facet": x.attr("facet"),
        "value": value,
        "size": num("size"),
        "children": x.attr("children") == Some("1"),
        "numchildren": num("numchildren").unwrap_or(0),
        "page": num("page").unwrap_or(0),
        "pagesize": num("pagesize"),
        "items": x.all("property").map(property).collect::<Vec<_>>(),
    })
}

// ---------- Sessões ----------

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct Breakpoint {
    pub path: String,
    pub line: u32,
    #[serde(default)]
    pub condition: String,
    #[serde(default = "enabled")]
    pub enabled: bool,
}
fn enabled() -> bool {
    true
}

#[derive(Default, Clone)]
struct Config {
    root: PathBuf,
    breakpoints: Vec<Breakpoint>,
    mappings: Vec<Mapping>,
    break_first: bool,
}

struct Session {
    id: String,
    writer: AsyncMutex<OwnedWriteHalf>,
    pending: Mutex<HashMap<u32, oneshot::Sender<Xml>>>,
    next: AtomicU32,
    status: Mutex<String>,
    breakpoints: Mutex<HashMap<String, String>>,
    sync: AsyncMutex<()>,
    /// Fecha a conexão pelo lado do IDE (após stop/detach, sem esperar o motor).
    closed: tokio::sync::Notify,
    info: Value,
}
impl Session {
    async fn send(
        &self,
        name: &str,
        args: &[(&str, String)],
        data: Option<&str>,
        timeout: Option<Duration>,
    ) -> Res<Xml> {
        let tx = self.next.fetch_add(1, Ordering::Relaxed);
        let packet = command(name, tx, args, data)?;
        let (send, recv) = oneshot::channel();
        self.pending.lock().map_err(err)?.insert(tx, send);
        let write = async {
            let mut w = self.writer.lock().await;
            w.write_all(&packet).await?;
            w.flush().await
        };
        if write.await.is_err() {
            self.pending.lock().map_err(err)?.remove(&tx);
            return Err("Conexão com o Xdebug encerrada".into());
        }
        let response = match timeout {
            Some(t) => tokio::time::timeout(t, recv)
                .await
                .map_err(|_| format!("O Xdebug não respondeu a {name} em {}s", t.as_secs()))?,
            None => recv.await,
        }
        .map_err(|_| "Conexão com o Xdebug encerrada".to_owned())?;
        match response_error(&response) {
            Some(e) => Err(e),
            None => Ok(response),
        }
    }
    fn status(&self) -> String {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
    fn set_status(&self, v: &str) {
        if let Ok(mut s) = self.status.lock() {
            *s = v.to_owned();
        }
    }
}

#[derive(Default)]
struct Inner {
    listener: Mutex<Option<(u16, bool, tokio::task::JoinHandle<()>)>>,
    sessions: Mutex<HashMap<String, Arc<Session>>>,
    config: Mutex<Config>,
    runs: Mutex<HashMap<String, oneshot::Sender<()>>>,
    counter: AtomicU32,
}

#[derive(Default)]
pub struct Debugger {
    inner: Arc<Inner>,
}

fn php() -> String {
    std::env::var("PHP_IDE_PHP_BIN").unwrap_or_else(|_| "php".into())
}

impl Debugger {
    pub async fn dispatch(&self, root: &Path, method: &str, args: &[Value], emit: Emit) -> Res<Value> {
        let inner = &self.inner;
        inner.config.lock().map_err(err)?.root = root.to_path_buf();
        let a = |i: usize| args.get(i).unwrap_or(&Value::Null);
        let s = |i: usize| a(i).as_str().unwrap_or("");
        let n = |i: usize, max: u64| -> Res<u64> {
            let v = a(i).as_u64().unwrap_or(0);
            if v > max {
                return Err("Número fora do limite".into());
            }
            Ok(v)
        };
        match method {
            "debugStatus" => self.status(),
            "debugListen" => {
                let port = a(0).as_u64().unwrap_or(9003);
                if !(1024..=65535).contains(&port) {
                    return Err("Porta de depuração inválida (1024–65535)".into());
                }
                self.listen(port as u16, a(1).as_bool().unwrap_or(false), emit).await
            }
            "debugUnlisten" => {
                if let Some((_, _, task)) = inner.listener.lock().map_err(err)?.take() {
                    task.abort();
                }
                self.status()
            }
            "debugConfig" => {
                let breakpoints: Vec<Breakpoint> =
                    serde_json::from_value(a(0).clone()).map_err(|_| "Breakpoints inválidos")?;
                let mappings: Vec<Mapping> =
                    serde_json::from_value(a(1).clone()).map_err(|_| "Mapeamentos inválidos")?;
                if breakpoints.len() > 5000 || mappings.len() > 100 {
                    return Err("Configuração de depuração grande demais".into());
                }
                for b in &breakpoints {
                    if b.line == 0 || b.condition.len() > 10000 || b.condition.contains('\0') {
                        return Err("Breakpoint inválido".into());
                    }
                }
                for m in &mappings {
                    let absolute = m.server.starts_with('/')
                        || m.server.as_bytes().get(1) == Some(&b':');
                    if !absolute
                        || m.local.starts_with('/')
                        || m.local.split(['/', '\\']).any(|c| c == "..")
                        || m.server.contains(['\0', '\n'])
                    {
                        return Err(format!(
                            "Mapeamento inválido: {} → {} (servidor absoluto, local relativo ao projeto)",
                            m.server, m.local
                        ));
                    }
                }
                {
                    let mut c = inner.config.lock().map_err(err)?;
                    c.breakpoints = breakpoints;
                    c.mappings = mappings;
                    c.break_first = a(2).as_bool().unwrap_or(false);
                }
                let sessions: Vec<_> = inner.sessions.lock().map_err(err)?.values().cloned().collect();
                for session in sessions {
                    if session.status() == "break" {
                        let (inner, emit) = (inner.clone(), emit.clone());
                        tokio::spawn(async move { sync_breakpoints(&inner, &session, &emit).await });
                    }
                }
                Ok(Value::Null)
            }
            "debugRun" => self.run_script(root, s(0), a(1), emit).await,
            "debugRunStop" => {
                if let Some(stop) = inner.runs.lock().map_err(err)?.remove(s(0)) {
                    let _ = stop.send(());
                }
                Ok(Value::Null)
            }
            _ => {
                let session = self.session(s(0))?;
                match method {
                    "debugContinue" => {
                        let action = match s(1) {
                            "run" => "run",
                            "step_into" => "step_into",
                            "step_over" => "step_over",
                            "step_out" => "step_out",
                            "stop" => "stop",
                            "detach" => "detach",
                            _ => return Err("Ação de depuração desconhecida".into()),
                        };
                        resume(inner.clone(), session, action, emit)?;
                        Ok(Value::Null)
                    }
                    "debugStack" => {
                        paused(&session)?;
                        stack(inner, &session).await
                    }
                    "debugContexts" => {
                        paused(&session)?;
                        let x = session
                            .send("context_names", &[("-d", n(1, 10000)?.to_string())], None, Some(COMMAND_TIMEOUT))
                            .await?;
                        Ok(json!(x
                            .all("context")
                            .map(|c| json!({"id": c.attr("id").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0), "name": c.attr("name")}))
                            .collect::<Vec<_>>()))
                    }
                    "debugVariables" => {
                        paused(&session)?;
                        let x = session
                            .send(
                                "context_get",
                                &[("-d", n(1, 10000)?.to_string()), ("-c", n(2, 100)?.to_string())],
                                None,
                                Some(COMMAND_TIMEOUT),
                            )
                            .await?;
                        Ok(json!(x.all("property").map(property).collect::<Vec<_>>()))
                    }
                    "debugProperty" => {
                        paused(&session)?;
                        let name = s(3);
                        if name.is_empty() || name.len() > 4096 {
                            return Err("Nome de variável inválido".into());
                        }
                        let x = session
                            .send(
                                "property_get",
                                &[
                                    ("-d", n(1, 10000)?.to_string()),
                                    ("-c", n(2, 100)?.to_string()),
                                    ("-n", name.to_owned()),
                                    ("-p", n(4, 1_000_000)?.to_string()),
                                ],
                                None,
                                Some(COMMAND_TIMEOUT),
                            )
                            .await?;
                        x.child("property").map(property).ok_or_else(|| "Propriedade não encontrada".into())
                    }
                    "debugEval" => {
                        paused(&session)?;
                        let expression = s(1).trim();
                        if expression.is_empty() || expression.len() > 20000 || expression.contains('\0') {
                            return Err("Expressão inválida".into());
                        }
                        let x = session
                            .send("eval", &[], Some(expression), Some(COMMAND_TIMEOUT))
                            .await?;
                        Ok(x.child("property").map(property).unwrap_or(Value::Null))
                    }
                    _ => Err("Comando de depuração desconhecido".into()),
                }
            }
        }
    }

    fn session(&self, id: &str) -> Res<Arc<Session>> {
        self.inner
            .sessions
            .lock()
            .map_err(err)?
            .get(id)
            .cloned()
            .ok_or_else(|| "Sessão de depuração encerrada".into())
    }

    fn status(&self) -> Res<Value> {
        let listener = self.inner.listener.lock().map_err(err)?;
        let sessions = self.inner.sessions.lock().map_err(err)?;
        Ok(json!({
            "listening": listener.as_ref().map(|(port, all, _)| json!({"port": port, "all": all})),
            "sessions": sessions.values().map(|s| json!({"id": s.id, "status": s.status(), "info": s.info})).collect::<Vec<_>>(),
        }))
    }

    async fn listen(&self, port: u16, all: bool, emit: Emit) -> Res<Value> {
        {
            let mut current = self.inner.listener.lock().map_err(err)?;
            if let Some((p, a, task)) = current.as_ref() {
                if *p == port && *a == all && !task.is_finished() {
                    drop(current);
                    return self.status();
                }
            }
            if let Some((_, _, task)) = current.take() {
                task.abort();
            }
        }
        let address = if all { "0.0.0.0" } else { "127.0.0.1" };
        let listener = TcpListener::bind((address, port)).await.map_err(|e| {
            if e.kind() == std::io::ErrorKind::AddrInUse {
                format!("A porta {port} já está em uso (outro IDE ou processo escutando). Encerre-o ou escolha outra porta e o mesmo xdebug.client_port.")
            } else {
                format!("Não foi possível escutar em {address}:{port}: {e}")
            }
        })?;
        let inner = self.inner.clone();
        let task = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        tokio::spawn(connection(inner.clone(), stream, emit.clone()));
                    }
                    Err(e) => {
                        emit(json!({"kind": "error", "message": format!("Falha ao aceitar conexão do Xdebug: {e}")}));
                        tokio::time::sleep(Duration::from_millis(250)).await;
                    }
                }
            }
        });
        *self.inner.listener.lock().map_err(err)? = Some((port, all, task));
        self.status()
    }

    async fn run_script(&self, root: &Path, path: &str, extra: &Value, emit: Emit) -> Res<Value> {
        let port = self
            .inner
            .listener
            .lock()
            .map_err(err)?
            .as_ref()
            .filter(|(_, _, task)| !task.is_finished())
            .map(|(port, _, _)| *port)
            .ok_or("Comece a escutar conexões de depuração antes de depurar o script")?;
        let script = confined(root, path)?;
        if !script.is_file() || script.extension().is_none_or(|e| e != "php") {
            return Err("Escolha um arquivo .php do projeto para depurar".into());
        }
        let extra: Vec<String> = match extra {
            Value::Null => vec![],
            v => serde_json::from_value(v.clone()).map_err(|_| "Argumentos inválidos")?,
        };
        if extra.len() > 64 || extra.iter().any(|v| v.len() > 4096 || v.contains('\0')) {
            return Err("Argumentos do script inválidos".into());
        }
        let probe = Command::new(php())
            .args(["-r", "echo extension_loaded('xdebug') ? phpversion('xdebug') : '';"])
            .output()
            .await
            .map_err(|e| format!("Não foi possível executar {}: {e}. Configure o PHP no PATH.", php()))?;
        let version = String::from_utf8_lossy(&probe.stdout).trim().to_owned();
        if version.is_empty() {
            return Err("O Xdebug não está carregado no PHP local (php -m não lista Xdebug). Instale-o (pecl install xdebug) ou depure num container com xdebug.client_host apontando para este computador.".into());
        }
        if !version.starts_with('3') {
            return Err(format!("Xdebug {version} encontrado; é necessário o Xdebug 3"));
        }
        let id = format!("run-{}", self.inner.counter.fetch_add(1, Ordering::Relaxed) + 1);
        let key = format!("phpide-{id}");
        let mut child = Command::new(php())
            .arg("-dxdebug.mode=debug")
            .arg("-dxdebug.start_with_request=yes")
            .arg("-dxdebug.client_host=127.0.0.1")
            .arg(format!("-dxdebug.client_port={port}"))
            .arg(format!("-dxdebug.idekey={key}"))
            .arg(&script)
            .args(&extra)
            .env("XDEBUG_SESSION", &key)
            .current_dir(root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Não foi possível iniciar o PHP: {e}"))?;
        let (stop, mut stopped) = oneshot::channel();
        self.inner.runs.lock().map_err(err)?.insert(id.clone(), stop);
        for (name, pipe) in [
            ("stdout", child.stdout.take().map(|p| Box::new(p) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)),
            ("stderr", child.stderr.take().map(|p| Box::new(p) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)),
        ] {
            let (emit, id) = (emit.clone(), id.clone());
            if let Some(mut pipe) = pipe {
                tokio::spawn(async move {
                    let mut buf = vec![0u8; 8192];
                    while let Ok(n) = pipe.read(&mut buf).await {
                        if n == 0 {
                            break;
                        }
                        emit(json!({"kind": "output", "run": id, "stream": name, "text": String::from_utf8_lossy(&buf[..n])}));
                    }
                });
            }
        }
        let (inner, run) = (self.inner.clone(), id.clone());
        tokio::spawn(async move {
            let status = tokio::select! {
                status = child.wait() => status.ok().and_then(|s| s.code()),
                _ = &mut stopped => { let _ = child.kill().await; None }
            };
            if let Ok(mut runs) = inner.runs.lock() {
                runs.remove(&run);
            }
            emit(json!({"kind": "exit", "run": run, "code": status}));
        });
        Ok(json!({"run": id, "idekey": key, "script": script.strip_prefix(root).map_err(err)?.to_string_lossy()}))
    }
}

fn paused(session: &Session) -> Res<()> {
    match session.status().as_str() {
        "break" => Ok(()),
        "running" => Err("O script está em execução; aguarde parar num breakpoint".into()),
        _ => Err("A sessão de depuração não está pausada".into()),
    }
}

async fn connection(inner: Arc<Inner>, stream: TcpStream, emit: Emit) {
    let peer = stream.peer_addr().map(|a| a.to_string()).unwrap_or_default();
    let (read, write) = stream.into_split();
    let mut reader = BufReader::new(read);
    let init = match tokio::time::timeout(Duration::from_secs(10), read_packet(&mut reader)).await {
        Ok(Ok(Some(text))) => parse_xml(&text),
        Ok(Err(e)) => Err(e),
        _ => Err("Conexão sem pacote init".into()),
    };
    let init = match init {
        Ok(x) if x.name == "init" => x,
        Ok(_) | Err(_) => {
            emit(json!({"kind": "error", "message": format!("Conexão de {peer} ignorada: não é uma sessão DBGp válida")}));
            return;
        }
    };
    let id = format!("s{}", inner.counter.fetch_add(1, Ordering::Relaxed) + 1);
    let server = init.attr("fileuri").map(uri_to_path).unwrap_or_default();
    let local = {
        let c = inner.config.lock().map(|c| c.clone()).unwrap_or_default();
        to_local(&c.root, &c.mappings, &server)
    };
    let idekey = init.attr("idekey").unwrap_or("").to_owned();
    let info = json!({
        "peer": peer,
        "idekey": idekey,
        "language": init.attr("language"),
        "protocol": init.attr("protocol_version"),
        "engine": init.child("engine").map(|e| format!("{} {}", e.text.trim(), e.attr("version").unwrap_or(""))),
        "server": server,
        "local": local,
        "run": idekey.strip_prefix("phpide-"),
    });
    let session = Arc::new(Session {
        id: id.clone(),
        writer: AsyncMutex::new(write),
        pending: Mutex::new(HashMap::new()),
        next: AtomicU32::new(1),
        status: Mutex::new("starting".into()),
        breakpoints: Mutex::new(HashMap::new()),
        sync: AsyncMutex::new(()),
        closed: tokio::sync::Notify::new(),
        info: info.clone(),
    });
    if let Ok(mut sessions) = inner.sessions.lock() {
        sessions.insert(id.clone(), session.clone());
    }
    emit(json!({"kind": "session", "session": id, "info": info}));
    let reading = tokio::spawn(read_loop(session.clone(), reader, emit.clone()));
    {
        let (inner, session, emit) = (inner.clone(), session.clone(), emit.clone());
        tokio::spawn(async move {
            if let Err(e) = setup(&inner, &session, &emit).await {
                emit(json!({"kind": "error", "session": session.id, "message": e}));
            }
        });
    }
    let _ = reading.await;
    session.set_status("stopped");
    if let Ok(mut pending) = session.pending.lock() {
        pending.clear();
    }
    if let Ok(mut sessions) = inner.sessions.lock() {
        sessions.remove(&id);
    }
    emit(json!({"kind": "ended", "session": id}));
}

async fn read_loop(session: Arc<Session>, mut reader: BufReader<tokio::net::tcp::OwnedReadHalf>, emit: Emit) {
    loop {
        let packet = tokio::select! {
            packet = read_packet(&mut reader) => packet,
            _ = session.closed.notified() => break,
        };
        let text = match packet {
            Ok(Some(text)) => text,
            Ok(None) => break,
            Err(e) => {
                emit(json!({"kind": "error", "session": session.id, "message": e}));
                break;
            }
        };
        let x = match parse_xml(&text) {
            Ok(x) => x,
            Err(e) => {
                emit(json!({"kind": "error", "session": session.id, "message": e}));
                continue;
            }
        };
        match x.name.as_str() {
            "response" => {
                let tx = x.attr("transaction_id").and_then(|v| v.parse::<u32>().ok());
                let waiter = tx.and_then(|tx| session.pending.lock().ok()?.remove(&tx));
                if let Some(waiter) = waiter {
                    let _ = waiter.send(x);
                }
            }
            "stream" => {
                let text = if x.attr("encoding") == Some("base64") {
                    base64_decode(x.text.trim()).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
                } else {
                    x.text.clone()
                };
                let text: String = text.chars().take(OUTPUT_LIMIT).collect();
                emit(json!({"kind": "output", "session": session.id, "stream": x.attr("type").unwrap_or("stdout"), "text": text}));
            }
            "notify" => {
                let bp = x.child("breakpoint");
                emit(json!({
                    "kind": "notify",
                    "session": session.id,
                    "name": x.attr("name"),
                    "breakpoint": bp.map(|b| json!({"id": b.attr("id"), "line": b.attr("lineno").and_then(|v| v.parse::<u64>().ok()), "resolved": b.attr("resolved"), "file": b.attr("filename").map(uri_to_path)})),
                }));
            }
            _ => {}
        }
    }
}

async fn setup(inner: &Arc<Inner>, session: &Arc<Session>, emit: &Emit) -> Res<()> {
    for (name, value) in [
        ("max_depth", "1"),
        ("max_children", "100"),
        ("max_data", "8192"),
        ("notify_ok", "1"),
        ("resolved_breakpoints", "1"),
    ] {
        // Recursos opcionais: uma recusa não impede a sessão.
        let _ = session
            .send("feature_set", &[("-n", name.into()), ("-v", value.into())], None, Some(COMMAND_TIMEOUT))
            .await;
    }
    if session.info["run"].is_null() {
        let _ = session.send("stdout", &[("-c", "1".into())], None, Some(COMMAND_TIMEOUT)).await;
    }
    sync_breakpoints(inner, session, emit).await;
    let first = inner.config.lock().map(|c| c.break_first).unwrap_or(false);
    resume(inner.clone(), session.clone(), if first { "step_into" } else { "run" }, emit.clone())
}

fn breakpoint_key(uri: &str, b: &Breakpoint) -> String {
    format!("{uri}\n{}\n{}", b.line, b.condition.trim())
}

async fn sync_breakpoints(inner: &Arc<Inner>, session: &Arc<Session>, emit: &Emit) {
    let _guard = session.sync.lock().await;
    let config = match inner.config.lock() {
        Ok(c) => c.clone(),
        Err(_) => return,
    };
    let mut want = HashMap::new();
    for b in config.breakpoints.iter().filter(|b| b.enabled) {
        let local = config.root.join(&b.path);
        let uri = path_to_uri(&to_server(&config.root, &config.mappings, &local));
        want.insert(breakpoint_key(&uri, b), (uri, b.clone()));
    }
    let have = session.breakpoints.lock().map(|b| b.clone()).unwrap_or_default();
    for (key, id) in have.iter().filter(|(k, _)| !want.contains_key(*k)) {
        let _ = session
            .send("breakpoint_remove", &[("-d", id.clone())], None, Some(COMMAND_TIMEOUT))
            .await;
        if let Ok(mut b) = session.breakpoints.lock() {
            b.remove(key);
        }
    }
    for (key, (uri, b)) in want.into_iter().filter(|(k, _)| !have.contains_key(k)) {
        let condition = b.condition.trim();
        let mut args = vec![
            ("-t", if condition.is_empty() { "line" } else { "conditional" }.to_owned()),
            ("-f", uri),
            ("-n", b.line.to_string()),
        ];
        if !b.enabled {
            args.push(("-s", "disabled".into()));
        }
        let result = session
            .send("breakpoint_set", &args, (!condition.is_empty()).then_some(condition), Some(COMMAND_TIMEOUT))
            .await;
        match result.and_then(|x| x.attr("id").map(str::to_owned).ok_or_else(|| "Xdebug não devolveu id do breakpoint".to_owned())) {
            Ok(id) => {
                if let Ok(mut map) = session.breakpoints.lock() {
                    map.insert(key, id);
                }
            }
            Err(e) => emit(json!({"kind": "error", "session": session.id, "message": format!("Breakpoint {}:{}: {e}", b.path, b.line)})),
        }
    }
}

async fn stack(inner: &Arc<Inner>, session: &Session) -> Res<Value> {
    let x = session.send("stack_get", &[], None, Some(COMMAND_TIMEOUT)).await?;
    let config = inner.config.lock().map_err(err)?.clone();
    Ok(json!(x
        .all("stack")
        .map(|f| {
            let server = f.attr("filename").map(uri_to_path).unwrap_or_default();
            json!({
                "level": f.attr("level").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0),
                "where": f.attr("where").unwrap_or(""),
                "type": f.attr("type").unwrap_or("file"),
                "line": f.attr("lineno").and_then(|v| v.parse::<u64>().ok()).unwrap_or(1),
                "local": to_local(&config.root, &config.mappings, &server),
                "server": server,
            })
        })
        .collect::<Vec<_>>()))
}

/// Comandos de continuação respondem só quando o script para de novo: a resposta é
/// esperada em segundo plano e o resultado chega ao renderer como evento.
fn resume(inner: Arc<Inner>, session: Arc<Session>, action: &'static str, emit: Emit) -> Res<()> {
    let status = session.status();
    if status == "running" && action != "stop" && action != "detach" {
        return Err("O script já está em execução".into());
    }
    if status == "stopped" {
        return Err("A sessão de depuração terminou".into());
    }
    session.set_status("running");
    emit(json!({"kind": "running", "session": session.id, "action": action}));
    tokio::spawn(async move {
        let timeout = matches!(action, "stop" | "detach").then_some(Duration::from_secs(5));
        let result = session.send(action, &[], None, timeout).await;
        match result {
            Ok(x) => {
                let status = x.attr("status").unwrap_or("").to_owned();
                session.set_status(&status);
                match status.as_str() {
                    "break" => {
                        sync_breakpoints(&inner, &session, &emit).await;
                        let frames = stack(&inner, &session).await.unwrap_or(Value::Array(vec![]));
                        let message = x.child("message");
                        emit(json!({
                            "kind": "break",
                            "session": session.id,
                            "reason": x.attr("reason"),
                            "exception": message.and_then(|m| m.attr("exception")),
                            "message": message.map(|m| m.text.trim().to_owned()).filter(|m| !m.is_empty()),
                            "frames": frames,
                        }));
                    }
                    "stopping" if !matches!(action, "stop" | "detach") => {
                        emit(json!({"kind": "stopping", "session": session.id}));
                        let _ = session.send("stop", &[], None, Some(Duration::from_secs(5))).await;
                    }
                    _ => emit(json!({"kind": "stopping", "session": session.id})),
                }
            }
            Err(e) => {
                if !matches!(action, "stop" | "detach") {
                    emit(json!({"kind": "error", "session": session.id, "message": e}));
                }
            }
        }
        // Fora de "break" não há mais o que pedir: o script terminou ou foi interrompido.
        if session.status() != "break" {
            session.closed.notify_one();
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_dbgp_init_and_response() {
        let x = parse_xml(r#"<?xml version="1.0" encoding="iso-8859-1"?>
<init xmlns="urn:debugger_protocol_v1" xmlns:xdebug="https://xdebug.org/dbgp/xdebug" fileuri="file:///app/a%20b.php" language="PHP" xdebug:language_version="8.3.0" protocol_version="1.0" appid="7" idekey="phpide-run-1"><engine version="3.3.2"><![CDATA[Xdebug]]></engine></init>"#).unwrap();
        assert_eq!(x.name, "init");
        assert_eq!(x.attr("idekey"), Some("phpide-run-1"));
        assert_eq!(x.attr("language_version"), Some("8.3.0"));
        assert_eq!(x.child("engine").unwrap().text, "Xdebug");
        assert_eq!(uri_to_path(x.attr("fileuri").unwrap()), "/app/a b.php");
        let r = parse_xml(r#"<response xmlns="urn:debugger_protocol_v1" xmlns:xdebug="https://xdebug.org/dbgp/xdebug" command="step_over" transaction_id="12" status="break" reason="ok"><xdebug:message filename="file:///app/x.php" lineno="7"></xdebug:message></response>"#).unwrap();
        assert_eq!(r.attr("transaction_id"), Some("12"));
        assert_eq!(r.child("message").unwrap().attr("lineno"), Some("7"));
        assert!(response_error(&r).is_none());
    }

    #[test]
    fn parses_errors_entities_and_properties() {
        let e = parse_xml(r#"<response command="eval" transaction_id="3"><error code="206"><message><![CDATA[error evaluating code]]></message></error></response>"#).unwrap();
        assert_eq!(response_error(&e).unwrap(), "error evaluating code (DBGp 206)");
        let e = parse_xml(r#"<response command="x" transaction_id="3"><error code="300"/></response>"#).unwrap();
        assert!(response_error(&e).unwrap().contains("300"));
        let ctx = parse_xml(r#"<response command="context_get" transaction_id="4" context="0"><property name="$s" fullname="$s" type="string" size="5" encoding="base64"><![CDATA[YSA8Yj4=]]></property><property name="$arr" fullname="$arr" type="array" children="1" numchildren="250" page="0" pagesize="100"><property name="0" fullname="$arr[0]" type="int"><![CDATA[10]]></property></property><property name="$o" fullname="$o" type="object" classname="App\User" children="1" numchildren="1"><property name="name" fullname="$o-&gt;name" facet="private" type="null"></property></property></response>"#).unwrap();
        let props: Vec<Value> = ctx.all("property").map(property).collect();
        assert_eq!(props[0]["value"], "a <b>");
        assert_eq!(props[1]["numchildren"], 250);
        assert_eq!(props[1]["pagesize"], 100);
        assert_eq!(props[1]["items"][0]["fullname"], "$arr[0]");
        assert_eq!(props[1]["items"][0]["value"], "10");
        assert_eq!(props[2]["classname"], "App\\User");
        assert_eq!(props[2]["items"][0]["fullname"], "$o->name");
        assert_eq!(props[2]["items"][0]["facet"], "private");
        assert_eq!(unescape("&lt;&#65;&#x42;&amp;x &unknown;"), "<AB&x &unknown;");
        assert!(parse_xml("<a><b></a>").is_err());
        assert!(parse_xml("<a").is_err());
    }

    #[test]
    fn builds_commands_with_quoting_and_base64() {
        let c = command("breakpoint_set", 5, &[("-t", "conditional".into()), ("-f", "file:///a b.php".into()), ("-n", "3".into())], Some("$i == 7")).unwrap();
        assert_eq!(
            String::from_utf8(c).unwrap(),
            "breakpoint_set -i 5 -t conditional -f \"file:///a b.php\" -n 3 -- JGkgPT0gNw==\0"
        );
        assert!(command("eval", 1, &[("-n", "a\0b".into())], None).is_err());
        assert_eq!(base64_decode(&base64_encode("ação ✓".as_bytes())).unwrap(), "ação ✓".as_bytes());
        assert_eq!(base64_encode(b"ab"), "YWI=");
        assert!(base64_decode("@@").is_err());
    }

    #[tokio::test]
    async fn reads_framed_packets() {
        let data = b"4\0<a/>\x0012\0<b x=\"1\"/>  \0".to_vec();
        let mut r = BufReader::new(&data[..]);
        assert_eq!(read_packet(&mut r).await.unwrap().unwrap(), "<a/>");
        assert_eq!(read_packet(&mut r).await.unwrap().unwrap(), "<b x=\"1\"/>  ");
        assert!(read_packet(&mut r).await.unwrap().is_none());
        let bad = b"3\0<a/>\0".to_vec();
        assert!(read_packet(&mut BufReader::new(&bad[..])).await.is_err());
    }

    #[test]
    fn maps_paths_between_server_and_project() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("src/sub")).unwrap();
        std::fs::write(root.join("src/sub/a.php"), "<?php").unwrap();
        std::fs::write(root.join("index.php"), "<?php").unwrap();
        let docker = vec![
            Mapping { server: "/var/www/html/".into(), local: "".into() },
            Mapping { server: "/opt/lib".into(), local: "src".into() },
        ];
        assert_eq!(to_server(&root, &docker, &root.join("src/sub/a.php")), "/opt/lib/sub/a.php");
        assert_eq!(to_server(&root, &docker, &root.join("index.php")), "/var/www/html/index.php");
        assert_eq!(to_local(&root, &docker, "/opt/lib/sub/a.php").as_deref(), Some("src/sub/a.php"));
        assert_eq!(to_local(&root, &docker, "/var/www/html/index.php").as_deref(), Some("index.php"));
        assert_eq!(to_local(&root, &docker, "/var/www/html2/index.php"), None);
        assert_eq!(to_local(&root, &docker, "/var/www/html/missing.php"), None);
        // Sem mapeamento: o mesmo caminho no disco local (PHP local).
        let local = root.join("index.php").to_string_lossy().to_string();
        assert_eq!(to_local(&root, &[], &local).as_deref(), Some("index.php"));
        assert_eq!(to_server(&root, &[], &root.join("index.php")), local.replace('\\', "/"));
        assert_eq!(to_local(&root, &[], "/etc/hosts"), None);
        let all = vec![Mapping { server: "/".into(), local: "".into() }];
        assert_eq!(to_server(&root, &all, &root.join("index.php")), "/index.php");
        assert_eq!(path_to_uri("/app/a b#.php"), "file:///app/a%20b%23.php");
        assert_eq!(path_to_uri("C:\\www\\a.php"), "file:///C:/www/a.php");
        assert_eq!(uri_to_path("file:///C:/www/a.php"), "C:/www/a.php");
        assert_eq!(uri_to_path("dbgp://1"), "dbgp://1");
    }

    /// Fake engine over a real socket: init → feature_set/breakpoint_set/run → break → stack/context/eval → stop.
    #[tokio::test(flavor = "multi_thread")]
    async fn drives_a_session_against_a_scripted_engine() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::write(root.join("index.php"), "<?php\n$a = 1;\n$b = 2;\n").unwrap();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Value>();
        let emit: Emit = Arc::new(move |v| { let _ = tx.send(v); });
        let debugger = Debugger::default();
        let port = { let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap(); l.local_addr().unwrap().port() };
        debugger.dispatch(&root, "debugConfig", &[json!([{"path":"index.php","line":3}]), json!([{"server":"/app","local":""}]), json!(false)], emit.clone()).await.unwrap();
        let status = debugger.dispatch(&root, "debugListen", &[json!(port), json!(false)], emit.clone()).await.unwrap();
        assert_eq!(status["listening"]["port"], port);
        // Second IDE on the same port: recoverable, explicit error.
        let other = Debugger::default();
        let busy = other.dispatch(&root, "debugListen", &[json!(port)], emit.clone()).await.unwrap_err();
        assert!(busy.contains("já está em uso"), "{busy}");

        let engine = tokio::spawn(async move {
            let stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
            let (read, mut write) = stream.into_split();
            let mut reader = BufReader::new(read);
            let send = |xml: String| format!("{}\0{}\0", xml.len(), xml).into_bytes();
            write.write_all(&send(r#"<init fileuri="file:///app/index.php" language="PHP" protocol_version="1.0" idekey="X"><engine version="3.3.0">Xdebug</engine></init>"#.into())).await.unwrap();
            let mut seen = Vec::new();
            loop {
                let mut cmd = Vec::new();
                if reader.read_until(0, &mut cmd).await.unwrap() == 0 { break; }
                cmd.pop();
                let cmd = String::from_utf8(cmd).unwrap();
                let parts: Vec<&str> = cmd.split(' ').collect();
                let (name, tx) = (parts[0], parts[2]);
                seen.push(cmd.clone());
                let body = match name {
                    "breakpoint_set" => { assert!(cmd.contains("-f file:///app/index.php -n 3")); format!(r#"<response command="breakpoint_set" transaction_id="{tx}" id="77"/>"#) }
                    "run" => {
                        let out = base64_encode(b"hello");
                        write.write_all(&send(format!(r#"<stream type="stdout" encoding="base64">{out}</stream>"#))).await.unwrap();
                        format!(r#"<response command="run" transaction_id="{tx}" status="break" reason="ok"><xdebug:message filename="file:///app/index.php" lineno="3"/></response>"#)
                    }
                    "stack_get" => format!(r#"<response command="stack_get" transaction_id="{tx}"><stack where="{{main}}" level="0" type="file" filename="file:///app/index.php" lineno="3"/><stack where="vendor" level="1" type="file" filename="file:///elsewhere/v.php" lineno="9"/></response>"#),
                    "context_get" => format!(r#"<response command="context_get" transaction_id="{tx}"><property name="$a" fullname="$a" type="int"><![CDATA[1]]></property></response>"#),
                    "eval" => { assert!(cmd.ends_with(&base64_encode(b"$a + 1"))); format!(r#"<response command="eval" transaction_id="{tx}"><property type="int"><![CDATA[2]]></property></response>"#) }
                    "stop" => { let r = format!(r#"<response command="stop" transaction_id="{tx}" status="stopped" reason="ok"/>"#); write.write_all(&send(r)).await.unwrap(); break; }
                    _ => format!(r#"<response command="{name}" transaction_id="{tx}" success="1"/>"#),
                };
                write.write_all(&send(body)).await.unwrap();
            }
            seen
        });

        let mut session = String::new();
        let mut output = String::new();
        let brk = loop {
            let ev = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
            match ev["kind"].as_str().unwrap() {
                "session" => { session = ev["session"].as_str().unwrap().into(); assert_eq!(ev["info"]["local"], "index.php"); }
                "output" => output.push_str(ev["text"].as_str().unwrap()),
                "break" => break ev,
                _ => {}
            }
        };
        assert_eq!(output, "hello");
        assert_eq!(brk["frames"][0]["local"], "index.php");
        assert_eq!(brk["frames"][0]["line"], 3);
        assert!(brk["frames"][1]["local"].is_null(), "unmapped frame must be reported");
        let vars = debugger.dispatch(&root, "debugVariables", &[json!(session), json!(0), json!(0)], emit.clone()).await.unwrap();
        assert_eq!(vars[0]["value"], "1");
        let value = debugger.dispatch(&root, "debugEval", &[json!(session), json!("$a + 1")], emit.clone()).await.unwrap();
        assert_eq!(value["value"], "2");
        assert!(debugger.dispatch(&root, "debugContinue", &[json!(session), json!("rm -rf")], emit.clone()).await.is_err());
        debugger.dispatch(&root, "debugContinue", &[json!(session), json!("stop")], emit.clone()).await.unwrap();
        let seen = engine.await.unwrap();
        assert!(seen.iter().any(|c| c.starts_with("feature_set") && c.contains("max_children")));
        assert!(seen.iter().any(|c| c.starts_with("stdout -i") && c.ends_with("-c 1")));
        loop {
            let ev = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
            if ev["kind"] == "ended" { break; }
        }
        assert!(debugger.dispatch(&root, "debugStack", &[json!(session)], emit.clone()).await.unwrap_err().contains("encerrada"));
        debugger.dispatch(&root, "debugUnlisten", &[], emit).await.unwrap();
    }
}

#[cfg(test)]
#[path = "debug_integration.rs"]
mod integration;
