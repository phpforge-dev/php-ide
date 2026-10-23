import test from 'node:test';
import assert from 'node:assert/strict';
import { Keymap, normalizeStroke, strokeFromEvent, formatStroke, allowedIn, DOUBLE_SHIFT, STORAGE_KEY, type KeyLike } from '../src/keymap';

class MemoryStorage { data = new Map<string, string>(); getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { this.data.set(key, value); } }
const key = (code: string, mods: Partial<KeyLike> = {}, keyName = code): KeyLike => ({ key: keyName, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
// Elemento mínimo para os predicados de contexto (closest) sem DOM.
const element = (selectors: string[], tagName = 'DIV') => ({ tagName, closest: (selector: string) => selector.split(',').some(item => selectors.includes(item.trim())) ? {} : null, isContentEditable: false }) as unknown as Element;

function sample(platform: 'mac' | 'other' = 'mac', storage = new MemoryStorage()) {
 const keymap = new Keymap(platform, storage); const ran: string[] = [];
 keymap.registerAction({ id: 'tool.terminal', label: 'Terminal', defaults: { mac: 'Alt+F12', other: 'Alt+F12' }, run: () => { ran.push('terminal'); } });
 keymap.registerAction({ id: 'ide.settings', label: 'Configurações', defaults: { mac: 'Meta+,', other: 'Ctrl+Alt+S' }, run: () => { ran.push('settings'); } });
 keymap.registerAction({ id: 'tool.project', label: 'Projeto', defaults: { mac: 'Alt+1', other: 'Alt+1' }, jetbrains: { mac: 'Meta+1' }, run: () => { ran.push('project'); } });
 keymap.registerAction({ id: 'search.everywhere', label: 'Buscar em tudo', defaults: { mac: DOUBLE_SHIFT, other: DOUBLE_SHIFT }, run: () => { ran.push('everywhere'); } });
 return { keymap, ran, storage };
}

test('normaliza atalhos em várias grafias e formata por SO', () => {
 assert.equal(normalizeStroke('cmd+shift+o'), 'Shift+Meta+O');
 assert.equal(normalizeStroke('⌘⇧O'), 'Shift+Meta+O');
 assert.equal(normalizeStroke('ctrl+alt+left'), 'Ctrl+Alt+Left');
 assert.equal(normalizeStroke('Meta+Comma'), 'Meta+,');
 assert.equal(normalizeStroke('Ctrl+-'), 'Ctrl+-');
 assert.equal(normalizeStroke('shift shift'), DOUBLE_SHIFT);
 assert.equal(normalizeStroke('Ctrl+A+B'), undefined);
 assert.equal(normalizeStroke('Ctrl+'), undefined);
 assert.equal(normalizeStroke('Ctrl+Shift'), undefined);
 assert.equal(formatStroke('Alt+Shift+Meta+O', 'mac'), '⌥⇧⌘O');
 assert.equal(formatStroke('Ctrl+Alt+Left', 'other'), 'Ctrl+Alt+←');
 assert.equal(formatStroke(DOUBLE_SHIFT, 'other'), 'Shift Shift');
});

test('lê a tecla física do evento (⌥1 no macOS gera ¡ em event.key)', () => {
 assert.equal(strokeFromEvent(key('Digit1', { altKey: true }, '¡')), 'Alt+1');
 assert.equal(strokeFromEvent(key('F12', { altKey: true })), 'Alt+F12');
 assert.equal(strokeFromEvent(key('Comma', { metaKey: true }, ',')), 'Meta+,');
 assert.equal(strokeFromEvent(key('ShiftLeft', { shiftKey: true }, 'Shift')), undefined);
 assert.equal(strokeFromEvent(key('ArrowLeft', { ctrlKey: true, altKey: true }, 'ArrowLeft')), 'Ctrl+Alt+Left');
});

test('perfis: padrão por SO, JetBrains e escolha explícita', () => {
 const { keymap } = sample('mac');
 assert.equal(keymap.profile, 'default-mac');
 assert.deepEqual(keymap.bindings('ide.settings'), ['Meta+,']);
 assert.equal(keymap.shortcut('tool.terminal'), '⌥F12');
 keymap.setProfile('jetbrains');
 assert.deepEqual(keymap.bindings('tool.project'), ['Meta+1']);
 assert.deepEqual(keymap.bindings('tool.terminal'), ['Alt+F12'], 'sem atalho JetBrains específico usa o padrão');
 keymap.setProfile('default-other');
 assert.deepEqual(keymap.bindings('ide.settings'), ['Ctrl+Alt+S']);
 assert.equal(new Keymap('other', null).profile, 'default-other');
 assert.throws(() => keymap.setProfile('vim' as never));
});

test('personaliza, persiste por perfil, restaura e preserva ações ainda não registradas', () => {
 const storage = new MemoryStorage();
 storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, overrides: { 'default-mac': { 'debug.stepOver': ['F8', 'lixo+++'] } } }));
 const { keymap } = sample('mac', storage);
 keymap.addBinding('tool.terminal', '⌥T');
 assert.deepEqual(keymap.bindings('tool.terminal'), ['Alt+F12', 'Alt+T']);
 assert.ok(keymap.isCustomized('tool.terminal'));
 const reloaded = sample('mac', storage).keymap;
 assert.deepEqual(reloaded.bindings('tool.terminal'), ['Alt+F12', 'Alt+T']);
 reloaded.registerAction({ id: 'debug.stepOver', label: 'Step over', defaults: { mac: 'F6' }, run: () => {} });
 assert.deepEqual(reloaded.bindings('debug.stepOver'), ['F8'], 'override salvo antes do registro e atalho inválido descartado');
 reloaded.setProfile('jetbrains');
 assert.deepEqual(reloaded.bindings('tool.terminal'), ['Alt+F12'], 'personalização pertence ao perfil');
 reloaded.setProfile('default-mac');
 reloaded.removeBinding('tool.terminal', 'Alt+F12');
 assert.deepEqual(reloaded.bindings('tool.terminal'), ['Alt+T']);
 reloaded.resetAction('tool.terminal');
 assert.deepEqual(reloaded.bindings('tool.terminal'), ['Alt+F12']);
 assert.equal(reloaded.isCustomized('tool.terminal'), false);
 reloaded.setBindings('tool.terminal', ['Alt+F12']);
 assert.equal(reloaded.isCustomized('tool.terminal'), false, 'igual ao padrão não vira personalização');
 assert.throws(() => reloaded.setBindings('tool.terminal', ['Ctrl+']));
 reloaded.addBinding('tool.project', 'Alt+9'); reloaded.resetProfile();
 assert.deepEqual(reloaded.bindings('tool.project'), ['Alt+1']);
});

