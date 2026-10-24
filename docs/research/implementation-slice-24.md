> Nota de manutenção: o exemplo TODO Hints foi movido para [seu repositório](https://github.com/phpforge-dev/plugin-todo-hints). Os caminhos `fixtures/plugins` abaixo registram o estado histórico deste recorte; os testes atuais baixam o pacote fixado em `test-plugins.json`.

# Recorte 24 — Plugins de terceiros (PLUGIN-API-001)

Objetivo: levar PLUGIN-API-001 de "somente plugins internos" a um sistema de plugins de terceiros
com manifesto, descoberta, isolamento, permissões declaradas, consentimento, tela de gerenciamento
e instalação local. Nenhuma comparação com a referência foi feita neste recorte.

## Classificação das fontes

- **Evidência documental / observação autorizada:** nenhuma nova. O catálogo já registra que a
  arquitetura interna dos plugins da referência não foi e não será inferida; este recorte não usa
  código, assets nem formato de plugin da referência.
- **Requisito próprio (REQ):** todo o desenho abaixo (manifesto `plugin.json`, permissões, worker,
  consentimento, tela Plugins). Ele segue práticas públicas comuns de extensões (manifesto declarativo,
  ativação sob demanda, permissões com consentimento), não um produto específico.
- **Hipótese:** que o isolamento por Web Worker + CSP da janela Tauri seja suficiente contra plugins
  hostis comuns. Testado no Node (worker_threads com o mesmo código); não testado com ataque dirigido
  na webview real.

## O que foi implementado

### Manifesto (`plugin.json`)

```json
{
  "id": "example.todo-hints",          // editor.nome, minúsculas; não colide com internos
  "name": "TODO Hints",
  "version": "1.0.0",                  // x.y.z
  "minIdeVersion": "0.2.0",            // comparado com a versão do pacote Rust
  "main": "main.js",                   // .js relativo, confinado à pasta (links não escapam), ≤ 1 MB
  "description": "…",                  // opcional, ≤ 300
  "activation": {
    "languages": ["php", "blade", "markdown"],   // lista fechada (php, blade, markdown, json, yaml, javascript,
                                                  // typescript, vue, css, scss, html, twig, xml, dotenv, sql, ignore, text)
    "documents": ["config/**/*.yaml"],            // padrões de caminho (*, **, ?)
    "files": ["symfony.lock"]                     // marcadores: só se aplica se algum existir
  },
  "permissions": ["project.read", "project.write", "process", "network"]
}
```

Validação no backend (`src-tauri/src/plugins.rs`): id, nome, versão, versão mínima da IDE,
permissões e linguagens conhecidas, caminhos relativos sem `..`, ponto de entrada existente dentro
da pasta. Sem `languages`/`documents`, o plugin atende `.php`, como os internos.

### Descoberta e estado

- Pasta do usuário: `<config do app>/plugins/<id>` (ou `PHP_IDE_PLUGINS_DIR`).
- Pasta do projeto: `<raiz>/.php-ide/plugins/<qualquer>`.
- Estado (ativo, consentido, permissões vistas e concedidas) em `<config>/plugins-state.json`.
  Plugins do projeto têm estado por projeto (chave com hash da raiz): o consentimento dado num
  repositório não vale para outro. Nenhuma senha ou credencial é gravada.
- Plugin novo começa ativado, mas **não carrega** até o consentimento. Uma versão que declara
  permissão nova volta a pedir consentimento. Recusar desativa o plugin.

### Isolamento e ponte

- O código roda num **Web Worker** criado a partir de um Blob (`WORKER_SOURCE` em
  `shared/language/plugins/sandbox.ts`). Antes de avaliar o plugin, o worker remove do escopo
  `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `Worker`, `indexedDB`,
  `caches`, `BroadcastChannel`, `navigator`, `postMessage`, `__TAURI_*` etc. O worker nunca recebe
  IPC do Tauri; a CSP da janela (`connect-src ipc: http://ipc.localhost`) é a segunda barreira.
- O plugin chama `ide.register({...})` com os **mesmos ganchos de `api.ts`**: `detect`,
  `completeString`, `defineString`, `completeCode`, `defineCode`, `diagnose`, `codeLenses`,
  `invalidates`/`invalidate`, e o argumento `files` (`ProjectFiles`) funciona como nos internos.
  Extras: `commands` (alvo dos CodeLens), `ide.project.write`, `ide.process.run`, `ide.net.fetch`,
  `ide.log`, `ide.manifest`, `ide.permissions`.
- Toda saída é uma mensagem `rpc` tratada por `PluginBridge`, que confere a permissão concedida
  antes de executar: leitura (`read`/`list`/`exists` → `project.read`), escrita (`project.write`),
  processos (`process`), rede (`network`). Negação devolve `PermissionDenied: <permissão>` ao plugin
  e fica registrada na tela Plugins.
- Escrita, processos e rede são **conferidos de novo no Rust** (`pluginWrite`, `pluginExec`,
  `pluginFetch` verificam estado ativo + consentido + permissão declarada e concedida). Escrita é
  confinada ao projeto e recusa `.git/` e `.php-ide/`. Processos rodam sem shell, na raiz, com o
  limite de 30 s/2 MB de `process::run`. Rede usa `curl -q` só com http/https, 3 redirecionamentos,
  20 s e 2 MB (sem dependência HTTP nova).
- Resultados são saneados antes de chegar ao editor: limites de quantidade e tamanho, posições
  inteiras, destinos só dentro da raiz do projeto (sem documentos virtuais `content`), código de
  diagnóstico prefixado com o id do plugin e **CodeLens sempre reescrito** para
  `php-ide.pluginCommand` — um plugin não aciona comandos internos como `php-ide.runTests`.
- Tempo limite: 5 s para carregar, 4 s por gancho; gancho travado (laço infinito) encerra o worker
  e marca o plugin como interrompido. Exceções num gancho só são registradas. `PluginHost` agora
  protege todos os ganchos (também dos internos): falha de um plugin não derruba a resposta.

### Registro no host

`shared/language/plugins/host.ts` ganhou `setExternalPlugins(fonte)`: os plugins de terceiros
somam-se à lista interna de cada `PluginHost` (ids internos têm precedência). O registro interno
(construtor com lista) ficou igual; `IdePlugin.markers` faz o watcher reavaliar `detect` quando um
arquivo marcador muda.

### Interface (`src/plugin-manager.ts`, `src/plugin-manager.css`)

- **Consentimento na primeira ativação:** diálogo com origem (pasta do usuário ou do projeto, com
  aviso de confiança no repositório), id, versão, descrição e cada permissão com o risco explicado;
  caixas permitem conceder só parte; aviso extra para `process` ou leitura + rede. Foco inicial em
  "Não ativar". Pedido uma vez por sessão por plugin/versão de permissões, e só se os marcadores de
  `activation.files` existirem no projeto.
- **Tela Plugins** (Aparência › Plugins… ou clique na lista de plugins da barra de status): lista
  plugins de terceiros com versão, escopo, estado (Ativo, Desativado, Aguardando consentimento,
  Erro no manifesto, Falhou ao carregar, Interrompido), permissões concedidas/negadas, ganchos,
  erros de carga e de execução, acessos negados; ações Ativar/Desativar, Revisar permissões,
  Remover (só escopo do usuário, com confirmação em dois cliques), Recarregar, Instalar de pasta…,
  Instalar .zip…; lista também os plugins integrados ativos.
- Troca de projeto e alterações em `.php-ide/plugins/` recarregam os plugins.
- Todo texto vindo do manifesto é inserido com `textContent` (sem HTML do plugin).

### Instalação (pasta ou .zip local)

`pluginInstall` copia/extrai para uma área temporária, valida e move para `<plugins>/<id>`
(substitui a versão anterior). Pasta: recusa links simbólicos, ignora `.git`/`node_modules`.
`.zip`: leitor próprio (armazenado e deflate via `flate2`, já presente no lockfile) que recusa
caminhos absolutos, `..`, `:`, links simbólicos, criptografia e Zip64, confere CRC e limita a
2000 arquivos / 20 MB. Um zip com o plugin dentro de uma pasta única também é aceito.

### Plugin de exemplo

`fixtures/plugins/todo-hints/`: avisos para `TODO`/`FIXME`, CodeLens com a contagem (comando
`summary`), completion de responsáveis após `TODO(` lidos de `.todo-owners` (precisa de
`project.read`).

## Arquivos

- Novos: `src-tauri/src/plugins.rs`, `shared/language/plugins/sandbox.ts`, `src/plugin-manager.ts`,
  `src/plugin-manager.css`, `fixtures/plugins/todo-hints/{plugin.json,main.js,README.md}`, este documento.
- Meus: `shared/language/plugins/api.ts` (tipos de manifesto/permissões/linguagens, `markers`),
  `shared/language/plugins/host.ts` (`setExternalPlugins`, `safe`), `tests/plugins.test.ts` (5 testes
  novos ao final; os 8 testes históricos do Electron foram mantidos).
- Inserções pequenas em compartilhados: `src-tauri/src/main.rs` (`mod plugins;` e despacho de
  métodos `plugin*` exceto `plugins`), `src-tauri/Cargo.toml` (`flate2 = "1"`), `src/main.ts`
  (import e `mountPluginManager(api)`), `src/locales/en.json` (47 traduções).

## Testes e resultado

- `npx tsx --test tests/plugins.test.ts`: 13/13 (8 históricos + 5 novos): plugin de exemplo em
  worker pelo `PluginHost` (diagnóstico, CodeLens reescrito, comando, completion, ativação por
  linguagem); **permissão negada** para leitura, escrita, processo e rede (nada chega aos serviços,
  tentativa registrada; concessão parcial; caminhos `../`, absolutos, `C:` e `\` recusados);
  isolamento do escopo do worker e saneamento (destino fora do projeto, documento virtual, comando
  interno, `from` inválido); falhas recuperáveis (erro de sintaxe, sem `register`, laço infinito
  com tempo limite, exceção); ativação por marcador e padrões de documento.
- `npx tsx --test tests/markdown.test.ts tests/gitignore.test.ts tests/php-tests.test.ts`: 20/20
  (host compartilhado continua compatível).
- `npm test` (Rust): 62 passados, 0 falhas, 5 ignorados; inclui `plugins::tests` (regras do
  manifesto, instalação por .zip e pela pasta de exemplo, zips inseguros, CRC, consentimento,
  checagem de permissão no backend, nova permissão exige novo consentimento).
- `npm run typecheck` e `node scripts/check-locales.mjs`: ok.
- `npm run test:native`: **não concluído**. O build Rust passou, mas o `check-native` saiu com
  `Vite exit 1` porque a porta 1420 estava ocupada pelo servidor Vite de outra sessão (três
  execuções de `check-native` simultâneas); não foi repetido para não rodar em paralelo. O
  `vite build` de produção passou. O smoke nativo também não exercita plugins de terceiros.

## Limitações

- O worker não foi exercitado dentro da webview Tauri real por teste automatizado; o isolamento
  foi verificado com o mesmo código em `worker_threads`, onde `import()` dinâmico ainda alcança
  módulos do Node (o harness de teste não é a barreira; na janela vale a CSP).
- Leitura concedida inclui `.env` e segredos; o diálogo avisa, mas não há filtro por caminho.
- Rede depende de `curl` no PATH e não bloqueia endereços locais; sem streaming nem binários.
- Sem marketplace, assinatura de pacote, atualização automática, configurações por plugin,
  UI própria do plugin (painéis), hover/rename/format nem documentos virtuais de terceiros.
- Comandos de CodeLens só mostram texto retornado na barra de status.
- Sem detecção de mudanças na pasta de plugins do usuário (usar Recarregar); plugins do projeto são
  removidos apagando a pasta.
- Sem traduções em pt-BR (a fonte já é pt-BR).

## Proposta para catálogo/matriz

- **PLUGIN-API-001 — Estado de implementação:** Em desenvolvimento — plugins internos e de
  terceiros: manifesto `plugin.json`, descoberta (usuário e `.php-ide/plugins`), Web Worker sem
  IPC, ponte com permissões (`project.read`, `project.write`, `process`, `network`) conferidas
  também no backend, consentimento na primeira ativação, tela Plugins e instalação por pasta/.zip.
- **Evidência da implementação:** recorte 10 e [recorte 24](implementation-slice-24.md),
  `shared/language/plugins/{host,sandbox}.ts`, `src-tauri/src/plugins.rs`, `src/plugin-manager.ts`.
- **Diferenças conhecidas:** sem marketplace, assinatura, atualização automática, configurações e
  UI por plugin; sem hover/rename/format para terceiros; isolamento validado em worker_threads,
  não por ataque dirigido na webview.
- **Matriz:** PLUGIN-API-001 continua "Em desenvolvimento / Não validada / Não executada"; nota:
  "Plugins internos e de terceiros com permissões; sem comparação".
