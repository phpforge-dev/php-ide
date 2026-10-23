import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, writeFile, readFile, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitService } from '../electron/git';

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-git-test-')));
  const command = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  command('init', '-b', 'main'); command('config', 'user.name', 'Fixture'); command('config', 'user.email', 'fixture@example.invalid');
  command('config', 'commit.gpgsign', 'false'); command('config', 'core.hooksPath', '/dev/null');
  return { root, command, git: new GitService(root), file: (path: string, text: string) => writeFile(join(root, path), text), cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('Git: review index vs disk, preserve unstaged changes, commit selected content, log', async () => {
  const f = await fixture();
  try {
    await f.file('file with spaces.php', 'original\n'); f.command('add', '.'); f.command('commit', '-m', 'Base');
    await f.file('file with spaces.php', 'prepared\n'); f.command('add', '.'); await f.file('file with spaces.php', 'local\n');
    await f.file('-new.txt', 'new\n');
    const state = await f.git.status(); assert.equal(state.branch, 'main');
    assert.deepEqual(state.changes.find(c => c.path === 'file with spaces.php'), { path: 'file with spaces.php', index: 'M', worktree: 'M' });
    const prepared = await f.git.diff('file with spaces.php', true); assert.equal(prepared.before, 'original\n'); assert.equal(prepared.after, 'prepared\n');
    const local = await f.git.diff('file with spaces.php', false); assert.equal(local.before, 'prepared\n'); assert.equal(local.after, 'local\n');
    await assert.rejects(f.git.commit('', state.indexToken), /mensagem/);
    const head = await f.git.commit('Selected staged content', state.indexToken);
    assert.equal(f.command('show', `${head}:file with spaces.php`), 'prepared\n');
    assert.equal(await readFile(join(f.root, 'file with spaces.php'), 'utf8'), 'local\n');
    assert.equal(f.command('ls-files', '--', '-new.txt'), '');
    assert.equal((await f.git.log())[0].subject, 'Selected staged content');
    const newDiff = await f.git.diff('-new.txt', false);
    await f.git.stage('-new.txt', false, newDiff.token);
    const stagedDiff = await f.git.diff('-new.txt', true);
    await f.git.stage('-new.txt', true, stagedDiff.token);
    assert.equal(f.command('ls-files', '--', '-new.txt'), '');
    assert.equal(await readFile(join(f.root, '-new.txt'), 'utf8'), 'new\n');
  } finally { await f.cleanup(); }
});

test('Git: unborn repo, stale review rejection, external index change, deletion and rename', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.git.log(), []);
    await f.file('a.txt', 'one\n'); let diff = await f.git.diff('a.txt', false);
    await f.file('a.txt', 'two\n'); await assert.rejects(f.git.stage('a.txt', false, diff.token), /mudou/);
    diff = await f.git.diff('a.txt', false); await f.git.stage('a.txt', false, diff.token);
    diff = await f.git.diff('a.txt', true); await f.git.stage('a.txt', true, diff.token);
    assert.equal(await readFile(join(f.root, 'a.txt'), 'utf8'), 'two\n');
    diff = await f.git.diff('a.txt', false); await f.git.stage('a.txt', false, diff.token);
    const before = await f.git.status(); await f.file('b.txt', 'b\n'); f.command('add', '--', 'b.txt');
    await assert.rejects(f.git.commit('stale', before.indexToken), /index mudou/);
    await f.git.commit('Initial', (await f.git.status()).indexToken);
    f.command('mv', 'a.txt', 'renamed.txt');
    diff = await f.git.diff('renamed.txt', true); assert.equal(diff.before, 'two\n'); assert.equal(diff.after, 'two\n');
    await f.git.stage('renamed.txt', true, diff.token); assert.equal(f.command('diff', '--cached'), '');
    await rm(join(f.root, 'b.txt'));
    diff = await f.git.diff('b.txt', false); assert.equal(diff.after, ''); assert.equal(diff.before, 'b\n');
    await f.git.stage('b.txt', false, diff.token);
    assert.equal((await f.git.diff('b.txt', true)).after, '');
  } finally { await f.cleanup(); }
});

test('Git: rejects escape, symlink, binary, conflicts, subfolder and no repository', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.git.diff('../outside', false), /Caminho/);
    await f.file('binary', 'a\0b'); await assert.rejects(f.git.diff('binary', false), /UTF-8/);
    await symlink('/etc/hosts', join(f.root, 'link')); await assert.rejects(f.git.diff('link', false), /symlink/);
    await mkdir(join(f.root, 'nested')); await assert.rejects(new GitService(join(f.root, 'nested')).status(), /subpasta/);
    await f.file('conflict.txt', 'base\n'); f.command('add', '--', 'conflict.txt'); f.command('commit', '-m', 'Base');
    f.command('checkout', '-b', 'other'); await f.file('conflict.txt', 'other\n'); f.command('commit', '-am', 'Other');
    f.command('checkout', 'main'); await f.file('conflict.txt', 'main\n'); f.command('commit', '-am', 'Main');
    assert.throws(() => f.command('merge', 'other'));
    await assert.rejects(f.git.diff('conflict.txt', false), /conflito/);
    await assert.rejects(f.git.commit('Conflict', (await f.git.status()).indexToken), /conflitos/);
    await rm(join(f.root, '.git'), { recursive: true }); await assert.rejects(f.git.status(), /repositório/);
  } finally { await f.cleanup(); }
});
