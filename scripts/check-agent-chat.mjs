// Harness WebKit do painel de agentes (AI-ACP-001): monta o workbench do plugin Agents de uma cópia local
// (PLUGIN_AGENTS_DIR, padrão ~/Projects/plugin-agents) sobre o shell real da IDE, com Monaco de verdade e a
// API sintética do próprio plugin (tests/fake-api.mjs: agente falso em memória, sem processo nem inferência).
// Uso: node scripts/check-agent-chat.mjs [cenário...]   Capturas em .artifacts/agent-chat-*.png
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {existsSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve, join} from 'node:path';
import {createServer} from 'vite';
import {webkit} from '@playwright/test';

const plugin = resolve(process.env.PLUGIN_AGENTS_DIR ?? join(homedir(), 'Projects/plugin-agents'));
if (!existsSync(join(plugin, 'workbench.js'))) throw Error(`workbench.js ausente em ${plugin}: rode npm run build no plugin`);
const only = process.argv.slice(2);
const server = await createServer({logLevel: 'error', server: {host: '127.0.0.1', port: 1447, strictPort: true, fs: {allow: [process.cwd(), realpathSync('node_modules'), plugin]}}});
let browser;
const scenarios = new Map();
const scenario = (name, fn) => scenarios.set(name, fn);
const USER = "<?php\n\nnamespace Fixture;\n\nfinal class User\n{\n    public function name(): string\n    {\n        return 'Synthetic user';\n    }\n}\n";

async function page(options = {}) {
 const page = await browser.newPage({viewport: {width: 1280, height: 800}});
 const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
 await page.route('**/src/bootstrap.ts', route => route.fulfill({contentType: 'application/javascript', body: `
  window.harness = ${JSON.stringify({plugin, options, user: USER})};
  import('/scripts/agent-chat-harness.ts');
 `}));
 await page.goto('http://127.0.0.1:1447');
 await page.waitForFunction(() => window.ready);
 return {page, errors};
}
async function shot(page, name) { await mkdir('.artifacts', {recursive: true}); await page.screenshot({path: `.artifacts/agent-chat-${name}.png`}); }
async function startAgent(page) { await page.locator('#agent-start').click(); await page.waitForFunction(() => !document.querySelector('#agent-prompt').disabled); }
async function ask(page, text) { await page.locator('#agent-prompt').fill(text); await page.keyboard.press('Enter'); await page.waitForFunction(() => !document.querySelector('#agent-send').disabled); }

scenario('history', async () => {
 const {page, errors} = await page_();
 await startAgent(page);
 await ask(page, 'Explique a classe User');
 await page.locator('#agent-new').click();
 await ask(page, 'Liste os testes do projeto');
 await page.locator('#agent-history-button').click();
 await page.waitForSelector('.agent-history-list li');
 assert.deepEqual(await page.locator('.agent-history-title').allTextContents(), ['Liste os testes do projeto', 'Explique a classe User']);
 assert.deepEqual(await page.locator('.agent-history-time').allTextContents(), ['agora', 'agora']);
 await page.locator('.agent-history-list li').nth(1).click({button: 'right'});
 const menu = (await page.locator('.agent-menu button').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
 assert.deepEqual(menu, ['Renomear ⇧F6', 'Excluir conversa ⌫']);
 await shot(page, 'history');
 await page.locator('.agent-menu button', {hasText: 'Renomear'}).click();
 await page.locator('.agent-history-rename').fill('Classe User');
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('.agent-history-title').nth(1).textContent(), 'Classe User');
 // Teclado: ↓ e Enter abrem a conversa restaurada.
 await page.locator('.agent-history-list li').first().focus();
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 await page.waitForFunction(() => !document.querySelector('#agent-chat').hidden);
 assert.match(await page.locator('#agent-transcript').textContent(), /Resposta a: Explique a classe User/);
 await ask(page, 'E os testes?');
 const extras = await page.evaluate(() => window.api.calls.filter(c => c[0] === 'agentPrompt').at(-1)[3]);
 assert.match(extras.history, /Usuário: Explique a classe User/);
 await page.locator('#agent-history-button').click();
 await page.locator('.agent-history-list li').first().focus();
 await page.keyboard.press('Backspace');
 await page.waitForFunction(() => document.querySelectorAll('.agent-history-list li').length === 1);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#agent-history').isHidden(), true);
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('mentions', async () => {
 const {page, errors} = await page_({database: true});
 await startAgent(page);
 // Seleção real no Monaco (linhas 7–10) para @selection.
 await page.evaluate(() => window.editor.setSelection(new window.monaco.Selection(7, 5, 10, 6)));
 const prompt = page.locator('#agent-prompt');
 await prompt.click(); await page.keyboard.type('Explique @');
 await page.waitForSelector('#agent-popup:not([hidden]) .agent-popup-item');
 assert.deepEqual((await page.locator('.agent-popup-label').allTextContents()).slice(0, 6), ['@thisFile', '@selection', '@file:', '@folder:', '@symbol:', '@dbObject:']);
 await shot(page, 'mentions-popup');
 await page.keyboard.type('file:Use');
 await page.waitForFunction(() => document.querySelector('.agent-popup-label')?.textContent === 'User.php');
 await page.keyboard.press('Enter');
 await page.keyboard.type('com @sel'); await page.waitForFunction(() => document.querySelector('.agent-popup-label')?.textContent === '@selection');
 await page.keyboard.press('Enter');
 await page.keyboard.type('e @dbObject:us'); await page.waitForFunction(() => document.querySelector('.agent-popup-label')?.textContent === 'public.users');
 await page.keyboard.press('Enter');
 await page.keyboard.type('e @symbol:User'); await page.waitForFunction(() => document.querySelector('.agent-popup-label')?.textContent === 'User');
 await page.keyboard.press('Enter');
 assert.equal(await prompt.inputValue(), 'Explique @file:User.php com @selection e @dbObject:public.users e @symbol:User ');
 assert.deepEqual(await page.locator('#agent-chips .agent-chip-label').allTextContents(), ['User.php', 'User.php:7-10', 'public.users', 'User']);
 // O realce cobre exatamente os tokens, alinhado ao texto do campo.
 const marks = await page.locator('.agent-highlight mark').allTextContents();
 assert.deepEqual(marks, ['@file:User.php', '@selection', '@dbObject:public.users', '@symbol:User']);
 const [box, text] = await Promise.all([page.locator('.agent-highlight mark').first().boundingBox(), prompt.boundingBox()]);
 assert.ok(box.x > text.x && box.x < text.x + 80 && box.y < text.y + 30, 'realce fora do lugar');
 await shot(page, 'mentions-chips');
 await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.api.calls.some(c => c[0] === 'agentPrompt'));
 const extras = await page.evaluate(() => window.api.calls.find(c => c[0] === 'agentPrompt')[3]);
 assert.deepEqual(extras.attachments.map(a => a.type), ['file', 'selection', 'schema', 'symbol']);
 assert.equal(extras.attachments[1].line, 7); assert.equal(extras.attachments[1].endLine, 10);
 assert.match(extras.attachments[1].text, /public function name/);
 assert.deepEqual(errors, []);
 await page.close();
});

const page_ = page;
try {
 await server.listen();
 browser = await webkit.launch({headless: true});
 for (const [name, fn] of scenarios) {
  if (only.length && !only.includes(name)) continue;
  await fn();
  console.log(`WebKit agentes: ${name} ok`);
 }
} finally { await browser?.close(); await server.close(); }
