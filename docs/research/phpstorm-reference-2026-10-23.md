# Referência observada do PhpStorm — 23/10/2026

Observação autorizada do PhpStorm licenciado do usuário, para (1) oracle dos casos C01–C06 do [plano de testes](phpstorm-compatibility-test-plan.md) e (2) referência visual para fidelidade de interface. Somente comportamento e aparência visíveis; nada foi lido de JARs, recursos, caches ou código do produto. Este documento é **evidência da referência**; não afirma nada sobre a nossa IDE.

## Perfil

| Item | Valor |
|---|---|
| Produto | PhpStorm 2026.1.4 (texto da tela Welcome), licença Trial |
| SO | macOS 26.3.1, tela Retina (capturas 2×) |
| Keymap | macOS (padrão; sem `keymap.xml` personalizado). Conflitos com o SO avisados pela IDE: `Find Action` (⌘⇧A) e outros 20; Ctrl+Espaço é capturado pela troca de fonte de entrada do macOS |
| Tema | Islands Dark (do usuário) e Islands Light (trocado só para captura e restaurado) |
| PHP language level | 8.2 (barra de status) |
| Projeto | cópia de `fixtures/php-intelligence` + `tests/` do `fixtures/php-tests/phpunit` + `docs/` do Markdown, repositório git próprio (`main`, `feature/reference`), `src/User.php` com uma linha `// changed` não commitada |
| Automação | AppleScript/System Events (teclas, AXPress) e `screencapture` por retângulo da janela |

## Artefatos

64 PNG em `.artifacts/phpstorm-reference/` (fora do repositório e do bundle, com `SHA256SUMS`; a Welcome contém nomes de projetos do usuário e **não deve ser publicada**). Cada imagem tem uma versão `.view.png` reduzida.

Visual Islands Dark: `01-welcome-dark`, `02-trust-dialog`, `03-workbench-initial-dark` (prévia Markdown dividida), `04-goto-file-popup`, `05-editor-php-user`, `06-search-everywhere-all`, `07-quick-doc`, `08-show-usages-popup`, `09-find-usages-toolwindow`, `10-goto-implementation`, `13-completion`, `14-rename` (inline), `15-intentions`, `16-terminal`, `17-problems`, `18-commit`, `19-git-log`, `21-structure`, `22-run`, `23-debug`, `24/25/26-settings-*`, `28-database-toolwindow`, `29-branches-popup`, `31-editor-context-menu`, `33-local-history` (diff lado a lado), `34-composer-json`, `35-quick-switch`, `36-theme-list`. Islands Light: `40`–`46`. Casos: `C01-*` a `C06-*`.

Não capturado (pendente): tela Plugins, popup de projetos recentes, Services/Docker (a captura pegou uma notificação pessoal e foi apagada), menu de contexto da árvore e das abas, merge de conflitos, resultados de testes PHPUnit, depurador em sessão, painel de agentes de IA.

## Oracle C01–C06 (fixture v1, `probe.php`)

