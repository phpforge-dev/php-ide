# Depurador PHP / Xdebug — fidelidade ao PhpStorm (04/11/2026)

Plugin: `phpforge-dev/plugin-php-debugger` (Rust + workbench). Host: só harnesses e esta nota.
Catálogo: `TOOL-XDEBUG-001` em [phpstorm.md](../compatibility/phpstorm.md).

## Fontes e tipos de evidência

- **[D] Documentação pública JetBrains**: *Using breakpoints*, *Debug tool window*, *Examine a suspended program*,
  *Pausing and resuming the debugger session*. Fonte dos atalhos (⌘F8, ⇧⌘F8, ⌥F8, F7/F8/⇧F8/F9, ⌘F2) e dos nomes
  das ações.
- **[O] Observação autorizada** do PhpStorm 2026.1.4 (Islands Dark, keymap macOS), 04/11/2026, com Xdebug 3.4.5 num
  container descartável (`php-ide-xdebug-test:8.3`) e um projeto sintético (`debug.php`). Capturas locais em
  `.artifacts/phpstorm-reference/debugger/p01…p33` (não versionadas).
- **[R] Requisito próprio**: decisão nossa onde o PhpStorm não se aplica ou não foi observado.
- **[H] Hipótese**: sem evidência direta; não promove compatibilidade.

Não se inferiu arquitetura interna do PhpStorm; nada da JetBrains foi copiado (ícones desenhados por nós em CSS/SVG).

## 1. Breakpoint no número da linha (New UI)

| # | Critério | Evidência |
|---|---|---|
| 1.1 | Clique no **número da linha** alterna um breakpoint de linha; o círculo vermelho **substitui o número** (sem coluna extra). | [O] p02 |
| 1.2 | Linha com breakpoint ativo e suspensivo recebe fundo avermelhado em toda a linha e uma marca na faixa de erros. | [O] p02 |
| 1.3 | Hover no número mostra o círculo em prévia (cursor de ação); clicar de novo remove o breakpoint. | [D] + [O] p03 |
| 1.4 | **Condicional**: círculo com um “?” pequeno no canto inferior direito. | [O] p07 |
| 1.5 | **Desativado** (⌥+clique ou "Enabled" desmarcado): anel vazado vermelho; o fundo da linha some. | [D] ⌥-clique + [O] p08 |
| 1.6 | **Verificado** (durante a sessão, aceito pelo Xdebug): círculo com marca ✓ no canto superior direito. | [O] p18 |
| 1.7 | **Inválido** (o Xdebug recusou): ícone próprio e a mensagem do motor no tooltip. | [D] estado *Invalid*; desenho [R] (não observado) |
| 1.8 | **Mudo** (Mute Breakpoints): todos os breakpoints em cinza claro. | [O] p32 |
| 1.9 | Clique direito **num breakpoint** abre o popup de propriedades ancorado (seta apontando o ícone): título `arquivo:linha`, **Enabled**, **Suspend execution**, **Condition:** (campo de expressão), link **More (⇧⌘F8)**, botão **Done**. | [O] p05/p06 |
| 1.10 | Clique direito **no número sem breakpoint** abre menu: *Add Breakpoint*, *Add Conditional Breakpoint…*, *Add Logging Breakpoint…*, separador, ações do gutter do host. | [O] p09 (itens de bookmark/soft-wrap/appearance são do host e ficam fora do plugin) |
| 1.11 | ⇧+clique cria breakpoint de log (não suspende; "Breakpoint hit" no console). | [D] |
| 1.12 | ⌘F8 alterna na linha do cursor. | [D] |
| 1.13 | A ordem do gutter do host (números, ícones, dobra) é preservada; o plugin só sobrepõe estilos e eventos no número. | [R] (dono: `src/editor-chrome.ts`) |

## 2. Pausa assíncrona (Pause Program)

| # | Critério | Evidência |
|---|---|---|
| 2.1 | A ação **Pause Program** existe (*Run › Debugging Actions*), descrita como “Suspend program execution and enable debugging”. | [D] + [O] p29 |
| 2.2 | Com Xdebug 3.4.5 (CLI no container), o PhpStorm **não mostra Pause** no toolbar da janela Debug e a ação, executada pelo Search Everywhere, **não suspendeu** o script em 7 s. | [O] p26–p31 |
| 2.3 | Nossa IDE: botão Pause ativo só com sessão **em execução**; envia o comando DBGp `break`. Quando o motor atende, a sessão para na linha corrente com frames e variáveis; quando não atende em 5 s, aparece um erro recuperável e a sessão continua. | [R] (divergência intencional: o PhpStorm não oferece isso nesta configuração) |

## 3. Breakpoints de exceção / View Breakpoints

