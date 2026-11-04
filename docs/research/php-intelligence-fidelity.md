# PHP Intelligence — fidelidade ao PhpStorm (03–04/11/2026)

Trabalho no plugin `phpforge.php-intelligence` (repositório `plugin-php-intelligence`, commits locais
`b35465b`, `b568811`, `cd08d05`, `a0ec5d0`, `da22f3a`, sem push nem versão nova) e harness WebKit
`scripts/check-php-intelligence-fidelity.mjs` neste repositório.

## Fontes e separação das evidências

- **DOC** (documentação pública da JetBrains, consultada em 03/11/2026):
  [Navigating through the source code](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html) (F2/Shift+F2: "places the caret immediately before the code issue"; modos "Problems with Highest Priority" e "All Problems"),
  [Rename refactorings](https://www.jetbrains.com/help/phpstorm/rename-refactorings.html) (modo "In the editor" padrão, ícones "Rename in comments and strings"/"Rename in text occurrences", Tab abre popup com as duas opções, "More options"/Shift+F6 abre o diálogo),
  [Inline](https://www.jetbrains.com/help/phpstorm/inline.html) (três opções do diálogo, Ctrl+Alt+N / ⌥⌘N),
  [Change signature](https://www.jetbrains.com/help/phpstorm/change-signature.html) (Name, Return type, colunas Type/Parameter/Default, "Default" é o valor escrito nas chamadas, Preview/Refactor, Ctrl+F6 / ⌘F6),
  [Auto import](https://www.jetbrains.com/help/phpstorm/settings-auto-import.html) ("Insert imports on paste": All / Ask / None),
  [PHP type checking](https://www.jetbrains.com/help/phpstorm/php-type-checking.html).
- **OBS autorizada (04/11/2026)**: PhpStorm 2026.1.4, Islands Dark, projeto descartável `obs-project` (PSR-4 `App\\` → `src/`), capturas `P0`–`P23` em `.artifacts/phpstorm-reference/` (locais). Anteriores: `14-rename` e `15-intentions`.
- **REQ próprio**: textos em português, visual dos popups, mensagens das inspeções, recusas explícitas fora do recorte, arquivo de configuração `.php-ide/php-intelligence.json`.
- **Hipóteses (ainda sem OBS)**: rename de classe com arquivo homônimo (a opção "Renomear arquivo" no popup é nossa); qualificar com FQN quando o nome curto colado está ocupado (o PhpStorm oferece a coluna "Replace with Alias from Target Scope", não observada com conteúdo); Inline de método não estático por receptor externo; propagação de parâmetros.

## Observado no PhpStorm (04/11/2026) e ajustado

| Captura | Observado | Ajuste no plugin (`ee7f83a`) |
|---|---|---|
| P2–P4 | F2 põe o cursor no início do problema e volta ao início; com avisos, os avisos fracos são pulados; tooltip **abaixo** da linha: mensagem + ⋮, depois a correção principal com ⌥⇧⏎ e "More actions… ⌥⏎" | tooltip abaixo, ⋮ abre o submenu da inspeção, "Mais ações…" |
| P2, P22 | a faixa de "tipo de retorno" é a instrução `return …;` inteira | faixa e cursor no `return` |
| P1, P21–P23 | sem `strict_types`, `return 'many'` em `int` e `take('x')` não são acusados; com `strict_types` viram **erro** ("Return value must be of type 'int', 'string' returned"; "Expected parameter of type 'int', 'string' provided", correção "Cast 'x' to int") | conversões escalares só em modo estrito, como erro; correção "Converter 'x' para int"; array→int continua aviso |
| P2 | classes: aviso "Return value is expected to be '\\App\\Model\\User', '\\App\\Model\\Circle' returned", correção "Change return type from '…' to '…'" | mensagens e títulos com FQN; o código recebe o nome curto importado |
| P5–P7 | ⌥⏎ mostra só as correções; supressões ("Suppress all for file", "Suppress for file", "Suppress for method", "Suppress for statement"…) ficam num submenu com o nome da inspeção | um item "Suprimir '…'…" no fim abre o submenu (todas no arquivo / no arquivo / na instrução) |
| P3, P6, P8, P9 | classe indefinida é aviso; a correção é "Create class" e abre "Create New PHP Class" (Name fixo, Namespace, File name, Directory, Template, Extends/Implements); o arquivo de `new Invoice()` ganha `__construct()` e é aberto | "Criar classe" abre o diálogo equivalente (sem Template/Implements); construtor a partir de `new` |
| P10–P11 | rename de método: nome em caixa, outras ocorrências em verde, ícones `//` `≡` em linha empurrando o texto, lookup com o nome atual e "Press ⌥⇧O to show options popup"; ⌥⇧O abre "Also rename in:" (Comments and strings, Text occurrences, "More options… ⇧F6"); **Tab aceita o item do lookup e conclui** | ícones como inlay, verde, lookup sempre com o nome, Tab conclui, popup com título e ícones |
| P14–P15 | variável: sem ícones nem popup; lookup com sugestões e "Press ⏎ or ⇥ to replace" | rodapé "Pressione ⏎ ou ⇥ para substituir" |
| P16 | "Inline Method Refactoring", "Method Cart::price", três opções; a terceira desabilitada na declaração | igual |
| P17–P18 | Change Signature: Visibility, Return type, Name; lista de parâmetros; "+" adiciona no fim com editor Type/Parameter (`$`)/Default; "Signature Preview" multilinha | visibilidade, ordem do cabeçalho, prévia multilinha; a lista continua uma tabela editável |
| P19–P20 | colar código com classe não importada abre "Select Classes To Import" (Reference / Replace with Alias from Target Scope) — **Ask é o padrão** — e insere `use` após o namespace | diálogo equivalente; padrão Ask confirmado |

Diferenças que ficam: a lista de sugestões do rename do PhpStorm inclui nomes por uso e por IA; o diálogo de criar classe não tem Template/Implements; o Change Signature do PhpStorm edita um parâmetro por vez em linha, o nosso mostra a tabela inteira; o menu do ⌥⏎ do Monaco agrupa por tipo; o submenu de supressão não tem "Suppress for method", "Disable inspection" nem "Run inspection on…".

Mesmo com a observação, nenhum item é promovido a compatível: todos seguem **Em desenvolvimento / não validados comparativamente**.

## Critérios e o que foi implementado

### 1. F2 / Shift+F2
Critérios: cursor imediatamente antes do problema; volta ao início/fim do arquivo; modo padrão visita só a maior severidade presente, modo "todos" para em cada um (hints não contam); mesma posição é uma parada; tooltip compacto sem o peek do Monaco; Esc, digitar ou mover o cursor fecham; ⌥⇧⏎ aplica a correção principal.
Implementação: `src/ui/problem-navigation.ts` (lógica pura testada) e ação `editor.nextProblem`/`previousProblem`. Alternância do modo pela ação "Alternar navegação de problemas" (o PhpStorm usa o clique direito no marcador da faixa; o widget de inspeções é do host e não foi alterado).

### 2. Rename in-place
Critérios: Shift+F6 edita o nome no editor; demais ocorrências do arquivo acompanham; lookup com o nome atual e sugestões; ícones de opções ao lado do nome; Tab/⌥⇧O abrem o popup (Comentários e strings, Ocorrências de texto, Renomear arquivo para classe com arquivo homônimo, Mais opções); Shift+F6 de novo abre o diálogo; Enter aplica como um só passo de desfazer; Esc restaura; conflito abre a prévia existente com o bloqueio.
Implementação: `src/ui/inplace-rename.ts`. A edição ao vivo é prévia; ao concluir, o buffer volta ao original e a refatoração real é aplicada (classes pelo motor próprio, métodos pela família, demais pelo Phpactor). Ocorrências do arquivo vêm de um plano feito com nome sentinela. Opção para voltar aos diálogos modais.
Limites: sugestões de nome só para variáveis (pelo tipo); variáveis locais sem opções; "ocorrências de texto" para classes não existe no motor (só comentários/strings).

### 3. Inline Method e Change Signature
Critérios Inline: na declaração, "todas e remover"/"todas e manter"; na chamada, também "só esta"; parâmetros substituídos ou atribuídos; locais em colisão renomeados; `$this` vira o receptor; recusas com motivo (vários `return`, recursão, referência, spread, `$this`/`self` fora da classe); chamadas não incorporáveis mantêm o método com aviso na prévia.
Critérios Change Signature: Nome, Tipo de retorno, tabela Tipo/Parâmetro (`$nome = padrão`)/Padrão (valor nas chamadas), adicionar/remover/reordenar, prévia da assinatura, validação (obrigatório após opcional, duplicados); chamadas reconstruídas (nomeados preservados, opcionais omitidos recebem o padrão, valor ausente vira conflito); parâmetros renomeados no corpo, em strings interpoladas e no PHPDoc; removidos ainda usados viram aviso.
Implementação: `src/refactor-methods.ts`; chamadas pela família de métodos (Phpactor + tipos locais) ou referências de função.
Limites: sem "Propagate Parameters" nem "Create and initialize class properties"; PHPDoc não é reordenado nem ganha `@param` novo; Inline de método chamado por receptor complexo é mantido; documentação diz que métodos não estáticos não podem ser incorporados — nossa implementação permite (hipótese a observar).

### 4. Inspeções (TOOL-INSPECT-001)
Critérios: tipos inferidos de `new`, variáveis, parâmetros tipados, `$this`, chamadas com retorno declarado, ternário e `match`; classes comparadas pela hierarquia do projeto; hierarquia incompleta não gera aviso; correção "Alterar tipo de retorno/do parâmetro"; ⌥⏎ com correções da inspeção primeiro e supressões por último; "Criar classe/interface/trait" no caminho PSR-4 (ou ao lado do arquivo) abrindo o arquivo novo, desfazer remove; correções de plugin que criam arquivo (Laravel) oferecidas.
Implementação: `src/inspections.ts`; transação nativa com `create`/`delete` confinados ao projeto, rollback e revisão no histórico local (`native/src/lib.rs`).
Limites: argumentos só para funções/métodos do próprio arquivo; Monaco agrupa o menu por tipo (refatorações aparecem em grupo próprio depois das correções); sem painel de resultados nem perfil.

### 5. Lacunas do motor
- `@template` em função: `T`, `?T`/`T|null`, `class-string<T>`, `T[]`/`array<K, T>`/`list<T>`, limite `of`, receptor encadeado `identity(...)->`.
- `match`: união dos braços, `throw` ignorado; braço desconhecido torna o tipo desconhecido.
- Definição de membro pelo tipo local quando o Phpactor não responde (GEN-IDENTITY, TYPE-MATCH); completion já usava o tipo local.
- Autoimport ao colar: Ask (padrão), All, None; só para trechos copiados na IDE com classes resolvidas na origem; nome ocupado vira FQN.
- Exclusão configurável: `.php-ide/php-intelligence.json` (`excluded`), editável pela ação "Análise PHP: pastas excluídas e importações ao colar…"; afeta índice de classes, hierarquia, inspeções, refatorações e, no próximo início do servidor, `indexer.exclude_patterns` do Phpactor.
Limites: exclusão não marca a árvore nem esconde arquivos; sem tela de Settings própria (a configuração é por ação do editor); o Phpactor só relê a lista ao reiniciar.

## Validação

- Plugin: `npm test` (58 testes) e `cargo test`/`cargo clippy -D warnings` em `native/`.
- WebKit (motor do WebView do macOS), API simulada e plugin do checkout local:
  `node scripts/check-php-intelligence-fidelity.mjs [--plugin=dir] [--only=…] [--shots]` — 13 cenários (f2, rename-class, rename-escape, rename-variable, rename-options, rename-conflict, inline-method, change-signature, inspections, create-class, plugin-create-fix, paste-imports, exclusions). Capturas em `.artifacts/php-intelligence-fidelity/`.
- Não executado: `npm run test:native` (janela Tauri real), porque o host fixa o plugin publicado; a validação nativa depende do release do plugin. A transação com criação de arquivo exige o crate nativo novo no host.
