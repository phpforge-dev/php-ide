import * as monaco from 'monaco-editor';
import { t, msg } from './i18n';
import { keymap } from './keymap';
import { openMenu, type MenuItem } from './context-menu';
import { structureOf, symbolPath, referenceOf } from './code-structure';
import { pluginServices } from './plugin-services';
import { runMenuItems } from './run-context';
import { compareWithClipboard } from './compare-clipboard';
import './editor-menu.css';
// UI-CONTEXT-001 — editor context menu in place of Monaco's. Order and labels observed on PhpStorm 2026.1.4
// (capture 31, 2026-10-23): Show Context Actions · AI Actions | Paste · Copy / Paste Special · Column Selection
// Mode | Find Usages · Go To | Folding | Rename… · Refactor · Generate… | Run · Debug · More Run/Debug | Open In |
// Local History · Git | Compare with Clipboard · snippets · Diagrams | AI chat. Cut/Copy appear with a selection
// (public help; the capture had none). Left out, rather than shown dead: AI, Generate, Run/Debug configurations,
// Compare with Clipboard, snippets/gists and Diagrams. Shortcuts are the ones that work here (keymap or Monaco).
// Round 2: Generate… (⌘N / Alt+Insert) lists what plugins offer — `generate.*` plugin services with
// generateItems(context) and editor actions they contribute whose id/label says generate/getter/setter/constructor/
// implement/override; Run · Debug · More Run/Debug delegate to plugin keymap actions (run-context.ts); Compare with
// Clipboard opens a diff (compare-clipboard.ts). AI, snippets/gists and Diagrams stay out.

type Entry = Exclude<MenuItem, '-'>;
/** Contribution of a plugin to Generate… (plugin service named `generate.<plugin>`). */
export type GenerateContext = { editor: monaco.editor.IStandaloneCodeEditor; model: monaco.editor.ITextModel; position: monaco.Position; path?: string; language: string };
export type GenerateItem = { label: string; run(): unknown; shortcut?: string; disabled?: boolean };
type GenerateProvider = { generateItems(context: GenerateContext): GenerateItem[] | Promise<GenerateItem[]> };
type Hooks = {
 /** Active project file (not a virtual buffer). */
 path(): string | undefined;
 fileItems(path: string): { copyPath: Entry; openIn: Entry; history: Entry } | undefined;
 status(text: string): void;
};

