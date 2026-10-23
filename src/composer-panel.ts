import { t as tr, msg, html } from './i18n';
import { dockWindow, resizeToolWindow, toolIcon } from './tool-window';
import type { ComposerRunner, ComposerRunOutput, IdeApi } from '../shared/contracts';
import { scriptNames, type ComposerRequest } from '../shared/language/plugins/composer';
import './composer-panel.css';
import { keymap } from './keymap';

type Host = { status(text: string): void; open(path: string): Promise<void>; changed(): void };
type Request = ComposerRequest & { lock?: boolean };
type Row = { name: string; constraint: string; dev: boolean; installed?: string };
const storage = 'php-ide-composer-runner';
const describe = (r: Request) => ['composer', r.action, r.dev ? '--dev' : '', r.lock ? '--lock' : '', r.optimize ? '--optimize' : '', r.script ?? '', ...(r.packages ?? [])].filter(Boolean).join(' ');

/** Janela Composer: ações com saída em tempo real, pacotes do projeto, busca no Packagist e executável configurável. */
export function mountComposer(api: IdeApi, host: Host) {
 const panel = document.createElement('section'); panel.id = 'composer-panel'; panel.hidden = true;
 panel.innerHTML = html`<div id="composer-resize" class="tool-window-resize" role="separator" tabindex="0" aria-label="Altura do Composer" aria-orientation="horizontal"></div>
<div class="composer-toolbar"><strong>Composer</strong><span id="composer-runner-label"></span>
<button data-composer="install" title="Instalar as versões do composer.lock">Install</button><button data-composer="update" title="Atualizar todas as dependências">Update</button><button id="composer-require" title="Buscar no Packagist e adicionar dependência">Require…</button><button data-composer="dump-autoload" title="Regenerar o autoload otimizado">Dump autoload</button><button data-composer="validate" title="Validar composer.json e composer.lock">Validate</button>
<select id="composer-script" aria-label="Script do composer.json"></select><button id="composer-run-script" title="Executar script">▶</button>
<button id="composer-stop" disabled>■ Interromper</button><button id="composer-settings" aria-expanded="false" title="Executável do Composer">⚙</button><button id="composer-hide" aria-label="Ocultar Composer">−</button></div>
<form id="composer-config" hidden><label>Executar com <select id="composer-mode"><option value="auto">PATH ou composer.phar do projeto</option><option value="path">Caminho do executável</option><option value="docker">Docker (imagem oficial)</option></select></label>
<label id="composer-path-field">Caminho <input id="composer-path" placeholder="/usr/local/bin/composer ou …/composer.phar" spellcheck="false"></label><label id="composer-image-field">Imagem <input id="composer-image" placeholder="composer:2" spellcheck="false"></label>
<button id="composer-probe" type="submit">Salvar e testar</button><span id="composer-probe-result" role="status"></span></form>
<p id="composer-summary" role="status" aria-live="polite">Use as ações acima ou o ▶ no composer.json.</p>
<div class="composer-layout"><div id="composer-packages" role="list" aria-label="Dependências"></div><pre id="composer-output" tabindex="0" aria-label="Saída do Composer"></pre></div>
<dialog id="composer-dialog" class="composer-dialog"><form method="dialog"><h2>Adicionar dependência</h2><input id="composer-query" type="search" placeholder="Buscar no Packagist (ex.: monolog)" autocomplete="off" spellcheck="false" aria-label="Pacote"><div id="composer-results" role="listbox" aria-label="Resultados do Packagist"></div><p id="composer-search-state" role="status"></p>
<div class="composer-dialog-row"><label>Versão <input id="composer-constraint" list="composer-versions" placeholder="vazio = mais recente estável" spellcheck="false"></label><datalist id="composer-versions"></datalist><label><input id="composer-dev" type="checkbox"> require-dev</label></div>
<div class="composer-dialog-actions"><button value="cancel" formnovalidate>Cancelar</button><button id="composer-add" value="add" disabled>Adicionar</button></div></form></dialog>`;
 document.querySelector('.code')!.append(panel);
 const button = document.createElement('button'); button.id = 'show-composer';
 toolIcon(button, '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/>', tr('Composer'));
 document.querySelector('.left-rail')!.append(button);
 const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
 const open = dockWindow(panel, button, hide);
 resizeToolWindow(panel, el('composer-resize'), 'php-ide-composer-height');
 let running: string | undefined; let last: Request | undefined; let buffer = ''; let epoch = 0; let rows: Row[] = [];
 const output = el('composer-output');
 const summary = (text: string, state = '') => { el('composer-summary').textContent = text; el('composer-summary').dataset.state = state; };
 api.onComposerProgress(event => {
  if (event.id !== running) return;
  const follow = output.scrollTop + output.clientHeight >= output.scrollHeight - 8;
  buffer = (buffer + event.text).slice(-200000); output.textContent = buffer;
  if (follow) output.scrollTop = output.scrollHeight;
 });

 function runner(): ComposerRunner { try { const saved = JSON.parse(localStorage.getItem(storage) ?? 'null'); if (saved?.mode) return saved; } catch { /* preferência inválida: padrão */ } return { mode: 'auto' }; }
 function runnerLabel() { const r = runner(); el('composer-runner-label').textContent = r.mode === 'docker' ? `Docker · ${r.image || 'composer:2'}` : r.mode === 'path' ? r.path?.split('/').pop() ?? '' : tr('PATH'); }
 function showConfig(show = el('composer-config').hidden) {
  el('composer-config').hidden = !show; el('composer-settings').setAttribute('aria-expanded', String(show));
  const r = runner(); el<HTMLSelectElement>('composer-mode').value = r.mode; el<HTMLInputElement>('composer-path').value = r.path ?? ''; el<HTMLInputElement>('composer-image').value = r.image ?? '';
  fields(); if (show) el<HTMLSelectElement>('composer-mode').focus();
 }
 function fields() { const mode = el<HTMLSelectElement>('composer-mode').value; el('composer-path-field').hidden = mode !== 'path'; el('composer-image-field').hidden = mode !== 'docker'; }
 el('composer-mode').onchange = fields;
 el('composer-settings').onclick = () => showConfig();
 el<HTMLFormElement>('composer-config').onsubmit = async event => {
  event.preventDefault();
  const mode = el<HTMLSelectElement>('composer-mode').value as ComposerRunner['mode'];
  const next: ComposerRunner = { mode, ...(mode === 'path' ? { path: el<HTMLInputElement>('composer-path').value.trim() } : {}), ...(mode === 'docker' ? { image: el<HTMLInputElement>('composer-image').value.trim() || 'composer:2' } : {}) };
  const result = el('composer-probe-result'); result.dataset.state = 'running'; result.textContent = mode === 'docker' ? tr('Testando… (a primeira execução pode baixar a imagem)') : tr('Testando…');
  try { const probe = await api.composerProbe(next); try { localStorage.setItem(storage, JSON.stringify(next)); } catch { /* sem armazenamento: vale só nesta sessão */ } runnerLabel(); result.dataset.state = 'passed'; result.textContent = probe.version; if (last && el('composer-summary').dataset.state === 'missing') summary(msg`Composer configurado. Use “${describe(last)}” novamente.`); }
  catch (error) { result.dataset.state = 'error'; result.textContent = String((error as Error)?.message ?? error); }
 };

 function controls() {
  panel.querySelectorAll<HTMLButtonElement>('[data-composer],#composer-require,#composer-run-script,.composer-row button').forEach(b => b.disabled = !!running);
  el<HTMLButtonElement>('composer-run-script').disabled ||= !el<HTMLSelectElement>('composer-script').value;
  el<HTMLButtonElement>('composer-stop').disabled = !running;
 }
 async function load() {
  let json: any = null; let lock: any = null; let text = '';
  try { text = (await api.read('composer.json')).text; json = JSON.parse(text); } catch { json = null; }
  try { lock = JSON.parse((await api.read('composer.lock')).text); } catch { lock = null; }
  const versions = new Map<string, string>([...(lock?.packages ?? []), ...(lock?.['packages-dev'] ?? [])].map((p: any) => [String(p.name).toLowerCase(), String(p.version)]));
  rows = json ? (['require', 'require-dev'] as const).flatMap(section => Object.entries(json[section] ?? {}).map(([name, constraint]) => ({ name, constraint: String(constraint), dev: section === 'require-dev', installed: versions.get(name.toLowerCase()) }))) : [];
  const list = el('composer-packages');
  if (!text) list.replaceChildren(Object.assign(document.createElement('p'), { className: 'composer-empty', textContent: tr('Sem composer.json na raiz. Use Require… para criar um.') }));
  else if (!json) list.replaceChildren(Object.assign(document.createElement('p'), { className: 'composer-empty', textContent: tr('composer.json inválido: corrija o arquivo (os erros aparecem no editor).') }));
  else list.replaceChildren(...rows.map(row => {
   const item = document.createElement('div'); item.className = 'composer-row'; item.setAttribute('role', 'listitem'); item.dataset.dev = String(row.dev);
   const name = document.createElement('button'); name.type = 'button'; name.className = 'composer-name'; name.textContent = row.name; name.title = tr('Abrir composer.json do pacote em vendor');
   name.onclick = () => { void host.open(`vendor/${row.name.toLowerCase()}/composer.json`).catch(() => summary(msg`${row.name} não está instalado em vendor. Rode composer install.`, 'error')); };
   const detail = document.createElement('small'); detail.textContent = `${row.constraint}${row.installed ? ` · ${row.installed}` : row.name.includes('/') && lock ? tr(' · fora do lock') : ''}${row.dev ? ' · dev' : ''}`;
   const update = document.createElement('button'); update.type = 'button'; update.textContent = '↻'; update.title = msg`Atualizar ${row.name}`; update.setAttribute('aria-label', update.title); update.hidden = !row.name.includes('/');
   update.onclick = () => void run({ action: 'update', packages: [row.name] });
   const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '✕'; remove.title = msg`Remover ${row.name}`; remove.setAttribute('aria-label', remove.title);
   remove.onclick = () => { if (remove.dataset.confirm) { void run({ action: 'remove', packages: [row.name], dev: row.dev }); return; } remove.dataset.confirm = '1'; remove.textContent = tr('Remover?'); setTimeout(() => { delete remove.dataset.confirm; remove.textContent = '✕'; }, 4000); };
   item.append(name, detail, update, remove); return item;
  }));
  const select = el<HTMLSelectElement>('composer-script'); const previous = select.value;
  select.replaceChildren(new Option(tr('Scripts…'), ''), ...scriptNames(text).map(n => new Option(n, n)));
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
  controls();
 }
 async function run(request: Request) {
  open(); last = request;
  if (running) { summary(tr('O Composer já está em execução. Interrompa-o antes de iniciar outra ação.'), 'error'); return; }
  const id = crypto.randomUUID(); const token = ++epoch; running = id; buffer = ''; output.textContent = ''; controls();
  summary(msg`Executando ${describe(request)}…`, 'running');
  try {
   const out: ComposerRunOutput = await api.composerRun(id, runner(), request);
   if (token !== epoch) return;
   buffer = out.output ? `$ ${out.command}\n${out.output}` : buffer; output.textContent = buffer; output.scrollTop = output.scrollHeight;
   const seconds = (out.durationMs / 1000).toFixed(1);
   if (out.cancelled) summary(msg`${describe(request)} interrompido após ${seconds}s. Alterações parciais em vendor/composer.lock podem ter ficado; rode novamente.`, 'error');
   else if (out.timedOut) summary(tr('Tempo limite de 30 minutos atingido; o processo foi encerrado.'), 'error');
   else if (out.exitCode === 0) summary(msg`${describe(request)} concluído em ${seconds}s.`, 'passed');
   else summary(msg`${describe(request)} falhou (código ${out.exitCode ?? '—'}). Veja a saída e use ↻ para repetir.`, 'failed');
   host.status(el('composer-summary').textContent!);
  } catch (error) {
   if (token !== epoch) return;
   const text = String((error as Error)?.message ?? error);
   // Composer ausente ou caminho errado: abre a configuração do executável na hora.
   if (/não encontrado|not found|Docker CLI|curl/i.test(text) && !/composer\.json/.test(text)) { summary(text, 'missing'); showConfig(true); }
   else summary(msg`${text} · Corrija e tente novamente.`, 'error');
   host.status(tr('Falha ao executar o Composer'));
  } finally {
   if (token === epoch) { running = undefined; controls(); await load(); host.changed(); }
  }
 }
 panel.querySelectorAll<HTMLButtonElement>('[data-composer]').forEach(b => b.onclick = () => void run({ action: b.dataset.composer as Request['action'], ...(b.dataset.composer === 'dump-autoload' ? { optimize: true } : {}) }));
 el('composer-script').onchange = controls;
 el('composer-run-script').onclick = () => { const script = el<HTMLSelectElement>('composer-script').value; if (script) void run({ action: 'run-script', script }); };
 el('composer-stop').onclick = () => { if (running) void api.composerCancel(running).catch(error => summary(String(error), 'error')); };

 // Diálogo Require: busca pública do Packagist (pelo backend), versões do pacote escolhido e nome digitado como alternativa.
 const dialog = el<HTMLDialogElement>('composer-dialog'); let chosen = ''; let searchToken = 0; let timer: ReturnType<typeof setTimeout> | undefined;
 const valid = (name: string) => /^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*$|^(php|ext-[a-z0-9_-]+)$/.test(name);
 function choose(name: string) {
  chosen = name; el<HTMLButtonElement>('composer-add').disabled = !valid(name);
  el('composer-results').querySelectorAll('[role=option]').forEach(o => o.setAttribute('aria-selected', String((o as HTMLElement).dataset.name === name)));
  const datalist = el('composer-versions'); datalist.replaceChildren();
  if (!name.includes('/')) return;
  const token = ++searchToken;
  void api.composerVersions(name).then(list => { if (token !== searchToken) return; datalist.replaceChildren(...list.map(v => new Option(v))); el('composer-search-state').textContent = list.length ? msg`${name}: ${list.length} versões (mais recente: ${list[0]})` : msg`${name}: sem versões estáveis publicadas`; }).catch(() => {});
 }
 async function search() {
  const query = el<HTMLInputElement>('composer-query').value.trim(); const state = el('composer-search-state'); const results = el('composer-results');
  if (valid(query.toLowerCase())) choose(query.toLowerCase()); else { chosen = ''; el<HTMLButtonElement>('composer-add').disabled = true; }
  if (query.length < 2) { results.replaceChildren(); state.textContent = ''; return; }
  const token = ++searchToken; state.textContent = tr('Buscando no Packagist…');
  try {
   const found = await api.composerSearch(query); if (token !== searchToken) return;
   results.replaceChildren(...found.map(p => {
    const option = document.createElement('button'); option.type = 'button'; option.setAttribute('role', 'option'); option.dataset.name = p.name; option.setAttribute('aria-selected', String(p.name === chosen));
    const name = document.createElement('strong'); name.textContent = p.name;
    const meta = document.createElement('small'); meta.textContent = `${p.downloads.toLocaleString()} downloads${p.abandoned ? tr(' · abandonado') : ''}`;
    const description = document.createElement('span'); description.textContent = p.description;
    option.append(name, meta, description); option.onclick = () => choose(p.name); option.ondblclick = () => { choose(p.name); add(); };
    return option;
   }));
   state.textContent = found.length ? msg`${found.length} resultado(s) · clique para escolher` : tr('Nenhum pacote encontrado. Você ainda pode digitar o nome completo (vendor/pacote).');
  } catch (error) { if (token === searchToken) state.textContent = String((error as Error)?.message ?? error); }
 }
 function add() {
  if (!valid(chosen)) return;
  const constraint = el<HTMLInputElement>('composer-constraint').value.trim();
  dialog.close(); void run({ action: 'require', packages: [constraint ? `${chosen}:${constraint}` : chosen], dev: el<HTMLInputElement>('composer-dev').checked });
 }
 el('composer-query').oninput = () => { clearTimeout(timer); timer = setTimeout(() => void search(), 350); };
 el('composer-add').onclick = event => { event.preventDefault(); add(); };
 el('composer-require').onclick = () => { chosen = ''; el<HTMLInputElement>('composer-query').value = ''; el<HTMLInputElement>('composer-constraint').value = ''; el('composer-results').replaceChildren(); el('composer-search-state').textContent = ''; el<HTMLButtonElement>('composer-add').disabled = true; dialog.showModal(); el('composer-query').focus(); };

 function hide() { panel.hidden = true; button.setAttribute('aria-pressed', 'false'); }
 function show() { open(); void load(); }
 button.onclick = () => panel.hidden ? show() : hide(); el('composer-hide').onclick = hide;
 runnerLabel(); controls();
 // UI-KEYMAP-001: ações principais no keymap central, sem atalho padrão (aparecem no Search Everywhere e na tela Keymap).
 const composerAction = (id: string, label: string, selector: string, aliases: string) => keymap.registerAction({ id, label, category: 'Composer', aliases: 'composer php ' + aliases, defaults: {},
  enabled: () => !panel.querySelector<HTMLButtonElement>(selector)?.disabled, run: () => { if (panel.hidden) show(); panel.querySelector<HTMLButtonElement>(selector)?.click(); } });
 keymap.registerAction({ id: 'tool.composer', label: 'Composer', category: 'Janelas de ferramentas', aliases: 'composer dependências pacotes packages', defaults: {}, run: () => panel.hidden ? show() : hide() });
 composerAction('composer.install', 'Composer: install', '[data-composer="install"]', 'install instalar');
 composerAction('composer.update', 'Composer: update', '[data-composer="update"]', 'update atualizar');
 composerAction('composer.dumpAutoload', 'Composer: dump-autoload', '[data-composer="dump-autoload"]', 'dump autoload');
 composerAction('composer.validate', 'Composer: validate', '[data-composer="validate"]', 'validate validar');
 composerAction('composer.require', 'Composer: adicionar pacote (require)', '#composer-require', 'require adicionar pacote package');
 window.addEventListener('ide-workspace-file-changed', event => { if (!panel.hidden && !running && /(^|\/)composer\.(json|lock)$/.test(String((event as CustomEvent).detail?.path ?? ''))) void load(); });
 return {
  run: (request: Request) => { void load(); return run(request); },
  reset() { const id = running; epoch++; running = undefined; last = undefined; buffer = ''; output.textContent = ''; rows = []; if (id) void api.composerCancel(id).catch(() => {}); summary(tr('Use as ações acima ou o ▶ no composer.json.')); hide(); controls(); },
 };
}
