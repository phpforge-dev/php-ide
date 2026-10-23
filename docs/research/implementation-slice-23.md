# Recorte 23 — Keymap central (UI-KEYMAP-001)

23/10/2026. Pedido: tirar os atalhos espalhados pelos módulos e criar um registro central de ações com atalho padrão por SO, perfis, resolução de conflitos, despacho único, atalhos personalizados persistidos e tela "Keymap" com busca por nome e por tecla. Integrar ao Search Everywhere e aos menus que mostram atalhos.

## Separação de evidências

- **Documentação (DOC):** a ajuda pública do PhpStorm (jetbrains.com/help/phpstorm, páginas "Keymaps", "Configure keyboard shortcuts", "Keyboard shortcuts you cannot miss" e as tabelas de atalhos por SO) foi usada só como especificação de comportamento:
  - existem keymaps prontos por SO (macOS e Windows/Linux) e o usuário personaliza a partir de um deles; a personalização pertence ao keymap escolhido;
  - a tela de keymap lista ações por grupo, tem busca por nome e busca por atalho pressionado ("Find Actions by Shortcut"), permite adicionar/remover atalho e avisa quando o atalho já é usado por outra ação, oferecendo remover das demais;
  - o Shift duplo abre o Search Everywhere; Find Action, Go to File/Class/Symbol e Find in Files têm atalhos próprios;
  - atalhos documentados usados no perfil "Inspirado no layout JetBrains" e nos novos padrões: Settings ⌘, / Ctrl+Alt+S; janela Project ⌘1 / Alt+1; Version Control ⌘9 / Alt+9; Commit ⌘0 / Alt+0; Services ⌘8 / Alt+8; Terminal ⌥F12 / Alt+F12; Back ⌘[ / Ctrl+Alt+←; Forward ⌘] / Ctrl+Alt+→; Go to Declaration ⌘B / Ctrl+B; Go to Implementation ⌥⌘B / Ctrl+Alt+B; Find Action ⇧⌘A / Ctrl+Shift+A; Go to File ⇧⌘O / Ctrl+Shift+N; Go to Class ⌘O / Ctrl+N; Go to Symbol ⌥⌘O / Ctrl+Alt+Shift+N; Find in Files ⇧⌘F / Ctrl+Shift+F; Branches ⌃⇧\` / Ctrl+Shift+\`; Close tab Ctrl+F4 (Windows/Linux).
  - a documentação do terminal menciona a opção de deixar teclas para o shell em vez de atalhos da IDE ("Override IDE shortcuts").
- **Observação do PhpStorm (OBS):** nenhuma neste recorte. Nada foi comparado ao vivo; a tabela acima é só documentação.
- **Requisito próprio (REQ):**
  - os perfis "Padrão macOS" e "Padrão Windows/Linux" preservam os atalhos que a IDE já tinha (Alt+1/9/0, Alt+4, Alt+8, Alt+F12, Alt+←/→, F12/⌘B) e acrescentam os novos padrões acima; o perfil JetBrains troca só o que difere na documentação (⌘1/⌘9/⌘0/⌘8/⌘4 no macOS, ⌘[ ⌘] e Ctrl+Alt+←/→ para navegação, ⌘B/Ctrl+B sem F12, Branches);
  - personalizações ficam no armazenamento local da WebView (`localStorage`, chave `php-ide-keymap`, por usuário, por perfil), como a aparência; nada vai para o projeto. Personalizações de ações ainda não registradas (de módulos carregados depois) são preservadas;
  - teclas reservadas: no macOS o menu padrão do Tauri usa ⌘W/⌘Q/⌘H/⌘M e edição (⌘Z/⌘X/⌘C/⌘V/⌘A); por isso "Fechar aba" não tem padrão no macOS e a tela avisa quando o usuário atribui uma tecla reservada;
  - para não roubar digitação: em campos de texto comuns só despacham teclas F e combinações com Ctrl/⌘ fora do conjunto de edição; no Monaco exige modificador ou tecla F; no terminal Ctrl+letra é do shell (Ctrl+C, Ctrl+E…) e Ctrl+Shift+C/V é copiar/colar;
  - com um diálogo modal aberto, atalhos globais não disparam.
- **Hipótese:** que a precedência "contexto específico vence global" e "empate = primeira ação registrada" se aproxime da referência. A referência mostra um seletor quando há várias ações; aqui o conflito é sinalizado na tela Keymap. Pendente de observação.

## Implementação

- `src/keymap.ts` (novo, sem DOM/i18n no carregamento, testável em Node): normalização de atalhos (`normalizeStroke`: "cmd+shift+o", "⌘⇧O", "Ctrl+Alt+Left", "shift shift"), leitura da tecla física do evento (`strokeFromEvent` usa `event.code`; ⌥1 no macOS gera "¡" em `event.key`), formatação por SO (`⌥⇧⌘O`, `Ctrl+Alt+←`, `⇧⇧`/`Shift Shift`), classe `Keymap` (registro, contextos, perfis, personalizações, conflitos, despacho, persistência) e a instância única `keymap`.
- `src/keymap-settings.ts` + `src/keymap.css` (novos): diálogo modal "Keymap": seletor de perfil, "Restaurar perfil" (com confirmação), busca por nome/alias/id/atalho, botão "Buscar por atalho" (grava a tecla e filtra), "Só conflitos", grupos por categoria, chips de atalho com remover, "Adicionar atalho" com gravador (Esc cancela, Tab navega, Shift duas vezes grava Shift duplo), aviso de conflito e de tecla reservada antes de salvar, "Salvar" ou "Salvar e remover dos outros", "Restaurar" por ação personalizada, status com contagem de conflitos e erros de persistência. Abre pela ação "Keymap" (Search Everywhere) e pelo link "Keymap…" inserido no diálogo Aparência.
- `src/workbench.ts`: removido o `keydown` próprio (Alt+1/9/0). Registra as ações dos botões da área de trabalho (Projeto, Git, Commit, Testes, Docker, Bancos, Agente, Aparência/Configurações, Branches, Abrir projeto, Voltar, Avançar, Declaração e Implementações no contexto `editor`, Encontrar usos sem padrão). Títulos e `aria-keyshortcuts` dos botões e as dicas da tela vazia acompanham o perfil e as personalizações. Instala o despacho único (`keymap.install`) e liga erros de ação à barra de status.
- `src/search-everywhere.ts`: a aba Ações lista as ações do registro disponíveis no contexto de origem, com categoria e atalho atual ("Ação da IDE · Janelas de ferramentas · ⌥F12"); a busca também casa com o atalho. Registra Buscar em tudo (Shift duplo), Encontrar ação, Ir para arquivo/classe/símbolo e Buscar texto no projeto (abrem a categoria correspondente). O detector de Shift duplo agora chama `keymap.dispatchGesture('DoubleShift')`, então o gesto pode ser removido ou movido para outra ação.
- `src/terminal-panel.ts`: o listener Alt+F12 virou a ação `tool.terminal`; título e `aria-keyshortcuts` dinâmicos.
- `src/tab-menu.ts`: ações `editor.closeTab` (Ctrl+F4 em Windows/Linux), `editor.closeOtherTabs` e `editor.closeAllTabs`, que fecham pelos botões × das abas (mantendo a proteção de buffer alterado do `main.ts`); o menu de contexto da aba mostra o atalho atual em `<kbd>`.
- `src/locales/en.json`: traduções das novas strings.
- `fixtures/keymap-ui/` (novo): harness Vite para exercitar a tela Keymap e o despacho fora do Tauri.

### Despacho

Um único listener `keydown` em captura no `document`, instalado antes dos demais módulos. Quando uma ação é executada ele chama `preventDefault()` e `stopImmediatePropagation()`, então Monaco, xterm e listeners antigos não recebem a mesma tecla. Tecla sem ação ou ação desabilitada não é consumida e segue o fluxo normal (por isso listeners antigos de outros módulos continuam funcionando enquanto não migram).

Resolução: ações cujo atalho casa, cujo contexto casa com o elemento focado e cujo `enabled()` é verdadeiro; contexto específico vence `global`; empate = primeira registrada. Conflito = mesmo atalho em contextos que se sobrepõem (iguais ou um deles `global`); `editor` × `project-tree` não conflitam.

## API para outras sessões

```ts
import { keymap, registerAction } from './keymap';

