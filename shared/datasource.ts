import type { ConnectionInput, DataSource, DatabaseDriver } from './contracts';
import { statements } from './sql';

export type DriverInfo = {
  id: DatabaseDriver; name: string; badge: string; port: number; user: string; database: string; scheme: string;
  /** Linguagem Monaco do console. */
  language: string;
  file: boolean; readOnly: boolean; startup: boolean; ssh: boolean; ssl: boolean; caFile: boolean;
};
const sql = { file: false, readOnly: true, startup: true, ssh: true, ssl: true, caFile: true };
export const drivers: DriverInfo[] = [
  { id: 'postgres', name: 'PostgreSQL', badge: 'PG', port: 5432, user: 'postgres', database: 'postgres', scheme: 'postgresql', language: 'pgsql', ...sql },
  { id: 'mysql', name: 'MySQL', badge: 'My', port: 3306, user: 'root', database: '', scheme: 'mysql', language: 'mysql', ...sql },
  { id: 'mariadb', name: 'MariaDB', badge: 'Ma', port: 3306, user: 'root', database: '', scheme: 'mariadb', language: 'mysql', ...sql },
  { id: 'sqlserver', name: 'Microsoft SQL Server', badge: 'MS', port: 1433, user: 'sa', database: 'master', scheme: 'sqlserver', language: 'sql', ...sql, readOnly: false },
  { id: 'sqlite', name: 'SQLite', badge: 'SL', port: 0, user: '', database: '', scheme: 'sqlite', language: 'sql', ...sql, file: true, ssh: false, ssl: false, caFile: false },
  { id: 'oracle', name: 'Oracle', badge: 'Or', port: 1521, user: 'system', database: 'FREEPDB1', scheme: 'oracle', language: 'sql', ...sql, readOnly: false },
  { id: 'redis', name: 'Redis', badge: 'Rd', port: 6379, user: '', database: '0', scheme: 'redis', language: 'redis', ...sql, readOnly: false, startup: false },
];
/** Exibidos no menu como indisponíveis: protocolo ainda não implementado. */
export const plannedDrivers = ['MongoDB', 'ClickHouse', 'Cassandra', 'Snowflake'];

export function driverInfo(id: DatabaseDriver): DriverInfo {
  return drivers.find(d => d.id === id) ?? drivers[0];
}

export function defaultName(source: Pick<DataSource, 'driver' | 'host' | 'database' | 'file'>): string {
  const info = driverInfo(source.driver);
  if (info.file) return source.file.split(/[\\/]/).filter(Boolean).at(-1) || info.name;
  if (source.driver === 'redis') return `${source.host || 'localhost'}/db${source.database || '0'}`;
  return `${source.database || info.id}@${source.host || 'localhost'}`;
}

export function newSource(driver: DatabaseDriver, id: string): DataSource {
  const info = driverInfo(driver);
  const source: DataSource = { id, name: '', comment: '', driver, host: info.file ? '' : 'localhost', port: info.port, database: info.database, user: info.user, file: '',
    auth: driver === 'redis' || info.file ? 'none' : 'password', savePassword: 'session', ssl: { mode: 'prefer', ca: '' }, ssh: { enabled: false, host: '', port: 22, user: '', key: '' },
    readOnly: false, startup: '', schemas: [] };
  if (!info.ssl) source.ssl.mode = 'disable';
  if (driver === 'redis' || driver === 'oracle') source.ssl.mode = 'disable';
  if (driver === 'oracle') source.connectType = 'service';
  source.name = defaultName(source);
  return source;
}

/** Normaliza fontes antigas ou editadas à mão, preenchendo campos ausentes. */
export function normalizeSource(raw: Partial<DataSource> & { id: string; driver: DatabaseDriver }): DataSource {
  const base = newSource(raw.driver, raw.id);
  return { ...base, ...raw, ssl: { ...base.ssl, ...raw.ssl }, ssh: { ...base.ssh, ...raw.ssh }, schemas: Array.isArray(raw.schemas) ? raw.schemas : [] };
}

export function buildUrl(source: DataSource): string {
  const info = driverInfo(source.driver);
  if (info.file) return `sqlite:${source.file}`;
  const host = source.host.includes(':') ? `[${source.host}]` : source.host;
  const auth = source.auth === 'password' && source.user ? `${encodeURIComponent(source.user)}@` : '';
  if (source.driver === 'sqlserver') return `sqlserver://${auth}${host}:${source.port}${source.database ? `;databaseName=${source.database}` : ''}`;
  if (source.driver === 'oracle') return source.connectType === 'sid' ? `oracle:thin:@${host}:${source.port}:${source.database}` : `oracle:thin:@//${host}:${source.port}/${source.database}`;
  return `${info.scheme}://${auth}${host}:${source.port}/${source.driver === 'redis' ? source.database || '0' : encodeURIComponent(source.database)}`;
}

