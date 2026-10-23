import type { CodeCompletion, CodeSite, IdePlugin, PluginCodeLens, PluginCompletion, PluginDiagnostic, PluginLocation, PluginManifest, PluginPermission, ProjectFiles, StringSite } from './api';
import { PLUGIN_LANGUAGES } from './api';

// Plugins de terceiros rodam isolados (Web Worker na interface; worker_threads nos testes).
// O worker não recebe IPC: toda saída é uma mensagem `rpc` conferida pela PluginBridge.
export type Channel = { post(message: unknown): void; listen(receive: (message: any) => void, fail: (error: string) => void): void; terminate(): void };
export type FetchOptions = { method?: string; headers?: Record<string, string>; body?: string };
/** Operações privilegiadas; escrita, processos e rede são conferidas de novo no backend. */
export interface PluginServices {
 files: ProjectFiles;
 write(key: string, path: string, text: string): Promise<unknown>;
 exec(key: string, program: string, args: string[], input?: string): Promise<string>;
 fetch(key: string, url: string, options: FetchOptions): Promise<{ status: number; body: string }>;
}
export class PermissionDenied extends Error {
 constructor(readonly permission: PluginPermission) { super('PermissionDenied: ' + permission); }
}
const NEEDS: Record<string, PluginPermission | null> = { read: 'project.read', list: 'project.read', exists: 'project.read', write: 'project.write', exec: 'process', fetch: 'network', log: null };
function relative(value: unknown, allowRoot = false): string {
 if (typeof value !== 'string' || value.length > 1024 || /[\0\\]/.test(value) || value.startsWith('/') || /^[A-Za-z]:/.test(value)) throw new Error('Caminho inválido');
 const parts = value.split('/').filter(p => p && p !== '.');
 if (parts.includes('..') || (!allowRoot && !parts.length)) throw new Error('Caminho inválido');
 return parts.join('/');
}
const short = (value: unknown, max: number, what: string) => { if (typeof value !== 'string' || value.length > max) throw new Error(what + ' inválido'); return value; };

/** Única saída do worker: cada método exige a permissão correspondente concedida pelo usuário. */
export class PluginBridge {
 constructor(readonly key: string, private granted: ReadonlySet<PluginPermission>, private services: PluginServices, private report: (kind: 'denied' | 'log', text: string) => void = () => {}) {}
 async handle(method: string, args: unknown[]): Promise<unknown> {
  if (!Object.hasOwn(NEEDS, method)) throw new Error('Método desconhecido: ' + method);
  const need = NEEDS[method];
  if (need && !this.granted.has(need)) { this.report('denied', `${need} (${method})`); throw new PermissionDenied(need); }
  const files = this.services.files;
  switch (method) {
   case 'read': return files.read(relative(args[0]));
   case 'exists': return files.exists(relative(args[0]));
   case 'list': return (await files.list(relative(args[0] ?? '', true), () => true)).slice(0, 20000);
   case 'write': return this.services.write(this.key, relative(args[0]), short(args[1], 2 * 1024 * 1024, 'Texto'));
   case 'exec': {
    const list = Array.isArray(args[1]) ? args[1] : [];
    if (list.length > 64 || list.some(a => typeof a !== 'string' || a.length > 4096)) throw new Error('Argumentos inválidos');
    return this.services.exec(this.key, short(args[0], 256, 'Programa'), list as string[], args[2] === undefined || args[2] === null ? undefined : short(args[2], 2 * 1024 * 1024, 'Entrada'));
   }
   case 'fetch': {
    const o = (args[1] && typeof args[1] === 'object' ? args[1] : {}) as Record<string, unknown>;
    const headers = o.headers && typeof o.headers === 'object' ? Object.fromEntries(Object.entries(o.headers).filter(([, v]) => typeof v === 'string').slice(0, 20)) as Record<string, string> : undefined;
    return this.services.fetch(this.key, short(args[0], 2048, 'URL'), { method: typeof o.method === 'string' ? o.method : undefined, headers, body: typeof o.body === 'string' ? o.body.slice(0, 2 * 1024 * 1024) : undefined });
   }
   default: this.report('log', args.map(String).join(' ').slice(0, 2000)); return null;
  }
 }
}

/** Padrão de caminho com `**`, `*` e `?`. */
export function globToRegExp(glob: string): RegExp {
 let out = '';
 for (let i = 0; i < glob.length; i++) {
  const c = glob[i];
  if (c === '*' && glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; out += '(?:.*/)?'; } else out += '.*'; }
  else if (c === '*') out += '[^/]*';
  else if (c === '?') out += '[^/]';
  else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
 }
 return new RegExp('^' + out + '$');
}
export function documentMatcher(manifest: PluginManifest): (path: string) => boolean {
 const tests = [...(manifest.activation.languages ?? []).map(l => PLUGIN_LANGUAGES[l]).filter(Boolean), ...(manifest.activation.documents ?? []).map(g => { const r = globToRegExp(g); return (p: string) => r.test(p); })];
 return tests.length ? path => tests.some(t => t(path)) : path => path.endsWith('.php');
}