const dispose = registerAction({
  id: 'debug.stepOver',            // [\w.-]+, estável: é a chave da personalização salva
  label: 'Step over',              // texto-fonte pt-BR; a UI traduz com t()
  category: 'Depuração',           // grupo na tela Keymap
  aliases: 'xdebug passo',         // termos extras de busca
  context: 'global',               // 'global' | 'editor' | 'project-tree' | 'terminal' | keymap.defineContext(...)
  defaults:  { mac: 'F8', other: 'F8' },      // perfis Padrão macOS / Padrão Windows-Linux
  jetbrains: { mac: 'F8', other: 'F8' },      // opcional; ausente = usa defaults
  enabled: () => session.paused,   // falso = não consome a tecla nem aparece no Search Everywhere
  run: ({ target, event }) => session.stepOver(),  // pode ser async; erro vai para a barra de status
});
keymap.shortcut('debug.stepOver');       // "F8" / "⌥F12" para menus e títulos ('' sem atalho)
keymap.ariaShortcuts('debug.stepOver');  // valor para aria-keyshortcuts
keymap.onChange(() => atualizarTitulos()); // perfil/personalização mudou
keymap.defineContext('debugger', el => !!el?.closest('#debug-panel'));
keymap.run('debug.stepOver');            // executar a partir de botão/menu
```

Formas aceitas de atalho: `Ctrl`, `Alt`/`Option`/`⌥`, `Shift`/`⇧`, `Meta`/`Cmd`/`⌘`; teclas `A`–`Z`, `0`–`9`, `F1`–`F24`, `Left/Right/Up/Down`, `Enter`, `Escape`, `Backspace`, `Delete`, `Insert`, `Home`, `End`, `PageUp`, `PageDown`, `Tab`, `Space`, `, . / \ [ ] ; ' \` - =` e o gesto `DoubleShift`. Sequências de duas teclas não são suportadas.

