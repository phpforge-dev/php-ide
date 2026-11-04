import * as monaco from 'monaco-editor';
import { t, msg } from './i18n';
import { keymap } from './keymap';
import { dockWindow, resizeToolWindow } from './tool-window';
import { fileIcon } from './file-icons';
import { openMenu, type MenuItem } from './context-menu';
import './problems.css';
// UI-PROBLEMS-001 — Problems tool window. Observed on PhpStorm 2026.1.4 (captures 50–52, 2026-11-03): clicking the
// inspection widget counts opens it on the "File" tab (title "File 6"), a file node (icon, name, dimmed path) over
// one row per problem (severity icon, message, dimmed ":line"), errors first then by line, first row selected;
// "Project Errors" lists errors only and says "No errors found by the IDE." when empty; the eye button opens
// Show (Warning, Weak Warning, Server Problem, Show Other Problems) / Sort By (Severity, Name) / Group by Inspection.
// Public help: Alt+6 (⌘6 on macOS), double-click/Enter/F4 opens the problem in the editor. Our own drawing.
// Not reproduced: Server Problem (no server-side inspections here), Vulnerable Dependencies, Qodana, AI tabs.

type Hooks = {
 /** Project-relative path of a model URI, or undefined for buffers that are not project files. */
 pathOf(uri: monaco.Uri): string | undefined;
 open(path: string, line: number, column: number): Promise<void>;
 status(text: string): void;
};
type Options = { warning: boolean; weak: boolean; other: boolean; sort: 'severity' | 'name'; group: boolean };
type Tab = 'file' | 'project';
const STORAGE = 'php-ide-problems';
const S = monaco.MarkerSeverity;
const severityKind = (severity: monaco.MarkerSeverity) => severity === S.Error ? 'error' : severity === S.Warning ? 'warning' : severity === S.Info ? 'weak' : 'other';
const severityLabel: Record<string, string> = { error: 'Erro', warning: 'Aviso', weak: 'Aviso fraco', other: 'Outro problema' };
const ICONS: Record<string, string> = {
 error: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="currentColor"/><path d="M8 4.5v4.5M8 11.2v.3" stroke="var(--ij-island)" stroke-width="1.6" stroke-linecap="round"/></svg>',
 warning: '<svg viewBox="0 0 16 16"><path d="M8 1.8l6.6 11.7H1.4z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M8 6v3.6M8 11.6v.2" stroke="var(--ij-island)" stroke-width="1.5" stroke-linecap="round"/></svg>',
 other: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 7.2v4M8 4.8v.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};
