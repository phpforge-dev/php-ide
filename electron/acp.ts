import { spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION, RequestError, type Client } from '@agentclientprotocol/sdk';
import { Workspace } from './workspace';
import type { AgentEvent, AgentChange } from '../shared/contracts';

export type AcpCommand = { id: string; name: string; command: string; args: string[] };
type Pending = { path: string; before: string | null; after: string };

/**
 * Cliente ACP: a IDE atende leitura/escrita de arquivos do agente. Escritas viram
 * alterações pendentes em memória até o usuário manter ou descartar; permissões de
 * ferramentas são decididas pelo usuário no painel.
 */
export class AcpAgent {
 private child?: ChildProcess;
 private connection?: ClientSideConnection;
 private session?: string;
 private starting?: Promise<void>;
 private pending = new Map<string, Pending>();
 private permissions = new Map<string, (optionId: string | null) => void>();
 private permissionSeq = 0;
 private running = false;
 private stderr = '';
 constructor(readonly agent: AcpCommand, private workspace: Workspace, private emit: (event: AgentEvent) => void) {}

 /** Caminho absoluto confinado ao projeto (sem seguir links para fora). */
 private async inside(path: string) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Caminho absoluto obrigatório');
  const rel = relative(this.workspace.root, resolve(path));
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Arquivo fora do projeto');
  try { await this.workspace.path(rel); } catch (error) { if (!String(error).includes('ENOENT')) throw error; }
  return rel;
 }
 /** Erros de validação voltam ao agente com o motivo (o SDK esconderia como erro interno). */
 private reason<T>(work: () => Promise<T>) {
  return work().catch(error => {
   const message = String((error as Error)?.message ?? error);
   throw /ENOENT/.test(message) ? RequestError.resourceNotFound(message) : RequestError.invalidParams(undefined, message);
  });
 }
 private client(): Client {
  return {
   sessionUpdate: async ({ update }) => {
    switch (update.sessionUpdate) {
     case 'agent_message_chunk': case 'agent_thought_chunk':
      if (update.content.type === 'text') this.emit({ type: update.sessionUpdate === 'agent_message_chunk' ? 'message' : 'thought', text: update.content.text });
      break;
     case 'tool_call': case 'tool_call_update':
      this.emit({ type: 'tool', id: update.toolCallId, ...(update.title ? { title: update.title } : {}), ...(update.kind ? { kind: update.kind } : {}), ...(update.status ? { status: update.status } : {}) });
      break;
     case 'plan':
      this.emit({ type: 'plan', entries: update.entries.map(e => ({ content: e.content, status: e.status })) });
      break;
     case 'current_mode_update':
      this.emit({ type: 'mode', current: update.currentModeId });
      break;
    }
   },
   requestPermission: async params => {
    const id = String(++this.permissionSeq);
    const choice = await new Promise<string | null>(done => {
     this.permissions.set(id, done);
     this.emit({ type: 'permission', id, title: params.toolCall.title ?? 'Ferramenta do agente', kind: params.toolCall.kind ?? undefined, options: params.options.map(o => ({ id: o.optionId, name: o.name, kind: o.kind })) });
    });
    return { outcome: choice === null ? { outcome: 'cancelled' } : { outcome: 'selected', optionId: choice } };
   },
   readTextFile: ({ path, line, limit }) => this.reason(async () => {
    const rel = await this.inside(path);
    const text = this.pending.get(rel)?.after ?? (await this.workspace.read(rel)).text;
    if (!line && !limit) return { content: text };
    const lines = text.split('\n'); const start = Math.max(0, (line ?? 1) - 1);
    return { content: lines.slice(start, limit ? start + limit : undefined).join('\n') };
   }),
   writeTextFile: ({ path, content }) => this.reason(async () => {
    const rel = await this.inside(path);
    if (typeof content !== 'string' || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error('Conteúdo inválido ou maior que 2 MB');
    const previous = this.pending.get(rel);
    const before = previous ? previous.before : await readFile(resolve(this.workspace.root, rel), 'utf8').catch(() => null);
    if (before === content) this.pending.delete(rel); else this.pending.set(rel, { path: rel, before, after: content });
    this.emit({ type: 'changes', changes: this.changes() });
    return {};
   }),
  };
 }
 changes(): AgentChange[] { return [...this.pending.values()].map(p => ({ path: p.path, before: p.before, after: p.after })); }

 start() {
  this.starting ??= this.open().catch(error => {
   this.starting = undefined;
   // Prefere a mensagem "Error:" do agente (ex.: sessão aninhada do Claude Code) ao eco do JSON-RPC.
   const lines = this.stderr.trim().split('\n'); const first = lines.findIndex(l => /^Error:/.test(l));
   const tail = (first >= 0 ? lines.slice(first, first + 3) : lines.slice(-4)).join('\n'); this.dispose();
   const message = String(error?.data?.details ?? error?.message ?? error);
   throw new Error(tail ? `${message}\n${tail}` : message);
  });
  return this.starting;
 }
 private async open() {
  const child = this.child = spawn(this.agent.command, this.agent.args, { cwd: this.workspace.root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } });
  // Últimas linhas de stderr explicam falhas de inicialização (CLI ausente, sem login…).
  this.stderr = '';
  child.stderr?.on('data', chunk => { this.stderr = (this.stderr + String(chunk)).slice(-4000); });
  child.on('exit', code => { if (this.child === child) { this.child = undefined; this.connection = undefined; this.session = undefined; this.starting = undefined; if (this.running) { this.running = false; this.emit({ type: 'done', stopReason: 'error', error: `Agente encerrado (código ${code ?? '?'})` }); } } });
  const spawned = new Promise<void>((ok, fail) => { child.once('spawn', ok); child.once('error', fail); });
  await spawned;
  const stream = ndJsonStream(Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>, Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>);
  const connection = this.connection = new ClientSideConnection(() => this.client(), stream);
  const timeout = <T>(work: Promise<T>, label: string) => Promise.race([work, new Promise<T>((_, fail) => setTimeout(() => fail(new Error(`${label} excedeu 60 s`)), 60_000))]);
  const init = await timeout(connection.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }, clientInfo: { name: 'php-ide', title: 'PHP IDE', version: '0.1.0' } }), 'Inicialização do agente');
  const session = await timeout(connection.newSession({ cwd: this.workspace.root, mcpServers: [] }), 'Criação da sessão');
  this.session = session.sessionId;
  this.emit({ type: 'session', agent: this.agent.id, protocol: init.protocolVersion, modes: (session.modes?.availableModes ?? []).map(m => ({ id: m.id, name: m.name })), mode: session.modes?.currentModeId ?? null });
 }
 async prompt(text: string, context?: { path: string; text: string; selection?: string }) {
  if (this.running) throw new Error('Aguarde ou interrompa a resposta atual');
  if (typeof text !== 'string' || !text.trim() || text.length > 20000) throw new Error('Mensagem inválida');
  await this.start();
  const blocks: Parameters<ClientSideConnection['prompt']>[0]['prompt'] = [{ type: 'text', text }];
  if (context) {
   const rel = await this.inside(resolve(this.workspace.root, context.path));
   const uri = new URL('file://' + resolve(this.workspace.root, rel)).href;
   blocks.push({ type: 'resource', resource: { uri, text: context.text.slice(0, 100_000), mimeType: 'text/x-php' } });
   if (context.selection) blocks.push({ type: 'text', text: `Seleção atual em ${rel}:\n${context.selection.slice(0, 20_000)}` });
  }
  this.running = true;
  try {
   const result = await this.connection!.prompt({ sessionId: this.session!, prompt: blocks });
   this.emit({ type: 'done', stopReason: result.stopReason });
  } catch (error) { this.emit({ type: 'done', stopReason: 'error', error: String((error as Error)?.message ?? error) }); }
  finally { this.running = false; for (const [id, done] of this.permissions) { done(null); this.permissions.delete(id); } }
 }
 async cancel() { if (this.session && this.connection) await this.connection.cancel({ sessionId: this.session }); for (const [id, done] of this.permissions) { done(null); this.permissions.delete(id); } }
 async setMode(mode: string) { await this.start(); await this.connection!.setSessionMode({ sessionId: this.session!, modeId: mode }); this.emit({ type: 'mode', current: mode }); }
 answer(id: string, optionId: string | null) { const done = this.permissions.get(id); if (!done) throw new Error('Pedido de permissão expirado'); this.permissions.delete(id); done(optionId); }
 /** Grava alterações pendentes; recusa se o arquivo mudou no disco desde a leitura do agente. */
 async keep(paths?: string[]) {
  for (const p of [...this.pending.values()].filter(p => !paths || paths.includes(p.path))) {
   const current = await readFile(resolve(this.workspace.root, p.path), 'utf8').catch(() => null);
   if (current !== p.before) throw new Error(`${p.path} mudou no disco desde a alteração do agente; descarte ou revise.`);
   if (current === null) await this.workspace.create(p.path, p.after);
   else await this.workspace.save(p.path, p.after, (await this.workspace.read(p.path)).etag);
   this.pending.delete(p.path);
  }
  this.emit({ type: 'changes', changes: this.changes() });
 }
 discard(paths?: string[]) { for (const path of [...this.pending.keys()]) if (!paths || paths.includes(path)) this.pending.delete(path); this.emit({ type: 'changes', changes: this.changes() }); }
 /** Nova conversa: encerra o processo e descarta pendências e pedidos abertos. */
 reset() { this.dispose(); this.pending.clear(); this.emit({ type: 'changes', changes: [] }); }
 dispose() { for (const [, done] of this.permissions) done(null); this.permissions.clear(); const child = this.child; this.child = undefined; this.connection = undefined; this.session = undefined; this.starting = undefined; this.running = false; child?.kill(); }
}
