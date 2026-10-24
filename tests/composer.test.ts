import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ComposerPlugin, constraints, contentHash, jsonContext, md5, parseJson, JsonError, phpJsonEncode, scriptNames } from '../.tools/plugin-packages/composer/src/shared/language/plugins/composer';
import { PluginHost } from '../shared/language/plugins/host';
import type { ProjectFiles } from '../shared/language/plugins/api';

const fixtures = join(import.meta.dirname, './fixtures/projects');
function project(root: string, extra: Record<string, string | null> = {}): ProjectFiles {
 const walk = (dir: string): string[] => existsSync(join(root, dir)) ? readdirSync(join(root, dir)).flatMap(name => { const p = dir ? `${dir}/${name}` : name; return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; }) : [];
 return {
  root,
  read: async path => path in extra ? extra[path] : existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null,
  exists: async path => path in extra ? extra[path] !== null : existsSync(join(root, path)),
  list: async (dir, accept) => walk(dir).filter(p => accept(p.split('/').pop()!)),
  uri: path => `file://${root}/${path}`,
 };
}
const symfony = join(fixtures, 'symfony');
const composerJson = readFileSync(join(symfony, 'composer.json'), 'utf8');
const at = (text: string, marker: string) => { const i = text.indexOf(marker); assert.ok(i >= 0, marker); return i + marker.length; };

test('md5 e content-hash conferem com o composer.lock gerado pelo Composer', () => {
 assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
 assert.equal(md5('ação'), 'ce762a2c8073e0b6ad5d9bc99283af67');
 const json = readFileSync(join(fixtures, 'composer/hash/composer.json'), 'utf8');
 const lock = JSON.parse(readFileSync(join(fixtures, 'composer/hash/composer.lock'), 'utf8'));
 assert.equal(contentHash(parseJson(json)), lock['content-hash']);
 assert.notEqual(contentHash(parseJson(json.replace('"php": ">=8.1"', '"php": ">=8.2"'))), lock['content-hash']);
 assert.equal(contentHash(parseJson(json.replace('"description": "Demo ação"', '"description": "outra"'))), lock['content-hash'], 'description não entra no hash');
 assert.equal(phpJsonEncode(parseJson('{"a":"x/é","b":{},"c":[],"d":2.50,"e":1.0}')), '{"a":"x\\/\\u00e9","b":[],"c":[],"d":2.5,"e":1.0}');
});

test('parser JSON estrito informa a posição do erro', () => {
 for (const [text, offset] of [['{"a": 1,}', 8], ['{"a" 1}', 5], ['{"a": tru}', 6], ['', 0], ['{"a": "b"} x', 11]] as const) {
  assert.throws(() => parseJson(text), (e: unknown) => e instanceof JsonError && e.offset === offset, text);
 }
 const root = parseJson('{"x": [1, true, null, "s"]}');
 assert.equal(root.type, 'object');
});

test('contexto do cursor: chave/valor, caminho e trecho digitado', () => {
 const text = '{\n "require": {\n  "symfony/con": "^7"\n },\n "scr';
 const key = jsonContext(text, at(text, '"symfony/con'))!;
 assert.deepEqual([key.role, key.path, key.prefix, key.value, key.inString], ['key', ['require'], 'symfony/con', 'symfony/con', true]);
 const value = jsonContext(text, at(text, '"^'))!;
 assert.deepEqual([value.role, value.path, value.key, value.prefix], ['value', ['require'], 'symfony/con', '^']);
 const root = jsonContext(text, text.length)!;
 assert.deepEqual([root.role, root.path, root.prefix], ['key', [], 'scr']);
 const bare = jsonContext('{"autoload": {ps', 16)!;
 assert.deepEqual([bare.role, bare.path, bare.inString, bare.from], ['key', ['autoload'], false, 14]);
 assert.equal(jsonContext('', 0), null);
});

test('restrições sugeridas a partir da versão instalada', () => {
 assert.deepEqual(constraints('v7.1.3'), ['^7.1', '^7.1.3', '~7.1.3', '7.1.3', '*']);
 assert.deepEqual(constraints('dev-main'), ['dev-main', '*']);
 assert.deepEqual(constraints(''), ['*']);
});

const host = (extra: Record<string, string | null> = {}) => new PluginHost(project(symfony, extra), [new ComposerPlugin()]);
const complete = async (text: string, offset: number, extra = {}) => (await host(extra).completeCode('composer.json', text, offset))?.items ?? null;