const TOOL_ICONS: Record<string, string> = {
 options: '<svg viewBox="0 0 16 16"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M12 13.5l1.5 1.5 1.5-1.5" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
 fix: '<svg viewBox="0 0 16 16"><path d="M5.5 10.5c-1.2-.9-2-2.2-2-3.7a4.5 4.5 0 0 1 9 0c0 1.5-.8 2.8-2 3.7V12h-5z" fill="currentColor" opacity=".9"/><path d="M6 13.5h4" stroke="currentColor" stroke-width="1.2"/></svg>',
 expand: '<svg viewBox="0 0 16 16"><path d="M4.5 6.5L8 3l3.5 3.5M4.5 9.5L8 13l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 collapse: '<svg viewBox="0 0 16 16"><path d="M4.5 3L8 6.5 11.5 3M4.5 13L8 9.5l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 open: '<svg viewBox="0 0 16 16"><path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M12 9.5v4H2.5V4h4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const icon = (kind: string) => { const span = document.createElement('span'); span.className = 'problem-icon problem-' + kind; span.setAttribute('aria-hidden', 'true'); span.innerHTML = ICONS[kind === 'weak' ? 'warning' : kind]; return span; };

export function mountProblems(editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 let options: Options = { warning: true, weak: true, other: true, sort: 'severity', group: false };
 try { options = { ...options, ...JSON.parse(localStorage.getItem(STORAGE) ?? '{}') }; } catch { /* defaults */ }
 const saveOptions = () => { try { localStorage.setItem(STORAGE, JSON.stringify(options)); } catch { /* kept for this session */ } };
 let tab: Tab = 'file';
 const collapsed = new Set<string>();
 let selected = '';

 const panel = document.createElement('section'); panel.id = 'problems-panel'; panel.className = 'problems-panel'; panel.hidden = true; panel.setAttribute('aria-label', t('Problemas'));
 const resize = document.createElement('div'); resize.className = 'tool-window-resize'; resize.setAttribute('role', 'separator'); resize.tabIndex = 0; resize.setAttribute('aria-orientation', 'horizontal'); resize.setAttribute('aria-label', t('Altura de Problemas'));
 const head = document.createElement('div'); head.className = 'tool-window-head problems-head';
 const title = document.createElement('strong'); title.textContent = t('Problemas');
 const tabs = document.createElement('div'); tabs.className = 'problems-tabs'; tabs.setAttribute('role', 'tablist');
 const tabButton = (id: Tab) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = id; b.onclick = () => { tab = id; render(); }; tabs.append(b); return b; };
 const fileTab = tabButton('file'), projectTab = tabButton('project');
 const space = document.createElement('span'); space.className = 'tool-window-space';
 const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'problems-hide'; hide.textContent = '−'; hide.title = t('Ocultar'); hide.setAttribute('aria-label', t('Ocultar Problemas'));
 head.append(title, tabs, space, hide);
 const body = document.createElement('div'); body.className = 'problems-body';
 const toolbar = document.createElement('div'); toolbar.className = 'problems-toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-orientation', 'vertical'); toolbar.setAttribute('aria-label', t('Ações de Problemas'));
 const tool = (action: string, label: string, run: (button: HTMLButtonElement) => void) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.problemsAction = action; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = TOOL_ICONS[action]; b.onclick = () => run(b); toolbar.append(b); return b; };
 const list = document.createElement('div'); list.className = 'problems-list'; list.setAttribute('role', 'tree'); list.tabIndex = 0; list.setAttribute('aria-label', t('Problemas'));
 const empty = document.createElement('div'); empty.className = 'problems-empty'; empty.hidden = true;
 body.append(toolbar, list, empty); panel.append(resize, head, body);
 document.querySelector('.code')!.append(panel);
 resizeToolWindow(panel, resize, 'php-ide-problems-height', 140);

 const button = document.createElement('button'); button.id = 'show-problems'; button.type = 'button'; button.dataset.ijIcon = 'problems'; button.setAttribute('aria-pressed', 'false');
 button.setAttribute('aria-label', t('Problemas')); button.title = t('Problemas');
 document.querySelector('.left-rail')?.append(button);
 const close = () => { panel.hidden = true; button.setAttribute('aria-pressed', 'false'); };
 const dock = dockWindow(panel, button, close);
 const show = (which?: Tab) => { if (which) tab = which; dock(); render(); list.focus(); };
 const toggle = () => { if (panel.hidden) show(); else { close(); editor.focus(); } };
 button.onclick = toggle; hide.onclick = () => { close(); editor.focus(); };
 window.addEventListener('ide-show-problems', event => show((event as CustomEvent).detail?.tab));

 // --- data ---------------------------------------------------------------------------------
 type Problem = { key: string; marker: monaco.editor.IMarker; kind: string };
 type Group = { key: string; path: string; uri: monaco.Uri; problems: Problem[] };
 const visibleKind = (kind: string) => kind === 'error' || (kind === 'warning' && options.warning) || (kind === 'weak' && options.weak) || (kind === 'other' && options.other);
 const keyOf = (m: monaco.editor.IMarker) => [m.resource.toString(), m.owner, m.startLineNumber, m.startColumn, m.message].join('|');
 const compare = (a: Problem, b: Problem) => options.sort === 'name'
  ? a.marker.message.localeCompare(b.marker.message) || a.marker.startLineNumber - b.marker.startLineNumber
  : b.marker.severity - a.marker.severity || a.marker.startLineNumber - b.marker.startLineNumber || a.marker.startColumn - b.marker.startColumn;
 function groups(): Group[] {
  const all = tab === 'file' ? (editor.getModel() ? monaco.editor.getModelMarkers({ resource: editor.getModel()!.uri }) : []) : monaco.editor.getModelMarkers({}).filter(m => m.severity === S.Error);
  const byFile = new Map<string, Group>();
  for (const marker of all) {
   const kind = severityKind(marker.severity); if (!visibleKind(kind)) continue;
   const path = hooks.pathOf(marker.resource); if (!path && tab === 'project') continue;
   const id = marker.resource.toString();
   const group = byFile.get(id) ?? { key: id, path: path ?? marker.resource.path.split('/').pop() ?? id, uri: marker.resource, problems: [] };
   group.problems.push({ key: keyOf(marker), marker, kind }); byFile.set(id, group);
  }
  return [...byFile.values()].map(g => ({ ...g, problems: g.problems.sort(compare) })).sort((a, b) => a.path.localeCompare(b.path));
 }
 const count = (which: Tab) => { const keep = tab; tab = which; const total = groups().reduce((n, g) => n + g.problems.length, 0); tab = keep; return total; };

 // --- rendering ------------------------------------------------------------------------------
 const rows = () => [...list.querySelectorAll<HTMLElement>('[role=treeitem]')].filter(row => !row.closest('[role=group][hidden]'));
 const select = (row: HTMLElement | undefined, focus = true) => {
  if (!row) return; selected = row.dataset.key!;
  for (const item of list.querySelectorAll('[aria-selected=true]')) item.setAttribute('aria-selected', 'false');
  row.setAttribute('aria-selected', 'true'); list.setAttribute('aria-activedescendant', row.id); row.scrollIntoView({ block: 'nearest' });
  if (focus) list.focus();
 };
 let rowId = 0;
 function problemRow(problem: Problem, path: string, level: number) {
  const row = document.createElement('div'); row.className = 'problem-row'; row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', String(level)); row.id = 'problem-' + (++rowId);
  row.dataset.key = problem.key; row.dataset.path = path; row.dataset.line = String(problem.marker.startLineNumber); row.dataset.column = String(problem.marker.startColumn);
  const message = document.createElement('span'); message.className = 'problem-message'; message.textContent = problem.marker.message;
  const line = document.createElement('span'); line.className = 'problem-line'; line.textContent = ' :' + problem.marker.startLineNumber;
  row.append(icon(problem.kind), message, line);
  row.title = t(severityLabel[problem.kind]) + ': ' + problem.marker.message + (problem.marker.source ? ' · ' + problem.marker.source : '');
  row.onmousedown = event => { if (event.detail > 1) event.preventDefault(); };
  row.onclick = () => select(row); row.ondblclick = () => void navigate(row);
  return row;
 }
 function fileRow(group: Group) {
  const row = document.createElement('div'); row.className = 'problem-file'; row.setAttribute('role', 'treeitem'); row.setAttribute('aria-level', '1'); row.id = 'problem-' + (++rowId); row.dataset.key = 'file:' + group.key;
  const open = !collapsed.has(group.key); row.setAttribute('aria-expanded', String(open));
  const name = document.createElement('span'); name.className = 'problem-file-name'; name.textContent = group.path.split('/').pop()!;
  const where = document.createElement('span'); where.className = 'problem-file-path'; where.textContent = group.path.includes('/') ? group.path.slice(0, group.path.lastIndexOf('/')) : '';
  const total = document.createElement('span'); total.className = 'problem-file-count'; total.textContent = tab === 'project' ? msg`${group.problems.length} erro(s)` : '';
  const model = monaco.editor.getModel(group.uri);
  row.append(fileIcon(group.path, false, model?.getValue()), name, where, total);
  row.onclick = event => { select(row); if ((event.target as Element).closest('.problem-file-name, .resource-icon') || event.offsetX < 18) toggleGroup(group.key); };
  row.ondblclick = () => toggleGroup(group.key);
  return row;
 }
 const toggleGroup = (key: string, open?: boolean) => { if (open ?? collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); render(); };
 function render() {
  if (panel.hidden) { updateCounts(); return; }
  updateCounts();
  const all = groups(); list.replaceChildren();
  for (const group of all) {
   list.append(fileRow(group));
   const children = document.createElement('div'); children.setAttribute('role', 'group'); children.hidden = collapsed.has(group.key);
   if (options.group) {
    const byInspection = new Map<string, Problem[]>();
    for (const p of group.problems) { const name = String(typeof p.marker.code === 'object' ? p.marker.code.value : p.marker.code ?? p.marker.source ?? p.marker.owner); byInspection.set(name, [...byInspection.get(name) ?? [], p]); }
    for (const [name, problems] of [...byInspection].sort((a, b) => a[0].localeCompare(b[0]))) {
     const node = document.createElement('div'); node.className = 'problem-inspection'; node.setAttribute('role', 'treeitem'); node.setAttribute('aria-level', '2'); node.id = 'problem-' + (++rowId); node.dataset.key = 'inspection:' + group.key + name;
     node.textContent = name + ' '; const n = document.createElement('span'); n.className = 'problem-line'; n.textContent = String(problems.length); node.append(n); node.onclick = () => select(node);
     children.append(node, ...problems.map(p => problemRow(p, group.path, 3)));
    }
   } else children.append(...group.problems.map(p => problemRow(p, group.path, 2)));
   list.append(children);
  }
  const fileName = editor.getModel() ? hooks.pathOf(editor.getModel()!.uri)?.split('/').pop() ?? editor.getModel()!.uri.path.split('/').pop() : undefined;
  empty.hidden = all.length > 0; list.hidden = !empty.hidden;
  empty.textContent = tab === 'project' ? t('Nenhum erro encontrado pela IDE.') : fileName ? msg`Nenhum problema em ${fileName}` : t('Nenhum arquivo aberto');
  const wanted = rows().find(row => row.dataset.key === selected) ?? rows().find(row => row.classList.contains('problem-row'));
  if (wanted) select(wanted, false);
  toolbar.querySelectorAll<HTMLElement>('[data-problems-action=expand],[data-problems-action=collapse]').forEach(b => { b.hidden = tab !== 'project'; });
 }
 function updateCounts() {
  const files = count('file');
  fileTab.replaceChildren(t('Arquivo')); if (files) { const badge = document.createElement('span'); badge.className = 'problems-count'; badge.textContent = String(files); fileTab.append(' ', badge); }
  projectTab.textContent = t('Erros do projeto');
  for (const b of [fileTab, projectTab]) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
 }
 async function navigate(row: HTMLElement | undefined) {
  if (!row?.dataset.line) return;
  await hooks.open(row.dataset.path!, Number(row.dataset.line), Number(row.dataset.column));
  editor.focus();
 }

 // --- toolbar --------------------------------------------------------------------------------
 const check = (label: string, on: boolean, change: () => void): MenuItem => ({ label, checked: on, run: () => { change(); saveOptions(); render(); } });
 tool('options', t('Opções de exibição'), b => {
  const r = b.getBoundingClientRect();
  openMenu([
   { label: t('Mostrar'), heading: true },
   check(t('Aviso'), options.warning, () => { options.warning = !options.warning; }),
   check(t('Aviso fraco'), options.weak, () => { options.weak = !options.weak; }),
   check(t('Mostrar outros problemas'), options.other, () => { options.other = !options.other; }),
   '-',
   { label: t('Ordenar por'), heading: true },
   check(t('Severidade'), options.sort === 'severity', () => { options.sort = 'severity'; }),
   check(t('Nome'), options.sort === 'name', () => { options.sort = 'name'; }),
   '-',
   check(t('Agrupar por inspeção'), options.group, () => { options.group = !options.group; }),
  ], r.left, r.bottom + 2, { restore: list, label: t('Opções de exibição') });
 });
 tool('fix', t('Mostrar correções rápidas') + ' (⌥↩)', () => void quickFix());
 tool('expand', t('Expandir tudo'), () => { collapsed.clear(); render(); });
 tool('collapse', t('Recolher tudo'), () => { for (const g of groups()) collapsed.add(g.key); render(); });
 tool('open', t('Abrir no editor') + ' (F4)', () => void navigate(list.querySelector<HTMLElement>('[aria-selected=true]') ?? undefined));
 async function quickFix() {
  const row = list.querySelector<HTMLElement>('.problem-row[aria-selected=true]'); if (!row) { hooks.status(t('Selecione um problema.')); return; }
  await navigate(row); editor.trigger('problems', 'editor.action.quickFix', {});
 }

 list.addEventListener('keydown', event => {
  const all = rows(); const current = list.querySelector<HTMLElement>('[aria-selected=true]'); const at = current ? all.indexOf(current) : -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); select(all[Math.max(0, Math.min(all.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]); }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); select(event.key === 'Home' ? all[0] : all.at(-1)); }
  else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
   event.preventDefault(); if (!current) return;
   const file = current.classList.contains('problem-file') ? current : current.closest('[role=group]')?.previousElementSibling as HTMLElement | null;
   const key = file?.dataset.key?.slice(5); if (!key) return;
   if (event.key === 'ArrowLeft') { if (current !== file) select(file!); else toggleGroup(key, false); }
   else if (collapsed.has(key)) toggleGroup(key, true); else if (current === file) select(all[at + 1]);
  }
  else if (event.key === 'Enter' || event.key === 'F4') { event.preventDefault(); if (current?.classList.contains('problem-file')) toggleGroup(current.dataset.key!.slice(5)); else void navigate(current ?? undefined); }
  else if (event.key === 'Escape') { event.preventDefault(); editor.focus(); }
 });

 let frame = 0;
 const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };
 monaco.editor.onDidChangeMarkers(schedule); editor.onDidChangeModel(schedule);
 keymap.registerAction({ id: 'tool.problems', label: 'Problemas', category: 'Janelas de ferramentas', aliases: 'problems inspections erros avisos warnings', defaults: { mac: 'Alt+6', other: 'Alt+6' }, jetbrains: { mac: 'Meta+6' }, run: toggle });
 const hint = () => { const key = keymap.shortcut('tool.problems'); button.title = t('Problemas') + (key ? ' · ' + key : ''); };
 keymap.onChange(hint); hint();
 render();
 return { show, hide: close, element: panel };
}
