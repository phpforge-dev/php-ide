import { _electron as electron, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Recorte 12: mesmo repositório usado na observação do PhpStorm (Resolve Conflicts / Merge Revisions).
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-merge-ui-')));
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
git('init', '-b', 'main'); git('config', 'user.name', 'UI Fixture'); git('config', 'user.email', 'ui@example.invalid'); git('config', 'commit.gpgsign', 'false'); git('config', 'core.hooksPath', '/dev/null');
const base = "<?php\n// cabeçalho\nfunction a() { return 1; }\n\nfunction b() { return 'b'; }\n\nfunction c() { return 'c'; }\n\nfunction d() { return 'd'; }\n";
await writeFile(join(root, 'sample.php'), base); await writeFile(join(root, 'config.txt'), 'mode=base\n'); git('add', '.'); git('commit', '-m', 'base');
git('checkout', '-b', 'feature');
await writeFile(join(root, 'sample.php'), base.replace("'b'", "'b-feature'").replace("'c'", "'c-feature'").replace("'d'", "'d2'")); await writeFile(join(root, 'config.txt'), 'mode=feature\n'); git('commit', '-am', 'feature');
git('checkout', 'main');
await writeFile(join(root, 'sample.php'), base.replace('return 1;', 'return 10;').replace("'c'", "'c-main'").replace("'d'", "'d2'")); await writeFile(join(root, 'config.txt'), 'mode=main\n'); git('commit', '-am', 'main');
try { git('merge', 'feature'); } catch { /* conflito esperado */ }

const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: root } });
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.getByRole('button', { name: 'Git', exact: true }).click();
 await expect(page.locator('#git-changes')).toContainText('Conflitos · clique para resolver (2)');
 await page.getByRole('button', { name: 'Resolver conflitos…', exact: true }).click();
 const list = page.locator('.merge-list');
 await expect(list).toContainText('Mesclando branch feature em main');
 await expect(list.locator('thead')).toContainText('Minha (main)'); await expect(list.locator('thead')).toContainText('Deles (feature)');
 await expect(list.locator('tbody tr')).toHaveCount(2);
 await list.locator('tr[data-path="config.txt"]').click();
 await list.getByRole('button', { name: 'Aceitar a deles', exact: true }).click();
 await expect(list.locator('tbody tr')).toHaveCount(1);
 if (await readFile(join(root, 'config.txt'), 'utf8') !== 'mode=feature\n') throw new Error('Aceitar a deles não gravou a versão de feature');
 await list.getByRole('button', { name: 'Mesclar…', exact: true }).click();

 const window = page.locator('.merge-window');
 await expect(window).toBeVisible();
 await expect(window.locator('.merge-left-title')).toHaveText('Alterações de main'); await expect(window.locator('.merge-right-title')).toHaveText('Alterações de feature');
 await expect(window.locator('.merge-summary')).toHaveText('3 alterações. 1 conflito.');
 await mkdir('.artifacts', { recursive: true }); await page.screenshot({ path: '.artifacts/merge-initial.png' });
 await window.getByRole('button', { name: 'Todas', exact: true }).click();
 await expect(window.locator('.merge-summary')).toHaveText('Nenhuma alteração. 1 conflito.');
 await window.getByRole('button', { name: 'Resolver conflitos simples', exact: true }).click();
 await expect(window.locator('.error')).toContainText('Nenhum conflito simples');
 // Aplicar com conflito pendente pede confirmação; continuar o merge mantém a janela.
 await window.locator('[data-act="apply"]').click();
 await expect(page.locator('.merge-confirm')).toContainText('Há 1 conflito não processado');
 await page.locator('.merge-confirm .stay').click();
 await expect(window).toBeVisible();
 await window.locator('.merge-left .merge-glyph-apply-left').first().click();
 await expect(window.locator('.merge-summary')).toHaveText('Todas as alterações foram processadas.');
 await page.screenshot({ path: '.artifacts/merge-resolved.png' });
 await window.locator('[data-act="apply"]').click();
 await expect(window).toHaveCount(0);
 await expect(list).toHaveCount(0);
 await expect(page.locator('#git-changes')).toContainText('Conflitos · clique para resolver (0)');
 const merged = await readFile(join(root, 'sample.php'), 'utf8');
 const expected = "<?php\n// cabeçalho\nfunction a() { return 10; }\n\nfunction b() { return 'b-feature'; }\n\nfunction c() { return 'c-main'; }\n\nfunction d() { return 'd2'; }\n";
 if (merged !== expected) throw new Error('Resultado inesperado:\n' + merged);
 if (git('status', '--porcelain') !== 'M  config.txt\nM  sample.php\n') throw new Error('Index inesperado: ' + git('status', '--porcelain'));
 console.log(JSON.stringify({ list: 'Mesclando branch feature em main; Aceitar a deles', merge: '3 alterações. 1 conflito. → Todas → » → Aplicar', rendererErrors: errors }));
 if (errors.length) throw new Error(errors.join('\n'));
} catch (error) { console.error(error); throw error; } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