test('JSON corrompido não impede abrir: volta ao padrão e informa', () => {
 const storage = new MemoryStorage(); storage.setItem(STORAGE_KEY, '{nope');
 const { keymap } = sample('other', storage);
 assert.deepEqual(keymap.bindings('ide.settings'), ['Ctrl+Alt+S']);
 assert.match(keymap.lastError, /inválida/);
});

test('detecta conflitos por contexto e resolve substituindo', () => {
 const { keymap } = sample('mac');
 keymap.registerAction({ id: 'project.rename', label: 'Renomear', context: 'project-tree', defaults: { mac: 'Shift+F6' }, run: () => {} });
 keymap.registerAction({ id: 'editor.rename', label: 'Renomear símbolo', context: 'editor', defaults: { mac: 'Shift+F6' }, run: () => {} });
 assert.deepEqual(keymap.conflicts(), [], 'mesmo atalho em contextos disjuntos não conflita');
 keymap.addBinding('tool.project', 'Alt+F12');
 assert.deepEqual(keymap.conflictingActions('Alt+F12', 'tool.project'), ['tool.terminal']);
 assert.deepEqual(keymap.conflicts(), [{ stroke: 'Alt+F12', actions: ['tool.project', 'tool.terminal'] }]);
 keymap.addBinding('ide.settings', 'Alt+F12', { removeFromOthers: true });
 assert.deepEqual(keymap.actionsForStroke('Alt+F12'), ['ide.settings']);
 assert.equal(keymap.isReserved('⌘W'), true);
 assert.equal(keymap.isReserved('⌘⇧A'), false);
});

