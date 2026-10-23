# Recorte 09 — autocomplete, índice de classes e Ctrl+clique em strings

22/10/2026. Pedido: aproximar autocomplete, indexação e Ctrl/Cmd+clique (inclusive em strings) do comportamento do PhpStorm.

## Observação da referência (OBS)

PhpStorm 2026.1.4, macOS 26.3.1, keymap macOS padrão, PHP language level 8.2 via Composer, plugins instalados pelo usuário (Copilot, Gemini, JetBrains AI) não desativados. Projeto: cópia descartável da [fixture](fixtures/php-intelligence/README.md) mais `probe-strings.php` (conteúdo abaixo), aberta em diretório temporário. Status bar `Ready` antes dos ensaios. Uma execução por caso; sem repetições.

Método: REA 6.7.0 (`observe_native_ui`), ancorado no executável Mach-O do launcher só para identificar a janela, com a árvore pública de acessibilidade; System Events para teclas e menus; leitor próprio da API AX pública para texto compacto. Gravação de tela continuou negada ao processo do REA: **não há screenshots da referência**. Não houve leitura de JARs, bytecode, índices, caches, plugins ou tráfego. A decisão do usuário de usar o REA atualiza a [avaliação do REA](rea-assessment.md).

| ID | Passos | Saída observada |
|---|---|---|
| OBS-COMP-01 | `$user->` (alias `Person` de `User`), sem prefixo, Basic | Lista: `id()` / tipo `int`, `label()` / tipo `string`; `secret()` privado ausente; rodapé "Press ⌃Space again to see more variants" |
| OBS-COMP-02 | Mesmo ponto, prefixo `l` | Só `label()` / `string` |
| OBS-COMP-03 | Enter no primeiro item | Texto `$user->id();`, cursor em 8:12 (após `()`) |
| OBS-COMP-04 | `$x = new U` | Itens `Nome [Namespace]`: `User [Fixture]`, `Unrelated [Fixture]` misturados a classes de stubs (`UnexpectedValueException [http\Exception]`, `UConverter`, `Url [http]`…). O primeiro item era um stub; o critério de ordenação não foi inferido |
| OBS-COMP-05 | ⌃⌥Space (Second Basic Completion) | Lista inalterada; o atalho provavelmente não chegou. Inconclusivo |
| OBS-NAV-02 | ⌘B em `label` de `$user->label()` | `User.php`, 9:21 (nome do método) |
| OBS-STR-01 | ⌘B em `__DIR__ . '/src/User.php'` | Abre `User.php` mantendo o último cursor do arquivo (5:7 numa repetição a partir de 5:7) |
| OBS-STR-02 | ⌘B em `'src/HasId.php'` | Sem navegação |
| OBS-STR-03 | ⌘B em `'Fixture\User'` | `User.php`, 5:7 (nome da classe) |
| OBS-STR-04 | ⌘B em `'label'` de `[User::class, 'label']` | `User.php`, 9:21 |
| OBS-STR-05 | ⌘B em `'src/Missing.php'` | Sem navegação |
| OBS-UI-01 | Go to File (⇧⌘O) `probe` | Popup com aba Files, filtro, lista com caminho e preview; link "Open In Right Split" |

Ctrl+Space é capturado pelo seletor de idioma do macOS nesta máquina; o Basic foi disparado por Find Action. Toda edição foi desfeita e a cópia conferida contra a fixture original.

```php
require_once __DIR__ . '/src/User.php'; // linha 5
$config = 'src/HasId.php';
$class = 'Fixture\User';
$method = [User::class, 'label'];
$missing = 'src/Missing.php';
```

## Implementação (REQ, independente)

- `electron/php-source.ts`: léxico mínimo (código, strings, comentários, heredoc, HTML), declarações, namespaces e `use` (alias, grupos).
- `electron/php-index.ts`: índice próprio de classes/interfaces/traits/enums do projeto, incluindo vendor; atualização por arquivo via watcher existente; até 50 mil arquivos de até 2 MB.
- Completion: o Phpactor só devolve tipos em `completionItem/resolve`; os primeiros 80 itens são resolvidos (limite de 1,5 s) para exibir `()`/parâmetros e o tipo na lista. Método sem parâmetros insere `nome()` com cursor depois; com parâmetros, dentro dos parênteses.
- Contextos de classe (`new`, `extends`, `implements`, `instanceof`, `catch`, `insteadof`): índice do projeto + stubs via `workspace/symbol`, com `[Namespace]`. Inserção usa alias existente, nome curto no mesmo namespace, `use` novo após os imports, ou FQN em conflito. Classes globais em arquivo com namespace entram como `\Nome` (REQ; a preferência do PhpStorm não foi observada). Projeto antes de stubs, depois ordem alfabética (REQ).
- Strings: `__DIR__`/`dirname(__FILE__)` + caminho abre o arquivo na última posição conhecida; FQN vai ao nome da classe pelo índice; callable `[Classe::class, 'm']` ou `['Fq\Classe', 'm']` resolve pelo Phpactor num documento temporário em memória com o contexto do arquivo. Caminho relativo simples, arquivo ausente e string solta não navegam.

## Verificação

- `tests/php-source.test.ts`: léxico, imports, contexto, assinatura, decisões de import.
- `tests/integration/intelligence.test.ts` (Phpactor real em container local sem rede): COMP-OBS-01/02/03, alias, `use` automático, STR-FILE-01/02, STR-CLASS-01, STR-CALLABLE-01, STR-NEG-01, string solta, IDX-ADD-09/IDX-DELETE-09.
- `npm run test:intelligence-ui` (Electron, cópia temporária): lista `id() int`/`label() string`, Enter → coluna 12, FQN → 5:7, `__DIR__` mantém 5:7, callable → linha 9. Screenshot `.artifacts/completion-members.png` revisada.
- Typecheck, `npm test`, `npm run test:php` e build aprovados.

## Diferenças e limites conhecidos

- Callable leva ao início da declaração (`public function`, 9:5), não ao nome (9:21): o Phpactor devolve o range da declaração inteira. O mesmo vale para Go to Definition comum de classe pelo Phpactor.
- Segunda chamada de completion, Tab, completion de tipos em parâmetros/retornos e de nomes qualificados (`\App\Us`) não implementados.
- Ranking do PhpStorm não reproduzido nem inferido. Sem destaque visual de referências em strings ao passar o mouse com ⌘.
- Índice próprio é léxico, não PSR-4: não valida se arquivo e namespace correspondem. Projetos grandes não foram medidos.
- Strings de rotas, views, config e `.env` (Laravel) ficam para o recorte de plugins/frameworks.
- Comparação feita em uma única execução por caso, no perfil acima; PHP-COMP-001, PHP-DEF-001 e PHP-IDX-001 continuam Em desenvolvimento.
