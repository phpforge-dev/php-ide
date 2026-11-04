import { t } from './i18n';
import { keymap } from './keymap';
import { openMenu, type MenuItem } from './context-menu';

// UI-CONTEXT-001 — editor tab menu. Order and labels observed on PhpStorm 2026.1.4 (capture 53, 2026-11-03):
// Close · Close Other Tabs · Close All Tabs · Close Tabs to the Left/Right (only when such tabs exist) |
// Copy Path/Reference… | Split… | Pin Tab · Open Tab in New Window · Configure Editor Tabs… | Bookmarks |
// Override File Type | Run/Debug | Open In | Local History | Rename File… · snippets/AI. Items for features this
// IDE does not have (splits, new window, bookmarks, file type override, run configurations, gists, AI chat) are
// left out rather than shown dead. Pinned tabs: "Close Other Tabs", left/right and "Close All but Pinned" keep
// them, "Close All Tabs" closes them too (public help, "Pin tabs"; not compared yet).
// Round 2 adds Split Right/Down (+ Unsplit), Configure Editor Tabs…, Bookmarks and Run/Debug from plugins; still
// out: Split and Move, Open Tab in New Window, Override File Type, snippets/gists and AI.
// The keymap actions close through the tabs' × buttons, which keep main.ts's unsaved-buffer guard. ⌘W has no
// default on macOS: Tauri's default menu uses it to close the window.
export type TabHooks = {
 /** Paths in tab order, the pinned ones first. */
 order(): string[];
 active(): string | undefined;
 isPinned(path: string): boolean; setPinned(path: string, pinned: boolean): void;
 close(paths: string[]): void;
 /** Copy path, Open In, Local History and Rename for project files; undefined for virtual buffers. */
 fileItems(path: string): { copyPath: Entry; openIn: Entry; history: Entry; rename(): void } | undefined;
 split?: { split(path: string, orientation: 'right' | 'down'): unknown; unsplit(): void; active(): { path: string } | undefined };
 bookmarks?: { hasFile(path: string): boolean; toggleFile(path: string): void; mnemonicFile(path: string): void; show(): void };
 /** Settings › Editor › General › Editor Tabs. */
 configure?(): void;
 /** Run / Debug / More Run/Debug offered by plugins for this tab (active tab only). */
 runItems?(path: string): MenuItem[];
};
type Entry = Exclude<MenuItem, '-'>;
let hooks: TabHooks | undefined;
export function configureTabs(value: TabHooks) { hooks = value; }

type Scope = 'this' | 'others' | 'all' | 'left' | 'right' | 'unpinned';
function targets(path: string, scope: Scope): string[] {
 const order = hooks?.order() ?? []; const at = order.indexOf(path); const unpinned = (p: string) => !hooks!.isPinned(p);
 switch (scope) {
  case 'this': return [path];
  case 'others': return order.filter(p => p !== path && unpinned(p));
  case 'all': return order;
  case 'left': return order.slice(0, at).filter(unpinned);
  case 'right': return order.slice(at + 1).filter(unpinned);
  case 'unpinned': return order.filter(unpinned);
 }
}
const ids: Record<Scope, string> = { this: 'editor.closeTab', others: 'editor.closeOtherTabs', all: 'editor.closeAllTabs', left: 'editor.closeTabsLeft', right: 'editor.closeTabsRight', unpinned: 'editor.closeUnpinnedTabs' };
const labels: Record<Scope, string> = { this: 'Fechar esta aba', others: 'Fechar outras abas', all: 'Fechar todas as abas', left: 'Fechar abas à esquerda', right: 'Fechar abas à direita', unpinned: 'Fechar todas exceto fixadas' };
const current = () => hooks?.active();
for (const scope of Object.keys(ids) as Scope[]) keymap.registerAction({
 id: ids[scope], label: labels[scope], category: 'Abas do editor', aliases: 'close tab ' + scope,
 defaults: scope === 'this' ? { other: 'Ctrl+F4' } : {}, jetbrains: scope === 'this' ? { other: 'Ctrl+F4' } : undefined,
 enabled: () => { const path = current(); return !!path && targets(path, scope).length > 0; },
 run: () => { const path = current(); if (path) hooks?.close(targets(path, scope)); },
});
keymap.registerAction({ id: 'editor.pinTab', label: 'Fixar/desafixar aba', category: 'Abas do editor', aliases: 'pin tab unpin', defaults: {},
 enabled: () => !!current(), run: () => { const path = current(); if (path) hooks?.setPinned(path, !hooks.isPinned(path)); } });
