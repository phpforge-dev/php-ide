# Recorte 25 — Laravel: Eloquent e inspeções

23/10/2026. Pedido (TOOL-LARAVEL-001): o catálogo marcava "Eloquent e inspeções não iniciados". Este recorte implementa, no plugin `laravel`, assistência a modelos Eloquent e inspeções de referências inexistentes. Continua os recortes [10](implementation-slice-10.md) e [11](implementation-slice-11.md).

## Fontes e classificação

- **Evidência documental (DOC):** documentação pública do Laravel — Eloquent (convenções de tabela `Str::snake(Str::pluralStudly())`, `$table`, `$fillable`, `$hidden`, `$casts` e `casts()`), Mutators/Casting (`getXAttribute`, `Attribute::make(get: …)`, tipos de cast), Relationships (`hasMany`, `belongsTo`, `belongsToMany`, `morph*`, `*Through`; propriedade dinâmica × método), Query Scopes (`scopeX` e atributo `#[Scope]` do Laravel 12), Query Builder (`where*`, `orderBy`, `pluck`, `whereColumn`, *dynamic where* `whereEmail`), Migrations (`Schema::create/table/rename/drop`, tipos de coluna, `nullable()`, `change()`, `dropColumn`, `renameColumn`, `timestamps`, `softDeletes`, `rememberToken`, `foreignIdFor`, `morphs`), Localization (`lang/{locale}/{grupo}.php`).
- **Laravel Idea / IDE Helper:** apenas referência de escopo (que famílias de assistência existem). Nenhum código, stub ou asset foi lido ou copiado.
- **Observação do PhpStorm (OBS):** nenhuma neste recorte. Não houve ensaio da referência para Eloquent nem para inspeções; nada aqui promove compatibilidade.
- **Requisitos próprios (REQ):** todo o comportamento abaixo — ordem das listas, textos de hover, mensagens, critérios de quando inspecionar e correções rápidas.
- **Hipóteses:** listadas em "Limites".

## Implementação

Arquivos novos: `shared/language/plugins/eloquent.ts`, `shared/language/plugins/extensions.ts`, `tests/laravel-eloquent.test.ts`, `fixtures/laravel-eloquent/`. Alterados: `shared/language/plugins/laravel.ts` (delegação e inspeções) e inserção pequena em `shared/language/plugins/host.ts` (`PluginHost.hover`).

### Índice Eloquent (`eloquentIndex`)

- Modelos: classes de `app/` cuja herança (resolvida entre arquivos pelo `namespace`/`use`) chega a `Illuminate\Database\Eloquent\Model`, `Illuminate\Foundation\Auth\User`, `Pivot` ou `MorphPivot`. Modelo filho herda membros do pai do projeto.
- Por modelo: tabela (`$table` ou convenção), `$fillable`, `$hidden`, `$casts`/`casts()`, uso de `SoftDeletes`, métodos (visibilidade, `static`, parâmetros, retorno), accessors (`getFooBarAttribute` → `foo_bar`; método com retorno `Attribute` → snake_case, tipo do `get: fn (): T`), relações (`$this->hasMany(X::class …)` no corpo, alvo resolvido), scopes (`scopeActive` → `active`, `#[Scope] protected function verified` → `verified`, parâmetros sem o primeiro).
- Colunas: `database/migrations/*.php` aplicadas em ordem de nome de arquivo. `create` substitui a tabela; `table` altera (`dropColumn(s)`, `renameColumn` com destino na nova string, `drop*Timestamps/SoftDeletes/RememberToken`, `->change()` troca o tipo); `rename`/`drop`/`dropIfExists`. Tipo PHP por método (`id`/inteiros → `int`, textos/`json`/`decimal` → `string`, `float`/`double` → `float`, `boolean` → `bool`, datas → `Carbon`), `nullable()` → `|null`. Casts substituem o tipo (`boolean` → `bool`, `datetime` → `Carbon`, `immutable_datetime` → `CarbonImmutable`, `array`/`json` → `array`, `decimal:N` → `string`, classe/enum → a própria classe).
- Cache invalidado por mudanças em `app/` e `database/` (regex de `invalidates` ampliada).

### Tipos de expressão

