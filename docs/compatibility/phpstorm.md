Configuração inicial e atualizações (24/10/2026): [requisito próprio e implementação](../specs/first-run-and-updates.md). Seleção opcional na primeira abertura, fila em Rust e auto update desligado por padrão. Testes unitários e WebKit sintético são evidências próprias; janela Tauri e distribuição assinada seguem pendentes. Nenhuma promoção de compatibilidade.

Extração paralela (24/10/2026): [12 plugins independentes e seis bibliotecas Rust externas vinculadas ao host](../research/parallel-plugin-extraction.md). As cópias internas foram removidas após autorização do usuário e testes focados. A extração é evidência arquitetural; a aceitação Tauri completa aguarda desbloqueio da sessão macOS e nenhuma família recebe promoção comparativa.

Standalone PHP tools (23/10/2026): [Xdebug, Composer and PHPUnit/Pest extracted into separate plugin packages](../research/native-tool-plugins.md). Native-tool lifecycle validation is separate from engine/version coverage; no compatibility family is promoted.

> Backend ativo migrado para Rust/Tauri em 22/10/2026. [Validação nativa e lacunas](../research/tauri-migration.md). Resultados Electron históricos não são automaticamente atribuídos ao novo backend.

Splash nativa macOS (23/10/2026): [imagem AppKit embutida antes do WebView e handoff de prontidão](../research/startup-welcome.md). Requisito próprio; Windows/Linux permanecem com splash HTML, sem nova evidência comparativa.

Marketplace próprio (23/10/2026): [catálogo estático, instalação Git e pacotes independentes](../plugins/marketplace.md). Laravel, .env, Docker e Bash passam pelo gerenciador de plugins. Sem nova evidência comparativa com PhpStorm.

# Matriz de compatibilidade funcional — PhpStorm

Manutenção (23/10/2026): [legado removido e cobertura atual](../development/source-cleanup.md). Registros Electron anteriores são históricos e não contam como verificação do runtime Rust/Tauri.

Distribuição própria (23/10/2026): [evidências Windows/Linux e macOS](../research/desktop-distribution.md). Esses testes não medem equivalência funcional com a referência nem alteram os estados das famílias abaixo.

Baseline: 21/10/2026. Referência local: PhpStorm 2026.1.4, macOS 26.3.1 (a); build exato da IDE e keymap ainda não registrados. IDE independente: prévia 0.1.0; ver [recorte](../research/implementation-slice-01.md).

**Catálogo inicial de 46 famílias, ampliado pelos recortes abaixo; 0 famílias validadas por comparação.** Não há percentual de equivalência medido. Há ensaios exploratórios de abertura/busca, sem aprovação de compatibilidade. Ausência de execução é diferente de falha funcional.

