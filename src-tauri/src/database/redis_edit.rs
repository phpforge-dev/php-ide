//! Prévia paginada por cursor (HSCAN/SSCAN, XRANGE) e edição de valores do Redis.
use super::{clip, column, redis_text, text};
use crate::{git::s, workspace::err, workspace::Res};
use redis::aio::MultiplexedConnection as Redis;
use serde_json::{json, Value};

/// Valores maiores que isto não são carregados para edição.
const MAX_VALUE: usize = 4 << 20;

async fn run<T: redis::FromRedisValue>(c: &mut Redis, cmd: &mut redis::Cmd) -> Res<T> {
    cmd.query_async(c).await.map_err(err)
}

/// Token de página para SCAN: `cursor:itens já exibidos do lote desse cursor`.
fn token(cursor: Option<&str>) -> Res<(u64, usize)> {
    let Some(cursor) = cursor.filter(|v| !v.is_empty()) else {
        return Ok((0, 0));
    };
    let (c, skip) = cursor.split_once(':').ok_or("Cursor inválido")?;
    Ok((c.parse().map_err(|_| "Cursor inválido")?, skip.parse().map_err(|_| "Cursor inválido")?))
}

/// Uma página de 50 itens de hash/set a partir do token; devolve o próximo token.
async fn scan_page(c: &mut Redis, cmd: &str, key: &str, per: usize, cursor: Option<&str>) -> Res<(Vec<Vec<String>>, Option<String>)> {
    let (mut at, mut skip) = token(cursor)?;
    let mut rows = vec![];
    for _ in 0..2000 {
        let (next, batch): (u64, Vec<String>) =
            run(c, redis::cmd(cmd).arg(key).arg(at).arg("COUNT").arg(200)).await?;
        let items: Vec<Vec<String>> = batch.chunks(per).map(<[String]>::to_vec).collect();
        let take = items.len().saturating_sub(skip).min(50 - rows.len());
        rows.extend(items.iter().skip(skip).take(take).cloned());
        if skip + take < items.len() {
            return Ok((rows, Some(format!("{at}:{}", skip + take))));
        }
        if next == 0 {
            return Ok((rows, None));
        }
        (at, skip) = (next, 0);
        if rows.len() == 50 {
            return Ok((rows, Some(format!("{at}:0"))));
        }
    }
    Ok((rows, Some(format!("{at}:{skip}"))))
}

pub(super) async fn page(c: &mut Redis, key: &str, offset: u64, cursor: Option<&str>) -> Res<Value> {
    let kind: String = run(c, redis::cmd("TYPE").arg(key)).await?;
    let ttl: i64 = run(c, redis::cmd("TTL").arg(key)).await?;
    let clipped = |v: Vec<String>| v.into_iter().map(|v| clip(Some(v))).collect::<Vec<_>>();
    let mut next = None;
    let (columns, mut rows, size, more): (Vec<Value>, Vec<Vec<Option<String>>>, u64, bool) = match kind.as_str() {
        "none" => return Err("Chave não encontrada".into()),
        "string" => {
            let v: Option<Vec<u8>> = run(c, redis::cmd("GET").arg(key)).await?;
            let rows = vec![vec![clip(v.map(|v| String::from_utf8_lossy(&v).to_string()))]];
            (vec![column("value", "string", false)], rows, 1, false)
        }
        "list" => {
            let size: u64 = run(c, redis::cmd("LLEN").arg(key)).await?;
            let items: Vec<redis::Value> = run(c, redis::cmd("LRANGE").arg(key).arg(offset).arg(offset + 49)).await?;
            let rows = items
                .iter()
                .enumerate()
                .map(|(i, v)| vec![Some((offset as usize + i).to_string()), clip(redis_text(v))])
                .collect();
            (vec![column("index", "integer", true), column("value", "string", false)], rows, size, size > offset + 50)
        }
        // ZRANGE por posição já pagina sem limite (O(log N + 50)) e preserva a ordem por score.
        "zset" => {
            let size: u64 = run(c, redis::cmd("ZCARD").arg(key)).await?;
            let items: Vec<(String, String)> =
                run(c, redis::cmd("ZRANGE").arg(key).arg(offset).arg(offset + 49).arg("WITHSCORES")).await?;
            let rows = items.into_iter().map(|(m, s)| vec![clip(Some(m)), Some(s)]).collect();
            (vec![column("member", "string", true), column("score", "double", false)], rows, size, size > offset + 50)
        }
        "hash" | "set" => {
            let hash = kind == "hash";
            let size: u64 = run(c, redis::cmd(if hash { "HLEN" } else { "SCARD" }).arg(key)).await?;
            let (items, token) =
                scan_page(c, if hash { "HSCAN" } else { "SSCAN" }, key, if hash { 2 } else { 1 }, cursor).await?;
            next = token;
            let columns = if hash {
                vec![column("field", "string", true), column("value", "string", false)]
            } else {
                vec![column("member", "string", true)]
            };
            (columns, items.into_iter().map(clipped).collect(), size, next.is_some())
        }
        "stream" => {
            let size: u64 = run(c, redis::cmd("XLEN").arg(key)).await?;
            let start = match cursor.filter(|v| !v.is_empty()) {
                Some(id) if id.split_once('-').is_some_and(|(a, b)| a.parse::<u64>().is_ok() && b.parse::<u64>().is_ok()) => format!("({id}"),
                Some(_) => return Err("Cursor de stream inválido".into()),
                None => "-".into(),
            };
            let items: Vec<(String, Vec<String>)> =
                run(c, redis::cmd("XRANGE").arg(key).arg(start).arg("+").arg("COUNT").arg(51)).await?;
            let more = items.len() > 50;
            if more {
                next = items.get(49).map(|v| v.0.clone());
            }
            let rows = items.into_iter().take(50).map(|(id, f)| vec![Some(id), clip(Some(f.join(" ")))]).collect();
            (vec![column("id", "stream id", true), column("fields", "string", false)], rows, size, more)
        }
        other => return Err(format!("Tipo Redis {other} sem prévia")),
    };
    rows.truncate(50);
    Ok(json!({
        "columns":columns,
        "rows":rows,
        "offset":offset,
        "hasMore":more,
        "cursor":next,
        "ordered":true,
        "cellLimit":512,
        "kind":kind,
        "ttl":ttl,
        "size":size,
        "meta":format!("{kind} · {size} {} · TTL {}", if size == 1 {"item"} else {"itens"}, match ttl { -1 => "sem expiração".to_string(), t if t < 0 => "—".to_string(), t => format!("{t}s") }),
    }))
}

