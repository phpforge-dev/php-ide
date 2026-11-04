// UI-KEYMAP-001 — registro central de ações e atalhos.
// Comportamento (perfis por SO, atalhos personalizados por perfil, conflito, Shift duplo) segue a
// documentação pública de keymaps do PhpStorm como especificação; código, nomes internos e UI são próprios.
// Este módulo não importa i18n nem DOM no carregamento para poder ser testado em Node: os rótulos
// são o texto-fonte (pt-BR) e quem exibe traduz com t().

export type Platform = 'mac' | 'other';
export type BuiltinProfileId = 'default-mac' | 'default-other' | 'jetbrains';
/** A bundled profile or a named copy (`custom-…`) made with duplicateProfile(). */
export type ProfileId = BuiltinProfileId | `custom-${string}`;
export type CustomProfile = { id: `custom-${string}`; name: string; parent: BuiltinProfileId };
export type ProfileInfo = { id: ProfileId; label: string; builtin: boolean; parent?: BuiltinProfileId };
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
type Saved = { version: 1; profile?: ProfileId; overrides: Partial<Record<ProfileId, Record<string, string[]>>>; custom?: CustomProfile[] };

export const DOUBLE_SHIFT = 'DoubleShift';
export const STORAGE_KEY = 'php-ide-keymap';
export const profiles: { id: BuiltinProfileId; label: string }[] = [
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

/** Separa um atalho de duas teclas ("⌘K, ⌘C", "Meta+K Meta+C"); a vírgula logo após "+" é a tecla vírgula. */
export function chordParts(input: string): string[] {
 return input.trim().split(/(?<=[^+\s])\s*,\s*(?=\S)|(?<=[^+\s,])\s+(?=[^+\s])/).filter(Boolean);
}
/** Converte "cmd+shift+o", "⌘⇧O" ou "Ctrl+Alt+Left" na forma canônica "Alt+Shift+Meta+O". Atalhos de duas
 *  teclas (chords) ficam "Meta+K Meta+C"; o Shift duplo não participa de chords. */
export function normalizeStroke(input: string): string | undefined {
 const text = input.trim();
 if (!text) return undefined;
 if (text.toLowerCase().replace(/[\s+]/g, '') !== 'doubleshift' && !/^shift\s+shift$/i.test(text)) {
  const parts = chordParts(text);
  if (parts.length === 2) { const [first, second] = parts.map(singleStroke); return first && second && first !== DOUBLE_SHIFT && second !== DOUBLE_SHIFT ? first + ' ' + second : undefined; }
  if (parts.length > 2) return undefined;
 }
 return singleStroke(text);
}
function singleStroke(input: string): string | undefined {
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
 if (stroke.includes(' ')) return stroke.split(' ').map(part => formatStroke(part, platform)).join(', ');
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
  if (!this.hasProfile(profile)) throw new Error(`Unknown keymap profile: ${profile}`);
  this.saved.profile = profile; this.save(); this.emit();
 }
 private hasProfile(profile: string): profile is ProfileId { return profiles.some(item => item.id === profile) || !!this.customProfile(profile); }
 customProfile(id: string): CustomProfile | undefined { return this.saved.custom?.find(item => item.id === id); }
 /** Perfis embutidos (rótulo-fonte em pt-BR, traduzir com t()) seguidos das cópias nomeadas (nome do usuário). */
 profileList(): ProfileInfo[] {
  return [...profiles.map(item => ({ ...item, builtin: true })), ...(this.saved.custom ?? []).map(item => ({ id: item.id, label: item.name, builtin: false, parent: item.parent }))];
 }
 /** Perfil embutido do qual o perfil herda os atalhos padrão (ele mesmo, para os embutidos). */
 baseProfile(profile: ProfileId = this.profile): BuiltinProfileId { return this.customProfile(profile)?.parent ?? (profile as BuiltinProfileId); }
 /**
  * Duplicate… (engrenagem da tela Keymap): cópia nomeada que herda os padrões do perfil embutido de origem e
  * começa com as personalizações do perfil copiado. Passa a ser o perfil ativo. Devolve o id.
  */
 duplicateProfile(name: string, source: ProfileId = this.profile): ProfileId {
  const label = this.checkName(name);
  if (!this.hasProfile(source)) throw new Error(`Unknown keymap profile: ${source}`);
  let id: `custom-${string}`; do id = `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; while (this.customProfile(id));
  (this.saved.custom ??= []).push({ id, name: label, parent: this.baseProfile(source) });
  const copy = this.saved.overrides[source];
  if (copy) this.saved.overrides[id] = Object.fromEntries(Object.entries(copy).map(([action, strokes]) => [action, [...strokes]]));
  this.saved.profile = id; this.save(); this.emit();
  return id;
 }
 renameProfile(id: ProfileId, name: string) {
  const custom = this.customProfile(id); if (!custom) throw new Error('Só keymaps duplicados podem ser renomeados.');
  custom.name = this.checkName(name, id); this.save(); this.emit();
 }
 /** Exclui uma cópia nomeada; se for a ativa, o perfil de origem volta a valer. */
 deleteProfile(id: ProfileId) {
  const custom = this.customProfile(id); if (!custom) throw new Error('Só keymaps duplicados podem ser excluídos.');
  this.saved.custom = this.saved.custom!.filter(item => item !== custom); delete this.saved.overrides[id];
  if (this.saved.profile === id) this.saved.profile = custom.parent;
  this.save(); this.emit();
 }
 private checkName(name: string, except?: string): string {
  const label = name.trim().replace(/\s+/g, ' ');
  if (!label) throw new Error('Informe um nome para o keymap.');
  if (label.length > 80) throw new Error('Nome de keymap muito longo.');
  const taken = (this.saved.custom ?? []).some(item => item.id !== except && item.name.toLocaleLowerCase() === label.toLocaleLowerCase()) || profiles.some(item => item.label.toLocaleLowerCase() === label.toLocaleLowerCase());
  if (taken) throw new Error('Já existe um keymap com esse nome.');
  return label;
 }
 /** Sistema cujos atalhos o perfil usa (o perfil JetBrains acompanha o SO atual). */
 profilePlatform(profile: ProfileId = this.profile): Platform { const base = this.baseProfile(profile); return base === 'default-mac' ? 'mac' : base === 'default-other' ? 'other' : this.platform; }
 defaultBindings(id: string, profile: ProfileId = this.profile): string[] {
  const spec = this.specs.get(id); if (!spec) return [];
  const os = this.profilePlatform(profile);
  const source = this.baseProfile(profile) === 'jetbrains' && spec.jetbrains && os in spec.jetbrains ? spec.jetbrains : spec.defaults;
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
  return this.bindings(id).filter(stroke => stroke !== DOUBLE_SHIFT && !stroke.includes(' ')).map(stroke => stroke.split(/\+(?!$)/).map(part => aria[part] ?? part).join('+')).join(' ');
 }
 isReserved(stroke: string): boolean { const normalized = normalizeStroke(stroke); return !!normalized && RESERVED[this.platform].includes(normalized); }

 // --- conflitos -------------------------------------------------------------------------
 private overlaps(a: ActionSpec, b: ActionSpec) { const x = a.context ?? 'global', y = b.context ?? 'global'; return x === y || x === 'global' || y === 'global'; }
 /** Outras ações que disparariam com o mesmo atalho em algum contexto comum. */
 conflictingActions(stroke: string, id: string): string[] {
  const normalized = normalizeStroke(stroke); const spec = this.specs.get(id);
  if (!normalized) return [];
  // Um chord conflita também com o atalho simples igual à sua primeira tecla (um encobre o outro).
  const clash = (other: string) => other === normalized || other.startsWith(normalized + ' ') || normalized.startsWith(other + ' ');
  return this.actions().filter(other => other.id !== id && (!spec || this.overlaps(spec, other)) && this.bindings(other.id).some(clash)).map(other => other.id);
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
  return this.resolveAll(stroke, target)[0];
 }
 /** Todas as ações disponíveis para o atalho no nível de contexto que vence (específico antes de 'global'). */
 resolveAll(stroke: string, target: Element | null): ActionSpec[] {
  const candidates = this.actions().filter(spec => this.bindings(spec.id).includes(stroke) && (this.contexts.get(spec.context ?? 'global')?.(target) ?? false) && (spec.enabled?.() ?? true));
  const specific = candidates.filter(spec => (spec.context ?? 'global') !== 'global');
  return specific.length ? specific : candidates;
 }
 /** Há chord disponível que começa com este atalho? */
 private startsChord(stroke: string, target: Element | null) {
  return this.actions().some(spec => this.bindings(spec.id).some(binding => binding.startsWith(stroke + ' ')) && (this.contexts.get(spec.context ?? 'global')?.(target) ?? false) && (spec.enabled?.() ?? true));
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
  const stroke = strokeFromEvent(event); if (!stroke) return false;
  if (this.pending) {
   const first = this.pending; this.pending = undefined; this.onPending(undefined);
   const chord = first + ' ' + stroke;
   if (this.runFor(chord, event, target)) return true;
   if (stroke === 'Escape') return true;
   // Segunda tecla sem chord: a primeira vale sozinha (se tiver ação) e esta segue o fluxo normal.
   this.runFor(first, event, target);
  }
  if (!allowedIn(stroke, target)) return false;
  if (this.startsChord(stroke, target)) { this.pending = stroke; this.onPending(stroke); return true; }
  return this.runFor(stroke, event, target);
 }
 /** Executa a ação do atalho; com várias empatadas, pergunta qual (seletor de conflito, como no PhpStorm). */
 private runFor(stroke: string, event: KeyLike | undefined, target: Element | null): boolean {
  const specs = this.resolveAll(stroke, target); if (!specs.length) return false;
  if (specs.length > 1 && this.chooser) { this.chooser(specs, stroke, id => this.run(id, { event, target })); return true; }
  return this.run(specs[0].id, { event, target });
 }
 /** Atalho de duas teclas esperando a segunda (para a barra de status). */
 pending: string | undefined;
 onPending: (stroke: string | undefined) => void = () => {};
 /** Interface que escolhe entre ações com o mesmo atalho; ausente, vence a primeira registrada. */
 chooser: ((actions: ActionSpec[], stroke: string, run: (id: string) => void) => void) | undefined;
 cancelPending() { if (this.pending) { this.pending = undefined; this.onPending(undefined); } }

 /** Instala o despacho único em captura, antes do Monaco/xterm. */
 install(root: Document = document): () => void {
  const listener = (event: KeyboardEvent) => {
   if (event.defaultPrevented) return;
   const target = (event.target instanceof Element ? event.target : null) ?? root.activeElement;
   if (target?.closest('[data-keymap-capture]') || root.querySelector('dialog[open]:modal')) return;
   if (this.dispatch(event, target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const cancel = () => this.cancelPending();
  root.addEventListener('keydown', listener, true); root.addEventListener('mousedown', cancel, true); root.defaultView?.addEventListener('blur', cancel);
  return () => { root.removeEventListener('keydown', listener, true); root.removeEventListener('mousedown', cancel, true); root.defaultView?.removeEventListener('blur', cancel); };
 }

 // --- importar/exportar ------------------------------------------------------------------
 /** Personalizações do perfil atual como JSON próprio (formato php-ide-keymap, versão 1). */
 exportProfile(): string {
  const profile = this.profile;
  const custom = this.customProfile(profile);
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, profile: custom ? custom.parent : profile, ...(custom ? { name: custom.name } : {}), platform: this.profilePlatform(profile), overrides: this.saved.overrides[profile] ?? {} }, null, 2);
 }
 /**
  * Aplica ao perfil atual um export nosso (JSON) ou um keymap do PhpStorm/IntelliJ (XML de
  * `keymaps/*.xml`, formato público): ações conhecidas são mapeadas, as demais voltam em `skipped`.
  * O JSON substitui as personalizações do perfil; o XML acrescenta por cima delas.
  */
 importProfile(text: string): ImportReport {
  const report: ImportReport = { format: 'json', applied: [], skipped: [], invalid: [] };
  const source = text.trim();
  if (source.startsWith('<')) {
   report.format = 'xml';
   const entries = parseJetBrainsKeymap(source);
   if (!entries) throw new Error('Keymap XML inválido.');
   const overrides = this.saved.overrides[this.profile] ??= {};
   for (const [action, strokes] of entries) {
    const id = JETBRAINS_ACTIONS[action];
    if (!id) { report.skipped.push(action); continue; }
    const valid = strokes.map(normalizeStroke).filter((stroke): stroke is string => !!stroke);
    if (valid.length < strokes.length) report.invalid.push(action);
    overrides[id] = unique(valid); report.applied.push(id);
   }
  } else {
   let data: { format?: unknown; version?: unknown; overrides?: unknown };
   try { data = JSON.parse(source); } catch { throw new Error('Arquivo de atalhos inválido: não é JSON nem XML.'); }
   if (data.format !== EXPORT_FORMAT || data.version !== 1 || !data.overrides || typeof data.overrides !== 'object') throw new Error('Arquivo de atalhos de outro formato ou versão.');
   const overrides: Record<string, string[]> = {};
   for (const [id, value] of Object.entries(data.overrides as Record<string, unknown>)) {
    if (!/^[\w.-]+$/.test(id) || !Array.isArray(value)) { report.invalid.push(id); continue; }
    const strokes = value.filter((item): item is string => typeof item === 'string').map(normalizeStroke).filter((stroke): stroke is string => !!stroke);
    if (strokes.length < value.length) report.invalid.push(id);
    overrides[id] = unique(strokes); (this.specs.has(id) ? report.applied : report.skipped).push(id);
   }
   this.saved.overrides[this.profile] = overrides;
  }
  this.save(); this.emit();
  return report;
 }

 // --- persistência ---------------------------------------------------------------------
 private load() {
  try {
   const raw = this.storage?.getItem(STORAGE_KEY); if (!raw) return;
   const data = JSON.parse(raw) as Partial<Saved>;
   const overrides: Saved['overrides'] = {};
   const custom = (Array.isArray(data.custom) ? data.custom : []).filter((item): item is CustomProfile => !!item && typeof item.id === 'string' && /^custom-[\w-]+$/.test(item.id) && typeof item.name === 'string' && !!item.name.trim() && profiles.some(p => p.id === item.parent))
    .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).map(item => ({ id: item.id, name: item.name.trim(), parent: item.parent }));
   for (const { id } of [...profiles, ...custom]) {
    const entries = data.overrides?.[id]; if (!entries || typeof entries !== 'object') continue;
    // Ações ainda não registradas (de outros módulos) são preservadas; atalhos inválidos são descartados.
    overrides[id] = Object.fromEntries(Object.entries(entries).filter(([, value]) => Array.isArray(value)).map(([action, value]) => [action, unique((value as unknown[]).filter((item): item is string => typeof item === 'string').map(normalizeStroke).filter((stroke): stroke is string => !!stroke))]));
   }
   const known = (profile: unknown): profile is ProfileId => profiles.some(item => item.id === profile) || custom.some(item => item.id === profile);
   this.saved = { version: 1, overrides, profile: known(data.profile) ? data.profile : undefined, ...(custom.length ? { custom } : {}) };
  } catch (error) { this.lastError = 'Configuração de atalhos inválida; usando o perfil padrão.'; console.warn(error); }
 }
 private save() {
  try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.saved)); } catch (error) { this.lastError = 'Não foi possível salvar os atalhos.'; console.warn(error); }
 }
}

