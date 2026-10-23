import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { AcpAgent, type AcpCommand } from './acp';
import { Agent } from './agent';
import type { Workspace } from './workspace';
import type { AgentEvent, AgentInfo } from '../shared/contracts';

const onPath = (name: string) => (process.env.PATH ?? '').split(delimiter).some(dir => dir && existsSync(join(dir, name)));

/** Agentes disponíveis e sessão ativa: ACP (Claude, agente configurado) ou Codex app-server (consulta). */
export class AgentHost {
 private acp?: AcpAgent;
 private codex?: Agent;
 private active?: string;
 constructor(private workspace: Workspace, private appPath: string, private emit: (event: AgentEvent) => void) {}
 private claudeAdapter() { return join(this.appPath, '.tools/acp/node_modules/@zed-industries/claude-code-acp/dist/index.js'); }
 /** Agente ACP extra por variável de ambiente: {"id","name","command","args"} (usado nos testes). */
 private custom(): AcpCommand | null {
  try { const value = JSON.parse(process.env.PHP_IDE_ACP_AGENT ?? 'null'); return value?.command ? { id: String(value.id ?? 'custom'), name: String(value.name ?? 'Agente ACP'), command: String(value.command), args: (value.args ?? []).map(String) } : null; }
  catch { return null; }
 }
 list(): AgentInfo[] {
  const adapter = existsSync(this.claudeAdapter()); const claude = onPath('claude');
  const codex = !!process.env.PHP_IDE_CODEX_BIN || onPath('codex');
  const list: AgentInfo[] = [
   { id: 'claude', name: 'Claude Agent', available: adapter && claude, detail: !adapter ? 'Execute npm run setup:acp para instalar o adaptador ACP.' : !claude ? 'Instale e autentique o Claude Code (claude).' : 'ACP · claude-code-acp' },
   { id: 'codex', name: 'Codex', available: codex, detail: codex ? 'app-server · somente consulta' : 'Codex CLI não encontrado no PATH.' },
  ];
  const custom = this.custom(); if (custom) list.push({ id: custom.id, name: custom.name, available: true, detail: `ACP · ${custom.command}` });
  return list;
 }
 private command(id: string): AcpCommand {
  if (id === 'claude') return { id, name: 'Claude Agent', command: process.execPath, args: [this.claudeAdapter()] };
  const custom = this.custom(); if (custom && custom.id === id) return custom;
  throw new Error('Agente desconhecido');
 }
 async start(id: string) {
  const info = this.list().find(a => a.id === id);
  if (!info?.available) throw new Error(info?.detail ?? 'Agente indisponível');
  this.dispose(); this.active = id;
  if (id === 'codex') {
   // Codex segue no app-server em modo consulta; mensagens são convertidas para eventos do painel.
   this.codex = new Agent(this.workspace.root, event => {
    if (event.type !== 'agent') return;
    if (event.done) this.emit({ type: 'done', stopReason: event.error ? 'error' : 'end_turn', ...(event.error ? { error: event.text } : {}) });
    else this.emit({ type: 'message', text: event.text });
   });
   const account = await this.codex.connect();
   if (!account.authenticated) throw new Error('Entre no Codex CLI com codex login e tente novamente.');
   this.emit({ type: 'session', agent: id, protocol: 0, modes: [{ id: 'ask', name: 'Consulta (somente leitura)' }], mode: 'ask' });
   return;
  }
  this.acp = new AcpAgent(this.command(id), this.workspace, this.emit);
  await this.acp.start();
 }
 prompt(text: string, context?: { path: string; text: string; selection?: string }) {
  if (this.codex) return this.codex.ask(text, context);
  if (!this.acp) throw new Error('Escolha e inicie um agente.');
  // A resposta chega por eventos; o IPC não espera o fim do turno.
  void this.acp.prompt(text, context).catch(error => this.emit({ type: 'done', stopReason: 'error', error: String(error?.message ?? error) }));
 }
 cancel() { return this.codex ? this.codex.stop() : this.acp?.cancel(); }
 mode(mode: string) { if (!this.acp) throw new Error('Este agente não oferece modos.'); return this.acp.setMode(mode); }
 permission(id: string, optionId: string | null) { if (!this.acp) throw new Error('Nenhuma sessão ACP ativa.'); this.acp.answer(id, optionId); }
 keep(paths?: string[]) { if (!this.acp) throw new Error('Nenhuma alteração pendente.'); return this.acp.keep(paths); }
 discard(paths?: string[]) { this.acp?.discard(paths); }
 async reset() { const id = this.active; this.acp?.reset(); this.dispose(); if (id) await this.start(id); }
 dispose() { this.acp?.dispose(); this.acp = undefined; this.codex?.dispose(); this.codex = undefined; }
}