test('completion de chaves do schema, pacotes instalados e versões do lock', async () => {
 const rootKeys = await complete('{\n  ""\n}', 5);
 assert.ok(rootKeys!.some(i => i.label === 'require-dev') && rootKeys!.some(i => i.label === 'autoload'));
 assert.equal(rootKeys!.find(i => i.label === 'require')!.textEdit.newText, 'require', 'dentro de aspas insere só o nome');
 const bare = await complete('{"autoload": {ps', 16);
 assert.deepEqual(bare!.filter(i => i.label.startsWith('ps')).map(i => i.textEdit.newText), ['"psr-4"', '"psr-0"']);
 const packages = await complete('{"require": {"sym"}}', 17);
 assert.deepEqual(packages!.slice(0, 4).map(i => [i.label, i.labelDetails?.detail]), [['symfony/console', ' v7.1.3'], ['symfony/framework-bundle', ' v7.1.4'], ['symfony/polyfill-mbstring', ' v1.30.0'], ['phpunit/phpunit', ' 11.3.1']]);
 assert.ok(packages!.some(i => i.label === 'php') && packages!.some(i => i.label === 'ext-intl'));
 const versions = await complete('{"require": {"symfony/console": ""}}', 33);
 assert.deepEqual(versions!.map(i => i.label), ['^7.1', '^7.1.3', '~7.1.3', '7.1.3', '*']);
 assert.equal(versions![0].detail, 'Instalado: v7.1.3');
 assert.deepEqual((await complete('{"minimum-stability": "d"}', 23))!.map(i => i.label), ['stable', 'RC', 'beta', 'alpha', 'dev']);
 assert.deepEqual((await complete('{"config": {"preferred-install": ""}}', 33))!.map(i => i.label), ['auto', 'dist', 'source']);
 const scripts = await complete(composerJson.replace('"lint": "php', '"lint": "@'), at(composerJson.replace('"lint": "php', '"lint": "@'), '"lint": "@'));
 assert.deepEqual(scripts!.map(i => i.label), ['@auto-scripts', '@post-install-cmd', '@php', '@composer', '@putenv']);
 assert.equal(await complete('{"name": ""}', 10), null, 'valor livre não é tratado');
});

test('navegação: pacote → vendor e @script → declaração', async () => {
 const h = host();
 const vendor = await h.defineCode('composer.json', composerJson, at(composerJson, '"symfony/cons'));
 assert.deepEqual(vendor!.map(l => l.uri), [`file://${symfony}/vendor/symfony/console/composer.json`]);
 assert.deepEqual(await h.defineCode('composer.json', composerJson, at(composerJson, '"twig/tw')), [], 'não instalado em vendor');
 assert.deepEqual(await h.defineCode('composer.json', composerJson, at(composerJson, '"ph')), [], 'pacote de plataforma');
 const script = await h.defineCode('composer.json', composerJson, at(composerJson, '["@auto'));
 assert.equal(script![0].range.start.line, composerJson.split('\n').findIndex(l => l.includes('"auto-scripts": {')));
});

test('diagnósticos: JSON inválido, pacote fora do lock, lock desatualizado e não instalado', async () => {
 const invalid = await host().diagnose('composer.json', '{\n "require": {\n  "a/b": "1",\n }\n}');
 assert.deepEqual(invalid.map(d => [d.code, d.severity, d.range.start]), [['composer.invalid-json', 'error', { line: 3, character: 1 }]]);
 const list = await host().diagnose('composer.json', composerJson);
 assert.deepEqual(list.map(d => [d.code, composerJson.split('\n')[d.range.start.line].trim().split(':')[0]]), [
  ['composer.package-not-locked', '"twig/twig"'],
  ['composer.lock-outdated', '"require"'],
 ]);
 assert.match(list[0].message, /composer update twig\/twig/);
 // ext-mbstring é fornecido por um pacote do lock (provide).
 assert.deepEqual((await host().diagnose('composer.json', '{"require": {"ext-mbstring": "*", "symfony/polyfill-mbstring": "*"}}')).filter(d => d.code === 'composer.package-not-locked'), []);
 const installed = JSON.stringify({ packages: [{ name: 'symfony/framework-bundle' }], 'dev-package-names': [] });
 const missing = await host({ 'vendor/composer/installed.json': installed }).diagnose('composer.json', composerJson);
 assert.deepEqual(missing.filter(d => d.code === 'composer.not-installed').map(d => d.message.split(' ')[0]), ['symfony/console', 'phpunit/phpunit']);
 const hashFixture = project(join(fixtures, 'composer/hash'));
 assert.deepEqual(await new PluginHost(hashFixture, [new ComposerPlugin()]).diagnose('composer.json', readFileSync(join(fixtures, 'composer/hash/composer.json'), 'utf8')), [], 'lock em dia');
 assert.deepEqual(await host({ 'composer.lock': null }).diagnose('composer.json', composerJson), [], 'sem lock não acusa');
});

test('CodeLens: install/update na seção require e ▶ por script', async () => {
 const lenses = await host().codeLenses('composer.json', composerJson);
 const line = (marker: string) => composerJson.split('\n').findIndex(l => l.includes(marker));
 assert.deepEqual(lenses.map(l => [l.line, l.title, l.arguments[0]]), [
  [line('"require": {'), '▶ composer install', { action: 'install' }],
  [line('"require": {'), '↻ composer update', { action: 'update' }],
  [line('"auto-scripts"'), '▶ Executar auto-scripts', { action: 'run-script', script: 'auto-scripts' }],
  [line('"post-install-cmd"'), '▶ Executar post-install-cmd', { action: 'run-script', script: 'post-install-cmd' }],
  [line('"lint"'), '▶ Executar lint', { action: 'run-script', script: 'lint' }],
 ]);
 assert.deepEqual(await host().codeLenses('composer.json', '{'), []);
 assert.deepEqual(await host().codeLenses('src/Kernel.php', '<?php'), [], 'só composer.json');
 assert.deepEqual(scriptNames('{"scripts": {\n  "a": "x",\n  "b": "'), ['a', 'b']);
});

test('detecção: plugin ativo só com composer.json', async () => {
 assert.deepEqual(await new PluginHost(project(symfony), [new ComposerPlugin()]).status(), [{ id: 'composer', name: 'Composer' }]);
 assert.deepEqual(await new PluginHost(project(join(fixtures, 'markdown')), [new ComposerPlugin()]).status(), []);
});
