import { _electron as electron, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-git-workflows-ui-')));
const command = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
command('init', '-b', 'main'); command('config', 'user.name', 'UI Fixture'); command('config', 'user.email', 'ui@example.invalid'); command('config', 'commit.gpgsign', 'false'); command('config', 'core.hooksPath', '/dev/null');
await writeFile(join(root, 'story.txt'), 'one\ntwo\nthree\nfour\nfive\n'); command('add', '.'); command('commit', '-m', 'Initial');
await writeFile(join(root, 'story.txt'), 'ONE\ntwo\nthree\nfour\nFIVE\n');
const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: root } });
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: 'Git', exact: true }).click();
  await page.locator('[data-path="story.txt"][data-staged="false"]').click();
  await expect(page.locator('#git-review')).toBeVisible();
  await page.getByRole('button', { name: 'Selecionar trechos…' }).click();
  await page.getByRole('button', { name: 'Preparar trecho 2', exact: true }).click();
  await expect(page.locator('.git-hunk-dialog')).toHaveCount(0);
  expect(command('show', ':story.txt')).toBe('one\ntwo\nthree\nfour\nFIVE\n');
  await page.locator('#git-refresh').click();
  await page.locator('[data-path="story.txt"][data-staged="false"]').click();
  await expect(page.locator('#git-review')).toBeVisible();
  await page.getByRole('button', { name: 'Preparar arquivo inteiro', exact: true }).click();
  async function commit(message: string) {
    await page.locator('#git-message').fill(message);
    await page.getByRole('button', { name: 'Revisar commit…', exact: true }).click();
    await page.getByRole('button', { name: 'Criar commit local', exact: true }).click();
    await expect(page.locator('#git-feedback')).toContainText('Commit criado:');
  }
  await commit('Selected changes');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.getByRole('button', { name: 'Selected changes', exact: true }).click();
  await page.locator('#git-log').getByRole('button', { name: 'M story.txt', exact: true }).click();
  await expect(page.locator('#git-diff')).toContainText('FIVE'); await expect(page.locator('#git-stage')).toBeHidden();
  await mkdir('.artifacts', { recursive: true }); await page.screenshot({ path: '.artifacts/git-history.png' });
  await page.getByRole('button', { name: 'Alterações', exact: true }).click();
  async function operation(kind: string, target: string, useText = false, error = false) {
    await page.locator('#git-tools').click();
    await expect(page.locator('#git-operations')).toBeVisible();
    await page.locator('#git-operation-kind').selectOption(kind);
    if (target) { if (useText) await page.locator('#git-operation-text').fill(target); else await page.locator('#git-operation-target').selectOption(target); }
    await page.locator('#git-operation-run').click();
    await expect(page.locator('#git-operation-close')).toBeEnabled();
    if (error) await expect(page.locator('#git-operation-result')).toContainText('CONFLICT');
    else await expect(page.locator('#git-operation-result')).not.toContainText('Error:');
    await page.locator('#git-operation-close').click();
  }
  await operation('create-branch', 'feature/ui', true); await expect(page.locator('#git-branch')).toContainText('feature/ui');
  await operation('switch', 'main'); await expect(page.locator('#git-branch')).toHaveText('⑂ main');
  command('checkout', '-b', 'conflicting'); await writeFile(join(root, 'story.txt'), 'theirs\n'); command('commit', '-am', 'Theirs');
  command('checkout', 'main'); await writeFile(join(root, 'story.txt'), 'ours\n'); command('commit', '-am', 'Ours');
  await page.locator('#git-refresh').click();
  await operation('merge', 'conflicting', false, true);
  await expect(page.locator('#git-changes')).toContainText('Conflitos · clique para resolver (1)');
  await page.locator('#git-changes [data-path="story.txt"]').click();
  await expect(page.locator('.merge-window')).toBeVisible();
  await expect(page.locator('.merge-summary')).toHaveText('Nenhuma alteração. 1 conflito.');
  // Conflito: aplicar a esquerda e depois acrescentar a direita.
  await page.locator('.merge-left .merge-glyph-apply-left').first().click();
  await expect(page.locator('.merge-summary')).toHaveText('Todas as alterações foram processadas.');
  await page.locator('.merge-right .merge-glyph-append').first().click();
  await expect(page.locator('.merge-summary')).toHaveText('Todas as alterações foram processadas.');
  await page.screenshot({ path: '.artifacts/git-conflicts.png' });
  await page.locator('.merge-window [data-act="apply"]').click(); await expect(page.locator('.merge-window')).toHaveCount(0);
  await expect(page.locator('#git-changes')).toContainText('Conflitos · clique para resolver (0)');
  await commit('Resolve both sides');
  expect(command('show', 'HEAD:story.txt')).toBe('ours\ntheirs\n');
  expect(command('show', '-s', '--format=%P', 'HEAD').trim().split(' ')).toHaveLength(2);
  expect(await readFile(join(root, 'story.txt'), 'utf8')).toBe('ours\ntheirs\n');
  expect(errors).toEqual([]);
  console.log('Git workflows UI: partial staging, historical diff, branches, real merge conflict, edited resolution and merge commit passed.');
} finally { await app.close(); await rm(root, { recursive: true, force: true }); }
