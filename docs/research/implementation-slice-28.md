# Recorte 28 — Fundação visual Islands (Dark/Light)

Objetivo: base visual fiel ao PhpStorm 2026.1 Islands Dark/Light para toda a IDE — paleta semântica, tema do editor, tipografia/métricas e shell (barra superior, faixas, ilhas, abas, cabeçalhos de tool window, status bar, Welcome). As features específicas serão ajustadas por outras sessões sobre estes tokens.

## Classes de evidência

- **Token público (T):** valor de cor dos arquivos públicos de `intellij-community` em `design/reference/islands/` (commit fixado em `SOURCE.md`). Os arquivos **não** são empacotados; a paleta própria (`scripts/islands-palette.py` → `src/themes.css`) é escrita à mão e só os valores (dados factuais) seguem a referência.
- **Observação (O):** medição nos screenshots autorizados `.artifacts/phpstorm-reference/` (Retina 2×, janela 1512×949 pt). As cores saturadas das capturas passam por conversão de perfil de cor (ex.: `#CF8E6D` aparece como `#C59172`; cinzas saem exatos), então onde há token usamos o token e a medição só confirma.
- **Requisito próprio (R):** decisão nossa onde a referência não se aplica ou não há função equivalente.
- **Hipótese (H):** valor plausível sem token nem medição conclusiva; marcado na tabela.

Nada foi extraído da instalação do PhpStorm. Cores do plugin PHP (proprietário) vieram só de observação.

## Entregas

| Área | Arquivos | Notas |
|---|---|---|
| Paleta | `scripts/islands-palette.py` (fonte), `src/themes.css` (gerado), `src/theme.ts` | 122 tokens `--ij-*` + nomes antigos (`--surface`, `--panel`, `--text`…) remapeados; "seguir o sistema" mantido (inclusive antes do JS, via `prefers-color-scheme` em `:root:not([data-theme])`). `index.html` carrega `themes.css` antes do splash. |
| Cores fixas | `style.css`, `workbench.css`, `tool-windows.css`, `search-everywhere.css`, `theme-surfaces.css`, `startup.css`, `welcome.css`, `composer-panel.css`, `debug-panel.css`, `keymap.css`, `php-gutter.css`, `plugin-manager.css`, `refactor.css`; `editor-changes.ts` (régua usa ThemeColor); `terminal-panel.ts` | Só valores, sem redesenho dos painéis. Exceções deliberadas abaixo. |
| Editor | `src/editor-theme.ts` (regras de sintaxe + cores do Monaco + `editorFont`), `main.ts`/`appearance.ts` (uso) | JetBrains Mono 13 px em linha de 22 px (O: 05/40), inlays em Inter 12 px. |
| Fontes | `src/assets/fonts/*.woff2`, `licenses/fonts/*-OFL.txt`, `THIRD_PARTY_NOTICES.md`, `SHA256SUMS` | Inter 400–700 e JetBrains Mono 400/700 (normal/itálico), subconjunto latino, de `@fontsource/*@5.3.0`, SIL OFL 1.1; sem CDN. |
| Ícones | `scripts/vendor-jetbrains-icons.py`, `src/assets/jetbrains-icons/{toolwindows,toolwindow,general,run}` | Mesma regra (só SVG com aviso Apache explícito, manifest com hash). `toolWindowAskAI` foi recusado pelo script por não ter o aviso. |
| Shell | `src/islands-shell.css` (novo), `src/workbench.ts`, `src/project-avatar.{ts,css}` (novo) | Ver métricas. Ids/seletores usados por `native-smoke.ts`/`startup-smoke.ts` preservados. |
| Welcome | `src/welcome.ts`, `src/welcome.css` | Layout de `01-welcome-dark`. |
| Prévia | `scripts/preview-islands.mjs` | Chrome headless, API simulada, porta 1422, 1512×949; gera `.artifacts/fidelity/foundation-*.png`. |

## Métricas (O = medido em 03/05/40/43/01, R = próprio)