Registro no carregamento do módulo é permitido (os contextos `editor`, `project-tree` e `terminal` já existem no construtor). Registrar um id já existente substitui a ação.

### Integração com os demais módulos (fase 2, 23/10/2026)

Concluída depois que as outras sessões terminaram (a coordenadora liberou os arquivos):

- **`src/project-actions.ts`:** o `keydown` da árvore virou 12 ações no contexto novo `project-node` (botão ou summary de um nó da árvore focado): `project.contextMenu` (ContextMenu, Shift+F10), `project.copyRelativePath` (⌥⇧⌘C / Ctrl+Alt+Shift+C), `project.copyAbsolutePath` (⇧⌘C / Ctrl+Shift+C), `project.copy` (⌘C / Ctrl+C), `project.cut` (⌘X / Ctrl+X), `project.paste` (⌘V / Ctrl+V), `project.new` (⌘N / Alt+Insert), `project.rename` (Shift+F6), `project.move` (F6), `project.copyTo` (F5), `project.findUsages` (Alt+F7) e `project.delete` (⌘⌫ e Delete / Delete). Os itens do menu de contexto e a mensagem "cole com …" usam `keymap.shortcut(id)`. A navegação interna do menu (setas, Enter, Esc) continua local. O `copyText` com timeout foi preservado.
- **`src/docker-panel.ts`, `src/test-panel.ts`:** removidos os listeners Alt+8/Alt+4 e o sufixo fixo do `title`. As ações `tool.docker`/`tool.tests` já existiam no `workbench.ts`, que atualiza título e `aria-keyshortcuts`.
- **`src/main.ts`:** removidos os `editor.addCommand` de Alt+←/→ e ⌘B (já cobertos por `nav.back`/`nav.forward`/`nav.declaration`). A ação Monaco `php-ide.saveFile` virou `file.save` (⌘S / Ctrl+S, global, habilitada só com arquivo ativo). `status`/`backgroundStatus` foram preservados.
- **`src/debug-panel.ts`:** removido o `document.addEventListener('keydown')`. Ações registradas (categoria Depuração): `tool.debug` (Alt+5; JetBrains macOS ⌘5), `debug.toggleBreakpoint` (⌘F8 / Ctrl+F8), `debug.viewBreakpoints` (⇧⌘F8 / Ctrl+Shift+F8), `debug.stop` (⌘F2 / Ctrl+F2, só com sessão ou execução), `debug.resume` (F9; JetBrains macOS ⌥⌘R e F9), `debug.stepOver` (F8), `debug.stepInto` (F7), `debug.stepOut` (Shift+F8) e `debug.listen` (sem padrão). Resume e os steps só valem com sessão pausada, então a tecla não é consumida fora da depuração. O título do botão lateral é dinâmico. Mudança: no macOS, antes Ctrl+F8 também alternava o breakpoint; agora o padrão é só ⌘F8, e o usuário pode acrescentar Ctrl+F8 na tela Keymap.
- **`src/refactor-ui.ts`:** as ações Monaco ficaram sem `keybindings` (servem só ao menu de contexto e à paleta). Os atalhos estão no keymap, no contexto novo `php-editor` (foco no editor principal com modelo PHP): `refactor.rename` (Shift+F6), `refactor.extractMethod` (⌥⌘M / Ctrl+Alt+M), `refactor.extractVariable` (⌥⌘V / Ctrl+Alt+V), `refactor.inlineVariable` (⌥⌘N / Ctrl+Alt+N), `refactor.this` (⌃T / Ctrl+Alt+Shift+T), `refactor.undo` (sem padrão), `editor.showIntentions` (Alt+Enter), `editor.nextProblem` (F2) e `editor.previousProblem` (Shift+F2). Os títulos das code actions e o menu "Refatorar isto" mostram o atalho atual. O `onKeyDown` de Ctrl+Z da refatoração e a variável `local` do `commit` foram mantidos. Campo novo `editorActionId` no `ActionSpec`: o Search Everywhere oculta a ação Monaco espelhada para não listar a mesma ação duas vezes.
- **`src/composer-panel.ts`:** `tool.composer`, `composer.install`, `composer.update`, `composer.dumpAutoload`, `composer.validate` e `composer.require`, sem atalho padrão. Abrem o painel e acionam o botão correspondente; ficam desabilitadas enquanto o botão está desabilitado.
- `src/locales/en.json`: traduções das novas ações e categorias.

