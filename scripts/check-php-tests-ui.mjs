// PHPUnit/Pest plugin on WebKit with the real Monaco workbench, the plugin's real Rust service
// (JSON lines over stdio) and real PHPUnit 11 / Pest 3 in disposable fixture copies.
// Composer runs in a throwaway container (vendor cached under .tools/php-tests-vendor); coverage uses
// a throwaway PHP 8.3 + PCOV container. No project database or service is touched.
//   PHP_TESTS_PLUGIN=~/Projects/plugin-php-tests node scripts/check-php-tests-ui.mjs [--headed] [--only=phpunit|pest]
import { webkit } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const pluginDir = resolve(process.env.PHP_TESTS_PLUGIN ?? join(homedir(), 'Projects/plugin-php-tests'));
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const shots = resolve('.artifacts/php-tests-ui'); await mkdir(shots, { recursive: true });
const ok = []; const check = (cond, label) => { if (!cond) throw Error('Falhou: ' + label); ok.push(label); };
const docker = (() => { try { execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 20000 }); return true; } catch { return false; } })();

// --- Plugin build and native service -------------------------------------------------------------
execFileSync(process.execPath, ['build.mjs'], { cwd: pluginDir, stdio: 'inherit' });
execFileSync('cargo', ['build', '--manifest-path', join(pluginDir, 'native/Cargo.toml')], { stdio: 'inherit' });
const binary = join(pluginDir, 'native/target/debug/phpforge-php-tests');
const manifest = JSON.parse(await readFile(join(pluginDir, 'plugin.json'), 'utf8'));
const source = { key: 'user:' + manifest.id, manifest, code: (await readFile(join(pluginDir, 'workbench.js'), 'utf8')).replace(/export\s*\{\s*(\w+)\s+as\s+activate\s*\}/, 'export function activate(sdk){window.__sdk=sdk;return $1(sdk)}'), style: await readFile(join(pluginDir, 'workbench.css'), 'utf8') };
check(source.code.includes('window.__sdk'), 'shim de teste encontrou o export activate');
const languageCode = await readFile(join(pluginDir, 'main.js'), 'utf8');
// Debugger plugin (another session owns it) shares the glyph margin: loaded read-only when present.
const debuggerDir = resolve(process.env.PHP_DEBUGGER_PLUGIN ?? join(homedir(), 'Projects/plugin-php-debugger'));
const debuggerSource = existsSync(join(debuggerDir, 'workbench.js')) ? (() => { const m = JSON.parse(require('node:fs').readFileSync(join(debuggerDir, 'plugin.json'), 'utf8')); return { key: 'user:' + m.id, manifest: m, code: require('node:fs').readFileSync(join(debuggerDir, 'workbench.js'), 'utf8'), style: require('node:fs').readFileSync(join(debuggerDir, 'workbench.css'), 'utf8') }; })() : null;

// --- Fixtures ------------------------------------------------------------------------------------
async function fixture(name) {
 const cache = resolve('.tools/php-tests-vendor', name);
 if (!existsSync(join(cache, 'vendor/bin', name === 'pest' ? 'pest' : 'phpunit'))) {
  if (!docker) throw Error('Docker indisponível para instalar PHPUnit/Pest na fixture (composer:2 descartável)');
  await rm(cache, { recursive: true, force: true }); await mkdir(cache, { recursive: true });
  await cp(resolve('tests/fixtures/projects/php-tests', name, 'composer.json'), join(cache, 'composer.json'));
  execFileSync('docker', ['run', '--rm', '-v', `${cache}:/app`, '-w', '/app', 'composer:2', 'install', '--no-interaction', '--no-progress', '--ignore-platform-reqs', '-q'], { stdio: 'inherit', timeout: 600000 });
 }
 const root = await mkdtemp(join(tmpdir(), `php-tests-${name}-`));
 await cp(resolve('tests/fixtures/projects/php-tests', name), root, { recursive: true });
 await cp(join(cache, 'vendor'), join(root, 'vendor'), { recursive: true, verbatimSymlinks: true });
 await cp(join(cache, 'composer.lock'), join(root, 'composer.lock')).catch(() => {});
 return (await import('node:fs/promises')).realpath(root);
}
async function pcovWrapper(dir) {
 try { execFileSync('docker', ['image', 'inspect', 'php-ide-tests-pcov:8.3'], { stdio: 'ignore', timeout: 30000 }); } catch { execFileSync('docker', ['build', '-q', '-t', 'php-ide-tests-pcov:8.3', '-'], { input: 'FROM php:8.3-cli\nRUN pecl install pcov && docker-php-ext-enable pcov\n', stdio: ['pipe', 'ignore', 'inherit'], timeout: 600000 }); }
 const file = join(dir, 'php-pcov');
 await writeFile(file, '#!/bin/sh\nT="${TMPDIR:-/tmp}"; T="${T%/}"\nexec docker run --rm -i -v "$PWD:$PWD" -v "$T:$T" -e TMPDIR="$T" -w "$PWD" php-ide-tests-pcov:8.3 php "$@"\n', { mode: 0o755 });
 return file;
}

