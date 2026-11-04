// Shared floating menu (UI-CONTEXT-001): project tree, editor tabs and editor. Submenus, keyboard (arrows, Enter,
// Esc, ←/→), outside click and window blur close it. Order and labels of each menu are defined by the caller.
export type MenuItem = {
 label: string; shortcut?: string; disabled?: boolean; run?: () => unknown; children?: MenuItem[]; id?: string;
 /** Section title (`Show`, `Sort By` in the Problems options); not focusable. */
 heading?: boolean;
 /** Check item: drawn with a check mark column, announced as menuitemcheckbox. */
 checked?: boolean;
} | '-';

/** Drops leading, trailing and doubled separators left by items that a caller filtered out. */
export function tidy(items: MenuItem[]): MenuItem[] {
 const out: MenuItem[] = [];
 for (const item of items) { if (item === '-' && (!out.length || out.at(-1) === '-')) continue; out.push(item); }
 while (out.at(-1) === '-') out.pop();
 return out;
}

/** One menu level; returns its element. `onClose` closes the whole menu tree. */
export function popup(items: MenuItem[], x: number, y: number, onClose: () => void, depth = 0): HTMLElement {
 const menu = document.createElement('div'); menu.className = 'context-menu'; menu.setAttribute('role', 'menu'); menu.dataset.depth = String(depth);
 let child: HTMLElement | undefined;
 const closeChild = () => { child?.remove(); child = undefined; menu.querySelector('[aria-expanded=true]')?.removeAttribute('aria-expanded'); };
 for (const item of tidy(items)) {
  if (item === '-') { const line = document.createElement('div'); line.className = 'context-separator'; line.setAttribute('role', 'separator'); menu.append(line); continue; }
  if (item.heading) { const title = document.createElement('div'); title.className = 'menu-heading'; title.setAttribute('role', 'presentation'); title.textContent = item.label; menu.append(title); continue; }
  const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'); button.disabled = !!item.disabled;
  if (item.checked !== undefined) { button.setAttribute('aria-checked', String(item.checked)); menu.classList.add('has-checks'); }
  if (item.id) button.dataset.menuId = item.id;
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
  else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); (e.key === 'Home' ? buttons[0] : buttons.at(-1))?.focus(); }
  else if (e.key === 'ArrowLeft' && depth > 0) { e.preventDefault(); e.stopPropagation(); const owner = document.querySelector<HTMLButtonElement>(`.context-menu[data-depth="${depth - 1}"] [aria-expanded=true]`); menu.remove(); owner?.removeAttribute('aria-expanded'); owner?.focus(); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  else if (e.key === 'Tab') e.preventDefault();
 });
 // Inside a modal dialog (Keymap gear) the menu must live in the dialog's top layer to be on top and clickable.
 const modal = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(d => d.matches(':modal')).at(-1);
 (modal ?? document.body).append(menu);
 const r = menu.getBoundingClientRect();
 menu.style.left = Math.max(4, x + r.width > innerWidth ? (depth ? x - r.width * 2 + 4 : innerWidth - r.width - 4) : x) + 'px';
 menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
 return menu;
}

let current: (() => void) | undefined;
/** Opens a menu tree at (x, y), focusing its first enabled item. `restore` gets the focus back on Esc/outside. */
export function openMenu(items: MenuItem[], x: number, y: number, options: { restore?: HTMLElement | null; onClose?: () => void; label?: string } = {}) {
 current?.();
 const close = () => {
  const refocus = !!document.activeElement?.closest('.context-menu') || document.activeElement === document.body;
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  document.removeEventListener('mousedown', outside, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close);
  current = undefined; options.onClose?.();
  if (refocus && options.restore?.isConnected) options.restore.focus();
 };
 const outside = (e: MouseEvent) => { if (!(e.target as Element).closest?.('.context-menu')) close(); };
 current = close;
 const menu = popup(items, x, y, close);
 if (options.label) menu.setAttribute('aria-label', options.label);
 menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
 document.addEventListener('mousedown', outside, true); window.addEventListener('blur', close); window.addEventListener('resize', close);
 return close;
}
export const closeMenus = () => current?.();
