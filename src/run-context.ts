import { t } from './i18n';
import { keymap } from './keymap';
import type { MenuItem } from './context-menu';
// UI-CONTEXT-001, round 2 — Run / Debug / More Run/Debug in the editor and tab menus (captures 31 and 53). This IDE
// has no run configurations of its own: the items delegate to actions that plugins register in the central keymap
// (the PHP Tests plugin's "run the test under the caret", coverage, configurations). Naming convention read here:
// `*.runContext` → Run, `*.debugContext` → Debug, coverage/popup/configurations of the Executar or Depuração
// categories → More Run/Debug. Nothing is shown when no plugin offers an action for the focused editor.
type Entry = Exclude<MenuItem, '-'>;
const item = (id: string, target: Element | null): Entry => {
 const spec = keymap.action(id)!;
 return { id: 'run:' + id, label: t(spec.label), shortcut: keymap.shortcut(id) || undefined, run: () => keymap.run(id, { target }) };
};
export function runMenuItems(target: Element | null): MenuItem[] {
 const available = keymap.actions().filter(spec => keymap.available(spec.id, target));
 const run = available.filter(spec => /\.runContext$/.test(spec.id)).map(spec => item(spec.id, target));
 const debug = available.filter(spec => /\.debugContext$/.test(spec.id)).map(spec => item(spec.id, target));
 const more = available.filter(spec => ['Executar', 'Depuração'].includes(spec.category ?? '') && /(?:Coverage|Configurations|runPopup|debugPopup)$/.test(spec.id)).map(spec => item(spec.id, target));
 return [
  ...(run.length ? [{ id: 'run', label: t('Executar'), children: run }] : []),
  ...(debug.length ? [{ id: 'debug', label: t('Depurar'), children: debug }] : []),
  ...(more.length ? [{ id: 'more-run', label: t('Mais Executar/Depurar'), children: more }] : []),
 ];
}
