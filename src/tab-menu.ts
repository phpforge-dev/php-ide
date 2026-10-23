import { t } from './i18n';
import { keymap } from './keymap';

let dismiss: (() => void) | undefined;

// UI-KEYMAP-001: as mesmas ações do menu ficam no keymap. Fecham pelos botões × das abas, que
// mantêm a proteção de buffer alterado do main.ts. ⌘W fica sem padrão no macOS: o menu padrão do
// Tauri usa ⌘W para fechar a janela.
const tabs = () => [...document.querySelectorAll<HTMLElement>('#tabs .file-tab')];
const isActive = (tab: HTMLElement) => !!tab.querySelector(':scope > button.active');
const closeTabs = (filter: (tab: HTMLElement) => boolean) => { for (const tab of tabs().filter(filter)) tab.querySelector<HTMLButtonElement>('.close-tab')?.click(); };
const tabActions = { this: 'editor.closeTab', others: 'editor.closeOtherTabs', all: 'editor.closeAllTabs' } as const;
keymap.registerAction({ id: tabActions.this, label: 'Fechar esta aba', category: 'Abas do editor', aliases: 'close tab', defaults: { other: 'Ctrl+F4' }, jetbrains: { other: 'Ctrl+F4' }, enabled: () => tabs().some(isActive), run: () => closeTabs(isActive) });
keymap.registerAction({ id: tabActions.others, label: 'Fechar outras abas', category: 'Abas do editor', aliases: 'close other tabs', defaults: {}, enabled: () => tabs().some(isActive) && tabs().length > 1, run: () => closeTabs(tab => !isActive(tab)) });
keymap.registerAction({ id: tabActions.all, label: 'Fechar todas as abas', category: 'Abas do editor', aliases: 'close all tabs', defaults: {}, enabled: () => tabs().length > 0, run: () => closeTabs(() => true) });

export function showTabMenu(anchor: HTMLElement, x: number, y: number, close: (scope: 'this' | 'others' | 'all') => void) {
 dismiss?.();
 const menu = document.createElement('div');
 menu.className = 'tool-context-menu';
 menu.setAttribute('role', 'menu');
 const cleanup = (restoreFocus = false) => {
  menu.remove();
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('blur', blur);
  window.removeEventListener('resize', blur);
  dismiss = undefined;
  if (restoreFocus && anchor.isConnected) anchor.querySelector('button')?.focus();
 };
 const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) cleanup(); };
 const blur = () => cleanup();
 const choices = [['this', 'Fechar esta aba'], ['others', 'Fechar outras abas'], ['all', 'Fechar todas as abas']] as const;
 for (const [scope, label] of choices) {
  const button = document.createElement('button');
  button.type = 'button'; button.role = 'menuitem'; button.textContent = t(label);
  const shortcut = keymap.shortcut(tabActions[scope]);
  if (shortcut) { const hint = document.createElement('kbd'); hint.textContent = shortcut; button.append(hint); button.setAttribute('aria-keyshortcuts', keymap.ariaShortcuts(tabActions[scope])); }
  button.onclick = () => { cleanup(); close(scope); };
  menu.append(button);
 }
 menu.onkeydown = event => {
  const buttons = [...menu.querySelectorAll('button')];
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); cleanup(true); }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
   event.preventDefault();
   buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
  }
 };
 document.body.append(menu);
 menu.style.left = Math.max(8, Math.min(x, window.innerWidth - menu.offsetWidth - 8)) + 'px';
 menu.style.top = Math.max(8, Math.min(y, window.innerHeight - menu.offsetHeight - 8)) + 'px';
 menu.querySelector('button')!.focus();
 document.addEventListener('pointerdown', outside, true);
 window.addEventListener('blur', blur);
 window.addEventListener('resize', blur);
 dismiss = cleanup;
}
