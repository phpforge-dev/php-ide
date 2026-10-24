# Referência da API de plugins

Contrato experimental da IDE 0.2.0, conferido no [backend](../../src-tauri/src/plugins.rs) e no [worker](../../shared/language/plugins/sandbox.ts). Os [tipos compartilhados](../../shared/language/plugins/api.ts) são a referência para estruturas detalhadas; não existe pacote SDK publicado.

## Manifesto

`plugin.json` deve estar na raiz do pacote e ser JSON válido, sem comentários:

```json
{
  "id": "acme.php-hints",
  "name": "PHP Hints",
  "version": "1.0.0",
  "minIdeVersion": "0.2.0",
  "main": "main.js",
  "description": "Inspeções locais para PHP.",
  "activation": { "languages": ["php", "blade"] },
  "permissions": []
}
```

| Campo | Regra atual |
|---|---|
| `id` | Obrigatório; dois ou mais segmentos separados por ponto, minúsculas/números/hífens; até 80 bytes no total, até 40 por segmento; segmentos não começam/terminam com hífen |
| `name` | Obrigatório; não vazio, até 80 caracteres, sem controles |
| `version`, `minIdeVersion` | Obrigatórios; parte numérica `x.y.z`; versão mínima comparada à versão do pacote Rust. Sufixos `-`/`+` não participam dessa comparação; não assumir todas as regras SemVer |
| `main` | Obrigatório; arquivo `.js` relativo existente, até 8 MiB desde a IDE 0.2.10, confinado à pasta do plugin |
| `description` | Opcional; até 300 caracteres |
| `activation` | Opcional; listas `languages`, `documents`, `files`, até 20 itens cada |
| `permissions` | Opcional, padrão vazio; somente as quatro permissões documentadas |

Manifesto é arquivo comum de até 64 KiB. Caminhos não aceitam `..`, absolutos ou barras invertidas; use `/`. `activation.documents` aceita os padrões `*` (um segmento), `**` (atravessa diretórios), `?` (um caractere). `activation.files` contém caminhos de arquivos marcadores, não globs.

Linguagens aceitas: `php`, `blade`, `markdown`, `json`, `yaml`, `javascript`, `typescript`, `vue`, `css`, `scss`, `html`, `twig`, `xml`, `dotenv`, `sql`, `ignore`, `text`. `php` exclui Blade quando declarado explicitamente. Sem languages/documents, o filtro padrão atende `.php`, incluindo Blade.

Languages e documents são unidos por **OU**. Se files for informado, basta **um** marcador existir para o projeto se aplicar. Isso é separado do filtro de documento e do hook detect.

## Ciclo de vida e hooks

O pacote é descoberto e validado pelo Rust. Depois de consentimento, seu `main` roda em um Web Worker e chama `ide.register(objeto)` uma única vez. Nenhum `export` é necessário. Carregamento tem limite padrão de 5 segundos; cada chamada de hook, 4 segundos. Uma chamada travada encerra o worker; exceções são registradas e produzem fallback para a requisição.

| Hook registrado | Argumentos recebidos | Resultado |
|---|---|---|
| `detect` | `files` | Objeto `{version?: string}` para aplicar ao projeto, `null` para não aplicar. Sem hook, aplica se os marcadores passarem |
| `completeString` | `site, files` | `PluginCompletion[]` ou `null` |
| `defineString` | `site, files` | `PluginLocation[]` ou `null` |
| `completeCode` | `site, files` | `{from, items}` ou `null`; substitui de `from` ao cursor |
| `defineCode` | `site, files` | `PluginLocation[]` ou `null` |
| `format` | `request, files` | `{text}` com o buffer inteiro formatado, ou `null` para não tratar; ver [formatação](../development/formatting.md) |
| `diagnose` | `path, text, files` | `PluginDiagnostic[]` |
| `codeLenses` | `path, text, files` | `PluginCodeLens[]` |
| `invalidates` | `path` | Booleano; se true, o worker chama invalidate |
| `invalidate` | nenhum | Limpa caches do plugin |
| `commands[nome]` | argumentos do CodeLens, seguidos por `files` | Valor serializável; texto retornado aparece no status |

Todos os hooks de requisição podem ser async. `invalidates` e `invalidate` são chamados sincronamente pelo worker. Não há hook de desativação; desativar/recarregar/trocar projeto encerra os workers. Não dependa de estado em memória sobreviver a isso.

O host consulta completion/definition em ordem e usa a primeira contribuição não nula; plugins internos têm precedência de ordem e de IDs. Diagnósticos e CodeLens agregam contribuições. Não há campo público de prioridade no manifesto.

## Dados de entrada e saída

`StringSite`: `path`, `text`, `literal`, `callee`, `argument`, `prefix`. Strings atendidas pelo host são contextos PHP/Blade detectados como argumentos de chamada, não toda string de toda linguagem. `callee` pode ser `route`, `Route::view`, `->route` ou uma diretiva Blade. Veja [detector de strings](../../shared/language/plugins/host.ts).

`CodeSite`: `{path, text, offset, blade}`. `offset` é a posição do cursor na string JavaScript. Use o texto recebido para respeitar buffers não salvos, em vez de reler o mesmo arquivo do disco.