| ID | Funcionalidade | Prioridade | Estado | macOS | Windows | Evidência de comparação |
|---|---|---|---|---|---|---|
| PHP-COMP-001 | Autocomplete contextual | P0 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-DEF-001 | Go to Definition | P0 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-USE-001 | Find Usages | P0 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-IMP-001 | Go to Implementation | P0 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-TYPE-001 | Inferência de tipos | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria contra Phpactor; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-IDX-001 | Indexação | P0 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-DOC-001 | PHPDoc | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria contra Phpactor; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-GEN-001 | Generics | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria contra Phpactor; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-TRAIT-001 | Traits | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria contra Phpactor; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-INHERIT-001 | Herança | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria e marcadores na margem; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-IMPORT-001 | Autoimport | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 19](../research/implementation-slice-19.md); testes próprios; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-RENAME-001 | Rename Symbol | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 19](../research/implementation-slice-19.md); testes próprios e smoke nativo; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-VENDOR-001 | Navegação em vendor | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); fixture própria; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| PHP-NATIVE-001 | Funções/classes nativas | P0 | Em desenvolvimento | Não validada | Não executada | [recorte 20](../research/implementation-slice-20.md); stubs do Phpactor; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| UI-PROJECT-001 | Gerenciamento de projetos | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-EDITOR-001 | Editor de código | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-LAYOUT-001 | Layout da IDE | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-PANELS-001 | Painéis | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-TABS-001 | Abas | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-TREE-001 | Explorador de projetos | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-NAV-001 | Navegação | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-SEARCH-001 | Search Everywhere | P1 | Implementada | Não validada | Testes próprios: search-everywhere.md; CSS Islands [31](../research/implementation-slice-31.md); `display` fechado [35](../research/implementation-slice-35.md) | Arquivos, símbolos PHP, ações e texto; casca visual aproximada; equivalência com referência pendente |
| UI-TERM-001 | Terminal | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE; [extração em plugins](../research/parallel-plugin-extraction.md) |
| UI-THEME-001 | Temas | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-SETTINGS-001 | Configurações | P1 | Em desenvolvimento | Não validada | Não executada | Sem comparação referência × IDE |
| UI-KEYMAP-001 | Atalhos | P1 | Em desenvolvimento | Não validada | Não executada | [recorte 23](../research/implementation-slice-23.md); testes próprios; sem comparação |
| UI-CONTEXT-001 | Menus contextuais | P1 | Em desenvolvimento | Não validada | Não executada | [Árvore do projeto](../research/implementation-slice-16.md); sem comparação referência × IDE |
| TOOL-COMPOSER-001 | Composer | P2 | Em desenvolvimento | Não validada | Não executada | [recorte 22](../research/implementation-slice-22.md); testes próprios; sem comparação |
| TOOL-GIT-001 | Git | P1 | Em desenvolvimento | Não validada | Não executada | [Fluxos locais](../research/implementation-slice-04.md), [recorte 27](../research/implementation-slice-27.md); [conflitos comparados em parte](../research/implementation-slice-12.md); [extração em plugins](../research/parallel-plugin-extraction.md) |
| TOOL-PHPUNIT-001 | PHPUnit | P2 | Em desenvolvimento | Não validada | Não executada | [Descobrir/executar/resultados](../research/implementation-slice-15.md); sem comparação referência × IDE |
| TOOL-PEST-001 | Pest | P2 | Em desenvolvimento | Não validada | Não executada | [Descobrir/executar/resultados](../research/implementation-slice-15.md); sem comparação referência × IDE |
| TOOL-XDEBUG-001 | Xdebug | P2 | Em desenvolvimento | Não validada | Não executada | [recorte 21](../research/implementation-slice-21.md); Xdebug 3.4.5 real e UI headless; sem comparação |
| TOOL-LARAVEL-001 | Laravel | P2 | Em desenvolvimento | Não validada | Não executada | [Strings](../research/implementation-slice-10.md), [Blade](../research/implementation-slice-11.md) e [recorte 25](../research/implementation-slice-25.md); comparação parcial só de strings, 1 execução |
| TOOL-DOTENV-001 | Arquivos .env | P2 | Em desenvolvimento | Não validada | Não executada | [env()](../research/implementation-slice-10.md); comparação parcial, 1 execução |
| TOOL-MARKDOWN-001 | Markdown | P2 | Em desenvolvimento | Não validada | Não executada | [Prévia, Mermaid, links e inspeções](../research/implementation-slice-14.md); [plugin externo](../research/markdown-plugin.md); referência observada só por acessibilidade |
| PLUGIN-API-001 | Sistema de plugins | P1 | Em desenvolvimento | Não validada | Não executada | Plugins internos e de terceiros com permissões ([recorte 24](../research/implementation-slice-24.md)); sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| TOOL-SYMFONY-001 | Symfony | P2 | Em desenvolvimento | Não validada | Não executada | [recorte 22](../research/implementation-slice-22.md); testes próprios; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| TOOL-REFACTOR-001 | Refatorações adicionais | P2 | Em desenvolvimento | Não validada | Não executada | [recorte 19](../research/implementation-slice-19.md); testes próprios e smoke nativo; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |
| TOOL-INSPECT-001 | Inspeções | P2 | Em desenvolvimento | Não validada | Não executada | [recorte 19](../research/implementation-slice-19.md); testes próprios e smoke nativo; sem comparação; [extração em plugins](../research/parallel-plugin-extraction.md) |

## Regras para atualizar

- O [catálogo](../research/phpstorm-feature-catalog.md) é a autoridade de escopo; a matriz resume somente o estado sustentado por evidência.
- Validar por caso/perfil: ID, fixture/hash, referência/build, SO/keymap/plugins, resultado, execução da nossa IDE/commit e relatório de diferenças.
- Não promover família inteira por passar um exemplo. Adicionar linhas de subcaso quando necessário e preservar o restante sem validação.
- Teste bloqueado, ignorado ou não executado nunca conta como aprovado. Screenshot, menu, stub ou resposta LSP superficial não bastam.
- Mudança de PHP, stubs, plugin, motor ou perfil exige revisar quais resultados precisam ser repetidos. Manter histórico; não apagar regressões.
- Compatibilidade só pode ser declarada no perfil testado. Não estender macOS para Windows automaticamente.

## Histórico