// Saneamento: o resultado do plugin vira dado inerte, com limites, antes de chegar ao editor.
const str = (v: unknown, max: number) => typeof v === 'string' && v ? v.slice(0, max) : undefined;
const int = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1e7 ? v as number : null;
const pos = (v: any) => { const line = int(v?.line), character = int(v?.character); return line === null || character === null ? null : { line, character }; };
const range = (v: any) => { const start = pos(v?.start), end = pos(v?.end); return start && end ? { start, end } : null; };
const list = <T>(v: unknown, max: number, map: (x: any) => T | null): T[] => Array.isArray(v) ? v.slice(0, max).map(map).filter((x): x is T => x !== null) : [];
function completion(v: any): (PluginCompletion & { insertText?: string }) | null {
 const label = str(v?.label, 500); if (!label) return null;
 const detail = str(v?.labelDetails?.detail, 200), description = str(v?.labelDetails?.description, 200);
 return { label, kind: int(v.kind) ?? 1, ...(detail || description ? { labelDetails: { ...(detail ? { detail } : {}), ...(description ? { description } : {}) } } : {}),
  ...(str(v.detail, 500) ? { detail: str(v.detail, 500) } : {}), ...(typeof v.insertText === 'string' ? { insertText: v.insertText.slice(0, 10000) } : {}) };
}

export type PluginRuntimeInfo = { state: 'loading' | 'active' | 'failed' | 'stopped'; hooks: string[]; errors: string[]; denied: string[] };
type Options = { rootUri: string; onChange?: () => void; hookTimeout?: number; loadTimeout?: number };