test('despacho único: contexto específico vence global, ações desabilitadas e campos de texto', () => {
 const { keymap, ran } = sample('mac');
 let enabled = false;
 keymap.registerAction({ id: 'project.delete', label: 'Excluir', context: 'project-tree', defaults: { mac: 'Alt+1' }, enabled: () => enabled, run: () => { ran.push('delete'); } });
 const tree = element(['#tree']); const editor = element(['.monaco-editor'], 'TEXTAREA'); const input = element([], 'INPUT');
 assert.equal(keymap.dispatch(key('Digit1', { altKey: true }), tree), true);
 assert.deepEqual(ran, ['project'], 'ação de contexto desabilitada cai na global');
 enabled = true; keymap.dispatch(key('Digit1', { altKey: true }), tree);
 assert.deepEqual(ran, ['project', 'delete']);
 assert.equal(keymap.dispatch(key('KeyQ', { altKey: true }), tree), false, 'atalho sem ação não é consumido');
 assert.equal(keymap.dispatch(key('F12', { altKey: true }), editor), true);
 assert.equal(keymap.dispatchGesture(DOUBLE_SHIFT), true);
 assert.deepEqual(ran.slice(-2), ['terminal', 'everywhere']);
 assert.equal(keymap.dispatch(key('Digit1', { altKey: true }), input), false, 'Alt+tecla em campo comum é texto');
 assert.equal(keymap.dispatch(key('Comma', { metaKey: true }), input), true, '⌘, funciona em campo comum');
 assert.equal(allowedIn('Meta+C', input), false);
 assert.equal(allowedIn('Ctrl+Shift+A', input), true);
 assert.equal(allowedIn('A', editor), false);
 const terminal = element(['.xterm', '#terminal-panel'], 'TEXTAREA');
 assert.equal(allowedIn('Ctrl+E', terminal), false, 'Ctrl+letra é do shell');
 assert.equal(allowedIn('Ctrl+Shift+C', terminal), false);
 assert.equal(allowedIn('Alt+F12', terminal), true);
});

test('erros da ação são recuperáveis e reportados', async () => {
 const { keymap } = sample('mac'); const errors: string[] = [];
 keymap.onError = (error, id) => errors.push(id + ':' + (error as Error).message);
 keymap.registerAction({ id: 'boom', label: 'Falha', defaults: { mac: 'Alt+B' }, run: async () => { throw new Error('falhou'); } });
 assert.equal(keymap.dispatch(key('KeyB', { altKey: true }), null), true);
 await new Promise(resolve => setTimeout(resolve, 0));
 assert.deepEqual(errors, ['boom:falhou']);
 assert.equal(keymap.lastError, 'falhou');
 const off = keymap.registerAction({ id: 'temp', label: 'Temp', defaults: { mac: 'Alt+J' }, run: () => {} });
 off(); assert.equal(keymap.action('temp'), undefined);
 assert.throws(() => keymap.registerAction({ id: 'bad id', label: 'x', defaults: {}, run: () => {} }));
 assert.throws(() => keymap.registerAction({ id: 'x', label: 'x', context: 'nowhere', defaults: {}, run: () => {} }));
});

test('aria-keyshortcuts usa a sintaxe WAI-ARIA', () => {
 const { keymap } = sample('other');
 keymap.registerAction({ id: 'nav.back', label: 'Voltar', defaults: { other: 'Ctrl+Alt+Left' }, run: () => {} });
 assert.equal(keymap.ariaShortcuts('nav.back'), 'Control+Alt+ArrowLeft');
 assert.equal(keymap.ariaShortcuts('search.everywhere'), '');
});
