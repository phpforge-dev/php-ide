# Shell do editor: breadcrumbs, Problems, menus de contexto e keymap (03–04/11/2026)

Catálogo: UI-BREADCRUMBS-001, UI-PROBLEMS-001, UI-CONTEXT-001, UI-KEYMAP-001. Estado: **Em desenvolvimento / não validada comparativamente** (harness próprio em WebKit; sem comparação lado a lado automatizada nem execução nativa desta fatia). Segunda rodada (04/11/2026) mais abaixo.

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

## Segunda rodada (04/11/2026): lacunas da lista abaixo

Fecha, no host, as lacunas registradas na primeira rodada. Nenhum plugin foi alterado; nenhuma observação nova foi feita na tela do PhpStorm nesta rodada (as capturas 31, 51, 53 e 57 já cobriam os menus, o Project Errors vazio e a engrenagem do Keymap).

### Evidências (separadas)

| Tipo | Item |
|---|---|
| Observação autorizada (capturas existentes) | **31** menu do editor (Generate… ⌘N depois de Refactor; Run/Debug/More Run/Debug; Compare with Clipboard); **51** Project Errors vazio com "No errors found by the IDE." e o link "Inspect Code…", e o botão de pré-visualização na barra lateral; **53** menu da aba (Split Right/Split and Move Right/Split Down/Split and Move Down; Pin Tab · Open Tab in New Window · Configure Editor Tabs…; Bookmarks ›; Run/Debug); **57** engrenagem com Duplicate… num keymap embutido. |
| Documentação pública | Settings › Editor › General › Breadcrumbs (Show breadcrumbs; Placement Top/Bottom, Bottom por padrão; uma caixa por linguagem); Bookmarks (alternar, mnemônico com dígito/letra, mostrar todos, ^dígito; no submenu da aba: Add Bookmark/Add Mnemonic Bookmark para o arquivo; atalhos F11/Ctrl+F11/Shift+F11 no keymap Windows/Linux e F3/⌥F3/⌘F3 no macOS); Keymap (a engrenagem duplica, renomeia, remove e restaura; um keymap derivado guarda só as diferenças em relação ao pai). |
| Requisito próprio | Inspect Code pelas mesmas fontes de diagnóstico de um editor aberto; resultados mantidos para arquivos fechados; pré-visualização somente leitura; Generate… e Run/Debug delegados a contribuições de plugins; mudanças de configuração aplicadas na hora; menu de posição com o botão direito na barra de breadcrumbs. |
| Hipótese (não verificada) | Rótulo HTML `main#app.page` (tag, id e classes); itens de array JSON e de sequência YAML transparentes no caminho; padrão de 10 abas no limite; nome sugerido "<keymap> cópia"; layout do seletor mnemônico (grade 1–0, A–Z) e da lista de marcadores; título do diff "Área de transferência vs. arquivo". |

### Critérios de aceitação (validados no harness `scripts/check-editor-shell-2.mjs`)

**Breadcrumbs (UI-BREADCRUMBS-001)**
1. JavaScript `Cart › total()`, TypeScript `Shop › format()`, JSON `autoload › psr-4 › Fixture\`, YAML `services › App\Mailer › arguments`, HTML `html › body › main#app.page › ul.items › li`, seguindo o cursor.
2. Configurações do editor › Breadcrumbs: mostrar/ocultar, Topo/Rodapé (rodapé por padrão) e uma caixa por linguagem; aplica na hora e persiste.

**Problems (UI-PROBLEMS-001)**
1. Erros do projeto vazio: "Nenhum erro encontrado pela IDE." e "Inspecionar código…" (51).
2. Inspecionar código lê todos os arquivos do projeto fora de `vendor/`, pede `textDocument/diagnostic` (e `php/diagnostics` em PHP) e usa os workers do Monaco num modelo temporário, descartado ao fim; os erros de arquivos fechados ficam listados por caminho; arquivos abertos mostram os marcadores vivos; marcadores de abas já fechadas não aparecem mais.
3. Botão de pré-visualização: código do problema selecionado ao lado da árvore, somente leitura, na linha do problema; duplo clique abre o arquivo na posição.

**Menus (UI-CONTEXT-001)**
1. Aba: … Copiar caminho/referência… | Dividir à direita · Dividir para baixo (· Desfazer divisão) | Fixar aba · Configurar abas do editor… | Marcadores › | Executar › · Mais Executar/Depurar › (quando um plugin oferece) | Abrir em | Histórico local | Renomear arquivo….
2. Dividir à direita/para baixo abre um segundo editor com o mesmo documento (edições compartilhadas); divisor arrastável e por setas; Desfazer divisão ou × fecha.
3. Marcadores: F3 alterna na linha, ⌥F3 abre o seletor mnemônico, ⌘F3 lista (Enter abre, Delete remove), ^1 vai ao mnemônico 1; marca no gutter; acompanha edições; por projeto.
4. Editor: Gerar… (⌘N) logo após Refatorar, com os itens dos provedores `generate.*` e ações de geração contribuídas; Executar/Mais Executar/Depurar com as ações `*.runContext`/`*.debugContext`/cobertura/configurações do keymap; Comparar com a área de transferência abre o diff lado a lado (Esc fecha).
5. Configurar abas do editor… abre as configurações na seção Abas do editor: posição Topo/Nenhuma, ícone do arquivo, botão de fechar, limite de abas (fecha a menos usada que não está fixada nem modificada).