| Caso | Entrada | Saída observada | Conclusão permitida |
|---|---|---|---|
| C01 | `$user->;` (linha 8), popup automático ao digitar `>` e ação Basic Completion | Lista na ordem: `label()` tipo `string`, `id()` tipo `int`; `secret` ausente; rodapé "Press ⏎ to insert, ⇥ to replace" (automático) / "Press ^Space again to see more variants" (Basic). Enter insere `label()` com o cursor entre `)` e `;`; Esc/undo restaura o texto | Conjunto obrigatório {label, id}, proibido {secret} na 1ª invocação; ordem label → id. **Segunda invocação bloqueada** (Ctrl+Espaço do SO) |
| C02 | ⌘B em `label` (8:9) | Abre `src/User.php`, cursor 9:21 (início de `label` na declaração); ⌘[ volta a `probe.php` | Destino declaração do método da classe concreta |
| C02 | ⌘B em `id` (9:9) | `src/HasId.php` 7:21 (trait) | Método via trait resolve ao trait |
| C02 | ⌘B em `Person` em `new Person()` (7:15) | Vai para o alias em `use Fixture\User as Person` (5:21), não para a classe | Alias é destino próprio |
| C02 | ⌘B no próprio alias (5:22) | Como já é declaração, salta para o único uso (7:13) com dica "It's the only usage in Project Files · Find Options… (⌥⇧⌘F7)" | Declaration-or-usages com uso único navega direto |
| C03 | ⌥F7 / ⌘⌥F7 em `User::label` | Diálogo "Method 'label()' of class 'User' implements method in 'Named'. Do you want to find usages of base method?" [Cancel] [Current Method] [Base Method], "Don't ask again". Resultado: **4 usos** em `probe.php` linhas 8, 11 (`$admin`), 18 (`$value` tipado `Named`), 32 (`$inferred`); excluídos 13 (`Unrelated`) e 14 (string) | Conjunto {8, 11, 18, 32}. A escolha "Base Method" mostrou o mesmo título/conjunto; não confirmamos se o botão foi realmente acionado (**incerto**) |
| C04 | ⌘⌥B no método de `Named` | Popup "Choose Implementation of Named \Fixture.label (2 found)": Admin, User | {Admin, User}; Unrelated excluído |
| C04 | ⌘⌥B em `$value->label()` (18) | "(3 found)": Admin, Named (abstrato), User | Na chamada inclui a declaração abstrata |
| C04 | ⌘⌥B em `Admin::label` (antes) | Salta direto, sem popup, quando há um destino | Destino único navega direto |
| C05 | `$inferred->` (32) | `label()` string, `id()` int | `@template T` de `identity()` inferiu `User` |
| C05 | `$nullable->` dentro de `instanceof User` (35) | `label()`, `id()` | Estreitamento por `instanceof` |
| C05 | Ctrl+J em `$nullable` (33) | `$nullable: User\|null` | Tipo união exibido |
| C06 | ⇧F6 em `User::label` | Rename inline com sugestões de nome (ícone de IA); ⇧F6 de novo abre diálogo "Rename Method 'label' and its usages to:", caixas "Search in comments and strings" e "Search for text occurrences" desmarcadas, Scope "Project Files", [Cancel] [Preview] [Refactor] | — |
| C06 | `displayName` + Preview | Painel "Refactoring Preview": "Method to be renamed to displayName" → `label` em User, Named e Admin; "[In Code] References… Method call 4 results". Nada gravado no disco (git limpo) | Rename renomeia a hierarquia inteira sem perguntar; Unrelated e string ficam fora com opções desmarcadas. Aplicar/undo **não executado** |

Uma execução por caso (o plano pede três). Valores de posição lidos da barra de status.

## Notas visuais (Islands Dark)

Observação de screenshots; valores numéricos de cor vêm dos tokens públicos em `design/reference/islands/` (ver `SOURCE.md`).

- **Shell:** cantos arredondados nas "ilhas" (painel do projeto, editor, janelas inferiores) separadas por calha escura; barra superior com widget do projeto (avatar quadrado colorido com iniciais), widget de branch, configuração de execução "Current File", Run/Debug, menu ⋮, IA, busca e engrenagem; faixas laterais de ícones (esquerda: Project, Commit, Structure, …; inferior esquerda: Services, Debug, Run, Find, Terminal, Problems, Git; direita: notificações, IA, Database, …).
- **Status bar:** breadcrumbs à esquerda (`projeto › src › User.php › User › label`), à direita "PHP: 8.2", posição "9:22 (5 chars)", LF, UTF-8, "4 spaces", cadeado, selo "Trial".
- **Abas:** pílula arredondada com fundo azulado na ativa, ícone por tipo, × só na ativa/hover; sem bordas inferiores.
- **Editor:** inlays cinza acima das declarações ("5 usages · 1 inheritor · Ref"), ícones de gutter (implementa/sobrescreve) ao lado do número, lâmpada amarela, barra de breadcrumbs inferior, faixa de erros à direita com contador (⚠1 ˄ ˅), guia vertical de margem.
- **Popups:** fundo levemente mais claro que o editor, borda fina, raio grande, item selecionado em pílula azul (`#2E436E` aprox.), rodapé com dica e "Next Tip"; Search Everywhere com abas All/Classes/Files/Symbols/Actions/Text, "Include non-project items", rodapé com caminho e "Open In Right Split".
- **Diálogos:** botões arredondados, primário azul preenchido, foco com anel azul; ícone de alerta/pergunta à esquerda; mnemônicos sublinhados.
- **Tool windows:** cabeçalho com título em negrito + abas em pílula, ícones de ação à direita (⋮, —); árvores com chevrons finos e contagens em cinza.
- **Light:** mesma geometria; superfícies brancas/cinza-claro, seleção azul clara, sintaxe do esquema claro.