| # | Critério | Evidência |
|---|---|---|
| 3.1 | ⇧⌘F8 abre o diálogo **Breakpoints**: à esquerda árvore com grupos (*PHP Line Breakpoints*, *PHP Exception Breakpoints*) e caixas de seleção; à direita propriedades do item selecionado; botão **Done**. | [O] p10/p13 |
| 3.2 | Barra da árvore: **+** (adicionar), **−** (remover). O **+** abre a lista de tipos; *PHP Exception Breakpoints* abre o diálogo **Add Exception Breakpoint** com o campo **Exception name:** e os botões **Cancel**/**OK**. | [O] p11/p12 |
| 3.3 | Propriedades de linha: Enabled, Suspend execution, Condition, Log ("Breakpoint hit" message, Evaluate and log), Remove once hit, prévia do código. Implementamos Enabled, Suspend, Condition, "Breakpoint hit" message, Evaluate and log e Remove once hit; *Disable until hitting…* e *Stack trace* ficam fora deste recorte. | [O] p10 + [R] |
| 3.4 | Ícone de exceção: raio vermelho. Ao parar numa exceção, o raio aparece no lugar do número da linha e a primeira entrada de Variables é `Exception = {Classe}`. | [O] p13/p25 |
| 3.5 | O Xdebug recebe `breakpoint_set -t exception -x Classe`; nomes com namespace (`App\Boom`) são aceitos. | [R] + teste real |

## 4. Janela Debug, watches, Evaluate e valores inline

| # | Critério | Evidência |
|---|---|---|
| 4.1 | Cabeçalho **Debug** com uma aba por sessão (nome do script, ponto verde enquanto conectado) e um ×. | [O] p18 |
| 4.2 | Toolbar: Stop, Resume Program (⌥⌘R/F9), Step Over (F8), Step Into (F7), Step Out (⇧F8) · View Breakpoints, Mute Breakpoints · ⋮ (Run to Cursor ⌥F9, Evaluate Expression… ⌥F8, Detach from session); abas **Threads & Variables** e **Console**. | [O] p18/p19, c18d |
| 4.3 | Frames: `debug.php:21, checkout()` (função em itálico); selecionar um frame muda as variáveis e abre o arquivo. Em execução: “Frames are not available”, e Variables mostra ⓘ **Connected**. | [O] p18/p26 |
| 4.4 | Variáveis: `$nome = {tipo} valor` (`{int} 60`, `{Order}`, `{array[3]}`); strings verdes entre aspas; nós expansíveis. | [O] p23/p22 |
| 4.5 | Campo no topo: **Evaluate expression (⏎) or add a watch (⇧⌘⏎)**; Enter avalia e mostra `result`, ⇧⌘Enter adiciona um watch fixo no topo da árvore. | [O] p18 |
| 4.6 | **Evaluate Expression (⌥F8)**: janela com **Expression:**, **Result:** em árvore (`result = {Order}`, filhos), botões **Close**/**Evaluate**; “Nothing to show” antes da primeira avaliação. | [O] p21/p22 |
| 4.7 | **Valores inline**: depois do código, em itálico cinza, `$total: 60   $order: Order`, nas linhas da função corrente até a linha de execução. | [O] p23/p25 |
| 4.8 | Linha de execução: fundo azul (seleção) em toda a linha; o ícone do breakpoint permanece no número. | [O] p18 |
| 4.9 | Console: saída do script (stdout/stderr via DBGp) e mensagens do depurador. | [D] |

## 5. Validação (04/11/2026)

| Verificação | Resultado |
|---|---|
| `npm test` no plugin (Rust: motor DBGp simulado com exceções, estados e pausa assíncrona; node:test das regras de UI) | 7 + 5 testes OK |
| Integração com Xdebug 3.4.5 real em container descartável (`PHP_IDE_DEBUGGER_PLUGIN=… node scripts/check-xdebug.mjs`) | 3 testes OK: mapeamento de caminhos, "Debug script", exceção `App\Boom` com namespace + pausa recusada (`supports_async = 0`) |
| `scripts/check-debug-ui.mjs` (Monaco real, IPC simulado), Chromium e `--webkit`, tema escuro | 65 verificações OK; capturas em `.artifacts/debugger-fidelity/` |
| Janela Tauri real: `PHP_IDE_DEBUGGER_PLUGIN=<cópia com binário> node scripts/check-native.mjs --production-ui --no-db --tools-only --xdebug` | OK: clique no número cria o breakpoint, exceção pelo diálogo, parada real em `debug-app.php:21` com ✓, frames, variáveis, valores inline, Evaluate (campo e ⌥F8), step over, resume, parada na exceção (raio no número) e stop; ciclo desativar/remover do plugin preservado. Capturas da janela em `.artifacts/debugger-native/` |

Notas da execução:
- O teste nativo usa uma cópia local do plugin com o binário `aarch64-macos` recompilado e o SHA-256 registrado só na
  cópia; o repositório do plugin não muda `bin/` nem os hashes (a coordenação publica pelo CI).
- A imagem `php-ide-xdebug-test:8.3` foi montada sobre uma imagem PHP 8.3 local (o Docker Hub não respondia); o
  `scripts/check-xdebug.mjs` continua construindo a partir de `php:8.3-cli`.
- Xdebug: o contexto 1 (Superglobals) também traz as globais do script; como no PhpStorm, a árvore mostra só `$_*`
  não vazias e omite variáveis `uninitialized`.

Nada aqui promove `TOOL-XDEBUG-001` a “Validada”: a comparação foi por observação de um caso sintético.
