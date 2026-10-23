import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { projectFiles } from './fixtures/project-files';
import { PluginHost, callSite } from '../shared/language/plugins/host';
import { LaravelPlugin, parseRoutes } from '../shared/language/plugins/laravel';
import { DotenvPlugin, parseEnv } from '../shared/language/plugins/dotenv';

async function project() {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-plugins-')));
 await cp(resolve('fixtures/laravel-strings'), root, { recursive: true });
 return { root, host: new PluginHost(projectFiles(root), [new LaravelPlugin(), new DotenvPlugin()]), probe: await readFile(join(root, 'app/probe.php'), 'utf8') };
}
const inside = (text: string, needle: string, delta = 1) => { const i = text.indexOf(needle); assert.ok(i >= 0, needle); return i + delta; };
const where = (root: string, list: any[] | null) => list?.map(l => ({ file: fileURLToPath(l.uri).slice(root.length + 1), line: l.range.start.line, character: l.range.start.character, ...(l.preserveView ? { keep: true } : {}) })) ?? null;

test('ativação e versão como na barra de status do PhpStorm', async () => {
 const { root, host } = await project();
 try { assert.deepEqual(await host.status(), [{ id: 'laravel', name: 'Laravel', version: '12.0' }, { id: 'dotenv', name: '.env' }]); }
 finally { await rm(root, { recursive: true, force: true }); }
});

