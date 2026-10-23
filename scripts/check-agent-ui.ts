import { _electron as electron, expect } from '@playwright/test';
import { access, cp, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// Recorte 14: painel do agente com o agente ACP falso (sem inferência) numa cópia descartável.
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-agent-ui-')));
await cp(resolve('fixtures/php-intelligence'), root, { recursive: true });
const original = await readFile(join(root, 'src/User.php'), 'utf8');
const agent = JSON.stringify({ id: 'fake', name: 'Agente falso', command: process.execPath, args: [resolve('scripts/fake-acp-agent.mjs')] });
const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: root, PHP_IDE_ACP_AGENT: agent } });
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 const exists = (path: string) => access(join(root, path)).then(() => true, () => false);
 const panel = page.locator('#agent');
 await page.getByRole('button', { name: 'Agente', exact: true }).click();
 await expect(panel.locator('#agent-select option[value="claude"]')).toHaveCount(1);
 await panel.locator('#agent-select').selectOption('fake');
 await panel.getByRole('button', { name: 'Iniciar', exact: true }).click();
 await expect(panel.locator('#agent-detail')).toHaveText('Agente falso conectado · ACP v1');
 await expect(panel.locator('#agent-mode option')).toHaveText(['Padrão', 'Planejar']);

 await page.locator('#tree').getByRole('button', { name: 'probe.php', exact: true }).click();
 await panel.locator('#agent-prompt').fill('explique o projeto'); await panel.locator('#agent-prompt').press('Enter');
 await expect(panel.locator('#agent-transcript')).toContainText('Contexto recebido: probe.php.'); await expect(panel.locator('.agent-message').last()).toHaveText('Pronto.');
 await expect(panel.locator('.agent-note').first()).toContainText('Contexto: probe.php');
 await expect(panel.locator('.agent-tool[data-status="completed"]').first()).toContainText('Ler src/User.php');
 await expect(panel.locator('.agent-plan').last()).toContainText('✓ Responder');

 await panel.locator('#agent-prompt').fill('editar o usuário'); await panel.locator('#agent-prompt').press('Enter');
 const permission = panel.locator('.agent-permission').last();
 await expect(permission).toContainText('Permitir: Editar src/User.php?');
 await permission.getByRole('button', { name: 'Permitir', exact: true }).click();
 await expect(panel.locator('#agent-transcript')).toContainText('Editei User.php e criei Created.php');
 await expect(panel.locator('#agent-change-count')).toHaveText('2');
 if (await readFile(join(root, 'src/User.php'), 'utf8') !== original || await exists('src/Created.php')) throw new Error('Alteração do agente chegou ao disco antes da revisão');
 await panel.locator('.agent-change-file', { hasText: 'src/User.php' }).click();
 await expect(page.locator('.agent-diff')).toBeVisible(); await expect(page.locator('.agent-diff .editor.modified .view-lines')).toContainText('Edited by agent');
 await page.screenshot({ path: '.artifacts/agent-diff.png' });
 await page.locator('.agent-diff .close').click();
 await panel.locator('#agent-change-list li[data-path="src/Created.php"]').getByRole('button', { name: 'Manter', exact: true }).click();
 await expect(panel.locator('#agent-change-count')).toHaveText('1');
 if (!await exists('src/Created.php')) throw new Error('Manter não gravou o arquivo novo');
 await panel.getByRole('button', { name: 'Descartar tudo', exact: true }).click();
 await expect(panel.locator('#agent-changes')).toBeHidden();
 if (await readFile(join(root, 'src/User.php'), 'utf8') !== original) throw new Error('Descartar alterou o disco');

 await page.locator('#tree summary').filter({ hasText: /^src$/ }).click();
 await page.locator('#tree').getByRole('button', { name: 'User.php', exact: true }).click();
 await panel.locator('#agent-prompt').fill('editar de novo'); await panel.locator('#agent-prompt').press('Enter');
 await panel.locator('.agent-permission').last().getByRole('button', { name: 'Permitir', exact: true }).click();
 await expect(panel.locator('#agent-change-count')).toHaveText('1');
 await page.screenshot({ path: '.artifacts/agent-changes.png' });
 await panel.getByRole('button', { name: 'Manter tudo', exact: true }).click();
 await expect(panel.locator('#agent-changes')).toBeHidden();
 await expect(page.locator('.monaco-editor .view-lines')).toContainText('Edited by agent');
 if (!(await readFile(join(root, 'src/User.php'), 'utf8')).includes('Edited by agent')) throw new Error('Manter tudo não gravou');

 await panel.locator('#agent-prompt').fill('tarefa longa'); await panel.locator('#agent-prompt').press('Enter');
 await expect(panel.getByRole('button', { name: 'Interromper', exact: true })).toBeEnabled();
 await panel.getByRole('button', { name: 'Interromper', exact: true }).click();
 await expect(panel.locator('.agent-note').last()).toHaveText('Interrompido.');
 console.log(JSON.stringify({ agent: 'sessão ACP, contexto, permissão, diff, manter/descartar, recarga do editor, interromper', rendererErrors: errors }));
 if (errors.length) throw new Error(errors.join('\n'));
} catch (error) { console.error(error); throw error; } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