Estruturas de resultado:

```js
// Completion: kind segue os números LSP (1 = Text, 18 = Reference).
{ label: 'rota.home', kind: 18, detail: 'rota local' }
// completeCode também aceita insertText em cada item.
{ from: site.offset, items: [{ label: 'exemplo', kind: 1, insertText: 'exemplo' }] }
// Localização: URI de arquivo dentro do projeto e posições zero-based.
{ uri: files.uri('src/Example.php'), range: {
  start: { line: 0, character: 0 }, end: { line: 0, character: 5 }
} }
// Diagnóstico:
{ range: { start: {line: 0, character: 0}, end: {line: 0, character: 5} },
  message: 'Descrição útil', code: 'regra-local', severity: 'warning' }
// CodeLens: command é chave de commands do plugin, não comando interno da IDE.
{ line: 0, title: 'Mostrar resumo', command: 'summary', arguments: ['src/Example.php'] }
```

Linhas/colunas são zero-based; caracteres e offsets usam unidades UTF-16. Os snippets acima mostram objetos de formato, não um arquivo JavaScript completo. Valores devem ser serializáveis. `completeString` não preserva `insertText`; ele usa o label. Códigos de diagnóstico recebem o prefixo `<plugin-id>/`.

Resultados são saneados: até 1.000 sugestões, 100 destinos, 500 diagnósticos e 200 CodeLens por resposta. Localizações externas ao projeto e documentos virtuais de terceiros são descartados. CodeLens é reescrito para o despachante `php-ide.pluginCommand`, sem acesso arbitrário aos comandos da IDE.

## Objeto ide

| Serviço | Retorno / comportamento |
|---|---|
| `ide.register(plugin)` | Registra os hooks uma vez |
| `ide.manifest` | Manifesto carregado |
| `ide.permissions` | Lista de permissões concedidas, que pode ser menor que a declarada |
| `ide.project.read(path)` | Promise de texto ou null quando não acessível; exige leitura |
| `ide.project.exists(path)` | Promise de booleano; exige leitura |
| `ide.project.list(dir = '')` | Promise de caminhos relativos; exige leitura; listagem limitada a 20.000 entradas |
| `ide.project.uri(path)` | Monta URI para destino; não lê nem verifica existência |
| `ide.project.root` | Raiz do projeto, vazia quando sem permissão de leitura |
| `ide.project.write(path, text)` | Promise do resultado de gravação; exige escrita |
| `ide.process.run(program, args = [], {input} = {})` | Promise de stdout; processo sem shell, cwd na raiz; exige process |
| `ide.net.fetch(url, options = {})` | Promise de `{status, body}` textual; options aceita method, headers, body; exige network |
| `ide.log(...valores)` | Log informativo; não é mecanismo de UI ou persistência |

O argumento `files` dos hooks oferece `root`, `read`, `exists`, `uri` e `list(dir, accept)`. O filtro accept recebe o nome do arquivo e roda no worker. `files` não oferece escrita: use `ide.project.write`.

Escrita não tem o contrato de conflito/etag do editor: evite alterar automaticamente arquivos abertos. `process` executa programas com privilégios do usuário, não num sandbox de sistema operacional. Rede usa curl e retorna texto, sem streaming/binários. [Permissões e limites](permissions.md).

## Integração com o editor

A ativação por extensão só filtra quais documentos o host pode atender. É preciso que o recurso do editor consulte esse host:

- PHP/Blade têm caminhos de completion, definition e diagnóstico ligados a `src/native-language.ts`; o provedor de CodeLens de `src/main.ts` está registrado apenas para PHP.
- Markdown tem caminhos próprios de navegação/completion/diagnóstico; nem todo hook externo é exposto por toda UI Markdown.
- JSON/YAML/Twig usam filtros específicos em `src/plugin-languages.ts` e Composer/Symfony; CodeLens JSON tem recorte em composer.json.
- JS/TS/Vue têm seus serviços web próprios; não há integração genérica de todos os hooks externos nesses serviços. O mesmo vale para outras linguagens aceitas pelo manifesto sem um provedor conectado.

Portanto, testar um hook no PluginHost comprova o contrato do host, não sua presença em toda linguagem na janela real. A API não registra gramáticas, novos painéis, hover, rename ou formatadores de terceiros. Não suporta binários de plugins JetBrains/VS Code.

## Hover e correções (0.2.9)

Plugins instaláveis podem fornecer `hover(site, files, stringSite)`, retornando `{ contents, range? }` ou `null`. `contents` é texto Markdown; não é HTML inserido na página. O host limita o tamanho da resposta.

Diagnósticos podem incluir `fixes: [{ title, edits: [{ uri, range, newText }] }]`. Só edições com destinos dentro do projeto são aceitas. Elas aparecem como sugestões para o usuário aplicar; o plugin não escreve arquivos ao emitir um diagnóstico. A criação de arquivos e documentos virtuais continua fora desse contrato.

