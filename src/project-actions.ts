import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import type { IdeApi, LocalRevision } from '../shared/contracts';
/** Optional language contribution used by the generic project tree. */
type Refactorings={
 classIn(path:string):Promise<{fqn:string;name:string}|undefined>;
 renameClass(fqn:string,options?:{name?:string;file?:string;fromTree?:boolean;strings?:boolean}):Promise<void>;
 moveClassFile(path:string,directory:string,namespace:string):Promise<void>;
};
import { keymap } from './keymap';
// Menu de contexto da árvore do projeto: Novo, Recortar/Copiar/Colar, Copiar caminho, Encontrar
// usos, Refatorar (renomear/mover/copiar/excluir), Abrir em e Histórico local. Estrutura de menu
// e atalhos seguem a ajuda pública do PhpStorm; rótulos, diálogos e comportamento são próprios.
export type ProjectHooks = {
 status(text: string): void;
 refresh(): Promise<void>;
 open(path: string, line?: number, column?: number): Promise<void>;
 dirtyUnder(path: string): boolean;
 relocate(from: string, to?: string): Promise<void>;
 reload(path: string): Promise<void>;
 findUsages(path: string, line: number, column: number): Promise<void>;
 terminal(cwd: string): Promise<void>;
 language(path: string): string | undefined;
 /** Rename/Move de classe com referências (recorte 19); ausente, só o arquivo muda. */
 refactor?: Refactorings;
};
type Target = { path: string; directory: boolean };
type Item = { label: string; shortcut?: string; disabled?: boolean; run?: () => unknown; children?: Item[] } | '-';
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
/** Atalho atual da ação no keymap central (UI-KEYMAP-001), para menus e mensagens. */
const sc = (id: string) => keymap.shortcut(id) || undefined;
const base = (path: string) => path.split('/').pop() ?? path;
const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const join = (dir: string, name: string) => dir ? `${dir}/${name}` : name;
const phpDeclaration = /^[ \t]*(?:(?:final|abstract|readonly)\s+)*(class|interface|trait|enum)\s+([A-Za-z_\x80-￿][\w\x80-￿]*)/m;

/** Menu flutuante com submenus e teclado (setas, Enter, Esc). */
function popup(items: Item[], x: number, y: number, onClose: () => void, depth = 0): HTMLElement {
 const menu = document.createElement('div'); menu.className = 'context-menu'; menu.setAttribute('role', 'menu'); menu.dataset.depth = String(depth);
 let child: HTMLElement | undefined;
 const closeChild = () => { child?.remove(); child = undefined; };
 for (const item of items) {
  if (item === '-') { const line = document.createElement('div'); line.className = 'context-separator'; line.setAttribute('role', 'separator'); menu.append(line); continue; }
  const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.disabled = !!item.disabled;
  const label = document.createElement('span'); label.textContent = item.label; const hint = document.createElement('kbd'); hint.textContent = item.children ? '›' : item.shortcut ?? '';
  button.append(label, hint);
  if (item.children) {
   button.setAttribute('aria-haspopup', 'menu');
   const openChild = (focus: boolean) => { if (button.disabled) return; closeChild(); const r = button.getBoundingClientRect(); child = popup(item.children!, r.right - 2, r.top - 4, onClose, depth + 1); button.setAttribute('aria-expanded', 'true'); if (focus) child.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); };
   button.onmouseenter = () => openChild(false); button.onclick = () => openChild(true);
   button.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); openChild(true); } });
  } else {
   button.onmouseenter = () => { closeChild(); button.focus(); };
   button.onclick = () => { onClose(); void item.run?.(); };
  }
  menu.append(button);
 }
 menu.addEventListener('keydown', e => {
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)')];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
  else if (e.key === 'ArrowLeft' && depth > 0) { e.preventDefault(); e.stopPropagation(); const owner = document.querySelector<HTMLButtonElement>(`.context-menu[data-depth="${depth - 1}"] [aria-expanded=true]`); menu.remove(); owner?.removeAttribute('aria-expanded'); owner?.focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  else if (e.key === 'Tab') e.preventDefault();
 });
 document.body.append(menu);
 const r = menu.getBoundingClientRect();
 menu.style.left = Math.max(4, x + r.width > innerWidth ? (depth ? x - r.width * 2 + 4 : innerWidth - r.width - 4) : x) + 'px';
 menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
 return menu;
}

