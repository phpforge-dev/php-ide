# Composer e Symfony — fidelidade (04/11/2026)

Famílias: TOOL-COMPOSER-001 e TOOL-SYMFONY-001. Código nos plugins `plugin-composer` e `plugin-symfony` (commits locais, sem push nem versão nova); host desta IDE só com o provedor genérico de correções descrito abaixo.

## Evidência

| Classe | Fonte | Uso |
| --- | --- | --- |
| DOC | [Composer no PhpStorm](https://www.jetbrains.com/help/phpstorm/using-the-composer-dependency-manager.html) | Ícone "Update Package" no gutter a partir de `update --dry-run` (ao abrir o projeto ou mudar o `composer.json`), clique atualiza; opção "Check for available package updates"; inspeção *Non-installed Composer packages* com ⌥Enter para instalar um ou todos; intenção "Run '<script>'"; Composer Log. |
| DOC | [Inspeção Non-installed Composer packages](https://www.jetbrains.com/help/phpstorm/2023.2/php-non-installed-composer-packages.html) | Mesma inspeção (página de 2023.2). |
| DOC | [Symfony Support (espend)](https://espend.de/phpstorm/plugin/symfony), plugin open source de referência | Rotas do RoutingConfigurator, container, `@Bundle`, campos do QueryBuilder, opções/tradução de forms. Só a lista pública de funcionalidades; nenhum código copiado. |
| DOC | symfony.com/doc (routing, bundles, service container, translation, forms) e doctrine-project.org | Formatos de arquivo e convenções (domínio/locale, `data_class`, `repositoryClass`, DQL). |
| OBS-CLI | Composer 2.11.1 real numa fixture temporária no scratchpad | Saídas de `update --dry-run`, `audit --format=json --locked`, `outdated --direct --format=json --locked`, `why`, `why-not`, reduzidas em `plugin-composer/native/fixtures/`. |
| REQ | Requisito próprio | Janela Composer com Outdated/Audit/Why…, marcadores do audit, aviso de chave de tradução ausente com "Criar a chave", diagnóstico de campo Doctrine. |
| OBS | PhpStorm 2026.1.4 dirigido nesta sessão (autorizado pelo usuário em 04/11), projeto descartável no scratchpad com `psr/log ~1.1.0` (1.1.0), `psr/http-message ^1.0` (1.0) e `psr/container ^1.0 \|\| ^2.0` (1.0.0), Composer 2.0.8 local | Capturas locais `.artifacts/phpstorm-reference/60`–`63`. Ver “Rodada 2”. |
| HIP | Não confirmado | Se o PhpStorm 2026.1 marca vulneráveis do `composer audit` no editor; textos e ordem exatos das ações do ⌥Enter; comportamento do Symfony Support para forms/traduções em PHP. |

**Rodada 1 sem OBS do PhpStorm:** a tela não foi dirigida. A rodada 2 (abaixo) observou o gutter e o Composer Log; o resto continua sem comparação lado a lado.

## Critérios e resultado

Composer (`plugin-composer` 4c0a59d…2b4fa9b):

1. Consulta em segundo plano fora da fila exclusiva: `update --dry-run` (atualizações dentro da restrição), `audit` (saída 1/2 ainda é lida) e `outdated --direct`. Testes Rust com Composer falso e parsers contra saídas reais. ✔
2. Gutter do `composer.json`: ícone só em dependências diretas; hover "de → para"; clique roda `composer update <pacote>`. Consulta ao abrir o `composer.json`, ao salvar `composer.json/lock` e depois de install/update/require/remove; nunca durante uma execução; desligável. ✔ (harness)
3. Audit: marcador na chave da dependência direta (high/critical = erro), indiretas agrupadas em `require`, abandonados avisados. ✔
4. why/why-not: botão `?` por pacote e diálogo "Why…" (versão vazia = why); um pacote validado; saída no log. ✔
5. ⌥Enter (contexto `composer-json`): instalar pacote não instalado/fora do lock (ou todos), atualizar hash do lock, atualizar pacote com atualização/aviso (ou todos), why, "Executar '<script>'". ✔ (harness com o widget real do Monaco)
6. Janela: Outdated e Audit com relatório e selos; falha recuperável; opções salvas. ✔ (`npm run test:browser` no plugin)

Symfony (`plugin-symfony` 4f8e5a6…61fe297):

1. Rotas `config/routes*.php` (`->add()->methods()`) e `config/routes*.xml` (`<route>`, `<when>`), em PHP e Twig. ✔
2. `config/bundles.php` + PSR-4 (composer.json e `vendor/composer/installed.json`): templates `@Alias/…` (Resources/views ou `templates/` do pacote); bundle sem classe = erro. ✔
3. Container compilado `var/cache/<env>/*Container.xml` (dev primeiro): serviços/aliases/parâmetros que a config não declara; ocultos e inline ignorados; navegação prefere o YAML; `$container->get/has()`. Sem cache, nada muda. ✔
4. Doctrine: atributos e anotações; findBy/findOneBy/count (critério e orderBy) por `$this` no repositório, `getRepository(X::class)` ou variável tipada; QueryBuilder (`createQueryBuilder`, `from`, joins por associação); DQL (FROM/JOIN, nomes de entidade); campo inexistente com sugestão e correção. ✔
5. Forms: `->add()` com campos do `data_class`; opções dos tipos do núcleo (próprias primeiro) e do `setDefaults`; `label/help/placeholder` com chaves de tradução do `translation_domain`. ✔
6. Traduções: YAML aninhado, XLIFF 1.2/2, PHP e JSON, `+intl-icu`; `->trans()`, `t()`, `new TranslatableMessage()`, `|trans`, `trans_default_domain`; chave ausente com "Criar a chave" no YAML do locale padrão. ✔ (harness: correção aplicada pelo ⌥Enter)

## Host (este worktree)

- `src/plugin-languages.ts`: ações do ⌥Enter para correções que plugins de documento anexam aos diagnósticos (antes eram descartadas fora do PHP); arquivo aberto recebe a edição no modelo, arquivo fechado é lido e salvo com o etag lido. Atalho ⌥Enter no contexto `plugin-document`.
- `src/locales/en.json`: textos novos do host e dos plugins.
- `scripts/check-composer-symfony-ui.mjs`: harness WebKit (porta 1446) com os bundles publicados (`main.js`) rodando no sandbox real e a janela Composer com API simulada.

## Limitações

- Comparação com o PhpStorm não executada; nenhuma compatibilidade promovida.
- Composer: consulta automática usa a rede do Composer configurado. (Gutter e Composer Log: ver rodada 2.)
- Symfony: (rotas em coleções, imports e rotas compiladas, mapeamento Doctrine XML e herdado: ver rodada 2); forms sem tipos próprios do projeto além do `data_class`; traduções sem catálogo compilado nem domínios de constraints. Em PHP a completion passa pelo plugin PHP intelligence, que precisa repassar as correções dos plugins para o ⌥Enter.
- `npm run test:native` não foi executado com estas versões locais dos plugins (o teste nativo usa os pacotes fixados em `default-plugins.json`, que esta sessão não altera).

## Rodada 2 (04/11/2026, tarde)

`plugin-symfony` 75ca766 (rotas) e 8c4eb50 (Doctrine); `plugin-composer` 7c7d3d2 (gutter) e 376114c (Composer Log). Commits locais, sem push nem bump.

### Observação do PhpStorm 2026.1.4 (OBS)

- **Gutter de atualização** (captura 61/61b): depois de abrir o projeto, as três dependências ganham **o mesmo ícone** (seta para cima contornada, azul) para *patch* (1.1.0 → 1.1.4), *minor* (1.0 → 1.1) e *major* (1.0.0 → 2.0.2). O PhpStorm **não diferencia** o tipo no ícone. A diferença fica no *inlay* depois da restrição (e da vírgula): `1.1.0, updates to 1.1.4`. Sem atualização, o inlay mostra só a versão travada (`1.1.0`), já antes da consulta.
- **Clique no ícone** (captura 62): roda `update psr/log --no-progress --no-interaction` e mostra a saída no Composer Log; o ícone não some na hora.
- **Composer Log** (capturas 60, 62 e 63): aba "Composer Log" da janela **Run**, aberta por "Show log" no painel do `composer.json` (Install · Update · Show log · ⚙). Cada comando aparece com ▶ verde no gutter (executar de novo), a linha de comando em azul e negrito **sem o executável**, a saída e `./composer.json` como link. Mensagens de sincronização de configurações aparecem com ⚙ no gutter. O log recomeça quando o projeto é reaberto. A documentação diz que execuções bem-sucedidas ficam dobradas, mas a dobra não foi vista porque a única entrada observada estava aberta.
- O Composer 2.0.8 desta máquina, em PHP 8.3, imprime avisos de depreciação. Para observar, eles foram filtrados por um wrapper no scratchpad (só a observação dependia disso).

### Critérios e resultado

Symfony:

1. **Coleções** (`$routes->collection('blog_')`, em variável ou encadeada, aninhada, `->prefix()` antes ou depois dos `add`): nome = prefixos de fora para dentro + nome; caminho por `RouteCollection::addPrefix` (`'/' . trim(prefix, '/') . path`; `trailing_slash_on_root: false` remove a barra da raiz). Prefixo localizado usa o primeiro locale. ✔
2. **Imports** YAML (`resource` string ou `{path, namespace}`, `type`, `prefix`, `name_prefix`, `trailing_slash_on_root`, também em `when@env`), XML (`<import resource prefix name-prefix>`, `<prefix locale>`) e PHP (`->import()->prefix()->namePrefix()`, inclusive dentro de coleção). Os recursos podem ser arquivo, diretório (controllers por atributo ou configs), glob (`*`, `**`, `{a,b}`) ou `@Bundle/` (pelo PSR-4 do bundle). Prefixos se compõem em imports encadeados. Arquivo importado deixa de ser raiz; controller alcançado por vários imports aparece uma vez; controller sem import entra sem prefixo (comportamento antigo). ✔
3. **Rotas compiladas** `var/cache/<env>/url_generating_routes.php` (dev primeiro): só entram as que a configuração não declara (rotas de bundles como `_wdt`). O caminho é reconstruído pelos tokens do gerador, a navegação vai ao método do `_controller` pelo PSR-4 (ou à linha do cache) e o item mostra "rotas compiladas" sem métodos (o gerador não os guarda). ✔
4. **Doctrine**: superclasse mapeada (`MappedSuperclass`), entidade pai (herança de tabela única/joined) e traits (`use`) entram nos campos. Classe pai comum não mapeia os próprios campos, mas repassa os de uma superclasse acima dela. Pais e traits fora de `src/Entity` vêm pelo PSR-4. Completion mostra o dono (`BaseEntity::$uuid`) e a navegação vai ao arquivo do dono. ✔
5. **Mapeamento XML** `*.orm.xml` em `config/doctrine` e nos `dir` de `mappings` com `type: xml` do `doctrine.yaml`: `<entity>`, `<mapped-superclass>`, `<embeddable>`, `<id>`, `<field>`, `<embedded>` e as quatro associações. `target-entity` curto usa o namespace da entidade, a classe PHP (pelo PSR-4) dá o `extends`, e a navegação vai ao atributo `name`/`field` do XML. ✔
6. **Embeddables** (`#[ORM\Embeddable]`, `Embedded(class:)`): completion e diagnóstico em `alias.embutido.campo` no QueryBuilder e na DQL, com cada passo conferido. Associação não é atravessada por ponto. ✔

Composer:

7. **Gutter** fiel à OBS: um único ícone (redesenhado como seta contornada azul, desenho próprio), clique roda `composer update <pacote>`; hover `pacote de → para (atualização de patch|minor|major)`; classe `composer-update-<tipo>` para tema/teste; inlay `1.1.0, updates to 1.1.4` depois da vírgula (ou do valor, no último item) e versão travada em toda dependência direta, relida quando o `composer.lock` muda. A diferenciação visual pedida na pendência **não foi implementada**: o PhpStorm não a tem. O tipo no hover é requisito próprio. ✔
8. **Composer Log** separado: janela própria (o host não expõe a janela Run a plugins; botão no trilho aparece após o primeiro comando). Entradas acumulam na sessão (até 100) com a linha de comando sem o executável, estado e duração, ▶ para repetir, sucesso dobrado com prévia no hover do "…", falha e interrupção abertas, `composer.json`/`composer.lock` clicáveis, e Limpar mantém a execução em andamento. Execuções do editor (gutter, ⌥Enter, CodeLens) abrem o log; as da janela Composer ficam nela, com "Mostrar log". CodeLens "Mostrar log" no `composer.json` e ação "Composer: mostrar log" no keymap. ✔
9. **Correção encontrada pelo harness**: ⌥Enter no `composer.json` abria o seletor de conflito do keymap, porque o host (`plugin-document`, 0.2.19) e o plugin registravam o mesmo atalho. A ação do plugin ficou sem atalho próprio. ✔

### Validação

- `plugin-symfony`: `npm test` com 40 testes (rotas: coleções, imports, compiladas; Doctrine: herança, trait, XML, embeddables), fixtures locais novas (`config/routes/blog.php`, `shop/`, `legacy/`, `src/Api`, `var/cache/{dev,prod}/url_generating_routes.php`, `config/doctrine*`, `src/Model`, `src/Entity/{Comment,Money,Admin,Tag,Traits}`) e `autoload` PSR-4 no `composer.json` da fixture.
- `plugin-composer`: `npm test` (7 Rust + 10 TS) e `npm run test:browser` (janela e Composer Log em WebKit; o stub de `dockWindow` agora fecha as outras janelas como o host).
- php-ide: `scripts/check-composer-symfony-ui.mjs` (WebKit, bundles locais no sandbox real) cobre ícone único com `composer-update-patch`, hover com o tipo, inlay `v7.1.3, updates to v7.1.9`, o Composer Log aberto pelo clique no gutter com a entrada dobrada, e ⌥Enter sem o seletor de conflito. O harness espera as consultas automáticas assentarem antes do ⌥Enter.

### Limitações (rodada 2)

- Rotas: o nome de rota localizada (`nome.en`) não é gerado; os prefixos de import por namespace (`resource: App\Controller\` sem `path`) e por expressões não são resolvidos; as rotas compiladas não substituem as declaradas, mesmo que o cache esteja mais novo; `url_matching_routes.php` (métodos) não é lido.
- Doctrine: mapeamento YAML (removido no ORM 3) não é lido; `findBy` com `embutido.campo` não é diagnosticado; a herança vê só pais resolvíveis pelo PSR-4.
- Composer Log: não é uma aba da janela Run; as mensagens de sincronização de configurações não existem nesta IDE; o log não é persistido.
- `npm run test:native` não foi executado com estas versões locais (o teste nativo usa os pacotes fixados).
