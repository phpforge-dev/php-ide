# Fixture de strings Laravel v1

Projeto sintético, sem `vendor/` nem código do Laravel. Serve para observar e testar navegação e completion em strings de `route()`, `view()`, `config()` e `env()`. `.env` contém apenas valores fictícios.

Copiar para um diretório temporário antes de abrir no PhpStorm ou na IDE. `app/probe.php` marca os pontos de ensaio.

v2 (recorte 11): componentes Blade (classe `Alert` e anônimo `forms.input`), variáveis passadas à view (array, `with()`, `compact()`), traduções em `lang/` (PHP e JSON, `en` e `pt_BR`). `resources/views/probe.blade.php` marca os pontos de Blade e tradução.
