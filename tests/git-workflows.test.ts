import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitService } from '../electron/git';
import type { GitOperation } from '../shared/contracts';

async function fixture() {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-git-flows-')));
  const root = join(temp, 'project'); await mkdir(root);
  const cmd = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  cmd('init', '-b', 'main'); cmd('config', 'user.name', 'Fixture'); cmd('config', 'user.email', 'fixture@example.invalid'); cmd('config', 'commit.gpgsign', 'false'); cmd('config', 'core.hooksPath', '/dev/null');
  const git = new GitService(root);
  const file = (name: string, text: string) => writeFile(join(root, name), text);
  await file('a.txt', 'one\ntwo\nthree\nfour\nfive\n'); cmd('add', '.'); cmd('commit', '-m', 'Initial');
  const op = async (kind: GitOperation['kind'], target = '') => git.operation({ kind, target, expectedHead: (await git.status()).head });
  return { temp, root, cmd, git, file, op, cleanup: () => rm(temp, { recursive: true, force: true }) };
}

test('Git workflow: selected hunks, reverse hunk and historical rename/root/diff', async () => {
  const f = await fixture();
  try {
    const initial = (await f.git.status()).head!;
    assert.equal((await f.git.historyDiff(initial, 'a.txt')).before, '');
    await f.file('a.txt', 'ONE\ntwo\nthree\nfour\nFIVE\n');
    let data = await f.git.hunks('a.txt', false); assert.equal(data.hunks.length, 2);
    await f.git.applyHunk('a.txt', false, data.token, 1);
    assert.equal(f.cmd('show', ':a.txt'), 'one\ntwo\nthree\nfour\nFIVE\n');
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'ONE\ntwo\nthree\nfour\nFIVE\n');
    await assert.rejects(f.git.applyHunk('a.txt', false, data.token, 0), /mudou/);
    data = await f.git.hunks('a.txt', true); await f.git.applyHunk('a.txt', true, data.token, 0);
    assert.equal(f.cmd('diff', '--cached'), '');
    f.cmd('add', '.'); f.cmd('commit', '-m', 'Two changes'); f.cmd('mv', 'a.txt', 'renamed name.txt'); f.cmd('commit', '-m', 'Rename');
    const head = (await f.git.status()).head!;
    const history = await f.git.history(head); assert.equal(history.files[0].oldPath, 'a.txt');
    const diff = await f.git.historyDiff(head, 'renamed name.txt'); assert.equal(diff.before, diff.after);
    await assert.rejects(f.git.historyDiff(head, '../secret'), /não pertence/);
  } finally { await f.cleanup(); }
});

test('Git workflow: branches, dirty refusal, stash preservation, merge conflict resolver and abort', async () => {
  const f = await fixture();
  try {
    await f.op('create-branch', 'feature/test'); assert.equal((await f.git.status()).branch, 'feature/test');
    await f.file('new.txt', 'unsaved on disk\n'); await assert.rejects(f.op('switch', 'main'), /stash/);
    await f.op('stash', 'Work in progress'); assert.equal((await f.git.tools()).stashes.length, 1);
    assert.deepEqual((await f.git.status()).changes, [], 'stash should leave a clean working tree');
    await f.op('stash-apply', 'stash@{0}'); assert.equal(await readFile(join(f.root, 'new.txt'), 'utf8'), 'unsaved on disk\n');
    assert.equal((await f.git.tools()).stashes.length, 1); await rm(join(f.root, 'new.txt'));
    await f.file('a.txt', 'feature\n'); f.cmd('commit', '-am', 'Feature'); await f.op('switch', 'main');
    await f.file('a.txt', 'main\n'); f.cmd('commit', '-am', 'Main');
    await assert.rejects(f.op('merge', 'feature/test'));
    const conflict = await f.git.conflict('a.txt'); assert.equal(conflict.ours, 'main\n'); assert.equal(conflict.theirs, 'feature\n');
    await assert.rejects(f.git.resolve('a.txt', conflict.result, conflict.token), /marcadores/);
    await f.git.resolve('a.txt', conflict.ours, conflict.token);
    assert.equal(f.cmd('ls-files', '-u'), ''); assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'main\n');
    const head = await f.git.commit('Resolved', (await f.git.status()).indexToken);
    assert.equal((await f.git.history(head)).parents.length, 2);
    await f.op('delete-branch', 'feature/test'); assert.ok(!(await f.git.branches()).some(b => b.name === 'feature/test'));
    await assert.rejects(f.op('create-branch', '--bad'), /inválido/);
    await assert.rejects(f.git.operation({ kind: 'switch', target: 'main', expectedHead: '0'.repeat(40) }), /HEAD mudou/);
  } finally { await f.cleanup(); }
});

