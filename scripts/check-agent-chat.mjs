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

scenario('context-mentions', async () => {
 const {page, errors} = await page_();
 await startAgent(page);
 // Marcadores reais do Monaco no arquivo aberto (os mesmos da janela Problemas).
 await page.evaluate(() => window.monaco.editor.setModelMarkers(window.editor.getModel(), 'php', [{severity: 8, message: "Undefined variable '$missing'", startLineNumber: 9, startColumn: 16, endLineNumber: 9, endColumn: 24}]));
 const prompt = page.locator('#agent-prompt');
 await prompt.click(); await page.keyboard.type('Revise @');
 await page.waitForSelector('#agent-popup:not([hidden]) .agent-popup-item');
 assert.deepEqual((await page.locator('.agent-popup-label').allTextContents()).slice(5, 10), ['@commit:', '@localChanges', '@problems', '@projectStructure', '@rule:']);
 await page.keyboard.type('commit:'); await page.waitForFunction(() => document.querySelector('.agent-popup-label')?.textContent === 'a1b2c3d Add User fixture');
 await shot(page, 'context-commit-popup');
 await page.keyboard.press('Enter');
 for (const [typed, label] of [['@localC', '@localChanges'], ['@probl', '@problems'], ['@projectS', '@projectStructure'], ['@rule:php', 'php-style']]) {
  await page.keyboard.type(typed); await page.waitForFunction(l => document.querySelector('.agent-popup-label')?.textContent === l, label);
  await page.keyboard.press('Enter');
 }
 assert.equal(await prompt.inputValue(), 'Revise @commit:a1b2c3d @localChanges @problems @projectStructure @rule:php-style ');
 assert.deepEqual(await page.locator('.agent-highlight mark').allTextContents(), ['@commit:a1b2c3d', '@localChanges', '@problems', '@projectStructure', '@rule:php-style']);
 assert.deepEqual(await page.locator('#agent-chips .agent-chip-label').allTextContents(), ['a1b2c3d', 'Alterações locais', 'Problemas: User.php (1)', 'Estrutura do projeto', 'php-style']);
 await shot(page, 'context-chips');
 await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.api.calls.some(c => c[0] === 'agentPrompt'));
 const extras = await page.evaluate(() => window.api.calls.find(c => c[0] === 'agentPrompt')[3]);
 assert.deepEqual(extras.attachments.map(a => a.type), ['commit', 'localChanges', 'problems', 'projectStructure', 'rule']);
 assert.equal(extras.attachments[2].text, "ERRO src/User.php:9:16 Undefined variable '$missing'");
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('find', async () => {
 const {page, errors} = await page_({script: 'apply'});
 await startAgent(page);
 await ask(page, 'Melhore o método name da classe User');
 await ask(page, 'E o name em minúsculas?');
 await page.locator('#agent-prompt').focus();
 await page.keyboard.press('Meta+f');
 await page.waitForSelector('.agent-find:not([hidden]) .agent-find-input:focus');
 await page.keyboard.type('name');
 await page.waitForFunction(() => document.querySelector('.agent-find-count').textContent.endsWith('/' + document.querySelectorAll('mark.agent-find-match').length) && document.querySelectorAll('mark.agent-find-match').length > 2);
 const total = await page.locator('mark.agent-find-match').count();
 assert.equal(await page.locator('.agent-find-count').textContent(), `1/${total}`);
 await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
 assert.equal(await page.locator('.agent-find-count').textContent(), `3/${total}`);
 // A ocorrência atual fica visível na área da conversa.
 const [mark, log] = await Promise.all([page.locator('mark.agent-find-current').boundingBox(), page.locator('#agent-transcript').boundingBox()]);
 assert.ok(mark.y >= log.y && mark.y + mark.height <= log.y + log.height, 'ocorrência atual fora da área visível');
 await shot(page, 'find');
 await page.keyboard.press('Shift+Enter');
 assert.equal(await page.locator('.agent-find-count').textContent(), `2/${total}`);
 await page.keyboard.press('Escape');
 await page.waitForSelector('.agent-find', {state: 'hidden'});
 assert.equal(await page.locator('mark.agent-find-match').count(), 0);
 assert.equal(await page.evaluate(() => document.activeElement.id), 'agent-prompt');
 // Botões de código seguem funcionando depois da busca (os realces não quebram os blocos).
 assert.equal(await page.locator('.agent-code-apply').count(), 4);
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('commands', async () => {
 const {page, errors} = await page_({commands: [{name: 'explain', description: 'Explica o código mencionado'}, {name: 'tests', description: 'Gera testes', hint: 'classe ou método'}, {name: 'compact', description: 'Resume a conversa para liberar contexto'}]});
 await startAgent(page);
 await page.locator('#agent-prompt').click(); await page.keyboard.type('/');
 await page.waitForSelector('#agent-popup:not([hidden]) .agent-popup-item');
 assert.deepEqual(await page.locator('.agent-popup-label').allTextContents(), ['/explain', '/tests', '/compact']);
 await shot(page, 'commands-popup');
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 assert.equal(await page.locator('#agent-prompt').inputValue(), '/tests ');
 assert.equal(await page.locator('#agent-command-hint').textContent(), '/tests classe ou método');
 await page.keyboard.type('User'); await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.api.calls.some(c => c[0] === 'agentPrompt'));
 assert.equal(await page.evaluate(() => window.api.calls.find(c => c[0] === 'agentPrompt')[1]), '/tests User');
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('attachments', async () => {
 const {page, errors} = await page_({database: true});
 await startAgent(page);
 await page.locator('#agent-attach').click();
 await page.waitForSelector('#agent-attach-menu');
 const labels = await page.locator('#agent-attach-menu .agent-attach-item .agent-popup-label').allTextContents();
 assert.deepEqual(labels.slice(0, 3), ['Arquivos e pastas', 'Imagem…', 'Schema de banco…']);
 await shot(page, 'attachments-menu');
 // Imagem…: seletor de arquivos real do WebKit.
 const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
 const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#agent-attach-menu .agent-attach-item', {hasText: 'Imagem…'}).click()]);
 await chooser.setFiles({name: 'tela.png', mimeType: 'image/png', buffer: PNG});
 await page.waitForSelector('#agent-chips .agent-chip img');
 // Busca no menu anexa arquivo do projeto.
 await page.locator('#agent-attach').click(); await page.keyboard.type('READ');
 await page.locator('#agent-attach-menu .agent-attach-item', {hasText: 'README.md'}).click();
 assert.deepEqual(await page.locator('#agent-chips .agent-chip-label').allTextContents(), ['tela.png', 'README.md']);
 // Clicar na ficha da imagem abre a prévia.
 await page.locator('#agent-chips .agent-chip-label', {hasText: 'tela.png'}).click();
 await page.waitForSelector('dialog.agent-image-preview[open] img');
 await shot(page, 'attachments-image-preview');
 await page.keyboard.press('Escape');
 await page.locator('#agent-prompt').fill('O que há nesta tela?'); await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.api.calls.some(c => c[0] === 'agentPrompt'));
 const extras = await page.evaluate(() => window.api.calls.find(c => c[0] === 'agentPrompt')[3]);
 assert.deepEqual(extras.attachments.map(a => a.type), ['image', 'file']);
 assert.equal(extras.attachments[0].data, PNG.toString('base64'));
 await shot(page, 'attachments-sent');
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('terminal', async () => {
 const {page, errors} = await page_({script: 'terminal'});
 await startAgent(page);
 await page.locator('#agent-prompt').fill('Rode os testes'); await page.keyboard.press('Enter');
 await page.waitForSelector('.agent-terminal[data-id="t1"] .agent-terminal-run');
 assert.equal(await page.locator('.agent-terminal[data-id="t1"] .agent-terminal-command').textContent(), '$ php vendor/bin/phpunit --testdox');
 await shot(page, 'terminal-approval');
 await page.locator('.agent-terminal[data-id="t1"] .agent-terminal-run').click();
 await page.waitForSelector('.agent-terminal[data-id="t2"] .agent-terminal-reject');
 assert.equal(await page.locator('.agent-terminal[data-id="t1"] .agent-terminal-status').textContent(), 'Concluído');
 assert.match(await page.locator('.agent-terminal[data-id="t1"] .agent-terminal-output').textContent(), /OK \(1 test, 1 assertion\)/);
 await page.locator('.agent-terminal[data-id="t2"] .agent-terminal-reject').click();
 await page.waitForFunction(() => !document.querySelector('#agent-send').disabled);
 assert.equal(await page.locator('.agent-terminal[data-id="t2"] .agent-terminal-status').textContent(), 'Recusado');
 assert.deepEqual(await page.evaluate(() => window.api.calls.filter(c => c[0] === 'agentTerminalDecision').map(c => c.slice(1))), [['t1', true], ['t2', false]]);
 await shot(page, 'terminal-done');
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('terminal-allowlist', async () => {
 const {page, errors} = await page_({script: 'allowlist'});
 await startAgent(page);
 assert.equal(await page.locator('#agent-allow-all').getAttribute('aria-pressed'), 'false');
 await page.locator('#agent-prompt').fill('git log --oneline -2'); await page.keyboard.press('Enter');
 await page.waitForSelector('.agent-terminal[data-status="waiting"] .agent-terminal-more');
 await page.locator('.agent-terminal-more').click();
 await page.waitForSelector('.agent-terminal-menu');
 assert.deepEqual(await page.locator('.agent-terminal-menu button span').allTextContents(), ['Executar e permitir este comando', 'Executar e permitir comandos semelhantes']);
 await shot(page, 'terminal-remember-menu');
 await page.locator('.agent-terminal-menu button[data-kind="similar"]').click();
 await page.waitForFunction(() => !document.querySelector('#agent-send').disabled);
 await page.locator('#agent-prompt').fill('git log --oneline -10 && git push --force'); await page.keyboard.press('Enter');
 await page.waitForSelector('.agent-terminal[data-status="waiting"]');
 assert.deepEqual(await page.locator('.agent-terminal').evaluateAll(els => els.map(e => e.dataset.status)), ['exited', 'exited', 'waiting']);
 assert.match(await page.locator('.agent-terminal').nth(1).locator('.agent-terminal-cwd').textContent(), /permitido pela allowlist/);
 await page.locator('.agent-terminal[data-status="waiting"] .agent-terminal-reject').click();
 await page.waitForFunction(() => !document.querySelector('#agent-send').disabled);
 // Permitir tudo: só nesta sessão.
 await page.locator('#agent-allow-all').click();
 await page.waitForFunction(() => document.querySelector('#agent-allow-all').getAttribute('aria-pressed') === 'true');
 await ask(page, 'git push --force');
 await page.waitForFunction(() => [...document.querySelectorAll('.agent-terminal')].at(-1).dataset.status === 'exited');
 assert.match(await page.locator('.agent-terminal').last().locator('.agent-terminal-cwd').textContent(), /Permitir tudo/);
 await shot(page, 'terminal-allow-all');
 await page.locator('#agent-options').click();
 await page.locator('.agent-menu button', {hasText: 'Allowlist do terminal'}).click();
 await page.waitForSelector('dialog.agent-allowlist[open] .agent-allowlist-rules code');
 assert.deepEqual(await page.locator('.agent-allowlist-rules code').allTextContents(), ['git log --oneline …']);
 await shot(page, 'terminal-allowlist-dialog');
 await page.locator('.agent-allowlist-rules button', {hasText: 'Remover'}).click();
 await page.waitForSelector('.agent-allowlist-empty');
 await page.keyboard.press('Escape');
 await page.locator('#agent-new').click();
 await page.waitForFunction(() => document.querySelector('#agent-allow-all').getAttribute('aria-pressed') === 'false');
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('drop', async () => {
 const {page, errors} = await page_();
 await startAgent(page);
 // Drop HTML5 como o WebView entrega com dragDropEnabled: false (arquivos sem caminho, só conteúdo).
 const dropOn = (selector, files) => page.evaluate(({selector, files}) => {
  const target = document.querySelector(selector); const dt = new DataTransfer();
  for (const f of files) dt.items.add(new File([f.text], f.name, {type: f.type}));
  const results = {};
  for (const type of ['dragenter', 'dragover', 'drop']) { const e = new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}); target.dispatchEvent(e); results[type] = e.defaultPrevented; }
  results.dropEffect = dt.dropEffect; return results;
 }, {selector, files});
 const before = await page.evaluate(() => window.editor.getModel().getValue());
 const onEditor = await dropOn('#editor .view-lines', [{name: 'notas.md', type: 'text/markdown', text: '# Notas'}]);
 assert.equal(onEditor.drop, true, 'host bloqueia o drop fora do chat');
 assert.equal(await page.evaluate(() => window.editor.getModel().getValue()), before, 'editor intacto');
 assert.equal(await page.locator('#agent-chips .agent-chip').count(), 0);
 const onChat = await dropOn('#agent-transcript', [{name: 'User.php', type: 'text/x-php', text: '<?php // src/User.php\n'}, {name: 'notas.md', type: 'text/markdown', text: '# Notas\nfora do projeto'}]);
 assert.deepEqual([onChat.dragover, onChat.drop], [true, true]);
 await page.waitForFunction(() => document.querySelectorAll('#agent-chips .agent-chip').length === 2);
 assert.deepEqual(await page.locator('#agent-chips .agent-chip').evaluateAll(els => els.map(e => [e.dataset.kind, e.querySelector('.agent-chip-label').textContent])), [['file', 'User.php'], ['dropped', 'notas.md']]);
 await shot(page, 'drop-chips');
 await page.locator('#agent-prompt').fill('Resuma'); await page.keyboard.press('Enter');
 await page.waitForFunction(() => window.api.calls.some(c => c[0] === 'agentPrompt'));
 const extras = await page.evaluate(() => window.api.calls.find(c => c[0] === 'agentPrompt')[3]);
 assert.deepEqual(extras.attachments, [{type: 'file', path: 'src/User.php'}, {type: 'dropped', name: 'notas.md', text: '# Notas\nfora do projeto'}]);
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('snippet-actions', async () => {
 const {page, errors} = await page_({script: 'snippets'});
 await startAgent(page);
 await ask(page, 'Crie um teste para User');
 assert.deepEqual(await page.locator('.agent-code-head').first().locator('button').allTextContents(), ['Aplicar', 'Inserir no cursor', 'Copiar', 'Criar arquivo', 'Executar']);
 // Create File from Snippet: caminho sugerido, confirmação, criação pelo host e abertura no editor.
 await page.locator('.agent-code-create').first().click();
 await page.waitForSelector('dialog.agent-create-file[open]');
 assert.equal(await page.locator('dialog.agent-create-file input').inputValue(), 'UserTest.php');
 await shot(page, 'snippet-create-file');
 await page.keyboard.press('Meta+ArrowLeft'); await page.keyboard.type('tests/');
 await page.keyboard.press('Enter');
 await page.waitForSelector('dialog.agent-create-file', {state: 'detached'});
 assert.deepEqual(await page.evaluate(() => window.api.calls.find(c => c[0] === 'fileCreate').slice(1, 3)), ['tests/UserTest.php', 'file']);
 assert.equal(await page.evaluate(() => window.opened), 'tests/UserTest.php');
 assert.match(await page.locator('#status').textContent(), /Arquivo criado: tests\/UserTest\.php/);
 // Run Snippet: comando exato e confirmação explícita.
 await page.locator('.agent-code-run').nth(1).click();
 await page.waitForSelector('dialog.agent-run-snippet[open]');
 assert.equal(await page.locator('dialog.agent-run-snippet .agent-terminal-command').textContent(), '$ php vendor/bin/phpunit --testdox');
 assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cancelar');
 await shot(page, 'snippet-run-confirm');
 await page.keyboard.press('Escape');
 await page.waitForSelector('dialog.agent-run-snippet', {state: 'detached'});
 assert.equal(await page.evaluate(() => window.api.calls.filter(c => c[0] === 'agentRunSnippet').length), 0);
 await page.locator('.agent-code-run').nth(1).click();
 await page.locator('dialog.agent-run-snippet .agent-run-confirm').click();
 await page.waitForSelector('.agent-terminal[data-status="exited"] .agent-terminal-output');
 assert.equal(await page.locator('.agent-terminal strong').textContent(), 'Trecho executado');
 await shot(page, 'snippet-run-output');
 assert.deepEqual(errors, []);
 await page.close();
});

scenario('apply', async () => {
 const {page, errors} = await page_({script: 'apply'});
 const box = await page.locator('#editor').boundingBox();
 assert.ok(box.width > 300 && box.height > 300, 'editor Monaco sem área: ' + JSON.stringify(box));
 await page.waitForSelector('#editor .view-lines');
 await startAgent(page);
 await page.locator('#agent-prompt').fill('Melhore o método name'); await page.keyboard.press('Enter');
 await page.waitForSelector('.agent-code .agent-code-apply');
 assert.deepEqual(await page.locator('.agent-code-lang').allTextContents(), ['src/User.php', 'diff']);
 await page.locator('.agent-code-apply').first().click();
 await page.waitForSelector('dialog.agent-apply[open] .monaco-diff-editor');
 await page.waitForFunction(() => document.querySelectorAll('dialog.agent-apply .line-insert, dialog.agent-apply .char-insert').length > 0);
 assert.match(await page.locator('dialog.agent-apply header span').textContent(), /bloco localizado/);
 await shot(page, 'apply-preview');
 // Descartar tudo (Esc) não muda o editor.
 await page.keyboard.press('Escape');
 await page.waitForFunction(() => !document.querySelector('dialog.agent-apply'));
 assert.match(await page.evaluate(() => window.editor.getModel().getValue()), /'Synthetic user'/);
 // Aceitar tudo (⌘↩) aplica no buffer; ⌘Z desfaz.
 await page.locator('.agent-code-apply').first().click();
 await page.waitForSelector('dialog.agent-apply[open] .monaco-diff-editor');
 await page.locator('dialog.agent-apply .agent-apply-accept').click();
 await page.waitForFunction(() => window.editor.getModel().getValue().includes("strtoupper('synthetic user')"));
 assert.match(await page.locator('#status').textContent(), /Alterações aplicadas em User\.php/);
 await shot(page, 'apply-accepted');
 await page.evaluate(() => { window.editor.focus(); window.editor.trigger('test', 'undo'); });
 assert.match(await page.evaluate(() => window.editor.getModel().getValue()), /'Synthetic user'/);
 // Diff unificado.
 await page.locator('.agent-code-apply').nth(1).click();
 await page.waitForSelector('dialog.agent-apply[open]');
 await page.locator('dialog.agent-apply .agent-apply-accept').click();
 await page.waitForFunction(() => window.editor.getModel().getValue().includes("'Edited by diff'"));
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
