import * as monaco from 'monaco-editor';
import { listen } from '@tauri-apps/api/event';
import { t as tr, msg, html } from './i18n';
import type { IdeApi } from '../shared/contracts';
import { keymap } from './keymap';
import './debug-panel.css';

type Breakpoint = { path: string; line: number; condition: string; enabled: boolean };
type Mapping = { server: string; local: string };
type Frame = { level: number; where: string; type: string; line: number; local: string | null; server: string };
type Prop = { name: string; fullname: string; type: string; classname?: string | null; facet?: string | null; value: string; size?: number | null; children: boolean; numchildren: number; page: number; pagesize?: number | null; items: Prop[] };
type Settings = { port: number; all: boolean; breakFirst: boolean; breakpoints: Breakpoint[]; mappings: Mapping[]; watches: string[] };
type Session = { id: string; info: { idekey?: string; server?: string; local?: string | null; peer?: string; run?: string | null; engine?: string }; status: string; frames: Frame[]; frame: number; epoch: number };
type DebugEvent = { kind: string; session?: string; run?: string; [key: string]: any };
/** Comandos IPC `debug*` (src-tauri/src/debug.rs); passam pelo proxy genérico de window.ide. */
interface DebugApi {
 debugStatus(): Promise<{ listening: { port: number; all: boolean } | null; sessions: { id: string; status: string; info: Session['info'] }[] }>;
 debugListen(port: number, all: boolean): Promise<unknown>; debugUnlisten(): Promise<unknown>;
 debugConfig(breakpoints: Breakpoint[], mappings: Mapping[], breakFirst: boolean): Promise<void>;
 debugRun(path: string, args?: string[]): Promise<{ run: string; idekey: string; script: string }>; debugRunStop(run: string): Promise<void>;
 debugContinue(session: string, action: string): Promise<void>; debugStack(session: string): Promise<Frame[]>;
 debugContexts(session: string, depth: number): Promise<{ id: number; name: string }[]>;
 debugVariables(session: string, depth: number, context: number): Promise<Prop[]>;
 debugProperty(session: string, depth: number, context: number, fullname: string, page: number): Promise<Prop>;
 debugEval(session: string, expression: string): Promise<Prop | null>;
}
type Host = { editor: monaco.editor.IStandaloneCodeEditor; open(path: string, line: number): Promise<void>; status(text: string): void };
const defaults = (): Settings => ({ port: 9003, all: false, breakFirst: false, breakpoints: [], mappings: [], watches: [] });
const errorText = (error: unknown) => String((error as Error)?.message ?? error);

