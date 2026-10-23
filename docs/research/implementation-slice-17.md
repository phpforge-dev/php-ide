# Recorte 17 — agentes de IA via ACP com alterações pendentes

22/10/2026. Pedido: observar a integração de agentes de IA no PhpStorm e evoluir a do php-ide. Decisões do usuário: hospedar agentes por ACP com o adaptador público do Claude Code, e manter edições do agente como alterações pendentes com revisão antes de chegar ao disco. Durante o recorte o projeto foi migrado de Electron para Rust/Tauri; o cliente ativo é `src-tauri/src/agents.rs` (porte do desenho deste recorte) e os arquivos Electron equivalentes ficam como histórico conforme `electron/README.md`.

## Observação da referência (OBS)

PhpStorm 2026.1.4, macOS, janela AI Chat (JetBrains AI). Somente leitura da interface pela API de acessibilidade e cliques com verificação de janela; **nenhuma mensagem enviada** (evita consumo de cota e envio de código a serviços externos).

| ID | Ponto | Saída observada |
|---|---|---|
| OBS-AI-01 | Cabeçalho | New Chat, Chat History, Options, Hide |
| OBS-AI-02 | Dicas | Completion multilinha (⌥⇧\\), geração no editor (⌘\\), ações de IA no menu de contexto |
| OBS-AI-03 | Seletor de modo | Chat; seção Agents com Claude Agent, Codex, Cursor (selecionado), Gemini CLI, GitHub Copilot, Junie; "Install From ACP Registry…" |
| OBS-AI-04 | Entrada | "Type your task, use @ to add files or / for commands"; botões IDE context enabled, Add attachment, Send, Maximize/Restore Input |
| OBS-AI-05 | Anexos | Files and Folders ›, Image…, Database Schema…, arquivos recentes, busca |
| OBS-AI-06 | Alterações do agente | Área "Has new changes" com árvore Changes e **Keep All / Discard All** |
| OBS-AI-07 | Avisos | Junie em chat separado por plugin; "The selected mode requires a new chat" |

Não observado: conversa real, pedidos de permissão, diff por arquivo, histórico preenchido, comandos `/` e menções `@`. A arquitetura interna da referência não foi inferida; ACP é protocolo aberto documentado e foi escolhido como base comum.

## Ambiente

Claude Code 2.1.277 instalado; Codex CLI ausente do PATH nesta máquina; nenhum adaptador ACP prévio. Instalados com autorização: `@zed-industries/claude-code-acp` 0.16.2 (Apache-2.0) em `.tools/acp` por `npm run setup:acp` (versão fixa, `--ignore-scripts`), e `@agentclientprotocol/sdk` 0.14.1 (Apache-2.0), usado pelo agente falso de teste. O adaptador depende de `@anthropic-ai/claude-agent-sdk` (termos próprios da Anthropic).

## Implementação (Rust)

- `agents.rs`: lista Claude Agent (adaptador + `claude` + `node`), Codex (`app-server`, consulta somente leitura) e um agente ACP configurável por `PHP_IDE_ACP_AGENT`. Cliente ACP atende `fs/read_text_file` (confinado ao projeto, versão pendente prevalece sobre o disco, `line`/`limit`), `fs/write_text_file` (vira alteração pendente com `before`/`after`, nada é gravado) e `session/request_permission` (pergunta ao usuário com as opções do agente; cancelamento ao interromper). Eventos para o painel: mensagem, raciocínio, ferramentas, plano, modo, permissão, alterações e conclusão.
- Manter grava com verificação de conflito (recusa se o arquivo mudou no disco desde a leitura do agente) e cria arquivos novos sem sobrescrever; descartar não toca o disco. Nova conversa recria a sessão e limpa pendências.
- `rpc.rs` (este recorte): o final de stderr do agente (4 KB) é guardado e anexado ao erro de inicialização e às requisições pendentes quando o processo encerra; erros JSON-RPC incluem `data.details`. Antes, falhas como "Claude Code cannot be launched inside another Claude Code session" ou falta de login apareciam como erro genérico.
- Recusas de leitura/escrita voltam ao agente com o motivo (código -32602 e mensagem).
- Painel (`src/agent-panel.ts`): seletor de agente e modo, nova conversa, transcrição com raciocínio recolhível, ferramentas com estado, plano, permissões em linha, alterações pendentes com diff, manter/descartar por arquivo e "Manter tudo / Descartar tudo", contexto da IDE (arquivo aberto e seleção), Enter envia.

REQ/diferenças: sem histórico de conversas, menções `@`, comandos `/`, anexos de imagem/schema nem registro ACP; terminal do agente não é oferecido (`terminal: false`); ferramentas que o agente executa por conta própria (ex.: Bash do Claude) dependem do pedido de permissão do próprio agente e não passam pelo mecanismo de pendências.

## Verificação

RESULTADOS_PENDENTES

## Limites

A conexão real com o Claude Code não foi verificada deste ambiente: o Claude Code recusa iniciar dentro de outra sessão do Claude Code (proteção contra falha das sessões ativas) e a recusa não foi contornada. Verificar fora dela: abrir a IDE, painel Agente, escolher Claude Agent e Iniciar (a sessão não consome inferência até o primeiro prompt). Codex não testado por estar ausente. AI-CODEX-001 permanece Em desenvolvimento; a família de agentes ACP foi adicionada ao catálogo sem validação comparativa.