Restam com keybindings próprios do Monaco: `editor-usages.ts` (Alt+F7, ⌘⌥F7), `editor-multicursor.ts`, `sql-console.ts` (⌘Enter no console SQL). São ações de editor que continuam funcionando, mas ainda não podem ser editadas na tela Keymap.

## Verificação

- `tests/keymap.test.ts` (`npx tsx --test tests/keymap.test.ts`, 9 testes): normalização e formatação; tecla física do evento; perfis (padrão por SO, JetBrains, escolha explícita, perfil inválido); personalização, persistência por perfil, ações ainda não registradas, atalho inválido descartado, remover/restaurar ação e perfil; JSON corrompido volta ao padrão com aviso; conflitos por contexto e "remover dos outros"; teclas reservadas; despacho (contexto específico vence global, desabilitada cai na global, tecla sem ação não é consumida, campos comuns, Monaco, terminal); Shift duplo; erro assíncrono de ação reportado; `aria-keyshortcuts`. Resultado: 9/9.
- Harness `fixtures/keymap-ui/index.html` no navegador (Vite 127.0.0.1, sem Tauri): tela renderizada por categorias; gravar ⌥F12 em "Projeto" mostrou "Conflito: também usado por Terminal." antes de salvar; após salvar, os dois itens exibem o aviso e o status "⌥F12 atribuído a Projeto."; recarregar a página manteve a personalização (`php-ide-keymap`); "Buscar por atalho" + ⌥F12 filtrou as duas ações e Esc saiu do modo sem fechar o diálogo; Esc fechou o diálogo. Despacho real: ⌥F12 na página → Terminal; ⌥1 em campo comum → nada; ⌘, em campo comum → Configurações; ⇧F6 na árvore → ação de contexto `project-tree`; ⌥1 e ⇧F6 no "editor" (`.monaco-editor`) → ação global e nenhuma de árvore.
- **Fase 2 (integração):** `npm run typecheck` sem erros; `npx tsx --test tests/keymap.test.ts` 9/9; `node scripts/check-locales.mjs` válido. `node scripts/check-native.mjs --no-db` **não pôde ser validado**: as três execuções (inclusive com o `project-actions.ts` anterior e com `keymap.install` desligado) pararam no passo "Editor: seleção por teclado, cores PHP e paleta após trocar tema" com a WebView a 0% de CPU, e o `ioreg` mostrou `CGSSessionScreenIsLocked=Yes`: com a tela do Mac bloqueada, a janela não renderiza e o smoke espera para sempre. **Pendente:** repetir `--no-db` e `--web-only` com a sessão desbloqueada.
- Fase 1: `npm run typecheck` sem erros nos arquivos deste recorte; no momento da execução havia 3 erros em `src/plugin-manager.ts` (outra sessão, edição em andamento).
- `npm test` (Rust): 57 passaram, 0 falhas, 5 ignorados. `node scripts/check-locales.mjs`: válido.
- Janela Tauri real, `node scripts/check-native.mjs --no-db --search-only`: **ok** ("Busca geral: Shift duplo, arquivos e símbolos PHP reais"). Confirma que a IDE abre com o despacho central instalado e que o Shift duplo passa pelo keymap.
- `npm run test:native` completo (e `--no-db`): **timeout de 180 s/240 s sem falha registrada nem log**, o que indica um `await` sem limite ou um bloqueio fora dos `wait()` do smoke. Não foi isolado: várias sessões estavam com edições inacabadas na mesma pasta e uma execução nativa de outra sessão passou a ocupar a porta 1420, impedindo os modos `--editor-only`/`--references-only`/`--insights-only`. **Pendente:** repetir o smoke completo com a pasta estável e, se o travamento persistir, rodar os modos reduzidos para localizar o passo.