| Data | Mudança | Evidência |
|---|---|---|
| 23/10/2026 | Recortes 19–27 em paralelo: Rename/Autoimport/Inspeções/Extract (19), semântica PHP P0 (20), Xdebug (21), Composer e Symfony (22), keymap (23), plugins de terceiros (24), Eloquent (25), Oracle e Redis (26), cobertura Git/remotos/versões de banco (27). Correções de integração: versão de documento PHP que recomeçava ao reabrir arquivo ("Documento obsoleto"), refatoração de arquivo único passa a editar o buffer, progresso do servidor não apaga o status de ações. Smoke nativo `--no-db` e `--web-only` aprovados; nenhuma família validada por comparação | [Recortes 19–27](../research/README.md) |
| 22/10/2026 | Arquivos ignore (`.gitignore`, `.dockerignore`, `.git/info/exclude`): linguagem própria no editor e plugin de completion (segmentos de caminho relativos ao arquivo, `!`/`/` preservados, padrões comuns, sem repetir entradas); requisito próprio, referência não observada; sem família no catálogo, nenhuma validada. Limite: diretórios omitidos pelo backend (`vendor`, `node_modules`, `.git`…) só aparecem pelos padrões comuns | `tests/gitignore.test.ts` |
| 22/10/2026 | Recorte 14: plugin Markdown (prévia, Mermaid, links, âncoras, inspeções, imagens locais) e ganchos `documents`/`diagnose` na API de plugins; observação parcial da referência; nenhuma família validada | [Recorte 14](../research/implementation-slice-14.md) |
| 22/10/2026 | Recorte 17: agentes ACP com alterações pendentes (porte Rust/Tauri) e motivo de falha do agente; nenhuma família validada | [Recorte 17](../research/implementation-slice-17.md) |
| 22/10/2026 | Recorte 13: console SQL, modelo de schema e SQL em strings PHP; nenhuma família validada | [Recorte 13](../research/implementation-slice-13.md) |
| 22/10/2026 | Recorte 12: merge de três painéis e lista de conflitos; correção de lock do index; nenhuma família validada | [Recorte 12](../research/implementation-slice-12.md) |
| 22/10/2026 | Recorte 11: Blade (componentes, props, variáveis) e traduções no plugin Laravel; nenhuma família validada | [Recorte 11](../research/implementation-slice-11.md) |
| 22/10/2026 | Recorte 10: plugins Laravel/.env e famílias TOOL-DOTENV-001 e PLUGIN-API-001; nenhuma família validada | [Recorte 10](../research/implementation-slice-10.md) |
| 22/10/2026 | Recorte 09: subcasos de completion e strings observados no PhpStorm e testados localmente; nenhuma família promovida | [Recorte 09](../research/implementation-slice-09.md) |
| 21/10/2026 | Baseline com 36 famílias, nenhuma implementação e nenhuma validação | [Observações exploratórias](../research/phpstorm-observations.md), [plano de testes](../research/phpstorm-compatibility-test-plan.md) |


## Recorte independente (não constitui compatibilidade)

| Caso | Resultado local | Comparação com PhpStorm |
|---|---|---|
| Alias → método de User; trait → HasId | Teste real LSP aprovado | Pendente |
| Autocomplete de buffer não salvo | Teste real LSP aprovado | Pendente |
| identity<T> → método | Falha conhecida: destino null | Pendente |
| Salvar com conflito externo e caminhos confinados | Testes aprovados | Pendente |
| DB-PG-001 / DB-MYSQL-001: exploração e prévia paginada | Integração real aprovada | Pendente |
| COMP-OBS-01/02/03: membros públicos com tipo, inserção `nome()` | Teste real LSP e UI aprovados | Observado no PhpStorm 2026.1.4, 1 execução ([recorte 09](../research/implementation-slice-09.md)) |
| COMP-OBS-04: classes `[Namespace]`, projeto + stubs | Teste real LSP aprovado | Ordenação diferente (REQ próprio) |
| STR-FILE-01/02, STR-CLASS-01, STR-NEG-01: Ctrl+clique em strings | Teste real LSP e UI aprovados | Destinos iguais aos observados, 1 execução |
| STR-CALLABLE-01: `[User::class, 'label']` | Aprovado | Arquivo/linha iguais; coluna diferente (9:5 × 9:21) |
| OBS-LV-NAV-01…09: route/view/config/env | Testes e UI aprovados | Destinos iguais aos observados, 1 execução ([recorte 10](../research/implementation-slice-10.md)) |
| OBS-LV-COMP-01…04: listas em strings | Testes e UI aprovados | Itens e ordem iguais; posição visual dos valores não verificada |
| OBS-BL-NAV-01…03: `<x-…>` e atributos | Testes e UI aprovados | Destinos iguais; escolha em peek em vez de popup ([recorte 11](../research/implementation-slice-11.md)) |
| OBS-BL-COMP-01…03: tags, props e variáveis | Testes e UI aprovados | Itens do projeto iguais; sem atributos HTML, diretivas e componentes de vendor |
| Traduções `__()` | Testes aprovados | Referência inconclusiva; implementação pela documentação |
| OBS-MRG-02…10: Conflicts e Merge Revisions | Testes e UI aprovados | Fluxo, contadores e resultado iguais ao observado; ações por chunk sem oracle ([recorte 12](../research/implementation-slice-12.md)) |
| OBS-SQL-COMP-01…04 / NAV-01…02: SQL em strings PHP | Testes, banco real e UI aprovados | Itens e caudas iguais; ordem própria; schemas além de public ([recorte 13](../research/implementation-slice-13.md)) |
| OBS-SQL-CON-01…02: console SQL | Testes, banco real e UI aprovados | Execução e grade equivalentes; resultados no painel do editor em vez de Services |
| DDL gerado (PostgreSQL) | Idêntico ao da referência para `orders` | Comparado caractere a caractere |
| DB-MARIA-001 | MariaDB 11.4: exploração e prévia aprovadas em integração | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| DB-MSSQL-001 | SQL Server 2022 (emulado): conexão, navegação, prévia, console e DDL aprovados em integração ([recorte 18](../research/implementation-slice-18.md)) | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| DB-REDIS-001 | Redis 7: SCAN, tipo, TTL, prévia, console, edição pela prévia, CA em TLS e paginação por cursor aprovados em integração ([recorte 26](../research/implementation-slice-26.md)) | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| DB-SQLITE-001 | Teste Rust ponta a ponta aprovado | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| Diálogo de fontes de dados (abas, URL, SSL, SSH, schemas, sem senha em disco) | Fluxo na janela Tauri real aprovado com PostgreSQL | Não observado; layout a partir da documentação pública |
| DB-ORACLE-001 | Oracle Free 23: conexão, metadados, prévia, console PL/SQL e DDL aprovados em integração ([recorte 26](../research/implementation-slice-26.md)) | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| AI-CODEX-001: handshake/autenticação | Aprovado; streaming/conclusão também aprovados; interrupção pendente | Não mede equivalência de agente |
| AI-ACP-001: sessão, permissão, pendências, manter/descartar, escrita externa recusada | Teste nativo com agente ACP falso: RESULTADO_NATIVO | Referência observada só na interface, sem conversa ([recorte 17](../research/implementation-slice-17.md)) |
| AI-ACP-001: motivo de falha na inicialização (stderr do agente) | Teste Rust aprovado | Sem comparação |