keymap.defineContext('editor-tab', target => !!target?.closest('#tabs .file-tab'));
keymap.registerAction({ id: 'editor.tabContextMenu', label: 'Menu de contexto da aba', category: 'Abas do editor', aliases: 'context menu tab', context: 'editor-tab',
 defaults: { mac: ['ContextMenu', 'Shift+F10'], other: ['ContextMenu', 'Shift+F10'] },
 run: ({ target }) => { const tab = target?.closest<HTMLElement>('#tabs .file-tab'); const path = tab?.querySelector<HTMLElement>(':scope > button')?.title; if (tab && path) { const r = tab.getBoundingClientRect(); showTabMenu(tab, path, r.left + 8, r.bottom); } } });

export function showTabMenu(tab: HTMLElement, path: string, x: number, y: number) {
 if (!hooks) return;
 const order = hooks.order(); const at = order.indexOf(path); const pinned = hooks.isPinned(path);
 const sc = (scope: Scope) => keymap.shortcut(ids[scope]) || undefined;
 const close = (scope: Scope) => () => hooks!.close(targets(path, scope));
 const file = hooks.fileItems(path);
 const items: MenuItem[] = [
  { id: 'close', label: t('Fechar'), shortcut: sc('this'), run: close('this') },
  { id: 'close-others', label: t('Fechar outras abas'), shortcut: sc('others'), disabled: !targets(path, 'others').length, run: close('others') },
  { id: 'close-all', label: t('Fechar todas as abas'), shortcut: sc('all'), run: close('all') },
  ...(order.some(hooks.isPinned) ? [{ id: 'close-unpinned', label: t('Fechar todas exceto fixadas'), shortcut: sc('unpinned'), disabled: !targets(path, 'unpinned').length, run: close('unpinned') }] : []),
  ...(at > 0 ? [{ id: 'close-left', label: t('Fechar abas à esquerda'), shortcut: sc('left'), disabled: !targets(path, 'left').length, run: close('left') }] : []),
  ...(at >= 0 && at < order.length - 1 ? [{ id: 'close-right', label: t('Fechar abas à direita'), shortcut: sc('right'), disabled: !targets(path, 'right').length, run: close('right') }] : []),
  '-',
  ...(file ? [{ ...file.copyPath, label: t('Copiar caminho/referência…') } as MenuItem] : []),
  '-',
  '-',
  ...(hooks.split ? [
   { id: 'split-right', label: t('Dividir à direita'), shortcut: keymap.shortcut('editor.splitRight') || undefined, run: () => hooks!.split!.split(path, 'right') },
   { id: 'split-down', label: t('Dividir para baixo'), shortcut: keymap.shortcut('editor.splitDown') || undefined, run: () => hooks!.split!.split(path, 'down') },
   ...(hooks.split.active() ? [{ id: 'unsplit', label: t('Desfazer divisão'), shortcut: keymap.shortcut('editor.unsplit') || undefined, run: () => hooks!.split!.unsplit() }] : []),
  ] as MenuItem[] : []),
  '-',
  { id: 'pin', label: pinned ? t('Desafixar aba') : t('Fixar aba'), shortcut: keymap.shortcut('editor.pinTab') || undefined, run: () => hooks!.setPinned(path, !pinned) },
  ...(hooks.configure ? [{ id: 'configure-tabs', label: t('Configurar abas do editor…'), run: () => hooks!.configure!() }] : []),
  '-',
  ...(hooks.bookmarks && file ? [{ id: 'bookmarks', label: t('Marcadores'), children: [
   { id: 'bookmark-file', label: hooks.bookmarks.hasFile(path) ? t('Remover marcador') : t('Adicionar marcador'), run: () => hooks!.bookmarks!.toggleFile(path) },
   { id: 'bookmark-mnemonic', label: t('Adicionar marcador mnemônico…'), run: () => hooks!.bookmarks!.mnemonicFile(path) },
   '-',
   { id: 'bookmarks-show', label: t('Mostrar todos os marcadores…'), shortcut: keymap.shortcut('bookmarks.show') || undefined, run: () => hooks!.bookmarks!.show() },
  ] }] as MenuItem[] : []),
  '-',
  ...(hooks.runItems?.(path) ?? []),
  '-',
  ...(file ? [file.openIn, '-', file.history, '-', { id: 'rename-file', label: t('Renomear arquivo…'), shortcut: keymap.shortcut('project.rename') || undefined, run: file.rename }] as MenuItem[] : []),
 ];
 tab.classList.add('tab-context');
 openMenu(items, x, y, { restore: tab.querySelector('button'), label: t('Menu da aba'), onClose: () => tab.classList.remove('tab-context') });
}
