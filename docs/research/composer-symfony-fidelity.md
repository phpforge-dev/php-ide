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
| HIP | Não confirmado | Se o PhpStorm 2026.1 marca vulneráveis do `composer audit` no editor; textos e ordem exatos das ações do ⌥Enter; comportamento do Symfony Support para forms/traduções em PHP. |

**Sem OBS do PhpStorm nesta rodada:** a tela não foi dirigida (o usuário não foi consultado para abrir o lock de tela); nada foi comparado lado a lado.

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
- Composer: ícone do gutter não diferencia atualização de *patch*/*minor*; sem "Composer Log" separado (a saída fica na janela Composer); consulta automática usa a rede do Composer configurado.
- Symfony: rotas em coleções (`$routes->collection()`), prefixos de `import` e rotas compiladas não entram; container lê só o XML (não `var/cache/*/url_generating_routes.php`); Doctrine sem mapeamento XML/YAML, embeddables só como campo, `src/Entity` + `src/Repository` (ou `src/` se vazios); forms sem tipos próprios do projeto além do `data_class`; traduções sem catálogo compilado nem domínios de constraints. Em PHP a completion passa pelo plugin PHP intelligence, que precisa repassar as correções dos plugins para o ⌥Enter.
- `npm run test:native` não foi executado com estas versões locais dos plugins (o teste nativo usa os pacotes fixados em `default-plugins.json`, que esta sessão não altera).
