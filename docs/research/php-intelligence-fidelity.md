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
- **OBS autorizada**: só as capturas já existentes `14-rename` (rename in-place com lookup, ícones `//` e `≡` e o rodapé "Press ⌥⇧O to show options popup") e `15-intentions` (lista do ⌥⏎). A tela do PhpStorm esteve ocupada por outras sessões (`git-fidelity`, `php-debugger-fidelity`) durante todo o trabalho; **não houve observação nova**.
- **REQ próprio**: textos em português, visual dos popups, mensagens das inspeções, recusas explícitas fora do recorte, arquivo de configuração `.php-ide/php-intelligence.json`.
- **Hipóteses (pendentes de OBS)**: ordem exata das correções do ⌥⏎ além de "correção da inspeção primeiro, supressões por último"; conteúdo do tooltip do F2 (mensagem + correção principal ⌥⇧⏎ + "More actions ⌥⏎"); padrão "Ask" para importar ao colar; texto do popup de opções do rename; nomes das opções do diálogo de Inline Method para PHP; se o PhpStorm qualifica com FQN quando o nome curto colado está ocupado.

Nenhum item é promovido a compatível: todos seguem **Em desenvolvimento / não validados comparativamente**.

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
