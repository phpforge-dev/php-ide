# Recorte 22 — Composer (TOOL-COMPOSER-001) e Symfony (TOOL-SYMFONY-001)

23/10/2026. Pedido: integração Composer (edição de `composer.json` e execução de ações) e suporte Symfony (rotas, templates, serviços, parâmetros e `%env()%`), a partir da documentação pública.

## Separação de evidências

- **Documentação (DOC):** schema do `composer.json` (getcomposer.org/doc/04-schema.md), CLI (`install`, `update [pacotes] [--lock]`, `require [--dev] pacote:restrição`, `remove`, `dump-autoload --optimize`, `run-script`, `validate`), eventos de script, referências `@script`/`@php`/`@composer`/`@putenv`, pacotes de plataforma (`php`, `ext-*`, `lib-*`), API pública do Packagist (`packagist.org/search.json`, metadados v2 `repo.packagist.org/p2/<pacote>.json`), imagem Docker oficial `composer`. Symfony (symfony.com/doc): `#[Route]` em classe/método (prefixo de caminho e nome, `methods`), nome automático de rota, rotas YAML e `when@env`, `render()`/`renderView()`/`#[Template]`, `path()`/`url()` e `extends`/`include`/`embed`/`use`/`import`/`from` no Twig, `config/services.yaml` (`parameters`, `services`, `_defaults`, prefixos de namespace, `alias`/`@id`), `%param%`, `%env(proc:VAR)%`, `#[Autowire(service:|param:|env:)]`, parâmetros `kernel.*`. O plugin Symfony da comunidade serviu só de referência de escopo; nenhum código foi lido ou copiado.
- **Observação do PhpStorm (OBS):** nenhuma neste recorte. Nada foi comparado com a referência.
- **Requisito próprio (REQ):** execuções restritas a ações fixas, sem shell, cwd na raiz do projeto, saída em tempo real, uma execução por vez com interrupção; executável configurável (PATH/composer.phar do projeto, caminho escolhido, Docker); erro "Composer não encontrado" abre a configuração; diagnóstico de `composer.lock` desatualizado pelo `content-hash`; CodeLens `▶ composer install`/`↻ composer update` na seção `require` e `▶ Executar <script>` em cada script.
- **Hipótese:** que o fluxo (janela Composer + CodeLens + diálogo de busca) seja equivalente ao da referência. Pendente de observação.

## Implementação

Plugin Composer (`shared/language/plugins/composer.ts`, documento `composer.json` da raiz):
- Parser JSON estrito com offsets (ordem de chaves preservada) e contexto tolerante do cursor (`jsonContext`) para JSON incompleto.
- Completion: chaves do schema na raiz, `autoload(-dev)`, `config`, `scripts` (eventos), `support`, `authors[]`; nomes de pacotes do `composer.lock` (ou `vendor/composer/installed.json`) com versão instalada + `php`/`ext-*` em `require`, `require-dev`, `conflict`, `replace`, `provide`, `suggest`; restrições a partir da versão travada (`^7.1`, `^7.1.3`, `~7.1.3`, `7.1.3`, `*`); valores de `minimum-stability`, `type`, `license`, `config.preferred-install`; `@script`, `@php`, `@composer`, `@putenv` em scripts.
- Navegação: pacote → `vendor/<pacote>/composer.json`; `@script` → declaração do script.
- Diagnósticos: JSON inválido (erro com posição), pacote de `require(-dev)` fora do lock (considera `provide`/`replace` de pacotes travados), lock desatualizado (`content-hash` recalculado: chaves relevantes ordenadas, `json_encode` estilo PHP, MD5 próprio — validado contra um lock real gerado pelo Composer 2.10.3), pacote travado mas não instalado em `vendor`.
- CodeLens descritos acima, comando `php-ide.composer`.

Backend (`src-tauri/src/composer.rs`, comandos `composerRun`, `composerCancel`, `composerProbe`, `composerSearch`, `composerVersions`):
- `plan` valida ação, nomes de pacote (regex do schema; curingas só em `update`), restrições (charset fechado, sem `-` inicial) e script (precisa existir no `composer.json`); sempre `--no-interaction --no-ansi`.
- Executável: `auto` (env `PHP_IDE_COMPOSER_BIN`, `composer` no PATH ou `composer.phar` da raiz), `path` (absoluto, nome começando com `composer`; `.phar` roda pelo PHP configurado), `docker` (`docker run --rm` com só a raiz montada em `/app`, `--user` do dono da pasta em Unix, imagem validada, padrão `composer:2`; usa o mesmo binário Docker de `docker.rs`).
- Saída em streaming pelo evento `composer-progress`, cauda de 512 KB no retorno, limite de 30 min, cancelamento.
- Packagist: `curl --proto =https` com URL montada no backend (host fixo, query codificada); falha não bloqueia: o diálogo aceita o nome digitado.

