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
| `main` | Obrigatório; arquivo `.js` relativo existente, até 1 MiB, confinado à pasta do plugin |
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

Os plugins Laravel, DotEnv, Docker e Bash incluídos na IDE usam esse mesmo worker. Seu fonte é mantido em repositórios próprios, com versões fixadas em `bundled-plugins/lock.json`. Consulte o [Marketplace](marketplace.md) para instalar, atualizar e gerenciar esses pacotes.
