// Fixture de verificação manual/automatizada da tela Keymap fora do Tauri.
import { keymap, DOUBLE_SHIFT } from '../../../../src/keymap';
import { mountKeymapSettings } from '../../../../src/keymap-settings';
const log = (text: string) => { document.getElementById('log')!.textContent += text + '\n'; };
keymap.registerAction({ id: 'tool.terminal', label: 'Terminal', category: 'Janelas de ferramentas', defaults: { mac: 'Alt+F12', other: 'Alt+F12' }, run: () => log('run tool.terminal') });
keymap.registerAction({ id: 'tool.project', label: 'Projeto', category: 'Janelas de ferramentas', defaults: { mac: 'Alt+1', other: 'Alt+1' }, jetbrains: { mac: 'Meta+1' }, run: () => log('run tool.project') });
keymap.registerAction({ id: 'search.everywhere', label: 'Buscar em tudo', category: 'Busca', defaults: { mac: DOUBLE_SHIFT, other: DOUBLE_SHIFT }, run: () => log('run search.everywhere') });
keymap.registerAction({ id: 'project.rename', label: 'Renomear…', category: 'Projeto', context: 'project-tree', defaults: { mac: 'Shift+F6', other: 'Shift+F6' }, run: () => log('run project.rename') });
keymap.registerAction({ id: 'ide.settings', label: 'Aparência', category: 'Configurações', defaults: { mac: 'Meta+,', other: 'Ctrl+Alt+S' }, run: () => log('run ide.settings') });
keymap.install(document);
const settings = mountKeymapSettings();
(window as unknown as { keymapHarness: unknown }).keymapHarness = { keymap, settings };