// --- Native JSON-lines client --------------------------------------------------------------------
function native(root, env = {}) {
 const child = spawn(binary, [root, 'docker'], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, ...env } });
 let next = 1; const pending = new Map(); const listeners = new Set();
 createInterface({ input: child.stdout }).on('line', line => {
  const m = JSON.parse(line);
  if (m.method === 'tool/event') { for (const fn of listeners) fn(m.params); return; }
  const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
  if (m.error) p.reject(Error(m.error.message)); else p.resolve(m.result);
 });
 const call = (method, args = []) => new Promise((resolve, reject) => { const id = next++; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params: { args } }) + '\n'); });
 return { call, on: fn => listeners.add(fn), stop: () => child.kill() };
}

// --- Vite + WebKit page --------------------------------------------------------------------------
const port = await new Promise(r => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
await new Promise((res, rej) => { server.stdout.on('data', d => { if (String(d).includes(String(port))) res(); }); server.once('exit', rej); });
const browser = await webkit.launch({ headless: !process.argv.includes('--headed') });
const temp = await mkdtemp(join(tmpdir(), 'php-tests-ui-'));

async function walk(root, dir = '') { const out = []; for (const e of await readdir(join(root, dir), { withFileTypes: true })) { if (e.name === 'vendor' || e.name.startsWith('.')) continue; const p = dir ? `${dir}/${e.name}` : e.name; if (e.isDirectory()) out.push(...await walk(root, p)); else out.push(p); } return out; }

let lastPage;
async function open(root, service) {
 const page = await browser.newPage({ viewport: { width: 1500, height: 940 } }); lastPage = page;
 const errors = []; page.on('pageerror', e => errors.push(e.message));
 const calls = []; runs = () => calls.filter(c => c[0] === 'testRun').length;
 await page.exposeFunction('__native', async (method, args) => { calls.push([method, ...args]); return service.current.call(method, args); });
 await page.exposeFunction('__fs', async (method, args) => {
  const safe = p => { const full = resolve(root, p); if (!full.startsWith(root)) throw Error('fora'); return full; };
  if (method === 'read') { const text = await readFile(safe(args[0]), 'utf8'); return { path: args[0], uri: 'file://' + safe(args[0]), text, etag: String((await stat(safe(args[0]))).mtimeMs) }; }
  if (method === 'fileExists') { await stat(safe(args[0])); return true; }
  if (method === 'listFiles') return (await walk(root, args[0])).filter(Boolean);
  if (method === 'tree') { const dir = args[0] ?? ''; return (await readdir(safe(dir), { withFileTypes: true })).filter(e => e.name !== 'vendor' && !e.name.startsWith('.')).map(e => ({ name: e.name, path: dir ? `${dir}/${e.name}` : e.name, directory: e.isDirectory() })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)); }
  if (method === 'save') { await writeFile(safe(args[0]), args[1]); return { etag: String(Date.now()) }; }
  throw Error('fs ' + method);
 });
 service.forward = payload => page.evaluate(p => window.__emit(p), payload).catch(() => {});
 await page.route('**/src/bootstrap.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
 window.__cbs={};window.__listeners={};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};let next=1;
 window.__TAURI_INTERNALS__={transformCallback(cb){const id=next++;window.__cbs[id]=cb;return id;},invoke:async(cmd,args)=>{if(cmd==='plugin:event|listen'){(window.__listeners[args.event]??=[]).push(args.handler);return 1;}return null;}};
 window.__emit=payload=>{for(const h of window.__listeners['plugin-tool-event']??[])window.__cbs[h]({event:'plugin-tool-event',id:1,payload:{key:${JSON.stringify(source.key)},root:${JSON.stringify(root)},channel:'test-progress',payload}});};
 const {NativeLanguage}=await import('/src/native-language.ts');
 const language=new NativeLanguage((method,args=[])=>window.ide[method](...args));
 const entry={key:${JSON.stringify(source.key)},scope:'user',dir:'/plugins',manifest:${JSON.stringify(manifest)},enabled:true,needsConsent:false,consented:true,granted:${JSON.stringify(manifest.permissions)}};
 window.ide=new Proxy({},{get:(_,method)=>{
  if(String(method).startsWith('on'))return ()=>()=>{};
  return async(...args)=>{
   if(method==='workspace')return {root:${JSON.stringify(root)},rootUri:${JSON.stringify('file://' + root + '/')},name:'fixture'};
   if(['read','fileExists','listFiles','tree','save'].includes(method))return window.__fs(method,args);
   const debug=${JSON.stringify(debuggerSource)};
   if(method==='pluginList')return {defaults:[],permissions:entry.granted,ideVersion:'0.2.17',userDir:'/plugins',projectDir:${JSON.stringify(root + '/.php-ide/plugins')},plugins:debug?[entry,{key:debug.key,scope:'user',dir:'/plugins',manifest:debug.manifest,enabled:true,needsConsent:false,consented:true,granted:debug.manifest.permissions}]:[entry]};
   if(method==='pluginToolSource')return debug&&args[0]===debug.key?debug:${JSON.stringify(source)};
   if(method==='pluginToolCall'&&debug&&args[0]===debug.key)return args[1]==='debugStatus'?{listening:null,sessions:[]}:null;
   if(method==='pluginSource'&&debug&&args[0]===debug.key)return {manifest:debug.manifest,code:'ide.register({detect:async()=>null});',rootUri:'file:///'};
   if(method==='pluginSource')return {manifest:entry.manifest,code:${JSON.stringify(languageCode)},rootUri:${JSON.stringify('file://' + root + '/')}};
   if(method==='pluginToolCall')return window.__native(args[1],args[2]);
   if(method==='pluginAuthorizeService'||method==='pluginReleaseResources'||method==='pluginToolStop')return null;
   if(method==='language')return language.request(args[0]);
   if(method==='gitStatus')return null;
   if(method==='plugins')return [];
   return [];
  };
 }});
 document.getElementById('startup-splash')?.remove();
 await import('/src/main.ts');` }));
 await page.goto(`http://127.0.0.1:${port}`);
 await page.waitForFunction(() => !!window.__sdk && !!document.querySelector('#run-config-select'), null, { timeout: 30000 });
 return { page, errors, calls };
}