Frontend:
- `src/composer-panel.ts` + `composer-panel.css`: janela Composer no trilho esquerdo (Install, Update, Require…, Dump autoload, Validate, scripts, Interromper, ⚙ executável), lista de dependências com restrição/versão travada/`dev`, ↻ atualizar pacote, ✕ remover (com confirmação), clique abre o pacote em vendor; saída ao vivo; estado (executando/concluído/falhou/interrompido). Configuração salva em `localStorage` (não é segredo) e "Salvar e testar" roda `composer --version`.
- Diálogo Require: busca com debounce, downloads/abandonado, versões publicadas em datalist, `require-dev`.
- `src/plugin-languages.ts`: providers Monaco para `json` (só `composer.json`), `yaml` (`config/`) e `twig` (`templates/`): completion, definição, marcadores e CodeLens; reavalia após mudanças em `composer.lock`/`installed.json`/config.

Plugin Symfony (`shared/language/plugins/symfony.ts`, ativo com `symfony/framework-bundle`, versão do lock):
- Rotas: `#[Route]` em `src/**` (posicional ou `path:`, `name:`, `methods:`, FQCN, prefixo de classe isolado por classe, nome automático) e `config/routes*.yaml` (ignora `resource:`, entra em `when@env`).
- PHP: rotas em `->generateUrl`, `->redirectToRoute`, `->generate`; templates em `->render`, `->renderView`, `->renderBlock(View)`, `->stream`, `#[Template]`; parâmetros em `->getParameter`/`param()`; serviços em `service()`; `#[Autowire]`/`#[Target]` com `%env()%`, `%param%`, `@id` e `service:`/`param:`/`env:`.
- Twig: `path()`/`url()` e templates nas tags/funções acima. YAML: `@serviço`, `%parâmetro%` (inclui `kernel.*`), `%env(proc:VAR)%` ligados aos `.env` (valores secretos mascarados).

Registro: `src-tauri/src/main.rs` (mod, estado, despacho `composer*`), `shared/contracts.ts` (tipos e métodos), `src/native.ts` (evento), `src/native-language.ts` (plugins e roteamento de documentos não-PHP), `src/main.ts` (montagem, comando, reset), `src/locales/en.json` (56 traduções). `host.ts` não precisou mudar.

## Verificação

- `npm run typecheck`: ok.
- `npm test` (Rust): 62 passaram, 0 falhas; 4 novos em `composer.rs` (plano/validação, executável path/phar/docker, URL e parsing do Packagist, execução real sem shell com streaming, ocupado e cancelamento usando um `composer.phar` falso em PHP).
- `npx tsx --test tests/composer.test.ts tests/symfony.test.ts`: 18 testes (content-hash contra lock real, parser/contexto, completion, navegação, diagnósticos, CodeLens, detecção; rotas, YAML, serviços, PHP/Twig/YAML completion e navegação, invalidação de cache). Regressão: gitignore, markdown e php-tests continuam passando.
- `node scripts/check-locales.mjs`: ok.
- Manual: as mesmas linhas de comando Docker montadas pelo backend rodaram `validate` e `dump-autoload --optimize` na imagem `composer:2` (container descartável, cópia em pasta temporária; arquivos ficaram com o usuário local); `search.json` do Packagist respondeu via curl.
- Fixtures novas: `fixtures/composer/hash` (lock real) e `fixtures/symfony` (sintético, sem código Symfony).

## Limites

- Sem comparação com o PhpStorm; nada promovido a compatível.
- Janela Composer e providers Monaco não têm teste de UI na janela Tauri real (`test:native` não cobre este recorte).
- Hash: diferenças possíveis em casos raros (chaves numéricas em objetos, floats em notação exponencial).
- Sem `composer outdated`, `why`, `audit`, repositórios privados/autenticação, nem edição de versões por quick-fix.
- Symfony: sem rotas PHP (`config/routes.php`), XML, bundles (`@Bundle/…`), serviços autowired de `src/` sem declaração, `debug:router`/`debug:container`, formulários, Doctrine ou tradução. YAML lido por um parser de linhas (sem âncoras, fluxo `{}` ou multilinha).
- Packagist depende de `curl` e rede; sem cache.

## Proposta para catálogo/matriz

- TOOL-COMPOSER-001: **implementado (parcial, REQ+DOC, sem OBS)** — completion/navegação/diagnósticos/CodeLens em `composer.json`, janela Composer com install/update/require/remove/dump-autoload/validate/scripts, busca Packagist, executável PATH/caminho/Docker. Pendências: outdated/audit/why, quick-fixes, teste nativo de UI, comparação com o PhpStorm.
- TOOL-SYMFONY-001: **implementado (parcial, DOC, sem OBS)** — rotas (atributos e YAML), templates Twig, serviços/parâmetros YAML e `%env()%` com completion e navegação em PHP, Twig e YAML. Pendências: rotas PHP/XML, bundles, container compilado, Doctrine/forms/traduções, comparação com o PhpStorm.