test('Git workflow: local remote fetch/push/fast-forward pull and push rejection', async () => {
  const f = await fixture();
  try {
    const bare = join(f.temp, 'remote.git'); f.cmd('init', '--bare', bare);
    f.cmd('remote', 'add', 'origin', bare); f.cmd('push', '-u', 'origin', 'main');
    await f.file('a.txt', 'published\n'); f.cmd('commit', '-am', 'Publish'); await f.op('push');
    const peer = join(f.temp, 'peer'); f.cmd('clone', '--branch', 'main', bare, peer);
    const peerCmd = (...args: string[]) => execFileSync('git', ['-C', peer, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    peerCmd('config', 'user.name', 'Peer'); peerCmd('config', 'user.email', 'peer@example.invalid'); peerCmd('config', 'commit.gpgsign', 'false'); peerCmd('config', 'core.hooksPath', '/dev/null');
    await writeFile(join(peer, 'peer.txt'), 'peer\n'); peerCmd('add', '.'); peerCmd('commit', '-m', 'Peer commit'); peerCmd('push');
    await f.op('fetch', 'origin'); assert.ok((await f.git.branches()).some(b => b.tracking.includes('behind')));
    await f.op('pull'); assert.equal(await readFile(join(f.root, 'peer.txt'), 'utf8'), 'peer\n');
    await f.file('local.txt', 'local\n'); f.cmd('add', '.'); f.cmd('commit', '-m', 'Diverge locally');
    await writeFile(join(peer, 'remote.txt'), 'remote\n'); peerCmd('add', '.'); peerCmd('commit', '-m', 'Diverge remotely'); peerCmd('push');
    const head = (await f.git.status()).head;
    await assert.rejects(f.op('push')); await assert.rejects(f.op('pull'));
    assert.equal((await f.git.status()).head, head);
  } finally { await f.cleanup(); }
});

test('Git workflow: cherry-pick, revert, rebase and abort preserve expected trees', async () => {
  const f = await fixture();
  try {
    await f.op('create-branch', 'feature'); await f.file('feature.txt', 'feature\n'); f.cmd('add', '.'); f.cmd('commit', '-m', 'Feature commit');
    const feature = (await f.git.status()).head!; await f.op('switch', 'main'); await f.op('cherry-pick', feature);
    const picked = (await f.git.status()).head!; await f.op('revert', picked); assert.equal(f.cmd('ls-files', 'feature.txt'), '');
    await f.op('switch', 'feature'); await f.op('rebase', 'main'); assert.equal((await f.git.status()).changes.length, 0);
    // Deliberate merge conflict, then abort must restore ours.
    await f.file('a.txt', 'feature\n'); f.cmd('commit', '-am', 'feature edit'); await f.op('switch', 'main');
    await f.file('a.txt', 'main\n'); f.cmd('commit', '-am', 'main edit');
    await assert.rejects(f.op('merge', 'feature')); await f.op('merge-abort'); assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'main\n');
  } finally { await f.cleanup(); }
});

test('Git workflow: rebase conflict labels, abort and continue', async () => {
  const f = await fixture();
  try {
    await f.op('create-branch', 'feature'); await f.file('a.txt', 'feature version\n'); f.cmd('commit', '-am', 'Feature');
    const before = (await f.git.status()).head;
    await f.op('switch', 'main'); await f.file('a.txt', 'main version\n'); f.cmd('commit', '-am', 'Main');
    await f.op('switch', 'feature'); await assert.rejects(f.op('rebase', 'main'));
    let conflict = await f.git.conflict('a.txt');
    assert.equal(conflict.ours, 'main version\n'); assert.equal(conflict.theirs, 'feature version\n');
    await f.op('rebase-abort'); assert.equal((await f.git.status()).head, before);
    await assert.rejects(f.op('rebase', 'main')); conflict = await f.git.conflict('a.txt');
    await f.git.resolve('a.txt', 'combined version\n', conflict.token);
    await f.op('rebase-continue'); assert.equal((await f.git.status()).branch, 'feature');
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'combined version\n');
    assert.equal((await f.git.status()).changes.length, 0);
  } finally { await f.cleanup(); }
});
