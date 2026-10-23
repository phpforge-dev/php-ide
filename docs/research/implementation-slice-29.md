# Fatia 29 — Validação comparativa C01–C06 na janela Tauri real

Objetivo: executar os roteiros C01–C06 do [plano de compatibilidade](phpstorm-compatibility-test-plan.md) na **nossa** IDE (janela Tauri real, mesma fixture e estado do oracle), comparar caso a caso com o [oracle do PhpStorm](phpstorm-reference-2026-10-23.md) e corrigir as divergências.

## Separação de fontes

- **Evidência da referência**: somente a tabela "Oracle C01–C06" de `phpstorm-reference-2026-10-23.md` (PhpStorm 2026.1.4, macOS, uma execução por caso). Nenhuma nova observação do PhpStorm foi feita nesta fatia.
- **Teste da nossa IDE**: `.artifacts/compare-p0.json` (3 repetições) e screenshots `.artifacts/compare-p0/*.png`, produzidos por `node scripts/check-native.mjs --compare-p0 --no-db`.
- **Requisito próprio**: comportamento implementado para alinhar com o observado (ex.: pergunta método atual/base, chooser de implementações). Textos, layout e algoritmos são próprios.
- **Hipótese**: regras gerais inferidas de um único exemplo da referência estão marcadas como tal (ver "Limitações"). Um caso "compatível neste perfil" **não** promove a família inteira no catálogo/matriz.

## Harness

- `src/compare-p0.ts`: roteiros C01–C06 com os gestos de teclado da referência, despachados no elemento focado (keymap em captura e depois Monaco; os eventos sintéticos levam `keyCode` porque o Monaco resolve atalhos por ele). Cada caso grava um registro estruturado; cada registro também sai pelo arquivo de progresso, então um tempo esgotado deixa `.artifacts/compare-p0.partial.json`.
- `src/native-smoke.ts`: com `docker.compareP0` roda só o harness e reporta.
- `scripts/check-native.mjs --compare-p0`: projeto temporário a partir de `fixtures/php-intelligence`, sem bancos (`--compare-p0` implica não subir containers), relatório em `.artifacts/compare-p0.json`, `PHP_IDE_COMPARE_REPS` (padrão 3). Screenshots por **ID da janela** (`screencapture -l`, janela "PHP IDE" do PID do app): capturam só a janela da IDE, mesmo encoberta.
  - Incidente corrigido durante a fatia: a primeira versão capturava um retângulo da tela (`-R`) e, com a janela encoberta, gravou conteúdo de outro aplicativo do usuário. As imagens foram apagadas na hora e o modo foi trocado para captura por janela.
- Repetições: 3, no mesmo processo, restaurando `probe.php` a cada caso (sem salvar). A 1ª repetição é a fria (Phpactor e índice próprio recém-iniciados).

## Perfis

| Item | Referência (oracle) | Nossa IDE |
|---|---|---|
| Produto | PhpStorm 2026.1.4 Trial | php-ide 0.2.0, build debug + Vite (`check-native.mjs`), Tauri 2/WKWebView |
| SO | macOS 26.3.1 | o mesmo host |
| Keymap | macOS padrão do PhpStorm | perfil próprio "Padrão macOS" |
| Motor PHP | próprio do PhpStorm, PHP level 8.2 | Phpactor (patch local) + camadas próprias em `src/native-language.ts` |
| Fixture | `fixtures/php-intelligence` + extras (tests/, docs/), git | `fixtures/php-intelligence` + arquivos do smoke (SmokeTest.php, notas .md), git |
| Execuções | 1 por caso | 3 por caso |

## Resultado caso a caso

