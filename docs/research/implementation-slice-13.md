# Recorte 13 — console SQL e SQL em strings PHP

22/10/2026. Pedido: observar no PhpStorm e implementar o console SQL com autocomplete de tabelas/colunas e SQL dentro de strings PHP.

## Observação da referência (OBS)

PhpStorm 2026.1.4, macOS. PostgreSQL 16 descartável em container local (`127.0.0.1`, autenticação `trust`, sem senha) com `users`, `orders` (FK para users), `billing.invoices` e a view `active_users`; projeto descartável com `probe.php`. Nenhuma senha foi digitada na referência. O driver JDBC 42.7.3 já estava instalado; o usuário autorizou o download sugerido pela janela, mas o link não disparou e **nada foi baixado** (Test Connection funcionou com o driver local). Automação sem teclado: menus por AX, campos por `AXValue`, cursor por `AXSelectedTextRange`, botões e itens Java por clique de mouse com verificação de janela no topo (um clique foi recusado porque o Chrome estava sobre o ponto). O container foi removido ao final.

| ID | Ação | Saída observada |
|---|---|---|
| OBS-DB-01 | Database → New | Data Source ›, Add Application Database…, Data Source from Cloud Provider ›, Templates, From File/Folder, From URL, DDL Data Source, Import from Clipboard, Folder, Driver, Import Data Sources… |
| OBS-DB-02 | Data Source from URL | Campo URL e seletor de driver; PostgreSQL detectado pela URL `jdbc:postgresql://…` |
| OBS-DB-03 | Data Sources and Drivers | Nome `fixture@127.0.0.1`, autenticação (pgpass, User & Password, No auth), modo de salvar senha, URL, Test Connection: "Succeeded", versão do servidor e do driver |
| OBS-DB-04 | OK | Console aberto automaticamente; notificação "Introspection Level Selected… Level 3: public" |
| OBS-SQL-CON-01 | Barra do console | Execute, Tx: Auto, Cancel Running Statements, Playground, `<schema>`; depois Browse Query History e In-Editor Results; trilha Database Consoles › fixture@127.0.0.1 › console |
| OBS-SQL-CON-02 | Execute | Janela Services: Database › fixture@127.0.0.1 › console 595 ms; grade "2 rows", colunas A id / B name / C email; ações Select All, Table/Chart, Reload Page, Auto Refresh, Cancel, Add Row, Delete Rows, Revert, Preview Pending Changes |
| OBS-SQL-INJ-01 | Cursor em string de `$pdo->query('…')` | Trilha `<Injected SQL file>`; notificação sugerindo PostgreSQL como dialeto padrão do projeto |
| OBS-SQL-COMP-01 | `SELECT | FROM users` | Colunas `email (fixture.public.users) varchar`, `id … integer`, `created_at … timestamp`; tabelas, schemas `billing (fixture)`, palavras-chave e o item combinado `id, name, email, created_at (fixture.public.users)`; "Type more characters to see all suggestions"; ordenação por relevância |
| OBS-SQL-COMP-02 | `SELECT * FROM |` | Schemas, tabelas do projeto e de `pg_catalog`, cada uma com `(fixture.<schema>)` e a fonte `fixture@127.0.0.1` |
| OBS-SQL-COMP-03 | `SELECT u.| FROM users u` | Colunas com `(u)` e tipo, item combinado, colunas de sistema e funções |
| OBS-SQL-COMP-04 | `FROM billing.|` | Só `cast`: `billing` não foi introspectado no nível padrão |
| OBS-SQL-NAV-01 | ⌘B em `orders` | Aba `orders` (`orders.sql`) com DDL gerado (`-- auto-generated definition`, `create table orders (…)`, `alter table … owner to`), cursor no nome |
| OBS-SQL-NAV-02 | ⌘B em `user_id` | Mesmo DDL, linha da coluna (6:5) |
| OBS-SQL-NEG-01 | ⌘B em tabela inexistente | Sem navegação |

