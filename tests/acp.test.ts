import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentHost } from '../electron/agents';
import { Workspace } from '../electron/workspace';
import type { AgentEvent } from '../shared/contracts';

test('cliente ACP: sessão, permissões, alterações pendentes e cancelamento (agente falso)', { timeout: 60000 }, async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-acp-')));
 await cp(resolve('fixtures/php-intelligence'), root, { recursive: true });
 const original = await readFile(join(root, 'src/User.php'), 'utf8');
 process.env.PHP_IDE_ACP_AGENT = JSON.stringify({ id: 'fake', name: 'Agente falso', command: process.execPath, args: [resolve('scripts/fake-acp-agent.mjs')] });
 const events: AgentEvent[] = [];
 const host = new AgentHost(new Workspace(root), resolve('.'), event => events.push(event));
 const until = async <T extends AgentEvent['type']>(type: T, from: number, check: (e: Extract<AgentEvent, { type: T }>) => boolean = () => true) => {
  for (let i = 0; i < 400; i++) { const found = events.slice(from).find(e => e.type === type && check(e as Extract<AgentEvent, { type: T }>)); if (found) return found as Extract<AgentEvent, { type: T }>; await new Promise(r => setTimeout(r, 25)); }
  throw new Error(`evento ${type} não chegou: ${JSON.stringify(events.slice(from))}`);
 };
 const text = (from: number) => events.slice(from).filter(e => e.type === 'message').map(e => (e as { text: string }).text).join('');
 const exists = (path: string) => access(join(root, path)).then(() => true, () => false);
 try {
  assert.ok(host.list().some(a => a.id === 'fake' && a.available));
  await host.start('fake');
  assert.deepEqual(await until('session', 0), { type: 'session', agent: 'fake', protocol: 1, modes: [{ id: 'default', name: 'Padrão' }, { id: 'plan', name: 'Planejar' }], mode: 'default' });

  let mark = events.length; host.prompt('olá', { path: 'probe.php', text: '<?php echo 1;' });
  assert.equal((await until('done', mark)).stopReason, 'end_turn');
  assert.equal(text(mark), `Li User.php (${original.split('\n').length} linhas). Contexto recebido: probe.php. Pronto.`);
  assert.ok(events.slice(mark).some(e => e.type === 'thought'));
  assert.ok(events.slice(mark).some(e => e.type === 'tool' && e.id === 'read-1' && e.status === 'completed'));
  assert.deepEqual((events.slice(mark).filter(e => e.type === 'plan').at(-1) as any).entries.map((e: any) => e.status), ['completed', 'completed']);

  mark = events.length; host.prompt('editar');
  const ask = await until('permission', mark);
  assert.deepEqual([ask.title, ask.options.map(o => o.name)], ['Editar src/User.php', ['Permitir', 'Recusar']]);
  host.permission(ask.id, 'allow');
  await until('done', mark);
  assert.match(text(mark), /Editei User.php e criei Created.php/, 'agente lê a própria versão pendente');
  const pending = (await until('changes', mark, e => e.changes.length === 2)).changes;
  assert.deepEqual(pending.map(c => [c.path, c.before === null]), [['src/User.php', false], ['src/Created.php', true]]);
  assert.equal(await readFile(join(root, 'src/User.php'), 'utf8'), original, 'nada vai ao disco antes de manter');
  assert.equal(await exists('src/Created.php'), false);

  await host.keep(['src/Created.php']);
  assert.equal(await exists('src/Created.php'), true, 'manter um arquivo');
  host.discard();
  assert.equal(await readFile(join(root, 'src/User.php'), 'utf8'), original, 'descartar não toca o disco');

  mark = events.length; host.prompt('editar'); host.permission((await until('permission', mark)).id, 'allow'); await until('done', mark);
  await writeFile(join(root, 'src/User.php'), original + '// externo\n');
  await assert.rejects(host.keep(), /mudou no disco/, 'conflito com alteração externa');
  await writeFile(join(root, 'src/User.php'), original);
  await host.keep();
  assert.match(await readFile(join(root, 'src/User.php'), 'utf8'), /Edited by agent/);
  await writeFile(join(root, 'src/User.php'), original);

  mark = events.length; host.prompt('editar'); host.permission((await until('permission', mark)).id, 'reject'); await until('done', mark);
  assert.match(text(mark), /Edição recusada/);

  mark = events.length; host.prompt('fora'); await until('done', mark);
  assert.match(text(mark), /Escrita externa recusada: .*fora do projeto/);
  assert.equal(await access('/tmp/php-ide-escape.txt').then(() => true, () => false), false);

  mark = events.length; host.prompt('longo'); await new Promise(r => setTimeout(r, 300)); await host.cancel();
  assert.equal((await until('done', mark)).stopReason, 'cancelled');

  mark = events.length; await host.mode('plan');
  assert.equal((await until('mode', mark)).current, 'plan');
  mark = events.length; await host.reset();
  await until('session', mark);
  assert.deepEqual((await until('changes', mark)).changes, [], 'nova conversa limpa pendências');
 } finally { host.dispose(); delete process.env.PHP_IDE_ACP_AGENT; await rm(root, { recursive: true, force: true }); }
});
