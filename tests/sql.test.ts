import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSql, oracleStatements, sqlComplete, sqlReferenceAt, statementAt, statements } from '../shared/sql';
import { model } from './fixtures/sql-model';
import { generateDdl, shortType } from '../shared/sql-ddl';

const at = (text: string) => ({ text: text.replace('|', ''), offset: text.indexOf('|') });
const labels = (text: string, kinds = ['column', 'table', 'view', 'schema', 'columns']) => { const { text: t, offset } = at(text); return sqlComplete(model, t, offset).items.filter(i => kinds.includes(i.kind)).map(i => `${i.label}${i.detail ?? ''}${i.description ? ' ' + i.description : ''}`); };

test('completion nos contextos observados no PhpStorm (OBS-SQL-COMP)', () => {
 assert.deepEqual(labels('SELECT | FROM users', ['column', 'columns']), ['id (fixture.public.users) integer', 'name (fixture.public.users) varchar', 'email (fixture.public.users) varchar', 'created_at (fixture.public.users) timestamp', 'id, name, email, created_at (fixture.public.users)']);
 assert.deepEqual(labels('SELECT * FROM |'), ['active_users (fixture.public) fixture@127.0.0.1', 'orders (fixture.public) fixture@127.0.0.1', 'users (fixture.public) fixture@127.0.0.1', 'billing (fixture) fixture@127.0.0.1']);
 assert.deepEqual(labels('SELECT u.| FROM users u'), ['id (u) integer', 'name (u) varchar', 'email (u) varchar', 'created_at (u) timestamp', 'id, name, email, created_at (fixture.public.users)']);
 assert.deepEqual(labels('SELECT * FROM billing.|'), ['invoices (fixture.billing) fixture@127.0.0.1'], 'REQ: schemas além do padrão (referência só introspectou public)');
 assert.deepEqual(labels('SELECT * FROM users u JOIN orders o ON o.| = u.id', ['column']), ['id (o) integer', 'user_id (o) integer', 'total (o) numeric']);
 assert.deepEqual(labels('UPDATE users SET | = 1', ['column']).length, 4);
 const { text, offset } = at('SELECT * FROM users WHERE em|');
 assert.equal(sqlComplete(model, text, offset).from, text.length - 2, 'prefixo substituído');
 assert.ok(sqlComplete(model, 'SEL', 3).items.some(i => i.label === 'SELECT' && i.kind === 'keyword'));
});

test('comandos, referência sob o cursor e detecção de SQL em string', () => {
 assert.deepEqual(statements("SELECT ';'; -- a;b\nSELECT $$x;y$$; /* ; */ SELECT 1;").map(s => s.text.trim()), ["SELECT ';'", '-- a;b\nSELECT $$x;y$$', '/* ; */ SELECT 1']);
 assert.equal(statementAt('SELECT 1;\nSELECT 2', 12)?.text.trim(), 'SELECT 2');
 const q = 'SELECT * FROM orders o WHERE o.user_id = 1';
 assert.deepEqual(sqlReferenceAt(model, q, q.indexOf('orders') + 1), { schema: 'public', table: 'orders', start: 14, end: 20 });
 assert.deepEqual(sqlReferenceAt(model, q, q.indexOf('user_id') + 1), { schema: 'public', table: 'orders', column: 'user_id', start: 31, end: 38 });
 assert.deepEqual(sqlReferenceAt(model, 'SELECT * FROM billing.invoices', 25), { schema: 'billing', table: 'invoices', start: 22, end: 30 });
 assert.equal(sqlReferenceAt(model, 'SELECT * FROM missing_table', 18), null);
 for (const sql of ['SELECT 1', '  update users set a = 1', 'WITH x AS (SELECT 1) SELECT * FROM x', 'insert into t values (1)']) assert.ok(looksLikeSql(sql), sql);
 for (const text of ['Selecione um item', 'users.show', 'delete', '']) assert.ok(!looksLikeSql(text), text);
});

test('DDL gerado igual ao observado para orders e tipos curtos', () => {
 const columns = [
  { name: 'id', dtype: 'integer', udt: 'int4', len: null, prec: 32, scale: 0, nullable: 'NO', def: "nextval('orders_id_seq'::regclass)" },
  { name: 'user_id', dtype: 'integer', udt: 'int4', len: null, prec: 32, scale: 0, nullable: 'NO', def: null },
  { name: 'total', dtype: 'numeric', udt: 'numeric', len: null, prec: 10, scale: 2, nullable: 'NO', def: null },
  { name: 'status', dtype: 'character varying', udt: 'varchar', len: 20, prec: null, scale: null, nullable: 'YES', def: "'open'::character varying" },
 ];
 const keys = [{ kind: 'PRIMARY KEY', cname: 'orders_pkey', col: 'id' }, { kind: 'FOREIGN KEY', cname: 'orders_user_id_fkey', col: 'user_id', fschema: 'public', ftable: 'users', fcol: 'id' }];
 assert.equal(generateDdl('orders', columns, keys, [{ s: 'public', t: 'users', c: 'id' }], 'public', 'postgres'), "-- auto-generated definition\ncreate table orders\n(\n    id      serial\n        primary key,\n    user_id integer        not null\n        references users,\n    total   numeric(10, 2) not null,\n    status  varchar(20) default 'open'::character varying\n);\n\nalter table orders\n    owner to postgres;\n");
 assert.deepEqual([shortType('character varying', 'varchar'), shortType('timestamp without time zone', 'timestamp'), shortType('ARRAY', '_int4'), shortType('USER-DEFINED', 'citext')], ['varchar', 'timestamp', 'int4[]', 'citext']);
});

test('comandos Oracle: blocos PL/SQL até a linha com /', () => {
 const script = "SELECT 1 FROM dual;\nBEGIN\n  x := 1;\n  NULL;\nEND;\n/\nCREATE OR REPLACE PROCEDURE p AS BEGIN NULL; END;\n/\nSELECT 'a;b' FROM dual";
 assert.deepEqual(oracleStatements(script).map(s => s.text.trim()), ['SELECT 1 FROM dual', 'BEGIN\n  x := 1;\n  NULL;\nEND;', 'CREATE OR REPLACE PROCEDURE p AS BEGIN NULL; END;', "SELECT 'a;b' FROM dual"]);
 assert.equal(statementAt(script, script.indexOf('NULL;'), 'oracle')?.text.trim().split('\n')[0], 'BEGIN');
 assert.equal(statementAt(script, script.indexOf('NULL;'))?.text.trim(), 'NULL', 'sem dialeto continua dividindo por ;');
 assert.deepEqual(oracleStatements('SELECT 4 / 2 FROM dual').map(s => s.text), ['SELECT 4 / 2 FROM dual']);
});
