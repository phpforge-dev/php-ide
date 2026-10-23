# Recorte 26 — driver Oracle e edição/paginação Redis

23/10/2026. Pendências herdadas do recorte 18: DB-ORACLE-001 (Oracle aparecia como "planejado") e os limites do Redis (sem CA próprio, sem edição pela prévia, hash/set limitados a 10.000 itens, stream só na primeira página).

## Separação de evidências

- **Documentação (DOC):** nada novo foi relido. Do conhecimento prévio da documentação pública do DataGrip/PhpStorm vem o driver Oracle com "Connection type" (Service name / SID / TNS / URL only) e a edição de valores do Redis no editor de dados. Neste recorte isso é tratado como **requisito**, não como evidência verificada.
- **Observação do PhpStorm (OBS):** nenhuma. Nada foi comparado com a referência, nem visualmente nem por comportamento.
- **Requisito próprio (REQ):**
  - Oracle sem dependência nativa. Escolhi `oracle-rs` 0.1.7 (MIT OR Apache-2.0, Rust puro, protocolo TNS "thin"), então o build e a execução não precisam do Oracle Instant Client. Por isso a parte do pedido sobre detectar a falta do Instant Client não se aplica. A alternativa avaliada foi `oracle` 0.6.3 (UPL/Apache, ODPI-C com carregamento dinâmico de `libclntsh`). Ela é mais madura, mas exige o client nativo, que não existe nesta máquina macOS arm64, e não daria para testar contra o container.
  - Senha do Oracle e do Redis tratada como nos outros drivers: só em memória, nunca em `data-sources/*.json`.
  - Edição Redis sempre por compara-e-grava (script Lua `EVAL`, atômico): a gravação falha se o valor mudou desde a leitura. Valores truncados na prévia nunca são regravados: o diálogo busca o valor completo (`op: get`, até 4 MB, só UTF-8). Campos e membros com mais de 512 caracteres não são editados nem removidos pela prévia; o console continua disponível para eles.
  - Ações destrutivas (remover item, excluir chave) pedem confirmação num diálogo próprio. `window.confirm` não é usado, porque não funciona de forma confiável no webview do Tauri. Renomear usa `RENAMENX` e nunca sobrescreve.
- **Hipótese:** que o diálogo Oracle (tipo de conexão, URL `oracle:thin:@//…`) e as ações Redis na prévia correspondam ao fluxo da referência. Pendente de observação.

## Implementação