| Item | Valor | Fonte |
|---|---|---|
| Barra superior | 40 px; gradiente radial 600×300 da cor do projeto | O (ilhas começam em y=43); T `RecentProject.MainToolbarGradient.width/height` |
| Faixas laterais | 40 px de largura, botões 30×30, raio 6, ícones 20 px (`@20x20` expui) | O; T `StripeToolbar.Button.size` 37×40 (ilustrativo) |
| Ilhas | raio 10, calha 5 px, fundo `--ij-island` sobre `--ij-window` | T `Island.arc 20` (diâmetro); O calha 995→1005 (2×) |
| Cabeçalho de tool window / linha de abas | 40 px | O; T `TabbedPane.tabHeight 40` |
| Aba do editor (pílula) | 28 px de altura, raio 6, borda 1 px | O (98→153 em 2×); cores T `EditorTabs.underlined*` |
| Árvore | linha 24 px, recuo 18 px, chevrons expui 16 px | T `Tree.rowHeight 24`; O recuo 122→158 (2×) |
| Status bar | 30 px + 4 px de respiro (ilha termina em y≈914) | O |
| Controles | altura 28, raio 4 | T `Button.minimumSize 72,28`, `Button.arc 8` |
| Popups | raio 8 | O (H para o valor exato) |
| Fonte UI | Inter 13 px; secundária 12 px | Pedido + O |
| Editor | JetBrains Mono 13 px, linha 22 px | O (13 colunas ≈ 7,7 px; faixa da linha atual 44 px em 2×) |

## Tabela token → origem

