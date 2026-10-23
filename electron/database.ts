import pg from 'pg';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import type { ConnectionInput, DatabaseColumn, DatabasePage, DatabaseSession, DatabaseTable, SqlResult } from '../shared/contracts';
import { statements, type SqlModel, type SqlSchema } from '../shared/sql';
export async function inspectConnection(input: ConnectionInput) {
  if (!['postgres', 'mysql'].includes(input.driver) || !input.host?.trim() ||
    !Number.isInteger(input.port) || input.port < 1 || input.port > 65535)
    throw new Error('Informe host e porta válidos');
  const base = { host: input.host, port: input.port, database: input.database,
    user: input.user, password: input.password, ssl: input.tls ? { rejectUnauthorized: true } : undefined };
  if (input.driver === 'postgres') {
    const client = new pg.Client({ ...base, connectionTimeoutMillis: 8000, query_timeout: 8000 });
    try {
      await client.connect();
      const version = await client.query('SELECT version() AS version');
      const schemas = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT LIKE 'pg_%' ORDER BY schema_name");
      return { version: String(version.rows[0].version), schemas: schemas.rows.map(r => String(r.schema_name)) };
    } finally { await client.end().catch(() => {}); }
  }
  const client = await mysql.createConnection({ ...base, connectTimeout: 8000 });
  try {
    const [version] = await client.query<mysql.RowDataPacket[]>({ sql: 'SELECT VERSION() AS version', timeout: 8000 });
    const [schemas] = await client.query<mysql.RowDataPacket[]>({ sql: 'SELECT schema_name FROM information_schema.schemata ORDER BY schema_name', timeout: 8000 });
    return { version: String(version[0].version), schemas: schemas.map(r => String(r.SCHEMA_NAME ?? r.schema_name)) };
  } finally { await client.end(); }
}