## Limites

- Sem sequências de duas teclas (ex.: ⌘K ⌘C) e sem atalhos de mouse.
- Empate entre ações no mesmo contexto executa a primeira registrada; não há seletor como na referência — só o aviso na tela Keymap.
- Perfis não podem ser duplicados, renomeados, exportados ou importados; personalização é por perfil e por usuário da WebView, não sincroniza entre máquinas.
- Keybindings internos do Monaco (edição, multicursor, usos) não aparecem na tela Keymap enquanto não migrarem.
- Com diálogo modal aberto (Search Everywhere, Keymap) atalhos globais não disparam (antes Alt+F12 disparava).
- ⌘W e demais teclas do menu padrão do Tauri no macOS podem ser consumidas pelo menu nativo antes da WebView; não foi verificado no app empacotado.
- No macOS, Alt+letra em campo de texto comum não despacha (é digitação de caractere especial).

## Proposta para catálogo/matriz

- **UI-KEYMAP-001 — Atalhos:** status **Implementado parcialmente (MVP próprio)**. Evidência: DOC (ajuda pública de keymaps) + REQ; sem OBS. Inclui registro central, perfis Padrão macOS / Padrão Windows-Linux / Inspirado em JetBrains, personalização persistida por perfil, tela Keymap com busca por nome e por atalho, conflito com "remover dos outros", teclas reservadas, despacho único com contextos, integração com Search Everywhere, títulos/`aria-keyshortcuts` e menu da aba. Testes: `tests/keymap.test.ts` (9) + harness `fixtures/keymap-ui`. Limitações: as listadas acima. Projeto, Docker, Testes, Salvar, Depurador, Refatoração e Composer já migrados; ainda fora do keymap: keybindings Monaco de usos, multicursor e console SQL. Validação nativa da fase 2 pendente (tela bloqueada). Não promover compatibilidade com o PhpStorm sem observação comparativa.
- Matriz: sugerir linha "Keymap / atalhos" com "DOC+REQ, sem OBS", cobertura das 3 tabelas de perfil acima e pendências: chords, seletor de conflito no despacho, import/export de perfis, migração dos módulos restantes.