Não observado: completion dentro do console (a ação de menu não teve efeito enquanto o foco estava no painel Database), execução do comando sob o cursor × seleção, edição de células, histórico e MySQL na referência.

## Implementação

- `shared/sql.ts`: tokens SQL (strings, `$$`, comentários, identificadores entre aspas), divisão de comandos, tabelas e aliases em escopo, contextos de completion (tabelas após FROM/JOIN/UPDATE/INTO, colunas por alias/tabela, colunas e item combinado na lista do SELECT, tabelas de um schema qualificado), referência sob o cursor e detecção de SQL em texto.
- `electron/database.ts`: modelo de schema (tabelas, views, colunas com tipos curtos `varchar`/`timestamp`), recarregado após DDL; console com conexão persistente por fonte em auto-commit, até 100 comandos, 500 linhas e 512 caracteres por célula, parada no primeiro erro; cancelamento real (`pg_cancel_backend`, `KILL QUERY`); DDL gerado para PostgreSQL no formato observado e `SHOW CREATE TABLE` no MySQL.
- Plugin interno `database` (oculto na barra de status): SQL em qualquer string PHP ou Blade detectado pelo conteúdo; completion e ⌘+clique para o DDL. O host de plugins passa strings sem dono pela chamada para os ganchos de código. Credenciais ficam no processo principal; o plugin recebe só modelos e DDL.
- Console como aba do editor (`consoles › fonte › console`), não salvo em disco: Executar (⌘/Ctrl+Enter, seleção ou comando sob o cursor), Tx: Auto, Cancelar, seletor de schema e fonte; painel de resultados com abas por comando, número da linha, `<null>`, linhas/tempo e erro. Botão Console em cada fonte do painel Bancos.
- DDL abre em aba somente leitura (`php-ide-ddl:`), reaproveitada nas navegações seguintes; buffers virtuais não contam como alterações não salvas.

REQ/diferenças: todos os schemas de usuário são introspectados (a referência só `public` no nível padrão) e schemas de sistema ficam de fora (a referência listou `pg_catalog`); ordem de completion fixa (colunas, tabelas, schemas, palavras-chave) em vez de relevância; resultados no painel inferior do editor em vez da janela Services; cabeçalhos sem letras A/B/C; sem edição de dados, gráfico, histórico, Playground nem escolha de dialeto; SQL em string usa a primeira fonte conectada.

## Verificação

- `tests/sql.test.ts`: contextos OBS-SQL-COMP com os mesmos textos de cauda/tipo, divisão de comandos, referência, detecção e DDL idêntico ao observado para `orders`.
- `tests/plugins.test.ts`: SQL em `->query()`, em atribuição e em Blade; texto comum ignorado; DDL e linha da coluna; sem fonte conectada, segue para o Phpactor.
- `npm run test:sql` (containers próprios PostgreSQL 16 e MySQL 8.4): seleção, auto-commit, erro, modelo, completion, recarga após DDL, cancelamento de `pg_sleep`/`SLEEP` e DDL — no PostgreSQL, idêntico caractere a caractere ao gerado pelo PhpStorm.
- `npm run test:sql-ui` (Electron + PostgreSQL próprio): conectar, abrir console, completion, ⌘Enter, grade com 2 linhas, erro, completion em string PHP e F12 para DDL somente leitura. Screenshots `.artifacts/sql-*.png`.
- Regressão: typecheck, `npm test` (32), `test:php`, `test:db` (PostgreSQL, MySQL, MariaDB) e todos os testes de UI.

## Limites

O driver carrega o resultado inteiro antes de limitar a 500 linhas; consultas enormes consomem memória. Sem transações manuais, parâmetros nomeados (`:id`) no console, SQL concatenado/interpolado em PHP nem resolução de várias fontes. Oracle, SQL Server e Redis continuam fora. DB-PG-001 e DB-MYSQL-001 permanecem Em desenvolvimento.
