// UI-KEYMAP-001 — registro central de ações e atalhos.
// Comportamento (perfis por SO, atalhos personalizados por perfil, conflito, Shift duplo) segue a
// documentação pública de keymaps do PhpStorm como especificação; código, nomes internos e UI são próprios.
// Este módulo não importa i18n nem DOM no carregamento para poder ser testado em Node: os rótulos
// são o texto-fonte (pt-BR) e quem exibe traduz com t().

export type Platform = 'mac' | 'other';
export type ProfileId = 'default-mac' | 'default-other' | 'jetbrains';
/** Um ou mais atalhos por SO. String vazia/array vazio = sem atalho. */
export type Strokes = string | string[];
export type Binding = { mac?: Strokes; other?: Strokes };
export type ActionContext = { event?: KeyLike; target: Element | null; keymap: Keymap };
export type ActionSpec = {
 id: string;
 /** Texto-fonte em pt-BR; a interface traduz com t(). */
 label: string;
 category?: string;
 /** Palavras extras para a busca (Search Everywhere e tela Keymap). */
 aliases?: string;
 /** 'global' (padrão) ou um contexto definido com defineContext(). */
 context?: string;
 defaults: Binding;
 /** Atalhos do perfil inspirado no layout JetBrains; ausente = usa defaults. */
 jetbrains?: Binding;
 enabled?: () => boolean;
 /** Ação Monaco equivalente (menu de contexto/paleta); o Search Everywhere a oculta para não duplicar. */
 editorActionId?: string;
 run: (context: ActionContext) => unknown;
};
export type KeyLike = { key: string; code?: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; repeat?: boolean; isComposing?: boolean };
export type Conflict = { stroke: string; actions: string[] };
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Saved = { version: 1; profile?: ProfileId; overrides: Partial<Record<ProfileId, Record<string, string[]>>> };