Avaliador léxico sobre tokens (`eloquent.ts: receiver/expression`): base `$var`, `$this`, `User::`, `new User`, `(new User)`; passos `->prop`, `->m()`, `?->`, `[i]`. Variáveis: atribuição mais próxima (`$u = User::find(1)`), `foreach (… as $x)`, parâmetro tipado (`?User $u`; `Builder $query` dentro do modelo → Builder do modelo), `/** @var Post[] $x */` e, em Blade, o tipo das variáveis da view inferido pelo recorte 11. Tipos: instância, classe estática, Builder, relação (métodos de relação + Builder do alvo) e coleção. Regras: `first/find/create…` → modelo; `get/all/paginate…` → coleção; `where*`, scopes e *dynamic where* → Builder; propriedade de relação → coleção ou modelo; `first/last/find` de coleção → modelo.

### Completion, navegação e hover (PHP e Blade)

- Após `->`/`::` de tipo Eloquent: instância — colunas (ordem da migration, tipo com cast), accessors, relações como propriedade (`Collection<Post>`, `User|null`) e como método (`posts()`), métodos públicos do modelo (todos em `$this->`) e métodos comuns de Model; estático/Builder — scopes, `find/first/get…`, métodos do Builder e `whereColuna` dinâmico por coluna (`whereFullName`), mais métodos estáticos e `class`; relação — `create/save/attach/sync…`; coleção — métodos usuais. Fora de Eloquent o plugin devolve `null` e o Phpactor responde.
- Strings: colunas em `where/orWhere/whereIn/whereNull/whereBetween/whereDate…/orderBy/orderByDesc/latest/oldest/pluck/value/select/groupBy/whereColumn/increment/sum…`; relações em `with/load/has/whereHas/withCount…`, inclusive aninhadas (`posts.author`, ignorando `:colunas` e `as alias`).
- Navegação (F12/Ctrl+clique): coluna → string da coluna na migration (ou no `renameColumn`); `whereEmail` → coluna; relação/accessor/scope/método → declaração no modelo; strings de coluna/relação idem.
- Hover (`PluginHost.hover`, Markdown): coluna (`string $email`, tabela, cast, fillable/hidden, migration:linha), accessor, relação, scope, where dinâmico, método; strings de rota (métodos e URI), config (valor, segredos já mascarados), tradução (valor por idioma, configurado primeiro), view (arquivo) e coluna/relação.

### Inspeções (`LaravelPlugin.diagnose`)

| Código | Quando | Correção rápida |
|---|---|---|
| `laravel.route.missing` | `route('x')`/`to_route`/`->route` com nome literal ausente em `routes/` (só se há alguma rota) | Trocar pelo nome mais próximo (distância de edição com transposição) |
| `laravel.view.missing` | `view`/`View::make`/`Route::view`/`@include`… sem arquivo; `pkg::view` fica fora | Criar `resources/views/….blade.php`; trocar pela view mais próxima |
| `laravel.config.missing` | Chave ausente, com arquivo existente e prefixo mais longo sendo array literal | Trocar pela chave mais próxima |
| `laravel.translation.missing` | `__('grupo.chave')` ausente em todos os idiomas, com `grupo.php` existente | Inserir `'chave' => ''` no arquivo do idioma configurado (antes do `]`, com vírgula se faltar) |
| `laravel.column.missing` | String de coluna (identificador simples) ausente da tabela do modelo com migration conhecida | Trocar pela coluna mais próxima |
| `laravel.relation.missing` | String de relação inexistente no modelo | Trocar pela relação mais próxima |

Strings dinâmicas (concatenação, interpolação, variável) não são inspecionadas. Correções vêm em `diagnostic.fixes[]` (`PluginFix`: `edits` de texto e/ou `create` de arquivo).

## Verificação

