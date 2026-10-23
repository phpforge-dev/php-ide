import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, dirname, relative } from 'node:path';
import { RpcProcess } from './rpc';
import { Workspace } from './workspace';
import type { LanguageInput } from '../shared/contracts';
import { PhpClassIndex } from './php-index';
import { PluginHost } from './plugins/host';
import { LaravelPlugin } from './plugins/laravel';
import { DotenvPlugin } from './plugins/dotenv';
import { DatabasePlugin, type DatabaseServices } from './plugins/database';
import { analyze, codeOnly, literalAt, offsetOf, position, segments } from './php-source';
import { classContext, classInsertion, signature } from './php-completion';
const methods = new Set(['textDocument/definition', 'textDocument/completion', 'textDocument/hover',
  'textDocument/references', 'textDocument/implementation']);
export class PhpLanguage {
  private rpc?: RpcProcess;
  private ready?: Promise<void>;
  private documents = new Map<string, { text: string; version: number }>();
  private disposed = false;
  private initialized = false;
  private refreshPending = false;
  private refreshing = false;
  private refreshTimer?: NodeJS.Timeout;
  private refreshWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();
  private container = `php-ide-${randomUUID()}`;
  private indexed?: () => void;
  private indexToken?: string | number;
  private indexReady = new Promise<void>(resolve => { this.indexed = resolve; });
  readonly classes: PhpClassIndex;
  readonly plugins: PluginHost;
  constructor(private workspace: Workspace, private tools: string, private cache: string,
    private status: (message: string) => void, services: { database?: DatabaseServices } = {}) {
    this.classes = new PhpClassIndex(workspace.root);
    this.plugins = new PluginHost(workspace.root, [new LaravelPlugin(), new DotenvPlugin(), ...(services.database ? [new DatabasePlugin(services.database)] : [])]);
  }
  start() {
    void this.classes.build();
    this.ready ??= this.initialize();
    return this.ready;
  }
  private async initialize() {
    await mkdir(this.cache, { recursive: true });
    if (this.disposed) throw new Error('Projeto encerrado');
    const php = process.env.PHP_IDE_PHP_BIN;
    const runtime = php ? [join(this.tools, 'phpactor.phar'), 'language-server'] :
      ['run', '--name', this.container, '--rm', '-i', '--network', 'none', '-e', 'XDG_CACHE_HOME=/cache',
        '-v', `${this.workspace.root}:${this.workspace.root}:ro`, '-v', `${this.tools}:/tools:ro`,
        '-v', `${this.cache}:/cache`, '-w', this.workspace.root, 'php:8.3-cli',
        'php', '/tools/phpactor.phar', 'language-server'];
    // amp-fswatch aplica interseção entre globs; limitar a um glob mantém eventos PHP alcançáveis.
    runtime.push('--config-extra=' + JSON.stringify({
      'indexer.enabled_watchers': ['lsp'],
      'indexer.include_patterns': ['/**/*.php']
    }));
    this.status('Iniciando inteligência PHP…');
    const rpc = this.rpc = new RpcProcess(php ?? 'docker', runtime, 'lsp', this.workspace.root);
    rpc.onError = message => { if (!this.disposed) this.status(message); };
    rpc.onRequest = message => message.method === 'workspace/configuration' ? (message.params?.items ?? []).map(() => null) : null;
    rpc.onNotification = message => {
      if (message.method === '$/progress') {
        const v = message.params?.value;
        if (v?.kind === 'begin' && v.title === 'Indexing workspace') this.indexToken = message.params?.token;
        if (v?.kind === 'end' && this.indexToken !== undefined && message.params?.token === this.indexToken) {
          this.indexed?.(); this.refreshing = false;
          if (this.refreshPending) this.scheduleRefresh();
          else this.finishRefresh();
        }
        this.status(v?.message ?? v?.title ?? (v?.kind === 'end' ? 'Análise PHP atualizada' : 'Indexando…'));
      }
    };
    await rpc.request('initialize', {
      processId: process.pid, rootUri: pathToFileURL(this.workspace.root).href,
      workspaceFolders: [{ uri: pathToFileURL(this.workspace.root).href, name: this.workspace.info().name }],
      capabilities: { window: { workDoneProgress: true }, workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true } },
        general: { positionEncodings: ['utf-16'] }, textDocument: {
          completion: { completionItem: { snippetSupport: true, labelDetailsSupport: true, resolveSupport: { properties: ['detail','documentation'] } } },
          definition: { linkSupport: true }, hover: { contentFormat: ['markdown', 'plaintext'] } } }
    }, 60000);
    rpc.notify('initialized', {});
    let timer: NodeJS.Timeout;
    try { await Promise.race([this.indexReady, new Promise<void>((_,reject) => { timer = setTimeout(() => reject(new Error('Indexação inicial excedeu 90 segundos')),90000); })]); } finally { clearTimeout(timer!); }
    this.initialized = true;
    if (this.refreshPending) this.scheduleRefresh();
    this.status('Phpactor conectado · índice inicial pronto');
  }
  async request(input: LanguageInput) {
    if (!methods.has(input.method) || !Number.isInteger(input.version) || input.version < 0 ||
      !Number.isInteger(input.position?.line) || input.position.line < 0 ||
      !Number.isInteger(input.position?.character) || input.position.character < 0 ||
      typeof input.text !== 'string' || Buffer.byteLength(input.text) > 2 * 1024 * 1024)
      throw new Error('Requisição PHP inválida');
    const path = await this.workspace.path(input.path);
    // Plugins respondem por strings de framework sem depender do Phpactor estar pronto.
    if (input.method === 'textDocument/definition' || input.method === 'textDocument/completion') {
      const rel = relative(this.workspace.root, path); const at = offsetOf(input.text, input.position);
      const answer = input.method === 'textDocument/definition' ? await this.plugins.define(rel, input.text, at) : await this.plugins.complete(rel, input.text, at);
      if (answer) return answer;
    }
    await this.start();
    await this.waitForRefresh();
    const uri = pathToFileURL(path).href;
    const old = this.documents.get(uri);
    if (old && input.version < old.version) throw new Error('Requisição de documento obsoleto');
    if (!old) this.rpc!.notify('textDocument/didOpen', {
      textDocument: { uri, languageId: 'php', version: input.version, text: input.text }
    });
    else if (old.text !== input.text) this.rpc!.notify('textDocument/didChange', {
      textDocument: { uri, version: input.version }, contentChanges: [{ text: input.text }]
    });
    this.documents.set(uri, { text: input.text, version: input.version });
    const params = { textDocument: { uri }, position: input.position,
      ...(input.method === 'textDocument/references' ? { context: { includeDeclaration: false } } : {}) };
    const offset = offsetOf(input.text, input.position);
    if (input.method === 'textDocument/definition') {
      const strings = await this.stringDefinition(path, input.text, offset);
      if (strings) return strings;
    }
    if (input.method === 'textDocument/completion') return this.complete(input.text, offset, params);
    try { return await this.rpc!.request(input.method, params); }
    catch (error) {
      if (!String(error).includes('Could not read file at URI')) throw error;
      // Uma exclusão pode chegar à consulta antes do evento coalescido pelo watcher.
      await new Promise(resolve => setTimeout(resolve,150));
      if (!this.refreshPending && !this.refreshing) throw error;
      await this.waitForRefresh();
      return this.rpc!.request(input.method, params);
    }
  }
  private async complete(text: string, offset: number, params: object) {
    const result: any = await this.rpc!.request('textDocument/completion', params);
    let items: any[] = Array.isArray(result) ? result : result?.items ?? [];
    const prefix = classContext(text.slice(0, offset));
    if (prefix !== null) items = await this.classItems(text, offset, prefix, items);
    // Tipos e assinaturas chegam só em completionItem/resolve; resolver os primeiros
    // itens permite mostrar o tipo na própria lista, sem abrir a documentação.
    const pending = items.filter(i => !i.detail && [2, 3, 5, 10].includes(i.kind)).slice(0, 80);
    const budget = new Promise(resolve => setTimeout(resolve, 1500));
    await Promise.race([budget, Promise.all(pending.map(async item => {
      const resolved: any = await this.rpc!.request('completionItem/resolve', item).catch(() => null);
      if (resolved?.detail) { item.detail = resolved.detail; item.documentation ??= resolved.documentation; }
    }))]);
    return { isIncomplete: prefix !== null || !!result?.isIncomplete, items: items.map(item => {
      if (![2, 3, 5, 10].includes(item.kind) || !item.detail) return item;
      const { params: args, returns } = signature(item.detail);
      const callable = item.kind === 2 || item.kind === 3;
      const decorated = { ...item, labelDetails: { detail: callable && args !== null ? `(${args})` : undefined, description: returns ?? undefined } };
      // Sem parâmetros o cursor fica após os parênteses; com parâmetros, dentro deles.
      if (callable && args !== null && !item.textEdit) Object.assign(decorated, { insertText: args ? `${item.label}($0)` : `${item.label}()`, insertTextFormat: 2 });
      return decorated;
    }) };
  }
  private async classItems(text: string, offset: number, prefix: string, items: any[]) {
    await this.classes.build();
    const context = analyze(text);
    const kinds = { class: 7, interface: 8, enum: 13, trait: 7 } as const;
    const seen = new Set<string>(); const out: any[] = [];
    const add = (fqn: string, kind: number, project: boolean) => {
      if (seen.has(fqn.toLowerCase())) return; seen.add(fqn.toLowerCase());
      const short = fqn.split('\\').pop()!; const namespace = fqn.slice(0, -short.length - 1);
      const insertion = classInsertion(text, offset, fqn, context, name => !!this.classes.find(name));
      out.push({ label: short, kind, filterText: short, insertText: insertion.insert, sortText: `${project ? 0 : 1}${String(out.length).padStart(4, '0')}`,
        labelDetails: namespace ? { detail: ` [${namespace}]` } : undefined, detail: fqn,
        additionalTextEdits: insertion.edit ? [insertion.edit] : undefined });
    };
    for (const c of this.classes.search(prefix, 150)) add(c.fqn, kinds[c.kind], true);
    if (prefix) {
      const symbols: any = await this.rpc!.request('workspace/symbol', { query: prefix }).catch(() => []);
      const root = pathToFileURL(this.workspace.root).href + '/';
      for (const s of (symbols ?? []).filter((s: any) => s.kind === 5 && !String(s.location?.uri).startsWith(root))
        .filter((s: any) => s.name.split('\\').pop().toLowerCase().startsWith(prefix.toLowerCase()))
        .sort((a: any, b: any) => a.name.split('\\').pop().localeCompare(b.name.split('\\').pop()) || a.name.localeCompare(b.name)).slice(0, 60))
        add(s.name, 7, false);
    }
    // Itens de classe do Phpactor repetem o que o índice já oferece; preservar os demais.
    return [...out, ...items.filter(i => ![7, 8, 13].includes(i.kind))];
  }
  /** Ctrl/Cmd+clique em strings: caminho com __DIR__, FQN de classe e callable [Classe::class, 'método']. */
  private async stringDefinition(path: string, text: string, offset: number): Promise<any[] | null> {
    const literal = literalAt(text, offset);
    if (!literal) return null;
    const before = codeOnly(text.slice(0, literal.start));
    if (/(?:__DIR__|dirname\s*\(\s*__FILE__\s*\))\s*\.\s*$/i.test(before)) {
      try {
        const target = await this.workspace.path(join(dirname(path), literal.value));
        return [{ uri: pathToFileURL(target).href, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, preserveView: true }];
      } catch { return []; }
    }
    const callable = /\[\s*(?:(\\?[A-Za-z_][\w\\]*)\s*::\s*class|(['"])(\\?[A-Za-z_][\w\\]*)\2)\s*,\s*$/.exec(text.slice(0, literal.start));
    if (callable && /^[A-Za-z_]\w*$/.test(literal.value) && /^\s*\]/.test(codeOnly(text).slice(literal.end))) {
      const owner = callable[1] ?? '\\' + callable[3].replace(/^\\/, '').replace(/\\\\/g, '\\');
      return this.synthetic(path, text, `${owner}::${literal.value}();`, owner.length + 2);
    }
    if (/^\\?[A-Za-z_]\w*(\\[A-Za-z_]\w*)+$/.test(literal.value)) {
      await this.classes.build();
      const found = this.classes.find(literal.value);
      if (found) {
        const start = { line: found.line, character: found.character };
        return [{ uri: pathToFileURL(join(this.workspace.root, found.path)).href, range: { start, end: { line: found.line, character: found.character + found.name.length } } }];
      }
      return this.synthetic(path, text, `\\${literal.value.replace(/^\\/, '')}::class;`, 1);
    }
    return [];
  }
  /** Resolve uma expressão no contexto (namespace/imports) do arquivo usando um documento temporário. */
  private async synthetic(path: string, text: string, expression: string, at: number) {
    const opener = segments(text).at(-1)?.kind === 'html' ? '<?php ' : '';
    const full = `${text}\n${opener}${expression}`;
    const uri = pathToFileURL(join(dirname(path), `.php-ide-probe-${randomUUID()}.php`)).href;
    this.rpc!.notify('textDocument/didOpen', { textDocument: { uri, languageId: 'php', version: 1, text: full } });
    try {
      const result: any = await this.rpc!.request('textDocument/definition', { textDocument: { uri }, position: position(full, text.length + 1 + opener.length + at) });
      return (result ? Array.isArray(result) ? result : [result] : []).filter((r: any) => (r.uri ?? r.targetUri) !== uri);
    } catch { return []; }
    finally { this.rpc!.notify('textDocument/didClose', { textDocument: { uri } }); }
  }
  changed(path: string, type = 2) {
    this.plugins.changed(path);
    if (!path.endsWith('.php')) return;
    if (type === 3) this.classes.remove(path); else void this.classes.update(path);
    this.rpc?.notify('workspace/didChangeWatchedFiles', { changes: [{ uri: pathToFileURL(path).href, type }] });
    // Na versão fixada, ACK de eventos não garante atualização do índice. Reusar o cache via soft reindex.
    if (!this.rpc || this.disposed) return;
    this.refreshPending = true;
    this.scheduleRefresh();
  }
  private scheduleRefresh() {
    if (!this.initialized || this.disposed || this.refreshing) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this.refreshPending = false; this.refreshing = true;
      this.status('Atualizando índice PHP…');
      void this.rpc!.request('phpactor/indexer/reindex', { soft: true }).catch(error => {
        this.refreshing = false; this.finishRefresh(error);
        if (!this.disposed) this.status(`Falha ao atualizar índice: ${error.message}`);
      });
    }, 200);
  }
  private waitForRefresh() {
    if (!this.refreshPending && !this.refreshing) return Promise.resolve();
    return new Promise<void>((resolve,reject) => {
      const complete = (error?: Error) => {
        clearTimeout(timer); this.refreshWaiters.delete(waiter);
        if (error) reject(error); else resolve();
      };
      const waiter = { resolve: () => complete(), reject: (error: Error) => complete(error) };
      const timer = setTimeout(() => complete(new Error('Atualização do índice excedeu 30 segundos')),30000);
      this.refreshWaiters.add(waiter);
    });
  }
  private finishRefresh(error?: Error) {
    for (const waiter of this.refreshWaiters) { if(error) waiter.reject(error); else waiter.resolve(); }
  }
  async dispose() {
    this.disposed = true; this.classes.dispose(); clearTimeout(this.refreshTimer); this.finishRefresh(new Error('Projeto encerrado')); this.rpc?.dispose();
    if (!process.env.PHP_IDE_PHP_BIN) await promisify(execFile)('docker',['rm','-f',this.container]).catch(() => {});
  }
}