/** Connections are scoped to a workspace and kept in main-process memory only. */
export class DatabaseBrowser {
  private sessions = new Map<string, ConnectionInput>();
  private epoch = 0;
  async connect(input: ConnectionInput): Promise<DatabaseSession> {
    if (this.sessions.size >= 10) throw new Error('Desconecte uma fonte antes de adicionar outra (limite: 10).');
    const version = this.epoch;
    const info = await inspectConnection(input);
    if (version !== this.epoch) throw new Error('O projeto mudou durante a conexão.');
    const id = randomUUID(); this.sessions.set(id, { ...input });
    return { id, label: `${input.database}@${input.host}:${input.port}`, driver: input.driver, schemas: info.schemas.filter(s => !['information_schema', 'mysql', 'performance_schema', 'sys'].includes(s)) };
  }
  disconnect(id: string) { this.sessions.delete(id); this.models.delete(id); this.closeConsole(id); }
  clear() { this.epoch++; this.sessions.clear(); this.models.clear(); for (const id of [...this.consoles.keys()]) this.closeConsole(id); }
  /** Sessões abertas (para plugins de linguagem); nunca expõe credenciais. */
  ids() { return [...this.sessions.keys()]; }
  private input(id: string) { const input = this.sessions.get(id); if (!input) throw new Error('Conexão encerrada. Conecte novamente.'); return input; }
  private name(value: string) { if (typeof value !== 'string' || !value || value.includes('\0') || value.length > 256) throw new Error('Nome de objeto inválido'); }
  private async query<T>(input: ConnectionInput, run: (query: (sql: string, values?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
    const base = { host: input.host, port: input.port, database: input.database, user: input.user, password: input.password, ssl: input.tls ? { rejectUnauthorized: true } : undefined };
    if (input.driver === 'postgres') {
      const client = new pg.Client({ ...base, connectionTimeoutMillis: 8000, query_timeout: 8000, statement_timeout: 8000 });
      try { await client.connect(); await client.query('BEGIN READ ONLY'); return await run(async (sql, values = []) => (await client.query(sql, values)).rows); }
      finally { await client.end().catch(() => {}); }
    }
    const client = await mysql.createConnection({ ...base, connectTimeout: 8000, multipleStatements: false });
    try {
      await client.query({ sql: 'START TRANSACTION READ ONLY', timeout: 8000 });
      return await run(async (sql, values = []) => (await client.query<mysql.RowDataPacket[]>({ sql, values, timeout: 8000 }))[0]);
    } finally { client.destroy(); }
  }
  async tables(id: string, schema: string): Promise<DatabaseTable[]> {
    this.name(schema); const input = this.input(id); const param = input.driver === 'postgres' ? '$1' : '?';
    return this.query(input, async query => (await query(`SELECT table_name AS name, table_type AS kind FROM information_schema.tables WHERE table_schema = ${param} ORDER BY table_name LIMIT 2001`, [schema])).map(row => ({ name: String(row.name), kind: String(row.kind) })).slice(0, 2000));
  }
  async page(id: string, schema: string, table: string, offset: number): Promise<DatabasePage> {
    this.name(schema); this.name(table); const input = this.input(id);
    if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000 || offset % 50 !== 0) throw new Error('Página inválida');
    const pg = input.driver === 'postgres'; const p1 = pg ? '$1' : '?'; const p2 = pg ? '$2' : '?';
    const quote = (name: string) => pg ? `"${name.replaceAll('"', '""')}"` : '`' + name.replaceAll('`', '``') + '`';
    return this.query(input, async query => {
      const raw = await query(`SELECT column_name AS name, data_type AS type, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = ${p1} AND table_name = ${p2} ORDER BY ordinal_position`, [schema, table]);
      if (!raw.length) throw new Error('Tabela não encontrada ou sem permissão de leitura.');
      if (raw.length > 128) throw new Error('Esta prévia suporta tabelas de até 128 colunas.');
      const keys = await query(`SELECT k.column_name AS name FROM information_schema.table_constraints t JOIN information_schema.key_column_usage k ON t.constraint_name = k.constraint_name AND t.table_schema = k.table_schema AND t.table_name = k.table_name WHERE t.constraint_type = 'PRIMARY KEY' AND t.table_schema = ${p1} AND t.table_name = ${p2} ORDER BY k.ordinal_position`, [schema, table]);
      const primary = new Set(keys.map(r => String(r.name)));
      const columns: DatabaseColumn[] = raw.map(r => ({ name: String(r.name), type: String(r.type), nullable: r.nullable === 'YES', primary: primary.has(String(r.name)) }));
      // Bound large values before transferring them from the server; binary values are previews, not downloads.
      const expressions = columns.map((c, i) => `LEFT(CAST(${quote(c.name)} AS ${pg ? 'text' : 'CHAR'}), 513) AS ${quote('c' + i)}`);
      const order = keys.length ? ` ORDER BY ${keys.map(k => quote(String(k.name))).join(', ')}` : '';
      const rows = await query(`SELECT ${expressions.join(', ')} FROM ${quote(schema)}.${quote(table)}${order} LIMIT 51 OFFSET ${offset}`);
      return { columns, rows: rows.slice(0, 50).map(row => columns.map((_, i) => row['c' + i] === null ? null : String(row['c' + i]))), offset, hasMore: rows.length > 50, ordered: !!keys.length, cellLimit: 512 };
    });
  }

  private models = new Map<string, Promise<SqlModel>>();
  private consoles = new Map<string, Promise<Console>>();
  /** Schemas, tabelas/views e colunas para completion e navegação; recarregado após DDL. */
  model(id: string): Promise<SqlModel> {
    const input = this.input(id);
    let model = this.models.get(id);
    if (!model) {
      model = this.introspect(input); this.models.set(id, model);
      model.catch(() => { if (this.models.get(id) === model) this.models.delete(id); });
    }
    return model;
  }
  private introspect(input: ConnectionInput): Promise<SqlModel> {
    const pg = input.driver === 'postgres';
    return this.query(input, async query => {
      const current = pg ? String((await query('SELECT current_schema() AS name'))[0].name) : input.database;
      const schemaRows = pg ? await query("SELECT schema_name AS name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema') AND schema_name NOT LIKE 'pg\\_%' ORDER BY schema_name") : [{ name: input.database }];
      const filter = pg ? "c.table_schema NOT IN ('information_schema') AND c.table_schema NOT LIKE 'pg\\_%'" : 'c.table_schema = DATABASE()';
      const rows = await query(`SELECT c.table_schema AS ${pg ? 'schema' : '`schema`'}, c.table_name AS tname, c.column_name AS cname, c.data_type AS dtype, ${pg ? 'c.udt_name' : 'c.data_type'} AS udt, t.table_type AS ttype FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE ${filter} ORDER BY c.table_schema, c.table_name, c.ordinal_position LIMIT 50001`);
      const schemas = new Map<string, SqlSchema>(schemaRows.map(r => [String(r.name), { name: String(r.name), tables: [] }]));
      for (const r of rows.slice(0, 50000)) {
        const schema = schemas.get(String(r.schema)) ?? schemas.set(String(r.schema), { name: String(r.schema), tables: [] }).get(String(r.schema))!;
        let table = schema.tables.at(-1);
        if (table?.name !== String(r.tname)) { table = { name: String(r.tname), kind: String(r.ttype).includes('VIEW') ? 'view' : 'table', columns: [] }; schema.tables.push(table); }
        table.columns.push({ name: String(r.cname), type: shortType(String(r.dtype), String(r.udt)) });
      }
      return { label: `${input.database}@${input.host}`, database: input.database, defaultSchema: current, schemas: [...schemas.values()] };
    });
  }
  private console(id: string): Promise<Console> {
    const input = this.input(id);
    let opened = this.consoles.get(id);
    if (!opened) {
      opened = openConsole(input); this.consoles.set(id, opened);
      opened.catch(() => { if (this.consoles.get(id) === opened) this.consoles.delete(id); });
    }
    return opened;
  }
  private closeConsole(id: string) { const c = this.consoles.get(id); this.consoles.delete(id); void c?.then(x => x.close()).catch(() => {}); }
  /** Executa os comandos em sequência na conexão do console (auto-commit); para no primeiro erro. */
  async execute(id: string, sql: string): Promise<SqlResult[]> {
    if (typeof sql !== 'string' || sql.length > 1_000_000) throw new Error('SQL inválido ou maior que 1 MB');
    const parts = statements(sql).map(s => s.text.trim()).filter(Boolean);
    if (!parts.length) throw new Error('Nenhum comando para executar.');
    const console = await this.console(id); const results: SqlResult[] = [];
    for (const statement of parts.slice(0, 100)) {
      const started = performance.now();
      try {
        const r = await console.run(statement);
        const ms = Math.round(performance.now() - started);
        results.push(r.columns ? { statement, ms, kind: 'rows', columns: r.columns, rows: r.rows!.slice(0, 500).map(row => row.map(cell)), truncated: r.rows!.length > 500 } : { statement, ms, kind: 'update', affected: r.affected ?? 0 });
        if (/^\s*(CREATE|ALTER|DROP|RENAME|TRUNCATE|COMMENT)\b/i.test(statement)) this.models.delete(id);
      } catch (error: any) {
        results.push({ statement, ms: Math.round(performance.now() - started), kind: 'error', error: String(error?.message ?? error) });
        break;
      }
    }
    return results;
  }
  async cancel(id: string) { const c = this.consoles.get(id); if (c) await (await c).cancel(); }
  /** DDL gerado a partir dos metadados (PostgreSQL) ou de SHOW CREATE TABLE (MySQL). */
  async ddl(id: string, schema: string, table: string): Promise<string> {
    this.name(schema); this.name(table); const input = this.input(id);
    if (input.driver === 'mysql') return this.query(input, async query => {
      const row = (await query('SHOW CREATE TABLE `' + schema.replaceAll('`', '``') + '`.`' + table.replaceAll('`', '``') + '`'))[0];
      return '-- auto-generated definition\n' + String(row['Create Table'] ?? row['Create View'] ?? Object.values(row)[1]) + ';\n';
    });
    return this.query(input, async query => {
      const columns = await query('SELECT column_name AS name, data_type AS dtype, udt_name AS udt, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale, is_nullable AS nullable, column_default AS def FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', [schema, table]);
      if (!columns.length) throw new Error('Tabela não encontrada');
      const keys = await query("SELECT tc.constraint_type AS kind, tc.constraint_name AS cname, kcu.column_name AS col, ccu.table_schema AS fschema, ccu.table_name AS ftable, ccu.column_name AS fcol FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema LEFT JOIN information_schema.constraint_column_usage ccu ON tc.constraint_type = 'FOREIGN KEY' AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema WHERE tc.table_schema = $1 AND tc.table_name = $2 AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE') ORDER BY kcu.ordinal_position", [schema, table]);
      const fkPrimary = await query("SELECT kcu.table_schema AS s, kcu.table_name AS t, kcu.column_name AS c FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema WHERE tc.constraint_type = 'PRIMARY KEY'");
      const owner = (await query('SELECT tableowner AS owner FROM pg_tables WHERE schemaname = $1 AND tablename = $2', [schema, table]))[0]?.owner;
      const current = String((await query('SELECT current_schema() AS name'))[0].name);
      return generateDdl(schema === current ? table : `${schema}.${table}`, columns, keys, fkPrimary, current, owner ? String(owner) : undefined);
    });
  }
}

type Console = { run(sql: string): Promise<{ columns?: string[]; rows?: unknown[][]; affected?: number }>; cancel(): Promise<void>; close(): Promise<void> };
const base = (input: ConnectionInput) => ({ host: input.host, port: input.port, database: input.database, user: input.user, password: input.password, ssl: input.tls ? { rejectUnauthorized: true } : undefined });

async function openConsole(input: ConnectionInput): Promise<Console> {
  if (input.driver === 'postgres') {
    const client = new pg.Client({ ...base(input), connectionTimeoutMillis: 8000, statement_timeout: 300_000 });
    await client.connect();
    const pid = (client as unknown as { processID: number }).processID;
    return {
      async run(sql) { const r = await client.query({ text: sql, rowMode: 'array' }); return r.fields?.length ? { columns: r.fields.map(f => f.name), rows: r.rows as unknown[][] } : { affected: r.rowCount ?? 0 }; },
      async cancel() { const other = new pg.Client({ ...base(input), connectionTimeoutMillis: 8000 }); try { await other.connect(); await other.query('SELECT pg_cancel_backend($1)', [pid]); } finally { await other.end().catch(() => {}); } },
      close: () => client.end(),
    };
  }
  const client = await mysql.createConnection({ ...base(input), connectTimeout: 8000, multipleStatements: false, dateStrings: true });
  return {
    async run(sql) {
      const [rows, fields] = await client.query({ sql, rowsAsArray: true, timeout: 300_000 });
      return Array.isArray(rows) && fields ? { columns: (fields as mysql.FieldPacket[]).map(f => f.name), rows: rows as unknown[][] } : { affected: (rows as mysql.ResultSetHeader).affectedRows ?? 0 };
    },
    async cancel() { const other = await mysql.createConnection({ ...base(input), connectTimeout: 8000 }); try { await other.query('KILL QUERY ' + Number(client.threadId)); } finally { other.destroy(); } },
    close: async () => client.destroy(),
  };
}

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = value instanceof Date ? value.toISOString() : Buffer.isBuffer(value) ? '\\x' + value.subarray(0, 64).toString('hex') + (value.length > 64 ? '…' : '') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.length > 512 ? text.slice(0, 512) + '…' : text;
}

