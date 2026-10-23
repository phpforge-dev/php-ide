//! Import only connection fields, never execute PHP or connect during preview.
use crate::workspace::{confined, Res};
use serde_json::{json, Value};
use std::{collections::HashMap, fs, io::Read, path::Path};

fn is_env(name: &str) -> bool {
    (name == ".env" || name.starts_with(".env.")) && !name.contains(['/', '\\'])
}
fn read(root: &Path, name: &str) -> Res<String> {
    let path = confined(root, name).map_err(|_| "Arquivo de configuração indisponível ou fora do projeto".to_string())?;
    let file = fs::File::open(path).map_err(|_| "Não foi possível ler a configuração".to_string())?;
    let mut text = String::new();
    file.take(65537).read_to_string(&mut text).map_err(|_| "Configuração inválida (use UTF-8)".to_string())?;
    if text.len() > 65536 { return Err("Configuração excede 64 KiB".into()); }
    Ok(text)
}
pub fn files(root: &Path) -> Res<Value> {
    let composer = read(root, "composer.json").ok().and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let laravel = composer.as_ref().is_some_and(|value| value["require"]["laravel/framework"].is_string());
    if !laravel { return Err("Importação disponível em projetos Laravel (laravel/framework no composer.json).".into()); }
    let mut names: Vec<String> = fs::read_dir(root).map_err(|_| "Não foi possível listar o projeto".to_string())?
        .filter_map(Result::ok).filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_env(name) && !name.ends_with(".example") && !name.ends_with(".bak") && confined(root, name).is_ok()).collect();
    names.sort_by_key(|name| (name != ".env", name.clone()));
    Ok(json!(names))
}
fn parse(text: &str) -> Res<HashMap<String, String>> {
    let mut values = HashMap::new();
    for line in text.lines() {
        let line = line.trim().trim_start_matches('\u{feff}');
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        let Some((key, raw)) = line.split_once('=') else { continue; };
        let key = key.trim();
        if !key.starts_with("DB_") && key != "DATABASE_URL" { continue; }
        let raw = raw.trim();
        let value = if raw.starts_with(['\'', '"']) {
            let quote = raw.chars().next().unwrap(); let mut value = String::new(); let mut escaped = false; let mut end = None;
            for (index, ch) in raw.char_indices().skip(1) {
                if escaped { value.push(match ch { 'n' => '\n', 'r' => '\r', 't' => '\t', _ => ch }); escaped=false; }
                else if ch == '\\' && quote == '"' { escaped=true; }
                else if ch == quote { end=Some(index+1); break; }
                else { value.push(ch); }
            }
            let tail = end.map(|i| raw[i..].trim()).ok_or("Valor entre aspas inválido no .env")?;
            if !tail.is_empty() && !tail.starts_with('#') { return Err("Valor inválido após aspas no .env".into()); }
            value
        } else {
            let end = raw.char_indices().find(|(i,ch)| *ch=='#' && (*i==0 || raw[..*i].ends_with(char::is_whitespace))).map(|(i,_)|i).unwrap_or(raw.len());
            match raw[..end].trim() { "null"|"(null)"|"empty"|"(empty)" => String::new(), value => value.to_string() }
        };
        // Deliberately don't interpolate using this process's environment.
        if !raw.starts_with('\'') && (value.contains("${") || value.as_bytes().windows(2).any(|pair| pair[0]==b'$' && (pair[1].is_ascii_alphabetic() || pair[1]==b'_'))) { return Err("Variáveis interpoladas no .env exigem configuração manual.".into()); }
        values.insert(key.to_string(), value);
    }
    Ok(values)
}
fn driver(name: &str) -> Res<(&'static str,u16)> {
    match name {
        "mysql" => Ok(("mysql",3306)), "mariadb" => Ok(("mariadb",3306)),
        "pgsql"|"postgres"|"postgresql" => Ok(("postgres",5432)),
        "sqlsrv"|"sqlserver" => Ok(("sqlserver",1433)), "sqlite" => Ok(("sqlite",0)),
        _ => Err("DB_CONNECTION não suportado na importação. Configure o driver manualmente.".into())
    }
}
fn decode(value: &str) -> Res<String> {
    let mut bytes = Vec::new(); let mut input=value.as_bytes().iter();
    while let Some(&b)=input.next() { if b==b'%' {
        let a=input.next().and_then(|b|(*b as char).to_digit(16));let c=input.next().and_then(|b|(*b as char).to_digit(16));
        bytes.push((a.zip(c).map(|(a,c)|a*16+c).ok_or("URL de conexão inválida")?) as u8);
    } else { bytes.push(b); } }
    String::from_utf8(bytes).map_err(|_|"URL de conexão inválida".into())
}
fn connection(root: &Path, text: &str) -> Res<Value> {
    let values=parse(text)?;let get=|name:&str| values.get(name).map(String::as_str).unwrap_or("");
    let uri = [get("DB_URL"),get("DATABASE_URL")].into_iter().find(|v|!v.is_empty());
    let url=uri.map(|v|url::Url::parse(v).map_err(|_|"URL de conexão inválida".to_string())).transpose()?;
    let (kind, default_port)=driver(url.as_ref().map(|u|u.scheme()).unwrap_or(get("DB_CONNECTION")))?;
    let mut host=get("DB_HOST").to_string(); if host.is_empty() {host="127.0.0.1".into();}
    let mut port=if get("DB_PORT").is_empty(){default_port}else{get("DB_PORT").parse::<u16>().map_err(|_|"DB_PORT inválida")?};
    let mut database=get("DB_DATABASE").to_string();let mut user=get("DB_USERNAME").to_string();let mut password=get("DB_PASSWORD").to_string();
    let mut warnings=vec![];
    if let Some(url)=url {
        if kind=="sqlite" { return Err("URL SQLite exige configuração manual; use DB_DATABASE para importar o arquivo.".into()); }
        host=url.host_str().ok_or("URL sem host")?.to_string();port=url.port().unwrap_or(default_port);
        user=decode(url.username())?;password=decode(url.password().unwrap_or(""))?;database=decode(url.path().trim_start_matches('/'))?;
        if url.query().is_some() || url.fragment().is_some() { return Err("URL com parâmetros exige configuração manual (SSL/opções não são importados).".into()); }
    }
    let mut file=String::new();
    if kind=="sqlite" {
        if database==":memory:" { return Err("SQLite em memória não pode ser compartilhado com a aplicação Laravel.".into()); }
        let path=if database.is_empty(){"database/database.sqlite"}else{&database};
        file=if Path::new(path).is_absolute(){path.to_string()}else{root.join(path).to_string_lossy().into_owned()};
        database.clear();host.clear();user.clear();password.clear();
    } else if port==0 { return Err("DB_PORT inválida".into()); }
    if !host.is_empty() && !host.contains('.') && host!="localhost" && !host.contains(':') {warnings.push("O host pode ser um serviço Docker/Sail. Confirme o host e a porta publicados para acesso pela IDE.");}
    warnings.push("Revise os campos: configurações PHP personalizadas, SSL e cache do Laravel não são importados.");
    Ok(json!({"driver":kind,"host":host,"port":port,"database":database,"user":user,"password":password,"file":file,"warnings":warnings}))
}
pub fn import(root: &Path, name: &str) -> Res<Value> {
    if !is_env(name) { return Err("Selecione um arquivo .env na raiz do projeto".into()); }
    let available=files(root)?;
    if !available.as_array().is_some_and(|list|list.iter().any(|file|file==name)) {return Err("Arquivo .env indisponível".into());}
    connection(root,&read(root,name)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fields_and_quotes() {
        let v=connection(Path::new("/project"),"DB_CONNECTION=pgsql\nDB_HOST=localhost\nDB_PORT=5433\nDB_DATABASE=app\nDB_USERNAME=dev\nDB_PASSWORD=\"p#ss word\" # comment\nAPP_KEY=ignored").unwrap();
        assert_eq!(v["driver"],"postgres");assert_eq!(v["port"],5433);assert_eq!(v["password"],"p#ss word");assert!(v.get("APP_KEY").is_none());
        let v=connection(Path::new("/project"),"export DB_CONNECTION=mysql\nDB_PASSWORD=abc#def\nDB_DATABASE=null").unwrap();assert_eq!(v["password"],"abc#def");assert_eq!(v["database"],"");
    }
    #[test] fn urls_paths_and_rejections() {
        let v=connection(Path::new("/project"),"DB_CONNECTION=mysql\nDB_URL=postgres://user:p%40ss+word@localhost:5434/app").unwrap();assert_eq!(v["password"],"p@ss+word");assert_eq!(v["driver"],"postgres");
        let v=connection(Path::new("/project"),"DB_CONNECTION=sqlite\nDB_DATABASE=database/test.sqlite").unwrap();assert_eq!(v["file"],Path::new("/project").join("database/test.sqlite").to_string_lossy().as_ref());
        for text in ["DB_CONNECTION=unknown", "DB_CONNECTION=sqlite\nDB_DATABASE=:memory:", "DB_CONNECTION=mysql\nDB_PORT=99999", "DB_URL=mysql://u:secret@host/db?sslmode=require", "DB_CONNECTION=mysql\nDB_PASSWORD=${SECRET}"] { let error=connection(Path::new("/project"),text).unwrap_err();assert!(!error.contains("secret")); }
    }
    #[test] fn project_confinement_and_no_writes() {
        let dir=tempfile::tempdir().unwrap();let root=dir.path().canonicalize().unwrap();
        fs::write(root.join("composer.json"),r#"{"require":{"laravel/framework":"^12.0"}}"#).unwrap();
        let text="DB_CONNECTION=mysql\nDB_PASSWORD='fixture'";fs::write(root.join(".env"),text).unwrap();
        assert_eq!(files(&root).unwrap(),json!([".env"]));assert_eq!(import(&root,".env").unwrap()["password"],"fixture");
        assert!(import(&root,"../.env").is_err());assert_eq!(fs::read_to_string(root.join(".env")).unwrap(),text);
        #[cfg(unix)] {let outside=tempfile::NamedTempFile::new().unwrap();std::os::unix::fs::symlink(outside.path(),root.join(".env.outside")).unwrap();assert!(import(&root,".env.outside").is_err());}
    }
}
