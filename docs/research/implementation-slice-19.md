# Recorte 19 — Rename Symbol, Autoimport, Inspeções e Extract/Inline — 23/10/2026

Famílias: PHP-RENAME-001, PHP-IMPORT-001, TOOL-INSPECT-001, TOOL-REFACTOR-001. Nenhuma recebeu validação comparativa com o PhpStorm neste recorte; tudo abaixo é requisito próprio verificado nos nossos testes.

## Separação de fontes

- **Evidência documental (DOC):** ajuda pública do PhpStorm para [rename](https://www.jetbrains.com/help/phpstorm/rename-refactorings.html), [auto-import](https://www.jetbrains.com/help/phpstorm/settings-auto-import.html), [type checking](https://www.jetbrains.com/help/phpstorm/php-type-checking.html), [extract method](https://www.jetbrains.com/help/phpstorm/extract-method.html) e [supressão de inspeções](https://www.jetbrains.com/help/phpstorm/disabling-and-enabling-inspections.html). Daí vêm só os atalhos (Shift+F6, Alt+Enter, Ctrl+Alt+M/V/N, ⌥⌘M/V/N no macOS, Ctrl+Alt+Shift+T/⌃T, F2/Shift+F2), a existência de prévia, opção "comentários e strings" e o formato público `/** @noinspection Id */`.
- **Observação autorizada do PhpStorm:** nenhuma neste recorte.
- **Requisito próprio (REQ):** diálogos, textos, algoritmo de resolução de nomes, transação, desfazer global, regras de recusa de Extract/Inline e inspeções.
- **Hipótese:** os identificadores `PhpIncompatibleReturnTypeInspection`, `PhpUndefinedClassInspection`, `PhpParamsInspection` etc. foram escolhidos para que `@noinspection` escrito no PhpStorm também funcione aqui; a correspondência exata dos nomes não foi verificada.
- **Servidor de linguagem (Phpactor):** comportamento medido do Phpactor fixado do projeto, não evidência sobre o PhpStorm. Medido com cliente LSP próprio em projeto descartável: `prepareRename`/`rename` funcionam para variáveis e métodos (vários arquivos); **rename de classe devolve `documentChanges: []`** e `workspace/willRenameFiles` falha ("no class name candidates") sem `vendor/composer`; referências de classe omitem `use`. `codeAction` oferece `import_class` via comando `name_import`, cujo resultado chega como `workspace/applyEdit`; publica diagnósticos `worse.unresolved_name` com versão.

## Arquitetura

- `src-tauri/src/language.rs`: novos métodos restritos `textDocument/prepareRename`, `textDocument/rename` (nome validado), `textDocument/codeAction`, `workspace/executeCommand` (lista fechada de comandos que só editam; `create_class` fica fora) e `php/diagnostics` (último `publishDiagnostics` com flag `current` pela versão). O handler de requisições do servidor captura `workspace/applyEdit` em memória e responde `applied:true` sem escrever: a edição volta à interface como prévia. Requisições aceitam `documents` para sincronizar buffers abertos não salvos antes de renomear. `Language::apply` (IPC `languageApply`, registrado em `main.rs`) grava uma refatoração como transação: valida confinamento e hash de **todos** os arquivos antes de escrever, grava revisões "Antes de refatorar: …" no histórico local, escreve atomicamente (tmp + rename) e, se uma escrita falhar, restaura as já gravadas; depois fecha no servidor os documentos regravados.
- `src/refactor-php.ts` (motor próprio, sem Monaco): itens léxicos com nomes qualificados; modelo por arquivo com namespaces, `use` (simples, agrupados, alias explícito/implícito), declarações, funções/métodos (parâmetros tipados, tipo de retorno, corpo) e referências de classe em `new`, `extends`/`implements`, `instanceof`, `catch`, `::`, tipos de parâmetro/retorno/propriedade, `use` de trait, atributos e PHPDoc (`@param`, `@return`, `@var`, `@throws`…). Cada nome é resolvido para FQN pelo namespace e imports do arquivo, o que preserva homônimos de outros namespaces.
- `src/refactor-ui.ts`: diálogos, prévia, transação/desfazer, marcadores, code actions e atalhos; `src/refactor.css`. `main.ts` monta o módulo; `project-actions.ts` usa-o na árvore.

## PHP-RENAME-001

- Shift+F6 no editor PHP (ou menu de contexto / Refatorar isto). Classe/interface/trait/enum: motor próprio sobre todos os PHP do projeto (sem `vendor`; buffers abertos valem sobre o disco). Membros e variáveis: `prepareRename` + `rename` do servidor.
- Diálogo: novo nome com validação ao digitar (identificador; classe já existente no namespace bloqueia), "Também em comentários e strings (FQN)" (desligado por padrão: opção explícita) e "Renomear o arquivo X.php" quando o arquivo tem o nome da classe. Botões Cancelar / Visualizar / Refatorar.
- Prévia exata: árvore arquivo → ocorrência com linha, trecho removido/inserido e caixa para excluir cada ocorrência; diff lado a lado do arquivo com as escolhas atuais; conflitos (vermelho) bloqueiam, avisos (amarelo) abrem a prévia automaticamente. Esc/Cancelar não altera nada (testado).
- Conflito de import: se o arquivo já importa outro `Account` e renomeamos `User`→`Account`, o import vira `use App\Model\Account as User;` e os usos ficam intactos.
- Aplicação: arquivos sem buffer ou com buffer limpo vão para a transação em disco; buffers com alterações não salvas recebem a edição em memória (continuam sujos). Arquivo renomeado depois do texto, pela mesma rotina da árvore (abas e histórico acompanham).
- Desfazer: aviso com botão "Desfazer", ação "Desfazer última refatoração" e Ctrl+Z (⌘Z) logo após uma refatoração de vários arquivos desfazem todos de uma vez; o desfazer confere que o texto ainda é o produzido pela refatoração (senão recusa e aponta o Histórico local) e restaura o conteúdo — portanto o hash — anterior, inclusive o nome do arquivo.
- Árvore do projeto: renomear `User.php` que declara `User` oferece "Renomear também a classe … e as referências" (marcado) e a opção de strings; mover oferece "Atualizar namespace … e as referências (PSR-4 do composer.json)", que muda o `namespace`, imports, FQNs, adiciona `use` onde nomes curtos do mesmo namespace deixam de resolver (nos dois sentidos) e só então move o arquivo.

## PHP-IMPORT-001

- Completion de classe (contextos `new`, `extends`, `implements`, `instanceof`, `catch`): já importada → alias existente; mesmo namespace → nome curto; senão adiciona `use` após o último import do namespace (ou após `namespace`/`declare(strict_types=1)`), **sem duplicar**. Se o nome curto já pertence a outro import/declaração, a sugestão insere alias `use Lib\X as LibX;` e há uma segunda sugestão com FQN (`\Lib\X`).
- Quick fix (Alt+Enter) em classe não resolvida (diagnóstico do Phpactor): candidatos do índice do projeto primeiro — "Importar classe", "Importar … como Alias" e "Qualificar como \FQN" — e depois as ações do Phpactor (inclui stubs de extensões), sem repetir FQNs.
- Limites: autoimport ao colar código ainda não existe (a ajuda documenta essa opção); contextos de tipo de parâmetro/retorno usam o completion do Phpactor; não há preferência configurável (FQN × import).

## TOOL-INSPECT-001

- Marcadores (`php-inspections`) recalculados 700 ms após a edição: inspeções próprias + diagnósticos de plugins (`textDocument/diagnostic`, patch do recorte 25 aplicado em `native-language.ts`, com correções de edição do mesmo arquivo) + diagnósticos do Phpactor esperados pela versão atual (até ~3 s).
- Próprias: tipo de retorno incompatível com literal (`int` × `'x'`, `null` em tipo não anulável, `float` aceita `int`), `return valor;` em `void`, `return;` sem valor e argumento literal incompatível com parâmetro escalar tipado de função/método do mesmo arquivo (posicional e nomeado). Símbolo indefinido vem do Phpactor (`worse.unresolved_name` → `PhpUndefinedClassInspection`).
- Severidade: erro/aviso/informação no marcador; F2/Shift+F2 navegam. Quick fixes: "Alterar tipo de retorno para X", "Remover tipo de retorno void", importar classe; todos com "Suprimir Id nesta instrução" e "… neste arquivo" (`/** @noinspection Id */`). Correções do mesmo arquivo são edições do Monaco (Ctrl+Z desfaz).
- Limites: sem inferência de tipos de variáveis/chamadas (só literais); sem painel Problems nem configuração de severidade/perfil; supressão por função/classe não implementada (o comentário antes da instrução e no topo do arquivo, sim).

## TOOL-REFACTOR-001

- **Extract Method** (Ctrl+Alt+M / ⌥⌘M): instruções completas ou uma expressão dentro de método/função. Entradas = variáveis definidas antes (ou parâmetros) lidas na seleção ou escritas condicionalmente e usadas depois; saídas = escritas na seleção e usadas depois (inclui o restante do laço que envolve a seleção). Uma saída → `$x = $this->m(...)`; várias → `[$a, $b] = ...` e `return [$a, $b];`; `return` final → `return $this->m(...)`. Tipos dos parâmetros reaproveitados; `private`, `static`/`self::` em métodos estáticos; função no escopo do arquivo para funções. Recusa com mensagem: seleção parcial, chaves/parênteses desbalanceados, meio de string/comentário, closures, `return` antecipado, `yield`, `global`, `goto`, `$$`, `compact`/`extract`/`func_get_args`, `break`/`continue` que saem da seleção, `$this` em estático, nome inválido ou existente. O diálogo mostra parâmetros/retorno ao digitar.
- **Extract Variable** (Ctrl+Alt+V / ⌥⌘V): expressão → `$nome = …;` antes da instrução, opção de substituir todas as ocorrências no método; recusa condição de laço e `elseif`/`catch`/`case`; avisa curto-circuito e nome já usado.
- **Inline Variable** (Ctrl+Alt+N / ⌥⌘N): exatamente uma atribuição simples, leituras depois dela, sem uso em closure e sem alteração das variáveis da expressão até o último uso; parentetiza expressões compostas; avisa avaliação repetida de chamadas.
- Ações do Phpactor (extrair constante/expressão, gerar membros…) aparecem em Alt+Enter e passam pela mesma prévia quando editam outros arquivos.
- Limites: sem detecção de trechos duplicados no Extract Method, sem tipo de retorno gerado, sem Inline Method, sem refazer (redo) do desfazer global; criação de arquivos por comandos do servidor não suportada.

## Testes

- `tests/refactor-php.test.ts` (13 testes, `npx tsx --test`): rename com use/tipos/new/::/instanceof/FQN/PHPDoc/homônimo; opção de strings; conflitos; alias em conflito de import; move de namespace; autoimport sem duplicar/alias/`declare`; quick fix importar; Extract Method (parâmetros, saídas, laço, expressão, return final, estático, recusas); Extract Variable; Inline; inspeções, quick fix e supressão.
- `src-tauri/src/language.rs` (3 testes Rust): transação com histórico e desfazer restaurando hashes; hash divergente não altera nada; falha de escrita restaura arquivos já gravados.
- `src/refactor-smoke.ts`, chamado por `src/native-smoke.ts` (`npm run test:native`; `VITE_SMOKE_REFACTOR_ONLY=1` roda só estes): janela Tauri real com Phpactor — rename de classe com cancelar sem alterar, prévia com 3 ocorrências e homônimo fora, arquivo renomeado, buffer limpo, desfazer restaurando conteúdo; Extract Method aplicado e desfeito por Ctrl+Z; inspeção de retorno → ações do provider (quick fix + supressão) → correção aplicada → marcador some; nenhum erro no renderer.
- Resultados: `npm run typecheck` ok; `npm test` 62 ok / 5 ignorados; testes TS 20/20; `test:locales` ok; smoke filtrado `VITE_SMOKE_REFACTOR_ONLY=1 npm run test:native` **ok (2/2)**. O smoke completo não chega aos checks deste recorte: trava no check "Web: TypeScript, React e Vue" (outra área) mesmo com limite de 15 min.
- Limitação do ensaio: a janela de teste roda sem foco, e o widget de quick fix do Monaco não abre sem foco de texto; o smoke valida as ações do provider diretamente, não o clique no menu.

## Proposta para catálogo/matriz

- PHP-RENAME-001 — Estado: **Implementação inicial (REQ)**. "Shift+F6 com prévia por ocorrência, opção explícita de comentários/strings, homônimos preservados por resolução de namespace/imports, transação com hash e histórico local, cancelar sem alterar e desfazer global; classes por motor próprio (Phpactor não renomeia classes sem vendor), membros/variáveis pelo Phpactor; rename/move pela árvore atualiza classe/namespace". Comportamento observado: sem OBS. Diferenças: sem rename in-place, sem redo, conflitos de membros (homônimos em hierarquia) delegados ao Phpactor.
- PHP-IMPORT-001 — Estado: **Implementação inicial (REQ)**. "Completion insere `use` sem duplicar; conflito gera alias + alternativa FQN; quick fix de classe não resolvida com importar/alias/qualificar". Diferenças: sem autoimport ao colar nem configuração.
- TOOL-INSPECT-001 — Estado: **Implementação inicial (REQ)**. "Classe indefinida (Phpactor) e tipo incompatível de retorno/argumento literal (próprio) com range, severidade, F2, quick fix e `@noinspection` por instrução/arquivo; diagnósticos de plugins ligados". Diferenças: sem inferência de tipos geral, sem painel/perfil.
- TOOL-REFACTOR-001 — Estado: **Implementação inicial (REQ)**. "Extract Method (entradas/saídas/retorno/efeitos com recusas explícitas), Extract Variable e Inline Variable com prévia e undo". Diferenças: sem duplicados, Inline Method, Change Signature.
- Nenhuma família promovida a compatível: falta ensaio de referência versionado.

## Pedidos a outras sessões

- `src/native-smoke.ts`: inserida uma linha chamando `refactorSmoke` antes do check "Árvore" e um filtro `VITE_SMOKE_REFACTOR_ONLY` (mesmo padrão de `VITE_SMOKE_EDITOR_ONLY`) em `check()`; o dono pode movê-los. O check "Web: TypeScript, React e Vue" trava a execução completa e precisa ser investigado pela sessão de linguagens web.
- `src/locales/en.json`: acrescentadas 29 traduções (ações, diálogos, mensagens principais); mensagens interpoladas de erro/prévia ainda caem no português.
- `src-tauri/src/rpc.rs`: nada a mudar; `default_handler` continua usado como fallback pelo handler de `language.rs`.

## Correções de integração (coordenação, 23/10/2026)

Encontradas ao rodar o smoke nativo completo depois de todos os recortes 19–27:

- `language.rs` recusava pedidos com "Documento obsoleto" quando a versão do Monaco era menor que a última vista. A versão recomeça ao reabrir um arquivo ou trocar de projeto, então Cmd+clique, referências e completion paravam de responder nesses casos. Agora o texto recebido é sempre sincronizado e o servidor recebe uma versão própria e crescente. Essa trava fazia o smoke completo estourar o tempo (várias esperas de 30 s).
- Refatoração de um único arquivo no editor ativo (Extract Method/Variable, Inline, rename local) gravava no disco quando o buffer estava limpo; o Ctrl+Z do editor desfazia só o buffer e deixava o arquivo sujo com a refatoração no disco. Agora edita só o buffer, como uma digitação. Refatorações em vários arquivos continuam transacionais no disco.
- O progresso do servidor de linguagem ("Análise PHP atualizada") sobrescrevia na hora o status de ações do usuário (ex.: "Referência copiada"); agora espera 4 s.
- `copyText` não espera mais indefinidamente por `navigator.clipboard.writeText` na WebView sem foco.
- Smoke: o check "Web" só roda com `--web-only` (os arquivos web só são copiados nesse modo); as esperas de "Projetos recentes" e "Árvore" têm rótulos de diagnóstico.

Resultado (após a integração do keymap, tela desbloqueada): `node scripts/check-native.mjs --no-db` aprovado em 41 s, `--no-db --web-only` aprovado e `npm run test:native` completo, com PostgreSQL 16 e MySQL 8.4 descartáveis, aprovado em 61 s sem falhas. Com a tela do macOS bloqueada a WebView não renderiza o editor e o smoke trava na verificação de seleção; não é falha do produto.