Não há medidas de latência ou precisão em projetos grandes. Nenhuma conclusão de “indexação perfeita”. Evidências e comandos no [relatório do recorte](../research/implementation-slice-01.md).

Ensaio UI executado: abrir probe.php → F12 → User.php, passando no Electron real/macOS. Sem erros do renderer. Isso confirma o fluxo local, não a paridade com o PhpStorm.

## Recorte 02 — validação local de navegação

| Subcaso | Evidência local | Compatibilidade com PhpStorm |
|---|---|---|
| NAV-REF-02 | Conjunto exato do fixture; exclui homônimo e string | Pendente |
| NAV-IMP-02 | Interface → First/Second; UI → User/Admin | Pendente |
| IDX-ADD/EDIT/DELETE-02 | Convergência após criar, salvar atomicamente e excluir, usando soft reindex e cache | Pendente |
| IDX-WARM-02 | Resultados preservados ao reiniciar com o cache | Pendente |

[Relatório, mecanismo e limites](../research/implementation-slice-02.md). Atualização não é puramente por eventos; consultas concorrentes à exclusão exigiram tratamento de corrida. Nenhuma nova família foi marcada como Validada.

## Recorte 03 — Git local

Status, diff HEAD/index/disco, staging por arquivo, revisão/cancelamento/commit local e histórico simples têm testes de integração/UI próprios. Conteúdo não preparado é preservado no fixture. [Evidências e limites](../research/implementation-slice-03.md). Não foram executados os mesmos casos no perfil de staging do PhpStorm; zero novas famílias validadas.

## Recorte 04 — Git ampliado

Trechos de staging, commit → arquivo → diff, branches locais, merge/rebase, editor textual de conflitos, stash e fetch/pull/push em remoto bare local: implementação e testes próprios. [Perfis suportados, evidências e diferenças](../research/implementation-slice-04.md). Comparação com PhpStorm pendente; nenhuma promoção para Validada.

## Recorte 05 — bancos, navegação e aparência

PostgreSQL 16, MySQL 8.4 e MariaDB 11.4: integração própria aprovada para exploração, metadados e prévia paginada somente leitura. Electron/macOS: Cmd/Ctrl+clique, histórico por posição, fechar abas, fluxo PostgreSQL, temas, fonte e resize por teclado aprovados. [Evidências e limites](../research/implementation-slice-05.md). Oracle, SQL Server, Redis, console SQL e escrita continuam pendentes. Sem validação comparativa ou equivalência visual medida.

## Recorte 06 — organização visual

Barras laterais, painéis recolhíveis, cabeçalho de projeto/Git e hierarquia de abas/rodapé implementados. [Escopo e evidência](../research/implementation-slice-06.md). A revisão melhora a organização; não mede fidelidade visual nem promove qualquer família para Validada.

## Recorte 07 — contas Git por repositório

Configuração local de identidade e autenticação HTTPS/SSH, herança e teste de leitura do remoto: [escopo e testes próprios](../research/implementation-slice-07.md). Provedores externos, OAuth e comparação com PhpStorm não validados.

## Recorte 08 — terminal

PTY real, múltiplas sessões, teclado/Ctrl+C, resize e ciclo de vida por projeto. [Implementação e testes](../research/implementation-slice-08.md). macOS testado; Windows/Linux e comparação com PhpStorm pendentes.


### Correções de editor e UX (2026-10-22)

Cmd/Ctrl+clique, sugestões no widget, runtime PHP local, ícones/paleta e diálogo de conexão receberam um novo recorte. Evidências e limites em [editor-ux-corrections.md](../research/editor-ux-corrections.md). Permanecem em desenvolvimento; teste local não comprova equivalência com PhpStorm.


### Usos e alterações Git no editor — 2026-10-22