export function mountEditorMenu(editor: monaco.editor.IStandaloneCodeEditor, hooks: Hooks) {
 editor.updateOptions({ contextmenu: false });
 /** Label of the keybinding Monaco would run for an action (internal lookup; absent → no hint). */
 const monacoKey = (id: string): string | undefined => { try { return (editor as unknown as { _standaloneKeybindingService?: { lookupKeybinding(id: string): { getLabel(): string | null } | undefined } })._standaloneKeybindingService?.lookupKeybinding(id)?.getLabel() ?? undefined; } catch { return undefined; } };
 const action = (id: string, label: string, options: { shortcut?: string; disabled?: boolean } = {}): Entry => {
  const found = editor.getAction(id);
  return { id, label, shortcut: options.shortcut ?? monacoKey(id), disabled: options.disabled || !found || !found.isSupported(), run: () => { editor.focus(); void found?.run(); } };
 };
 const command = (id: string, label: string): Entry => ({ id, label, shortcut: keymap.shortcut(id) || undefined, disabled: !keymap.action(id) || !keymap.available(id, editor.getDomNode()), run: () => { editor.focus(); keymap.run(id, { target: editor.getDomNode() }); } });
 const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); hooks.status(msg`${what} copiado: ${text}`); } catch (error) { hooks.status(msg`Não foi possível copiar: ${String(error)}`); } };
 // Monaco's clipboard actions are unsupported in WebKit (no execCommand paste), so the menu uses the async
 // Clipboard API directly; pasting goes through the editor's own 'paste' handler (multi-cursor aware).
 const clipboardKey = (key: string) => /Mac/.test(navigator.platform) ? '⌘' + key : 'Ctrl+' + key;
 async function clipboard(kind: 'cut' | 'copy' | 'paste') {
  const model = editor.getModel(); if (!model) return;
  try {
   if (kind === 'paste') { const text = await navigator.clipboard.readText(); editor.focus(); editor.trigger('editor-menu', 'paste', { text }); return; }
   const selections = (editor.getSelections() ?? []).filter(s => !s.isEmpty());
   await navigator.clipboard.writeText(selections.map(s => model.getValueInRange(s)).join(model.getEOL()));
   if (kind === 'cut') { editor.pushUndoStop(); editor.executeEdits('editor-menu', selections.map(range => ({ range, text: '' }))); editor.pushUndoStop(); }
   editor.focus();
  } catch (error) { hooks.status(msg`Área de transferência indisponível: ${String((error as Error)?.message ?? error)}`); }
 }
 function reference(): string | undefined {
  const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return undefined;
  const symbols = structureOf(model.getLanguageId(), model.getValue()); if (!symbols || model.getLanguageId() !== 'php') return undefined;
  const path = symbolPath(symbols, model.getOffsetAt(position)); const found = referenceOf(path); if (!found) return undefined;
  const member = path.some(s => s.kind === 'method' || s.kind === 'function');
  return '\\' + found + (member ? '()' : '');
 }
 function items(): MenuItem[] {
  const selection = editor.getSelection(); const selected = !!selection && !selection.isEmpty();
  const path = hooks.path(); const file = path ? hooks.fileItems(path) : undefined; const readOnly = !!editor.getOption(monaco.editor.EditorOption.readOnly);
  const supported = editor.getSupportedActions();
  // Refactorings contributed by plugins (Extract Method/Variable, Inline…); Monaco's own actions are not refactorings.
  const contributed = supported.filter(a => !a.id.startsWith('editor.') && /extract|inline|introduce|change.?signature|refactor/i.test(a.id));
  const refactorThis = contributed.some(a => /(isto|this)…?$/i.test(a.label));
  const refactors = contributed.map(a => action(a.id, a.label));
  const git = supported.filter(a => /^Git:\s*/.test(a.label)).map(a => action(a.id, a.label.replace(/^Git:\s*/, '').replace(/^./, c => c.toUpperCase())));
  const ref = reference();
  const column = !!editor.getOption(monaco.editor.EditorOption.columnSelection);
  const target = editor.getDomNode();
  return [
   action('editor.action.quickFix', t('Mostrar ações de contexto'), { disabled: readOnly }),
   '-',
   ...(selected ? [
    { id: 'cut', label: t('Recortar'), shortcut: clipboardKey('X'), disabled: readOnly, run: () => void clipboard('cut') },
    { id: 'copy', label: t('Copiar'), shortcut: clipboardKey('C'), run: () => void clipboard('copy') },
   ] as MenuItem[] : []),
   { id: 'paste', label: t('Colar'), shortcut: clipboardKey('V'), disabled: readOnly, run: () => void clipboard('paste') },
   { id: 'copy-paste-special', label: t('Copiar/colar especial'), children: [
    ...(file ? (file.copyPath.children ?? []).filter(item => item !== '-' && !/FQN/.test(item.label)) : []),
    { id: 'copy-reference', label: t('Copiar referência'), shortcut: keymap.shortcut('editor.copyReference') || undefined, disabled: !ref, run: () => void copy(ref!, t('Referência')) },
   ] },
   { id: 'column-selection', label: column ? t('Sair do modo de seleção em coluna') : t('Modo de seleção em coluna'), shortcut: keymap.shortcut('editor.columnSelection') || undefined, run: () => keymap.run('editor.columnSelection') },
   '-',
   command('nav.usages', t('Encontrar usos')),
   { id: 'go-to', label: t('Ir para'), children: [
    command('nav.declaration', t('Declaração ou usos')),
    command('nav.implementations', t('Implementações')),
    action('editor.action.gotoLine', t('Linha:coluna…')),
    '-',
    action('editor.action.marker.next', t('Próximo erro ou aviso')),
    action('editor.action.marker.prev', t('Erro ou aviso anterior')),
   ] },
   '-',
   { id: 'folding', label: t('Dobra'), children: [
    action('editor.unfold', t('Expandir')), action('editor.fold', t('Recolher')), '-',
    action('editor.unfoldAll', t('Expandir tudo')), action('editor.foldAll', t('Recolher tudo')),
   ] },
   '-',
   action('editor.action.rename', t('Renomear…'), { disabled: readOnly }),
   { id: 'refactor', label: t('Refatorar'), disabled: readOnly, children: [action('editor.action.rename', t('Renomear…')), ...(refactorThis ? [] : [action('editor.action.refactor', t('Refatorar este…'))]), ...refactors] },
   { id: 'generate', label: t('Gerar…'), shortcut: keymap.shortcut('editor.generate') || undefined, disabled: readOnly || !canGenerate(), run: () => void generate() },
   '-',
   ...runMenuItems(target),
   '-',
   ...(file ? [file.openIn, '-', file.history] as MenuItem[] : []),
   ...(git.length ? [{ id: 'git', label: 'Git', children: git } as Entry] : []),
   '-',
   { id: 'compare-clipboard', label: t('Comparar com a área de transferência'), run: () => void compareWithClipboard(editor, path?.split('/').pop() ?? editor.getModel()?.uri.path.split('/').pop() ?? '', hooks.status) },
  ];
 }
 // --- Generate… -----------------------------------------------------------------------------
 const generateActions = () => editor.getSupportedActions().filter(a => !a.id.startsWith('editor.') && /generat|gerar|getter|setter|construct|implement|override|sobrescrever/i.test(a.id + ' ' + a.label));
 const providers = () => pluginServices<GenerateProvider>('generate.').filter(p => typeof p?.generateItems === 'function');
 const canGenerate = () => !!editor.getModel() && (providers().length > 0 || generateActions().length > 0);
 const caretPoint = () => { const position = editor.getPosition(); const node = editor.getDomNode(); if (!position || !node) return { x: innerWidth / 3, y: innerHeight / 3 }; const at = editor.getScrolledVisiblePosition(position); const r = node.getBoundingClientRect(); return { x: r.left + (at?.left ?? 0), y: r.top + (at?.top ?? 0) + (at?.height ?? 18) }; };
 async function generate() {
  const model = editor.getModel(), position = editor.getPosition(); if (!model || !position) return;
  const context: GenerateContext = { editor, model, position, path: hooks.path(), language: model.getLanguageId() };
  const lists = await Promise.all(providers().map(p => Promise.resolve().then(() => p.generateItems(context)).catch(error => { hooks.status(msg`Gerar: ${String((error as Error)?.message ?? error)}`); return [] as GenerateItem[]; })));
  if (editor.getModel() !== model) return;
  const items: Entry[] = [...lists.flat().filter(i => i && typeof i.label === 'string').map((i, n) => ({ id: 'generate-' + n, label: i.label, shortcut: i.shortcut, disabled: i.disabled, run: () => { editor.focus(); return i.run(); } })),
   ...generateActions().map(a => action(a.id, a.label))];
  if (!items.length) { hooks.status(t('Nada a gerar neste ponto.')); return; }
  const at = caretPoint(); const node = editor.getDomNode();
  openMenu([{ label: t('Gerar'), heading: true }, ...items], at.x, at.y, { restore: node?.querySelector('textarea') ?? null, label: t('Gerar') });
 }
 keymap.registerAction({ id: 'editor.generate', label: 'Gerar…', category: 'Código', aliases: 'generate code constructor getter setter gerar', context: 'editor',
  defaults: { mac: 'Meta+N', other: 'Alt+Insert' }, enabled: () => canGenerate() && !editor.getOption(monaco.editor.EditorOption.readOnly), run: () => generate() });
 keymap.registerAction({ id: 'editor.compareClipboard', label: 'Comparar com a área de transferência', category: 'Editor', aliases: 'compare clipboard diff', context: 'editor', defaults: {},
  enabled: () => !!editor.getModel(), run: () => compareWithClipboard(editor, hooks.path()?.split('/').pop() ?? editor.getModel()?.uri.path.split('/').pop() ?? '', hooks.status) });
 const show = (x: number, y: number) => {
  const node = editor.getDomNode(); node?.classList.add('menu-open');
  openMenu(items(), x, y, { restore: node?.querySelector('textarea') ?? null, label: t('Menu do editor'), onClose: () => { node?.classList.remove('menu-open'); } });
 };
 const host = editor.getContainerDomNode();
 host.addEventListener('contextmenu', event => {
  if (event.ctrlKey && !/Mac/.test(navigator.platform)) return; // Ctrl+click navigation elsewhere
  if (event.metaKey) return;
  const target = editor.getTargetAtClientPoint(event.clientX, event.clientY);
  const T = monaco.editor.MouseTargetType;
  if (!target || ![T.CONTENT_TEXT, T.CONTENT_EMPTY, T.CONTENT_VIEW_ZONE].includes(target.type)) return;
  event.preventDefault(); event.stopPropagation();
  // As in the reference, the caret moves to the click unless it lands inside the selection.
  const position = target.position; const selection = editor.getSelection();
  if (position && !(selection && !selection.isEmpty() && selection.containsPosition(position))) editor.setPosition(position);
  editor.focus(); show(event.clientX, event.clientY);
 });
 keymap.registerAction({ id: 'editor.contextMenu', label: 'Menu de contexto do editor', category: 'Editor', aliases: 'context menu popup', context: 'editor',
  defaults: { mac: 'Shift+F10', other: ['Shift+F10', 'ContextMenu'] },
  enabled: () => !!editor.getModel(),
  run: () => { const position = editor.getPosition(); const node = editor.getDomNode(); if (!position || !node) return; const at = editor.getScrolledVisiblePosition(position); const r = node.getBoundingClientRect(); show(r.left + (at?.left ?? 0), r.top + (at?.top ?? 0) + (at?.height ?? 18)); } });
 keymap.registerAction({ id: 'editor.copyReference', label: 'Copiar referência', category: 'Editor', aliases: 'copy reference fqn', context: 'editor',
  defaults: { mac: 'Alt+Shift+Meta+C', other: 'Ctrl+Alt+Shift+C' }, enabled: () => !!reference(), run: () => { const ref = reference(); if (ref) void copy(ref, t('Referência')); } });
 keymap.registerAction({ id: 'editor.columnSelection', label: 'Modo de seleção em coluna', category: 'Editor', aliases: 'column selection block', context: 'editor',
  defaults: { mac: 'Shift+Meta+8', other: 'Alt+Shift+Insert' }, enabled: () => !!editor.getModel(),
  run: () => { editor.updateOptions({ columnSelection: !editor.getOption(monaco.editor.EditorOption.columnSelection) }); editor.focus(); } });
 return { show };
}