/** Tipos curtos como na lista de completion (varchar, timestamp, integer). */
export function shortType(dtype: string, udt: string) {
  const map: Record<string, string> = { 'character varying': 'varchar', character: 'char', 'timestamp without time zone': 'timestamp', 'timestamp with time zone': 'timestamptz', 'time without time zone': 'time', 'time with time zone': 'timetz' };
  if (dtype === 'USER-DEFINED') return udt;
  if (dtype === 'ARRAY') return udt.replace(/^_/, '') + '[]';
  return map[dtype] ?? dtype;
}

export function generateDdl(name: string, columns: any[], keys: any[], primaryKeys: any[], current: string, owner?: string) {
  const primary = keys.filter(k => k.kind === 'PRIMARY KEY').map(k => String(k.col));
  const type = (c: any) => {
    const t = shortType(String(c.dtype), String(c.udt));
    const serial = /^nextval\(/.test(String(c.def ?? ''));
    if (serial && (t === 'integer' || t === 'bigint' || t === 'smallint')) return { text: t === 'bigint' ? 'bigserial' : t === 'smallint' ? 'smallserial' : 'serial', serial };
    if (t === 'varchar' && c.len) return { text: `varchar(${c.len})`, serial };
    if (t === 'char' && c.len) return { text: `char(${c.len})`, serial };
    if (t === 'numeric' && c.prec !== null && c.prec !== undefined) return { text: `numeric(${c.prec}, ${c.scale ?? 0})`, serial };
    return { text: t, serial };
  };
  const names = columns.map(c => String(c.name)); const width = Math.max(...names.map(n => n.length));
  const types = columns.map(type);
  const typeWidth = Math.max(...types.filter((t, i) => columns[i].nullable === 'NO' && !(t.serial && primary.includes(names[i]))).map(t => t.text.length), 0);
  const lines = columns.map((c, i) => {
    let line = `    ${names[i].padEnd(width)} `;
    const notNull = c.nullable === 'NO' && !(primary.length === 1 && primary[0] === names[i]);
    line += notNull ? `${types[i].text.padEnd(typeWidth)} not null` : types[i].text;
    if (c.def !== null && c.def !== undefined && !types[i].serial) line += ` default ${c.def}`;
    if (primary.length === 1 && primary[0] === names[i]) line += '\n        primary key';
    for (const k of keys.filter(k => k.kind === 'UNIQUE' && k.col === names[i] && keys.filter(x => x.cname === k.cname).length === 1)) line += '\n        unique';
    for (const fk of keys.filter(k => k.kind === 'FOREIGN KEY' && k.col === names[i])) {
      const target = fk.fschema === current ? String(fk.ftable) : `${fk.fschema}.${fk.ftable}`;
      const pk = primaryKeys.filter(p => p.s === fk.fschema && p.t === fk.ftable);
      line += `\n        references ${target}${pk.length === 1 && pk[0].c === fk.fcol ? '' : ` (${fk.fcol})`}`;
    }
    return line;
  });
  if (primary.length > 1) lines.push(`    primary key (${primary.join(', ')})`);
  return `-- auto-generated definition\ncreate table ${name}\n(\n${lines.join(',\n')}\n);\n` + (owner ? `\nalter table ${name}\n    owner to ${owner};\n` : '');
}