/// Compara-e-grava atômico: falha se o valor mudou desde a leitura.
const CAS_STRING: &str = "if redis.call('GET',KEYS[1])~=ARGV[1] then return redis.error_reply('Valor alterado por outro cliente; atualize a prévia') end return redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL')";
const CAS_HASH: &str = "if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return redis.error_reply('Valor alterado por outro cliente; atualize a prévia') end if ARGV[3]~=ARGV[1] then if redis.call('HEXISTS',KEYS[1],ARGV[3])==1 then return redis.error_reply('Campo já existe') end redis.call('HDEL',KEYS[1],ARGV[1]) end return redis.call('HSET',KEYS[1],ARGV[3],ARGV[4])";
const CAS_LIST: &str = "if redis.call('LINDEX',KEYS[1],ARGV[1])~=ARGV[2] then return redis.error_reply('Item alterado por outro cliente; atualize a prévia') end return redis.call('LSET',KEYS[1],ARGV[1],ARGV[3])";
const DEL_LIST: &str = "if redis.call('LINDEX',KEYS[1],ARGV[1])~=ARGV[2] then return redis.error_reply('Item alterado por outro cliente; atualize a prévia') end redis.call('LSET',KEYS[1],ARGV[1],ARGV[3]) return redis.call('LREM',KEYS[1],1,ARGV[3])";
const SET_REPLACE: &str = "if redis.call('SISMEMBER',KEYS[1],ARGV[1])==0 then return redis.error_reply('Membro não existe mais; atualize a prévia') end if ARGV[1]==ARGV[2] then return 0 end if redis.call('SISMEMBER',KEYS[1],ARGV[2])==1 then return redis.error_reply('Membro já existe') end redis.call('SREM',KEYS[1],ARGV[1]) return redis.call('SADD',KEYS[1],ARGV[2])";
const ZSET_REPLACE: &str = "if ARGV[1]~=ARGV[2] then if redis.call('ZSCORE',KEYS[1],ARGV[1])==false then return redis.error_reply('Membro não existe mais; atualize a prévia') end if redis.call('ZSCORE',KEYS[1],ARGV[2]) then return redis.error_reply('Membro já existe') end redis.call('ZREM',KEYS[1],ARGV[1]) end return redis.call('ZADD',KEYS[1],ARGV[3],ARGV[2])";

fn arg<'a>(op: &'a Value, key: &str) -> Res<&'a str> {
    let v = op[key].as_str().ok_or_else(|| format!("Campo {key} ausente"))?;
    if v.len() > MAX_VALUE {
        return Err("Valor excede 4 MB".into());
    }
    Ok(v)
}

/// EVAL sem cache de script (evita depender do recurso `script` do redis-rs).
async fn eval(c: &mut Redis, code: &str, key: &str, args: &[String]) -> Res<redis::Value> {
    run(c, redis::cmd("EVAL").arg(code).arg(1).arg(key).arg(args)).await
}

async fn kind_of(c: &mut Redis, key: &str, expected: &str) -> Res<()> {
    let kind: String = run(c, redis::cmd("TYPE").arg(key)).await?;
    match kind.as_str() {
        "none" => Err("Chave não encontrada".into()),
        k if k == expected => Ok(()),
        k => Err(format!("Chave é do tipo {k}, não {expected}")),
    }
}

