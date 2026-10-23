import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath, cp, readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Workspace } from '../../electron/workspace';
import { PhpLanguage } from '../../electron/php-language';
import type { LanguageMethod } from '../../shared/contracts';

// Mesmos pontos observados no PhpStorm 2026.1.4 (recorte 09); o resultado aqui
// verifica a nossa IDE e não constitui comparação automática com a referência.
const strings = `<?php

namespace Fixture;

require_once __DIR__ . '/src/User.php'; // STR-FILE-01: caret inside path
$config = 'src/HasId.php'; // STR-FILE-02: relative path in plain string
$class = 'Fixture\\User'; // STR-CLASS-01: FQN in string
$method = [User::class, 'label']; // STR-CALLABLE-01: method name in callable array
$missing = 'src/Missing.php'; // STR-NEG-01: nonexistent path
`;

test('completion e Ctrl+clique em strings conforme o recorte 09', { timeout: 180000 }, async () => {
 const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-intelligence-')));
 const project = join(root, 'project');
 await cp(resolve('fixtures/php-intelligence'), project, { recursive: true });
 await writeFile(join(project, 'probe-strings.php'), strings);
 await mkdir(join(project, 'app'));
 await writeFile(join(project, 'app/Consumer.php'), '<?php\n\nnamespace App;\n\n$x = new Unr');
 const workspace = new Workspace(project);
 const language = new PhpLanguage(workspace, resolve('.tools'), join(root, 'cache'), () => {});
 let version = 1;
 const at = (text: string, needle: string, delta = 0) => { const offset = text.indexOf(needle) + delta; assert.ok(offset >= delta); const lines = text.slice(0, offset).split('\n'); return { line: lines.length - 1, character: lines.at(-1)!.length }; };
 const call = (method: LanguageMethod, path: string, text: string, position: { line: number; character: number }) => language.request({ method, path, text, version: version++, position }) as Promise<any>;
 const target = (value: any[]) => value.map(v => ({ file: basename(fileURLToPath(v.uri)), line: v.range.start.line, character: v.range.start.character, ...(v.preserveView ? { preserveView: true } : {}) }));
 try {
  await language.start();
  const probe = (await readFile(join(project, 'probe.php'), 'utf8')).replace('$user->label();', '$user->;');
  const members = await call('textDocument/completion', 'probe.php', probe, at(probe, '$user->;', 7));
  const byLabel = new Map(members.items.map((i: any) => [i.label, i]));
  assert.deepEqual([...byLabel.keys()].sort(), ['id', 'label'], 'COMP-OBS-01: só membros públicos; secret() fica fora');
  assert.deepEqual((byLabel.get('label') as any).labelDetails, { detail: '()', description: 'string' });
  assert.deepEqual((byLabel.get('id') as any).labelDetails, { detail: '()', description: 'int' });
  assert.equal((byLabel.get('label') as any).insertText, 'label()', 'COMP-OBS-02: sem parâmetros, cursor após ()');

  const classes = probe + '\n$x = new Un';
  const list = await call('textDocument/completion', 'probe.php', classes, at(classes, 'new Un', 6));
  const unrelated = list.items.find((i: any) => i.detail === 'Fixture\\Unrelated');
  assert.deepEqual({ label: unrelated.label, tail: unrelated.labelDetails.detail, insert: unrelated.insertText, edits: unrelated.additionalTextEdits }, { label: 'Unrelated', tail: ' [Fixture]', insert: 'Unrelated', edits: undefined });
  const builtin = list.items.find((i: any) => i.label === 'UnexpectedValueException' && i.detail === 'UnexpectedValueException');
  assert.ok(builtin, 'COMP-OBS-03: classes nativas por stubs também aparecem');
  assert.equal(builtin.insertText, '\\UnexpectedValueException');
  assert.ok(list.items.indexOf(unrelated) < list.items.indexOf(builtin), 'REQ: classes do projeto antes de stubs');
  assert.equal(list.isIncomplete, true);
  const alias = (await call('textDocument/completion', 'probe.php', probe + '\n$x = new Us', at(probe + '\n$x = new Us', 'new Us', 6))).items.find((i: any) => i.detail === 'Fixture\\User');
  assert.equal(alias.insertText, 'Person', 'REQ: usa o alias já importado');

  const consumer = await readFile(join(project, 'app/Consumer.php'), 'utf8');
  const imported = (await call('textDocument/completion', 'app/Consumer.php', consumer, at(consumer, 'new Unr', 7))).items.find((i: any) => i.detail === 'Fixture\\Unrelated');
  assert.equal(imported.insertText, 'Unrelated');
  assert.deepEqual(imported.additionalTextEdits, [{ range: { start: { line: 2, character: 14 }, end: { line: 2, character: 14 } }, newText: '\n\nuse Fixture\\Unrelated;' }]);

  const definition = async (needle: string, delta: number) => target(await call('textDocument/definition', 'probe-strings.php', strings, at(strings, needle, delta)));
  assert.deepEqual(await definition("'/src/User.php'", 6), [{ file: 'User.php', line: 0, character: 0, preserveView: true }], 'STR-FILE-01');
  assert.deepEqual(await definition("'src/HasId.php'", 6), [], 'STR-FILE-02: caminho relativo simples não navega');
  assert.deepEqual(await definition("'Fixture\\User'", 10), [{ file: 'User.php', line: 4, character: 6 }], 'STR-CLASS-01: nome da classe');
  assert.deepEqual((await definition("'label'", 3)).map(r => [r.file, r.line]), [['User.php', 8]], 'STR-CALLABLE-01');
  assert.deepEqual(await definition("'src/Missing.php'", 6), [], 'STR-NEG-01');
  assert.deepEqual(target(await call('textDocument/definition', 'probe.php', probe, at(probe, "'label'", 3))), [], 'NEGATIVE-02: string solta não navega');

  await writeFile(join(project, 'src/Fresh.php'), '<?php\nnamespace Fixture;\nfinal class Fresh {}\n');
  language.changed(join(project, 'src/Fresh.php'), 1);
  const fresh = probe + '\n$x = new Fre';
  let found;
  for (let i = 0; i < 20 && !found; i++) {
   found = (await call('textDocument/completion', 'probe.php', fresh, at(fresh, 'new Fre', 7))).items.find((i: any) => i.detail === 'Fixture\\Fresh');
   if (!found) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(found, 'IDX-ADD-09: classe nova entra no índice sem reiniciar');
  await rm(join(project, 'src/Fresh.php'));
  language.changed(join(project, 'src/Fresh.php'), 3);
  assert.equal((await call('textDocument/completion', 'probe.php', fresh, at(fresh, 'new Fre', 7))).items.find((i: any) => i.detail === 'Fixture\\Fresh'), undefined, 'IDX-DELETE-09');
 } finally { await language.dispose(); await rm(root, { recursive: true, force: true }); }
});
