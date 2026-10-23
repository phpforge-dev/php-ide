// Only creates a new disposable repository. Never operates on a caller's repository.
import { mkdtemp, realpath, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-git-reference-')));
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
const file = (name, text) => writeFile(join(root, name), text);
git('init', '-b', 'main');
git('config', 'user.name', 'IDE Fixture');
git('config', 'user.email', 'fixture@example.invalid');
git('config', 'commit.gpgsign', 'false');
// Do not inherit a user's hooks in this synthetic repository.
git('config', 'core.hooksPath', '/dev/null');
await file('.gitignore', '.idea/\n');
await file('sample.php', '<?php\nfunction greeting(): string {\n    return "Hello";\n}\n');
await file('remove.txt', 'remove me\n');
git('add', '.');
git('commit', '-m', 'Initial fixture');
git('branch', 'feature/example');
await file('sample.php', '<?php\nfunction greeting(): string {\n    return "Olá";\n}\n');
await unlink(join(root, 'remove.txt'));
await file('new.php', '<?php\necho "New";\n');
await file('staged.txt', 'staged version\n');
git('add', 'staged.txt');
await file('staged.txt', 'local version\n');
const status = git('status', '--porcelain=v1', '-z');
assert.deepEqual(status.split('\0').filter(Boolean).sort(), [
  ' D remove.txt', ' M sample.php', 'AM staged.txt', '?? new.php',
].sort());
assert.equal(git('show', ':staged.txt'), 'staged version\n');
assert.equal(git('branch', '--show-current').trim(), 'main');
console.log(JSON.stringify({ root, status: status.split('\0').filter(Boolean), branch: 'main', remote: null }, null, 2));