async function openFile(page, path) {
 await page.evaluate(p => window.__sdk.host.open(p, 0), path);
 await page.waitForFunction(p => window.__sdk.host.path() === p, path);
 await page.waitForTimeout(400);
}
/** Clica no ícone do gutter da linha (1-based) e escolhe a ação do menu. */
async function gutter(page, line, action) {
 await page.evaluate(l => window.__sdk.host.editor.revealLineInCenterIfOutsideViewport(l), line); await page.waitForTimeout(150);
 await page.waitForFunction(l => [...document.querySelectorAll('.pt-gutter')].some(el => { const ed = window.__sdk.host.editor; const top = ed.getTopForLineNumber(l) - ed.getScrollTop(); return Math.abs(el.getBoundingClientRect().top - (ed.getDomNode().getBoundingClientRect().top + top)) < 3; }), line);
 const box = await page.evaluate(l => { const ed = window.__sdk.host.editor; const top = ed.getDomNode().getBoundingClientRect().top + ed.getTopForLineNumber(l) - ed.getScrollTop(); const el = [...document.querySelectorAll('.pt-gutter')].find(e => Math.abs(e.getBoundingClientRect().top - top) < 3); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, line);
 await page.mouse.click(box.x, box.y);
 await page.locator(`#test-gutter-menu [data-action="${action}"]`).click();
}
const glyph = (page, line) => page.evaluate(l => window.__sdk.host.editor.getModel().getAllDecorations().filter(d => d.range.startLineNumber === l && String(d.options.glyphMarginClassName).includes('pt-gutter')).map(d => d.options.glyphMarginClassName).join(' '), line);
let runs = () => 0;
/** Espera uma nova chamada testRun (depois de `before`) e o fim da execução na janela Run. */
async function finished(page, before) {
 const deadline = Date.now() + 120000;
 while (runs() <= before) { if (Date.now() > deadline) throw Error('testRun não foi chamado'); await new Promise(r => setTimeout(r, 50)); }
 await page.waitForFunction(() => { const s = document.querySelector('#test-summary'); return s && s.dataset.state && s.dataset.state !== 'running' && !document.querySelector('.pt-run-tab[data-status=running]'); }, null, { timeout: 120000 });
}
/** "Mostrar aprovados" começa desligado (observado na referência); liga para conferir a árvore inteira. */
async function showPassed(page) { if (await page.locator('#test-show-passed').getAttribute('aria-pressed') !== 'true') await page.locator('#test-show-passed').click(); }
const rows = page => page.$$eval('#test-tree .pt-row', r => r.map(e => [e.querySelector('.pt-row-name').textContent, e.dataset.status]));

try {
 // ================================ PHPUnit 11 ================================
 if (only !== 'pest') {
  const root = await fixture('phpunit');
  const service = { current: native(root) }; service.current.on(p => service.forward?.(p));
  const { page, errors, calls } = await open(root, service);
  await openFile(page, 'tests/Unit/CalculatorTest.php');
  // 1. Run configurations
  check((await page.locator('#run-config-select').textContent()).includes('Arquivo atual'), 'seletor começa em "Arquivo atual"');
  check(await page.locator('.run-config').isHidden() && await page.locator('#run-current').isHidden(), 'rótulo/botão do host substituídos enquanto o plugin está ativo');
  check(/pt-g-run-all/.test(await glyph(page, 10)) && /pt-g-run\b/.test(await glyph(page, 12)), 'gutter: ▶▶ na classe e ▶ no método');
  const events = []; await page.exposeFunction('__event', e => events.push(e));
  if (debuggerSource) {
   await page.waitForFunction(() => !!document.getElementById('show-debug'));
   const box = await page.evaluate(() => { const el = document.querySelectorAll('.pt-gutter')[1].getBoundingClientRect(); return { x: el.left + el.width / 2, y: el.top + el.height / 2 }; });
   await page.mouse.click(box.x, box.y); await page.waitForTimeout(300);
   check(await page.locator('#test-gutter-menu').count() === 1 && await page.locator('.debug-bp').count() === 0, 'com o depurador ativo, clicar no ▶ abre o menu de testes sem criar breakpoint');
   await page.keyboard.press('Escape');
  }
  { const n = runs(); await gutter(page, 12, 'run'); await finished(page, n); }
  check((await page.locator('#run-config-select').textContent()).includes('CalculatorTest::testAddsNumbers'), 'ação do gutter cria e seleciona a temporária "CalculatorTest::testAddsNumbers"');
  check(await page.locator('#run-config-select').evaluate(e => e.classList.contains('pt-temporary')), 'temporária com ícone esmaecido');
  check(calls.some(c => c[0] === 'testRun' && c[4] === '/Tests\\\\Unit\\\\CalculatorTest::testAddsNumbers( with data set .*)?$/'), 'filtro exato do método enviado ao serviço');
  await page.locator('#run-config-select').click();
  check(await page.locator('#run-config-menu [data-action="save"]').count() === 1, 'menu oferece "Salvar a configuração" para a temporária');
  await page.screenshot({ path: join(shots, '01-run-config-menu.png') });
  await page.locator('#run-config-menu [data-action="save"]').click();
  await page.waitForTimeout(300);
  const saved = JSON.parse(await readFile(join(root, '.php-ide/run-configurations.json'), 'utf8'));
  check(saved.configurations.length === 1 && saved.configurations[0].name === 'CalculatorTest::testAddsNumbers' && saved.selected === saved.configurations[0].id, 'configuração salva no projeto (.php-ide/run-configurations.json)');
  // Editar: novo, validação, aplicar.
  await page.locator('#run-config-select').click(); await page.locator('#run-config-menu [data-action="edit"]').click();
  await page.locator('#run-config-dialog [data-action="add"]').click();
  await page.locator('#run-config-dialog input[name=run-config-scope][value=class]').check();
  await page.locator('#run-config-path').fill('tests/Unit/ComparisonTest.php');
  await page.locator('#run-config-ok').click();
  check((await page.locator('#run-config-error').textContent()).includes('Classe não especificada'), 'validação mostra o erro e mantém o diálogo aberto');
  await page.locator('#run-config-class').fill('Tests\\Unit\\ComparisonTest');
  await page.locator('#run-config-name').fill('Comparação');
  await page.locator('#run-config-options').fill('--display-warnings');
  await page.screenshot({ path: join(shots, '02-run-config-dialog.png') });
  await page.locator('#run-config-apply').click(); await page.waitForTimeout(300);
  check(JSON.parse(await readFile(join(root, '.php-ide/run-configurations.json'), 'utf8')).configurations.some(c => c.name === 'Comparação' && c.scope === 'class' && c.options === '--display-warnings'), 'Aplicar grava a nova configuração');
  { const n = runs(); await page.locator('#run-config-execute').click(); await finished(page, n); }
  check(calls.some(c => c[0] === 'testRun' && c[3] === 'tests/Unit/ComparisonTest.php' && c[5]?.options?.[0] === '--display-warnings'), 'Executar no diálogo usa escopo e opções da configuração');
  check((await page.locator('#run-config-select').textContent()).includes('Comparação'), 'configuração executada fica selecionada');
  // Popup "Executar" (⌃⌥R) com "0 Editar configurações…" e configurações numeradas.
  await page.evaluate(`${'window.__sdk.host.editor'}.focus()`); await page.keyboard.press('Control+Alt+r');
  await page.waitForSelector('.pt-run-popup');
  const popup = await page.locator('.pt-run-popup').textContent();
  check(popup.includes('Editar configurações…') && popup.includes('Comparação (PHPUnit)'), 'popup ⌃⌥R lista "Editar configurações…" e "Comparação (PHPUnit)"');
  await page.screenshot({ path: join(shots, '02b-run-popup.png') });
  await page.keyboard.press('Escape');
  // 3. Run window: árvore, saída, diferença.
  check(/2 testes falharam, 1 aprovado\s*3 testes no total, \d+ ms/.test(await page.locator('#test-summary').textContent()), 'estado como na referência: "2 testes falharam, 1 aprovado · 3 testes no total, N ms"');
  check(await page.locator('#test-show-passed').getAttribute('aria-pressed') === 'false' && !(await rows(page)).some(([n]) => n === 'testFormatsMoney'), '"Mostrar aprovados" desligado por padrão esconde o teste aprovado');
  check((await page.locator('#test-tree .pt-row[aria-selected=true]').textContent()).includes('Resultados dos testes'), 'raiz selecionada ao terminar; console com a saída completa');
  check(/Testes iniciados às \d\d:\d\d/.test(await page.locator('#test-console').textContent()), 'console começa pelo comando e "Testes iniciados às HH:MM ..."');
  await page.locator('#test-tree .pt-row', { hasText: 'testComparesText' }).click();
  check((await page.locator('#test-console').textContent()).includes('saída do teste'), 'console mostra a saída do teste selecionado');
  check(await page.locator('#test-console .pt-diff-link').count() === 1, '"<Clique para ver a diferença>" em falha de comparação');
  await page.locator('#test-console .pt-diff-link').click();
  await page.waitForFunction(() => document.querySelector('#test-diff-dialog[open] .monaco-diff-editor'));
  await page.waitForTimeout(400);
  check((await page.locator('#test-diff-dialog').textContent()).replace(/\u00a0/g, ' ').includes('linha dois'), 'diálogo de comparação mostra esperado × obtido no diff do Monaco');
  await page.screenshot({ path: join(shots, '03-comparison-diff.png') });
  await page.keyboard.press('Escape');
  await page.locator('#test-tree .pt-row', { hasText: 'testComparesLists' }).dblclick();
  await page.waitForFunction(() => window.__sdk.host.path() === 'tests/Unit/ComparisonTest.php' && window.__sdk.host.editor.getPosition().lineNumber === 16);
  check(true, 'duplo clique no teste abre o método no editor');
  // Classe inteira: estados no gutter, streaming e rerun failed.
  await openFile(page, 'tests/Unit/CalculatorTest.php');
  await page.evaluate(() => { const orig = window.__emit; window.__emit = p => { if (p.lines) window.__event({ at: Date.now(), n: p.lines.length }); orig(p); }; });
  { const n = runs(); await gutter(page, 10, 'run'); await finished(page, n); }
  check(events.length > 0 && events[0].at < Date.now(), `saída chega em tempo real por eventos (${events.length} lote(s) antes do fim)`);
  check(/1 teste falhou, 4 aprovados, 1 ignorado\s*6 testes no total/.test(await page.locator('#test-summary').textContent()), 'contagem da classe com ignorado');
  await showPassed(page);
  const tree = await rows(page);
  check(tree.some(([n, s]) => n === 'testSums' && s === 'passed') && tree.some(([n]) => n === 'testSums with data set "zero"'), 'data sets agrupados sob o método');
  check(/pt-g-all-failed/.test(await glyph(page, 10)) && /pt-g-passed/.test(await glyph(page, 12)) && /pt-g-failed/.test(await glyph(page, 24)) && /pt-g-ignored/.test(await glyph(page, 40)), 'gutter: classe ✗, método ✓, falha ✗, ignorado –');
  await page.locator('#test-next-failed').click();
  check((await page.locator('#test-tree .pt-row[aria-selected=true]').textContent()).includes('testFailsOnPurpose'), '"Próximo teste com falha" seleciona testFailsOnPurpose');
  await page.screenshot({ path: join(shots, '04-run-window-gutter.png') });
  // 4. Rerun Failed e auto-test.
  { const n = runs(); await page.locator('#test-rerun-failed').click(); await finished(page, n); }
  check(calls.at(-1)[0] === 'testRun' && calls.at(-1)[4] === '/(?:Tests\\\\Unit\\\\CalculatorTest::testFailsOnPurpose)$/', 'Rerun Failed envia só a identidade com falha');
  check((await page.locator('#test-summary').textContent()).includes('1 teste no total'), 'Rerun Failed executa só o teste com falha');
  await page.locator('#test-auto').click();
  check(await page.locator('#test-auto').getAttribute('aria-pressed') === 'true', 'auto-test ligado');
  const before = calls.filter(c => c[0] === 'testRun').length;
  await page.evaluate(r => window.dispatchEvent(new CustomEvent('ide-workspace-file-changed', { detail: { path: r + '/src/Calculator.php' } })), root);
  await page.waitForTimeout(1500);
  check(calls.filter(c => c[0] === 'testRun').length === before, 'auto-test aguarda o atraso (3 s) antes de repetir');
  await finished(page, before);
  check(calls.filter(c => c[0] === 'testRun').length === before + 1, 'auto-test repete a execução depois de salvar um arquivo PHP');
  await page.locator('#test-auto').click();
  // 4. Menu de contexto da árvore Run: um data set isolado (PHPUnit seleciona exatamente).
  { const n = runs(); await gutter(page, 10, 'run'); await finished(page, n); }
  await showPassed(page);
  await page.locator('#test-tree .pt-row', { hasText: 'testSums with data set "zero"' }).click({ button: 'right' });
  await page.waitForSelector('#test-tree-menu');
  check((await page.locator('#test-tree-menu [data-action=run]').textContent()).includes(`Executar 'testSums with data set "zero"'`) && await page.locator('#test-tree-menu [data-action=coverage]').count() === 1 && await page.locator('#test-tree-menu [data-action=navigate]').count() === 1, 'menu de contexto do teste: Executar, Executar com cobertura, Ir para o código');
  await page.screenshot({ path: join(shots, '04b-tree-context-menu.png') });
  { const n = runs(); await page.locator('#test-tree-menu [data-action=run]').click(); await finished(page, n); }
  check(calls.at(-1)[0] === 'testRun' && calls.at(-1)[4] === '/(?:Tests\\\\Unit\\\\CalculatorTest::testSums with data set "zero")$/', 'PHPUnit: "Executar" num data set envia a identidade exata do data set');
  check((await page.locator('#test-summary').textContent()).includes('1 teste no total') || (await page.locator('#test-summary').textContent()).includes('1 teste aprovado'), 'PHPUnit: só o data set "zero" roda: ' + await page.locator('#test-summary').textContent());
  // 5. Cobertura sem driver e com PCOV.
  await gutter(page, 10, 'coverage');
  await page.waitForFunction(() => document.querySelector('#test-summary')?.textContent.includes('Cobertura indisponível'));
  check(true, 'sem Xdebug/PCOV: erro explica e não executa');
  if (docker) {
   const wrapper = await pcovWrapper(temp);
   service.current.stop(); service.current = native(root, { PHP_IDE_PHP_BIN: wrapper }); service.current.on(p => service.forward?.(p));
   await page.reload(); await page.waitForFunction(() => !!window.__sdk && !!document.querySelector('#run-config-select'));
   await openFile(page, 'tests/Unit/ComparisonTest.php');
   { const n = runs(); await gutter(page, 9, 'coverage'); await finished(page, n); }
   await page.waitForFunction(() => !document.querySelector('#coverage-panel').hidden);
   const cov = await page.$$eval('#coverage-table .pt-cov-row', r => r.map(e => [e.dataset.path ?? 'head', e.querySelector('[data-column=statistics]')?.textContent ?? e.textContent]));
   check(cov[0][1].includes('Elemento') && cov[0][1].includes('Estatísticas, %') && cov.some(([p, t]) => p === 'src' && /^\d+% arquivos, \d+% linhas$/.test(t)) && cov.some(([p, t]) => p === 'src/Formatter.php' && t === '40% linhas'), 'janela Coverage: "Elemento" × "Estatísticas, %", src "N% arquivos, N% linhas", Formatter.php "40% linhas": ' + JSON.stringify(cov));
   check(!cov.some(([, t]) => /Todas as classes|Class, %/.test(t)), 'sem colunas Class/Method nem nó "Todas as classes" (PHP na referência)');
   // 2. Árvore Project com a mesma estatística em cinza.
   await page.evaluate(() => document.querySelector('#tree details[data-path="src"]').open = true);
   await page.waitForSelector('#tree button[data-path="src/Formatter.php"] .resource-decoration');
   const decorated = await page.$$eval('#tree [data-path] > .resource-decoration', r => r.map(e => [e.parentElement.dataset.path, e.textContent]));
   check(decorated.some(([p, t]) => p === 'src' && /^50% arquivos, 22% linhas$/.test(t)) && decorated.some(([p, t]) => p === 'src/Formatter.php' && t === '40% linhas') && !decorated.some(([p]) => p === 'tests'), 'árvore Project: "N% arquivos, N% linhas" em src e "40% linhas" em Formatter.php, nada em tests/ (Calculator.php 0%): ' + JSON.stringify(decorated));
   check(await page.$eval('#tree [data-path="src"] > .resource-decoration', e => getComputedStyle(e).color !== getComputedStyle(e.previousElementSibling).color), 'estatística da árvore em cor secundária');
   // Ordenação pelo cabeçalho e "Navegar com um clique".
   await page.locator('#coverage-table [data-sort=name]').click();
   check((await page.$$eval('#coverage-table .pt-cov-row[data-kind=file]', r => r.map(e => e.dataset.path))).join() === 'src/Formatter.php,src/Calculator.php', 'clicar em "Elemento" inverte a ordem');
   await page.locator('#coverage-table [data-sort=name]').click();
   await page.locator('#coverage-single-click').click();
   await page.locator('#coverage-table .pt-cov-row[data-path="src/Formatter.php"]').click();
   await page.waitForFunction(() => window.__sdk.host.path() === 'src/Formatter.php');
   check(true, '"Navegar com um clique" abre o arquivo com um clique');
   await page.locator('#coverage-single-click').click();
   await page.locator('#coverage-select-opened').click();
   await openFile(page, 'src/Calculator.php');
   check(await page.locator('#coverage-table .pt-cov-row[aria-selected=true]').getAttribute('data-path') === 'src/Calculator.php', '"Sempre selecionar o elemento aberto" segue o editor');
   await page.locator('#coverage-select-opened').click();
   await page.screenshot({ path: join(shots, '05a-coverage-window-tree.png') });
   await page.locator('#coverage-table .pt-cov-row[data-path="src/Formatter.php"]').dblclick();
   await page.waitForFunction(() => window.__sdk.host.path() === 'src/Formatter.php'); await page.waitForTimeout(300);
   const marks = await page.evaluate(() => window.__sdk.host.editor.getModel().getAllDecorations().filter(d => String(d.options.linesDecorationsClassName).includes('pt-cov')).map(d => [d.range.startLineNumber, d.options.linesDecorationsClassName.includes('uncovered') ? 'n' : 'c']));
   check(JSON.stringify(marks) === JSON.stringify([[8, 'c'], [10, 'c'], [13, 'n'], [15, 'n'], [16, 'n']]), 'gutter de cobertura: declarações e linhas 8/10 cobertas, 13/15/16 não cobertas (como na referência)');
   check(await page.evaluate(() => window.__sdk.host.editor.getModel().getAllDecorations().filter(d => String(d.options.linesDecorationsClassName).includes('pt-cov')).every(d => !d.options.linesDecorationsTooltip && !d.options.hoverMessage)), 'marca de cobertura sem dica ao passar o mouse (referência: só o clique mostra)');
   await page.screenshot({ path: join(shots, '05-coverage.png') });
   // 1. Contagem de execuções: clique na marca abre o popup "Execuções: N" com ↑/↓ e "Ocultar cobertura".
   const mark = async line => { await page.evaluate(l => window.__sdk.host.editor.revealLineInCenter(l), line); await page.waitForTimeout(150); return page.evaluate(l => { const ed = window.__sdk.host.editor; const r = ed.getDomNode().getBoundingClientRect(); const top = r.top + ed.getTopForLineNumber(l) - ed.getScrollTop(); const el = [...document.querySelectorAll('.pt-cov')].find(e => Math.abs(e.getBoundingClientRect().top - top) < 3); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, line); };
   { const p = await mark(10); await page.mouse.click(p.x, p.y); }
   await page.waitForSelector('#coverage-hits');
   check((await page.locator('#coverage-hits .pt-hits-count').textContent()) === 'Execuções: 1' && await page.locator('#coverage-hits').getAttribute('data-line') === '10', 'clique na marca da linha 10 mostra "Execuções: 1"');
   check(await page.locator('#coverage-hits-previous').isDisabled() && (await page.locator('#coverage-hits-next').getAttribute('title')).includes('Próxima não coberta'), 'popup: ↑ desativado (nenhuma não coberta antes), ↓ "Próxima não coberta"');
   await page.screenshot({ path: join(shots, '05b-coverage-hits.png') });
   await page.keyboard.press('Alt+Shift+ArrowDown');
   await page.waitForFunction(() => document.querySelector('#coverage-hits')?.dataset.line === '13');
   check(await page.evaluate(() => window.__sdk.host.editor.getPosition().lineNumber) === 13 && (await page.locator('#coverage-hits .pt-hits-count').textContent()) === 'Execuções: 0', '⌥⇧↓ leva à próxima não coberta (13) e mostra "Execuções: 0"');
   await page.locator('#coverage-hits-next').click();
   check(await page.evaluate(() => window.__sdk.host.editor.getPosition().lineNumber) === 15, '↓ de novo vai ao trecho 15–16');
   await page.keyboard.press('Escape');
   check(await page.locator('#coverage-hits').count() === 0, 'Esc fecha o popup');
   { const p = await mark(8); await page.mouse.click(p.x, p.y); }
   await page.locator('#coverage-hits-hide').click();
   check(await page.evaluate(() => window.__sdk.host.editor.getModel().getAllDecorations().filter(d => String(d.options.linesDecorationsClassName).includes('pt-cov')).length) === 0 && await page.locator('#coverage-panel').isHidden(), '"Ocultar cobertura" tira as marcas do editor e fecha a janela Coverage');
   check(await page.locator('#tree .resource-decoration').count() === 0, 'sem cobertura, a árvore Project volta sem estatísticas');
  } else console.warn('Docker indisponível: cenário com PCOV ignorado');
  check(!errors.length, 'sem erros de página (PHPUnit): ' + errors.join('; '));
  await page.close(); service.current.stop();
  await rm(root, { recursive: true, force: true });
 }

 // ================================ Pest 3 ================================
 if (only !== 'phpunit') {
  const root = await fixture('pest');
  const service = { current: native(root) }; service.current.on(p => service.forward?.(p));
  const { page, errors, calls } = await open(root, service);
  await openFile(page, 'tests/Unit/CalculatorTest.php');
  check(/pt-g-run\b/.test(await glyph(page, 5)) && /pt-g-run-all/.test(await glyph(page, 17)), 'Pest: ▶ em test/it e ▶▶ em describe');
  { const n = runs(); await gutter(page, 17, 'run'); await finished(page, n); }
  check(calls.some(c => c[0] === 'testRun' && c[4] === '`datasets` → '), 'describe executa pelo prefixo da descrição');
  await showPassed(page);
  const all = await rows(page);
  check(all.some(([n]) => n === '`datasets` → it sums'), 'Pest: suíte de data set com o nome do teste');
  check(/pt-g-all-passed/.test(await glyph(page, 17)) && /pt-g-passed/.test(await glyph(page, 18)), 'Pest: gutter ✓ no describe e no teste');
  // 4. Pest: o menu da árvore num data set repete o teste inteiro e avisa (o Pest 3.8 não isola data set).
  await page.locator('#test-tree .pt-row', { hasText: 'with data set "(0, 0, 0)"' }).first().click({ button: 'right' });
  await page.waitForSelector('#test-tree-menu');
  { const n = runs(); await page.locator('#test-tree-menu [data-action=run]').click(); await finished(page, n); }
  check(calls.at(-1)[4] === '`datasets` → it sums', 'Pest: data set isolado vira o filtro do teste (`datasets` → it sums)');
  check((await page.locator('#test-console').textContent()).includes('Pest não seleciona um data set isolado'), 'Pest: console avisa que todos os data sets foram repetidos');
  check(/2 testes aprovados|2 testes no total/.test(await page.locator('#test-summary').textContent()), 'Pest: os 2 data sets de "it sums" rodam: ' + await page.locator('#test-summary').textContent());
  { const n = runs(); await gutter(page, 13, 'run'); await finished(page, n); }
  check(/pt-g-failed/.test(await glyph(page, 13)), 'Pest: falha marcada no gutter');
  await page.locator('#test-tree .pt-row', { hasText: 'it fails on purpose' }).click();
  check((await page.locator('#test-console').textContent()).includes('Failed asserting that 4 is identical to 5.'), 'Pest: mensagem da falha no console');
  // 6. Datasets: completar e ir para a declaração; tipos de expect().
  await openFile(page, 'tests/Unit/ComparisonTest.php');
  const ed = 'window.__sdk.host.editor';
  await page.evaluate(`(()=>{const e=${ed};const m=e.getModel();const l=m.findMatches("->with('money')",false,false,false,null,false)[0].range;e.setPosition({lineNumber:l.startLineNumber,column:l.startColumn+8});e.focus();e.trigger('t','editor.action.triggerSuggest',{});})()`);
  await page.waitForSelector('.suggest-widget.visible .monaco-list-row', { timeout: 20000 });
  const datasets = await page.$$eval('.suggest-widget.visible .monaco-list-row', r => r.map(e => e.getAttribute('aria-label') ?? e.textContent));
  check(['money', 'pairs', 'emails'].every(n => datasets.some(d => d.includes(n))), 'completar em ->with(\'\') lista datasets compartilhados (money, pairs, emails)');
  await page.screenshot({ path: join(shots, '06-pest-dataset-completion.png') });
  await page.keyboard.press('Escape');
  await page.evaluate(`(()=>{const e=${ed};const m=e.getModel();const l=m.findMatches("->with('money')",false,false,false,null,false)[0].range;e.setPosition({lineNumber:l.startLineNumber,column:l.startColumn+10});})()`);
  await page.evaluate(`${ed}.focus()`); await page.keyboard.press('Meta+b');
  await page.waitForFunction(() => window.__sdk.host.path()?.endsWith('/tests/Datasets/Numbers.php') || window.__sdk.host.path() === 'tests/Datasets/Numbers.php', null, { timeout: 15000 });
  check(await page.evaluate(`${ed}.getPosition().lineNumber`) === 5, 'ir para declaração do dataset abre tests/Datasets/Numbers.php:5');
  await openFile(page, 'tests/Unit/ComparisonTest.php');
  await page.evaluate(`(()=>{const e=${ed};const m=e.getModel();const l=m.findMatches("expect($a)->",false,false,false,null,false)[0].range;e.setPosition({lineNumber:l.startLineNumber,column:l.endColumn});e.focus();e.trigger('t','editor.action.triggerSuggest',{});})()`);
  await page.waitForSelector('.suggest-widget.visible .monaco-list-row', { timeout: 20000 });
  await page.keyboard.type('toBe'); await page.waitForTimeout(400);
  const members = await page.$$eval('.suggest-widget.visible .monaco-list-row', r => r.map(e => e.textContent));
  check(members.some(m => m.includes('toBe') && m.includes('Expectation<int>')), 'expect($a)-> (int $a) oferece toBe com tipo Expectation<int>');
  await page.screenshot({ path: join(shots, '07-pest-expect-types.png') });
  await page.keyboard.press('Escape');
  // 3. Inferência de retorno, uses()->in() e expect()->extend (fixture tests/Feature/HelpersTest.php + tests/Pest.php).
  await openFile(page, 'tests/Feature/HelpersTest.php');
  /** Insere `code` numa linha nova depois de `after`, abre o completar e devolve as linhas da lista. */
  const suggest = async (after, code, filter) => {
   await page.evaluate(([a, c]) => { const e = window.__sdk.host.editor; const m = e.getModel(); const r = m.findMatches(a, false, false, false, null, false)[0].range; const line = r.startLineNumber; const col = m.getLineMaxColumn(line); e.executeEdits('t', [{ range: { startLineNumber: line, startColumn: col, endLineNumber: line, endColumn: col }, text: '\n    ' + c }]); e.setPosition({ lineNumber: line + 1, column: 5 + c.length + 1 }); e.focus(); e.trigger('t', 'editor.action.triggerSuggest', {}); }, [after, code]);
   await page.waitForSelector('.suggest-widget.visible .monaco-list-row', { timeout: 20000 });
   if (filter) { await page.keyboard.type(filter); await page.waitForTimeout(400); }
   const list = await page.$$eval('.suggest-widget.visible .monaco-list-row', r => r.map(e => e.textContent));
   await page.keyboard.press('Escape'); await page.evaluate(() => window.__sdk.host.editor.trigger('t', 'undo', {}));
   return list;
  };
  const returned = await suggest("it('infers returned types', function () {", 'expect(formatter())->', 'mon');
  check(returned.some(m => m.includes('money') && m.includes('Expectation<string>')), 'expect(formatter())-> infere o retorno App\\Formatter de tests/Pest.php e oferece money → Expectation<string>');
  const custom = await suggest("it('infers returned types', function () {", 'expect(formatter())->', 'toBeC');
  check(custom.some(m => m.includes('toBeCurrency') && m.includes('string $code')), 'expectativa customizada expect()->extend(\'toBeCurrency\') no completar, com parâmetros');
  await page.screenshot({ path: join(shots, '08-pest-custom-expectation.png') });
  const self = await suggest("it('infers returned types', function () {", '$this->cur');
  check(self.some(m => m.includes('currency') && m.includes('App\\Money\\Currency')), '$this-> no tests/Feature (uses(Tests\\TestCase)->in(\'Feature\')) oferece currency() → App\\Money\\Currency');
  const chained = await suggest("it('infers returned types', function () {", 'expect($this->currency())->', 'cod');
  check(chained.some(m => m.includes('code') && m.includes('Expectation<string>')), 'expect($this->currency())-> resolve o retorno do método e oferece code (higher order)');
  await page.evaluate(`(()=>{const e=${ed};const m=e.getModel();const l=m.findMatches("toBeOne",false,false,false,null,false)[0].range;e.setPosition({lineNumber:l.startLineNumber,column:l.startColumn+3});e.focus();})()`);
  await page.keyboard.press('Meta+b');
  await page.waitForFunction(() => /(^|\/)tests\/Pest\.php$/.test(window.__sdk.host.path() ?? ''), null, { timeout: 15000 });
  check(await page.evaluate(`${ed}.getPosition().lineNumber`) === 9, 'ir para declaração de ->toBeOne() abre expect()->extend em tests/Pest.php:9');
  check(!errors.length, 'sem erros de página (Pest): ' + errors.join('; '));
  await page.close(); service.current.stop();
  await rm(root, { recursive: true, force: true });
 }
} catch (error) {
 console.log(ok.map(l => '✓ ' + l).join('\n'));
 await lastPage?.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
 throw error;
}
try {
 console.log(ok.map(l => '✓ ' + l).join('\n'));
 console.log(`check-php-tests-ui: ${ok.length} verificações OK · capturas em ${shots}`);
} finally {
 await browser.close(); server.kill(); await rm(temp, { recursive: true, force: true });
}