| ID | Recorte | Estado de equivalência | Evidência e diferenças |
|---|---|---|---|
| NAV-USAGES-POPUP | ⌘/Ctrl+clique na declaração, popup filtrável, abrir chamada | Em desenvolvimento | LSP e navegação na janela Tauri; sem Code Vision/hierarquia de chamadas |
| GIT-LINE-CHANGES | Marcas adicionadas/modificadas/removidas e popup de diff | Em desenvolvimento | HEAD versus buffer, incluindo não salvo; sem stage/revert no popup |
| GIT-LINE-AUTHOR | Autor/commit da linha no buffer | Em desenvolvimento | Git Blame por stdin; sem annotations permanentes/histórico de seleção |

Especificação, aceitação, dependências e limites em [editor-usages-git.md](../research/editor-usages-git.md). Testes locais não promovem compatibilidade com a referência.


Correção NAV-USAGES-POPUP (2026-10-22): o reconhecimento de declarações agora inclui classes, interfaces, traits e enums. Casos de uso continuam navegando para a definição. Evidência detalhada em `docs/research/editor-usages-git.md`; equivalência permanece Em desenvolvimento.


### PROJECT-RECENT-001 — Projetos recentes (2026-10-22)

Popup no seletor de projeto: busca, caminho, indicação do atual/indisponível, reabertura, remoção e limpeza. Histórico Rust persistente com MRU, limite de 30 e retomada do último disponível. Prioridade alta; complexidade média; depende de configuração nativa, seleção de pastas e ciclo de troca de projeto. **Em desenvolvimento** na equivalência. Aceitação e evidências: [recent-projects.md](../research/recent-projects.md). Diferenças: somente janela atual, sem grupos/favoritos; Welcome adicionado no recorte seguinte; nenhuma comparação lado a lado realizada.


### Docker integrado — 2026-10-22

Services inferior com contextos, containers, imagens, volumes, redes, logs, ações de ciclo de vida, PTY exec e Compose. Download/Compose têm progresso e cancelamento. IDs DOCKER-CONNECT/SERVICES/LOGS/EXEC/COMPOSE/IMAGES-001: **Em desenvolvimento**. Evidência nativa com CLI sintético; engine real inicialmente indisponível. Sem equivalência global ou validação de daemon presumida. Especificação, dependências, complexidade, critérios e diferenças: [docker-integration.md](../research/docker-integration.md).


### Inicialização e Welcome — 2026-10-22

STARTUP-SPLASH-001, PROJECT-WELCOME/CREATE/CLONE/SESSION-001: **Em desenvolvimento** na equivalência. Splash em HTML, falha recuperável, Welcome com recentes, novo projeto PHP, abrir, clone Git e sessão persistente. Treze testes Rust e seis cenários no pacote nativo aprovados; clone local descartável real. Sem inspeção do PhpStorm local nesta sessão; sem equivalência visual presumida. Critérios, dependências, evidências e diferenças: [startup-welcome.md](../research/startup-welcome.md).


### UI-FILE-ICONS-001 — Arquivos e pastas (2026-10-22)

SVGs oficiais open source da IntelliJ Platform, individualmente Apache 2.0, para árvore e abas; variantes clara/escura, pastas por convenção e fallback. Badge PHP próprio por não haver declaração explícita no SVG de logotipo consultado. Recorte implementado; equivalência global **Em desenvolvimento**. Sem extração da instalação ou comparação local. Licença, origem fixada, aceitação e evidências: [file-icons.md](../research/file-icons.md).


### UI-THEME-002 — Aparência (2026-10-22)

Claro, escuro e sistema; painel não modal com prévia ao vivo, amostras e botão rápido; paleta compartilhada com Welcome, editor e ferramentas. Recorte implementado; equivalência **Em desenvolvimento**. Aceitação, dependências, contraste, evidências e limites em [appearance-themes.md](../research/appearance-themes.md).

Fundação Islands Dark/Light (tokens, tipografia Inter/JetBrains Mono, shell em ilhas): [recorte 28](../research/implementation-slice-28.md); conferência parcial vs screenshots 03/05/40: [recorte 31a](../research/implementation-slice-31-foundation-check.md). Fatias de fidelidade (sem promoção): [31](../research/implementation-slice-31.md)–[34](../research/implementation-slice-34.md); regressão popup fechado × Cmd+clique: [35](../research/implementation-slice-35.md). **Não** promovido a “compatível neste perfil” — só geometria/tokens observados; captura WKWebView desta sessão bloqueada por TCC. Resize de Services no smoke: [recorte 30](../research/implementation-slice-30.md).

### UI-LANGUAGE-001 — Idiomas da interface (2026-10-22)

Português e inglês selecionáveis em Aparência e Welcome; catálogo extensível, preferência persistida, aplicação por recarga protegida contra buffers não salvos. Recorte implementado; equivalência **Em desenvolvimento**. Critérios, evidências e limites: [interface-languages.md](../research/interface-languages.md).

### GIT-BRANCH-POPUP/CREATE/SWITCH/DELETE/FETCH/PULL-002 — 2026-10-22

