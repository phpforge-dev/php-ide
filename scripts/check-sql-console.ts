import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseBrowser } from '../electron/database';
import { sqlComplete } from '../shared/sql';
import type { ConnectionInput } from '../shared/contracts';
// Recorte 13: console SQL, modelo de schema e DDL em bancos descartáveis criados por este script.
const exec = promisify(execFile);
const schemaSql = {
 postgres: "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(120) UNIQUE, created_at TIMESTAMP DEFAULT now()); CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), total NUMERIC(10,2) NOT NULL, status VARCHAR(20) DEFAULT 'open'); CREATE SCHEMA billing; CREATE TABLE billing.invoices (id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES orders(id), issued_on DATE); CREATE VIEW active_users AS SELECT id, name FROM users; INSERT INTO users (name, email) VALUES ('Ana', 'ana@example.invalid'), ('Bruno', 'bruno@example.invalid');",
 mysql: "CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(120) UNIQUE); CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, total DECIMAL(10,2) NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id)); INSERT INTO users (name, email) VALUES ('Ana', 'ana@example.invalid'), ('Bruno', 'bruno@example.invalid');",
};
for (const driver of ['postgres', 'mysql'] as const) {
 const name = `php-ide-sql-${randomUUID()}`; const port = driver === 'postgres' ? 5432 : 3306;
 try {
  await exec('docker', ['run', '--rm', '-d', '--name', name, '-p', `127.0.0.1::${port}`, ...(driver === 'postgres' ? ['-e', 'POSTGRES_PASSWORD=fixture', '-e', 'POSTGRES_DB=fixture', 'postgres:16'] : ['-e', 'MYSQL_ROOT_PASSWORD=fixture', '-e', 'MYSQL_DATABASE=fixture', 'mysql:8.4'])]);
  const mapped = Number((await exec('docker', ['port', name, String(port)])).stdout.trim().split(':').at(-1));
  const input: ConnectionInput = { driver, host: '127.0.0.1', port: mapped, database: 'fixture', user: driver === 'postgres' ? 'postgres' : 'root', password: 'fixture', tls: false };
  const browser = new DatabaseBrowser(); let session;
  for (let i = 0; i < 60 && !session; i++) { try { session = await browser.connect(input); } catch { await new Promise(r => setTimeout(r, 1000)); } }
  assert.ok(session, 'banco não ficou disponível');
  const setup = await browser.execute(session.id, schemaSql[driver]);
  assert.ok(setup.every(r => r.kind !== 'error'), JSON.stringify(setup.filter(r => r.kind === 'error')));
  const select = await browser.execute(session.id, 'SELECT id, name, email FROM users ORDER BY id;');
  assert.deepEqual([select[0].kind, select[0].columns, select[0].rows], ['rows', ['id', 'name', 'email'], [['1', 'Ana', 'ana@example.invalid'], ['2', 'Bruno', 'bruno@example.invalid']]]);
  const update = await browser.execute(session.id, "UPDATE users SET name = 'Ana Maria' WHERE id = 1; SELECT name FROM users WHERE id = 1");
  assert.deepEqual(update.map(r => r.kind === 'update' ? r.affected : r.rows), [1, [['Ana Maria']]], 'auto-commit e ordem dos comandos');
  const failure = await browser.execute(session.id, 'SELECT * FROM missing_table; SELECT 1');
  assert.equal(failure.length, 1); assert.equal(failure[0].kind, 'error'); assert.match(failure[0].error!, /missing_table/);
  const model = await browser.model(session.id);
  const users = model.schemas.find(s => s.name === model.defaultSchema)!.tables.find(t => t.name === 'users')!;
  assert.deepEqual(users.columns.map(c => [c.name, c.type]).slice(0, 3), [['id', driver === 'postgres' ? 'integer' : 'int'], ['name', 'varchar'], ['email', 'varchar']]);
  const items = sqlComplete(model, 'SELECT  FROM users', 7).items.filter(i => i.kind === 'column').map(i => `${i.label}${i.detail} ${i.description}`);
  assert.ok(items.includes(`email (fixture.${model.defaultSchema}.users) varchar`), items.join('\n'));
  await browser.execute(session.id, 'CREATE TABLE audit_log (id INT PRIMARY KEY)');
  assert.ok((await browser.model(session.id)).schemas.some(s => s.tables.some(t => t.name === 'audit_log')), 'DDL recarrega o modelo');
  const ddl = await browser.ddl(session.id, model.defaultSchema, 'orders');
  if (driver === 'postgres') {
   assert.equal(ddl, "-- auto-generated definition\ncreate table orders\n(\n    id      serial\n        primary key,\n    user_id integer        not null\n        references users,\n    total   numeric(10, 2) not null,\n    status  varchar(20) default 'open'::character varying\n);\n\nalter table orders\n    owner to postgres;\n", 'mesmo DDL gerado pelo PhpStorm');
   assert.ok(model.schemas.some(s => s.name === 'billing' && s.tables.some(t => t.name === 'invoices')));
   const running = browser.execute(session.id, 'SELECT pg_sleep(30)');
   await new Promise(r => setTimeout(r, 500)); await browser.cancel(session.id);
   const cancelled = await running; assert.equal(cancelled[0].kind, 'error'); assert.match(cancelled[0].error!, /cancel/i); assert.ok(cancelled[0].ms < 10000);
  } else {
   assert.match(ddl, /^-- auto-generated definition\nCREATE TABLE `orders`/);
   const running = browser.execute(session.id, 'SELECT SLEEP(30)');
   await new Promise(r => setTimeout(r, 500)); await browser.cancel(session.id);
   const cancelled = await running; assert.ok(cancelled[0].ms < 10000, 'KILL QUERY interrompe');
  }
  assert.deepEqual((await browser.execute(session.id, 'SELECT 1 AS ok'))[0].rows, [['1']], 'conexão do console continua utilizável após cancelamento');
  browser.disconnect(session.id); await assert.rejects(browser.execute(session.id, 'SELECT 1'));
  console.log(`${driver}: console (seleção, auto-commit, erro, cancelamento), modelo, completion e DDL OK`);
 } finally { await exec('docker', ['rm', '-f', name]).catch(() => {}); }
}
