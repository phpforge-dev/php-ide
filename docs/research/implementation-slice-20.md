# Recorte 20 — tipos, PHPDoc, generics, traits, herança, vendor e stubs nativos

23/10/2026. Pedido: levar à implementação as famílias P0 em "Não investigada": PHP-TYPE-001, PHP-DOC-001, PHP-GEN-001, PHP-TRAIT-001, PHP-INHERIT-001, PHP-VENDOR-001 e PHP-NATIVE-001. Método: fixture sintética própria por família → ensaio automatizado contra o motor atual (Phpactor 2026.10.07.0 com o patch local, mesma configuração do `language.rs`) → correção das lacunas que a nossa camada consegue resolver sem inventar tipos.

## Separação de evidências

- **Documentação (DOC):** [verificação de tipos e PHPDoc](https://www.jetbrains.com/help/phpstorm/php-type-checking.html), [navegação](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html) (inclui ícones de gutter "overrides/implements"), [Composer](https://www.jetbrains.com/help/phpstorm/using-the-composer-dependency-manager.html), [phpstorm-stubs (Apache-2.0)](https://github.com/JetBrains/phpstorm-stubs). Só descrevem o produto; não fixam layout, ícones nem algoritmo.
- **Observação do PhpStorm (OBS):** nenhuma neste recorte. Nada foi comparado com a referência; nenhum resultado abaixo promove compatibilidade.
- **Requisito próprio (REQ):** os critérios preliminares do catálogo para cada família, transformados nos casos da fixture; marcador de gutter navega ao alvo (um alvo: direto; vários: lista); stubs abrem somente leitura; unknown/união não ganham tipo inventado; o servidor de linguagem continua autoritativo, exceto em adaptações de trait onde ele erra de forma reproduzível.
- **Hipóteses:** que o PhpStorm resolva `insteadof`/`as`, `match`, `@template` em função e `@property` homônimo de método como esperado nos casos abaixo; que o marcador mostre só o método sobrescrito mais próximo mais os contratos. Pendentes de oracle.

## Fixture e ensaio

- Fixture nova: [`fixtures/php-semantics`](fixtures/php-semantics/README.md) — `src/` com interface, traits em conflito, classe abstrata, `@property`/`@property-read`/`@method`, `@extends`/`@template`/`class-string<T>`; `vendor/acme/collections` como pacote local instalado (com `installed.json`) e coleção genérica; `probes/*.php` com um ID por linha.
- Ensaio: `npm run test:php-semantics` = `tests/php-hierarchy.test.ts` (unidade) + `scripts/check-php-semantics.ts` (Phpactor real, temporário, sem rede). Cliente LSP de teste: `scripts/php-lsp-client.mjs` (mesmos `initialize`, `config-extra` e espera de indexação do `language.rs`). Relatório: `.artifacts/php-semantics.json`.
- `ok` = critério obrigatório cumprido pelo motor; `corrigido pela camada` = o Phpactor erra e a camada própria acerta; `lacuna do motor` = falha conhecida, registrada sem falhar o teste (se passar a funcionar, aparece `gap-fechado?`).

| Família | Casos (resultado em 23/10/2026) |
|---|---|
| PHP-TYPE-001 | ok: alias de import, `?->` em retorno `?User`, `instanceof` em união, `save(): static`, tipo desconhecido não inventa membros. Lacuna: `match` (TYPE-MATCH) — sem definição nem completion. |
| PHP-DOC-001 | ok: `@param User[]` em foreach, `@var` com FQN, `@return array<int, User>`, `@property-read`, `@method` de instância e estático, PHPDoc inválido não derruba análise. Lacuna: `@property string $email` homônimo do método `email()` — definição vai à linha da classe e hover mostra o método (DOC-PROPERTY). |
| PHP-GEN-001 | ok: `Collection<int, User>` em `first()` e foreach, `@extends Collection<int, User>`, `class-string<M>` em método estático com template. Lacuna: `@template` em **função** (`identity(new User())`, GEN-IDENTITY, a mesma do recorte 01). |
| PHP-TRAIT-001 | ok: método de trait e segundo trait. Motor erra `HasId::id insteadof LegacyId` (vai a `LegacyId::id`) e não resolve `LegacyId::id as legacyId` (sem definição/completion) → **corrigidos pela camada** (definição, completion e hover). |
| PHP-INHERIT-001 | ok: sobrescrita, `static` preservando subclasse, método do avô, trait herdado, interface → implementações `User::label`/`Admin::label`. Novo: **marcadores de gutter** (override/implement, overridden/implemented, subclasses). |
| PHP-VENDOR-001 | ok: classe e método em `vendor/acme/collections` (ida pelo Phpactor; volta pelo histórico de navegação existente), dependência ausente (`Acme\Missing\Thing`) devolve vazio sem erro. Gutter e traits também usam o índice com vendor. |
| PHP-NATIVE-001 | ok: completion, hover com documentação e definição de `strlen`, `DateTimeImmutable::format`, `array_map`, `json_encode` apontam para os stubs. Antes deste recorte a definição era descartada pela interface (URI `phar://`); agora abre o stub **somente leitura**. Lacuna: nível de linguagem — `array_find` (PHP 8.4) é oferecido num projeto `php >=8.2`; `php.version: "8.2.0"` no Phpactor não muda a lista (testado). |

## Implementação

- `shared/language/php-hierarchy.ts` (novo): análise léxica de classes/interfaces/traits/enums com `extends`, `implements`, `use` de traits e regras `insteadof`/`as` (com visibilidade), métodos com visibilidade/static/abstract. `PhpHierarchy` resolve método por classe (próprios → traits com adaptações → pai → contratos), aliases, ancestrais e descendentes; `hierarchyMarkers` gera marcadores (mais próximo na cadeia de classes + todos os contratos; descendentes que redeclaram); `hoverClassName` só aceita um tipo de classe único do hover do servidor; `adaptedMethod` diz se a resolução passou por `insteadof`/`as`.
- `src/php-hierarchy-index.ts` (novo): índice do projeto inclusive vendor (até 20.000 arquivos, 1 MiB por arquivo, 8 leituras simultâneas) pelo IPC existente (`workspace`, `listFiles`, `read`); atualização incremental pelo watcher; o buffer aberto (mesmo não salvo) sobrepõe o arquivo em disco; troca de projeto detectada pela raiz.
- `src/php-editor-insights.ts`: gutter com marcadores próprios (`src/php-gutter.css`, sem assets da referência), hover com a lista de alvos e clique que navega (um alvo) ou abre lista navegável por teclado (↑/↓, Enter, Esc). Definição refinada só quando a resolução passa por `insteadof`/`as` ou quando o servidor não respondeu e o receptor tem tipo único; completion e hover extras apenas para aliases de trait (aliases não públicos só em `$this->`). Code lens de usos ignora documentos que não são `file:` (stubs). Primeira construção do índice não bloqueia Ctrl+clique além de 1,5 s.
- `src-tauri/src/php_stubs.rs` (novo): leitor PHAR mínimo (formato público do manifesto; entradas sem compressão ou deflate) que devolve o texto de um stub somente se a URI for `phar://<.tools>/phpactor.phar/vendor/jetbrains/phpstorm-stubs/…​.php`; qualquer outro caminho, escape ou arquivo externo é recusado. Usa `flate2` (já no lockfile).
- Registros mínimos em arquivos compartilhados: `main.rs` (`mod php_stubs;` e comando `languageStub`), `shared/contracts.ts` (`languageStub` no `IdeApi`), `src/main.ts` (refinamento de definição em `locations`, ramo `phar:` que abre o stub como buffer `library`, abridor aceita `phar:`, hooks `request`/`open`/`files` do insights), `package.json` (`test:php-semantics`), `src/locales/en.json` (10 mensagens). Em `Cargo.toml` a linha `flate2 = "1"` também foi inserida por outra sessão ao mesmo tempo; a duplicata desta sessão foi removida.

## Verificação

- `npm run test:php-semantics`: 5 testes de unidade + 37 casos com Phpactor real (36 de famílias + gutter); nenhum critério obrigatório falhou; 2 lacunas corrigidas pela camada; 4 lacunas do motor registradas (TYPE-MATCH, DOC-PROPERTY, GEN-IDENTITY, NATIVE-LEVEL).
- `cargo test php_stubs`: 3 testes — PHAR sintético com entrada deflate e sem compressão, confinamento (fora dos stubs, `..`, outro phar, `file://`) e leitura real de `Core/Core.php` no `phpactor.phar` instalado.
- `npm run typecheck`: aprovado (23/10/2026). `npm test` (Rust): 59 aprovados, 0 falhas na execução completa; `cargo test php_stubs` reexecutado depois: 3/3.
- Janela Tauri real: `check-native --insights-only` aprovado (`PHP: usos no editor com Phpactor real…`, sem falhas), executado depois da execução nativa de outra sessão, sem paralelismo. Confirma que code lens/esmaecimento continuam funcionando com as mudanças; a verificação visual do gutter e do stub não está no `native-smoke.ts` (arquivo de outra sessão); proposta abaixo.

## Limitações

- Camada léxica: sem tipos de expressão; o receptor só é resolvido para `$this` e `$variável` cujo hover do Phpactor dá um único tipo de classe. Cadeias (`$a->b()->legacyId()`) e chamadas estáticas por alias de trait continuam só com o servidor.
- Marcadores não consideram visibilidade alterada por `as protected` nem traits que sobrescrevem métodos de pais; métodos `private` e `__construct` não recebem marcador; enum/`readonly` não testados; caminhos Windows (`\`) não tratados no índice.
- Índice de hierarquia lê todo o projeto na primeira abertura de arquivo PHP (como o índice de classes do `native-language.ts`); sem medição de memória/tempo em projetos grandes; arquivos acima de 1 MiB ou além de 20.000 ficam fora.
- Stub aberto é buffer `library`: hover/definição dentro do stub não funcionam (o caminho não pertence ao projeto); entradas PHAR bzip2 não são suportadas (o Phpactor atual usa deflate).
- Lacunas do motor sem correção: `match`, `@template` em função, `@property` homônimo de método, disponibilidade por versão/extensão. Corrigir exigiria patch no Phpactor (MIT) ou pós-processamento no `native-language.ts`.
- Vendor: exclusão configurável e proteção de rename em vendor não foram implementadas aqui (rename pertence à sessão php-refactor).

## Patches propostos para arquivos de outras sessões

1. `src/native-language.ts` (php-refactor) — opcional: mover o refinamento de definição para a camada de linguagem, para que outros clientes (busca, agente) também recebam o alvo correto. Após `const result=await this.call('language',[input]);`, para `textDocument/definition`, chamar `adaptedMethod` com a classe do receptor (hover do mesmo servidor) e substituir o resultado quando `adapted` for verdadeiro — mesma regra de `refineDefinition` em `src/php-editor-insights.ts`. Enquanto isso não ocorrer, o refinamento continua no `main.ts`.
2. `src/native-language.ts` — NATIVE-LEVEL: ao pós-processar completion de funções/classes (`kind` 3/7), ler a versão mínima de `composer.json` (`require.php`) e descartar itens cujo stub tenha `#[PhpStormStubsElementAvailable(from: 'X')]` com X maior; o texto do stub pode vir de `languageStub`. Requer cache por arquivo de stub; não implementado.
3. `src/native-smoke.ts` — check de janela real para o gutter (fixture `php-intelligence`): abrir `src/User.php`, esperar `#editor .php-gutter-overridden` na linha de `label` (Admin sobrescreve), clicar e verificar que o editor ativo é `src/Admin.php`; abrir `probe.php`, Ctrl+clique em `strlen` e verificar aba `library:phar://…Core.php` com texto `function strlen(`.
4. `src-tauri/src/language.rs` — nenhuma mudança necessária. `php.version` foi testado e não filtra completion; não proposto.

## Proposta para catálogo/matriz

- PHP-TYPE-001: Em desenvolvimento — recorte 20: alias, nullsafe, instanceof, `static` e unknown aprovados no motor; `match` é lacuna do Phpactor; sem OBS.
- PHP-DOC-001: Em desenvolvimento — recorte 20: `@param`/`@return`/`@var` com namespaces e arrays, `@property-read`, `@method` e doc inválido aprovados; `@property` homônimo de método falha; conflito doc × tipo nativo não testado.
- PHP-GEN-001: Em desenvolvimento — recorte 20: coleção `@template`/`@extends`/`@implements` e `class-string` em método aprovados; `identity(User)` em função continua falhando (lacuna do motor).
- PHP-TRAIT-001: Em desenvolvimento — recorte 20: `insteadof` e `as alias` corrigidos pela camada própria (definição, completion, hover); visibilidade por `as` só parcialmente.
- PHP-INHERIT-001: Em desenvolvimento — recorte 20: navegação de herança aprovada; marcadores de gutter override/implement/overridden/implemented/subclassed com navegação; equivalência visual não medida.
- PHP-VENDOR-001: Em desenvolvimento — recorte 20: pacote local em vendor navegável e dependência ausente tratada; exclusão e rename seguro pendentes.
- PHP-NATIVE-001: Em desenvolvimento — recorte 20: completion/hover/definição em stubs, abertos somente leitura a partir do PHAR; disponibilidade por versão/extensão pendente.