Backend (`src-tauri/src/database.rs`, novos `database/oracle.rs` e `database/redis_edit.rs`):
- `Kind::Ora` / `Conn::Ora`. Conexão por Service name (padrão) ou SID (`connectType`). SSL: `disable/prefer` usam TCP; `require` usa TCPS sem verificação; `verify-ca/verify-full` usam TCPS com a CA indicada ou as raízes do sistema. Cache de statements desligado, porque cursores reaproveitados não reenviam as colunas. Erros ORA ganham dica (`ORA-01017`, `ORA-12514/12505`, `ORA-28000`).
- Schemas: `ALL_USERS` não mantidos pela Oracle, mais `USER`. Tabelas e views vêm de `ALL_OBJECTS` (sem `BIN$`), colunas de `ALL_TAB_COLUMNS` e PK de `ALL_CONSTRAINTS`.
- Prévia paginada com `OFFSET … FETCH NEXT 51`, ordenada pela PK quando ela existe. Cada célula é convertida no servidor e limitada a 513 caracteres: `DBMS_LOB.SUBSTR` para CLOB/BLOB, `RAWTOHEX`, `ROWIDTOCHAR`, `JSON_SERIALIZE` e `TO_CHAR` para escalares. LONG, BFILE, XMLTYPE e tipos de objeto aparecem como "prévia indisponível".
- Console: o frontend divide por `;` (`src/native.ts`), e o backend junta e redivide no estilo SQL*Plus (`oracle::split`). SQL termina em `;`; blocos `BEGIN`/`DECLARE`/`CREATE [OR REPLACE] PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE` vão até uma linha só com `/`. Cada comando que não é consulta recebe commit (o console já se apresenta como auto-commit). Consultas param em 500 linhas e LOBs de até 1 MB são lidos.
- DDL de metadados com tipos completos (`VARCHAR2(n CHAR)`, `NUMBER(p,s)`, `NUMBER(*,0)`, `RAW(n)`), `NOT NULL` e PK. Ficam de fora defaults, FKs e índices, como já acontece no SQL Server.
- Modelo de autocompletar: uma consulta por schema visível (o padrão é o schema atual), em vez de uma por tabela.
- Script de inicialização aceito; testado com PL/SQL (`DBMS_APPLICATION_INFO.SET_MODULE`). `ALTER SESSION` não funciona com `oracle-rs` 0.1.7: o driver falha ao decodificar a resposta ("invalid length indicator: 8"), mas a sessão segue utilizável. Somente leitura e cancelamento são recusados com erro explícito.
- Resiliência à `oracle-rs`, que não fecha cursores no servidor: a conexão do console é reaberta de forma preventiva a cada 200 comandos (`ORA_REOPEN_AFTER`, abaixo do `OPEN_CURSORS` padrão de 300). Se um erro do servidor derrubar a conexão (o driver faz isso, por exemplo, com tabela inexistente, sem trazer o ORA-00942), ela é reaberta e a mensagem avisa que o estado de sessão e as alterações não confirmadas foram perdidos. O script de inicialização é reaplicado a cada reabertura.
- Dependência e TLS: `oracle-rs` ativa o provedor aws-lc-rs do rustls, e junto com o ring já existente o provedor padrão ficava ambíguo, o que fazia o TLS do Redis entrar em pânico. `Database::new` agora instala ring como provedor padrão do processo. Para isso entrou `rustls` (feature `ring`) como dependência direta.
- Redis: CA próprio por `Client::build_with_tls` (PEM lido do arquivo; erro claro se o arquivo não existe). Hash e set paginam por `HSCAN`/`SSCAN` com token `cursor:itens-já-exibidos`, sem limite de 10.000. Stream pagina por `XRANGE (último-id + COUNT 51`. Zset continua com `ZRANGE` por posição, que já pagina sem limite em O(log N + 50) e preserva a ordem por score; `ZSCAN` perderia essa ordem. O teto de offset de 1.000.000 não vale mais para Redis. A página também informa `kind`, `ttl`, `size` e `cursor`.
- `databaseRedisEdit` com as operações `get`, `set` (KEEPTTL), `hset` (novo campo, edição ou renomeação de campo), `hdel`, `lset`, `ldel` (por índice, com marcador único e `LREM`), `rpush`, `sadd`, `sreplace`, `srem`, `zadd` (novo, score ou renomeação de membro), `zrem`, `ttl` (`EXPIRE`/`PERSIST`), `rename` (`RENAMENX`) e `delete` (`UNLINK`). Toda operação confere o tipo da chave.

Frontend:
- `shared/datasource.ts`: driver Oracle (porta 1521, `system`, `FREEPDB1`, sem somente leitura); `plannedDrivers` não lista mais Oracle. URL `oracle:thin:@//host:porta/service` ou `oracle:thin:@host:porta:SID`, aceitando `jdbc:` e `oracle://`. Validação de Service name/SID. Redis passa a aceitar arquivo CA.
- `src/database-panel.ts`: campo "Tipo de conexão" (Service name/SID) e rótulo dinâmico, e dica do driver Oracle. Na prévia Redis há barra Adicionar, Editar valor, Remover item, TTL…, Renomear chave… e Excluir chave; seleção de linha por clique ou setas, duplo clique ou Enter para editar, Delete para remover; paginação Anterior/Próxima guardando o cursor de cada página.
- `shared/sql.ts` (`oracleStatements`, `statementAt(…, 'oracle')`) e `src/sql-console.ts`: "executar sob o cursor" pega o bloco PL/SQL inteiro.

Arquivos compartilhados alterados só por inserção: `shared/contracts.ts` (`'oracle'` em `DatabaseDriver`, `connectType`, campos Redis em `DatabasePage`, `RedisEdit`, `databaseRedisEdit`, cursor em `databasePage`), `src-tauri/Cargo.toml` (`oracle-rs`, `rustls`), `src/workbench.css` (diálogo de edição e linha selecionada) e `src/locales/en.json` (51 textos).

## Verificação

- `cargo test` (`npm test`): 62 aprovados. Inclui os testes novos `oracle::split` (PL/SQL, `/`, strings com `;`, comentários), tipos e células Oracle, tokens de SCAN e a fonte Oracle persistida sem senha.
- `node scripts/check-databases-oracle-redis.mjs` (novo; cria e remove os próprios containers e uma CA gerada com openssl num diretório temporário):
  - Redis 7 sem TLS e Redis 7 só com TLS (`--tls-port`, CA própria, SAN 127.0.0.1) aprovados: hash de 12.000 campos e set de 10.500 membros percorridos inteiros por cursor, sem item faltando; stream de 120 entradas em 3 páginas; todas as operações de edição, inclusive conflito de compara-e-grava, tipo errado, campo/membro duplicado, KEEPTTL, TTL/PERSIST, RENAMENX sem sobrescrever e exclusão; TLS sem CA falha, `require` conecta, CA inexistente dá erro legível.
  - Oracle Free 23 (`gvenzl/oracle-free:23-slim-faststart`, app user descartável) aprovado no roteiro comum (conexão, versão, senha inválida, CREATE/INSERT/SELECT, listagem, prévia paginada com NULL e corte em 513, PK, DDL, modelo, recusa de somente leitura) e no roteiro próprio: script com bloco PL/SQL dividido por `;` como o frontend e remontado; CLOB; `NUMBER(10,2)` e `VARCHAR2(30 CHAR) NOT NULL` no DDL; erro com reconexão; 400 comandos distintos na mesma sessão; SQL de até 33 KB; SID inválido com dica; script de inicialização PL/SQL.
  - Execução completa final (`node scripts/check-databases-oracle-redis.mjs`, 3 containers): aprovada em 108 s; nenhum container sobrou.
