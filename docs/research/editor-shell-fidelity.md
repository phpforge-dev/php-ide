# Shell do editor: breadcrumbs, Problems, menus de contexto e keymap (03–04/11/2026)

Catálogo: UI-BREADCRUMBS-001, UI-PROBLEMS-001, UI-CONTEXT-001, UI-KEYMAP-001. Estado: **Em desenvolvimento / não validada comparativamente** (harness próprio em WebKit; sem comparação lado a lado automatizada nem execução nativa desta fatia).

## Ponto de partida

- Rodapé do editor sem breadcrumbs de código; a barra de status mostrava só `src › User.php` (texto, sem clique).
- Nenhuma janela Problems; o clique nas contagens do widget de inspeções pulava para o próximo problema.
- Só a árvore do projeto tinha menu próprio; as abas tinham três itens de fechar e o editor usava o menu do Monaco (Go to Definition/Peek/Command Palette, ações de multicursor, Cut/Copy/Paste em inglês e desabilitados no WebKit).
- Keymap sem atalhos de duas teclas, sem escolha quando duas ações dividem o atalho (vencia a primeira registrada) e sem importar/exportar.

## Evidências (separadas)

| Tipo | Item |
|---|---|
| Observação autorizada (PhpStorm 2026.1.4, Islands Dark, keymap macOS; 03/11/2026; projeto sintético `reference-project` + `src/Broken.php`) | Capturas locais em `.artifacts/phpstorm-reference/` (não versionadas): **50** Problems › File, **51** Project Errors vazio, **52** menu "olho", **53** menu da aba, **54** breadcrumbs no editor, **55** clique num crumb, **56** popup de filhos na barra de navegação, **57** engrenagem do Keymap, **58** diálogo Keyboard Shortcut com Second stroke, **59** "Already assigned to". Já existentes: **31** menu do editor, **17** Problems vazio, **26** Keymap. |
| Documentação pública | Problems tool window (Alt+6/⌘6; F4/Enter/duplo clique abrem o problema); Breadcrumbs (no rodapé do editor, realce do elemento ao passar o mouse); Keymap (atalhos de duas teclas, conflitos); formato público de keymap XML do IntelliJ (`<keymap><action id><keyboard-shortcut first-keystroke second-keystroke/>`, ids de ação dos keymaps open source); Pin tabs ("Close All but Pinned"). |
| Requisito próprio | Exportar/importar pela engrenagem (JSON próprio; importar também XML do PhpStorm); seletor de conflito no despacho; texto de espera do segundo toque na barra de status; Recortar/Copiar/Colar do menu pela API de área de transferência; itens sem recurso equivalente omitidos em vez de exibidos mortos. |
| Hipótese (não verificada) | Cut/Copy aparecem no menu do editor só com seleção (31 foi capturada sem seleção); "Close Other Tabs"/esquerda/direita preservam abas fixadas e "Close All Tabs" não; ordem "esquerda" antes de "direita"; formato do Copy Reference (`\Ns\Classe::metodo()`); segunda tecla sem chord deixa a primeira valer sozinha. |

Nada foi extraído do produto. Ícones de método/função e do menu são desenhos próprios; o ícone da faixa Problems é o `toolwindows/problems` do `intellij-community` (Apache-2.0), já importado com o manifesto existente.

## Critérios de aceitação (validados no harness)

**Breadcrumbs (UI-BREADCRUMBS-001)** — observado em 54–56:
1. Com o cursor dentro de um método, o rodapé do editor mostra `\Fixture › Broken › total()` logo abaixo do editor; fora de declarações a barra some.
2. Clique num crumb leva o cursor ao nome (Broken → 5:7, como em 55), destaca o crumb e mantém os mais internos esmaecidos até o cursor mover.
3. A barra de navegação do rodapé continua o caminho: `reference-project › src › Broken.php › Broken › total`.
4. Clique num segmento abre o popup dos filhos ordenados por nome (Broken → `never`, `total`, como em 56); diretórios listam suas entradas; Enter/clique navega; digitar filtra; Esc fecha.

**Problems (UI-PROBLEMS-001)** — observado em 50–52:
1. Clique nas contagens do widget abre a janela na aba "Arquivo N" (contagem), botão da faixa pressionado.
2. Nó do arquivo (ícone, nome, caminho esmaecido) e uma linha por problema (ícone de severidade, mensagem, `:linha` esmaecido), erros primeiro e depois por linha; primeira linha selecionada.
3. Setas, Home/End, ←/→ (recolher/expandir), Enter/F4/duplo clique abrem o problema no editor com foco.
4. "Olho": Mostrar (Aviso, Aviso fraco, Mostrar outros problemas) · Ordenar por (Severidade, Nome) · Agrupar por inspeção; preferências persistidas.
5. "Erros do projeto": só erros, de todos os arquivos abertos, por arquivo; vazio → "Nenhum erro encontrado pela IDE."
6. Alt+6 (perfil padrão) e ⌘6 (perfil JetBrains) alternam a janela; editável na tela Keymap.