function dialog(title: string, body: (form: HTMLElement) => void, ok = 'OK'): Promise<FormData | undefined> {
 return new Promise(resolve => {
  const d = document.createElement('dialog'); d.className = 'project-dialog';
  d.innerHTML = html('<form method="dialog"><h2></h2><div class="project-dialog-body"></div><p class="project-dialog-error" role="alert"></p><footer><button value="cancel" formnovalidate>Cancelar</button><button value="ok" class="primary"></button></footer></form>');
  d.querySelector('h2')!.textContent = title; d.querySelector<HTMLButtonElement>('.primary')!.textContent = ok;
  const form = d.querySelector('form')!; body(d.querySelector<HTMLElement>('.project-dialog-body')!);
  document.body.append(d); d.showModal();
  const first = d.querySelector<HTMLInputElement>('input,select'); first?.focus();
  const range = first?.dataset.select?.split(',').map(Number); if (first && range) first.setSelectionRange(range[0], range[1]);
  d.addEventListener('close', () => { const data = d.returnValue === 'ok' ? new FormData(form) : undefined; d.remove(); resolve(data); });
 });
}
function field(form: HTMLElement, label: string, name: string, value: string, { range, ...extra }: Omit<Partial<HTMLInputElement>, 'select'> & { range?: string } = {}) {
 const l = document.createElement('label'); l.textContent = label; const input = document.createElement('input'); input.name = name; input.value = value; input.required = true; input.spellcheck = false; Object.assign(input, extra); if (range) input.dataset.select = range; l.append(input); form.append(l); return input;
}
function check(form: HTMLElement, label: string, name: string, checked: boolean) { const l = document.createElement('label'); l.className = 'refactor-check'; const input = document.createElement('input'); input.type = 'checkbox'; input.name = name; input.checked = checked; l.append(input, document.createTextNode(label)); form.append(l); return input; }
function note(form: HTMLElement, text: string) { const p = document.createElement('p'); p.className = 'project-dialog-note'; p.textContent = text; form.append(p); }
/** Seleciona só o nome-base (sem extensões), como no diálogo de renomear de editores comuns. */
function stemRange(name: string) { const dot = name.indexOf('.', 1); return `0,${dot > 0 ? dot : name.length}`; }