| Caso | Referência | Nossa IDE (3/3 repetições salvo nota) | Resultado |
|---|---|---|---|
| C01 popup automático (`>`) | `label()` string, `id()` int; rodapé "Press ⏎ to insert, ⇥ to replace" | `label ()` string, `id ()` int; rodapé do Monaco "Insert (⏎) · Show More (⌃Space)" | Conjunto {label,id}, `secret` ausente e ordem: **compatível neste perfil**. Rodapé: **diferença aceita** (texto/ações próprios do Monaco; Tab/replace não exposto no rodapé) |
| C01 Basic (Ctrl+Espaço) | mesma lista; "Press ^Space again to see more variants" | mesma lista; mesmo rodapé do automático | Lista **compatível**; 2ª invocação (ampliação) **bloqueada** na referência (Ctrl+Espaço capturado pelo macOS) — não comparada |
| C01 aceitar/cancelar | Enter insere `label()`, cursor entre `)` e `;`; Esc/undo restaura | `$user->label();`, cursor 8:15 (entre `)` e `;`); undo e Esc restauram `$user->;` | **Compatível neste perfil** |
| C02 ⌘B em `label` / ⌘[ | `src/User.php` 9:21; volta a `probe.php` | 9:21; Voltar (⌥←) retorna a 8:9 | **Compatível**; atalho de Voltar difere (ver Limitações) |
| C02 ⌘B em `id` | `src/HasId.php` 7:21 | 7:21 | **Compatível** |
| C02 ⌘B em `Person` (`new Person()`) | alias em `use … as Person` 5:21 | 5:21 | **Compatível** (corrigido nesta fatia) |
| C02 ⌘B no alias com uso único | salta para 7:13 com dica "It's the only usage in Project Files…" | salta para 7:13 com dica própria "É o único uso nos arquivos do projeto · Encontrar usos (⌥F7)" | **Compatível** (corrigido); texto da dica próprio |
| C03 ⌥F7 em `User::label` | diálogo "implements method in 'Named'… usages of base method?" [Cancel][Current Method][Base Method]; 4 usos {8,11,18,32}; 13 e 14 fora | diálogo próprio com Cancelar/Método atual/Método base. **Base**: {8,11,18,32}; **Atual**: {8,11,32}; 13 e 14 fora | Base: **compatível neste perfil**. Atual: **diferença não verificável** — o oracle não confirmou qual botão produziu {8,11,18,32} |
| C04 ⌘⌥B em `Named::label` | "Choose Implementation of Named \Fixture.label (2 found)": Admin, User | "Escolher implementação de Fixture\Named::label (2 encontradas)": Admin, User | **Compatível**; formato do título próprio |
| C04 ⌘⌥B em `$value->label()` | "(3 found)": Admin, Named (abstrato), User | "(3 encontradas)": Admin, Named (abstrato), User | **Compatível** (corrigido) |
| C04 destino único | salta direto sem popup | `$admin->label()` salta direto para `src/Admin.php` 7:21; em `Admin::label` (declaração sem subtipos) mostra "Nenhuma implementação…" | `$admin->label()`: **compatível**. Declaração sem subtipos: **diferença não verificável** (oracle ambíguo sobre o ponto de invocação) |
| C05 `$inferred->` | `label()` string, `id()` int | `label` string, `id` int | **Compatível** (corrigido; o Phpactor tipa `$inferred` como `T` e não listava nada) |
| C05 `$nullable->` em `instanceof` | `label()`, `id()` | `label`, `id` | **Compatível** |
| C05 tipo de `$nullable` | Ctrl+J: `$nullable: User\|null` | hover: `variable nullable: User\|null` | Tipo **compatível**; ação diferente (não há Quick Documentation/Ctrl+J; usamos hover) — **diferença aceita** |
| C06 ⇧F6 em `User::label` | rename inline; ⇧F6 de novo abre "Rename Method 'label' and its usages to:" com "Search in comments and strings" e "Search for text occurrences" desmarcadas, Scope, [Cancel][Preview][Refactor] | diálogo direto "Renomear o método 'label' e seus usos para:", as duas opções desmarcadas, nota "Hierarquia: Named, User, Admin", [Cancelar][Visualizar][Refatorar] | Opções e padrão: **compatível**. Sem rename inline nem Scope: **diferença aceita** |
| C06 prévia `displayName` | "Method to be renamed": User, Named, Admin; "References… Method call 4 results"; nada gravado | 7 ocorrências: declarações em Named/User/Admin + chamadas `probe.php` 8, 11, 18, 32; Unrelated e string fora; disco inalterado ao cancelar | Conjunto: **compatível neste perfil**. Agrupamento por arquivo em vez de por categoria: **diferença aceita**. Aplicar/undo não comparados (referência não executou) |

## O que mudou no código

- **Alias de import** (`shared/language/php-source.ts`: `importAliases`, `aliasUsages`, `aliasAt`): uso de `C` em `use A\B as C` vai ao alias; o alias é declaração própria (`src/php-navigation.ts`) e seus usos são só os do arquivo (`src/native-language.ts`, definition/references).
- **⌘B = Declaration or Usages** (`src/main.ts`): o botão/atalho de declaração em PHP usa a mesma rotina do ⌘+clique (antes ia ao `revealDefinition` do Monaco); numa declaração com **um** uso navega direto e mostra a dica (`src/editor-usages.ts`, opção `single: 'jump'`). O cursor pousa no **nome** declarado (o Phpactor devolve o nó inteiro, ex. `public function…`, que deixava o cursor em 9:5).
- **Hierarquia de métodos** (`shared/language/php-method-family.ts`): família (bases, subtipos que declaram o método), implementações a partir de declaração ou chamada.
- **Tipos locais mínimos** (`shared/language/php-local-types.ts`): última atribuição `$v = …` antes do ponto, com `new X()` (imports/alias), `null`, ternário (união) e função identidade com `@template T`/`@param T`/`@return T`. Usado para: hover de variável quando há união ou o servidor só tem `T`; receptor de completion `->`; chamadas `$v->m()` que o servidor não encontra.
- **Camada em `src/native-language.ts`** (sobre o Phpactor): completion `->` ordena membros do próprio tipo primeiro e mostra o tipo de retorno (lido do código, `PhpMethod.returnType` novo em `php-hierarchy.ts`), e lista membros quando o servidor não lista; `methodFamily`, `methodUsages(current|base)` (união das referências do Phpactor em cada declaração da família + chamadas com tipo local), `methodRename` (família inteira, opções de comentários/strings e texto em arquivos não PHP). Expostos em `src/native.ts` como `phpMethodFamily`/`phpMethodUsages`/`phpMethodRename`.
- **UI**: pergunta método atual/base e chooser de implementações (`src/editor-usages.ts`), ligados em `src/main.ts` (usos via ⌥F7/⌘B; CodeLens continua sem pergunta, método atual); rename de método com as duas opções (`src/refactor-ui.ts`, `renameMethod`). Strings novas em `src/locales/en.json`.
- **Smoke existente** (`src/native-smoke.ts`): "Classes, interfaces…" — `Person` vai ao alias (depois ⌘+clique em `User` no import) e `State` (uso único) navega direto; "Referências: Cmd+clique na declaração…" responde "Método atual" à nova pergunta antes de ler os usos.

## Testes

- Novos: `tests/php-method-family.test.ts`, `tests/php-local-types.test.ts`; caso de alias em `tests/php-navigation.test.ts`.
- Executados: `npm run typecheck`; `npm test` (Rust, 62 ok/5 ignorados); `node --import tsx --test` de php-navigation, php-method-family, php-local-types, php-hierarchy, refactor-php, keymap, plugins, laravel-eloquent (57 ok); `npx tsx scripts/check-php-semantics.ts` (37 casos, nenhum critério obrigatório falhou); `node scripts/check-locales.mjs`; `check-native.mjs --compare-p0 --no-db` (3 repetições, `ok: true`). Smoke nativo completo `check-native.mjs --no-db`: 27 checks ok, 1 falha — "Docker CLI sintético… Services não redimensionou", no redimensionamento do painel (`tool-window.ts`/CSS, em reescrita paralela pela sessão islands-foundation), sem relação com esta fatia. Bancos (`--no-db`) não executados nesta fatia.

## Limitações e diferenças registradas

- **Uma execução da referência** por caso contra três nossas; a referência não aplicou rename nem undo, e a 2ª invocação de completion está **bloqueada** (Ctrl+Espaço do macOS).
- **C03 "Método atual"**: o oracle é incerto sobre o botão; adotamos "atual = método e quem o sobrescreve" (requisito próprio). Precisa de nova observação.
- **Voltar**: a referência usou ⌘[; no perfil próprio "Padrão macOS" Voltar é ⌥← (⌘[ só no perfil inspirado no JetBrains). Não alterado aqui (keymap é de outra sessão; `workbench.ts` está sendo reescrito).
- **Ordem do completion**: "membros declarados no próprio tipo antes de herdados/trait" é **hipótese** derivada de um único exemplo (label antes de id).
- **Tipos locais** cobrem só os padrões acima, sem fluxo de controle (última atribuição textual), sem bounds, `class-string<T>`, coleções, templates de classe ou métodos genéricos. Sucesso no `identity()` **não** valida generics.
- **Família de métodos** usa o índice léxico próprio (sem vendor nos textos pesquisados para chamadas; hierarquia inclui vendor). Chamadas dinâmicas, `__call` e receptores sem tipo ficam fora.
- **Busca em texto** do rename usa palavra inteira em arquivos `.md/.txt/.json/.yaml/.xml/.twig/.html/.neon/.ini`; sem escopo configurável.
- **Sem Quick Documentation (Ctrl+J)** nem rename inline; prévia agrupada por arquivo.
- Cold start: a 1ª completion do processo esperava o índice próprio (11 s numa repetição); agora espera no máximo 1,5 s e cai para a lista do servidor; o índice é pré-aquecido na 1ª consulta PHP.
- Observado fora do escopo: para o trait `HasId`, as referências do Phpactor trazem os usos da classe `User` (6 resultados em vez de 1 `use HasId;`); o smoke continua só exigindo `User.php` na lista.
- Observado fora do escopo: dezenas de processos `phpactor.phar language-server` órfãos de execuções anteriores (de outras sessões e do app empacotado) seguem vivos no host; não foram encerrados aqui.