- `tests/datasource.test.ts` e `tests/sql.test.ts` (`npx tsx --test`): aprovados. `sql.test.ts` importava `electron/database` (pacote `pg` ausente) e falhava antes deste recorte; passou a importar `shared/sql-ddl`.
- `node scripts/preview-database-oracle-redis.mjs` (novo, API simulada, Vite + Chrome headless): fluxo Redis (selecionar linha → duplo clique → diálogo com o valor completo → salvar envia `hset` com `old`) e diálogo Oracle (SID → URL `oracle:thin:@localhost:1521:FREEPDB1`). Capturas em `.artifacts/database-redis-*.png` e `.artifacts/database-dialog-oracle*.png`. Erros de página de mocks de outras áreas (`listing.plugins`) são ignorados no script.
- `npm run typecheck` e `npm run test:locales`: aprovados.
- `npm run test:native`: **não executado**. O build passou, mas `check-native.mjs` falhou ao iniciar o Vite ("Vite exit 1") porque a porta 1420 já estava ocupada por um Vite de outra sessão em paralelo (PID 33837), que não foi encerrado. Precisa rodar de novo quando a porta estiver livre.

## Limites

- Sem comparação com o PhpStorm; nada foi promovido a compatível.
- Oracle: `oracle-rs` é jovem (0.1.x), e a escolha precisa ser revista se os limites abaixo pesarem; a alternativa é `oracle` com Instant Client por carregamento dinâmico. Problemas do driver observados no teste: `ALTER SESSION` falha; erros do servidor podem chegar sem o código ORA e com a conexão encerrada (mitigado com reconexão); cursores nunca são fechados (mitigado reabrindo a cada 200 comandos); um `INSERT … VALUES (…),(…)` de 55 linhas com literais de 600 caracteres foi rejeitado com a conexão encerrada ("binding a temporary LOB"), embora um SELECT de 33 KB funcione. Testado só contra Oracle Free 23 sem TLS; TCPS, wallets, Oracle 19c/21c, Kerberos e proxy não foram exercitados. TNS/`tnsnames.ora` e "URL only" não foram implementados. Sem somente leitura e sem cancelamento. Defaults, FKs e índices ficam fora do DDL.
- Redis: em TLS, `verify-ca` também confere o nome do host (rustls não separa as duas verificações). Valores binários e acima de 4 MB não são editáveis pela prévia. Streams são somente leitura na prévia. Não há criação de chave nova pela prévia (o console faz isso). A ordem de hash e set é a do SCAN e pode trazer repetições se o servidor fizer rehash durante a paginação.
- `npm run test:native` não cobre Oracle nem a edição Redis, porque `src/native-smoke.ts` não é deste recorte.

## Proposta para catálogo/matriz

- DB-ORACLE-001: de "planejado" para **implementado (próprio, sem OBS)**. Conexão por Service name/SID, schemas, tabelas/views/colunas, prévia paginada, console com PL/SQL e DDL de metadados, testado contra Oracle Free 23 descartável. Limites: sem TNS, TCPS não testado, sem somente leitura/cancelamento, `ALTER SESSION` não suportado pelo driver, erros podem vir sem o código ORA.
- Redis (fontes de dados): acrescentar **edição de valores pela prévia** (string, hash, list, set, zset, TTL, renomear e excluir com confirmação), **CA personalizado em TLS** e **paginação por cursor** (HSCAN/SSCAN sem limite, XRANGE em stream). Todos testados contra Redis 7 descartável, com e sem TLS. Continuam pendentes: edição de stream, criação de chave pela prévia e valores binários.
- Mudança sugerida fora deste recorte: `src/native-smoke.ts` poderia ganhar um check Oracle e um de edição Redis quando `PHP_IDE_SMOKE_DATABASE` incluir esses drivers.