Recorte implementado: popup no topo com busca, branches locais/remotas, criar com checkout opcional, troca e tracking remoto, exclusão local confirmada, fetch de todos os remotos e pull fast-forward pelo upstream. Equivalência **Em desenvolvimento**, baseada em documentação pública; sem observação direta nesta sessão. Critérios, evidências e diferenças: [git-branches.md](../research/git-branches.md).

### GIT-LOG/COMMIT-UI-002 · DOCKER-SERVICES/ACTIONS-UI-002 · UI-DOCK-002 — 2026-10-22

Recorte implementado: Git Log inferior com branches/tabela/detalhes e filtros reais; Commit lateral; Docker com árvore compacta, Dashboard, filtros de parados/logs e menu de contexto; dock compartilhado com terminal, altura persistida. Equivalência **Em desenvolvimento**. Imagens/documentação oficiais examinadas no navegador; sem inspeção nativa nesta sessão. Critérios, testes e diferenças: [git-docker-tool-windows.md](../research/git-docker-tool-windows.md).

### EDITOR-SELECTION-002 — Correção própria (2026-10-22)

Gesto Cmd/Ctrl+clique confirmado ao soltar, sem cancelar seleção por arraste; cores de brackets consistentes entre modelos; diff segue tema global. Causa das cores e seleção invisível reproduzida no pacote: CSS inline do splash gerava nonce CSP que bloqueava estilos dinâmicos do Monaco. CSS externalizado sem alterar a política; teste de pacote passou após a correção. Evidências e limites: [editor-selection-regression.md](../research/editor-selection-regression.md). Equivalência **Em desenvolvimento**.

### PHP-FUNCTION-REFERENCES-002 — 2026-10-22

Correção do crash de FunctionQuery no Phpactor quando o índice não contém registro da função; patch MIT reproduzível e manifesto de integridade incluído no pacote. Equivalência **Em desenvolvimento**; retorno vazio representa apenas ausência de referências conhecidas pelo índice. Reprodução, testes e limites: [php-function-references.md](../research/php-function-references.md).


### EDITOR-TABS-MIDDLE-001 — Fechar aba pelo botão do meio
Implementada: clique na roda do mouse sobre a aba usa o mesmo fechamento do botão ×. Arquivos modificados permanecem abertos, com aviso para salvar. Teste de interface WebKit verifica fechamento, proteção de alterações e botão direito sem fechar. Requisito próprio; comparação com PhpStorm ainda não validada.


### EDITOR-TABS-CONTEXT-001 — Menu de fechamento de abas
Implementada: botão direito na aba oferece fechar esta, outras ou todas. Operações em lote preservam buffers alterados com aviso para salvar; alvo de fechar outras é a aba clicada, mesmo inativa. Menu aceita setas, Home/End e Escape. Teste WebKit cobre as três operações e proteção de alterações; equivalência com PhpStorm ainda não validada.


### PHP-TYPE-ICONS-001 — Ícones semânticos PHP
Implementada: classes (C azul), interfaces (I verde), traits (T âmbar) e enums (E violeta) têm badges SVG próprios nos temas claro/escuro. Árvore e abas identificam declarações pelo conteúdo usando o analisador léxico existente, ignorando comentários/strings/classes anônimas. Arquivos com múltiplas declarações usam a que corresponde ao nome do arquivo; sem correspondência inequívoca, mantêm PHP genérico. Blade permanece genérico. Abas e árvore acompanham alterações no buffer. A árvore lê apenas PHP do diretório exibido, com até quatro leituras simultâneas; não percorre vendor recursivamente para ícones. Sugestões do índice local preservam o tipo e usam badges equivalentes; trait usa Struct apenas na apresentação Monaco, conservando o tipo LSP original. Sugestões externas sem metadados continuam com ícones LSP. Não há variantes adicionais de classe abstrata/final, visibilidade ou validação comparativa com PhpStorm.
Evidências próprias: scripts/check-php-file-kind.ts e scripts/check-editor-selection.mjs --webkit. Critérios: quatro tipos distintos em árvore/abas, SVGs claro/escuro carregados, classificação por conteúdo e fallback seguro para ambiguidades; tipos preservados nas sugestões. Estado: Implementada; equivalência com a referência não validada.


### PHP-EDITOR-USAGES-001 — Cores PHP e contagem de usos
Estado: Implementada. Prioridade: máxima. Complexidade: média. Dependências: lexer PHP próprio, Monaco e referências do Phpactor via Rust. Funções/métodos exibem contagem clicável; zero referências no índice esmaece o nome de declarações elegíveis. Variáveis, métodos, funções e construtores recebem categorias visuais distintas. Erro, edição e análise pendente são estados separados. Evidência visual da referência: screenshots fornecidos pelo usuário em 22/10/2026; versão/configuração não registradas. Critérios, testes e limites em docs/research/php-editor-usages.md. Não valida equivalência integral: chamadas dinâmicas, consumers externos e indexação incremental podem limitar a contagem; não implementa as demais inspeções dos screenshots.


