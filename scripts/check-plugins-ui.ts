import { _electron as electron, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// Recorte 10: plugins Laravel e .env numa cópia descartável da fixture.
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-plugins-ui-')));
const project = join(root, 'laravel-strings');
await cp(resolve('fixtures/laravel-strings'), project, { recursive: true });
const app = await electron.launch({ args: ['.'], env: { ...process.env, PHP_IDE_PROJECT: project } });
try {
 const page = await app.firstWindow(); page.setDefaultTimeout(15000);
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
 const go = async (where: string) => { await editor.focus(); await page.keyboard.press('Control+g'); await page.locator('.quick-input-widget input').fill(':' + where); await page.locator('.quick-input-widget input').press('Enter'); await expect(page.locator('.quick-input-widget')).toBeHidden();
  // Atalhos logo após fechar o Go to Line podem ser ignorados antes de o editor retomar o foco.
  const [line, column] = where.split(':'); await expect(page.locator('#cursor-position')).toContainText(`Ln ${line}, Col ${column}`); await expect(editor).toBeFocused(); };
 const probe = async () => page.locator('#tabs button[title="app/probe.php"]').click();
 const suggest = page.locator('.suggest-widget');
 // Logo após trocar de arquivo o primeiro Ctrl+Space às vezes não abre o widget; repetir uma vez, como faria o usuário.
 const invokeSuggest = async () => { await page.keyboard.press('Control+Space'); try { await expect(page.locator('.suggest-widget.visible')).toHaveCount(1, { timeout: 3000 }); } catch { await page.keyboard.press('Control+Space'); } };
 // Escape fecha o widget de forma assíncrona; Ctrl+Space antes disso alterna detalhes em vez de abrir a lista.
 const closeSuggest = async () => { await page.keyboard.press('Escape'); await expect(page.locator('.suggest-widget.visible')).toHaveCount(0); };
 await expect(page.locator('#plugins')).toHaveText('Laravel: 12.0 · .env');
 await page.locator('#tree summary').filter({ hasText: /^app$/ }).click();
 await page.locator('#tree').getByRole('button', { name: 'probe.php', exact: true }).click();
 await go('14:8'); await invokeSuggest();
 await expect(suggest.locator('.monaco-list-row')).toHaveCount(3);
 await expect(suggest).toContainText('admin.dashboard'); await expect(suggest).toContainText('users/{id}'); await expect(suggest).toContainText('GET');
 await mkdir('.artifacts', { recursive: true }); await page.screenshot({ path: '.artifacts/plugins-routes.png' });
 await closeSuggest();
 await go('16:9'); await invokeSuggest();
 await expect(suggest).toContainText('services.mail.host'); await expect(suggest).toContainText('localhost');
 await page.screenshot({ path: '.artifacts/plugins-config.png' });
 await closeSuggest();
 for (const [where, tab, cursor] of [['7:9', 'profile.blade.php', 'Ln 1, Col 1'], ['9:14', 'app.php', 'Ln 4, Col 5'], ['4:10', 'web.php', 'Ln 7, Col 1'], ['13:8', '.env.example', 'Ln 4, Col 1']]) {
  await probe(); await go(where); await page.keyboard.press('F12');
  await expect(page.locator('#tabs .active')).toHaveText(tab);
  await expect(page.locator('#cursor-position')).toContainText(cursor);
 }
 // Recorte 11: Blade.
 await page.locator('#tree summary').filter({ hasText: /^resources$/ }).click();
 await page.locator('#tree summary').filter({ hasText: /^views$/ }).click();
 await page.locator('#tree').getByRole('button', { name: 'probe.blade.php', exact: true }).click();
 await go('4:4'); await invokeSuggest();
 await expect(suggest.locator('.monaco-list-row')).toHaveCount(3);
 await expect(suggest).toContainText('x-forms.input');
 await page.screenshot({ path: '.artifacts/plugins-blade-tags.png' });
 await closeSuggest();
 await go('2:5'); await page.keyboard.press('F12');
 const peek = page.locator('.peekview-widget');
 await expect(peek).toBeVisible(); await expect(peek).toContainText('alert.blade.php'); await expect(peek).toContainText('Alert.php');
 await page.screenshot({ path: '.artifacts/plugins-blade-component.png' });
 await page.keyboard.press('Escape');
 await go('6:21'); await page.keyboard.press('F12');
 await expect(peek).toBeVisible(); await expect(peek).toContainText('messages.php');
 await page.keyboard.press('Escape');
 await page.locator('#tree summary').filter({ hasText: /^users$/ }).click();
 await page.locator('#tree').getByRole('button', { name: 'profile.blade.php', exact: true }).click();
 await go('4:5'); await invokeSuggest();
 await expect(suggest.locator('.monaco-list-row')).toHaveCount(4);
 await expect(suggest).toContainText('section'); await expect(suggest).toContainText('object');
 await page.screenshot({ path: '.artifacts/plugins-blade-variables.png' });
 await closeSuggest();
 console.log(JSON.stringify({ plugins: 'Laravel: 12.0 · .env', completion: 'route(), config(), <x-, $variáveis', navigation: 'view, config, route, env, componente, tradução', rendererErrors: errors }));
 if (errors.length) throw new Error(errors.join('\n'));
} catch (error) { console.error(error); throw error; } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