**Keymap (UI-KEYMAP-001)**
1. Engrenagem de um keymap embutido: Duplicar… (sem Excluir), como em 57; de uma cópia: Duplicar…, Renomear…, Excluir; e Exportar…/Importar…/Restaurar padrões.
2. Duplicar pede o nome (sugere "<keymap> cópia"), cria a cópia ativa que herda os padrões do keymap embutido de origem e começa com as personalizações atuais; personalizar a cópia não muda a origem; excluir a cópia ativa volta à origem; tudo persiste.

### Mudança

- `src/code-structure.ts` (`jsStructure`, `jsonStructure`, `yamlStructure`, `htmlStructure`, grupos de linguagem), `src/code-breadcrumbs.ts` (posição, ocultação por linguagem, menu de posição) e `src/editor-settings.ts/.css` (página Breadcrumbs e Abas do editor; ação `ide.editorSettings`, botão "Editor…" no diálogo Aparência).
- `src/inspect-code.ts` e `src/problems.ts/.css` (Inspecionar código, progresso com Cancelar, pré-visualização, ação `code.inspect`); `src/main.ts` fornece arquivos, leitura e diagnósticos.
- `src/editor-split.ts/.css`, `src/bookmarks.ts/.css`, `src/compare-clipboard.ts/.css`, `src/run-context.ts`, `src/plugin-services.ts` (`pluginServices(prefixo)`), `src/editor-menu.ts` (Gerar…, `editor.generate`, `editor.compareClipboard`), `src/tab-menu.ts`; `src/main.ts` (abas conforme as configurações, limite de abas, marcadores ao renomear/mover).
- `src/keymap.ts` (`duplicateProfile`, `renameProfile`, `deleteProfile`, `profileList`, `baseProfile`; persistência de cópias) e `src/keymap-settings.ts/keymap.css` (diálogo de nome); `src/context-menu.ts` abre o menu dentro do diálogo modal ativo (antes ficava atrás dele e não recebia cliques).

### Validação

- `node scripts/check-editor-shell-2.mjs` (WebKit, escuro e claro; `--no-assert`, `--dump`, `--dark-only`): capturas em `.artifacts/editor-shell-2/` (depois) e `.artifacts/editor-shell-2/before/` (mesmo harness na base `2e4c790`, gravado antes das mudanças).
- `node scripts/check-editor-shell.mjs` (primeira rodada; ordem da aba atualizada e rótulo "Incorporar…" do plugin PHP atual), `node scripts/check-editor-chrome.mjs --webkit`, `npm run typecheck`, `npm run test:unit` (206 aprovados, 1 ignorado), `npm test` (Rust), `node scripts/check-locales.mjs`, `node scripts/check-architecture.mjs`.
- Não executado: `npm run test:native` (porta 1420 compartilhada; a coordenação roda no release).

## Limitações e diferenças conhecidas

- Breadcrumbs: estrutura por varredura própria (não usa o índice do Phpactor nem dos servidores de JS/TS); sem breadcrumbs de CSS, Twig, Vue e Blade; JS/TS não mostram callbacks nem métodos de objetos literais; formato do rótulo HTML e transparência de arrays/sequências são hipóteses.
- Problems: Inspect Code não roda as inspeções que o plugin PHP calcula só no editor ativo (literais/tipos próprios) em arquivos fechados, apenas o servidor PHP e os diagnósticos do canal de linguagem; sem perfil de inspeção, escopo, janela Inspection Results nem resultados por severidade além de erro em Erros do projeto; limite de 2000 arquivos e 512 KB por arquivo; sem "Server Problem", Vulnerable Dependencies, Qodana e abas de IA; sem autoscroll.
- Menus: o painel dividido mostra um documento (sem abas próprias); navegação, inspeções, breadcrumbs e ações do keymap seguem o editor principal; sem "Split and Move", Open Tab in New Window, Override File Type, AI, snippets/gists, Diagrams e menu do gutter. Marcadores: uma lista, sem janela Bookmarks e sem edição da descrição no lugar; F3 deixa de ser "Localizar próximo" do Monaco no editor (como no keymap macOS da referência). Gerar…/Executar/Depurar dependem de plugins: hoje nenhum plugin publicado oferece `generate.*` nem `*.debugContext`, então Gerar… fica desabilitado e Depurar não aparece; o PHP Tests oferece Executar. Comparar com a área de transferência com seleção mostra a seleção somente leitura. "Mark modified (*)" e demais opções de abas não reproduzidas.
- Keymap: cópia nomeada derivada só de keymaps embutidos (a cópia de uma cópia herda o mesmo pai embutido e copia as personalizações); exportação em JSON próprio (não XML); importação XML só mapeia ~35 ids públicos; atalhos de mouse e abreviações não suportados; o chord não expira por tempo.
- Nada foi comparado lado a lado com o PhpStorm de forma automatizada; as capturas da referência servem de oráculo visual manual.
