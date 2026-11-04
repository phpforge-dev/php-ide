# Agentes de IA — fidelidade ao AI Chat (AI-ACP-001), 2026-11-03

Pedido: aproximar o painel de agentes do AI Assistant/Junie do PhpStorm em seis pontos — histórico de conversas, menções `@`, comandos `/`, anexos (inclusive imagem), terminal do agente com aprovação de cada comando e aplicação de código sugerido com prévia. Implementação no plugin `phpforge.agents` (repositório `plugin-agents`, commits locais `6f8265e`…`d747208`, sem push nem versão nova); rotas de host, agente ACP falso, testes nativos e harness neste branch.

Pesquisa (DOC/OBS), requisito próprio (REQ) e hipótese (HIP) ficam separados. Nenhum código, ícone ou asset da JetBrains foi usado; a arquitetura interna da referência não foi inferida.

## Evidência documental (DOC)

- [AI Chat](https://www.jetbrains.com/help/ai-assistant/ai-chat.html) e [Chat with AI](https://www.jetbrains.com/help/ai-assistant/chat-mode.html): Chat History no canto superior, conversas por projeto que persistem entre sessões, tempo desde a última atividade, **ponto amarelo** quando a conversa espera o usuário (ex.: aprovar um comando), renomear/excluir pelo menu de contexto, nome gerado do primeiro pedido, busca com Ctrl+F. Menções `@thisFile`, `@selection`, `@file:`, `@folder:`, `@symbol:`, `@dbObject:`, `@commit:`, `@localChanges`, `@problems`… Comandos `/docs`, `/explain`, `/help`, `/refactor`, `/web`, e "agentes podem adicionar comandos". Anexos pelo `+` (Files and Folders, Add Image, Database Schema), arrastar e colar; imagens de até 20 MB. Ações do trecho: **Apply** (revisão com Next/Previous Change, **Accept All / Discard All**, Revert na margem), Copy to Clipboard, Insert Snippet at Caret, Create File from Snippet, Run Snippet.
- [Junie no IDE](https://junie.jetbrains.com/docs/junie-ide-plugin.html): comandos de terminal, execução de código e ferramentas MCP pedem aprovação explícita por padrão; allowlist e Brave Mode existem mas são opcionais e "não recomendados" no caso do Brave Mode.

## Observação autorizada (OBS) — PhpStorm 2026.1.4, 2026-11-03

Tela assumida com autorização do usuário nesta sessão (lock `phpstorm-screen.lock` criado e removido); **nenhuma mensagem enviada** ao modelo. Projeto sintético `reference-project`, agente ACP GitHub Copilot selecionado. Capturas locais em `.artifacts/phpstorm-reference/ai/` (fora do repositório).

| ID | Ponto | Saída observada |
|---|---|---|
| OBS-AI-08 | Cabeçalho | "+ New Chat", relógio (Chat History), ⋮, ocultar |
| OBS-AI-09 | Entrada | placeholder "Type your task, use @ to add files or / for commands"; `+`, seletor Agent, "Allow All", enviar |
| OBS-AI-10 | `@` | popup sob a linha: `@thisFile`, `@file:`, `@folder:`, `@dbObject:` com descrição à direita, depois arquivos recentes com pasta; rodapé "Press ⏎ to insert, ⇥ to replace" |
| OBS-AI-11 | `@file:Bro` + ⏎ | token `@file:Broken.php` com fundo realçado no texto e ficha "Broken.php ×" abaixo |
| OBS-AI-12 | `@dbObject:` sem banco | nenhuma sugestão |
| OBS-AI-13 | `/` | lista de comandos **do agente** (nome + descrição), rodapé igual ao do `@` |
| OBS-AI-14 | `+` | busca, "Files and Folders ›", "Image…", "Recent files" |
| OBS-AI-15 | Chat History | lista substitui a conversa: título + "6 minutes ago"; menu de contexto **Rename ⇧F6 / Delete Chat ⌫** |
| OBS-AI-16 | ⋮ | "Delete All Chats", entre outras opções do painel |

Não observado (sem enviar mensagens): resposta com código, prévia do Apply, pedido de terminal, ponto amarelo.

## Critérios de aceitação (REQ)

1. **Histórico**: por projeto e fora do repositório; mais recentes primeiro com tempo relativo; título do primeiro pedido; busca; abrir por clique/↩; renomear (⇧F6) e excluir (⌫) pelo menu de contexto e teclado; excluir todas pelo ⋮; ponto amarelo na conversa que espera aprovação; continuar uma conversa restaurada sem perder o contexto anterior.
2. **Menções `@`**: popup com as categorias acima e arquivos recentes; filtro aproximado; ↩ insere, ⇥ substitui o token, Esc fecha; token realçado e ficha removível que abre o alvo; arquivo/pasta lidos pelo host confinados ao projeto; símbolo e seleção com intervalo de linhas; schema só com metadados já carregados (sem credenciais).
3. **Comandos `/`**: lista vinda do agente (ACP `available_commands_update`), com descrição e dica do argumento; só no início do texto; enviado como texto do pedido (como o protocolo define); aviso quando o agente não anuncia comandos.
4. **Anexos**: menu `+` (busca, Arquivos e pastas, Imagem…, Schema de banco… quando há conexão, recentes); imagem por seletor, colar e arrastar; PNG/JPEG/GIF/WebP até 20 MB; miniatura com prévia; recusar se o agente não declara `promptCapabilities.image`; o histórico guarda só o rótulo.
5. **Terminal do agente**: capacidade ACP `terminal`; cada comando mostra o texto exato e a pasta e **só roda depois de Executar**; Recusar devolve erro ao agente; nenhuma opção "permitir sempre"; pedidos abertos são recusados ao fim/cancelamento do turno ou troca de sessão; pasta confinada; saída ao vivo limitada pelo final; Interromper encerra o grupo de processos.
6. **Aplicar diff**: blocos de código com Aplicar, Inserir no cursor e Copiar; Aplicar abre prévia Atual · Proposto com anterior/próxima, reverter por alteração na margem, Descartar tudo e Aceitar tudo; aceitar é uma edição mínima e desfazível no buffer (não grava em disco).

## Implementação

- Nativo (`plugin-agents/native`): `history.rs` (pasta por hash do projeto em `PHP_IDE_STATE_DIR`/config do app, `index.json` + um arquivo por conversa, gravação atômica, 300 conversas, 4 MB, IDs validados); `prompt.rs` (anexos → blocos ACP `resource`/`resource_link`/`image` conforme `promptCapabilities`, limites de 20 anexos, 1 MB de texto, 20 MB por imagem); `terminal.rs` (aprovação por `oneshot`, `/bin/sh -c` quando o agente manda só a linha, grupo de processos, saída combinada com limite pelo final, `output`/`wait_for_exit`/`kill`/`release`); `feature.rs` emite `commands`, `terminal`, `terminal-output` e `capabilities` na sessão.
- Interface (`plugin-agents/src`): transcrição serializável (`transcript.ts`), lista do histórico (`history-view.ts`), campo com popup/realce/fichas (`composer.ts`), fontes de menção (`mentions.ts`), menu de anexos (`attachments.ts`), renderização de blocos de código e prévia (`snippets.ts`) e cálculo da aplicação sem nova inferência (`apply.ts`: diff unificado por contexto, arquivo inteiro, bloco pela 1ª/última linha reindentado, seleção ou cursor).
- Host (este branch): `tool_plugins.rs` autoriza `agentHistory*`, `agentTerminalDecision` e `agentTerminalKill` sob `process`; contratos em `shared/contracts.ts`. **Rota nova no host**: só essas entradas de permissão; o despacho já encaminha `agent*` ao crate.

## Verificação

- Plugin: `npm test` — 18 testes (happy-dom + agente falso em memória: histórico, menções, comandos, anexos, terminal, aplicar); `cargo test` — 11 testes Rust (histórico, anexos, terminal real com `sh`, interrupção do grupo, limite de saída); `cargo clippy -D warnings` limpo.
- Janela Tauri real (`node scripts/check-native.mjs --no-db --agents-only`, crate local via `[patch]` em `.cargo/config.toml` não versionado): 4 checagens ACP aprovadas com `scripts/fake-acp-agent.mjs` — histórico; comandos `/` + menções + imagem + histórico restaurado; terminal (nada roda antes da aprovação, recusa, decisão única, SIGKILL ao interromper); fluxo antigo de permissão/pendências.
- Harness WebKit (`node scripts/check-agent-chat.mjs`): shell real + Monaco real + build local do plugin; cenários history, mentions, commands, attachments (seletor de arquivo do WebKit), terminal, apply (prévia, descartar, aceitar, desfazer, diff). Capturas em `.artifacts/agent-chat-*.png`.
- Host: `npm run typecheck` e `npm test` (41 testes Rust) aprovados.

Nenhuma chamada real de agente foi feita (sem consumo de inferência).

## Diferenças conhecidas e limites

- Continuar conversa restaurada envia a transcrição anterior (até 40 KB) à sessão nova em vez de `session/load`; o agente falso não declara `loadSession`.
- Sem `@commit:`, `@localChanges`, `@problems`, `@projectStructure`, `@rule:`; sem comandos `/` próprios da IDE (só os do agente); sem busca dentro da conversa (Find in Chat).
- `@symbol:` depende do serviço `searchSymbols` (plugin PHP Intelligence); `@dbObject:`/Schema de banco dependem de sessão já conectada no plugin Database (usa `sqlIntelligence.entries` publicado por ele).
- Arrastar arquivos do sistema pode ser interceptado pela janela Tauri; colar e o seletor funcionam. Sem "Create File from Snippet" e "Run Snippet" (exigiriam `project.write`/fluxo próprio).
- Terminal: aprovação a cada comando, sem allowlist nem "Allow All"; agentes que executam comandos por conta própria (fora de `terminal/*`) continuam sujeitos só ao pedido de permissão do próprio agente.
- Aplicar não usa IA para integrar o trecho: quando não há âncora, a prévia mostra inserção na seleção/cursor para o usuário decidir.
- Teste da nossa IDE não promove compatibilidade: AI-ACP-001 segue **Em desenvolvimento**, sem comparação lado a lado de uma conversa real.