- `npx tsx --test tests/laravel-eloquent.test.ts`: 9 testes, 9 aprovados — convenção de tabela; migrations (create/table/change/rename/drop/morphs/softDeletes); índice do fixture (colunas após alter, casts de propriedade e de método, accessors dos dois estilos, relações, `scopeX` e `#[Scope]`); completion de instância/estático/Builder/relação/coleção, cadeias (`User::verified()->whereEmail('x')->first()->`), `foreach`, parâmetro nullable com `?->`, `@var` com índice, `$this` e `Builder $query` no modelo, recusa fora de Eloquent; Blade com variável tipada pelo controller; navegação (coluna, coluna renomeada, `whereEmail`, relação, accessor `Attribute::make`, scopes, strings de `orderBy`/`pluck`/`with`); completion de strings de coluna/relação (incl. aninhada e 2º argumento de `whereColumn`); hover; inspeções e correções, sem falsos positivos em `vendor::mail`, `cache.default`, `__('Plain text')`, `author.x`, strings dinâmicas e referências válidas, incluindo Blade.
- Regressão: `tests/symfony.test.ts` (9/9, usa `LaravelPlugin`), `tests/markdown.test.ts`, `gitignore`, `php-tests` aprovados; fixture `laravel-strings` sem novos diagnósticos além de `route('missing.route')`.
- `npm run typecheck`: aprovado (uma execução intermediária falhou em `src/plugin-manager.ts`, de outra sessão em edição; a seguinte passou).
- `npm test` (Rust): 57 aprovados, 5 ignorados (o recorte não altera Rust).
- `npm run test:native`: não executado — a fiação de UI ainda não existe (abaixo).

## Limites

- **Sem fiação de UI para PHP**: `PluginHost.hover` e `diagnose` existem e estão testados, mas `src/native-language.ts` ainda envia hover/diagnóstico de PHP só ao Phpactor e o renderer não pede `textDocument/diagnostic` para PHP/Blade nem registra code actions. Patch sugerido na seção de proposta. Completion e navegação já passam pelo host e funcionam na janela.
- Análise léxica, sem executar o projeto: colunas criadas por SQL bruto, `$table->{$var}`, migrations de pacotes, `Schema::connection()`, squash (`database/schema/*.sql`) e banco real não são lidos; ordem por nome de arquivo pressupõe o prefixo de data padrão.
- Modelos fora de `app/`, traits que declaram relações/scopes, `$appends`, `newEloquentBuilder`/builders customizados, macros, escopos globais e coleções customizadas não são considerados.
- Inferência de variáveis é local e aproximada (atribuição mais próxima no arquivo, sem fluxo de controle); retornos de funções arbitrárias, `auth()->user()` e propriedades de classe não são resolvidos.
- Hipótese: completion de `User::` passa a vir do plugin quando o modelo é reconhecido, substituindo a lista do Phpactor; incluímos métodos estáticos, `class` e membros Eloquent, mas constantes e propriedades estáticas do modelo não aparecem.
- Inspeção de rota pode apontar rotas registradas por pacotes/service providers; de view, views registradas por `View::addNamespace`/`loadViewsFrom` sem `::`.
- Tradução: só chaves de grupo de um nível ganham correção; chaves JSON/texto livre não são inspecionadas.
- Correção "Criar view" depende de comando IPC de criação de arquivo inexistente hoje.

## Proposta para catálogo/matriz

- TOOL-LARAVEL-001 — Estado: **Em desenvolvimento**; acrescentar "Eloquent (modelos, colunas de migrations, casts, accessors, relações, scopes, Builder/coleção, where dinâmico; completion, navegação e hover em PHP e Blade) e inspeções de rota/view/config/tradução/coluna/relação com correções ([recorte 25](implementation-slice-25.md)); hover e inspeções ainda sem fiação na UI para PHP". Comportamento observado: **sem OBS** para Eloquent/inspeções (REQ + DOC). Diferenças: análise léxica; sem banco real; sem ensaio de referência.
- PLUGIN-API-001 — mencionar extensões `hover` e `fixes` em `shared/language/plugins/extensions.ts`, candidatas a `api.ts`.
- Pendências para outras sessões:
 1. `src/native-language.ts` (`request`, antes de `this.call('language')`): `if(input.method==='textDocument/hover'){const h=await this.host!.hover(input.path,input.text,offset);if(h)return{contents:{kind:'markdown',value:h.contents},range:h.range};}` e `if(input.method==='textDocument/diagnostic')return this.host!.diagnose(input.path,input.text);`.
 2. Renderer: diagnósticos de `php`/`blade` com debounce e `setModelMarkers` (padrão de `src/plugin-languages.ts`) + `registerCodeActionProvider` convertendo `fixes[].edits` em `WorkspaceEdit` e `fixes[].create` em criação de arquivo (exige comando IPC restrito ao projeto).
 3. Migrar `PluginHover`/`PluginFix`/`HoverPlugin` para `api.ts` e `fixes?` para `PluginDiagnostic`.
