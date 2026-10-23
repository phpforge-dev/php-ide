# Recorte 10 — plugins: strings Laravel (rotas, views, config) e `.env`

22/10/2026. Pedido: observar no PhpStorm e implementar Ctrl+clique e completion em strings de rotas, views, config e `.env`, como base de um sistema de plugins.

## Observação da referência (OBS)

PhpStorm 2026.1.4, macOS 26.3.1, plugins empacotados `laravel-idea`, `blade` e `dotenv` (nomes de diretório do bundle; conteúdo não lido). Projeto: cópia descartável da [fixture laravel-strings](../../fixtures/laravel-strings/README.md). Com só `composer.json`, a barra de status já mostrou **Laravel: 12.0**. A pedido do usuário as dependências foram instaladas na cópia (`composer install --no-scripts` no container `composer:2`, `laravel/framework` v12.70.1); os ensaios abaixo são posteriores à instalação e ao estado `Ready`.

Método: REA 6.7.0 ancorado no launcher, sem screenshots (gravação de tela negada); cursor posicionado pelo launcher público `phpstorm --line --column` (coluna 0-based) e ações acionadas por clique AX em menu (Navigate → Declaration or Usages; Code → Code Completion → Basic). Na primeira tentativa, teclas enviadas por System Events foram para outra janela quando o foco mudou e chegaram ao chat do usuário e a uma cópia descartável. O roteiro foi interrompido, a cópia restaurada e a automação passou a não usar teclado global.

| ID | Ponto | Saída observada |
|---|---|---|
| OBS-LV-NAV-01 | `route('users.show')` | `routes/web.php` 7:1 (início do `Route::get`) |
| OBS-LV-NAV-02 | `route('admin.dashboard')`, grupo `Route::name('admin.')` | `web.php` 9:5 (início do `Route::get` interno) |
| OBS-LV-NAV-03 | `route('missing.route')` | Sem navegação |
| OBS-LV-NAV-04 | `view('users.profile')`, `view('welcome')` | Arquivo Blade em 1:1 (primeira abertura) |
| OBS-LV-NAV-05 | `config('app.name')` | `config/app.php` 4:5 (aspas da chave `'name'`) |
| OBS-LV-NAV-06 | `config('services.mail.host')`, cursor em `services`, `mail` ou `host` | `services.php` 5:9 (`'host'`) nos três casos |
| OBS-LV-NAV-07 | `config('app')` | Abre `app.php` mantendo o cursor anterior (2:1); 3 de 4 execuções, a outra sem navegação atribuída a timing da automação |
| OBS-LV-NAV-08 | `env('APP_NAME')`, presente em `.env` e `.env.example` | `.env` 1:1, sem escolha entre arquivos |
| OBS-LV-NAV-09 | `env('QUEUE_DRIVER')`, só no exemplo | `.env.example` 4:1 |
| OBS-LV-COMP-01 | `route('')` | `admin.dashboard GET admin`, `home GET`, `users.show GET users/{id}`; rodapé "Press ⏎ to insert, ⇥ to replace" |
| OBS-LV-COMP-02 | `view('')` | `users.profile`, `welcome` |
| OBS-LV-COMP-03 | `config('')` | Todas as chaves, inclusive intermediárias, em ordem: `app`, `app.name Fixture`, `app.nested`, `app.nested.key *****`, `app.timezone UTC`, `services`, `services.mail`, `services.mail.host localhost` |
| OBS-LV-COMP-04 | `env('')` | `APP_DEBUG = true`, `APP_NAME = Fixture`, `MAIL_HOST = localhost`, `QUEUE_DRIVER = sync` (valor de `.env` vence `.env.example`) |

Não determinado: posição visual dos valores (texto colado ao nome ou alinhado à direita), por que `app.nested.key` é mascarado (hipótese: nome da chave), se `app.name` mostra o valor do `.env` ou o default (ambos `Fixture`), comportamento em Blade e mensagens para referências ausentes.

## Implementação (independente)

- `electron/plugins/api.ts`: contrato `IdePlugin` (`detect`, `invalidates`, `completeString`, `defineString`) e `ProjectFiles` com leitura confinada à raiz real e sem seguir links simbólicos.
- `electron/plugins/host.ts`: ativa plugins por projeto, identifica a chamada que contém a string (`route`, `Route::view`, `->route`, `@include`…) e o índice do argumento, e responde antes do Phpactor. Completion devolve `insert`/`replace`: Enter insere no cursor e Tab substitui a string.
- `laravel`: detecta `laravel/framework` em `composer.json` (versão pelo constraint, como a barra observada). Rotas por análise léxica de `routes/*.php`: verbos, `match`, `view`/`redirect`, `name`/`as`, grupos com `name`/`as`/`prefix` (encadeados ou em array) e `resource`/`apiResource` com `only`/`except`. Views em `resources/views`. Config: árvore de `return [...]` com valor literal ou `env()` resolvido pelo `.env`.
- `dotenv`: `.env` primeiro, depois `.env.*`; ` = valor` na lista; `env()`/`getenv()`.
- Blade: apenas `{{ }}`, `{!! !!}`, `@php…@endphp` e `@diretiva(...)` são tratados como PHP; comentários `{{-- --}}` ficam fora.
- Watcher passa a informar todos os arquivos; plugins invalidam cache por caminho e a ativação é recalculada quando `composer.json`/`.env*` mudam. Barra de status mostra os plugins ativos (`Laravel: 12.0 · .env`).
- Correção encontrada pelo teste de UI: a posição do cursor na barra ficava desatualizada ao abrir outro arquivo em 1:1.

REQ próprios, não observados: valores de chaves `*_PASSWORD`, `*_SECRET`, `*_TOKEN`, `*_KEY` mascarados na lista do `.env` e chaves de config terminadas em key/secret/password/token mascaradas; `to_route`, `redirect()->route`, `View::make`, `Route::view`, `@include`/`@extends`/`@each`, `Config::get`; nomes de `resource`. Plugins são internos: carregar código de terceiros no processo principal fica fora até haver isolamento e permissões declaradas.

## Verificação

- `tests/plugins.test.ts`: ativação/versão, OBS-LV-NAV-01…09, OBS-LV-COMP-01…04, insert × replace, Blade, comentário Blade, máscara, invalidação, grupos em array, `match`, `resource` e chamadas desconhecidas.
- `npm run test:plugins-ui` (Electron, cópia temporária): barra `Laravel: 12.0 · .env`, completion de `route('')` e `config('')`, F12 em view/config/route/env com posição na barra. Screenshots `.artifacts/plugins-routes.png` e `plugins-config.png` revisadas.
- Regressão: typecheck, `npm test` (21), `npm run test:php` (3), `test:intelligence-ui` e `test:ui` aprovados.

## Diferenças e limites

- Rotas e config são lidas por análise léxica, sem executar o projeto: rotas registradas dinamicamente, por service providers, `Route::controller`, arquivos de rota fora de `routes/` e configs mescladas por pacotes não aparecem.
- Views de pacotes (`pkg::view`), componentes `<x-…>`, Livewire, traduções, `asset()`, Eloquent e `.env` em subpastas não implementados.
- Sem inspeção de referência ausente nem quick-fix para criar rota/view/chave.
- Uma execução por caso na referência; TOOL-LARAVEL-001, TOOL-DOTENV-001 e PLUGIN-API-001 permanecem Em desenvolvimento.
