import test from 'node:test';
import assert from 'node:assert/strict';
import { GitignorePlugin, isIgnorePath } from '../.tools/plugin-packages/ignore/src/shared/language/plugins/gitignore';
import { PluginHost } from '../shared/language/plugins/host';
import type { ProjectFiles } from '../shared/language/plugins/api';

const tree = ['.gitignore', 'composer.json', 'app/Models/User.php', 'app/helpers.php', 'storage/logs/laravel.log', 'web/.dockerignore', 'web/index.php', 'web/assets/app.css'];
const files: ProjectFiles = {
 root: '/projeto',
 read: async path => tree.includes(path) ? '' : null,
 exists: async path => tree.includes(path),
 list: async (dir, accept) => tree.filter(p => !dir || p.startsWith(dir + '/')).filter(p => accept(p.split('/').pop()!)),
 uri: path => `file:///projeto/${path}`,
};
const host = new PluginHost(files, [new GitignorePlugin()]);
const labels = async (text: string, path = '.gitignore', offset = text.length) => (await host.completeCode(path, text, offset))?.items.map(i => i.textEdit.newText);

test('arquivos ignore reconhecidos pelo caminho', () => {
 for (const path of ['.gitignore', 'sub/.gitignore', '.dockerignore', 'web/.npmignore', '.git/info/exclude']) assert.ok(isIgnorePath(path), path);
 for (const path of ['gitignore', 'README.md', 'app/ignore.php', '.gitignore.bak']) assert.ok(!isIgnorePath(path), path);
});

test('completion: segmentos do projeto, diretórios primeiro, e padrões comuns no início', async () => {
 const root = (await labels(''))!;
 assert.deepEqual(root.slice(0, 3), ['app/', 'storage/', 'web/']);
 assert.ok(root.includes('composer.json') && !root.includes('.gitignore'), 'o próprio arquivo não é sugerido');
 assert.ok(root.includes('vendor/') && root.includes('.env') && root.includes('*.log'));
 assert.deepEqual(await labels('app/'), ['app/Models/', 'app/helpers.php'], 'só o próximo segmento');
 assert.deepEqual(await labels('storage/lo'), ['storage/logs/']);
 assert.ok((await labels('/'))!.includes('/app/') && (await labels('/'))!.includes('/vendor/'), 'âncora / preservada');
 assert.ok((await labels('!'))!.includes('!.env.example') && (await labels('!'))!.includes('!app/'), 'negação preservada');
 assert.ok((await labels('  st'))!.includes('storage/'));
 const result = await host.completeCode('.gitignore', 'x\n  st', 6);
 assert.equal(result!.items[0].textEdit.range.start.character, 2, 'substitui a partir do padrão, sem a indentação');
});

test('completion: entradas existentes, comentários, curingas e arquivos em subdiretório', async () => {
 const listed = (await labels('vendor/\n/app\n.env\n\n'))!;
 assert.ok(!listed.includes('vendor/') && !listed.includes('app/') && !listed.includes('.env'), 'não repete entradas');
 assert.ok((await labels('app/\n', '.gitignore', 3))!.includes('app/'), 'a linha em edição não conta como presente');
 assert.deepEqual(await labels('# app'), []);
 assert.deepEqual(await labels('**/'), [], 'curinga em diretório não lista caminhos');
 assert.deepEqual((await labels('', 'web/.dockerignore'))!.slice(0, 3), ['assets/', 'index.php', 'vendor/'], 'relativo ao diretório do arquivo');
 assert.ok((await labels('', '.git/info/exclude'))!.includes('app/'), 'exclude é relativo à raiz');
 assert.equal(await host.completeCode('README.md', 'app/', 4), null, 'outros arquivos não são atendidos');
});
