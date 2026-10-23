# Recorte 18 — fontes de dados no estilo "Data Sources and Drivers" e novos drivers

22/10/2026. Pedido: aproximar o layout e o fluxo de conexão do diálogo de fontes de dados do PhpStorm, que antes era um formulário único só para PostgreSQL/MySQL, e dar suporte aos demais bancos.

## Separação de evidências

- **Documentação (DOC):** o PhpStorm/DataGrip descreve publicamente um diálogo "Data Sources and Drivers": lista de fontes do projeto à esquerda, com ＋/−/duplicar e escolha de driver; à direita nome, comentário e abas General / Options / SSH/SSL / Schemas; campos host, porta, autenticação, usuário, senha com opção de salvar, banco e URL; link "Test Connection"; botões OK / Cancel / Apply. A documentação não foi relida neste recorte; a estrutura acima vem de conhecimento prévio e é tratada como requisito.
- **Observação do PhpStorm (OBS):** nenhuma neste recorte. Nada foi comparado visualmente ou por comportamento com a referência.
- **Requisito próprio (REQ):** senhas nunca vão para arquivo (AGENTS.md); "Salvar" oferece só "Até reiniciar" (memória do backend Rust) e "Nunca", não "Forever"/keychain. URLs exibidas sem prefixo JDBC (o backend não usa JDBC); `jdbc:` é aceito na colagem. OK salva e conecta a fonte selecionada.
- **Hipótese:** que o menu de drivers e a árvore com estado de conexão sejam equivalentes aos da referência. Pendente de observação.

## Implementação

Backend (`src-tauri/src/database.rs`):
- Famílias: PostgreSQL (sqlx), MySQL e MariaDB (sqlx, protocolo MySQL), SQLite (sqlx, libsqlite3 embutida), SQL Server (tiberius 0.12, TDS 7.3, rustls) e Redis (redis-rs 0.27, tokio + rustls). Identificadores citados por dialeto (`"…"`, `` `…` ``, `[…]`) e parâmetros `$n`, `?`, `@Pn`.
- SSL por modo (`disable/prefer/require/verify-ca/verify-full`) e arquivo CA; `tls` booleano antigo continua aceito.
- Túnel SSH pelo `ssh` do sistema (`-N -L`, `BatchMode`, `ExitOnForwardFailure`), autenticação por chave/agente, processo encerrado com a sessão; parâmetros que começam com `-` ou têm espaço são recusados.
- Somente leitura: PostgreSQL/MySQL/MariaDB por `SET SESSION … READ ONLY`, SQLite por abertura read-only; SQL Server e Redis recusam a opção em vez de fingir.
- Script de inicialização executado em cada conexão (sessão e conexões de metadados).
- Fontes de dados persistidas por projeto em `<estado>/data-sources/<hash>.json`, com a chave `password` removida no backend antes de gravar.
- Redis: bancos `dbN` do `INFO keyspace`; chaves por `SCAN` limitado (2.000 chaves, 400 iterações) com `TYPE` em pipeline; prévia por tipo (string, list, hash, set, zset, stream) com TTL; console de um comando por linha, aspas respeitadas, `SUBSCRIBE/MONITOR/SELECT/…` recusados.
- Cancelamento continua só em PostgreSQL/MySQL/MariaDB; outros drivers retornam erro explícito.

Frontend (`src/database-panel.ts`, `shared/datasource.ts`):
- Diálogo com lista de fontes, menu de drivers (Oracle, MongoDB, ClickHouse, Cassandra e Snowflake aparecem como planejados, sem botão), abas Geral/Opções/SSH-SSL/Schemas, URL editável que preenche os campos, nome automático até ser editado, Testar conexão com versão do servidor, schemas visíveis escolhidos por caixa de seleção, OK/Aplicar/Cancelar.
- Janela Database: fontes salvas aparecem desconectadas; expandir conecta (pede senha quando não há senha em memória); barra com ＋, propriedades, atualizar, desconectar e console. Console usa a linguagem do driver (`pgsql`, `mysql`, `sql`, `redis`).

## Verificação

- `cargo test`: 28 testes, incluindo SQLite real ponta a ponta, citação por dialeto, modos SSL, persistência sem senha e senha só em memória.
- `node scripts/check-databases-native.mjs` (novo; containers descartáveis criados e removidos pelo script): PostgreSQL 16, MySQL 8.4, MariaDB 11.4, SQL Server 2022 (imagem amd64 emulada) e Redis 7 aprovados em conexão, senha inválida, navegação, prévia paginada, NULL/truncamento, console, DDL, somente leitura e desconexão.
- `tests/datasource.test.ts` (`npx tsx --test`): padrões por driver, URL ida e volta, capacidades e validação.
- `check-native` (janela Tauri real, bancos descartáveis): os quatro checks de banco aprovados, incluindo o novo fluxo diálogo → testar → OK → árvore → persistência sem senha → reconexão com senha em memória → remoção. Nesta máquina, sob carga, checks de editor/Phpactor (Cmd+clique, TS/Vue, alias) falharam por tempo esgotado ou "Documento obsoleto", com resultados diferentes entre execuções e fora dos arquivos deste recorte. O limite global agora pode ser ajustado por `PHP_IDE_NATIVE_TIMEOUT_MS` (padrão 180 s).
- Prévia visual com API simulada: `scripts/preview-database.mjs` → `.artifacts/database-*.png`.

## Limites

- Sem comparação com o PhpStorm; nenhuma família foi promovida a compatível.
- Senha SSH, keychain do sistema, propriedades avançadas de driver, introspecção agendada, cores por fonte e pastas na árvore não foram implementados.
- SQL Server: sem cancelamento e sem somente leitura; testado só sob emulação amd64. CockroachDB, Redshift, TiDB e outros compatíveis por protocolo não foram testados nem oferecidos.
- Redis: sem CA personalizado, sem edição de valores pela prévia, paginação de hash/set limitada a 10.000 itens e stream mostra só a primeira página.
- Oracle exige cliente nativo (Instant Client) e continua planejado.