export function mountProjectActions(api: IdeApi, hooks: ProjectHooks) {
 const tree = document.getElementById('tree')!; const pane = tree.closest<HTMLElement>('.project-pane') ?? tree;
 let clipboard: { mode: 'copy' | 'cut'; target: Target } | undefined;
 let closeMenu: (() => void) | undefined;
 const run = (fn: () => Promise<unknown>) => { void fn().catch(error => hooks.status(String(error?.message ?? error))); };
 const targetOf = (el: Element | null): Target | undefined => {
  const node = el?.closest<HTMLElement>('#tree button[data-path], #tree summary[data-path]');
  if (node) return { path: node.dataset.path!, directory: node.tagName === 'SUMMARY' };
  const folder = el?.closest<HTMLElement>('#tree details[data-path]'); if (folder) return { path: folder.dataset.path!, directory: true };
  return el && (el.closest('#tree') || el === pane || el.matches('.project-pane > h3')) ? { path: '', directory: true } : undefined;
 };
 const nodeOf = (path: string) => [...tree.querySelectorAll<HTMLElement>('button[data-path], summary[data-path]')].find(n => n.dataset.path === path);
 const markCut = () => { tree.querySelectorAll('.tree-cut').forEach(n => n.classList.remove('tree-cut')); if (clipboard?.mode === 'cut') nodeOf(clipboard.target.path)?.classList.add('tree-cut'); };
 const refresh = async (select?: string) => { await hooks.refresh(); markCut(); if (select !== undefined) await reveal(select); };
 /** Expande os diretórios pais e foca o item na árvore. */
 async function reveal(path: string) {
  const parts = path.split('/'); for (let i = 1; i < parts.length; i++) {
   const details = nodeOf(parts.slice(0, i).join('/'))?.parentElement as HTMLDetailsElement | undefined;
   if (details && !details.open) { details.open = true; const children = details.querySelector(':scope > div')!; for (let n = 0; n < 50 && !children.childElementCount; n++) await new Promise(r => setTimeout(r, 20)); }
  }
  const node = nodeOf(path); node?.focus(); node?.scrollIntoView({ block: 'nearest' });
 }
 const guard = (path: string) => { if (hooks.dirtyUnder(path)) throw Error(msg`Salve as alterações abertas em ${path || tr('projeto')} antes desta operação.`); };
 const dirFor = (t: Target) => t.directory ? t.path : parentOf(t.path);
 async function names(dir: string) { return new Set((await api.tree(dir)).map(e => e.name)); }
 async function unique(dir: string, name: string) {
  const taken = await names(dir); if (!taken.has(name)) return name;
  const dot = name.indexOf('.', 1); const stem = dot > 0 ? name.slice(0, dot) : name; const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 1; ; i++) if (!taken.has(`${stem}_${i}${ext}`)) return `${stem}_${i}${ext}`;
 }
 async function directories() { const dirs = new Set<string>(['']); for (const p of await api.listFiles('', false)) for (let d = parentOf(p); d && !dirs.has(d); d = parentOf(d)) dirs.add(d); return [...dirs].sort(); }
 async function absolute(path: string) { const { root } = await api.workspace(); const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/'; return path ? root.replace(/[\\/]$/, '') + sep + path.split('/').join(sep) : root; }
 // A WebView pode deixar writeText pendente (janela sem foco); o status mostra o texto mesmo assim.
 async function copyText(text: string, what: string) { try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, reject) => setTimeout(() => reject(Error('clipboard')), 1500))]); hooks.status(`${what} copiado: ${text}`); } catch { hooks.status(`${what}: ${text}`); } }
 async function fqn(path: string) {
  const text = (await api.read(path)).text; const m = phpDeclaration.exec(text); if (!m) return undefined;
  const ns = /^[ \t]*namespace\s+([^;{\s]+)/m.exec(text)?.[1]; const offset = m.index + m[0].length - m[2].length; const before = text.slice(0, offset).split('\n');
  return { name: ns ? `${ns}\\${m[2]}` : m[2], line: before.length, column: before.at(-1)!.length + 1 };
 }
 async function namespaceFor(dir: string) {
  let composer: any; try { composer = JSON.parse((await api.read('composer.json')).text); } catch { return ''; }
  const maps = { ...composer?.autoload?.['psr-4'], ...composer?.['autoload-dev']?.['psr-4'] } as Record<string, string | string[]>;
  let best: { prefix: string; path: string } | undefined;
  for (const [prefix, value] of Object.entries(maps)) for (const raw of ([] as string[]).concat(value)) {
   const path = raw.replace(/^\.\//, '').replace(/\/$/, '');
   if ((path === '' || dir === path || dir.startsWith(path + '/')) && (!best || path.length > best.path.length)) best = { prefix, path };
  }
  if (!best) return '';
  const rest = dir.slice(best.path.length).replace(/^\//, '');
  return [best.prefix.replace(/\\+$/, ''), ...(rest ? rest.split('/') : [])].filter(Boolean).join('\\');
 }

 async function create(t: Target, kind: 'file' | 'directory' | 'php') {
  const dir = dirFor(t);
  if (kind === 'php') {
   const ns = await namespaceFor(dir); let select!: HTMLSelectElement;
   const data = await dialog(tr('Nova classe PHP'), form => {
    field(form, tr('Nome'), 'name', '', { pattern: '[A-Za-z_][A-Za-z0-9_]*', title: 'Identificador PHP' });
    const l = document.createElement('label'); l.textContent = tr('Tipo'); select = document.createElement('select'); select.name = 'kind';
    for (const [value, text] of [['class', 'Classe'], ['interface', 'Interface'], ['trait', 'Trait'], ['enum', 'Enum']]) select.add(new Option(text, value)); l.append(select); form.append(l);
    field(form, 'Namespace', 'namespace', ns, { required: false });
    note(form, msg`Diretório: ${dir || '(raiz)'}${ns ? ' · namespace sugerido pelo PSR-4 do composer.json' : ''}`);
   }, tr('Criar'));
   if (!data) return;
   const name = String(data.get('name')); const namespace = String(data.get('namespace')).trim().replace(/^\\|\\$/g, '');
   const text = `<?php\n\n${namespace ? `namespace ${namespace};\n\n` : ''}${data.get('kind')} ${name}\n{\n}\n`;
   const path = await api.fileCreate(join(dir, name + '.php'), 'file', text);
   await refresh(path); await hooks.open(path, namespace ? 5 : 3, 1); hooks.status(`Criado ${path}`); return;
  }
  const data = await dialog(kind === 'file' ? tr('Novo arquivo') : tr('Novo diretório'), form => {
   field(form, tr('Nome'), 'name', '', { placeholder: kind === 'file' ? tr('nome.ext ou pasta/nome.ext') : tr('nome ou a/b/c') });
   note(form, `Em: ${dir || tr('(raiz do projeto)')}`);
  }, tr('Criar'));
  if (!data) return;
  const name = String(data.get('name')).trim().replace(/^\/+|\/+$/g, '');
  const path = await api.fileCreate(join(dir, name), kind);
  await refresh(path); if (kind === 'file') await hooks.open(path); hooks.status(`Criado ${path}`);
 }
 async function rename(t: Target) {
  if (!t.path) return; guard(t.path); const name = base(t.path);
  // Arquivo PSR-4 de classe: oferecer renomear também a classe e as referências (Rename Symbol).
  const cls = !t.directory && name.endsWith('.php') && !name.endsWith('.blade.php') ? await hooks.refactor?.classIn(t.path).catch(() => undefined) : undefined;
  const matches = !!cls && cls.name === name.slice(0, -4);
  const data = await dialog(t.directory ? tr('Renomear diretório') : tr('Renomear arquivo'), form => {
   field(form, tr('Novo nome'), 'name', name, { range: stemRange(name) });
   if (matches) { check(form, msg`Renomear também a classe ${cls!.fqn} e as referências`, 'symbol', true); check(form, tr('Também em comentários e strings (FQN)'), 'strings', false); }
   else if (name.endsWith('.php')) note(form, tr('Só o arquivo é renomeado: ele não declara uma classe com o mesmo nome.'));
  }, tr('Renomear'));
  const next = data && String(data.get('name')).trim(); if (!next || next === name) return;
  const stem = next.endsWith('.php') ? next.slice(0, -4) : '';
  if (matches && data!.get('symbol') && hooks.refactor) {
   if (!/^[A-Za-z_\x80-\uffff][\w\x80-\uffff]*$/.test(stem)) throw Error(msg`"${next}" não gera um nome de classe válido; desmarque a opção de classe para renomear só o arquivo.`);
   await hooks.refactor.renameClass(cls!.fqn, { name: stem, file: t.path, fromTree: false, strings: !!data!.get('strings') }); return;
  }
  await relocateFile(t.path, { name: next });
 }
 /** Renomeia e/ou move sem diálogo; usado também pelas refatorações de classe. */
 async function relocateFile(from: string, target: { name?: string; directory?: string }) {
  let path = from;
  if (target.directory !== undefined && target.directory !== parentOf(path)) { path = await api.fileMove(path, target.directory); move(from, path); }
  if (target.name && target.name !== base(path)) { const renamed = await api.fileRename(path, target.name); move(path, renamed); path = renamed; }
  if (path !== from) { await hooks.relocate(from, path); await refresh(path); hooks.status(msg`Movido/renomeado para ${path}`); }
  return path;
 }
 async function moveTo(t: Target, directory?: string) {
  if (!t.path) return; guard(t.path);
  const cls = !t.directory && t.path.endsWith('.php') && !t.path.endsWith('.blade.php') ? await hooks.refactor?.classIn(t.path).catch(() => undefined) : undefined; let update = false;
  if (directory === undefined) {
   const dirs = await directories();
   const data = await dialog(`Mover ${base(t.path)}`, form => {
    const input = field(form, tr('Para o diretório'), 'directory', parentOf(t.path), { required: false, placeholder: tr('(raiz do projeto)') });
    const list = document.createElement('datalist'); list.id = 'project-dirs'; for (const d of dirs) list.append(new Option(d || tr('(raiz)'), d)); form.append(list); input.setAttribute('list', list.id);
    if (cls) check(form, msg`Atualizar namespace de ${cls.fqn} e as referências (PSR-4 do composer.json)`, 'namespace', true);
    else if (t.path.endsWith('.php')) note(form, tr('O namespace e os usos não são atualizados ao mover.'));
   }, 'Mover');
   if (!data) return; directory = String(data.get('directory')).trim().replace(/^\/+|\/+$/g, ''); update = !!data.get('namespace');
  }
  if (directory === parentOf(t.path)) return;
  if (cls && update && hooks.refactor) { await hooks.refactor.moveClassFile(t.path, directory, await namespaceFor(directory)); return; }
  const path = await api.fileMove(t.path, directory); move(t.path, path); await hooks.relocate(t.path, path); await refresh(path); hooks.status(`Movido para ${path}`);
 }
 async function copyTo(t: Target, directory?: string) {
  if (!t.path) return;
  let dir = directory ?? parentOf(t.path); let name = await unique(dir, base(t.path));
  if (directory === undefined || name !== base(t.path)) {
   const dirs = directory === undefined ? await directories() : [];
   const data = await dialog(msg`Copiar ${base(t.path)}`, form => {
    field(form, tr('Novo nome'), 'name', name, { range: stemRange(name) });
    if (directory === undefined) { const input = field(form, tr('Para o diretório'), 'directory', dir, { required: false, placeholder: tr('(raiz do projeto)') }); const list = document.createElement('datalist'); list.id = 'project-dirs'; for (const d of dirs) list.append(new Option(d || tr('(raiz)'), d)); form.append(list); input.setAttribute('list', list.id); }
    else note(form, msg`Já existe ${base(t.path)} em ${dir || '(raiz)'}.`);
   }, tr('Copiar'));
   if (!data) return; name = String(data.get('name')).trim(); if (directory === undefined) dir = String(data.get('directory')).trim().replace(/^\/+|\/+$/g, '');
  }
  const path = await api.fileCopy(t.path, dir, name); await refresh(path); hooks.status(`Copiado para ${path}`);
 }
 async function remove(t: Target) {
  if (!t.path) return; guard(t.path);
  const data = await dialog(t.directory ? tr('Excluir diretório') : tr('Excluir arquivo'), form => note(form, msg`Excluir ${t.path}${t.directory ? tr(' e todo o conteúdo') : ''}? O conteúdo fica no histórico local do projeto e pode ser restaurado por Histórico local.`), tr('Excluir'));
  if (!data) return;
  let result = await api.fileDelete(t.path);
  if (!result.deleted) {
   const force = await dialog('Arquivos grandes', form => note(form, msg`${result.unrecoverable} arquivo(s) acima de 5 MB não entram no histórico local e não poderão ser restaurados. Excluir mesmo assim?`), tr('Excluir mesmo assim'));
   if (!force) return; result = await api.fileDelete(t.path, true);
  }
  if (clipboard?.target.path === t.path) clipboard = undefined;
  await hooks.relocate(t.path); await refresh(parentOf(t.path)); hooks.status(msg`Excluído ${t.path}`);
 }
 /** Atualiza a área de transferência interna quando o item recortado muda de lugar. */
 function move(from: string, to: string) { if (clipboard && (clipboard.target.path === from || clipboard.target.path.startsWith(from + '/'))) clipboard.target.path = to + clipboard.target.path.slice(from.length); }
 async function paste(t: Target) {
  if (!clipboard) return; const dir = dirFor(t); const { mode, target } = clipboard;
  if (mode === 'cut') { if ((await names(dir)).has(base(target.path)) && parentOf(target.path) !== dir) throw Error(msg`Já existe ${base(target.path)} em ${dir || '(raiz)'}.`); await moveTo(target, dir); clipboard = undefined; markCut(); return; }
  await copyTo(target, dir);
 }
 async function usages(t: Target) {
  if (t.path.endsWith('.php') && !t.directory) { const found = await fqn(t.path); if (found) { await hooks.findUsages(t.path, found.line, found.column); return; } }
  const needle = t.directory ? t.path : base(t.path); if (!needle) return;
  hooks.status(msg`Buscando "${needle}" no projeto…`);
  const result = await api.fileSearch(needle); showMatches(`Usos de ${needle}`, result.matches.filter(m => m.path !== t.path), result.truncated);
 }
 function showMatches(title: string, matches: { path: string; line: number; column: number; text: string }[], truncated: boolean) {
  document.querySelector('.project-matches')?.remove();
  const root = document.createElement('section'); root.className = 'usages-popup project-matches'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
  root.innerHTML = html('<header><strong></strong><span class="usages-count"></span><button aria-label="Fechar resultados">×</button></header><input type="search" aria-label="Filtrar resultados" placeholder="Filtrar por arquivo ou texto…"><div class="usages-results" role="list"></div><footer>Busca textual (sem vendor) · ↑ ↓ navegar · Enter abrir · Esc fechar</footer>');
  root.querySelector('strong')!.textContent = title; root.querySelector('.usages-count')!.textContent = msg`${matches.length}${truncated ? '+' : ''} ocorrência(s)`;
  const close = () => root.remove(); root.querySelector('button')!.onclick = close;
  const results = root.querySelector<HTMLElement>('.usages-results')!; const filter = root.querySelector('input')!;
  const render = () => { results.replaceChildren(); const q = filter.value.toLocaleLowerCase(); const visible = matches.filter(m => (m.path + ' ' + m.text).toLocaleLowerCase().includes(q));
   if (!visible.length) { results.textContent = matches.length ? tr('Nenhum resultado corresponde ao filtro.') : tr('Nenhuma ocorrência encontrada no projeto.'); return; }
   for (const m of visible) { const b = document.createElement('button'); b.type = 'button'; b.className = 'usage-result'; b.setAttribute('role', 'listitem'); const p = document.createElement('span'); p.className = 'usage-path'; p.textContent = `${m.path} : ${m.line}`; const c = document.createElement('code'); c.textContent = m.text; b.append(p, c); b.onclick = () => { close(); run(() => hooks.open(m.path, m.line, m.column)); }; results.append(b); } };
  root.addEventListener('keydown', e => { const buttons = [...results.querySelectorAll<HTMLButtonElement>('button')]; const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
   if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); buttons[(at + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); } else if (e.key === 'Enter' && document.activeElement === filter) { e.preventDefault(); buttons[0]?.click(); } });
  filter.oninput = render; render(); document.body.append(root);
  const rect = tree.getBoundingClientRect(); root.style.left = Math.min(rect.right + 8, innerWidth - 670) + 'px'; root.style.top = Math.max(8, rect.top + 20) + 'px'; filter.focus();
  hooks.status(msg`${matches.length}${truncated ? '+' : ''} ocorrência(s) de texto`);
 }
 async function history(t: Target) {
  let revisions = await api.fileHistory(t.path);
  const d = document.createElement('dialog'); d.className = 'local-history';
  d.innerHTML = html('<header><strong></strong><span></span><button class="close" aria-label="Fechar histórico">×</button></header><div class="local-history-body"><div class="local-history-list" role="listbox" aria-label="Revisões"></div><div class="local-history-view"><div class="local-history-toolbar"><span></span><button class="restore" disabled>Restaurar esta versão</button></div><div class="local-history-diff"></div></div></div>');
  d.querySelector('strong')!.textContent = msg`Histórico local: ${t.path || tr('projeto')}`; d.querySelector('header span')!.textContent = tr('Versão guardada × atual · gravado antes de salvar, renomear, mover, excluir e restaurar');
  document.body.append(d); d.showModal();
  const list = d.querySelector<HTMLElement>('.local-history-list')!; const info = d.querySelector<HTMLElement>('.local-history-toolbar span')!; const restore = d.querySelector<HTMLButtonElement>('.restore')!; const host = d.querySelector<HTMLElement>('.local-history-diff')!;
  let diff: monaco.editor.IStandaloneDiffEditor | undefined; let models: monaco.editor.ITextModel[] = []; let selected: LocalRevision | undefined;
  const dispose = () => { diff?.setModel(null); models.forEach(m => m.dispose()); models = []; };
  const close = () => { dispose(); diff?.dispose(); d.close(); d.remove(); };
  d.querySelector<HTMLButtonElement>('.close')!.onclick = close; d.addEventListener('cancel', e => { e.preventDefault(); close(); });
  async function show(revision: LocalRevision) {
   selected = revision; restore.disabled = true; list.querySelectorAll('[aria-selected]').forEach(b => b.setAttribute('aria-selected', String((b as HTMLElement).dataset.id === revision.id)));
   const [old, current] = await Promise.all([api.fileHistoryContent(revision.id), api.read(revision.path).then(f => f.text).catch(() => null)]);
   if (selected !== revision) return; dispose();
   if (old.text === null) { host.replaceChildren(); host.textContent = tr('Arquivo binário: comparação indisponível. A versão ainda pode ser restaurada.'); diff = undefined; }
   else { if (!diff) { host.replaceChildren(); diff = monaco.editor.createDiffEditor(host, { readOnly: true, automaticLayout: true, renderSideBySide: true, minimap: { enabled: false }, originalEditable: false }); }
    const language = hooks.language(revision.path); models = [monaco.editor.createModel(old.text, language), monaco.editor.createModel(current ?? '', language)]; diff.setModel({ original: models[0], modified: models[1] }); }
   info.textContent = `${revision.path} · ${new Date(revision.time).toLocaleString()} · ${revision.label}${current === null ? tr(' · arquivo ausente no projeto') : old.text === current ? tr(' · igual ao atual') : ''}`;
   restore.disabled = false;
  }
  function render() {
   list.replaceChildren();
   if (!revisions.length) { list.textContent = tr('Nenhuma revisão local ainda. Revisões são gravadas antes de salvar, renomear, mover, excluir ou restaurar pela IDE.'); return; }
   for (const r of revisions) { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'option'); b.dataset.id = r.id; b.setAttribute('aria-selected', 'false');
    const time = document.createElement('strong'); time.textContent = new Date(r.time).toLocaleString(); const label = document.createElement('span'); label.textContent = r.label; b.append(time, label);
    if (r.path !== t.path) { const p = document.createElement('small'); p.textContent = r.path; b.append(p); }
    b.onclick = () => run(() => show(r)); list.append(b); }
  }
  list.addEventListener('keydown', e => { if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return; e.preventDefault(); const items = [...list.querySelectorAll<HTMLButtonElement>('button')]; const at = items.indexOf(document.activeElement as HTMLButtonElement); const next = items[Math.max(0, Math.min(items.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]; next?.focus(); next?.click(); });
  restore.onclick = () => run(async () => {
   if (!selected) return; guard(selected.path); restore.disabled = true;
   const path = await api.fileHistoryRestore(selected.id); await hooks.reload(path); await refresh(); hooks.status(`Restaurado ${path} (${new Date(selected.time).toLocaleString()})`);
   revisions = await api.fileHistory(t.path); render(); const again = revisions.find(r => r.id === selected!.id); if (again) await show(again);
  });
  render(); if (revisions[0]) { list.querySelector<HTMLButtonElement>('button')?.focus(); await show(revisions[0]); }
 }

 function items(t: Target): Item[] {
  const file = !t.directory; const root = !t.path; const php = file && t.path.endsWith('.php'); const opener = mac ? 'Finder' : navigator.platform.startsWith('Win') ? 'Explorer' : 'gerenciador de arquivos';
  const act = (fn: () => Promise<unknown>) => () => run(fn);
  return [
   { label: tr('Novo'), children: [
    { label: tr('Arquivo…'), run: act(() => create(t, 'file')) },
    { label: tr('Diretório…'), run: act(() => create(t, 'directory')) },
    { label: 'Classe PHP…', run: act(() => create(t, 'php')) },
   ] },
   '-',
   { label: tr('Recortar'), shortcut: sc('project.cut'), disabled: root, run: () => { clipboard = { mode: 'cut', target: t }; markCut(); hooks.status(msg`Recortado ${t.path}: cole em um diretório com ${sc('project.paste') ?? tr('Colar')}`); } },
   { label: tr('Copiar'), shortcut: sc('project.copy'), disabled: root, run: () => { clipboard = { mode: 'copy', target: t }; markCut(); hooks.status(msg`Copiado ${t.path}: cole em um diretório com ${sc('project.paste') ?? tr('Colar')}`); } },
   { label: tr('Copiar caminho/referência'), children: [
    { label: 'Caminho absoluto', shortcut: sc('project.copyAbsolutePath'), run: act(async () => copyText(await absolute(t.path), 'Caminho absoluto')) },
    { label: tr('Caminho a partir da raiz do projeto'), shortcut: sc('project.copyRelativePath'), run: act(async () => copyText(t.path || '.', 'Caminho relativo')) },
    { label: file ? tr('Nome do arquivo') : tr('Nome do diretório'), run: act(async () => copyText(root ? base((await api.workspace()).root.replace(/[\\/]$/, '')) : base(t.path), tr('Nome'))) },
    { label: 'URI file://', run: act(async () => { const info = await api.workspace() as any; copyText(new URL(t.path.split('/').map(encodeURIComponent).join('/'), info.rootUri).href, 'URI'); }) },
    { label: tr('Referência PHP (FQN)'), disabled: !php, run: act(async () => { const found = await fqn(t.path); if (!found) throw Error(tr('Nenhuma classe, interface, trait ou enum declarada neste arquivo.')); await copyText(found.name, tr('Referência')); }) },
   ] },
   { label: clipboard ? msg`Colar ${base(clipboard.target.path)}` : tr('Colar'), shortcut: sc('project.paste'), disabled: !clipboard, run: act(() => paste(t)) },
   '-',
   { label: 'Encontrar usos', shortcut: sc('project.findUsages'), disabled: root, run: act(() => usages(t)) },
   '-',
   { label: 'Refatorar', disabled: root, children: [
    { label: tr('Renomear…'), shortcut: sc('project.rename'), run: act(() => rename(t)) },
    { label: 'Mover…', shortcut: sc('project.move'), run: act(() => moveTo(t)) },
    { label: tr('Copiar…'), shortcut: sc('project.copyTo'), run: act(() => copyTo(t)) },
    '-',
    { label: tr('Excluir…'), shortcut: sc('project.delete'), run: act(() => remove(t)) },
   ] },
   { label: tr('Excluir…'), shortcut: sc('project.delete'), disabled: root, run: act(() => remove(t)) },
   '-',
   { label: tr('Abrir em'), children: [
    { label: mac ? 'Mostrar no Finder' : `Mostrar no ${opener}`, run: act(async () => { await api.fileReveal(t.path); hooks.status(`Aberto no ${opener}`); }) },
    { label: tr('Aplicativo padrão do sistema'), disabled: !file, run: act(async () => { await api.fileOpenDefault(t.path); hooks.status(msg`Aberto no aplicativo padrão: ${t.path}`); }) },
    { label: 'Terminal', run: act(() => hooks.terminal(dirFor(t))) },
   ] },
   { label: tr('Histórico local'), children: [
    { label: root ? tr('Mostrar histórico do projeto') : tr('Mostrar histórico'), run: act(() => history(t)) },
   ] },
  ];
 }
 function openMenu(t: Target, x: number, y: number, only?: string) {
  closeMenu?.(); const node = t.path ? nodeOf(t.path) : undefined; node?.classList.add('tree-context');
  const previous = document.activeElement as HTMLElement | null;
  let list = items(t); if (only) list = (list.find(i => i !== '-' && i.label === only) as any)?.children ?? list;
  const close = () => { const refocus = !!document.activeElement?.closest('.context-menu'); document.querySelectorAll('.context-menu').forEach(m => m.remove()); node?.classList.remove('tree-context'); document.removeEventListener('mousedown', outside, true); window.removeEventListener('blur', close); closeMenu = undefined; if (refocus) (node ?? previous)?.focus(); };
  const outside = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.context-menu')) close(); };
  closeMenu = close; popup(list, x, y, close).querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  document.addEventListener('mousedown', outside, true); window.addEventListener('blur', close);
 }
 pane.addEventListener('contextmenu', e => { const t = targetOf(e.target as Element); if (!t) return; e.preventDefault(); (t.path ? nodeOf(t.path) : undefined)?.focus(); openMenu(t, e.clientX, e.clientY); });
 // UI-KEYMAP-001: atalhos da árvore são ações do keymap central no contexto 'project-node' (botão
 // ou summary de um nó focado), editáveis na tela Keymap. Padrões iguais aos anteriores (ajuda pública do PhpStorm).
 keymap.defineContext('project-node', el => !!el?.closest('#tree') && !!el.matches?.('button, summary') && !!targetOf(el));
 const at = (el: Element | null) => { const r = (el as HTMLElement).getBoundingClientRect(); return [r.left + 24, r.bottom] as const; };
 const treeAction = (id: string, label: string, mac_: string | string[], other: string | string[], work: (t: Target, el: Element) => void, aliases = '') =>
  keymap.registerAction({ id, label, category: 'Projeto', aliases, context: 'project-node', defaults: { mac: mac_, other }, run: ({ target }) => { const t = target && targetOf(target); if (t && target) work(t, target); } });
 treeAction('project.contextMenu', 'Menu de contexto do projeto', ['ContextMenu', 'Shift+F10'], ['ContextMenu', 'Shift+F10'], (t, el) => openMenu(t, ...at(el)), 'context menu');
 treeAction('project.copyRelativePath', 'Copiar caminho a partir da raiz do projeto', 'Alt+Shift+Meta+C', 'Ctrl+Alt+Shift+C', t => run(() => copyText(t.path || '.', 'Caminho relativo')), 'copy path');
 treeAction('project.copyAbsolutePath', 'Copiar caminho absoluto', 'Shift+Meta+C', 'Ctrl+Shift+C', t => run(async () => copyText(await absolute(t.path), 'Caminho absoluto')), 'copy path');
 treeAction('project.copy', 'Copiar arquivo ou diretório', 'Meta+C', 'Ctrl+C', t => { if (!t.path) return; clipboard = { mode: 'copy', target: t }; markCut(); hooks.status(`Copiado ${t.path}`); }, 'copy');
 treeAction('project.cut', 'Recortar arquivo ou diretório', 'Meta+X', 'Ctrl+X', t => { if (!t.path) return; clipboard = { mode: 'cut', target: t }; markCut(); hooks.status(`Recortado ${t.path}`); }, 'cut');
 treeAction('project.paste', 'Colar no projeto', 'Meta+V', 'Ctrl+V', t => run(() => paste(t)), 'paste');
 treeAction('project.new', 'Novo arquivo ou diretório', 'Meta+N', 'Alt+Insert', (t, el) => openMenu(t, ...at(el), tr('Novo')), 'new file directory class');
 treeAction('project.rename', 'Renomear arquivo ou diretório', 'Shift+F6', 'Shift+F6', t => run(() => rename(t)), 'rename refactor');
 treeAction('project.move', 'Mover arquivo ou diretório', 'F6', 'F6', t => run(() => moveTo(t)), 'move refactor');
 treeAction('project.copyTo', 'Copiar arquivo ou diretório para…', 'F5', 'F5', t => run(() => copyTo(t)), 'copy refactor');
 treeAction('project.findUsages', 'Encontrar usos do arquivo', 'Alt+F7', 'Alt+F7', t => run(() => usages(t)), 'find usages');
 treeAction('project.delete', 'Excluir arquivo ou diretório', ['Meta+Backspace', 'Delete'], 'Delete', t => run(() => remove(t)), 'delete remove');
 return { open: openMenu, reveal, markCut, relocateFile };
}
