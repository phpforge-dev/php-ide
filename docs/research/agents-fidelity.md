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
- ~~Sem `@commit:`, `@localChanges`, `@problems`, `@projectStructure`, `@rule:`~~ (rodada 2); sem comandos `/` próprios da IDE (só os do agente); ~~sem Find in Chat~~ (rodada 2).
- `@symbol:` depende do serviço `searchSymbols` (plugin PHP Intelligence); `@dbObject:`/Schema de banco dependem de sessão já conectada no plugin Database (usa `sqlIntelligence.entries` publicado por ele).
- ~~Arrastar arquivos do sistema interceptado pela janela Tauri~~ e ~~sem Create File from Snippet / Run Snippet~~ (rodada 2).
- Terminal: ~~sem allowlist nem "Allow All"~~ (rodada 2); agentes que executam comandos por conta própria (fora de `terminal/*`) continuam sujeitos só ao pedido de permissão do próprio agente.
- Aplicar não usa IA para integrar o trecho: quando não há âncora, a prévia mostra inserção na seleção/cursor para o usuário decidir.
- Teste da nossa IDE não promove compatibilidade: AI-ACP-001 segue **Em desenvolvimento**, sem comparação lado a lado de uma conversa real.

## Rodada 2 — cinco lacunas (2026-11-04)

Commits locais no `main` do `plugin-agents`, sem push nem versão nova (manifesto continua 1.1.0): `951bb2e` menções de contexto · `61e5a6e` Find in Chat · `40d8dd0` allowlist e Permitir tudo · `9d3d60a` arrastar do sistema · `8535883` Create File / Run Snippet. Host, harness e checagem nativa neste branch (`claude/agents-round2-2b46a3`).

### Evidência documental (DOC)

