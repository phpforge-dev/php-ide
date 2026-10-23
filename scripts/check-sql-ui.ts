import { _electron as electron, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Recorte 13: console SQL e SQL em strings PHP contra um PostgreSQL descartável criado aqui.
const exec = promisify(execFile);
const name = `php-ide-sql-ui-${randomUUID()}`;
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-sql-ui-')));
await mkdir(join(root, 'app'));
await writeFile(join(root, 'app/Repo.php'), "<?php\n\n$pdo->query('SELECT  FROM users');\n$pdo->query('SELECT * FROM orders WHERE user_id = 1');\n");
await exec('docker', ['run', '--rm', '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=fixture', '-e', 'POSTGRES_DB=fixture', 'postgres:16']);
try {
 const port = (await exec('docker', ['port', name, '5432'])).stdout.trim().split(':').at(-1)!;
 for (let i = 0; i < 60; i++) { try { await exec('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'fixture']); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
 await new Promise(r => setTimeout(r, 1500));
 await exec('docker', ['exec', name, 'psql', '-U', 'postgres', '-d', 'fixture', '-c', "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, email VARCHAR(120)); CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), total NUMERIC(10,2) NOT NULL); INSERT INTO users (name, email) VALUES ('Ana', 'ana@example.invalid'), ('Bruno', 'bruno@example.invalid');"]);
 const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: root } });
 try {
  const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
  const suggest = page.locator('.suggest-widget');
  const invokeSuggest = async () => { await page.keyboard.press('Control+Space'); try { await expect(page.locator('.suggest-widget.visible')).toHaveCount(1, { timeout: 3000 }); } catch { await page.keyboard.press('Control+Space'); } };
  const closeSuggest = async () => { await page.keyboard.press('Escape'); await expect(page.locator('.suggest-widget.visible')).toHaveCount(0); };
  const go = async (where: string) => { await editor.focus(); await page.keyboard.press('Control+g'); await page.locator('.quick-input-widget input').fill(':' + where); await page.locator('.quick-input-widget input').press('Enter'); await expect(page.locator('.quick-input-widget')).toBeHidden(); const [l, c] = where.split(':'); await expect(page.locator('#cursor-position')).toContainText(`Ln ${l}, Col ${c}`); await expect(editor).toBeFocused(); };

  await page.getByRole('button', { name: 'Bancos', exact: true }).click();
  const form = page.locator('#db');
  await form.locator('[name="driver"]').selectOption('postgres');
  await form.locator('[name="host"]').fill('127.0.0.1'); await form.locator('[name="port"]').fill(port);
  await form.locator('[name="database"]').fill('fixture'); await form.locator('[name="user"]').fill('postgres'); await form.locator('[name="password"]').fill('fixture');
  await page.locator('#db-connect').click();
  await expect(page.locator('.db-source')).toContainText('fixture@127.0.0.1');
  await page.locator('.db-console').click();
  await expect(page.locator('#sql-toolbar')).toBeVisible(); await expect(page.locator('#sql-toolbar')).toContainText('Tx: Auto');
  await expect(page.locator('#sql-schema')).toHaveValue('public');

  await editor.focus(); await page.keyboard.type('SELECT  FROM users');
  await go('1:8'); await invokeSuggest();
  await expect(suggest).toContainText('email'); await expect(suggest).toContainText('(fixture.public.users)'); await expect(suggest).toContainText('varchar');
  await page.screenshot({ path: '.artifacts/sql-console-completion.png' });
  await closeSuggest();
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('SELECT id, name FROM users ORDER BY id;\nSELECT * FROM missing_table;');
  await go('1:5'); await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#sql-results')).toBeVisible();
  await expect(page.locator('#sql-grid')).toContainText('Bruno'); await expect(page.locator('#sql-summary')).toContainText('2 linhas');
  await page.screenshot({ path: '.artifacts/sql-console-results.png' });
  await go('2:5'); await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.sql-error')).toContainText('missing_table');

  await page.locator('#tree summary').filter({ hasText: /^app$/ }).click();
  await page.locator('#tree').getByRole('button', { name: 'Repo.php', exact: true }).click();
  await expect(page.locator('#sql-toolbar')).toBeHidden();
  await go('3:21'); await invokeSuggest();
  await expect(suggest).toContainText('email'); await expect(suggest).toContainText('(fixture.public.users)');
  await page.screenshot({ path: '.artifacts/sql-php-string.png' });
  await closeSuggest();
  await go('4:29'); await page.keyboard.press('F12');
  await expect(page.locator('#tabs .active')).toContainText('orders.sql');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('create table orders');
  await expect(page.locator('#cursor-position')).toContainText('Ln 2, Col 14');
  await page.keyboard.type('x'); await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('xcreate');
  await page.screenshot({ path: '.artifacts/sql-ddl.png' });
  console.log(JSON.stringify({ console: 'conexão, completion, execução ⌘⏎, erro', php: 'completion em string e F12 para DDL somente leitura', rendererErrors: errors }));
  if (errors.length) throw new Error(errors.join('\n'));
 } catch (error) { console.error(error); throw error; } finally { await app.close(); }
} finally { await exec('docker', ['rm', '-f', name]).catch(() => {}); await rm(root, { recursive: true, force: true }); }
