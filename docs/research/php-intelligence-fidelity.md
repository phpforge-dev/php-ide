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

## Rodada 2 (04/11/2026)

Commits locais no `main` do plugin (sem push, sem bump; versão 1.1.0): `e0b7a4b` (Change Signature),
`a2a781b` (argumentos entre arquivos), `8640dc3` (Configurações › Inspeções), `ba8d2f1` (Rename),
`547512a` (exclusão). Neste repositório: harness com 6 cenários novos e um gancho no menu da árvore
(`src/project-actions.ts`: `refactor.treeItems?(target)` acrescenta itens no fim do menu).

Fontes desta rodada: **DOC** consultada em 04/11/2026 —
[Change signature](https://www.jetbrains.com/help/phpstorm/change-signature.html) (Propagate Parameters, "Select Methods to Propagate New Parameters", Caller/Callee Method, Default só para chamadas de quem não foi propagado; "Create and initialize class properties" no construtor, campo com a visibilidade padrão do Code Generation, exemplo `private $q;`),
[Rename refactorings](https://www.jetbrains.com/help/phpstorm/rename-refactorings.html) ("Text occurrences": arquivos sem código-fonte),
[Configuring inspection severities](https://www.jetbrains.com/help/phpstorm/configuring-inspection-severities.html) (oito severidades, na ordem),
[Disabling and enabling inspections](https://www.jetbrains.com/help/phpstorm/disabling-and-enabling-inspections.html) ("Disable inspection" no ⌥⏎; alteradas em azul; "Show Only Modified Inspections"),
[Customizing profiles](https://www.jetbrains.com/help/phpstorm/customizing-profiles.html) (Project Default guardado no projeto),
[Configuring project structure](https://www.jetbrains.com/help/phpstorm/configuring-project-structure.html) ("Mark Directory As › Excluded"; excluídas ficam fora de busca, parsing e navegação),
[Project tool window](https://www.jetbrains.com/help/phpstorm/project-tool-window.html) ("Show Excluded Files" no menu de opções da janela).
**OBS**: nenhuma nesta rodada (a tela do PhpStorm não foi dirigida); os itens abaixo seguem a DOC e, onde ela cala, são **REQ** ou **hipótese**, marcados como tal.

### 1. Change Signature: propagação, propriedades e PHPDoc
Critérios: botão "Propagar parâmetros" só com parâmetro novo; janela "Selecionar métodos para propagar os parâmetros novos" com chamadores diretos, chamadores dos chamadores ao expandir e código do chamador/chamado (DOC); chamador marcado ganha os parâmetros no fim, as chamadas dentro dele passam a variável e as chamadas a ele recebem o "Padrão" (DOC); propagação em cadeia; conflito se o chamador já tem o nome ou é variádico; aviso de obrigatório depois de opcional. No construtor, "Criar e inicializar propriedades da classe" (marcada por padrão — hipótese): `private Tipo $x;` depois das propriedades existentes (ou no topo) e `$this->x = $x;` no fim do corpo; propriedade existente ou promovida não é duplicada. PHPDoc (REQ, a DOC não fala): tags `@param` seguem a ordem nova com continuações, removidas saem, renomeadas mudam, novas entram com o tipo ou `mixed`; sem tags, a nova entra antes da primeira tag ou do fecho.
Testes: 5 novos em `tests/refactor-methods.test.ts`; harness `change-signature-propagate` (diálogo, árvore, código, aplicação, ⌘Z, construtor).
Limites: a visibilidade da propriedade é sempre `private` (o PhpStorm usa a do Code Generation); chamadores que são closures ou código solto não aparecem; a árvore usa o mesmo cálculo de chamadas do Change Signature (família do Phpactor para métodos, referências para funções).

### 2. Inspeções de argumento entre arquivos
Critérios: funções (namespace atual e, como o PHP, o global), métodos por tipo inferido do receptor (`$var`, `$this`/`self`/`static`, `parent`, `Classe::`), herança pela hierarquia, `new Classe(...)` pelo construtor herdado, variádicos e argumentos nomeados; tipos dos parâmetros qualificados no arquivo que declara; buffer aberto sobrepõe a versão indexada; hierarquia incompleta não acusa; modo estrito decidido pelo arquivo que chama; correção "Converter 'x' para int" nos escalares; retorno de função de outro arquivo alimenta a inferência.
Implementação: `SignatureIndex` em `src/inspections.ts`, montado com os arquivos do projeto (fora as exclusões) e invalidado como a hierarquia.
Testes: `tests/inspections.test.ts` (caso novo); harness `inspections-cross-file` (marcadores, ⌥⏎, edição não salva do outro arquivo).
Limites: sem correção "alterar tipo do parâmetro" quando a declaração está em outro arquivo; receptor com mais de um tipo possível não é inspecionado; `use function` não é resolvido.

### 3. Configurações › Editor › Inspeções (PHP)
Critérios (DOC): ligar/desligar por inspeção e por grupo (caixa com estado misto), severidade com as oito opções na ordem da ajuda, alteradas destacadas, filtro por nome e "Só as alteradas", restaurar, Aplicar/OK; perfil "Padrão do projeto" guardado no projeto; "Desativar inspeção" no submenu do ⌥⏎ (DOC) e "Configurar inspeção…" (REQ). "Sem destaque (correção disponível)" tira o marcador e mantém a correção no ⌥⏎.
Implementação: `src/inspection-profile.ts`; `.php-ide/php-intelligence.json` → `inspections` só com o que difere (REQ; o PhpStorm usa `.idea/inspectionProfiles`). Ação "Configurações › Editor › Inspeções…" (id `settings.inspections`, sem atalho).
Mudança: conversões escalares com `strict_types` agora usam o id `PhpStrictTypeCheckingInspection` (erro), separado de `PhpIncompatibleReturnTypeInspection`/`PhpParamsInspection` — id por **hipótese** (mensagens diferentes observadas em P21–P23), a confirmar.
Limites: a tela é um diálogo do plugin, não uma página da janela de configurações do host (que hoje só tem Aparência); sem escopos, sem perfis da IDE nem cópia de perfil; sem alteração, cada caso mantém a severidade de origem (o Phpactor manda a sua).

### 4. Rename: ocorrências de texto e sugestões
Critérios: classes ganham "Ocorrências de texto" no popup ⌥⇧O, nos ícones em linha e no diálogo; procura em arquivos sem código (md, txt, rst, json, yaml, xml, twig, html, neon, ini…, fora `vendor`/`node_modules`/excluídos): FQN, FQN com `\\` e o nome curto como palavra (não em `Outro\Nome`, `$Nome` ou `NomeLista`) (DOC para o conceito; regras de casamento REQ). Sugestões (REQ/hipótese): propriedades pelo tipo declarado ou promovido; métodos acessores `return $this->x;` → `getX` (`isX` para bool), setter → `setX`, bool sem prefixo → `isNome`; classes pelo nome do arquivo e pelo sufixo da classe-mãe/interface (`Abstract`/`Base`/`Interface` removidos).
Correção encontrada no harness: no WebKit, clicar numa caixa do popup não a foca, então Esc/Enter paravam de funcionar; o foco agora volta ao popup.
Testes: `tests/rename-text.test.ts`; harness `rename-text`, `rename-class` e `rename-options` atualizados (dois ícones; três opções).
Limites: as sugestões do PhpStorm por uso e por IA não existem; ocorrências de texto não consultam o Phpactor.

### 5. Exclusão configurável
Critérios: "Marcar diretório como › Excluído" no menu da árvore (DOC); a pasta excluída e o conteúdo ficam marcados (nome e ícone em outra cor; REQ visual); dentro de uma pasta excluída, "Excluído" fica desabilitado; na raiz da exclusão aparece "Cancelar exclusão"; "Mostrar arquivos excluídos" (marcado por padrão) esconde/mostra os nós (DOC: "Show Excluded Files"); o Phpactor passa a usar a lista nova sem reiniciar a IDE.
Implementação: atributos `data-php-excluded`/`data-php-excluded-root` nos nós da árvore do host, observados por `MutationObserver`; `showExcluded` em `.php-ide/php-intelligence.json`. Nativo: gravar o arquivo pela IDE (ou editá-lo à mão — a data do arquivo é conferida a cada pedido) com lista diferente encerra o servidor; o próximo pedido o inicia com `indexer.exclude_patterns` novo e reindexação completa. O teste `exclusao_gravada_faz_o_phpactor_reler_a_lista` (ignorado por padrão; `PHPFORGE_TEST_PHP_TOOLS=<.tools>`) rodou com Phpactor real em 04/11: a classe da pasta excluída sai de `workspace/symbol`.
Limites: o PhpStorm põe "Show Excluded Files" no menu de opções do cabeçalho da janela Projeto; o host não tem esse menu, então o item fica no menu de contexto (com exclusões) e como ação. Só diretórios; sem "Mark as Plain Text"; a reindexação completa pode levar o tempo da indexação inicial.

### Validação da rodada
- Plugin: `npm test` (71), `cargo test` (10 + 2 ignorados), `cargo clippy --all-targets -D warnings`; teste com Phpactor real executado à parte.
- Host: `npm run typecheck`, `npm test` (41) e `cargo check` do `src-tauri` com o crate local por `--config patch` (sem mudar `Cargo.toml`; os métodos nativos agora são genéricos no runtime do Tauri e o host compila sem ajuste).
- WebKit: `node scripts/check-php-intelligence-fidelity.mjs` — 19 cenários, todos passando.
- Limitação anterior a esta rodada (reproduzida com a 1.1.0): a primeira ⌥⏎ dada ~300 ms depois de os marcadores aparecerem às vezes não abre o menu; a segunda abre. O harness espera 600 ms; a causa (cálculo do lightbulb do Monaco × provider assíncrono) não foi corrigida.
- Não executado: `npm run test:native` (o host fixa o plugin publicado) e observação do PhpStorm.

Nenhum item é promovido: todos seguem **Em desenvolvimento / não validados comparativamente**.