/** Adaptador IdePlugin ↔ worker: mesmos ganchos de api.ts, com tempo limite e resultados saneados. */
export class SandboxedPlugin implements IdePlugin {
 readonly id: string;
 readonly name: string;
 readonly markers: readonly string[];
 readonly info: PluginRuntimeInfo = { state: 'loading', hooks: [], errors: [], denied: [] };
 readonly ready: Promise<boolean>;
 readonly documents: (path: string) => boolean;
 private channel?: Channel;
 private next = 0;
 private calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
 private bridge: PluginBridge;
 constructor(readonly key: string, readonly manifest: PluginManifest, code: string, readonly granted: readonly PluginPermission[], private services: PluginServices, open: () => Channel, private options: Options) {
  this.id = manifest.id; this.name = manifest.name; this.markers = manifest.activation.files ?? [];
  this.documents = documentMatcher(manifest);
  this.bridge = new PluginBridge(key, new Set(granted), services, (kind, text) => {
   if (kind === 'denied') { this.info.denied = [...this.info.denied.filter(d => d !== text), text].slice(-20); this.options.onChange?.(); }
   else console.info(`[plugin ${this.id}]`, text);
  });
  this.ready = this.start(code, open);
 }
 private changed() { this.options.onChange?.(); }
 private error(text: string) { this.info.errors = [...this.info.errors, text.slice(0, 2000)].slice(-20); this.changed(); }
 private start(code: string, open: () => Channel): Promise<boolean> {
  return new Promise(resolve => {
   let channel: Channel;
   try { channel = open(); } catch (error) { this.error(String(error)); this.info.state = 'failed'; resolve(false); return; }
   this.channel = channel;
   const timer = setTimeout(() => { this.error(`Carregamento excedeu ${this.options.loadTimeout ?? 5000} ms`); this.stop('failed'); resolve(false); }, this.options.loadTimeout ?? 5000);
   channel.listen(message => {
    if (this.info.state === 'loading' && message?.t === 'loaded') {
     clearTimeout(timer); this.info.state = 'active';
     this.info.hooks = Array.isArray(message.hooks) ? message.hooks.filter((h: unknown) => typeof h === 'string').slice(0, 20) : [];
     this.changed(); resolve(true); return;
    }
    if (this.info.state === 'loading' && message?.t === 'failed') { clearTimeout(timer); this.error(String(message.error)); this.stop('failed'); resolve(false); return; }
    this.receive(message);
   }, error => { clearTimeout(timer); this.error(error); this.stop('failed'); resolve(false); });
   channel.post({ t: 'load', code, manifest: this.manifest, granted: [...this.granted], rootUri: this.options.rootUri, root: this.granted.includes('project.read') ? this.services.files.root : '' });
  });
 }
 private receive(m: any) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'rpc') {
   this.bridge.handle(String(m.method), Array.isArray(m.args) ? m.args : []).then(
    value => this.channel?.post({ t: 'rpc', id: m.id, ok: true, value: value ?? null }),
    error => this.channel?.post({ t: 'rpc', id: m.id, ok: false, error: String(error?.message ?? error) }));
   return;
  }
  if (m.t === 'result') {
   const call = this.calls.get(m.id); if (!call) return;
   this.calls.delete(m.id); clearTimeout(call.timer);
   if (m.ok) call.resolve(m.value); else call.reject(new Error(String(m.error)));
  }
 }
 stop(state: 'stopped' | 'failed' = 'stopped') {
  this.channel?.terminate(); this.channel = undefined;
  for (const call of this.calls.values()) { clearTimeout(call.timer); call.reject(new Error('Plugin interrompido')); }
  this.calls.clear();
  if (this.info.state !== 'failed') this.info.state = state;
  this.changed();
 }
 private call(hook: string, args: unknown[]): Promise<any> {
  if (this.info.state !== 'active' || !this.channel || !this.info.hooks.includes(hook)) return Promise.resolve(null);
  const id = ++this.next; const ms = this.options.hookTimeout ?? 4000;
  return new Promise((resolve, reject) => {
   // Gancho que não responde (laço infinito) encerra o worker; o restante da IDE segue.
   const timer = setTimeout(() => { this.calls.delete(id); this.error(`${hook}: sem resposta em ${ms} ms; plugin interrompido`); this.stop('failed'); reject(new Error('Tempo esgotado')); }, ms);
   this.calls.set(id, { resolve, reject, timer });
   this.channel!.post({ t: 'call', id, hook, args });
  });
 }
 private async hook<T>(hook: string, args: unknown[], fallback: T): Promise<any> {
  if (!await this.ready) return fallback;
  try { return await this.call(hook, args); } catch (error: any) { if (this.info.state === 'active') this.error(`${hook}: ${error?.message ?? error}`); return fallback; }
 }
 async detect(files: ProjectFiles): Promise<{ version?: string } | null> {
  // Marcadores conferidos pela IDE: o plugin não precisa de leitura para ser ativado.
  if (this.markers.length && !(await Promise.all(this.markers.map(m => files.exists(m).catch(() => false)))).some(Boolean)) return null;
  if (!await this.ready) return null;
  if (!this.info.hooks.includes('detect')) return {};
  const found = await this.hook('detect', [], null);
  return found && typeof found === 'object' ? (str(found.version, 40) ? { version: str(found.version, 40) } : {}) : null;
 }
 invalidates(path: string) { this.channel?.post({ t: 'changed', path }); return false; }
 private location = (v: any): PluginLocation | null => {
  const r = range(v?.range); if (!r || typeof v?.uri !== 'string') return null;
  // Só destinos dentro do projeto; documentos virtuais (`content`) ficam com plugins internos.
  let href: string; try { href = new URL(v.uri).href; } catch { return null; }
  return href.startsWith(this.options.rootUri) ? { uri: href, range: r, ...(v.preserveView === true ? { preserveView: true } : {}) } : null;
 };
 async completeString(site: StringSite): Promise<PluginCompletion[] | null> {
  const v = await this.hook('completeString', [site], null);
  return Array.isArray(v) ? list(v, 1000, completion).map(({ insertText: _, ...item }) => item) : null;
 }
 async defineString(site: StringSite): Promise<PluginLocation[] | null> {
  const v = await this.hook('defineString', [site], null); return Array.isArray(v) ? list(v, 100, this.location) : null;
 }
 async completeCode(site: CodeSite): Promise<CodeCompletion | null> {
  const v = await this.hook('completeCode', [site], null);
  const from = int(v?.from);
  return from === null || from > site.offset ? null : { from, items: list(v.items, 1000, completion) };
 }
 async defineCode(site: CodeSite): Promise<PluginLocation[] | null> {
  const v = await this.hook('defineCode', [site], null); return Array.isArray(v) ? list(v, 100, this.location) : null;
 }
 async diagnose(path: string, text: string): Promise<PluginDiagnostic[]> {
  return list(await this.hook('diagnose', [path, text], []), 500, (d: any) => {
   const r = range(d?.range), message = str(d?.message, 1000);
   return r && message ? { range: r, message, code: `${this.id}/${str(d.code, 80) ?? 'plugin'}`, severity: d.severity === 'error' ? 'error' : 'warning' } : null;
  });
 }
 async codeLenses(path: string, text: string): Promise<PluginCodeLens[]> {
  return list(await this.hook('codeLenses', [path, text], []), 200, (l: any) => {
   const line = int(l?.line), title = str(l?.title, 120), command = str(l?.command, 80);
   if (line === null || !title) return null;
   let args: unknown[] = [];
   try { const json = JSON.stringify(Array.isArray(l.arguments) ? l.arguments : []); if (json.length <= 10000) args = JSON.parse(json); } catch { /* argumentos não serializáveis são descartados */ }
   // O comando do editor é sempre o despachante de plugins: o plugin não aciona comandos internos.
   return { line, title, ...(str(l.tooltip, 300) ? { tooltip: str(l.tooltip, 300) } : {}), command: 'php-ide.pluginCommand', arguments: command ? [this.key, command, args] : [this.key, '', []] };
  });
 }
 /** Comando de CodeLens (`commands[nome]` do plugin). */
 async command(name: string, args: unknown[]): Promise<unknown> {
  if (!name) return null;
  return this.hook('command', [name, args], null);
 }
}