| Token | Islands Dark | Islands Light | Origem |
|---|---|---|---|
| `--ij-window` | `#26282C` | `#E9EAEE` | MainWindow.background / MainToolbar.background / StatusBar.background |
| `--ij-island` | `#191A1C` | `#FFFFFF` | ToolWindow.background / EditorTabs.background (Island.borderColor) |
| `--ij-island-alt` | `#212326` | `#F7F8F9` | Table.stripeColor / *.background (light) |
| `--ij-stripe` | `#26282C` | `#E9EAEE` | ToolWindow.Stripe.background |
| `--ij-popup` | `#26282C` | `#FFFFFF` | Popup.background / PopupMenu.background / Menu.background |
| `--ij-popup-border` | `#33353B` | `#D1D3D9` | Popup.borderColor |
| `--ij-popup-footer` | `#26282C` | `#F7F8F9` | Popup.Advertiser.background |
| `--ij-popup-footer-text` | `#73767C` | `#73767C` | Popup.Advertiser.foreground |
| `--ij-dialog` | `#26282C` | `#F7F8F9` | AlertDialog.background / *.background (light) |
| `--ij-tooltip` | `#33353B` | `#FFFFFF` | ToolTip.background |
| `--ij-tooltip-border` | `#33353B` | `#D1D3D9` | ToolTip.borderColor |
| `--ij-tooltip-text` | `#D1D3D9` | `#000000` | ToolTip.foreground |
| `--ij-notification` | `#33353B` | `#FFFFFF` | Notification.background |
| `--ij-text` | `#D1D3D9` | `#000000` | *.foreground / MainToolbar.foreground (light) |
| `--ij-text-secondary` | `#9FA2A8` | `#5F6269` | StatusBar.Widget.foreground / ToolWindow.Button.foreground |
| `--ij-text-info` | `#73767C` | `#73767C` | *.infoForeground |
| `--ij-text-disabled` | `#4C4F56` | `#9FA2A8` | *.disabledForeground |
| `--ij-text-inactive-tab` | `#AFB1B6` | `#4D4F55` | observado: abas não selecionadas (05/40); EditorTabs.unselectedAlpha |
| `--ij-link` | `#71A1FE` | `#2F5EB9` | Link.activeForeground |
| `--ij-match` | `#538AF9` | `#2F5EB9` | CompletionPopup.matchForeground |
| `--ij-border` | `#33353B` | `#E9EAEE` | Separator.separatorColor / Borders.color (light) |
| `--ij-border-subtle` | `#26282C` | `#E9EAEE` | Borders.color / OnePixelDivider.background |
| `--ij-control-border` | `#40434A` | `#D1D3D9` | Component.borderColor / Button.startBorderColor |
| `--ij-toolbar-separator` | `#FFFFFF21` | `#00000020` | MainToolbar.separatorColor |
| `--ij-hover` | `#FFFFFF17` | `#00000012` | ActionButton.hoverBackground |
| `--ij-pressed` | `#FFFFFF29` | `#00000020` | ActionButton.pressedBackground |
| `--ij-list-hover` | `#FFFFFF10` | `#00000008` | List.hoverBackground / Tree.hoverBackground |
| `--ij-selection` | `#2A4371` | `#D0DFFE` | *.selectionBackground |
| `--ij-selection-text` | `#D1D3D9` | `#000000` | *.selectionForeground |
| `--ij-selection-inactive` | `#33353B` | `#E9EAEE` | *.selectionInactiveBackground |
| `--ij-selection-light` | `#233558` | `#E3EBFE` | *.lightSelectionBackground |
| `--ij-focus` | `#3871E1` | `#3871E1` | *.focusColor / ActionButton.focusedBorderColor |
| `--ij-stripe-selected` | `#FFFFFF1C` | `#00000014` | observado: botão de faixa aberto sem foco (05 #3E4044; 40 #D7D9DE) |
| `--ij-stripe-active` | `#3871E1` | `#3871E1` | ToolWindow.Button.selectedBackground (observado ativo em 43) |
| `--ij-stripe-active-text` | `#FFFFFF` | `#FFFFFF` | ToolWindow.Button.selectedForeground |
| `--ij-tab-selected` | `#233558` | `#E3EBFE` | EditorTabs.underlinedTabBackground |
| `--ij-tab-selected-border` | `#2E4D89` | `#A7C5FF` | EditorTabs.underlinedBorderColor |
| `--ij-tab-selected-inactive` | `#26282C` | `#E9EAEE` | EditorTabs.inactiveUnderlinedTabBackground |
| `--ij-tab-selected-inactive-border` | `#40434A` | `#D1D3D9` | EditorTabs.inactiveUnderlinedTabBorderColor |
| `--ij-search-tab-selected` | `#233558` | `#E3EBFE` | SearchEverywhere.Tab.selectedBackground |
| `--ij-field` | `#191A1C` | `#FFFFFF` | TextField.background |
| `--ij-combo` | `#26282C` | `#FFFFFF` | ComboBox.nonEditableBackground / ComboBox.background |
| `--ij-button` | `#191A1C00` | `#FFFFFF00` | Button.startBackground |
| `--ij-button-default` | `#3871E1` | `#3871E1` | Button.default.startBackground |
| `--ij-button-default-text` | `#FFFFFF` | `#FFFFFF` | Button.default.foreground |
| `--ij-tag` | `#393B40` | `#EBECF0` | List.Tag.background |
| `--ij-tag-text` | `#868A91` | `#494B57` | List.Tag.foreground |
| `--ij-counter` | `#73767C` | `#8B8E94` | Counter.background |
| `--ij-counter-text` | `#000000` | `#FFFFFF` | Counter.foreground |
| `--ij-scrollbar` | `#80808059` | `#80808059` | ScrollBar.thumbColor |
| `--ij-scrollbar-hover` | `#8080808C` | `#8080808C` | ScrollBar.hoverThumbColor |
| `--ij-progress` | `#3871E1` | `#3871E1` | ProgressBar.progressColor |
| `--ij-progress-track` | `#40434A` | `#DDDFE4` | ProgressBar.trackColor / *.disabledBorderColor (light) |
| `--ij-error` | `#F57E84` | `#C54E58` | Label.errorForeground |
| `--ij-warning` | `#D59637` | `#A56906` | Label.warningForeground |
| `--ij-success` | `#6DB083` | `#338555` | Label.successForeground |
| `--ij-error-bg` | `#56272B` | `#FFF6F5` | ValidationTooltip.errorBackground |
| `--ij-error-border` | `#80383E` | `#FFC4C5` | ValidationTooltip.errorBorderColor |
| `--ij-warning-bg` | `#44321D` | `#FFF6E9` | ValidationTooltip.warningBackground |
| `--ij-warning-border` | `#694820` | `#F4CD9A` | ValidationTooltip.warningBorderColor |
| `--ij-success-bg` | `#203B2A` | `#F5FAF3` | Editor.ToolTip.successBackground |
| `--ij-success-border` | `#29583C` | `#BBDBC2` | Editor.ToolTip.successBorder |
| `--ij-badge-blue` | `#2F5EB9B3` | `#3871E129` | Badge.blueSecondaryBackground |
| `--ij-badge-blue-text` | `#D0DFFE` | `#2F5EB9` | Badge.blueSecondaryForeground |
| `--ij-badge-green` | `#2A6E47B3` | `#33855529` | Badge.greenSecondaryBackground |
| `--ij-badge-green-text` | `#CDE5D1` | `#2A6E47` | Badge.greenSecondaryForeground |
| `--ij-badge-purple` | `#6C4EBBB3` | `#8060DB29` | Badge.purpleSecondaryBackground |
| `--ij-badge-purple-text` | `#E2DBFC` | `#6C4EBB` | Badge.purpleSecondaryForeground |
| `--ij-trial-bg` | `#273828` | `#F7F8F9` | TrialWidget.Active.background |
| `--ij-trial-border` | `#4E8052` | `#338555` | TrialWidget.Active.borderColor |
| `--ij-trial-text` | `#5FAD65` | `#338555` | TrialWidget.Active.foreground |
| `--ij-run-icon` | `#4E9D6C` | `#338555` | RunWidget.runIconColor / Badge.greenBackground (light) |
| `--ij-stop` | `#C54E58` | `#E4656E` | RunWidget.stopBackground |
| `--ij-backdrop` | `#00000066` | `#1C294C38` | hipótese: véu de diálogo modal (não há chave pública) |
| `--ij-shadow-color` | `#00000080` | `#0000002E` | hipótese: sombra de popup |
| `--ij-breakpoint` | `#DB5C5C` | `#E55757` | hipótese: ponto de parada (CodeWithMe.Users.2.Background) |
| `--ij-gutter-blue` | `#548AF7` | `#3574F0` | observado: ícones de gutter override/implementado (05); CompilationCharts.memory.stroke |
| `--ij-gutter-green` | `#57965C` | `#369650` | observado: ícone implementa (05); ProgressBar.passedColor |
| `--ij-vcs-modified` | `#70AEFF` | `#0033B3` | FILESTATUS_MODIFIED (IslandSchemeDark.xml); claro: observado 40/43 |
| `--ij-vcs-added` | `#73BD79` | `#067D17` | FILESTATUS_ADDED; claro: hipótese (DEFAULT_STRING) |
| `--ij-vcs-deleted` | `#6F737A` | `#6C707E` | FILESTATUS_DELETED; claro: BREADCRUMBS_DEFAULT |
| `--ij-vcs-conflict` | `#DE6A66` | `#C54E58` | FILESTATUS_MERGED_WITH_CONFLICTS; claro: Label.errorForeground |
| `--ij-vcs-ignored` | `#D69A6B` | `#A56906` | FILESTATUS_IDEA_FILESTATUS_IGNORED; claro: hipótese |
| `--ij-diff-added` | `#549159` | `#7FC784` | ADDED_LINES_COLOR |
| `--ij-diff-modified` | `#375FAD` | `#88ADF7` | MODIFIED_LINES_COLOR |
| `--ij-diff-deleted` | `#868A91` | `#767A8A` | DELETED_LINES_COLOR |
| `--ij-diff-added-bg` | `#549159` | `#7FC784` | ADDED_LINES_COLOR (com alpha no uso) |
| `--ij-diff-conflict` | `#DB5C5C` | `#E55757` | CodeWithMe.Users.2.Background / hipótese claro |
| `--ij-editor-bg` | `#191A1C` | `#FFFFFF` | TEXT background |
| `--ij-editor-text` | `#BCBEC4` | `#080808` | TEXT foreground |
| `--ij-editor-comment` | `#7A7E85` | `#8C8C8C` | DEFAULT_LINE_COMMENT |
| `--ij-editor-caret-row` | `#1F2024` | `#F5F8FE` | CARET_ROW_COLOR |
| `--ij-inlay` | `#727782` | `#7A7A7A` | INLAY_TEXT_WITHOUT_BACKGROUND; claro: observado 40 |
| `--ij-breadcrumb` | `#9DA0A8` | `#6C707E` | BREADCRUMBS_DEFAULT |
| `--ij-breadcrumb-current` | `#DFE1E5` | `#000000` | BREADCRUMBS_CURRENT |
| `--ij-avatar-{1..9}-{start,end,toolbar}` | `9 pares` | `idem` | RecentProject.ColorN.Avatar.Start/End, MainToolbarGradientStart (claro: hipótese, cor do avatar a 22%) |

Nomes antigos (compatibilidade): `--surface`/`--panel` → `--ij-island`; `--raised` → `--ij-popup`; `--input` → `--ij-field`; `--border` → `--ij-border`; `--text` → `--ij-text`; `--muted` → `--ij-text-secondary`; `--selection` → `--ij-selection`; `--hover` → `--ij-hover`; `--success/--danger/--warning/--info` → `--ij-success/--ij-error/--ij-warning/--ij-link`; `--accent` = `#538AF9` (escuro, T `Badge.blueBackground`, legível como texto) / `#3871E1` (claro, T `*.focusColor`).

## Editor (`src/editor-theme.ts`)

| Categoria | Escuro | Claro | Origem |
|---|---|---|---|
| Texto / fundo | `#BCBEC4` / `#191A1C` | `#080808` / `#FFFFFF` | T `TEXT` |
| Palavra-chave, `<?php`, tipos embutidos (`string`) | `#CF8E6D` | `#0033B3` | T `DEFAULT_KEYWORD`; O 05/40 |
| String / número | `#6AAB73` / `#2AACB8` | `#067D17` / `#1750EB` | T `DEFAULT_STRING/NUMBER` |
| Comentário / doc | `#7A7E85` / `#5F826B` it. | `#8C8C8C` it. | T `DEFAULT_LINE_COMMENT/DOC_COMMENT` |
| Declaração de função | `#56A8F5` | `#00627A` | T `DEFAULT_FUNCTION_DECLARATION` |
| Chamada de método/função PHP | `#57AAF7` | `#00627A` (método), `#080808` (função) | O C02 (escuro azul); claro: declaração observada em 40, chamada **H** (token semântico não separa chamada de declaração) |
| Variável PHP | `#9876AA` | `#660000` | O `#9377A7` (C02) e `#5D0E07` (42) após perfil de cor; valores originais **H** |
| Constante / metadado / tag HTML | `#C77DBB` / `#B3AE60` / `#D5B778` | `#871094` / `#9E880D` / `#0033B3` | T |
| Números de linha (normal/atual) | `#4B5059` / `#A1A3AB` | `#AEB3C2` / `#767A8A` | T `LINE_NUMBERS_COLOR`, `LINE_NUMBER_ON_CARET_ROW_COLOR` |
| Linha atual | `#1F2024` | `#F5F8FE` | T `CARET_ROW_COLOR`; O igual |
| Seleção | `#214283` | `#A6D2FF` | claro T `SELECTION_BACKGROUND`; escuro **H** (pai Darcula não incluído) |
| Guias de indentação / margem direita | `#323438`/`#4E5157`, `#323438` | `#EBECF0`/`#AEB3C2`, `#EBECF0` | T `INDENT_GUIDE`, `SELECTED_INDENT_GUIDE`, `RIGHT_MARGIN_COLOR` |
| Colchete correspondente | `#43454A` | `#93D9D9` | T `MATCHED_BRACE_ATTRIBUTES` |
| Identificador sob o cursor (leitura/escrita) | `#373B39` / `#402F33` | `#EDEBFC` / `#FCE8F4` | T |
| Resultado de busca | `#114957` (`#2D543F` atual) | `#FCD47E` | T `TEXT_SEARCH_RESULT`, `SEARCH_RESULT` |
| Erro / aviso (ondulado e faixa) | `#FA6675`/`#D64D5B`, `#F2C55C`/`#C29E4A` | `#F50000`, `#F2BF57` | T `ERRORS/WARNING_ATTRIBUTES`; claro erro de `WRONG_REFERENCES` (**H** para o ondulado) |
| VCS na margem (add/mod/del) | `#549159` / `#375FAD` / `#868A91` | `#7FC784` / `#88ADF7` / `#767A8A` | T `*_LINES_COLOR` |
| Inlays ("5 usages") | `#727782` | `#7A7A7A` | T `INLAY_TEXT_WITHOUT_BACKGROUND`; claro O |
| Popup de completion (fundo/seleção/destaque) | `#26282C`/`#33353B`/`#538AF9` | `#FFFFFF`/`#E9EAEE`/`#2F5EB9` | T `Popup.*`, `CompletionPopup.matchForeground`; seleção O 13/42 (seleção "inativa" até navegar) |
| Terminal (fundo/texto/cursor/seleção) | `#191A1C`/`#BCBEC4`/`#CED0D6`/`#214283` | `#FFFFFF`/`#080808`/`#000000`/`#A6D2FF` | T `CONSOLE_BACKGROUND_KEY`, `CONSOLE_NORMAL_OUTPUT`; ANSI mantidas (próprias; Darcula não incluído) |

## Shell

- **Barra superior:** widget de projeto com avatar de iniciais em gradiente (`src/project-avatar.ts`; regra de iniciais observada na 01: primeira letra da primeira e da última palavra, dígitos iniciais ignorados), widget de branch (ícone vcs + nome + chevron), grupo de execução "Arquivo atual" + Run + Debug, busca, engrenagem (Aparência), Fechar projeto como ícone. **Run** fica desabilitado com o motivo no tooltip (não existe executor de arquivo); **Debug** aciona `#debug-script` (depura o arquivo PHP atual com Xdebug). Voltar/avançar e alternância de tema permanecem (funções nossas).
- **Faixas:** ícones expui por `data-ij-icon` (CSS), na ordem da referência: Projeto, Commit no topo; Services, Debug, Run (testes), Composer, Terminal, Git embaixo. Aberto = fundo cinza (O 05); a variação azul de janela focada (O 43) não foi implementada.
- **Ilhas:** painel do projeto, editor (abas + editor) e cada janela inferior (`section` dentro de `.code`) são ilhas com raio 10 sobre a calha.
- **Cabeçalhos:** título em 600 + abas pílula (mesmo estilo das abas do editor) para Terminal/Testes/Services/Git/diálogo de banco; botão "—" com ícone expui `hide`.
- **Status bar:** caminho à esquerda, mensagem de análise, e à direita posição, LF/CRLF, indentação (do modelo do Monaco) e cadeado (somente leitura). Widgets são dados reais do editor.
- **Welcome:** barra lateral com marca, navegação Projetos/Personalizar (Personalizar mostra idioma; o seletor de tema fica no rodapé da barra lateral porque `preview-startup.mjs` o usa visível), busca sem borda com lupa, botões Novo projeto/Abrir/Clonar, lista com avatar, nome e caminho, × no hover.

## Exceções a "sem cor fixa"

- Badges de driver de banco (`#336791` PostgreSQL etc. em `workbench.css`): cores de marca dos fornecedores, iguais nos dois temas.
- Miniaturas de tema em Aparência (`theme-surfaces.css`): mostram cada tema fixo, com valores Islands literais.
- Paleta ANSI do terminal: própria (sem referência pública incluída).
- `editor-theme.ts` contém os valores do editor (é a fonte da paleta do editor, como `islands-palette.py` para a UI).

## O que ainda difere (limitações)

- **Barra de título:** a janela Tauri usa a barra nativa; o PhpStorm integra os semáforos na barra superior (unified title bar). Não alterado (configuração nativa/Rust compartilhada).
- **Gutter:** o Monaco põe a margem de glifos à esquerda dos números; o PhpStorm mostra números e depois ícones (implementa/sobrescreve), com área maior até o código. Ícones de gutter, lâmpada, contador de problemas (⚠1 ˄ ˅) e barra de breadcrumbs inferior do editor ficam para as sessões de editor/PHP.
- **Posição na status bar:** mantém o texto `Ln X, Col Y · UTF-8` (vários testes de UI dependem dele) em vez de `9:22` + `UTF-8` separado; falta "PHP: 8.2" (nível de linguagem não exposto ao frontend) e o selo de licença (não se aplica).
- **Abas:** sem cor de status VCS no nome (O: o azul de `User.php` em 40/43 é `FILESTATUS_MODIFIED`, não "aba ativa"); token `--ij-vcs-modified` já existe para isso.
- **Árvore:** sem nó raiz do projeto com caminho em cinza; seleção não muda para azul ao focar a janela de projeto em todos os casos (usa `:focus-within`).
- **Faixas:** sem Structure, Find, Problems, Notificações, ⋯ — não há tool windows equivalentes; não criamos botões sem função. Database e Agente usam ícones próprios (os da referência não são Apache).
- **Cor do avatar:** atribuição por hash próprio; a do produto não é documentada (ex.: "RP" é azul-esverdeado na referência, roxo aqui).
- **Welcome:** sem "Remote Development/SSH/Dev Containers/Plugins/Learn" (não existem), sem linha de branch por projeto (a API de recentes não traz branch), caminho sem abreviação `~`, sem menu ⋮ (só remover), "New Project" sem seta de divisão.
- **Valores H:** seleção do editor escuro, sombras/véu modal, cores claras de VCS added/ignored, variável PHP (valores exatos), chamada de função no claro, raio de popup.
- **Validação:** só prévia em Chrome headless com API simulada (`scripts/preview-islands.mjs`); o WebView nativo (WKWebView) e `npm run test:native` ficam com a coordenação. Os screenshots não promovem compatibilidade funcional de nenhuma família.

## Validação

- `npm run typecheck`, `npm run test:locales` e `npm test` (Rust) — ver resultado no relatório da sessão.
- `node scripts/preview-islands.mjs` → `.artifacts/fidelity/foundation-{workbench,tools,welcome}-{dark,light}.png`; comparações lado a lado `foundation-compare-{dark,light,tools-dark}.png` (referência 05/40/16 reduzida a 1512×949 à esquerda). A comparação da Welcome não foi montada porque a 01 contém nomes de projetos do usuário.
