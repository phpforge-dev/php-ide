# Recorte 11 — Blade: componentes, @include, variáveis da view e traduções

22/10/2026. Pedido: observar no PhpStorm e implementar navegação e completion em Blade (componentes `<x-…>`, `@include`, variáveis passadas à view) e traduções `__()`.

## Observação da referência (OBS)

Mesmo perfil do [recorte 10](implementation-slice-10.md): PhpStorm 2026.1.4, Laravel Idea/Blade empacotados, cópia descartável da [fixture laravel-strings v2](../../fixtures/laravel-strings/README.md) com `vendor/` instalado, estado `Ready`. Cursor posicionado pelo launcher público; ações por clique AX em menus (Navigate → Declaration or Usages; Code → Code Completion → Basic). Para prefixos, a cópia foi editada no disco e recarregada pelo PhpStorm; nenhuma tecla global foi enviada, exceto um Escape com verificação de foco. Uma execução por caso; a cópia foi restaurada ao final.

| ID | Ponto | Saída observada |
|---|---|---|
| OBS-BL-NAV-01 | `<x-alert` (classe + view) | Popup **Choose Declaration**: `alert.blade.php` e depois `Alert \App\View\Components, class` |
| OBS-BL-NAV-02 | `<x-forms.input` (anônimo), em `forms` ou `input` | `components/forms/input.blade.php` 1:1 |
| OBS-BL-NAV-03 | atributo `type=` de `<x-alert` | `Alert.php` 10:23, `$type` do construtor |
| OBS-BL-NAV-04 | `@include('users.profile')` | Sem navegação em duas tentativas (com espera maior) |
| OBS-BL-NAV-05 | `$id`, `$section`, `$tab` em `profile.blade.php` | Sem navegação |
| OBS-BL-COMP-01 | `<x-` | `x-alert`, `x-dynamic-component`, `x-forms.input`, depois componentes de pacotes em vendor (`x-laravel-exceptions-renderer::…`), em ordem alfabética |
| OBS-BL-COMP-02 | `<x-alert t` | Atributos HTML (`tabindex`, `target`, `title`, `type`) e da propriedade do componente: `type` e `:type`; depois diretivas e correspondências aproximadas |
| OBS-BL-COMP-03 | `{{ $i }}`, `{{ $s }}`, `{{ $t }}` em `profile.blade.php` | `id int`, `section string`, `user object`, `tab string` vindos de array, `->with()` e `compact()`; prefixo primeiro, depois correspondência aproximada e globais PHP; rodapé "Press ⌃Space again to see global variants" |
| OBS-BL-COMP-04 | Sem prefixo em atributo ou `$` | Nenhuma lista |
| OBS-TR-01 | `__('messages.welcome')`, `__('Hello')`, `trans()` em Blade e PHP | Sem navegação |
| OBS-TR-02 | `__('')` | PHP: nenhuma lista; Blade: apenas `__env` |

OBS-TR é **inconclusivo**: nem as chaves de `lang/` nem as traduções do framework em vendor foram reconhecidas. Não se concluiu que a referência não suporta traduções; pode depender de configuração ou de arquivos de bootstrap ausentes na fixture. OBS-BL-NAV-04 contrasta com `view('users.profile')` em PHP, que navegou no recorte 10.

## Implementação

- API de plugins ganhou pontos fora de strings (`completeCode`/`defineCode` com `CodeSite`); o host consulta primeiro strings e depois código.
- `electron/plugins/blade.ts`: componentes anônimos (`resources/views/components`, `index.blade.php`) e de classe (`app/View/Components`, nome em kebab-case, view lida de `render()`); props de `@props([...])` e do `__construct` com tipo e posição; variáveis passadas por `view()`, `View::make()`, `Route::view()`, `@include(..., [...])`, `->with('k', v)`, `->with([...])` e `compact()`, com tipo inferido de literal, cast, `new`, parâmetro tipado ou atribuição simples.
- Plugin `laravel`: completion de `<x-`, de atributos (`prop` e `:prop`) e de `$variável` em Blade; navegação de tag (view primeiro, classe depois, como no popup observado), de atributo para o parâmetro e de variável para a origem do valor.
- `electron/plugins/translations.ts` (DOC Laravel, sem oracle): `lang/` e `resources/lang/`, `{locale}/{arquivo}.php` aninhado e `{locale}.json`; `__`, `trans`, `trans_choice`, `Lang::get`, `Lang::choice`, `@lang`, `@choice`. Valor exibido no idioma de `config('app.locale')`; navegação devolve todos os idiomas que definem a chave, o configurado primeiro.
- Renderer: linguagem `blade` própria (gramática Monarch mínima própria) porque, na linguagem `php` do Monaco, o texto fora de `<?php` é HTML embutido e os providers PHP não eram chamados. Providers registrados para `php` e `blade`.

REQ além da referência: navegação de variável para a origem; `@include` navega (como `view()`); traduções. Diferenças: sem atributos HTML nem diretivas Blade na lista; sem componentes de pacotes em vendor; com vários destinos, o Monaco mostra peek e ordena a lista lateral por nome de arquivo.

## Verificação

- `tests/plugins.test.ts` (7 testes): OBS-BL-NAV-01…03, OBS-BL-COMP-01…03 com tipos, variáveis das três formas e de `@include`, props na própria view do componente, navegação de variável, traduções PHP/JSON/aninhadas com ordem de idiomas, `trans`/`Lang::get`, e o que fica fora (valor de atributo, PHP fora de Blade).
- `npm run test:plugins-ui`: completion de `<x-` e de variáveis, peek com `alert.blade.php` e `Alert.php`, navegação de tradução; 4 execuções seguidas aprovadas. Duas condições de corrida eram do teste, não do produto: atalho logo após fechar Go to Line e Ctrl+Space antes de o widget anterior fechar. O teste agora espera foco/fechamento e repete Ctrl+Space uma vez se o widget não abrir.
- O caractere de disparo `-`, cogitado para `<x-`, impedia a abertura manual da lista nesta versão do Monaco e foi descartado; `<x-a` abre pelas sugestões automáticas.
- Regressão: typecheck, `npm test` (23), `npm run test:php` (3), `test:intelligence-ui`, `test:ui`.

## Limites

Análise léxica: dados passados por view composers, `View::share`, middleware, `Inertia`, Livewire ou herança de layout (`@extends`/`@section`) não aparecem. `$loop`, `$errors`, `$slot` e `$attributes` não são oferecidos. Componentes de pacote (`x-pkg::…`), `<x-slot>` e `x-dynamic-component` sem navegação. TOOL-LARAVEL-001 permanece Em desenvolvimento.