Os plugins padrão Laravel, DotEnv, Docker, Bash e Prettier usam esse mesmo worker. Seu fonte e pacote ficam em repositórios próprios, com versões fixadas em `default-plugins.json` e instalação automática pela rede. Consulte o [Marketplace](marketplace.md) para instalar, atualizar e gerenciar esses pacotes.

## Hook de formatação (0.2.10+)

`format(request, files)` recebe `{path, text, language, options: {tabSize, insertSpaces}, range?: {start, end}}`. Range usa offsets UTF-16 no texto completo; o plugin retorna `{text: string}` com o documento completo, não salva arquivos. `null` permite consultar o próximo provedor. Erros são exibidos e registrados; não há fallback silencioso para outro estilo quando um formatador falha. Limite de resultado: 2 Mi unidades UTF-16, com o mesmo timeout de 4 segundos dos hooks.

A ação Reformatar código consulta o hook para documentos não PHP em qualquer linguagem do editor, independentemente dos provedores antigos de completion/diagnóstico. PHP puro usa o formatador próprio por padrão. A aplicação verifica modelo/versão antes de aplicar, usa uma edição mínima e cria uma unidade de undo. Formatar não salva.

## Native tool extension contract (0.2.11+)

A tool package adds optional `tool` metadata to the existing manifest:

```json
{
  "protocolVersion": 1,
  "methods": ["exampleStatus", "exampleRun", "exampleCancel"],
  "event": "example-progress",
  "workbench": "workbench.js",
  "style": "workbench.css",
  "binaries": {
    "aarch64-macos": { "path": "bin/aarch64-macos/example", "sha256": "<64 hexadecimal characters>" }
  }
}
```

Declare `native.tool` and `workbench` permissions explicitly; `project.read` is needed for mediated reads. Ordinary language hooks stay in `main.js` and a worker. The workbench entry is an ES module exporting `activate(sdk)`; it is trusted window code after consent. It returns optional `run`, `reset` and `dispose` methods. Register disposables through `sdk.own`; use the scoped keymap/listen/API and host navigation services. The host removes owned top-level panels/rail buttons and styles on unload.

The native service receives canonical project root and Docker executable as argv values. It exchanges bounded newline-delimited JSON requests `{id,method,params:{args}}`, responses `{id,result}` or `{id,error:{message}}`, and events `{method:"tool/event",params:payload}`. `initialize` must return `{protocolVersion:1}`. Requests may run concurrently so cancellation can interrupt a long task. Only manifest-declared methods are routed; the host validates platform and binary checksum before launch. No native library is loaded into the IDE process.

`pluginToolSource`, `pluginToolCall` and `pluginToolStop` are host-side operations, not capabilities delivered to ordinary workers. Installed provider commands from CodeLens are routed only to the matching active trusted tool UI. State/permission changes revoke the native process and event generation.

The packaged native service and window module are not sandboxed. This contract must not be described as arbitrary-panel isolation. [Reference packages and evidence](../research/native-tool-plugins.md).


## Standalone workbench modules (IDE 0.2.12)

A package that needs UI but no native process may declare:

```json
{
  "id": "phpforge.markdown",
  "name": "Markdown",
  "version": "1.0.0",
  "minIdeVersion": "0.2.12",
  "main": "main.js",
  "permissions": ["project.read", "workbench"],
  "workbench": {"apiVersion": 1, "main": "workbench.js", "style": "workbench.css"}
}
```

`tool` and `workbench` are mutually exclusive. Standalone workbench modules do not require `native.tool` or an executable. The language entry still executes in the isolated worker. The workbench entry exports `activate(sdk)` and executes as trusted code inside the IDE window after explicit permission review. Default installation never grants workbench consent automatically.

The SDK exposes the editor, active path/open/status hooks, localized strings, shared editor/preview layout, keymaps, and a read-only API (`read`, `readImage`, `language`, `workspace`). Project reads require `project.read`. Call `sdk.own(disposableOrCleanup)` for every provider, listener and layout registration; the host invokes these cleanups on reload, project changes, disable and removal. A returned controller can also implement `dispose()`. Bundled modules must be self-contained, with no runtime npm resolution. Assets are confined to the installed package and validated before loading (8 MiB module, 512 KiB stylesheet, API version 1).

## Optional feature contributions (IDE 0.2.13)

See [shared contracts](extraction-contracts.md), the [typed workbench subset](../../shared/language/plugins/workbench-api.ts), and [extraction evidence](../research/parallel-plugin-extraction.md). A standalone workbench manifest may declare `services: string[]`. Rust validates method names against an explicit allowlist and verifies declared permissions; the SDK authorizes calls again and rejects late results after the owner generation stops. Native feature dispatch also verifies that its owning plugin is enabled and reviewed. `process` is required for Git, terminal, Docker and agent operations; database services require `network`, and refactoring transactions require `project.write`.

`sdk.provide(name, implementation)` publishes an optional feature. Core factories follow registration/removal, with a recoverable absent state and no hidden semantic fallback. `sdk.own` owns providers, keymaps, listeners, workers and layout cleanup. Shared editor containers belong to the host and survive plugin disposal. Resource release is a host operation independent of revoked UI permissions; reload waits for cleanup before replacing contributions. Document symbols, completion and diagnostics should disappear when the provider is disabled.