/** Código do worker (texto puro, sem transformação do bundler). Remove rede, IPC e subexecução
 * do escopo global antes de avaliar o plugin; a CSP da janela é a segunda barreira. */
export const WORKER_SOURCE = String.raw`'use strict';
(() => {
 const scope = self;
 const send = scope.postMessage.bind(scope);
 const listen = scope.addEventListener.bind(scope);
 const blocked = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'indexedDB', 'caches', 'BroadcastChannel', 'WebTransport', 'RTCPeerConnection', 'RTCDataChannel', 'navigator', 'postMessage', 'process', 'require', 'Deno', 'Bun', '__TAURI__', '__TAURI_INTERNALS__', '__TAURI_IPC__', 'webkit'];
 for (let o = scope; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
  for (const name of blocked) { try { if (Object.prototype.hasOwnProperty.call(o, name)) delete o[name]; } catch {} }
 for (const name of blocked) { try { Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false }); } catch {} }
 const HOOKS = ['detect', 'completeString', 'defineString', 'completeCode', 'defineCode', 'diagnose', 'codeLenses'];
 let plugin = null, files = null, next = 0;
 const pending = new Map();
 const rpc = (method, ...args) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); send({ t: 'rpc', id, method, args }); });
 const load = async m => {
  const rootUri = m.rootUri;
  const uri = path => new URL(String(path).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/'), rootUri).href;
  const project = Object.freeze({ root: m.root, read: p => rpc('read', p), exists: p => rpc('exists', p), list: (dir = '') => rpc('list', dir), write: (p, text) => rpc('write', p, text), uri });
  files = Object.freeze({ root: m.root, read: project.read, exists: project.exists, uri, list: async (dir, accept) => (await rpc('list', dir || '')).filter(p => typeof accept !== 'function' || accept(p.split('/').pop())) });
  const ide = Object.freeze({
   manifest: Object.freeze(m.manifest), permissions: Object.freeze(m.granted.slice()), project,
   register(p) { if (plugin) throw new Error('ide.register chamado duas vezes'); if (!p || typeof p !== 'object') throw new TypeError('ide.register espera um objeto'); plugin = p; },
   process: Object.freeze({ run: (program, args = [], options = {}) => rpc('exec', program, args, options.input) }),
   net: Object.freeze({ fetch: (url, options = {}) => rpc('fetch', url, options) }),
   log: (...a) => { rpc('log', ...a.map(String)).catch(() => {}); },
  });
  const run = new Function('ide', '"use strict";\n' + m.code + '\n//# sourceURL=php-ide-plugin:' + m.manifest.id);
  await run(ide);
  if (!plugin) throw new Error('O plugin não chamou ide.register(...)');
  return HOOKS.filter(h => typeof plugin[h] === 'function').concat(plugin.commands && typeof plugin.commands === 'object' ? ['command'] : []);
 };
 listen('message', async event => {
  const m = event.data;
  if (!m || typeof m !== 'object') return;
  if (m.t === 'rpc') { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error)); return; }
  if (m.t === 'load') { try { send({ t: 'loaded', hooks: await load(m) }); } catch (e) { send({ t: 'failed', error: String((e && e.stack) || e) }); } return; }
  if (m.t === 'changed') { try { if (plugin && typeof plugin.invalidates === 'function' && plugin.invalidates(m.path) && typeof plugin.invalidate === 'function') plugin.invalidate(); } catch {} return; }
  if (m.t === 'call') {
   try {
    let value;
    if (m.hook === 'command') {
     const fn = plugin.commands && plugin.commands[m.args[0]];
     if (typeof fn !== 'function' || !Object.prototype.hasOwnProperty.call(plugin.commands, m.args[0])) throw new Error('Comando desconhecido: ' + m.args[0]);
     value = await fn.apply(plugin.commands, [...(m.args[1] || []), files]);
    } else value = await plugin[m.hook](...m.args, files);
    send({ t: 'result', id: m.id, ok: true, value: value === undefined ? null : value });
   } catch (e) { send({ t: 'result', id: m.id, ok: false, error: String((e && e.message) || e) }); }
  }
 });
})();
`;
