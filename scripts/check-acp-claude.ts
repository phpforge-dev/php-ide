import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AgentHost } from '../electron/agents';
import { Workspace } from '../electron/workspace';
import type { AgentEvent } from '../shared/contracts';
// Verifica o adaptador real do Claude Code: inicialização e sessão ACP, sem enviar prompt (não consome inferência).
const root = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-acp-claude-')));
await writeFile(join(root, 'index.php'), '<?php\n');
const events: AgentEvent[] = [];
const host = new AgentHost(new Workspace(root), resolve('.'), e => events.push(e));
try {
 const info = host.list().find(a => a.id === 'claude');
 if (!info?.available) throw new Error(info?.detail ?? 'Claude Agent indisponível');
 await host.start('claude');
 const session = events.find(e => e.type === 'session');
 if (!session || session.type !== 'session') throw new Error('Sessão ACP não criada');
 console.log(JSON.stringify({ agent: session.agent, protocol: session.protocol, modes: session.modes.map(m => m.id), mode: session.mode }));
} finally { host.dispose(); await rm(root, { recursive: true, force: true }); }