/** Depurador Xdebug (DBGp): escuta, breakpoints na gutter, frames, variáveis, watches, console e passos. */
export function mountDebugger(ideApi: IdeApi, host: Host) {
 const api = ideApi as unknown as DebugApi;
 const panel = document.createElement('section'); panel.id = 'debug-panel'; panel.hidden = true;
 panel.innerHTML = html('<div class="debug-toolbar" role="toolbar" aria-label="Depurador"><strong>Depurar</strong><button id="debug-listen" aria-pressed="false" title="Escutar conexões de depuração PHP (Xdebug)">Escutar</button><label>Porta <input id="debug-port" type="number" min="1024" max="65535"></label><button id="debug-script" title="Depurar o arquivo PHP atual com o php local">Depurar script</button><span class="debug-sep"></span><button id="debug-resume" title="Continuar (F9)">▶</button><button id="debug-over" title="Passar por cima (F8)">↷</button><button id="debug-into" title="Entrar (F7)">↘</button><button id="debug-out" title="Sair (Shift+F8)">↗</button><button id="debug-stop" title="Parar (Cmd+F2)">■</button><select id="debug-session" aria-label="Sessão de depuração"></select><span id="debug-state" role="status" aria-live="polite"></span><button id="debug-hide" aria-label="Ocultar depurador">−</button></div><div class="debug-layout"><div class="debug-column"><h4>Frames</h4><ol id="debug-frames" aria-label="Frames"></ol></div><div class="debug-column"><div class="debug-head"><h4>Variáveis</h4><select id="debug-context" aria-label="Contexto"></select></div><ul id="debug-tree" role="tree" aria-label="Variáveis"></ul><form id="debug-watch-form"><input id="debug-watch" placeholder="Adicionar watch (Enter)" aria-label="Novo watch"></form></div><div class="debug-column"><div class="debug-tabs" role="tablist"><button data-tab="console" aria-selected="true">Console</button><button data-tab="breakpoints" aria-selected="false">Breakpoints</button><button data-tab="mappings" aria-selected="false">Mapeamentos</button></div><div data-view="console"><pre id="debug-console" aria-live="polite"></pre><form id="debug-eval-form"><input id="debug-eval" placeholder="Avaliar expressão PHP (Enter)" aria-label="Avaliar expressão"></form></div><div data-view="breakpoints" hidden><ul id="debug-breakpoints"></ul><label class="debug-check"><input type="checkbox" id="debug-break-first"> Parar na primeira linha</label></div><div data-view="mappings" hidden><p class="debug-hint">Caminho no servidor (container) → pasta do projeto. Vazio = raiz do projeto.</p><ul id="debug-mappings"></ul><form id="debug-mapping-form"><input id="debug-map-server" placeholder="/var/www/html" aria-label="Caminho no servidor"><input id="debug-map-local" placeholder="pasta no projeto" aria-label="Pasta local"><button>Adicionar</button></form><label class="debug-check"><input type="checkbox" id="debug-all"> Aceitar conexões de outras interfaces (Docker no Linux)</label></div></div></div>');
 document.querySelector('.code')!.append(panel);
 const rail = document.createElement('button'); rail.id = 'show-debug'; rail.title = tr('Depurar · Alt+5'); rail.setAttribute('aria-label', tr('Depurar'));
 rail.innerHTML = html('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0zM12 10v8M4 12h4m8 0h4M5 6l3 3m11-3-3 3M5 19l3-3m11 3-3-3"/></svg>');
 document.querySelector('.left-rail')?.append(rail);
 const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
 const editor = host.editor;
 editor.updateOptions({ glyphMargin: true });

 let root = ''; let settings = defaults(); let listening: { port: number; all: boolean } | null = null;
 const sessions = new Map<string, Session>(); let current: string | undefined; const runs = new Map<string, string>();
 let context = 0; let pushTimer = 0;
 const key = () => `php-ide-debug:${root}`;
 const save = () => { try { localStorage.setItem(key(), JSON.stringify(settings)); } catch { /* armazenamento indisponível: segue só na memória */ } };
 const load = () => { try { settings = { ...defaults(), ...JSON.parse(localStorage.getItem(key()) ?? '{}') }; } catch { settings = defaults(); } };
 function log(text: string, kind = '') { const line = document.createElement('span'); line.textContent = text.endsWith('\n') ? text : text + '\n'; if (kind) line.className = 'debug-' + kind; const out = el('debug-console'); out.append(line); while (out.childNodes.length > 2000) out.firstChild!.remove(); out.scrollTop = out.scrollHeight; }
 function fail(error: unknown) { const text = errorText(error); log(text, 'error'); host.status(text); }
 function push() { clearTimeout(pushTimer); pushTimer = window.setTimeout(() => { save(); void api.debugConfig(settings.breakpoints, settings.mappings, settings.breakFirst).catch(fail); }, 150); }

 // ---- breakpoints na gutter ----
 const relative = (model: monaco.editor.ITextModel) => { const p = model.uri.fsPath; return root && p.startsWith(root + '/') ? p.slice(root.length + 1) : undefined; };
 const modelFor = (path: string) => monaco.editor.getModels().find(m => relative(m) === path);
 const decorations = new Map<monaco.editor.ITextModel, { ids: string[]; points: Breakpoint[] }>();
 const lineDecorations = new Map<monaco.editor.ITextModel, string[]>();
 let currentLine: { path: string; line: number; top: boolean } | undefined;
 function paint(model: monaco.editor.ITextModel) {
  if (model.isDisposed()) return;
  const path = relative(model); const points = path ? settings.breakpoints.filter(b => b.path === path && b.line <= model.getLineCount()) : [];
  const old = decorations.get(model)?.ids ?? [];
  const ids = model.deltaDecorations(old, points.map(b => ({ range: new monaco.Range(b.line, 1, b.line, 1), options: { stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, glyphMarginClassName: `debug-bp${b.condition ? ' debug-bp-conditional' : ''}${b.enabled ? '' : ' debug-bp-disabled'}`, glyphMarginHoverMessage: { value: b.condition ? msg`Breakpoint condicional: ${b.condition}` : tr('Breakpoint · clique para remover') } } })));
  decorations.set(model, { ids, points });
  const here = currentLine && currentLine.path === path && currentLine.line <= model.getLineCount() ? currentLine : undefined;
  lineDecorations.set(model, model.deltaDecorations(lineDecorations.get(model) ?? [], here ? [{ range: new monaco.Range(here.line, 1, here.line, 1), options: { isWholeLine: true, className: here.top ? 'debug-current-line' : 'debug-frame-line', glyphMarginClassName: here.top ? 'debug-current-glyph' : 'debug-frame-glyph' } }] : []));
 }
 const paintAll = () => monaco.editor.getModels().forEach(paint);
 function track(model: monaco.editor.ITextModel) {
  // Linhas acompanham edições: a decoração "gruda" no texto e a nova linha é gravada.
  model.onDidChangeContent(() => {
   const state = decorations.get(model); if (!state) return; let changed = false;
   state.ids.forEach((id, index) => { const range = model.getDecorationRange(id); const b = state.points[index]; if (range && b && range.startLineNumber !== b.line) { b.line = range.startLineNumber; changed = true; } });
   if (changed) { const seen = new Set<string>(); settings.breakpoints = settings.breakpoints.filter(b => { const k = `${b.path}:${b.line}`; if (seen.has(k)) return false; seen.add(k); return true; }); renderBreakpoints(); push(); }
  });
  paint(model);
 }
 monaco.editor.getModels().forEach(track); monaco.editor.onDidCreateModel(track);
 monaco.editor.onWillDisposeModel(model => { decorations.delete(model); lineDecorations.delete(model); });
 function toggle(path: string, line: number) {
  const index = settings.breakpoints.findIndex(b => b.path === path && b.line === line);
  if (index >= 0) settings.breakpoints.splice(index, 1); else settings.breakpoints.push({ path, line, condition: '', enabled: true });
  const model = modelFor(path); if (model) paint(model); renderBreakpoints(); push();
 }
 editor.onMouseDown(e => {
  if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) return;
  const model = editor.getModel(); const path = model && relative(model); if (!path) return host.status(tr('Breakpoints só em arquivos do projeto'));
  toggle(path, e.target.position.lineNumber);
 });
 function toggleAtCursor() { const model = editor.getModel(); const path = model && relative(model); const line = editor.getPosition()?.lineNumber; if (path && line) toggle(path, line); }
 function renderBreakpoints() {
  const list = el('debug-breakpoints');
  if (!settings.breakpoints.length) { list.innerHTML = html('<li class="debug-empty">Clique na margem à esquerda dos números de linha (ou Cmd+F8) para criar um breakpoint.</li>'); return; }
  list.replaceChildren(...[...settings.breakpoints].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line).map(b => {
   const li = document.createElement('li');
   const on = document.createElement('input'); on.type = 'checkbox'; on.checked = b.enabled; on.title = tr('Ativo'); on.onchange = () => { b.enabled = on.checked; const m = modelFor(b.path); if (m) paint(m); push(); };
   const go = document.createElement('button'); go.type = 'button'; go.className = 'debug-link'; go.textContent = `${b.path}:${b.line}`; go.onclick = () => void host.open(b.path, b.line - 1).catch(fail);
   const condition = document.createElement('input'); condition.placeholder = tr('Condição PHP, ex.: $i > 10'); condition.value = b.condition; condition.setAttribute('aria-label', msg`Condição de ${b.path}:${b.line}`);
   condition.onchange = () => { b.condition = condition.value.trim(); const m = modelFor(b.path); if (m) paint(m); push(); };
   const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = tr('Remover breakpoint'); remove.onclick = () => toggle(b.path, b.line);
   li.append(on, go, condition, remove); return li;
  }));
 }

 // ---- mapeamentos ----
 function renderMappings() {
  const list = el('debug-mappings');
  list.replaceChildren(...settings.mappings.map((m, index) => {
   const li = document.createElement('li'); const text = document.createElement('code'); text.textContent = `${m.server} → ${m.local || tr('(raiz do projeto)')}`;
   const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = tr('Remover mapeamento'); remove.onclick = () => { settings.mappings.splice(index, 1); renderMappings(); push(); };
   li.append(text, remove); return li;
  }));
  el<HTMLInputElement>('debug-all').checked = settings.all;
 }
 el('debug-mapping-form').onsubmit = e => {
  e.preventDefault(); const server = el<HTMLInputElement>('debug-map-server').value.trim(); const local = el<HTMLInputElement>('debug-map-local').value.trim().replace(/^\.?\/+|\/+$/g, '');
  if (!/^(\/|[A-Za-z]:)/.test(server)) { fail(tr('O caminho do servidor deve ser absoluto, ex.: /var/www/html')); return; }
  if (local.split('/').includes('..')) { fail(tr('A pasta local deve ficar dentro do projeto')); return; }
  settings.mappings = settings.mappings.filter(m => m.server !== server).concat({ server, local });
  el<HTMLInputElement>('debug-map-server').value = ''; el<HTMLInputElement>('debug-map-local').value = ''; renderMappings(); push();
  // Frames já recebidos passam a abrir com o novo mapeamento.
  const s = session(); if (s?.status === 'break') void api.debugStack(s.id).then(frames => { s.frames = frames; renderFrames(); selectFrame(s.frame); }).catch(fail);
 };
 function suggestMapping(server: string) { tab('mappings'); show(); el<HTMLInputElement>('debug-map-server').value = server.replace(/\/[^/]*$/, '') || '/'; el<HTMLInputElement>('debug-map-local').focus(); }

 // ---- sessões, frames e variáveis ----
 const session = () => current ? sessions.get(current) : undefined;
 function controls() {
  const s = session(); const paused = s?.status === 'break';
  for (const id of ['debug-resume', 'debug-over', 'debug-into', 'debug-out']) el<HTMLButtonElement>(id).disabled = !paused;
  el<HTMLButtonElement>('debug-stop').disabled = !s && !runs.size;
  el('debug-listen').setAttribute('aria-pressed', String(!!listening)); el('debug-listen').textContent = listening ? msg`Escutando :${listening.port}` : tr('Escutar');
  rail.dataset.state = paused ? 'paused' : s ? 'running' : listening ? 'listening' : '';
  const select = el<HTMLSelectElement>('debug-session');
  select.replaceChildren(...[...sessions.values()].map(x => new Option(`${x.info.run ? tr('script') : x.info.idekey || x.id} · ${(x.info.local ?? x.info.server ?? '').split('/').pop()}`, x.id)));
  select.hidden = sessions.size < 2; if (current) select.value = current;
  el('debug-state').textContent = !s ? (listening ? msg`Aguardando conexão do Xdebug na porta ${listening.port}` : tr('Não está escutando')) : s.status === 'break' ? tr('Pausado') : s.status === 'running' ? tr('Executando…') : tr('Encerrando…');
  el('debug-state').dataset.state = s?.status ?? '';
 }
 function renderFrames() {
  const s = session(); const list = el('debug-frames');
  list.replaceChildren(...(s?.frames ?? []).map((f, index) => {
   const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-selected', String(index === s!.frame));
   const where = document.createElement('span'); where.textContent = f.where || '{main}';
   const at = document.createElement('small'); at.textContent = `${f.local ?? f.server}:${f.line}`;
   b.append(where, at); b.onclick = () => selectFrame(index); li.append(b);
   if (!f.local) { li.classList.add('debug-unmapped'); const fix = document.createElement('button'); fix.type = 'button'; fix.className = 'debug-link'; fix.textContent = tr('Mapear caminho…'); fix.title = msg`Sem mapeamento para ${f.server}`; fix.onclick = () => suggestMapping(f.server); li.append(fix); }
   return li;
  }));
 }
 function highlight(f: Frame | undefined, top: boolean) {
  currentLine = f?.local ? { path: f.local, line: f.line, top } : undefined; paintAll();
  if (f?.local) void host.open(f.local, f.line - 1).catch(fail);
 }
 function selectFrame(index: number) {
  const s = session(); if (!s) return; s.frame = index; renderFrames();
  const f = s.frames[index]; highlight(f, index === 0);
  if (f && !f.local) log(msg`Arquivo do servidor sem mapeamento local: ${f.server}. Use “Mapear caminho…” no frame.`, 'warn');
  void variables();
 }
 async function variables() {
  const s = session(); const tree = el('debug-tree'); if (!s || s.status !== 'break') { tree.replaceChildren(); return; }
  const epoch = s.epoch; const depth = s.frames[s.frame]?.level ?? 0;
  try {
   const select = el<HTMLSelectElement>('debug-context');
   if (!select.options.length) { const contexts = await api.debugContexts(s.id, depth); select.replaceChildren(...contexts.map(c => new Option(c.name === 'Locals' ? tr('Locais') : c.name === 'Superglobals' ? tr('Superglobais') : c.name === 'User defined constants' ? tr('Constantes') : c.name, String(c.id)))); select.value = String(context); }
   const [watches, vars] = await Promise.all([Promise.all(settings.watches.map(w => api.debugEval(s.id, w).then(p => ({ w, p, e: '' })).catch(e => ({ w, p: null, e: errorText(e) })))), api.debugVariables(s.id, depth, context)]);
   if (epoch !== s.epoch || session() !== s) return;
   tree.replaceChildren(...watches.map(({ w, p, e }, index) => node(p ? { ...p, name: w, fullname: p.fullname || w } : { name: w, fullname: w, type: 'error', value: e || tr('sem valor'), children: false, numchildren: 0, page: 0, items: [] }, s, depth, index)), ...vars.map(v => node(v, s, depth)));
   if (!vars.length && !watches.length) tree.innerHTML = html('<li class="debug-empty">Sem variáveis neste contexto.</li>');
  } catch (error) { if (epoch === s.epoch) { tree.replaceChildren(); fail(error); } }
 }
 function describe(p: Prop) {
  if (p.type === 'string') return `"${p.value}"${p.size && p.size > p.value.length ? '…' : ''}`;
  if (p.type === 'bool') return p.value === '1' ? 'true' : 'false';
  if (p.type === 'null' || p.type === 'uninitialized') return p.type === 'null' ? 'null' : tr('não inicializada');
  if (p.type === 'array') return `array(${p.numchildren})`;
  if (p.type === 'object') return `${p.classname ?? 'object'}${p.numchildren ? ` {${p.numchildren}}` : ''}`;
  return p.value;
 }
 function node(p: Prop, s: Session, depth: number, watch?: number): HTMLLIElement {
  const li = document.createElement('li'); li.setAttribute('role', 'treeitem'); const row = document.createElement('div'); row.className = 'debug-row';
  const twist = document.createElement('button'); twist.type = 'button'; twist.className = 'debug-twist'; twist.textContent = p.children ? '▸' : ''; twist.disabled = !p.children; twist.setAttribute('aria-label', tr('Expandir'));
  const name = document.createElement('span'); name.className = watch === undefined ? 'debug-name' : 'debug-name debug-watch'; name.textContent = p.name || p.fullname;
  if (p.facet) name.title = p.facet;
  const value = document.createElement('span'); value.className = `debug-value debug-type-${p.type}`; value.textContent = describe(p); value.title = p.value;
  row.append(twist, name, document.createTextNode(' = '), value);
  if (watch !== undefined) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'debug-remove'; remove.textContent = '×'; remove.title = tr('Remover watch'); remove.onclick = () => { settings.watches.splice(watch, 1); save(); void variables(); }; row.append(remove); }
  li.append(row);
  if (!p.children) return li;
  li.setAttribute('aria-expanded', 'false');
  const children = document.createElement('ul'); children.setAttribute('role', 'group'); children.hidden = true; li.append(children);
  let items = p.items.slice(); let loading = false;
  const draw = () => {
   children.replaceChildren(...items.map(c => node(c, s, depth)));
   if (items.length < p.numchildren) { const more = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.className = 'debug-link'; b.textContent = msg`Mostrar mais (${p.numchildren - items.length} restantes)`; b.onclick = () => void fetch(Math.ceil(items.length / (p.pagesize || 100))); more.append(b); children.append(more); }
  };
  const fetch = async (page: number) => {
   if (loading || s.status !== 'break') return; loading = true; const epoch = s.epoch;
   try { const r = await api.debugProperty(s.id, depth, context, p.fullname, page); if (epoch === s.epoch) { items = page === 0 ? r.items : items.concat(r.items); draw(); } }
   catch (error) { if (epoch === s.epoch) { children.replaceChildren(); const e = document.createElement('li'); e.className = 'debug-error'; e.textContent = errorText(error); children.append(e); } }
   finally { loading = false; }
  };
  twist.onclick = () => {
   const open = children.hidden; children.hidden = !open; twist.textContent = open ? '▾' : '▸'; li.setAttribute('aria-expanded', String(open));
   if (open) { if (!items.length) void fetch(0); else draw(); }
  };
  return li;
 }
 el<HTMLSelectElement>('debug-context').onchange = e => { context = Number((e.target as HTMLSelectElement).value) || 0; void variables(); };
 el('debug-watch-form').onsubmit = e => { e.preventDefault(); const input = el<HTMLInputElement>('debug-watch'); const w = input.value.trim(); if (!w) return; settings.watches.push(w); input.value = ''; save(); void variables(); };
 el('debug-eval-form').onsubmit = e => {
  e.preventDefault(); const input = el<HTMLInputElement>('debug-eval'); const expression = input.value.trim(); const s = session(); if (!expression) return;
  if (s?.status !== 'break') { fail(tr('Pause num breakpoint para avaliar expressões')); return; }
  log(`> ${expression}`, 'input'); input.value = '';
  void api.debugEval(s.id, expression).then(p => log(p ? `${p.type}${p.classname ? ` ${p.classname}` : ''}: ${describe(p)}${p.items.length ? '\n' + p.items.map(c => `  ${c.name} => ${describe(c)}`).join('\n') : ''}` : tr('(sem valor)'))).catch(fail);
 };

 // ---- ações ----
 async function act(action: 'run' | 'step_into' | 'step_over' | 'step_out' | 'stop') {
  const s = session();
  if (!s) { if (action === 'stop' && runs.size) { for (const run of runs.keys()) await api.debugRunStop(run).catch(fail); } return; }
  if (action !== 'stop' && s.status !== 'break') return;
  try { await api.debugContinue(s.id, action); if (action === 'stop' && s.info.run) await api.debugRunStop(s.info.run).catch(() => {}); } catch (error) { fail(error); }
 }
 async function startListening() {
  const port = Number(el<HTMLInputElement>('debug-port').value) || 9003; settings.port = port; settings.all = el<HTMLInputElement>('debug-all').checked; save();
  try { await api.debugConfig(settings.breakpoints, settings.mappings, settings.breakFirst); const status = await api.debugListen(port, settings.all) as { listening: { port: number; all: boolean } | null }; listening = status.listening; log(msg`Escutando conexões Xdebug na porta ${port}${settings.all ? tr(' (todas as interfaces)') : ' (127.0.0.1)'}.`); host.status(msg`Depurador escutando na porta ${port}`); }
  catch (error) { listening = null; fail(error); }
  controls();
 }
 el('debug-listen').onclick = () => void (async () => { if (listening) { await api.debugUnlisten().catch(fail); listening = null; log(tr('Parou de escutar conexões de depuração.')); controls(); } else await startListening(); })();
 el('debug-script').onclick = () => void debugScript();
 async function debugScript() {
  const model = editor.getModel(); const path = model && relative(model);
  if (!path?.endsWith('.php')) { fail(tr('Abra um arquivo .php do projeto para depurá-lo')); return; }
  show(); if (!listening) await startListening(); if (!listening) return;
  try { const r = await api.debugRun(path); runs.set(r.run, path); log(msg`$ php ${r.script} · XDEBUG_SESSION=${r.idekey}`, 'input'); controls(); } catch (error) { fail(error); }
 }
 el('debug-resume').onclick = () => void act('run'); el('debug-over').onclick = () => void act('step_over'); el('debug-into').onclick = () => void act('step_into'); el('debug-out').onclick = () => void act('step_out'); el('debug-stop').onclick = () => void act('stop');
 el<HTMLSelectElement>('debug-session').onchange = e => { current = (e.target as HTMLSelectElement).value; el<HTMLSelectElement>('debug-context').replaceChildren(); controls(); renderFrames(); selectFrame(session()?.frame ?? 0); };
 el<HTMLInputElement>('debug-break-first').onchange = e => { settings.breakFirst = (e.target as HTMLInputElement).checked; push(); };
 el<HTMLInputElement>('debug-all').onchange = e => { settings.all = (e.target as HTMLInputElement).checked; save(); if (listening) void startListening(); };
 el<HTMLInputElement>('debug-port').onchange = () => { if (listening) void startListening(); else { settings.port = Number(el<HTMLInputElement>('debug-port').value) || 9003; save(); } };
 function tab(name: string) { panel.querySelectorAll<HTMLElement>('[data-view]').forEach(v => v.hidden = v.dataset.view !== name); panel.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name))); }
 panel.querySelectorAll<HTMLElement>('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab!));
 function show() { panel.hidden = false; rail.setAttribute('aria-pressed', 'true'); }
 function hide() { panel.hidden = true; rail.setAttribute('aria-pressed', 'false'); }
 rail.onclick = () => panel.hidden ? show() : hide(); el('debug-hide').onclick = hide;
 // UI-KEYMAP-001: atalhos do depurador no keymap central (editáveis na tela Keymap). Padrões da ajuda
 // pública do PhpStorm: F7/F8/⇧F8/F9 só com sessão pausada, para não consumir as teclas fora da depuração.
 const paused = () => session()?.status === 'break';
 const debugAction = (id: string, label: string, mac: string | string[], other: string | string[], run: () => unknown, enabled?: () => boolean, aliases = '', jetbrains?: { mac?: string | string[]; other?: string | string[] }) =>
  keymap.registerAction({ id, label, category: 'Depuração', aliases: 'xdebug debug ' + aliases, defaults: { mac, other }, jetbrains, enabled, run });
 debugAction('tool.debug', 'Depurar', 'Alt+5', 'Alt+5', () => panel.hidden ? show() : hide(), undefined, 'janela ferramenta', { mac: 'Meta+5' });
 debugAction('debug.toggleBreakpoint', 'Alternar breakpoint', 'Meta+F8', 'Ctrl+F8', () => toggleAtCursor(), undefined, 'breakpoint');
 debugAction('debug.viewBreakpoints', 'Ver breakpoints', 'Shift+Meta+F8', 'Ctrl+Shift+F8', () => { show(); tab('breakpoints'); }, undefined, 'breakpoints');
 debugAction('debug.stop', 'Parar depuração', 'Meta+F2', 'Ctrl+F2', () => void act('stop'), () => !!session() || runs.size > 0, 'stop');
 debugAction('debug.resume', 'Continuar execução', 'F9', 'F9', () => void act('run'), paused, 'resume', { mac: ['Alt+Meta+R', 'F9'] });
 debugAction('debug.stepOver', 'Passar por cima (step over)', 'F8', 'F8', () => void act('step_over'), paused, 'step over');
 debugAction('debug.stepInto', 'Entrar (step into)', 'F7', 'F7', () => void act('step_into'), paused, 'step into');
 debugAction('debug.stepOut', 'Sair (step out)', 'Shift+F8', 'Shift+F8', () => void act('step_out'), paused, 'step out');
 debugAction('debug.listen', 'Escutar conexões de depuração', [], [], () => el('debug-listen').click(), undefined, 'listen');
 const railHint = () => { const key = keymap.shortcut('tool.debug'); rail.title = tr('Depurar') + (key ? ' · ' + key : ''); };
 keymap.onChange(railHint); railHint();

 // ---- eventos do backend ----
 function onEvent(ev: DebugEvent) {
  const s = ev.session ? sessions.get(ev.session) : undefined;
  switch (ev.kind) {
   case 'session': {
    sessions.set(ev.session!, { id: ev.session!, info: ev.info ?? {}, status: 'starting', frames: [], frame: 0, epoch: 0 });
    if (!session() || session()!.status !== 'break') current = ev.session;
    log(msg`Conexão Xdebug ${ev.info?.engine ?? ''} de ${ev.info?.peer ?? '?'} · ${ev.info?.server ?? ''}`);
    if (ev.info?.server && !ev.info.local && !String(ev.info.server).startsWith('dbgp:')) { log(msg`Sem mapeamento local para ${ev.info.server}: breakpoints deste servidor não serão atingidos. Configure em Mapeamentos.`, 'warn'); suggestMapping(ev.info.server); }
    show(); break;
   }
   case 'running': if (s) { s.status = 'running'; s.epoch++; if (s.id === current) { currentLine = undefined; paintAll(); el('debug-tree').replaceChildren(); } } break;
   case 'break': if (s) {
    s.status = 'break'; s.epoch++; s.frames = ev.frames ?? []; s.frame = 0; current = s.id; el<HTMLSelectElement>('debug-context').replaceChildren();
    if (ev.exception) log(msg`Exceção ${ev.exception}: ${ev.message ?? ''}`, 'error');
    show(); renderFrames(); selectFrame(0);
    const f = s.frames[0]; host.status(f ? msg`Pausado em ${f.local ?? f.server}:${f.line}` : tr('Pausado'));
   } break;
   case 'stopping': if (s) s.status = 'stopping'; break;
   case 'ended': sessions.delete(ev.session!); if (current === ev.session) { current = [...sessions.keys()].at(-1); currentLine = undefined; paintAll(); el('debug-tree').replaceChildren(); el<HTMLSelectElement>('debug-context').replaceChildren(); renderFrames(); } log(tr('Sessão de depuração encerrada.')); host.status(tr('Sessão de depuração encerrada')); break;
   case 'output': { const out = document.createElement('span'); out.className = ev.stream === 'stderr' ? 'debug-stderr' : 'debug-stdout'; out.textContent = String(ev.text ?? ''); el('debug-console').append(out); el('debug-console').scrollTop = el('debug-console').scrollHeight; break; }
   case 'exit': {
    const path = runs.get(ev.run!); runs.delete(ev.run!);
    log(msg`[Processo encerrado: ${ev.code ?? tr('interrompido')}]`);
    if (path && !debugSeen.has(ev.run!)) log(tr('O script terminou sem conectar ao depurador. Verifique se o Xdebug 3 está ativo (xdebug.mode=debug) e a porta configurada.'), 'warn');
    break;
   }
   case 'notify': if (ev.name === 'breakpoint_resolved' && ev.breakpoint?.line) log(msg`Breakpoint resolvido em ${ev.breakpoint.file ?? ''}:${ev.breakpoint.line}`); break;
   case 'error': fail(ev.message); break;
  }
  if (ev.kind === 'session' && ev.info?.run) debugSeen.add(ev.info.run);
  controls();
 }
 const debugSeen = new Set<string>();
 void listen<DebugEvent>('debug-event', event => onEvent(event.payload)).catch(error => console.warn(tr('Eventos do depurador indisponíveis'), error));

 async function init() {
  root = (await ideApi.workspace()).root; load();
  el<HTMLInputElement>('debug-port').value = String(settings.port); el<HTMLInputElement>('debug-break-first').checked = settings.breakFirst;
  renderBreakpoints(); renderMappings(); paintAll(); log(tr('Use “Escutar” e inicie o PHP com Xdebug 3 (xdebug.mode=debug, xdebug.start_with_request=trigger e XDEBUG_SESSION), ou “Depurar script”.'));
  try {
   await api.debugConfig(settings.breakpoints, settings.mappings, settings.breakFirst);
   const status = await api.debugStatus(); listening = status.listening;
   for (const x of status.sessions) if (!sessions.has(x.id)) sessions.set(x.id, { id: x.id, info: x.info, status: x.status, frames: [], frame: 0, epoch: 0 });
   current ??= status.sessions[0]?.id;
   const s = session(); if (s?.status === 'break') { s.frames = await api.debugStack(s.id); renderFrames(); selectFrame(0); }
  } catch (error) { fail(error); }
  controls();
 }
 void init();
 return {
  toggleBreakpoint: toggleAtCursor,
  reset() { el('debug-console').replaceChildren(); el('debug-tree').replaceChildren(); el('debug-frames').replaceChildren(); el<HTMLSelectElement>('debug-context').replaceChildren(); currentLine = undefined; decorations.clear(); lineDecorations.clear(); void init(); },
 };
}