/** Interpreta URLs no formato exibido (aceita o prefixo `jdbc:`). Retorna undefined se não reconhecer. */
export function parseUrl(text: string): Partial<DataSource> | undefined {
  const value = text.trim().replace(/^jdbc:/i, '');
  const sqlite = /^sqlite:(?:\/\/)?(.+)$/i.exec(value);
  if (sqlite) return { driver: 'sqlite', file: sqlite[1] };
  // Oracle thin: @//host:porta/service ou @host:porta:SID (usuário antes do @ é aceito).
  const thin = /^oracle:thin:(?:([^@/]*)@)?(?:@)?(\/\/)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?(?:([/:])([^?\s]*))?$/i.exec(value);
  if (thin) {
   const result: Partial<DataSource> = { driver: 'oracle', host: thin[3].replace(/^\[|\]$/g, ''), port: thin[4] ? Number(thin[4]) : 1521, database: thin[6] ?? '', connectType: thin[5] === ':' && !thin[2] ? 'sid' : 'service' };
   if (thin[1]) { result.user = thin[1].split('/')[0]; result.auth = 'password'; }
   return result;
  }
  const match = /^([a-z]+):\/\/(?:([^@/]*)@)?(\[[^\]]+\]|[^:/;?]+)(?::(\d+))?(.*)$/i.exec(value);
  if (!match) return undefined;
  const scheme = match[1].toLowerCase();
  const driver = (({ postgresql: 'postgres', postgres: 'postgres', mysql: 'mysql', mariadb: 'mariadb', sqlserver: 'sqlserver', redis: 'redis', rediss: 'redis', oracle: 'oracle' }) as Record<string, DatabaseDriver>)[scheme];
  if (!driver) return undefined;
  const info = driverInfo(driver);
  const result: Partial<DataSource> = { driver, host: match[3].replace(/^\[|\]$/g, ''), port: match[4] ? Number(match[4]) : info.port };
  if (match[2] !== undefined) { result.user = decodeURIComponent(match[2].split(':')[0]); result.auth = 'password'; }
  const rest = match[5];
  if (driver === 'sqlserver') { const db = /databaseName=([^;]*)/i.exec(rest); result.database = db ? db[1] : ''; }
  else { const db = /^\/([^?;]*)/.exec(rest); result.database = db ? decodeURIComponent(db[1]) : driver === 'redis' ? '0' : ''; }
  if (scheme === 'rediss') result.ssl = { mode: 'verify-full', ca: '' };
  if (driver === 'oracle') result.connectType = 'service';
  return result;
}

/** Entrada de conexão enviada ao backend; a senha só existe aqui, em memória. */
export function toInput(source: DataSource, password: string): ConnectionInput {
  const info = driverInfo(source.driver);
  const input: ConnectionInput = { driver: source.driver, host: source.host.trim(), port: Number(source.port), database: source.database.trim(),
    user: source.auth === 'none' ? '' : source.user, password: source.auth === 'none' ? '' : password, sourceId: source.id, name: source.name.trim() || defaultName(source),
    auth: source.auth, savePassword: source.savePassword, readOnly: info.readOnly && source.readOnly, schemas: source.schemas };
  if (info.file) input.file = source.file.trim();
  if (info.ssl) input.ssl = { mode: source.ssl.mode, ca: info.caFile ? source.ssl.ca.trim() : '' };
  if (source.driver === 'oracle') input.connectType = source.connectType ?? 'service';
  if (info.ssh && source.ssh.enabled) input.ssh = { host: source.ssh.host.trim(), port: Number(source.ssh.port) || 22, user: source.ssh.user.trim(), key: source.ssh.key.trim() };
  if (info.startup && source.startup.trim()) input.startup = statements(source.startup).map(s => s.text.trim()).filter(Boolean);
  return input;
}

/** Erros de preenchimento antes de tentar conectar. */
export function validateSource(source: DataSource): string | undefined {
  const info = driverInfo(source.driver);
  if (info.file) return source.file.trim() ? undefined : 'Informe o arquivo do banco.';
  if (!source.host.trim()) return 'Informe o host.';
  if (!Number.isInteger(Number(source.port)) || source.port < 1 || source.port > 65535) return 'Porta deve estar entre 1 e 65535.';
  if (source.driver === 'redis' && !/^\d*$/.test(source.database.trim())) return 'Banco Redis deve ser um índice numérico.';
  if (source.driver === 'oracle' && !source.database.trim()) return source.connectType === 'sid' ? 'Informe o SID.' : 'Informe o Service name.';
  if (source.ssh.enabled && info.ssh && !source.ssh.host.trim()) return 'Informe o host SSH.';
  return undefined;
}