/// Operações de edição; cada uma afeta uma única chave e confere o valor lido antes.
pub(super) async fn edit(c: &mut Redis, op: &Value) -> Res<Value> {
    let key = s(&op["key"])?;
    if key.is_empty() || key.len() > 4096 {
        return Err("Chave inválida".into());
    }
    let index = || op["index"].as_i64().ok_or("Índice inválido");
    let result: redis::Value = match text(op, "op") {
        "get" => {
            let value: Option<Vec<u8>> = match text(op, "kind") {
                "string" => run(c, redis::cmd("GET").arg(key)).await?,
                "hash" => run(c, redis::cmd("HGET").arg(key).arg(arg(op, "field")?)).await?,
                "list" => run(c, redis::cmd("LINDEX").arg(key).arg(index()?)).await?,
                _ => return Err("Tipo sem leitura de valor".into()),
            };
            let value = value.ok_or("Valor não existe mais; atualize a prévia")?;
            if value.len() > MAX_VALUE {
                return Err("Valor excede 4 MB; use o console".into());
            }
            return Ok(json!({"value":String::from_utf8(value).map_err(|_| "Valor binário não pode ser editado como texto")?}));
        }
        "set" => eval(c, CAS_STRING, key, &[arg(op, "old")?.to_string(), arg(op, "value")?.to_string()]).await?,
        "hset" => match op["old"].as_str() {
            Some(old) => eval(c, CAS_HASH, key, &[arg(op, "field")?.to_string(), old.to_string(), op["newField"].as_str().unwrap_or(arg(op, "field")?).to_string(), arg(op, "value")?.to_string()]).await?,
            None => {
                kind_of(c, key, "hash").await?;
                let added: i64 = run(c, redis::cmd("HSETNX").arg(key).arg(arg(op, "field")?).arg(arg(op, "value")?)).await?;
                if added == 0 {
                    return Err("Campo já existe".into());
                }
                redis::Value::Int(added)
            }
        },
        "hdel" => run(c, redis::cmd("HDEL").arg(key).arg(arg(op, "field")?)).await?,
        "lset" => eval(c, CAS_LIST, key, &[index()?.to_string(), arg(op, "old")?.to_string(), arg(op, "value")?.to_string()]).await?,
        "ldel" => {
            let marker = format!("__php_ide_deleted_{}", uuid::Uuid::new_v4());
            eval(c, DEL_LIST, key, &[index()?.to_string(), arg(op, "old")?.to_string(), marker.to_string()]).await?
        }
        "rpush" => {
            kind_of(c, key, "list").await?;
            run(c, redis::cmd("RPUSH").arg(key).arg(arg(op, "value")?)).await?
        }
        "sadd" => {
            kind_of(c, key, "set").await?;
            let added: i64 = run(c, redis::cmd("SADD").arg(key).arg(arg(op, "member")?)).await?;
            if added == 0 {
                return Err("Membro já existe".into());
            }
            redis::Value::Int(added)
        }
        "sreplace" => eval(c, SET_REPLACE, key, &[arg(op, "member")?.to_string(), arg(op, "value")?.to_string()]).await?,
        "srem" => run(c, redis::cmd("SREM").arg(key).arg(arg(op, "member")?)).await?,
        "zadd" => {
            let score = op["score"].as_f64().filter(|v| v.is_finite()).ok_or("Score inválido")?;
            kind_of(c, key, "zset").await?;
            let member = arg(op, "member")?;
            eval(c, ZSET_REPLACE, key, &[op["old"].as_str().unwrap_or(member).to_string(), member.to_string(), score.to_string()]).await?
        }
        "zrem" => run(c, redis::cmd("ZREM").arg(key).arg(arg(op, "member")?)).await?,
        "ttl" => {
            let ttl = op["ttl"].as_i64().ok_or("TTL inválido")?;
            let done: i64 = if ttl > 0 {
                run(c, redis::cmd("EXPIRE").arg(key).arg(ttl)).await?
            } else {
                run::<i64>(c, redis::cmd("PERSIST").arg(key)).await?;
                let exists: i64 = run(c, redis::cmd("EXISTS").arg(key)).await?;
                exists
            };
            if done == 0 {
                return Err("Chave não encontrada".into());
            }
            redis::Value::Int(done)
        }
        "rename" => {
            let to = arg(op, "to")?;
            if to.is_empty() || to.len() > 4096 {
                return Err("Novo nome inválido".into());
            }
            let done: i64 = run(c, redis::cmd("RENAMENX").arg(key).arg(to)).await?;
            if done == 0 {
                return Err(format!("Já existe uma chave {to}"));
            }
            redis::Value::Int(done)
        }
        "delete" => {
            let removed: i64 = run(c, redis::cmd("UNLINK").arg(key)).await?;
            if removed == 0 {
                return Err("Chave não encontrada".into());
            }
            redis::Value::Int(removed)
        }
        other => return Err(format!("Operação Redis desconhecida: {other}")),
    };
    Ok(json!({"result":redis_text(&result)}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scan_tokens() {
        assert_eq!(token(None).unwrap(), (0, 0));
        assert_eq!(token(Some("")).unwrap(), (0, 0));
        assert_eq!(token(Some("1234:17")).unwrap(), (1234, 17));
        assert!(token(Some("x")).is_err());
        assert!(token(Some("1:-1")).is_err());
    }
}