export const DOUBLE_SHIFT = 'DoubleShift';
export const STORAGE_KEY = 'php-ide-keymap';
export const profiles: { id: ProfileId; label: string }[] = [
 { id: 'default-mac', label: 'Padrão macOS' },
 { id: 'default-other', label: 'Padrão Windows/Linux' },
 { id: 'jetbrains', label: 'Inspirado no layout JetBrains' },
];

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const KEY_ALIASES: Record<string, string> = {
 cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', super: 'Meta', '⌘': 'Meta', option: 'Alt', opt: 'Alt', alt: 'Alt', '⌥': 'Alt',
 ctrl: 'Ctrl', control: 'Ctrl', '⌃': 'Ctrl', shift: 'Shift', '⇧': 'Shift',
 left: 'Left', arrowleft: 'Left', '←': 'Left', right: 'Right', arrowright: 'Right', '→': 'Right', up: 'Up', arrowup: 'Up', '↑': 'Up', down: 'Down', arrowdown: 'Down', '↓': 'Down',
 enter: 'Enter', return: 'Enter', '↩': 'Enter', esc: 'Escape', escape: 'Escape', '⎋': 'Escape', backspace: 'Backspace', '⌫': 'Backspace', delete: 'Delete', del: 'Delete', '⌦': 'Delete',
 insert: 'Insert', ins: 'Insert', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', tab: 'Tab', '⇥': 'Tab', space: 'Space', ' ': 'Space', contextmenu: 'ContextMenu',
 comma: ',', period: '.', slash: '/', backslash: '\\', bracketleft: '[', bracketright: ']', semicolon: ';', quote: "'", backquote: '`', minus: '-', equal: '=',
 doubleshift: DOUBLE_SHIFT,
};
const CODE_KEYS: Record<string, string> = {
 ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
 Semicolon: ';', Quote: "'", Backquote: '`', Minus: '-', Equal: '=', NumpadEnter: 'Enter',
};
const NAMED = new Set(['Left', 'Right', 'Up', 'Down', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Space', 'ContextMenu']);
const MAC_GLYPHS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘', Left: '←', Right: '→', Up: '↑', Down: '↓', Enter: '↩', Escape: '⎋', Backspace: '⌫', Delete: '⌦', Tab: '⇥', PageUp: '⇞', PageDown: '⇟', Home: '↖', End: '↘' };
const OTHER_NAMES: Record<string, string> = { Meta: 'Meta', Left: '←', Right: '→', Up: '↑', Down: '↓', Escape: 'Esc' };
/** Atalhos que o menu padrão do Tauri no macOS, o SO ou a edição de texto costumam consumir antes da IDE. */
const RESERVED: Record<Platform, string[]> = {
 mac: ['Meta+Q', 'Meta+H', 'Meta+Alt+H', 'Meta+M', 'Meta+W', 'Meta+Z', 'Shift+Meta+Z', 'Meta+X', 'Meta+C', 'Meta+V', 'Meta+A', 'Ctrl+Meta+F', 'Meta+Tab'],
 other: ['Ctrl+C', 'Ctrl+V', 'Ctrl+X', 'Ctrl+Z', 'Ctrl+Y', 'Ctrl+A', 'Alt+F4', 'Alt+Tab'],
};

const isFunctionKey = (key: string) => /^F([1-9]|1\d|2[0-4])$/.test(key);
function normalizeKey(raw: string): string | undefined {
 if (!raw) return undefined;
 const alias = KEY_ALIASES[raw.toLowerCase()] ?? KEY_ALIASES[raw];
 if (alias && !MODIFIERS.includes(alias as never)) return alias;
 if (/^f([1-9]|1\d|2[0-4])$/i.test(raw)) return raw.toUpperCase();
 if (/^[a-z0-9]$/i.test(raw)) return raw.toUpperCase();
 if (/^[,./\\[\];'`\-=]$/.test(raw)) return raw;
 const named = [...NAMED].find(name => name.toLowerCase() === raw.toLowerCase());
 return named;
}

/** Converte "cmd+shift+o", "⌘⇧O" ou "Ctrl+Alt+Left" na forma canônica "Alt+Shift+Meta+O". */
export function normalizeStroke(input: string): string | undefined {
 const text = input.trim();
 if (!text) return undefined;
 if (text.toLowerCase().replace(/[\s+]/g, '') === 'doubleshift' || text === '⇧⇧' || /^shift\s+shift$/i.test(text)) return DOUBLE_SHIFT;
 let parts: string[];
 if (text.includes('+') && text.length > 1) parts = text.split(/\+(?!$)/);
 else { // forma compacta do macOS: ⌃⌥⇧⌘K
  parts = [];
  let rest = text;
  while (rest.length > 1 && '⌃⌥⇧⌘'.includes(rest[0])) { parts.push(rest[0]); rest = rest.slice(1); }
  parts.push(rest);
 }
 const mods = new Set<string>();
 let key: string | undefined;
 for (const raw of parts.map(part => part.trim())) {
  const alias = KEY_ALIASES[raw.toLowerCase()] ?? KEY_ALIASES[raw];
  if (alias && MODIFIERS.includes(alias as never)) { mods.add(alias); continue; }
  if (key) return undefined;
  key = normalizeKey(raw);
  if (!key || key === DOUBLE_SHIFT) return undefined;
 }
 if (!key) return undefined;
 return [...MODIFIERS.filter(mod => mods.has(mod)), key].join('+');
}

/** Atalho canônico de um evento de teclado; undefined para tecla modificadora isolada. */
export function strokeFromEvent(event: KeyLike): string | undefined {
 if (['Shift', 'Control', 'Alt', 'Meta', 'OS', 'AltGraph', 'CapsLock', 'Dead', 'Process', 'Unidentified'].includes(event.key) && !event.code?.startsWith('F')) return undefined;
 const code = event.code ?? '';
 // event.code mantém a tecla física: no macOS, ⌥1 gera "¡" em event.key.
 let key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^(Digit|Numpad)\d$/.test(code) ? code.slice(-1) : CODE_KEYS[code] ?? (isFunctionKey(code) ? code : normalizeKey(code) ?? normalizeKey(event.key));
 if (!key) return undefined;
 key = key === ' ' ? 'Space' : key;
 const mods = MODIFIERS.filter(mod => (mod === 'Ctrl' ? event.ctrlKey : mod === 'Alt' ? event.altKey : mod === 'Shift' ? event.shiftKey : event.metaKey));
 return [...mods, key].join('+');
}

export function formatStroke(stroke: string, platform: Platform): string {
 if (stroke === DOUBLE_SHIFT) return platform === 'mac' ? '⇧⇧' : 'Shift Shift';
 const parts = stroke.split(/\+(?!$)/);
 if (platform === 'mac') return parts.map(part => MAC_GLYPHS[part] ?? part).join('');
 return parts.map(part => OTHER_NAMES[part] ?? part).join('+');
}

export function detectPlatform(): Platform {
 try { return /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '') ? 'mac' : 'other'; } catch { return 'other'; }
}

const list = (value: Strokes | undefined) => (Array.isArray(value) ? value : value ? [value] : []).map(normalizeStroke).filter((stroke): stroke is string => !!stroke);
const unique = (values: string[]) => [...new Set(values)];

export class Keymap {
 readonly platform: Platform;
 private readonly specs = new Map<string, ActionSpec>();
 private readonly contexts = new Map<string, (target: Element | null) => boolean>([['global', () => true]]);
 private readonly listeners = new Set<() => void>();
 private saved: Saved = { version: 1, overrides: {} };
 private storage: StorageLike | null;
 /** Último problema de persistência ou execução, para exibir na interface. */
 lastError = '';
 onError: (error: unknown, actionId: string) => void = error => console.error(error);

 constructor(platform: Platform = detectPlatform(), storage?: StorageLike | null) {
  this.platform = platform;
  this.storage = storage === undefined ? defaultStorage() : storage;
  this.defineContext('editor', target => !!target?.closest('.monaco-editor'));
  this.defineContext('project-tree', target => !!target?.closest('#tree'));
  this.defineContext('terminal', target => !!target?.closest('#terminal-panel'));
  this.load();
 }

 // --- registro ---------------------------------------------------------------------------
 /** Registra (ou substitui) uma ação. Devolve a função que a remove. */
 registerAction(spec: ActionSpec): () => void {
  if (!/^[\w.-]+$/.test(spec.id)) throw new Error(`Invalid action id: ${spec.id}`);
  if (spec.context && !this.contexts.has(spec.context)) throw new Error(`Unknown keymap context: ${spec.context}`);
  this.specs.set(spec.id, spec);
  this.emit();
  return () => { if (this.specs.get(spec.id) === spec) { this.specs.delete(spec.id); this.emit(); } };
 }
 /** Contexto nomeado; o predicado recebe o elemento focado. Contextos específicos vencem 'global'. */
 defineContext(name: string, matches: (target: Element | null) => boolean) { const previous=this.contexts.get(name);this.contexts.set(name, matches);return()=>{if(this.contexts.get(name)===matches){if(previous)this.contexts.set(name,previous);else this.contexts.delete(name);}}; }
 action(id: string) { return this.specs.get(id); }
 actions(): ActionSpec[] { return [...this.specs.values()]; }
 onChange(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
 private emit() { for (const listener of [...this.listeners]) { try { listener(); } catch (error) { console.error(error); } } }

 // --- perfis e atalhos --------------------------------------------------------------------
 get profile(): ProfileId { return this.saved.profile ?? (this.platform === 'mac' ? 'default-mac' : 'default-other'); }
 setProfile(profile: ProfileId) {
  if (!profiles.some(item => item.id === profile)) throw new Error(`Unknown keymap profile: ${profile}`);
  this.saved.profile = profile; this.save(); this.emit();
 }
 /** Sistema cujos atalhos o perfil usa (o perfil JetBrains acompanha o SO atual). */
 profilePlatform(profile = this.profile): Platform { return profile === 'default-mac' ? 'mac' : profile === 'default-other' ? 'other' : this.platform; }
 defaultBindings(id: string, profile = this.profile): string[] {
  const spec = this.specs.get(id); if (!spec) return [];
  const os = this.profilePlatform(profile);
  const source = profile === 'jetbrains' && spec.jetbrains && os in spec.jetbrains ? spec.jetbrains : spec.defaults;
  return unique(list(source[os]));
 }
 bindings(id: string): string[] {
  const override = this.saved.overrides[this.profile]?.[id];
  return override ? [...override] : this.defaultBindings(id);
 }
 isCustomized(id: string) { return !!this.saved.overrides[this.profile]?.[id]; }
 setBindings(id: string, strokes: string[]) {
  const invalid = strokes.filter(stroke => !normalizeStroke(stroke));
  if (invalid.length) throw new Error(`Invalid shortcut for ${id}: ${invalid.join(', ')}`);
  const normalized = unique(strokes.map(stroke => normalizeStroke(stroke)!));
  const overrides = this.saved.overrides[this.profile] ??= {};
  const defaults = this.defaultBindings(id);
  if (normalized.length === defaults.length && normalized.every(stroke => defaults.includes(stroke))) delete overrides[id]; else overrides[id] = normalized;
  this.save(); this.emit();
 }
 addBinding(id: string, stroke: string, options: { removeFromOthers?: boolean } = {}) {
  const normalized = normalizeStroke(stroke); if (!normalized) throw new Error(`Invalid shortcut: ${stroke}`);
  if (options.removeFromOthers) for (const other of this.conflictingActions(normalized, id)) this.setBindingsQuiet(other, this.bindings(other).filter(item => item !== normalized));
  this.setBindings(id, [...this.bindings(id), normalized]);
 }
 removeBinding(id: string, stroke: string) { this.setBindings(id, this.bindings(id).filter(item => item !== normalizeStroke(stroke))); }
 resetAction(id: string) { const overrides = this.saved.overrides[this.profile]; if (overrides) delete overrides[id]; this.save(); this.emit(); }
 resetProfile() { delete this.saved.overrides[this.profile]; this.save(); this.emit(); }
 private setBindingsQuiet(id: string, strokes: string[]) { (this.saved.overrides[this.profile] ??= {})[id] = strokes; }

 /** Rótulo do primeiro atalho, já no formato do SO ("⌥F12", "Ctrl+Alt+S"); '' se não houver. */
 shortcut(id: string): string { const first = this.bindings(id)[0]; return first ? formatStroke(first, this.platform) : ''; }
 shortcuts(id: string): string[] { return this.bindings(id).map(stroke => formatStroke(stroke, this.platform)); }
 /** Valor para aria-keyshortcuts (sintaxe WAI-ARIA: Control+Alt+Shift+Meta+Key). */
 ariaShortcuts(id: string): string {
  const aria: Record<string, string> = { Ctrl: 'Control', Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown', Space: 'Space' };
  return this.bindings(id).filter(stroke => stroke !== DOUBLE_SHIFT).map(stroke => stroke.split(/\+(?!$)/).map(part => aria[part] ?? part).join('+')).join(' ');
 }
 isReserved(stroke: string): boolean { const normalized = normalizeStroke(stroke); return !!normalized && RESERVED[this.platform].includes(normalized); }

 // --- conflitos -------------------------------------------------------------------------
 private overlaps(a: ActionSpec, b: ActionSpec) { const x = a.context ?? 'global', y = b.context ?? 'global'; return x === y || x === 'global' || y === 'global'; }
 /** Outras ações que disparariam com o mesmo atalho em algum contexto comum. */
 conflictingActions(stroke: string, id: string): string[] {
  const normalized = normalizeStroke(stroke); const spec = this.specs.get(id);
  if (!normalized) return [];
  return this.actions().filter(other => other.id !== id && (!spec || this.overlaps(spec, other)) && this.bindings(other.id).includes(normalized)).map(other => other.id);
 }
 conflicts(): Conflict[] {
  const byStroke = new Map<string, Set<string>>();
  for (const spec of this.actions()) for (const stroke of this.bindings(spec.id)) for (const other of this.conflictingActions(stroke, spec.id)) {
   const set = byStroke.get(stroke) ?? new Set<string>(); set.add(spec.id); set.add(other); byStroke.set(stroke, set);
  }
  return [...byStroke].map(([stroke, ids]) => ({ stroke, actions: [...ids].sort() }));
 }
 actionsForStroke(stroke: string): string[] { const normalized = normalizeStroke(stroke); return normalized ? this.actions().filter(spec => this.bindings(spec.id).includes(normalized)).map(spec => spec.id) : []; }

 // --- despacho ----------------------------------------------------------------------------
 /** Ação que o atalho executaria no elemento focado: contexto específico vence 'global'; empate = primeira registrada. */
 resolve(stroke: string, target: Element | null): ActionSpec | undefined {
  const candidates = this.actions().filter(spec => this.bindings(spec.id).includes(stroke) && (this.contexts.get(spec.context ?? 'global')?.(target) ?? false) && (spec.enabled?.() ?? true));
  return candidates.find(spec => (spec.context ?? 'global') !== 'global') ?? candidates[0];
 }
 /** A ação pode rodar agora a partir deste elemento (contexto e enabled)? Usado por listas de ações. */
 available(id: string, target: Element | null): boolean {
  const spec = this.specs.get(id);
  return !!spec && (this.contexts.get(spec.context ?? 'global')?.(target) ?? false) && (spec.enabled?.() ?? true);
 }
 run(id: string, context: Partial<ActionContext> = {}): boolean {
  const spec = this.specs.get(id); if (!spec || !(spec.enabled?.() ?? true)) return false;
  try { void Promise.resolve(spec.run({ target: null, keymap: this, ...context })).catch(error => this.fail(error, id)); } catch (error) { this.fail(error, id); }
  return true;
 }
 private fail(error: unknown, id: string) { this.lastError = String((error as Error)?.message ?? error); this.onError(error, id); }
 /** Gesto especial (Shift duplo) detectado fora do fluxo keydown normal. */
 dispatchGesture(gesture: string, target: Element | null = null): boolean { const spec = this.resolve(gesture, target); return spec ? this.run(spec.id, { target }) : false; }
 /** Executa a ação do evento; true quando consumiu (o chamador deve impedir o padrão). */
 dispatch(event: KeyLike, target: Element | null): boolean {
  if (event.isComposing) return false;
  const stroke = strokeFromEvent(event); if (!stroke || !allowedIn(stroke, target)) return false;
  const spec = this.resolve(stroke, target); if (!spec) return false;
  return this.run(spec.id, { event, target });
 }

 /** Instala o despacho único em captura, antes do Monaco/xterm. */
 install(root: Document = document): () => void {
  const listener = (event: KeyboardEvent) => {
   if (event.defaultPrevented) return;
   const target = (event.target instanceof Element ? event.target : null) ?? root.activeElement;
   if (target?.closest('[data-keymap-capture]') || root.querySelector('dialog[open]:modal')) return;
   if (this.dispatch(event, target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  root.addEventListener('keydown', listener, true);
  return () => root.removeEventListener('keydown', listener, true);
 }

 // --- persistência ---------------------------------------------------------------------
 private load() {
  try {
   const raw = this.storage?.getItem(STORAGE_KEY); if (!raw) return;
   const data = JSON.parse(raw) as Partial<Saved>;
   const overrides: Saved['overrides'] = {};
   for (const { id } of profiles) {
    const entries = data.overrides?.[id]; if (!entries || typeof entries !== 'object') continue;
    // Ações ainda não registradas (de outros módulos) são preservadas; atalhos inválidos são descartados.
    overrides[id] = Object.fromEntries(Object.entries(entries).filter(([, value]) => Array.isArray(value)).map(([action, value]) => [action, unique((value as unknown[]).filter((item): item is string => typeof item === 'string').map(normalizeStroke).filter((stroke): stroke is string => !!stroke))]));
   }
   this.saved = { version: 1, overrides, profile: profiles.some(item => item.id === data.profile) ? data.profile : undefined };
  } catch (error) { this.lastError = 'Configuração de atalhos inválida; usando o perfil padrão.'; console.warn(error); }
 }
 private save() {
  try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.saved)); } catch (error) { this.lastError = 'Não foi possível salvar os atalhos.'; console.warn(error); }
 }
}

/**
 * Evita roubar edição de texto: em campos comuns só despacha teclas F ou combinações com Ctrl/⌘
 * fora do conjunto de edição; no Monaco/xterm exige modificador ou tecla F (letras puras são texto).
 */
export function allowedIn(stroke: string, target: Element | null): boolean {
 if (stroke === DOUBLE_SHIFT) return true;
 const parts = stroke.split(/\+(?!$)/); const key = parts.at(-1)!;
 const ctrlOrMeta = parts.includes('Ctrl') || parts.includes('Meta');
 const modified = ctrlOrMeta || parts.includes('Alt');
 if (isFunctionKey(key)) return true;
 if (!target || !isEditable(target)) return true;
 if (target.closest('.monaco-editor')) return modified;
 // No terminal, Ctrl+letra é do shell (Ctrl+C, Ctrl+E...) e Ctrl+Shift+C/V é copiar/colar.
 if (target.closest('.xterm')) return parts.includes('Alt') || parts.includes('Meta') || (parts.includes('Ctrl') && parts.includes('Shift') && !['C', 'V'].includes(key));
 if (!ctrlOrMeta) return false;
 const editing = (['A', 'C', 'V', 'X', 'Y'].includes(key) && parts.length === 2) || (key === 'Z' && !parts.includes('Alt'));
 return !editing && !['Left', 'Right', 'Up', 'Down', 'Home', 'End', 'Backspace', 'Delete'].includes(key);
}
function isEditable(target: Element): boolean {
 const tag = target.tagName;
 return tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes((target as HTMLInputElement).type)) || (target as HTMLElement).isContentEditable === true;
}
function defaultStorage(): StorageLike | null {
 try { return typeof localStorage?.getItem === 'function' ? localStorage : null; } catch { return null; }
}

/** Instância única da IDE. Outros módulos: `import { keymap } from './keymap'` e `keymap.registerAction(...)`. */
export const keymap = new Keymap();
export const registerAction = (spec: ActionSpec) => keymap.registerAction(spec);