**Menus de contexto (UI-CONTEXT-001)** — observado em 31 e 53:
1. Aba: Fechar · Fechar outras abas · Fechar todas as abas · Fechar abas à esquerda/direita (só quando existem) | Copiar caminho/referência… | Fixar aba | Abrir em | Histórico local | Renomear arquivo…
2. Editor (no lugar do menu do Monaco): Mostrar ações de contexto | (Recortar/Copiar com seleção) Colar · Copiar/colar especial · Modo de seleção em coluna | Encontrar usos · Ir para | Dobra | Renomear… · Refatorar | Abrir em | Histórico local · Git.
3. Submenus por teclado e mouse; Shift+F10 abre o menu da aba focada e o do editor; atalhos exibidos são os que funcionam aqui (keymap ou Monaco).
4. Fechar abas à esquerda fecha as abas à esquerda; abas fixadas vão para o início, mostram um alfinete e sobrevivem a fechar outras/esquerda/direita.

**Keymap (UI-KEYMAP-001)** — observado em 57–59:
1. Atalhos de duas teclas (`⌘K, ⌘C`): o primeiro toque espera com aviso na barra de status; o segundo executa; Esc cancela; tecla que não completa chord deixa o primeiro toque valer sozinho e segue normalmente.
2. Gravador com "Segunda tecla:" (caixa + campo próprio, como em 58) e aviso "Já atribuído a:" (59); chord conflita com o atalho simples igual à sua primeira tecla.
3. Várias ações habilitadas com o mesmo atalho no mesmo contexto → popup para escolher (setas/Enter/Esc).
4. Engrenagem: Exportar… (JSON das personalizações do perfil) · Importar… (esse JSON ou keymap XML do PhpStorm; ids públicos mapeados, demais listados) · Restaurar padrões.

## Mudança

- `src/code-structure.ts` (sem DOM; `tests/code-structure.test.ts`): varredura própria de PHP (namespaces, classes/interfaces/traits/enums, funções e métodos, inclusive em classes anônimas; ignora comentários, strings, heredocs e HTML fora de `<?php`) e títulos de Markdown; `symbolPath`, rótulos de crumb e referência qualificada.
- `src/code-breadcrumbs.ts/.css`: barra no rodapé do editor e barra de navegação no rodapé da janela com popups.
- `src/problems.ts/.css`: janela Problems (faixa esquerda, grupo inferior entre Terminal e Git), ação `tool.problems`; `src/editor-chrome.ts` abre a janela pelas contagens.
- `src/context-menu.ts`: menu flutuante único (árvore, abas, editor, Problems), com títulos de seção e itens marcáveis; `src/project-actions.ts` passa a usá-lo e expõe os submenus de arquivo.
- `src/tab-menu.ts`, `src/editor-menu.ts/.css`, `src/main.ts`: menus da aba e do editor, abas fixadas.
- `src/keymap.ts` (`tests/keymap.test.ts`): chords, `resolveAll` + `chooser`, `exportProfile`/`importProfile`, mapeamento de ids públicos do IntelliJ; `src/keymap-settings.ts/keymap.css`: segunda tecla, engrenagem, diálogos de troca, seletor de conflito e aviso de espera.
- `src/locales/en.json`: rótulos em inglês iguais aos do PhpStorm.

## Validação

- `node scripts/check-editor-shell.mjs` (WebKit, escuro e claro; `--chromium`, `--lang=en`, `--no-assert`, `--dump`): os quatro grupos de critérios acima. Capturas em `.artifacts/editor-shell/` (depois), `.artifacts/editor-shell/before/` (mesmo harness na base `9f85030`) e `.artifacts/editor-shell/en/` (rótulos em inglês).
- `node --import tsx --test tests/code-structure.test.ts tests/keymap.test.ts`; `npm run test:unit` (199 aprovados), `npm run typecheck`, `npm test` (Rust), `node scripts/check-locales.mjs`, `node scripts/check-editor-chrome.mjs --webkit` (sem regressão).
- Não executado nesta fatia: `npm run test:native` (porta 1420 compartilhada; a coordenação roda no release).

## Limitações e diferenças conhecidas

- Breadcrumbs: estrutura por varredura própria (não usa o índice do Phpactor); só PHP e Markdown; sem breadcrumbs de HTML/JS/YAML; sem configuração de posição (topo/rodapé) nem ocultação por linguagem.
- Problems: sem "Server Problem", Vulnerable Dependencies, Qodana e abas de IA; "Erros do projeto" cobre arquivos com modelo aberto (não roda Inspect Code no projeto); sem pré-visualização do código nem autoscroll.
- Menus: faltam AI Actions, Generate…, Run/Debug, Compare with Clipboard, snippets/gists, Diagrams, Split, Open Tab in New Window, Configure Editor Tabs, Bookmarks e Override File Type (recursos inexistentes aqui); "Copiar caminho/referência…" é submenu em vez do popup do PhpStorm; menu do gutter não implementado.
- Keymap: sem keymaps duplicados/nomeados (perfis fixos com personalização); exportação em JSON próprio (não XML); importação XML só mapeia ~35 ids públicos; atalhos de mouse e abreviações não suportados; o chord não expira por tempo.
- Nada foi comparado lado a lado com o PhpStorm de forma automatizada; as capturas da referência servem de oráculo visual manual.