### EDITOR-MULTICURSOR-001 — Editar várias linhas/ocorrências
Estado: Implementada. Prioridade: alta. Complexidade: baixa/média; integração das ações Monaco. Dependências: editor Monaco e keymap por plataforma. Menu/paleta oferecem próxima/todas as ocorrências, remover último cursor, cursores acima/abaixo, cursores no fim das linhas selecionadas e alternância de coluna. Alt/Option+clique adiciona cursores; o rodapé mostra quantidade e modo. Critérios/evidências/atalhos em docs/research/editor-multicursor.md. Testes próprios de interface e Tauri não comprovam equivalência com todos os keymaps do PhpStorm; refatoração semântica entre arquivos e configuração livre de atalhos ficam fora deste recorte.


Ajuste de UX em 22/10/2026: removido o botão Salvar da barra superior a pedido do usuário. O comando continua disponível por ⌘S/Ctrl+S e pela ação Salvar arquivo na paleta/busca geral. Este ajuste não introduz salvamento automático nem altera o estado de compatibilidade da referência. Typecheck, 22 testes Rust e ensaio WebKit de interface passaram.

## Inteligência web — 22/10/2026

As três famílias abaixo acrescentam recortes ao catálogo original. [Escopo, versões e testes](../research/web-language-services.md). Nenhuma ganhou validação comparativa.

| ID | Recorte | Estado | Evidência própria | Comparação PhpStorm |
|---|---|---|---|---|
| WEB-JSTS-001 | Autocomplete, tipos, navegação JS/TS | Em desenvolvimento | Worker real TypeScript; fixture multiarquivo | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| WEB-REACT-001 | JSX/TSX, props e useState | Em desenvolvimento | Declarações React e serviço TS reais | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |
| WEB-VUE-001 | Template, script setup e props importadas | Em desenvolvimento | Volar real em WebKit | Pendente; [extração em plugins](../research/parallel-plugin-extraction.md) |

## Organização e guias de plugins — 23/10/2026

[Índice atual](../README.md), [tutorial de autoria](../plugins/getting-started.md), [API](../plugins/api.md) e [limites](../plugins/permissions.md) foram separados do registro histórico. A documentação explicita que linguagens aceitas pelo manifesto não garantem integração de todos os hooks ao editor. Esta entrega não acrescenta capacidades ao runtime nem altera PLUGIN-API-001 de Em desenvolvimento/Não validada.

### Welcome compacta — 23/10/2026

PROJECT-WELCOME/SESSION-001: janela menor centralizada sem projeto, restauração do tamanho anterior ao abrir projeto. Estado comparativo continua Em desenvolvimento/Não validada; requisito relatado pelo usuário, sem nova medição do PhpStorm. Detalhes em startup-welcome.md.

### Git — reprodução visual (23/10/2026)

TOOL-GIT-001 permanece **Em desenvolvimento / não validada**. Log e Commit reorganizados a partir da imagem oficial; grafo usa parentesco real, filtros/seleção/diff preservados. [Referência, validação própria e limites](../research/git-ui-2026-10-23.md).

Commit refinado a partir das duas capturas do usuário: toolbar, árvore com checkboxes, nomes/pastas e área Amend/mensagem/ações. Staging explícito, amend com revisão e Commit and Push ligado à revisão de envio. [Detalhes e limites](../research/git-ui-2026-10-23.md). Sem validação integral de equivalência.

### Banco — diálogo e importação Laravel (23/10/2026)

Diálogo reorganizado e importação de `.env` para rascunho revisável, sem conexão automática nem persistência de senha. Fixtures WebKit, Rust e janela Tauri passaram. Configuração PHP/cache, interpolação e opções adicionais de URL ficam fora do recorte. Estado comparativo permanece **Em desenvolvimento / não validada**. [Evidências e limites](../research/database-connection-laravel.md).

### DotEnv — editor (23/10/2026)

TOOL-DOTENV-001: corrigida a ausência de linguagem/providers para `.env`; realce, sugestões em `${...}` e navegação para declarações locais. Ativação Laravel/DotEnv e fluxo do editor confirmados em Tauri com fixture sintética. Estado comparativo **Em desenvolvimento / não validada**. [Evidências e limites](../research/dotenv-editor.md).

### TOOL-DOCKER-LANGUAGE-001 — Dockerfile e Compose (23/10/2026)

P1, complexidade média. Plugin interno com detecção de variantes/nomes alternativos, realce Monaco, completion de instruções/propriedades, hover, navegação entre estágios/serviços e diagnósticos locais YAML/Dockerfile. Dependências: host TypeScript, Monaco e yaml (ISC), sem engine Docker. Critério exercitado: abrir fixture, completar, navegar e corrigir erro visível na janela Tauri. Estado **Em desenvolvimento / não validada comparativamente**; schema completo, merges entre arquivos e validação de build/daemon permanecem fora. [Escopo e evidências](../research/docker-editor.md).

### TOOL-BASH-LANGUAGE-001 — Bash e scripts sh (23/10/2026)

