// Agente ACP falso para testes (sem inferência). O comportamento depende de palavras no prompt:
// "editar" pede permissão e escreve dois arquivos; "fora" tenta escrever fora do projeto;
// "longo" espera até ser cancelado. Toda execução lê src/User.php e informa plano/ferramentas.
import { Readable, Writable } from 'node:stream';
import { join } from 'node:path';
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
const sessions = new Map();
new AgentSideConnection(connection => {
 const update = (sessionId, value) => connection.sessionUpdate({ sessionId, update: value });
 const say = (sessionId, text) => update(sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
 return {
  async initialize() { return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: false }, authMethods: [] }; },
  async authenticate() {},
  async newSession({ cwd }) {
   const id = `fake-${sessions.size + 1}`; sessions.set(id, { cwd, cancelled: false });
   return { sessionId: id, modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Padrão' }, { id: 'plan', name: 'Planejar' }] } };
  },
  async setSessionMode({ sessionId, modeId }) { await update(sessionId, { sessionUpdate: 'current_mode_update', currentModeId: modeId }); },
  async cancel({ sessionId }) { const s = sessions.get(sessionId); if (s) s.cancelled = true; },
  async prompt({ sessionId, prompt }) {
   const session = sessions.get(sessionId); session.cancelled = false;
   const text = prompt.filter(b => b.type === 'text').map(b => b.text).join('\n');
   const resource = prompt.find(b => b.type === 'resource');
   await update(sessionId, { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Analisando o pedido.' } });
   await update(sessionId, { sessionUpdate: 'plan', entries: [{ content: 'Ler User.php', priority: 'high', status: 'in_progress' }, { content: 'Responder', priority: 'medium', status: 'pending' }] });
   await update(sessionId, { sessionUpdate: 'tool_call', toolCallId: 'read-1', title: 'Ler src/User.php', kind: 'read', status: 'in_progress' });
   const user = await connection.readTextFile({ sessionId, path: join(session.cwd, 'src/User.php') });
   await update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'completed' });
   await say(sessionId, `Li User.php (${user.content.split('\n').length} linhas). `);
   if (resource) await say(sessionId, `Contexto recebido: ${resource.resource.uri.split('/').pop()}. `);
   if (text.includes('editar')) {
    await update(sessionId, { sessionUpdate: 'tool_call', toolCallId: 'edit-1', title: 'Editar src/User.php', kind: 'edit', status: 'pending' });
    const answer = await connection.requestPermission({ sessionId, toolCall: { toolCallId: 'edit-1', title: 'Editar src/User.php', kind: 'edit' }, options: [{ optionId: 'allow', name: 'Permitir', kind: 'allow_once' }, { optionId: 'reject', name: 'Recusar', kind: 'reject_once' }] });
    if (answer.outcome.outcome === 'selected' && answer.outcome.optionId === 'allow') {
     await connection.writeTextFile({ sessionId, path: join(session.cwd, 'src/User.php'), content: user.content.replace("'Synthetic user'", "'Edited by agent'") });
     await connection.writeTextFile({ sessionId, path: join(session.cwd, 'src/Created.php'), content: '<?php\n\nnamespace Fixture;\n\nfinal class Created {}\n' });
     const reread = await connection.readTextFile({ sessionId, path: join(session.cwd, 'src/User.php') });
     await update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed' });
     await say(sessionId, reread.content.includes('Edited by agent') ? 'Editei User.php e criei Created.php. ' : 'Leitura não refletiu a edição. ');
    } else {
     await update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'failed' });
     await say(sessionId, 'Edição recusada. ');
    }
   }
   if (text.includes('fora')) {
    try { await connection.writeTextFile({ sessionId, path: '/tmp/php-ide-escape.txt', content: 'x' }); await say(sessionId, 'Escrita externa aceita. '); }
    catch (error) { await say(sessionId, `Escrita externa recusada: ${error.message}. `); }
   }
   if (text.includes('longo')) {
    for (let i = 0; i < 300 && !session.cancelled; i++) await new Promise(r => setTimeout(r, 50));
    if (session.cancelled) return { stopReason: 'cancelled' };
   }
   await update(sessionId, { sessionUpdate: 'plan', entries: [{ content: 'Ler User.php', priority: 'high', status: 'completed' }, { content: 'Responder', priority: 'medium', status: 'completed' }] });
   await say(sessionId, 'Pronto.');
   return { stopReason: 'end_turn' };
  },
 };
}, stream);
