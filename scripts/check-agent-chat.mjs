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