P1, complexidade média. Plugin interno para extensões/dotfiles/shebang, realce, completion de builtins e símbolos locais, hover e F12. Verificação de sintaxe no buffer via shell do sistema em modo -n, sem executar script. Critério exercitado em Tauri: abrir, completar, navegar e corrigir diagnóstico visível; fixture também comprova ausência de execução. Estado **Em desenvolvimento / não validada comparativamente**. Dependências e limites (versão do shell, índice léxico, sem ShellCheck/semântica global): [evidências](../research/bash-editor.md).

### Árvore — arquivos e pastas ignorados (23/10/2026)

TOOL-GIT-001: cor de ignorado aplicada a nomes na árvore usando estado Git real, incluindo herança, negação e exceção de rastreados. Dependências antes ocultas por nome ficam visíveis e expandem sob demanda. Atualização preserva expansão e foi exercitada nos dois temas em Tauri com fixture. Estado comparativo **Em desenvolvimento / não validada**. [Implementação, evidências e limites](../research/git-ignored-tree.md).

### TOOL-SVG-PREVIEW-001 — Fonte e imagem SVG (23/10/2026)

P1, complexidade média. Fonte XML, visualização dividida/imagem, atualização do buffer, zoom/fundos e recuperação de erro. Dependências: Monaco e contexto de imagem do navegador; sem execução de scripts SVG na IDE. Critérios exercitados em Tauri: pixels mudam sem salvar, XML inválido recupera, modo/layout alternam e zoom 100% permanece correto no WebKit. Regressão Markdown passou. Estado **Em desenvolvimento / não validada comparativamente**. [Evidências e limites](../research/svg-preview.md).

### Vue.js e React — disponibilidade (23/10/2026)

WEB-VUE-001 e WEB-REACT-001: serviços já incluídos/habilitados agora aparecem em Aparência → Plugins. Tela e fluxo dos serviços reais verificados na janela Tauri. Não é instalação de extensão de terceiros nem nova cobertura de framework; estado comparativo continua Em desenvolvimento / não validada. [Disponibilidade, testes e limites](../research/web-language-services.md).

### Formatação — 23/10/2026

CODE-FORMAT-001 / PLUGIN-API-001: Em desenvolvimento, não validadas contra a referência. Hook format, pacote Prettier instalável e printer PHP independente com verificação AST/tokens, undo e descarte de respostas obsoletas. Critérios, testes e limites em [formatação](../development/formatting.md). Não equivale ao conjunto completo do Code Style PhpStorm.

Instalação de plugins padrão por repositórios (23/10/2026): requisito próprio de distribuição. Build sem cópias dos pacotes; não estabelece compatibilidade com o Marketplace ou plugins do PhpStorm. Ver [fluxo e limites](../plugins/marketplace.md).


#### Visualização de imagens (23/10/2026)

Requisito próprio implementado: arquivos raster abrem em abas de visualização, com ajuste, zoom, fundos para transparência, dimensões e recuperação de erro. Leitura confinada ao projeto por `readImage`, até 5 MiB; SVG mantém seu fluxo separado de fonte/prévia. Transporte habilitado para PNG/JPEG/GIF/WebP/BMP/ICO/AVIF, com decodificação dependente do sistema. Roteiros específicos: `npm run test:images`, `npm test -- preview_images` e `npm run test:native -- --no-db --image-only`. Não equivale a aprovação de todos os formatos nem a validação comparativa com PhpStorm. Detalhes e resultados no catálogo de funcionalidades.


Evidência deste recorte de imagens: typecheck, idiomas, teste Rust `preview_images`, nove cenários WebKit do visualizador e cenário PNG em Tauri real aprovados. Relatórios `.artifacts/image-preview-webkit.json` e `.artifacts/image-preview-native.json`. A suíte Rust geral teve falha/interrupção em cenários Git; não foi declarada aprovada. Demais codecs e equivalência com PhpStorm seguem sem validação individual.

## SPEC-14 — connection-aware SQL completion

| Capability | Independent implementation evidence | PhpStorm comparison |
|---|---|---|
| Active-session metadata, aliases/schemas, CTE/derived projections and scoped columns | PostgreSQL 16, MySQL 8.4 and MariaDB 11.4 passed production-worker/native Tauri acceptance; real Monaco popup, Enter/Tab/undo, PHP connection switch, DDL refresh and lifecycle checked | No new reference observation; equivalence not established |
| Large SQL catalogs | Separate synthetic worker measurements at 10k relations/100k columns and 50k/500k; serialized payload measured, actual heap unavailable | Not compared |
| SQLite, SQL Server and Oracle SQL intelligence | Active-session metadata and bounded dialect rules passed native Tauri popup/keyboard, aliases/CTEs/derived scopes and DDL tests; SQLite attachments/temp/generated columns, SQL Server TOP/APPLY and real case-sensitive collation/USE switching, and Oracle metadata past 100 columns checked; full vendor grammars remain unsupported | Not compared |

[Evidence and limitations](../research/sql-intelligence.md). This record does not promote the database or SQL families as a whole. Existing DDL navigation remains separately scoped.
