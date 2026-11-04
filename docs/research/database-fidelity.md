# Database: cancelamento, somente leitura, Oracle TNS/TCPS, DDL SQL Server, Redis e grade (04/11/2026)

Implementação no plugin `plugin-database` (`main` local, commits `dba64e6`…`0eb56eb`, sem push e sem nova versão). O host recebeu só a liberação de dois serviços novos (`databaseGridEdit`, `databaseTnsNames`) em `src-tauri/src/tool_plugins.rs`. Como a parte nativa mudou, a fixação do `plugin-database` no `src-tauri/Cargo.toml` precisa ser atualizada depois do push.

## Evidência

- **DOC:** documentação pública da JetBrains (DataGrip/PhpStorm Database: *Data sources and drivers*, *Run queries*, *Table editor*, *Filter and sort data*, *Edit data*, *Redis*). Atalhos citados ali para macOS: ⌘F2 para parar, ⌘↩ para Submit, ⌘N para adicionar linha, ⌘⌫ para excluir linha, ⌘⌥Z para Revert.
- **OBS:** nada observado na tela do PhpStorm nesta sessão. A captura `28-database-toolwindow` mostra só a janela vazia. Nenhum banco do usuário foi conectado.
- **REQ:** requisitos próprios estão marcados abaixo. Exemplos: a mensagem de recusa do modo somente leitura, o formato hexadecimal dos binários e a validação dos filtros.
- **HIP:** é hipótese que o DataGrip omite `not null` em PK identity e mostra defaults sem parênteses. O DDL foi validado reexecutando no servidor, não comparando com a referência.

## Critérios e validação

| Item | Critérios | Testes |
|---|---|---|
| Parar (Stop/⌘F2) | Botão ■ no console, habilitado só durante a execução, e ⌘F2 em qualquer foco. A consulta termina logo, o resto do lote é pulado, a aba mostra "Cancelado" e a sessão segue utilizável. | `sqlite_cancel_…` (Rust); `live_fixtures`/`cancel_live` em PG 16, MySQL 8.4, MariaDB 11.4, SQL Server 2022, Oracle Free 23 e Redis 7; harness WebKit |
| Somente leitura | A opção existe para todos os drivers, com texto sobre a garantia de cada um. Escrita, DDL e permissões são recusadas antes do envio. O servidor reforça: PG/MySQL em sessão read-only, SQLite com arquivo read-only, Oracle com `SET TRANSACTION READ ONLY` e SQL Server com transação sempre desfeita. No Redis, só comandos de leitura passam e a edição pela prévia fica desligada. | `read_only::tests`; `live_fixtures` com UPDATE/DROP/SELECT INTO recusados e dados intactos; Redis com GET aceito e SET/edição recusados |
| Oracle TNS/TCPS | Tipo de conexão TNS com TNS_ADMIN (campo, `TNS_ADMIN` ou `ORACLE_HOME`), lista de aliases com endereço, IFILE e Easy Connect. URL `jdbc:oracle:thin:@ALIAS`. `PROTOCOL=TCPS` força TLS com CA, `MY_WALLET_DIRECTORY` e `SSL_SERVER_CERT_DN`. | `tns_tests`; `live-databases.mjs oracle-tcps`: TCPS direto e por alias com TLS terminado por socat diante do Oracle, CA errado e TCP puro recusados, TNS sobre TCP |
| DDL SQL Server | Defaults com nome, identity com semente, colunas computadas, PK/UNIQUE/FK/CHECK de uma coluna junto da coluna e compostas no fim, `create index` com include/filtro/clustering e `go`. | `mssql_ddl::tests`; `mssql_ddl_live`: recriar a tabela pelo DDL gera o mesmo DDL |
| Redis | Nova chave dos seis tipos sem sobrescrever, com TTL opcional. Stream com Add entry (`*` ou ID explícito) e Delete entry. Valores não imprimíveis aparecem em hexadecimal, marcados na grade, e editam com formato Texto/Hex e compara-e-grava em bytes. | `redis_create_stream_binary_live`; `binary_values_round_trip_as_hex`; harness WebKit |
| Grade | Barra WHERE / ORDER BY (Enter aplica, Esc limpa). Clique no cabeçalho ordena asc → desc → nenhum, e Shift acrescenta. Edição inline por duplo clique, Enter, F2 ou digitação. ⌘N, ⌘⌫, NULL, ⌘↩ e ⌘⌥Z. Alterações pendentes ficam coloridas e paginação/filtro ficam bloqueados. O Submit grava tudo numa transação pela PK e desfaz tudo se algum comando não afetar exatamente uma linha. O resultado do console ordena localmente. | `sqlite_grid_…`, `grid_live` nos 5 SGBDs SQL, `tests/grid.test.ts`, harness WebKit |

Harness WebKit: `DATABASE_PLUGIN_DIR=~/Projects/plugin-database node scripts/check-database-fidelity.mjs`. Ele usa a porta 1457, ou `HARNESS_PORT`, e roda com o shell real, o Monaco e uma API sintética que registra as chamadas.

## Limitações conhecidas

- **Oracle:** sem permissão `ALTER SYSTEM`, o Stop abandona a chamada após 2 s e reabre a conexão, e o servidor pode seguir executando até perceber o socket fechado. O oracle-rs não expõe *break*.
- **SQL Server:** o Stop usa `KILL`, que exige `ALTER ANY CONNECTION`. A sessão do console é reaberta e a transação aberta se perde. O DataGrip envia *attention* e preserva a sessão.
- **MySQL:** um `SLEEP()` interrompido devolve resultado, não erro. Os comandos seguintes do lote são pulados mesmo assim.
- **Somente leitura:** o classificador é conservador. `SELECT … FOR UPDATE`, `EXEC`/`CALL` e blocos PL/SQL são recusados. Para colunas com nome de palavra reservada de escrita, como `insert`, é preciso usar aspas.
- **TNS:** usa o primeiro ADDRESS TCP/TCPS, sem balanceamento nem failover. Não há LDAP, e wallet só no formato PEM aceito pelo oracle-rs. A verificação de DN depende do driver.
- **Redis:** chaves cujo nome não é UTF-8 não aparecem na árvore. Entradas de stream não são editáveis, porque o Redis só acrescenta.
- **Grade:**
  - Tabelas sem PK ficam somente leitura.
  - Células truncadas (> 512 caracteres) e tipos binários ou espaciais não são editados.
  - O valor é enviado como texto: Oracle DATE depende do NLS e SQL Server binário não converte.
  - Não há edição de resultados do console, nem modo *auto-submit*, nem desfazer por célula.
- **Comparação:** não houve comparação visual nem de comportamento com o PhpStorm. Os itens ficam em desenvolvimento, sem promoção de compatibilidade.
