import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, defaultName, newSource, normalizeSource, parseUrl, toInput, validateSource } from '../.tools/plugin-packages/database/shared/datasource';

test('nova fonte usa padrões do driver', () => {
  const pg = newSource('postgres', 'a');
  assert.equal(pg.port, 5432); assert.equal(pg.user, 'postgres'); assert.equal(pg.name, 'postgres@localhost');
  assert.equal(newSource('sqlserver', 'b').port, 1433);
  assert.equal(newSource('redis', 'c').auth, 'none');
  assert.equal(newSource('sqlite', 'd').host, '');
  const ora = newSource('oracle', 'e');
  assert.equal(ora.port, 1521); assert.equal(ora.connectType, 'service'); assert.equal(ora.auth, 'password'); assert.equal(ora.ssl.mode, 'disable');
});

test('URL ida e volta', () => {
  const pg = { ...newSource('postgres', 'a'), host: 'db.local', port: 5433, database: 'app', user: 'me' };
  assert.equal(buildUrl(pg), 'postgresql://me@db.local:5433/app');
  assert.deepEqual(parseUrl('jdbc:postgresql://me@db.local:5433/app'), { driver: 'postgres', host: 'db.local', port: 5433, user: 'me', auth: 'password', database: 'app' });
  const ms = { ...newSource('sqlserver', 'b'), database: 'shop' };
  assert.equal(buildUrl(ms), 'sqlserver://sa@localhost:1433;databaseName=shop');
  assert.equal(parseUrl(buildUrl(ms))?.database, 'shop');
  assert.deepEqual(parseUrl('sqlite:/tmp/app.db'), { driver: 'sqlite', file: '/tmp/app.db' });
  assert.equal(parseUrl('rediss://cache:6380/2')?.ssl?.mode, 'verify-full');
  assert.equal(parseUrl('mysql://h/x')?.port, 3306);
  assert.equal(parseUrl('oracle://h:1521/x')?.connectType, 'service');
  assert.equal(parseUrl('mongodb://h/x'), undefined);
  const ora = { ...newSource('oracle', 'o'), host: 'ora.local', database: 'ORCLPDB1' };
  assert.equal(buildUrl(ora), 'oracle:thin:@//ora.local:1521/ORCLPDB1');
  assert.deepEqual(parseUrl('jdbc:oracle:thin:@//ora.local:1522/ORCLPDB1'), { driver: 'oracle', host: 'ora.local', port: 1522, database: 'ORCLPDB1', connectType: 'service' });
  assert.deepEqual(parseUrl('oracle:thin:scott@db:1521:XE'), { driver: 'oracle', host: 'db', port: 1521, database: 'XE', connectType: 'sid', user: 'scott', auth: 'password' });
  assert.equal(buildUrl({ ...ora, connectType: 'sid', database: 'XE' }), 'oracle:thin:@ora.local:1521:XE');
  assert.equal(parseUrl('nonsense'), undefined);
});

test('entrada de conexão respeita capacidades do driver', () => {
  const ms = { ...newSource('sqlserver', 'b'), readOnly: true, startup: 'SET NOCOUNT ON; SELECT 1;' };
  const input = toInput(ms, 'secret');
  assert.equal(input.readOnly, false);
  assert.equal(input.startup?.length, 2);
  assert.equal(input.password, 'secret');
  const redis = { ...newSource('redis', 'c'), startup: 'PING', ssh: { enabled: true, host: 'bastion', port: 22, user: 'u', key: '' } };
  const r = toInput(redis, 'x');
  assert.equal(r.startup, undefined); assert.equal(r.password, ''); assert.equal(r.ssh?.host, 'bastion');
  const lite = { ...newSource('sqlite', 'd'), file: '/x/app.sqlite', ssh: { enabled: true, host: 'h', port: 22, user: '', key: '' } };
  assert.equal(toInput(lite, '').ssh, undefined);
  assert.equal(defaultName(lite), 'app.sqlite');
  const ora = { ...newSource('oracle', 'e'), connectType: 'sid' as const, database: 'XE', readOnly: true, startup: "ALTER SESSION SET NLS_DATE_FORMAT='YYYY';" };
  const o = toInput(ora, 'pw');
  assert.equal(o.connectType, 'sid'); assert.equal(o.readOnly, false); assert.equal(o.startup?.length, 1); assert.equal(o.ssl?.mode, 'disable');
  const tls = { ...newSource('redis', 'f'), ssl: { mode: 'verify-full' as const, ca: ' /certs/ca.pem ' } };
  assert.equal(toInput(tls, '').ssl?.ca, '/certs/ca.pem', 'Redis aceita CA próprio');
});

test('validação e normalização', () => {
  assert.equal(validateSource({ ...newSource('postgres', 'a'), host: ' ' }), 'Informe o host.');
  assert.equal(validateSource({ ...newSource('postgres', 'a'), port: 70000 }), 'Porta deve estar entre 1 e 65535.');
  assert.equal(validateSource(newSource('sqlite', 'b')), 'Informe o arquivo do banco.');
  assert.equal(validateSource({ ...newSource('redis', 'c'), database: 'x' }), 'Banco Redis deve ser um índice numérico.');
  assert.equal(validateSource(newSource('postgres', 'a')), undefined);
  assert.equal(validateSource({ ...newSource('oracle', 'o'), database: ' ' }), 'Informe o Service name.');
  assert.equal(validateSource({ ...newSource('oracle', 'o'), database: '', connectType: 'sid' }), 'Informe o SID.');
  const old = normalizeSource({ id: 'z', driver: 'mysql', host: 'h' } as never);
  assert.equal(old.ssl.mode, 'prefer'); assert.equal(old.ssh.port, 22); assert.deepEqual(old.schemas, []);
});
