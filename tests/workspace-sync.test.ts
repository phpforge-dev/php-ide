import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFileSync, type SyncedBuffer, type SyncReport, type SyncedFile } from '../src/file-sync-core';

const etag = (text: string) => createHash('sha256').update(text).digest('hex');
function fixture(disk: Map<string, string>) {
  const read = async (path: string): Promise<SyncedFile> => { const text = disk.get(path); if (text === undefined) throw Error('ENOENT'); return { path, uri: 'file:///p/' + encodeURI(path), etag: etag(text), text }; };
  const model = (text: string) => { let value = text; return { getValue: () => value, setValue(v: string) { value = v; } }; };
  const buffers = new Map<string, SyncedBuffer>();
  for (const [path, text] of disk) buffers.set(path, { file: { path, uri: 'file:///p/' + encodeURI(path), etag: etag(text), text }, model: model(text), saved: text });
  const events: SyncReport[] = [];
  return { buffers, events, sync: createFileSync(read, buffers, e => events.push(e), 5) };
}

test('buffer limpo recarrega e buffer editado nunca é sobrescrito', async () => {
  const disk = new Map([['a.php', '<?php 1;'], ['b c.php', '<?php 2;'], ['gone.php', '<?php 3;']]);
  const { buffers, events, sync } = fixture(disk);
  buffers.get('b c.php')!.model.setValue('<?php local;');
  disk.set('a.php', '<?php external;'); disk.set('b c.php', '<?php external;'); disk.delete('gone.php');
  for (const p of ['a.php', 'b c.php', 'gone.php', 'a.php']) sync.changed('/p/' + p);
  await sync.idle();
  assert.equal(buffers.get('a.php')!.model.getValue(), '<?php external;');
  assert.equal(buffers.get('a.php')!.file.etag, etag('<?php external;'));
  assert.equal(buffers.get('b c.php')!.model.getValue(), '<?php local;');
  assert.equal(buffers.get('b c.php')!.file.etag, etag('<?php 2;'), 'etag antigo mantém o salvamento bloqueado');
  assert.deepEqual(events.map(e => e.kind + ':' + e.path).sort(), ['conflict:b c.php', 'deleted:gone.php', 'reloaded:a.php']);
  // Eventos repetidos não repetem avisos; recarregar explicitamente resolve.
  sync.changed('/p/b c.php'); sync.changed('/p/gone.php'); await sync.idle();
  assert.equal(events.length, 3);
  assert.ok(sync.conflicted('b c.php'));
  await sync.reload('b c.php');
  assert.equal(buffers.get('b c.php')!.model.getValue(), '<?php external;');
  assert.ok(!sync.conflicted('b c.php'));
});

test('salvamento próprio e arquivos não abertos não geram aviso', async () => {
  const disk = new Map([['a.php', 'v1']]);
  const { buffers, events, sync } = fixture(disk);
  const b = buffers.get('a.php')!;
  b.model.setValue('v2'); disk.set('a.php', 'v2'); // watcher chega antes da resposta do save
  sync.changed('/p/a.php'); sync.changed('/p/other.php'); await sync.idle();
  assert.deepEqual(events, []);
  assert.equal(b.saved, 'v2');
  assert.equal(b.file.etag, etag('v2'));
});