test('Ctrl+clique em route, view, config e env (OBS-LV-NAV)', async () => {
 const { root, host, probe } = await project();
 const define = async (needle: string, delta = 3) => where(root, await host.define('app/probe.php', probe, inside(probe, needle, delta)));
 try {
  assert.deepEqual(await define("'users.show'"), [{ file: 'routes/web.php', line: 6, character: 0 }]);
  assert.deepEqual(await define("'admin.dashboard'"), [{ file: 'routes/web.php', line: 8, character: 4 }], 'prefixo de grupo');
  assert.deepEqual(await define("'missing.route'"), []);
  assert.deepEqual(await define("'users.profile'"), [{ file: 'resources/views/users/profile.blade.php', line: 0, character: 0, keep: true }]);
  assert.deepEqual(await define("'welcome'"), [{ file: 'resources/views/welcome.blade.php', line: 0, character: 0, keep: true }]);
  assert.deepEqual(await define("'app.name'", 6), [{ file: 'config/app.php', line: 3, character: 4 }]);
  assert.deepEqual(await define("'services.mail.host'", 2), [{ file: 'config/services.php', line: 4, character: 8 }], 'qualquer segmento leva à chave final');
  assert.deepEqual(await define("'app')"), [{ file: 'config/app.php', line: 0, character: 0, keep: true }]);
  assert.deepEqual(await define("'APP_NAME'"), [{ file: '.env', line: 0, character: 0 }]);
  assert.deepEqual(await define("'QUEUE_DRIVER'"), [{ file: '.env.example', line: 3, character: 0 }]);
  // Fora de chamada tratada: atribuição, chave de array e função desconhecida.
  for (const plain of ["<?php $x = 'app.name';", "<?php config(['app.name' => 1]);", "<?php foo('app.name');"])
   assert.equal(await host.define('app/x.php', plain, inside(plain, "'app.name'", 3)), null, plain);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('completion dentro das strings (OBS-LV-COMP)', async () => {
 const { root, host, probe } = await project();
 const complete = async (needle: string) => (await host.complete('app/probe.php', probe, inside(probe, needle, needle.length - 2)))!.items;
 try {
  const routes = await complete("route('')");
  assert.deepEqual(routes.map(i => [i.label, i.labelDetails?.detail, i.labelDetails?.description]), [['admin.dashboard', ' GET', 'admin'], ['home', ' GET', undefined], ['users.show', ' GET', 'users/{id}']]);
  assert.deepEqual((await complete("view('')")).map(i => i.label), ['components.alert', 'components.forms.input', 'probe', 'users.profile', 'welcome']);
  const config = await complete("config('')");
  assert.deepEqual(config.map(i => [i.label, i.labelDetails?.description]), [['app', undefined], ['app.locale', 'en'], ['app.name', 'Fixture'], ['app.nested', undefined], ['app.nested.key', '*****'], ['app.timezone', 'UTC'], ['services', undefined], ['services.mail', undefined], ['services.mail.host', 'localhost']]);
  assert.deepEqual((await complete("env('')")).map(i => [i.label, i.labelDetails?.detail]), [['APP_DEBUG', ' = true'], ['APP_NAME', ' = Fixture'], ['MAIL_HOST', ' = localhost'], ['QUEUE_DRIVER', ' = sync']]);
  const typed = "<?php route('users.sh');";
  const edit = (await host.complete('app/x.php', typed, typed.indexOf('.sh') + 3))!.items.find(i => i.label === 'users.show')!.textEdit as any;
  assert.deepEqual(edit, { newText: 'users.show', insert: { start: { line: 0, character: 13 }, end: { line: 0, character: 21 } }, replace: { start: { line: 0, character: 13 }, end: { line: 0, character: 21 } } });
  const middle = "<?php route('users.xx');";
  const replace = (await host.complete('app/x.php', middle, middle.indexOf('.xx') + 1))!.items[0].textEdit as any;
  assert.deepEqual([replace.insert.end.character, replace.replace.end.character], [19, 21], 'Enter insere no cursor; Tab substitui a string');
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('Blade, segredos e invalidação pelo watcher', async () => {
 const { root, host } = await project();
 try {
  const blade = await readFile(join(root, 'resources/views/welcome.blade.php'), 'utf8');
  assert.deepEqual(where(root, await host.define('resources/views/welcome.blade.php', blade, inside(blade, "'users.show'", 3))), [{ file: 'routes/web.php', line: 6, character: 0 }]);
  const include = "<p>it's</p>\n@include('users.profile')\n{{-- route('home') --}}";
  assert.deepEqual(where(root, await host.define('resources/views/x.blade.php', include, inside(include, "'users.profile'", 3))), [{ file: 'resources/views/users/profile.blade.php', line: 0, character: 0, keep: true }]);
  assert.equal(await host.define('resources/views/x.blade.php', include, inside(include, "'home'", 2)), null, 'comentário Blade');
  await writeFile(join(root, '.env'), 'APP_NAME=Fixture\nDB_PASSWORD=hunter2\nAPP_KEY=base64:abc\n');
  host.changed(join(root, '.env'));
  const env = "<?php env('');";
  const items = (await host.complete('app/x.php', env, env.indexOf("''") + 1))!.items;
  assert.deepEqual(items.filter(i => /PASSWORD|KEY/.test(i.label)).map(i => i.labelDetails?.detail), [' = *****', ' = *****'], 'REQ: valores sensíveis mascarados');
  await writeFile(join(root, 'routes/api.php'), "<?php\nRoute::prefix('api')->name('api.')->group(function () {\n    Route::apiResource('photos', PhotoController::class)->only(['index', 'show']);\n});\n");
  host.changed(join(root, 'routes/api.php'));
  const route = "<?php route('');";
  assert.deepEqual((await host.complete('app/x.php', route, route.indexOf("''") + 1))!.items.filter(i => i.label.startsWith('api.')).map(i => [i.label, i.labelDetails?.description]), [['api.photos.index', 'api/photos'], ['api.photos.show', 'api/photos/{photo}']]);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('rotas: match, group em array, resource com except e site da chamada', () => {
 const routes = parseRoutes(`<?php
Route::match(['get', 'post'], '/form', fn () => 1)->name('form');
Route::group(['prefix' => 'v1', 'as' => 'v1.'], function () {
    Route::resource('posts', PostController::class)->except(['create', 'edit', 'destroy']);
    Route::view('/about', 'about')->name('about');
});
Route::get('/unnamed', fn () => 1);
`, 'routes/web.php');
 assert.deepEqual(routes.map(r => [r.name, r.methods, r.uri]), [['form', 'GET|POST', 'form'], ['v1.posts.index', 'GET', 'v1/posts'], ['v1.posts.store', 'POST', 'v1/posts'], ['v1.posts.show', 'GET', 'v1/posts/{post}'], ['v1.posts.update', 'PUT|PATCH', 'v1/posts/{post}'], ['v1.about', 'GET', 'v1/about']]);
 const code = (s: string) => s;
 assert.deepEqual(callSite(code("redirect()->route("), 'redirect()->route('.length), { callee: '->route', argument: 0 });
 assert.deepEqual(callSite(code("\\Illuminate\\Support\\Facades\\View::make("), '\\Illuminate\\Support\\Facades\\View::make('.length), { callee: 'View::make', argument: 0 });
 assert.deepEqual(callSite(code("Route::view(      , "), 'Route::view(      , '.length), { callee: 'Route::view', argument: 1 });
 assert.equal(callSite(code("$a = ["), 6), null);
 assert.deepEqual(parseEnv('export A="x y" # c\nB=1 # c\n# C=2\nD=\'q\'', '.env').map(e => [e.key, e.value]), [['A', 'x y'], ['B', '1'], ['D', 'q']]);
});

test('Blade: componentes, atributos e variáveis da view (OBS-BL)', async () => {
 const { root, host } = await project();
 const probe = await readFile(join(root, 'resources/views/probe.blade.php'), 'utf8');
 const profile = await readFile(join(root, 'resources/views/users/profile.blade.php'), 'utf8');
 const define = async (path: string, text: string, needle: string, delta: number) => where(root, await host.define(path, text, inside(text, needle, delta)));
 const complete = async (path: string, text: string, offset: number) => (await host.complete(path, text, offset))!.items;
 try {
  assert.deepEqual(await define('resources/views/probe.blade.php', probe, '<x-alert type', 4), [{ file: 'resources/views/components/alert.blade.php', line: 0, character: 0 }, { file: 'app/View/Components/Alert.php', line: 6, character: 6 }], 'Choose Declaration: view, depois classe');
  assert.deepEqual(await define('resources/views/probe.blade.php', probe, '<x-forms.input', 11), [{ file: 'resources/views/components/forms/input.blade.php', line: 0, character: 0 }]);
  assert.deepEqual(await define('resources/views/probe.blade.php', probe, 'type="error"', 1), [{ file: 'app/View/Components/Alert.php', line: 9, character: 22 }], 'atributo → $type do construtor');
  assert.deepEqual(await define('resources/views/probe.blade.php', probe, 'name="email"', 1), [{ file: 'resources/views/components/forms/input.blade.php', line: 0, character: 8 }]);
  const tags = await complete('resources/views/probe.blade.php', probe, inside(probe, '<x-\n', 3));
  assert.deepEqual(tags.map(i => i.label), ['x-alert', 'x-dynamic-component', 'x-forms.input']);
  assert.deepEqual(tags[0].textEdit, { newText: 'x-alert', range: { start: { line: 3, character: 1 }, end: { line: 3, character: 3 } } });
  const attrs = await complete('resources/views/probe.blade.php', probe, inside(probe, '<x-alert  />', 9));
  assert.deepEqual(attrs.map(i => [i.label, i.labelDetails?.description]), [['type', 'string'], [':type', 'string'], ['message', 'string'], [':message', 'string']]);
  assert.equal(await host.complete('resources/views/probe.blade.php', probe, inside(probe, 'type="err', 9)), null, 'dentro do valor do atributo');
  const vars = await complete('resources/views/users/profile.blade.php', profile, inside(profile, '{{ $ }}', 4));
  assert.deepEqual(vars.map(i => [i.label, i.labelDetails?.description]), [['id', 'int'], ['section', 'string'], ['tab', 'string'], ['user', 'object']], 'array, with(), compact() e @include');
  assert.deepEqual((await define('resources/views/users/profile.blade.php', profile, '$section', 2))?.map(l => [l.file, l.line]), [['app/Http/Controllers/UserController.php', 10]], 'REQ: origem do valor');
  assert.deepEqual((await define('resources/views/users/profile.blade.php', profile, '$id', 2))?.map(l => l.file), ['app/Http/Controllers/UserController.php', 'app/Http/Controllers/UserController.php', 'resources/views/probe.blade.php']);
  const alert = await readFile(join(root, 'resources/views/components/alert.blade.php'), 'utf8');
  assert.deepEqual((await complete('resources/views/components/alert.blade.php', alert, inside(alert, '$type', 1))).map(i => i.label), ['message', 'type'], 'props do componente na própria view');
  assert.equal(await host.complete('app/probe.php', '<?php $x = $', 12), null, 'fora de Blade fica com o Phpactor');
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('traduções __(), trans() e @lang em PHP, JSON e locais (DOC Laravel)', async () => {
 const { root, host } = await project();
 const probe = await readFile(join(root, 'resources/views/probe.blade.php'), 'utf8');
 try {
  assert.deepEqual(where(root, await host.define('resources/views/probe.blade.php', probe, inside(probe, "'messages.welcome'", 12))), [{ file: 'lang/en/messages.php', line: 3, character: 4 }, { file: 'lang/pt_BR/messages.php', line: 3, character: 4 }], 'locale configurado primeiro');
  assert.deepEqual(where(root, await host.define('resources/views/probe.blade.php', probe, inside(probe, "'Hello'", 2))), [{ file: 'lang/en.json', line: 1, character: 4 }, { file: 'lang/pt_BR.json', line: 1, character: 4 }]);
  assert.deepEqual(where(root, await host.define('resources/views/probe.blade.php', probe, inside(probe, "'messages.nested.title'", 18))), [{ file: 'lang/en/messages.php', line: 5, character: 8 }]);
  const items = (await host.complete('resources/views/probe.blade.php', probe, inside(probe, "__('')", 4)))!.items;
  assert.deepEqual(items.map(i => [i.label, i.labelDetails?.description]), [['Hello', 'Hello'], ['messages.nested.title', 'Title'], ['messages.welcome', 'Welcome, :name']]);
  const php = "<?php trans('messages.welcome'); Lang::get('Hello');";
  assert.equal(where(root, await host.define('app/x.php', php, inside(php, "'messages", 3)))?.length, 2);
  assert.equal(where(root, await host.define('app/x.php', php, inside(php, "'Hello'", 3)))?.length, 2);
 } finally { await rm(root, { recursive: true, force: true }); }
});

test('SQL em strings PHP: completion e navegação para DDL (plugin database)', async () => {
 const { DatabasePlugin } = await import('../shared/language/plugins/database');
 const { LaravelPlugin } = await import('../shared/language/plugins/laravel');
 const { DotenvPlugin } = await import('../shared/language/plugins/dotenv');
 const { model } = await import('./fixtures/sql-model');
 const { root } = await project();
 const ddl = "-- auto-generated definition\ncreate table orders\n(\n    id      serial\n        primary key,\n    user_id integer        not null\n        references users\n);\n";
 let sessions = [{ id: 's1', model }];
 const host = new PluginHost(projectFiles(root), [new LaravelPlugin(), new DotenvPlugin(), new DatabasePlugin({ sessions: async () => sessions, ddl: async () => ddl })]);
 try {
  assert.deepEqual((await host.status()).map(p => p.id), ['laravel', 'dotenv'], 'plugin interno não aparece no status');
  const php = "<?php\n$pdo->query('SELECT  FROM users');\n$sql = \"SELECT * FROM orders o WHERE o.user_id = 1\";\n$x = 'Selecione FROM users';\n";
  const columns = (await host.complete('app/x.php', php, php.indexOf('SELECT  ') + 7))!.items;
  assert.deepEqual(columns.slice(0, 2).map(i => [i.label, i.labelDetails?.detail, i.labelDetails?.description]), [['id', ' (fixture.public.users)', 'integer'], ['name', ' (fixture.public.users)', 'varchar']]);
  assert.deepEqual((columns[0] as any).textEdit.range, { start: { line: 1, character: 20 }, end: { line: 1, character: 20 } });
  const alias = (await host.complete('app/x.php', php, php.indexOf('o.user_id') + 2))!.items.filter(i => i.kind === 5).map(i => `${i.label}${i.labelDetails?.detail}`);
  assert.deepEqual(alias, ['id (o)', 'user_id (o)', 'total (o)'], 'string sem chamada (atribuição) também é SQL');
  assert.equal(await host.complete('app/x.php', php, php.indexOf('Selecione') + 3), null, 'texto comum não vira SQL');
  const table = await host.define('app/x.php', php, php.indexOf('orders o') + 2) as any[];
  assert.deepEqual([table[0].uri, table[0].range.start, table[0].title, table[0].content], ['php-ide-ddl:///fixture%40127.0.0.1/public/orders.sql', { line: 1, character: 13 }, 'orders', ddl]);
  const column = await host.define('app/x.php', php, php.indexOf('user_id') + 2) as any[];
  assert.deepEqual(column[0].range.start, { line: 5, character: 4 }, 'linha da coluna no DDL');
  assert.deepEqual(await host.define('app/x.php', "<?php $pdo->query('SELECT * FROM missing_table');", 36), [], 'tabela ausente não navega');
  const blade = "<p>{{ DB::select('SELECT  FROM users') }}</p>";
  assert.equal((await host.complete('resources/views/x.blade.php', blade, blade.indexOf('SELECT  ') + 7))!.items[0].label, 'id', 'SQL em Blade');
  sessions = [];
  assert.equal(await host.complete('app/x.php', php, php.indexOf('SELECT  ') + 7), null, 'sem fonte conectada, segue para o Phpactor');
 } finally { await rm(root, { recursive: true, force: true }); }
});

// ── PLUGIN-API-001: plugins de terceiros (manifesto, worker isolado, ponte com permissões) ──
import { Worker } from 'node:worker_threads';
import { PluginHost as SharedHost, setExternalPlugins } from '../shared/language/plugins/host';
import { SandboxedPlugin, PluginBridge, PermissionDenied, WORKER_SOURCE, documentMatcher, globToRegExp, type Channel, type PluginServices } from '../shared/language/plugins/sandbox';
import type { PluginManifest, PluginPermission, ProjectFiles } from '../shared/language/plugins/api';

// Nos testes o worker é um worker_threads com o mesmo código do Web Worker da interface.
const HARNESS = "const { parentPort } = require('node:worker_threads'); globalThis.self = globalThis; self.postMessage = m => parentPort.postMessage(m); self.addEventListener = (type, fn) => parentPort.on('message', data => fn({ data }));\n";
const nodeChannel = (): Channel => {
 const worker = new Worker(HARNESS + WORKER_SOURCE, { eval: true });
 worker.unref();
 return { post: m => worker.postMessage(m), listen: (receive, fail) => { worker.on('message', receive); worker.on('error', e => fail(String(e))); }, terminate: () => { void worker.terminate(); } };
};
const memoryFiles = (data: Record<string, string>): ProjectFiles => ({
 root: '/proj', read: async p => data[p] ?? null, exists: async p => p in data,
 list: async (dir, accept) => Object.keys(data).filter(p => (!dir || p.startsWith(dir + '/')) && accept(p.split('/').pop()!)),
 uri: p => 'file:///proj/' + p,
});
function services(files: ProjectFiles) {
 const calls: unknown[][] = [];
 const s: PluginServices = { files, write: async (...a) => { calls.push(['write', ...a]); return 'etag'; }, exec: async (...a) => { calls.push(['exec', ...a]); return 'out'; }, fetch: async (...a) => { calls.push(['fetch', ...a]); return { status: 200, body: 'ok' }; } };
 return { s, calls };
}
const fixture = async () => ({
 manifest: JSON.parse(await readFile('fixtures/plugins/todo-hints/plugin.json', 'utf8')) as PluginManifest,
 code: await readFile('fixtures/plugins/todo-hints/main.js', 'utf8'),
});
const manifest = (extra: Partial<PluginManifest> = {}): PluginManifest => ({ id: 'test.plugin', name: 'Test', version: '1.0.0', minIdeVersion: '0.2.0', main: 'main.js', activation: { languages: ['php'] }, permissions: [], ...extra });
const sandbox = (m: PluginManifest, code: string, granted: PluginPermission[], s: PluginServices, hookTimeout = 2000) =>
 new SandboxedPlugin(`user:${m.id}`, m, code, granted, s, nodeChannel, { rootUri: 'file:///proj/', hookTimeout, loadTimeout: 3000 });

test('plugin de exemplo no worker: avisos, CodeLens, completion e comando pelos mesmos ganchos de api.ts', async () => {
 const files = memoryFiles({ 'composer.json': '{}', '.todo-owners': 'ana\nbruno\n' });
 const { s } = services(files);
 const { manifest: m, code } = await fixture();
 const plugin = sandbox(m, code, ['project.read'], s);
 setExternalPlugins(() => [plugin]);
 const host = new SharedHost(files, []);
 try {
  assert.equal(await plugin.ready, true, plugin.info.errors.join('\n'));
  assert.deepEqual(plugin.info.hooks.sort(), ['codeLenses', 'command', 'completeCode', 'diagnose']);
  assert.deepEqual(await host.status(), [{ id: 'example.todo-hints', name: 'TODO Hints' }]);
  const php = "<?php\n// TODO(ana): revisar\n$x = 1; // FIXME quebra\n// TODO(";
  assert.deepEqual((await host.diagnose('app/a.php', php)).map(d => [d.range.start.line, d.code, d.severity, d.message]),
   [[1, 'example.todo-hints/todo', 'warning', 'TODO: revisar'], [2, 'example.todo-hints/fixme', 'error', 'FIXME: quebra'], [3, 'example.todo-hints/todo', 'warning', 'TODO: (']]);
  const lenses = await host.codeLenses('app/a.php', php);
  assert.deepEqual(lenses, [{ line: 0, title: '3 TODO/FIXME', command: 'php-ide.pluginCommand', arguments: ['user:example.todo-hints', 'summary', ['app/a.php', 3]] }], 'comando sempre pelo despachante');
  assert.equal(await plugin.command('summary', ['app/a.php', 3]), 'app/a.php: 3 pendência(s)');
  const items = (await host.complete('app/a.php', php, php.length))!.items;
  assert.deepEqual(items.map((i: any) => [i.label, i.textEdit.range.start]), [['ana', { line: 3, character: 8 }], ['bruno', { line: 3, character: 8 }]]);
  assert.equal(await host.complete('README.txt', 'TODO(', 5), null, 'documento fora da ativação');
  assert.equal((await host.diagnose('docs/a.md', '- TODO x')).length, 1, 'markdown declarado em activation.languages');
 } finally { plugin.stop(); setExternalPlugins(null); }
});

test('permissão negada: leitura, escrita, processo e rede só com concessão; tentativa fica visível', async () => {
 const files = memoryFiles({ '.env': 'DB_PASSWORD=x', 'a.php': '<?php' });
 const code = `ide.register({
  async diagnose(path, text, files) {
   const out = [];
   const tryIt = async (label, run) => { try { await run(); out.push(label + ':ok'); } catch (e) { out.push(label + ':' + e.message); } };
   await tryIt('read', () => files.read('.env'));
   await tryIt('write', () => ide.project.write('x.txt', 'x'));
   await tryIt('exec', () => ide.process.run('rm', ['-rf', '/']));
   await tryIt('fetch', () => ide.net.fetch('https://example.com/?' + text));
   return out.map((message, i) => ({ range: { start: { line: i, character: 0 }, end: { line: i, character: 1 } }, message, code: 'probe' }));
  } });`;
 const denied = services(files);
 const none = sandbox(manifest({ permissions: ['project.read', 'project.write', 'process', 'network'] }), code, [], denied.s);
 try {
  assert.deepEqual((await none.diagnose('a.php', 'segredo')).map(d => d.message), ['read:PermissionDenied: project.read', 'write:PermissionDenied: project.write', 'exec:PermissionDenied: process', 'fetch:PermissionDenied: network']);
  assert.deepEqual(denied.calls, [], 'nenhuma operação chegou ao backend');
  assert.deepEqual(none.info.denied, ['project.read (read)', 'project.write (write)', 'process (exec)', 'network (fetch)']);
 } finally { none.stop(); }
 const partial = services(files);
 const some = sandbox(manifest({ permissions: ['project.read', 'process', 'network'] }), code, ['project.read', 'process'], partial.s);
 try {
  assert.deepEqual((await some.diagnose('a.php', 'x')).map(d => d.message), ['read:ok', 'write:PermissionDenied: project.write', 'exec:ok', 'fetch:PermissionDenied: network']);
  assert.deepEqual(partial.calls, [['exec', 'user:test.plugin', 'rm', ['-rf', '/'], undefined]], 'chave do plugin segue para a checagem do backend');
 } finally { some.stop(); }
 const bridge = new PluginBridge('user:x', new Set(['project.read']), services(files).s);
 for (const bad of ['../etc/passwd', '/etc/passwd', 'a/../../b', 'C:/x', 'a\\b']) await assert.rejects(bridge.handle('read', [bad]), /Caminho inválido/, bad);
 await assert.rejects(bridge.handle('eval', []), /desconhecido/);
 await assert.rejects(bridge.handle('write', ['a', 'b']), (e: unknown) => e instanceof PermissionDenied && e.permission === 'project.write');
});

test('isolamento: worker sem fetch, IPC nem postMessage direto; resultados saneados', async () => {
 const code = `ide.register({
  async diagnose() {
   const g = globalThis;
   const probe = ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage', '__TAURI_INTERNALS__', 'process', 'require'].map(n => n + '=' + typeof g[n]).join(',');
   return [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, message: probe, code: 'iso' }, { range: { start: { line: -1 } }, message: 'sem range' }];
  },
  async defineCode() { return [{ uri: 'file:///proj/a.php', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } }, { uri: 'file:///etc/passwd', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }, { uri: 'file:///proj/../etc/passwd', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }, { uri: 'file:///proj/b.php', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, content: '<script>', title: 'x' }]; },
  async codeLenses() { return [{ line: 0, title: 'Rodar', command: 'php-ide.runTests', arguments: [{ filter: '; rm -rf /' }] }]; },
  async completeCode(site) { return { from: site.offset + 5, items: [{ label: 'x' }] }; },
 });`;
 const plugin = sandbox(manifest(), code, [], services(memoryFiles({})).s);
 try {
  const [probe, ...rest] = await plugin.diagnose('a.php', '');
  assert.equal(probe.message, 'fetch=undefined,XMLHttpRequest=undefined,WebSocket=undefined,importScripts=undefined,postMessage=undefined,__TAURI_INTERNALS__=undefined,process=undefined,require=undefined');
  assert.equal(rest.length, 0, 'diagnóstico malformado descartado');
  assert.deepEqual((await plugin.defineCode({ path: 'a.php', text: '', offset: 0, blade: false }))!.map(l => l.uri), ['file:///proj/a.php', 'file:///proj/b.php'], 'destinos fora do projeto e documento virtual descartados');
  assert.deepEqual((await plugin.codeLenses('a.php', ''))[0], { line: 0, title: 'Rodar', command: 'php-ide.pluginCommand', arguments: ['user:test.plugin', 'php-ide.runTests', [{ filter: '; rm -rf /' }]] }, 'plugin não aciona comando interno');
  assert.equal(await plugin.completeCode({ path: 'a.php', text: 'abc', offset: 3, blade: false }), null, 'from depois do cursor');
 } finally { plugin.stop(); }
});

test('falhas recuperáveis: erro de carga, gancho travado e exceção não derrubam os outros plugins', async () => {
 const files = memoryFiles({});
 const { s } = services(files);
 const syntax = sandbox(manifest({ id: 'test.syntax' }), 'ide.register({', [], s);
 const silent = sandbox(manifest({ id: 'test.silent' }), 'const x = 1;', [], s);
 const hang = sandbox(manifest({ id: 'test.hang' }), 'ide.register({ diagnose() { for (;;) {} } });', [], s, 300);
 const thrower = sandbox(manifest({ id: 'test.throw' }), 'ide.register({ async diagnose() { throw new Error("boom"); }, async codeLenses() { return [{ line: 0, title: "ok", command: "x" }]; } });', [], s);
 const { manifest: m, code } = await fixture();
 const good = sandbox(m, code, [], s);
 setExternalPlugins(() => [syntax, silent, hang, thrower, good]);
 const host = new SharedHost(files, []);
 try {
  assert.equal(await syntax.ready, false); assert.match(syntax.info.errors[0], /SyntaxError/);
  assert.equal(await silent.ready, false); assert.match(silent.info.errors[0], /ide\.register/);
  assert.deepEqual((await host.status()).map(p => p.id), ['test.hang', 'test.throw', 'example.todo-hints'], 'plugin que não carregou não é ativado');
  assert.deepEqual((await host.diagnose('a.php', '// TODO x')).map(d => d.code), ['example.todo-hints/todo']);
  assert.equal(hang.info.state, 'failed'); assert.match(hang.info.errors.at(-1)!, /sem resposta em 300 ms/);
  assert.match(thrower.info.errors.at(-1)!, /diagnose: boom/);
  assert.equal(thrower.info.state, 'active', 'exceção num gancho mantém o plugin');
  assert.deepEqual((await host.codeLenses('a.php', '// TODO')).map(l => l.title), ['ok', '1 TODO/FIXME']);
 } finally { for (const p of [syntax, silent, hang, thrower, good]) p.stop(); setExternalPlugins(null); }
});

test('ativação por arquivo marcador e padrões de documento', async () => {
 const data: Record<string, string> = {};
 const files = memoryFiles(data);
 const plugin = sandbox(manifest({ id: 'test.symfony', activation: { files: ['symfony.lock'], documents: ['config/**/*.yaml', 'templates/*.twig'] } }), 'ide.register({ async detect(files) { return { version: "7.1" }; } });', [], services(files).s);
 setExternalPlugins(() => [plugin]);
 const host = new SharedHost(files, []);
 try {
  assert.deepEqual(await host.status(), [], 'sem symfony.lock não se aplica');
  data['symfony.lock'] = '{}'; host.changed('/proj/symfony.lock');
  assert.deepEqual(await host.status(), [{ id: 'test.symfony', name: 'Test', version: '7.1' }]);
 } finally { plugin.stop(); setExternalPlugins(null); }
 const docs = documentMatcher(manifest({ activation: { documents: ['config/**/*.yaml', 'templates/*.twig'] } }));
 assert.deepEqual(['config/a.yaml', 'config/packages/x/b.yaml', 'templates/base.html.twig', 'templates/sub/x.twig', 'a.php'].map(docs), [true, true, true, false, false]);
 assert.equal(documentMatcher(manifest({ activation: {} }))('a.php'), true, 'padrão: PHP');
 assert.equal(documentMatcher(manifest({ activation: { languages: ['blade'] } }))('a.php'), false);
 assert.equal(globToRegExp('a.b?').test('a.bc'), true);
 assert.equal(globToRegExp('a.b').test('axb'), false);
});
