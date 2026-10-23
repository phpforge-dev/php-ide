import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// Fluxos do recorte 09 numa cópia descartável da fixture: completion de membros e
// Ctrl/Cmd+clique (F12) em strings.
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-intelligence-ui-')));
const project = join(root, 'php-intelligence');
await cp(resolve('fixtures/php-intelligence'), project, { recursive: true });
await writeFile(join(project, 'probe-strings.php'), `<?php

namespace Fixture;

require_once __DIR__ . '/src/User.php';
$class = 'Fixture\\User';
$method = [User::class, 'label'];
`);
const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: project } });
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(15000);
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
 const go = async (where: string) => { await editor.focus(); await page.keyboard.press('Control+g'); await page.locator('.quick-input-widget input').fill(':' + where); await page.locator('.quick-input-widget input').press('Enter'); await expect(page.locator('.quick-input-widget')).toBeHidden(); };
 await page.locator('#tree').getByRole('button', { name: 'probe.php', exact: true }).click();
 await go('8:8');
 for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowRight');
 await page.keyboard.press('Backspace');
 await page.keyboard.press('Control+Space');
 const suggest = page.locator('.suggest-widget');
 await expect(suggest.locator('.monaco-list-row')).toHaveCount(2, { timeout: 120000 });
 await expect(suggest).toContainText('label'); await expect(suggest).toContainText('string');
 await expect(suggest).toContainText('id'); await expect(suggest).toContainText('int');
 await expect(suggest).not.toContainText('secret');
 await mkdir('.artifacts', { recursive: true });
 await page.screenshot({ path: '.artifacts/completion-members.png' });
 await page.keyboard.press('Enter');
 await expect(page.locator('#cursor-position')).toContainText('Ln 8, Col 12');
 await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+z');
 await expect(page.locator('#tabs .active')).not.toContainText('•');

 await page.locator('#tree').getByRole('button', { name: 'probe-strings.php', exact: true }).click();
 await go('6:20'); await page.keyboard.press('F12');
 await expect(page.locator('#tabs .active')).toContainText('User.php', { timeout: 60000 });
 await expect(page.locator('#cursor-position')).toContainText('Ln 5, Col 7');
 await page.locator('#tabs button[title="probe-strings.php"]').click();
 await go('5:31'); await page.keyboard.press('F12');
 await expect(page.locator('#tabs .active')).toContainText('User.php');
 await expect(page.locator('#cursor-position')).toContainText('Ln 5, Col 7');
 await page.locator('#tabs button[title="probe-strings.php"]').click();
 await go('7:27'); await page.keyboard.press('F12');
 await expect(page.locator('#tabs .active')).toContainText('User.php');
 await expect(page.locator('#cursor-position')).toContainText('Ln 9');
 console.log(JSON.stringify({ completion: '$user-> → id(): int, label(): string; Enter → Col 12', strings: 'FQN → 5:7; __DIR__ mantém 5:7; callable → linha 9', rendererErrors: errors }));
 if (errors.length) throw new Error(errors.join('\n'));
} catch (error) { console.error(error); throw error; } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
