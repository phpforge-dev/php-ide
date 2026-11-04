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

As limitações abaixo foram revistas na [rodada 2](#rodada-2-04112026); as que ela resolveu estão marcadas.

- **Oracle:** ~~sem *break*~~ (rodada 2: break em banda). Se o servidor não confirmar o break em 5 s, a IDE tenta `ALTER SYSTEM CANCEL SQL` e reabre a conexão.
- **SQL Server:** ~~Stop por `KILL`~~ (rodada 2: *attention* TDS). `KILL` ficou só como reserva, quando o servidor não confirma a *attention* em 5 s.
- **MySQL:** ~~`SLEEP()` interrompido devolve resultado~~ (rodada 2: vira erro).
- **Somente leitura:** ~~`FOR UPDATE`, `CALL` e palavras reservadas recusados~~ (rodada 2). Ainda são recusados blocos PL/SQL, `CALL` no Oracle e `EXEC` de procedimentos de usuário no SQL Server.
- **TNS:** ~~sem failover nem balanceamento~~ (rodada 2). Continuam sem suporte DESCRIPTION_LIST e LDAP. Wallet só no formato PEM aceito pelo oracle-rs, e a verificação de DN depende do driver.
- **Redis:** ~~chaves com nome não UTF-8 fora da árvore~~ (rodada 2). Entradas de stream não são editáveis, porque o Redis só acrescenta.
- **Grade:**
  - ~~Tabelas sem PK somente leitura~~ (rodada 2). Views e tabelas sem PK que também não têm localizador continuam somente leitura (IOT no Oracle, WITHOUT ROWID no SQLite).
  - Células truncadas (> 512 caracteres) e tipos binários ou espaciais não são editados.
  - O valor é enviado como texto: Oracle DATE depende do NLS e SQL Server binário não converte.
  - Não há edição de resultados do console, nem modo *auto-submit*, nem desfazer por célula.
- **Comparação:** não houve comparação visual nem de comportamento com o PhpStorm. Os itens ficam em desenvolvimento, sem promoção de compatibilidade.

## Rodada 2 (04/11/2026)

Plugin `plugin-database`, `main` local, um commit por item, sem push e sem nova versão (continua 1.1.0): `65dc575` Stop, `b94bbe3` somente leitura, `7ae8509` TNS, `f59d65c` grade sem PK e `60de540` Redis. O host não mudou. O harness WebKit `scripts/check-database-fidelity.mjs` ganhou os casos novos. Como a parte nativa mudou, a revisão fixada em `src-tauri/Cargo.toml` precisa ser atualizada depois do push.

### Evidência

- **DOC:** a ajuda da JetBrains diz que a opção *Read-only* protege a fonte contra alterações acidentais e desliga a edição no editor de dados. Diz também que, no console, a garantia depende de o driver suportar o modo somente leitura. Ou seja, quem decide é o servidor, sem uma lista própria e conservadora de comandos.
- **Especificações públicas:** MS-TDS (*attention* 2.2.1.7 e DONE_ATTN 3.2.5.2), Oracle Net (FAILOVER, LOAD_BALANCE, RETRY_COUNT e Easy Connect Plus com vários hosts) e a sintaxe de strings com aspas do `redis-cli` (`\xNN`).
- **OBS:** nenhuma observação de tela do PhpStorm nesta rodada. Os bancos usados foram só os containers do teste.
- **HIP:**
  - O DataGrip identifica linhas sem PK pelo localizador físico quando ele existe e, nos outros SGBDs, por todas as colunas.
  - A forma `"…\xNN…"` para nomes Redis segue o `redis-cli`; não foi comparada com a árvore do DataGrip.
  - O erro de `SLEEP()` cancelado imita o cancelamento do lado cliente do Connector/J.

### Critérios e validação

| Item | Critérios (REQ) | Testes |
|---|---|---|
| Stop que preserva a sessão | **SQL Server:** ⌘F2 envia *attention* na própria conexão e espera o DONE_ATTN. A transação aberta, as `#temp` e os SETs continuam valendo. Se não houver confirmação em 5 s, a IDE usa `KILL` e reconecta. **Oracle:** marker INTERRUPT em banda, troca de RESET e ORA-01013, com o mesmo SID depois, sobre TCP e TCPS. **MySQL/MariaDB:** `SLEEP()` interrompido aparece como "Consulta cancelada" e o lote para. | `cancel_live` mais a verificação de estado de sessão: o backend (SID ou `@@SPID`) é o mesmo antes e depois, e também `@@TRANCOUNT` e a `#temp` no SQL Server, `SET @v` no MySQL/MariaDB e `application_name` no PG. Stop sobre TCPS no Oracle. |
| Somente leitura menos conservador | `SELECT … FOR UPDATE/SHARE/NO KEY UPDATE` passa pela IDE e o servidor decide: PG, MySQL 8.4 e MariaDB recusam na transação read-only. Palavras de escrita só contam no início de um comando. Exceções: no SQL Server, onde comandos não precisam de `;`, e em palavras reservadas em todos os dialetos (`INTO`, `CREATE`, `GRANT`…). Nomes qualificados (`t.delete`) e funções (`INSERT()` do MySQL) passam. `CALL` no PG/MySQL/MariaDB só passa se o corpo no catálogo não gravar, não controlar transação, não usar SQL dinâmico nem chamar outro procedimento; no MySQL, `MODIFIES SQL DATA` também é recusado. `EXEC` no SQL Server só para procedimentos de sistema de consulta. `SET` que troque o modo de transação é recusado. | `read_only::tests` (classificador, corpo de rotina, `routine_call`) e `read_only_live` nos 5 SGBDs SQL: coluna `update`, FOR UPDATE, `CALL` de leitura aceito, `CALL` que grava recusado e procedimento `READS SQL DATA` que contém DELETE recusado. |
| TNS failover/balanceamento | Todos os ADDRESS TCP/TCPS do DESCRIPTION, dentro ou fora de ADDRESS_LIST, na ordem do arquivo. FAILOVER vem ligado por padrão e tenta o endereço seguinte. LOAD_BALANCE embaralha a ordem a cada conexão. RETRY_COUNT repete a lista até 10 vezes. Erro de credencial (ORA-01017 e similares) não passa ao endereço seguinte. Easy Connect aceita `h1,h2:porta/svc`. A lista de aliases mostra "+N endereço(s), failover, balanceamento". Com túnel SSH, só o primeiro endereço é usado. | `tns_failover_and_load_balance` (as 6 ordens aparecem); `live-databases.mjs`: alias com endereço morto antes do real conecta, `LOAD_BALANCE=on` conecta 8 de 8 vezes e `FAILOVER=off` falha no endereço morto. |
| Grade sem PK | A página informa `identity`: `primary`, `rowid` (ctid no PG, ROWID no Oracle, rowid no SQLite, lido como coluna oculta) ou `columns` (MySQL/MariaDB/SQL Server, só tabelas base). Por todas as colunas, NULL vira `IS NULL` e ficam de fora float, LOB, binários e valores truncados. Linhas duplicadas desfazem o Submit com a mensagem "linhas idênticas". Linha alterada por outro cliente também desfaz. A barra de status informa como a linha é identificada. | `grid.test.ts`; `sqlite_grid_…` (rowid, view e WITHOUT ROWID); `grid_nokey_live` nos 5 SGBDs; harness WebKit (Submit com `$rowid`). |
| Redis com nome não UTF-8 | A árvore lista essas chaves no formato do redis-cli (`"img:\xff\xd8"`), marcadas `binary`. O formato tem volta exata, e um nome UTF-8 que já vem entre aspas também é citado. Prévia, edição, TTL, renomear e excluir funcionam com esse nome. O console aceita `\xNN` entre aspas duplas e mostra nomes binários na mesma forma. | `key_names_round_trip_through_redis_cli_quoting`, `redis_arguments_respect_quotes`, `redis_binary_key_live`, harness WebKit. |

Também mudou na rodada 2:

- **MySQL:** o console agora executa `CREATE PROCEDURE` e outros comandos que o protocolo de prepared statements recusa (erro 1295), pelo protocolo de texto.
- **Oracle:** em somente leitura, cada comando roda na própria transação READ ONLY, desfeita em seguida. Antes, o segundo comando repetia `SET TRANSACTION` (ORA-01453) e o Oracle Free derrubava a conexão.
- **Crates vendorizados:** tiberius 0.12.3 e oracle-rs 0.1.7 estão em `native/vendor`, renomeados e com as licenças originais, com o patch mínimo de cancelamento (`native/vendor/README.md`). Foram vendorizados porque um `[patch]` não vale quando o plugin é dependência git do host.

Comandos:

- `node tests/live-databases.mjs`: containers e rede Docker próprios, removidos no fim; define `RUST_MIN_STACK` para o future grande do teste em debug.
- `DATABASE_PLUGIN_DIR=~/Projects/plugin-database node scripts/check-database-fidelity.mjs`: harness WebKit.

### Limitações da rodada 2

- O break do Oracle é sempre em banda. Não foi testado contra servidor que negocia OOB. O Oracle em Docker no macOS não negocia OOB.
- O FOR UPDATE do Oracle em somente leitura é recusado pelo servidor, mas o oracle-rs devolve "Oracle closed the connection" em vez do ORA e reabre a sessão.
- A análise do corpo de `CALL` é léxica e conservadora: um `SELECT INSERT(...)` dentro do corpo também recusa.
- Na suíte completa, com todos os containers ao mesmo tempo, apareceram falhas de carga: um timeout de 8 s na conexão Oracle e um "I/O error" no Redis TLS. Rodando cada SGBD sozinho, todos passam.