export const EXPORT_FORMAT = 'php-ide-keymap';
export type ImportReport = { format: 'json' | 'xml'; applied: string[]; skipped: string[]; invalid: string[] };
/** Ids públicos de ações do IntelliJ/PhpStorm (keymaps open source) → ações desta IDE. */
export const JETBRAINS_ACTIONS: Record<string, string> = {
 ActivateProjectToolWindow: 'tool.project', ActivateProblemsViewToolWindow: 'tool.problems', ActivateVersionControlToolWindow: 'tool.git',
 ActivateCommitToolWindow: 'tool.commit', ActivateServicesToolWindow: 'tool.docker', ActivateTerminalToolWindow: 'tool.terminal', ActivateDatabaseToolWindow: 'tool.database',
 GotoDeclaration: 'nav.declaration', GotoImplementation: 'nav.implementations', FindUsages: 'nav.usages', Back: 'nav.back', Forward: 'nav.forward',
 ShowSettings: 'ide.settings', SearchEverywhere: 'search.everywhere', GotoAction: 'search.actions', GotoFile: 'search.files', GotoClass: 'search.classes',
 GotoSymbol: 'search.symbols', FindInPath: 'search.text', SaveAll: 'file.save', ReformatCode: 'code.reformat',
 CloseContent: 'editor.closeTab', CloseAllEditors: 'editor.closeAllTabs', CloseAllEditorsButActive: 'editor.closeOtherTabs', CloseAllUnpinnedEditors: 'editor.closeUnpinnedTabs',
 CloseAllToTheLeft: 'editor.closeTabsLeft', CloseAllToTheRight: 'editor.closeTabsRight', PinActiveEditorTab: 'editor.pinTab', PinActiveTabToggle: 'editor.pinTab',
 CopyReference: 'editor.copyReference', EditorToggleColumnMode: 'editor.columnSelection', ShowPopupMenu: 'editor.contextMenu', 'Git.Branches': 'git.branches',
};
const JAVA_KEYS: Record<string, string> = {
 BACK_SPACE: 'Backspace', PAGE_UP: 'PageUp', PAGE_DOWN: 'PageDown', OPEN_BRACKET: '[', CLOSE_BRACKET: ']', BACK_SLASH: '\\', SEMICOLON: ';', QUOTE: "'",
 BACK_QUOTE: '`', MINUS: '-', EQUALS: '=', COMMA: ',', PERIOD: '.', SLASH: '/', CONTEXT_MENU: 'ContextMenu', ESCAPE: 'Escape', ENTER: 'Enter', SPACE: 'Space',
};
/** "meta shift O" (javax.swing.KeyStroke) → "Shift+Meta+O". */
export function jetbrainsStroke(text: string): string | undefined {
 const words = text.trim().split(/\s+/); const key = words.pop(); if (!key) return undefined;
 const mods = words.map(word => ({ meta: 'Meta', ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift' } as Record<string, string>)[word.toLowerCase()]);
 if (mods.some(mod => !mod)) return undefined;
 return singleStroke([...mods, JAVA_KEYS[key] ?? key].join('+'));
}
function parseJetBrainsKeymap(xml: string): [string, string[]][] | undefined {
 if (!/<keymap\b/.test(xml)) return undefined;
 const decode = (value: string) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e]);
 const attr = (tag: string, name: string) => { const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag); return m ? decode(m[1]) : undefined; };
 const out: [string, string[]][] = [];
 for (const match of xml.matchAll(/<action\b([^>]*?)(?:\/>|>([\s\S]*?)<\/action>)/g)) {
  const id = attr(match[1], 'id'); if (!id) continue;
  const strokes: string[] = [];
  for (const shortcut of (match[2] ?? '').matchAll(/<keyboard-shortcut\b[^>]*>/g)) {
   const first = attr(shortcut[0], 'first-keystroke'); const second = attr(shortcut[0], 'second-keystroke');
   const a = first ? jetbrainsStroke(first) : undefined; const b = second ? jetbrainsStroke(second) : undefined;
   strokes.push(a && (!second || b) ? (b ? a + ' ' + b : a) : '#invalid');
  }
  out.push([id, strokes]);
 }
 return out;
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