- [Chat with AI](https://www.jetbrains.com/help/ai-assistant/chat-mode.html): `@commit:` "adds a commit reference" (escolher ou digitar o hash); `@localChanges` = alterações não commitadas; `@problems` = problemas do arquivo aberto; `@projectStructure` = estrutura da janela Project; `@rule:` adiciona uma [regra do projeto](https://www.jetbrains.com/help/ai-assistant/configure-project-rules.html) (`.aiassistant/rules/*.md`). Find in Chat por Ctrl+F no chat ou ⋮ › "Find in Chat" (só no modo chat). Arrastar "a file or folder directly into the chat" e imagens. Ações do trecho: Create File from Snippet ("creates a new file from the snippet") e Run Snippet ("execute the generated command or code").
- [Junie no IDE](https://junie.jetbrains.com/docs/junie-ide-plugin.html): comandos de terminal são ações sensíveis com aprovação explícita por padrão; **Action Allowlist** com "Allow this command" (exato) e "Allow similar commands" (regex gerada; exemplo `git log --oneline -2` → `^\Qgit log --oneline \E\S+$`); Brave Mode roda tudo sem aprovação e é "not recommended". A página não descreve um "Allow All" por sessão.

### Observação (OBS)

Sem nova sessão de tela nesta rodada (não foi pedido ao usuário assumir a tela). Reaproveitadas as capturas de 2026-11-03 em `.artifacts/phpstorm-reference/ai/`: `ai-02-chat.png` mostra o botão **Allow All** desligado na linha de entrada, ao lado do seletor Agent (OBS-AI-09); `ai-11-options.png` mostra o ⋮ do painel numa conversa vazia (sem "Find in Chat" visível nesse estado). Não observados: popup de `@commit:`/`@rule:`, barra do Find in Chat, ações de trecho, efeito do Allow All. Os detalhes de UI abaixo são **requisito próprio**, não fidelidade comprovada.

### Critérios de aceitação (REQ)

1. **Menções de contexto**: `@commit:` lista os 200 commits mais recentes (hash curto + assunto, autor · tempo), filtra por hash ou assunto e resolve hash digitado fora da lista; `@localChanges` envia status + diff contra HEAD + arquivos não rastreados; `@problems` envia os marcadores do arquivo aberto **no momento do envio** e só aparece com arquivo aberto; `@projectStructure` envia a árvore (pastas antes de arquivos, `.gitignore` respeitado); `@rule:` lista só `.aiassistant/rules/*.md`. Tudo resolvido no host, confinado ao projeto, Git sem prompt de credencial, 200 KB por item.
2. **Find in Chat**: ⌘F/Ctrl+F dentro do chat (ação `agent.findInChat` no keymap da IDE, contexto `agent-chat`, sem tirar o Find do editor) e ⋮ › Buscar na conversa; realce de todas as ocorrências sem diferenciar maiúsculas, "n/total" ou "Sem resultados", ↩/⇧↩ e ↑/↓ navegam, ocorrência atual visível (abre raciocínio recolhido), acompanha mensagens novas, Esc fecha, limpa realces e devolve o foco.
3. **Terminal**: aprovação explícita continua padrão. ⋯ no pedido: "Executar e permitir este comando" (igual) e "… comandos semelhantes" (prefixo + **um** argumento simples; com operador do shell só existe a opção igual). Regras por projeto fora do repositório, listáveis e removíveis em ⋮ › Allowlist do terminal…. **Permitir tudo** desligado por padrão, só na sessão atual (nova sessão/reinício desliga; nunca gravado); vale também para pedidos de permissão ACP, escolhendo a opção `allow_once` do agente. Comandos liberados mostram o motivo no bloco.
4. **Arrastar do sistema**: a área do chat aceita arquivos e pastas; imagens viram anexo de imagem; arquivo idêntico a um do projeto vira `@file` (relido pelo host); outros textos até 1 MB com o conteúdo arrastado; pastas como lista (300 arquivos); binários recusados com aviso; drop fora de áreas marcadas é bloqueado (a janela não navega até o arquivo, o Monaco não cola o caminho).
5. **Trechos**: "Criar arquivo" pede o caminho (sugerido pelo caminho do agente, pela classe declarada ou pela linguagem), valida (relativo, sem `..`), cria pelo `fileCreate` do host sem sobrescrever, abre o arquivo e mantém o diálogo com o erro se falhar. "Executar" (shell e PHP) mostra o comando exato e a pasta, foco em Cancelar, só roda após Executar; saída ao vivo na conversa, Interromper, resultado no histórico.

### Implementação

- Nativo: `context.rs` (git log/show/status/diff/ls-files, árvore, regras; `resolve` sobrescreve o texto vindo da interface), `prompt.rs` (tipos `commit`, `localChanges`, `projectStructure`, `rule`, `problems`, `dropped` como recursos `php-ide://…`), `policy.rs` (allowlist + Permitir tudo), `terminal.rs` (`snippet`: `sh -c` ou `php -r`), `feature.rs` (`agentMentions`, `agentTerminalPolicy[Set]`, `agentRunSnippet`, decisão com "lembrar", permissão ACP automática só com Permitir tudo).
- Interface: `mentions.ts`, `find.ts`, `drop.ts`, `snippets.ts` (Criar arquivo/Executar), `agent-panel.ts` (Permitir tudo, menu ⋯, diálogo da allowlist). Permissão nova no manifesto: **`project.write`** (para `fileCreate`) — instalações existentes pedirão consentimento de novo.
- Host (este branch): `tool_plugins.rs` autoriza `agentMentions`, `agentRunSnippet`, `agentTerminalPolicy`, `agentTerminalPolicySet` sob `process`; `shared/contracts.ts`; **`tauri.conf.json` com `dragDropEnabled: false`** na janela principal (o handler do wry devolvia `true` e o WebView nunca recebia o drop HTML5) e `src/file-drop.ts`, que só aceita drops de arquivo em áreas `[data-file-drop]`.

### Verificação

- Plugin: `npm test` — 25 testes (agente falso em memória); `cargo test` — 16 testes Rust (Git real em repositório temporário, regras, política persistida, trecho real com `sh`); `cargo clippy -D warnings` limpo.
- Harness WebKit (`node scripts/check-agent-chat.mjs`): 11 cenários aprovados, 5 novos — `context-mentions`, `find`, `terminal-allowlist`, `drop` (DragEvent com `DataTransfer` real; drop no editor bloqueado), `snippet-actions`. Capturas `.artifacts/agent-chat-{context-*,find,terminal-*,drop-chips,snippet-*}.png`.
- Janela Tauri real: `node scripts/check-native.mjs --no-db --agents-only` (crate local via `[patch]` em `.cargo/config.toml` não versionado) — 5 checagens ACP aprovadas, 1 nova: allowlist igual (1º comando da 2ª rodada roda com `auto: allowlist`, o resto pergunta), Permitir tudo libera os dois e `agentReset` o desliga, Executar trecho com `sh` real (saída e código 3), `json` recusado, `@projectStructure` chega ao agente falso como recurso, `agentMentions` responde. `npm test` do host (41 testes Rust) aprovado com o crate local.
- Host: `tsc --noEmit` limpo.

Nenhuma chamada real de agente (sem inferência).

### Limites

- Sem observação lado a lado dos cinco itens; textos e posições são requisito próprio. O popup do PhpStorm pode ordenar categorias de outro jeito.
- Arrastar: o WebView não expõe o caminho do arquivo; fora do projeto vai o conteúdo, não uma referência. O drop nativo do Finder não foi automatizado (só o evento HTML5 no WebKit); a mudança de configuração foi conferida no código do `tauri-runtime-wry`/`wry`.
- Permitir tudo não aprova pedidos que **já** estavam esperando ao ser ligado; vale para os próximos. Não há Brave Mode persistente.
- Run Snippet só para shell e PHP (`php -r`); outras linguagens não mostram o botão. Create File não escolhe pasta pelo namespace/PSR-4.
- `@localChanges` fora de repositório Git falha com a mensagem do Git; `@projectStructure` sem Git lista tudo menos `.git`, `node_modules`, `vendor`, `.idea`, `target`.
