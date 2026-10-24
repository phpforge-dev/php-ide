# Connection-aware SQL intelligence — SPEC-14

## Requirement and evidence boundary

The requested feature is [SPEC-14](../specs/14-sql-intelligence.md): local completion from the active connection's real metadata, with aliases, schemas, CTEs and subqueries. That specification remains prospective. This document records the independent implementation and its validation; it does not establish compatibility with PhpStorm. No new reference observation or proprietary component is used.

Dependency evidence comes from the installed public `dt-sql-parser` 4.5.1 package: PostgreSQL/MySQL/GenericSQL parsers, `getAllTokens`, `getSuggestionAtCaretPosition`, `getAllEntities` and lexer vocabulary. Its MIT license and the ANTLR dependency notices are retained in `licenses/sql-intelligence/` and bundled with the application. The parser supplies syntax/tokens/entities; application code resolves metadata and query scopes. MariaDB uses the MySQL grammar and is tested independently.

## Implementation

- Rust owns active sessions and credentials. `databaseCompletionContext` reads the actual database, PostgreSQL search path/default schema and MySQL/MariaDB identifier-case setting. `databaseCompletionPage` reads relation names and column metadata in pages of 5,000, with parameterized schema values and a bounded deadline. It uses the active session so session role/privilege changes apply to completion. It never reads table data.
- The catalog controller prepares selected namespaces immediately on connection, prioritizes the default schema, publishes incremental snapshots and coalesces refreshes. Budgets are 50,000 relations, 500,000 columns and a conservative 64 MiB transfer estimate. Namespace discovery is capped at 2,000 with an explicit Partial state and scope-narrowing recovery. Partial/error/stale states remain visible and retryable. Successful DDL/context changes invalidate metadata, including commented DDL and newly created namespaces; external changes are revalidated every 60 seconds by default, adjustable through SQL Options. Scope narrows preparation to the selected schema and All schemas restores the connection's authorized namespace scope.
- Parsing and semantic resolution run in a production-built local worker. The parser is prepared before readiness. Semantic requests have a 200 ms deadline; a stalled worker is terminated and can recover from its in-memory catalog. Warm completion does not invoke metadata IPC or database queries. Responses are checked against request, catalog revision and live connection; editor adapters also check document version/model. Binding changes cancel pending presentation, and project reset discards catalogs, bindings and the worker.
- The resolver handles relation aliases, exact/quoted names, search-path lookup, ambiguous columns, projection output names, wildcard expansion, chained/explicit/recursive CTE output lists, derived tables, correlated subqueries, shadowing, LATERAL visibility, set-operation output names, INSERT columns and UPDATE targets. It recovers scope from parser tokens for incomplete SQL. Unknown expressions retain unknown types; unrelated or hidden bindings do not contribute columns.
- Console SQL, bound `.sql` files and recognized PHP/Blade SQL literals share the worker. The SQL toolbar exposes the connection, completion schema, catalog state/counts, Refresh, Scope and background refresh interval. PHP/Blade binding is explicit per file; it never chooses the first connection. Literal SQL is decoded with UTF-16 host mappings and escaped on insertion. Dynamic/interpolated/concatenated fragments are suppressed with visible feedback rather than evaluated.
- Monaco completion opens on the first identifier character and qualifier dot, shows source/type detail, replaces the current identifier segment and supports undo. Refresh updates an open list without reopening a dismissed one. Loading/error information is nonselectable toolbar status. SQL execution is disabled for disconnected sessions.

The previous pure completion helper remains available as a migration/test boundary. Production consoles and the production PHP/Blade database provider use the worker integration. SQL navigation to generated DDL retains its existing separate reference resolver; this delivery does not expand its CTE/derived-column navigation contract.

## Reproducible validation

Run baseline `npm run typecheck` and `npm test`. Targeted checks:

```sh
node --import tsx --test tests/sql-catalog.test.ts tests/sql-intelligence.test.ts tests/sql.test.ts tests/plugins.test.ts
PHP_IDE_NATIVE_PORT=1437 npm run test:native -- --sql-only
```

The native command provisions and removes PostgreSQL 16, MySQL 8.4 and MariaDB 11.4 containers, random local ports, synthetic connection profiles and a temporary project. Its Tauri/WKWebView uses a snapshot of the production frontend and its built worker. The optional port avoids disturbing another local development server. No real user database is accessed.

The report is `.artifacts/sql-intelligence-native.json`; `--capture` optionally requests `.artifacts/sql-intelligence/sql-completion.png` and requires OS capture access. The capture attempt in this session could not create an image from the application's window; no screenshot is claimed as evidence. Fixtures exercise real tables/columns, a 140-column table, duplicate names in another namespace, aliases, CTEs, derived scopes, correlation boundaries, INSERT targets, automatic Monaco popup, Enter/Tab, undo/dismissal, DDL refresh, disconnect/reconnect, project close and PHP/Blade binding. Separate synthetic production-worker benchmarks measure 10,000 relations/100,000 columns with a 20,000-character document and the default 50,000-relation/500,000-column budget. Serialized catalog bytes are reported separately from latency; WebKit does not expose a reliable JavaScript heap measurement through the performance API.

Catalog tests cover coalescing, incremental loading, explicit bindings, rejected stale results, namespace failures with cached data, budgets, narrowing, project reset and stalled-worker recovery. Resolver tests include forbidden suggestions, Unicode/ranges, quoted/case-sensitive names, recursive/set-operation output names, CTE shadowing and safe PHP literal mappings.

## Limits

- PostgreSQL, MySQL and MariaDB retain their dedicated grammars. SQLite, SQL Server and Oracle now use incremental active-session catalogs and the explicit dialect capability record below. Redis remains outside SQL completion. This does not imply full SQLite, T-SQL or PL/SQL grammar validation.
- Projection inference preserves source types for simple references. Complex expressions, recursive incompatibilities and unsupported syntax remain unknown. This is not general SQL type checking or query planning. Depth/query-block and document-size bounds return degraded results.
- Catalog readiness depends on server/network latency and available privileges. Capped or failed namespaces remain Partial. External DDL is discovered on periodic/manual refresh, not through guaranteed server notifications. Paging is not a cross-page database snapshot; concurrent DDL may require another refresh.
- Dynamic PHP SQL, heredocs and unsupported PHP escape forms are outside safe literal completion. Supported placeholders are preserved as text; no runtime values are substituted.
- Metadata is memory-only. There is no offline persisted catalog or credential transfer to workers/agents. Real JavaScript heap/total application memory, Windows/Linux runtime behavior and large remote-database cold readiness require independent measurements.
- No family is promoted to PhpStorm-compatible based on these cases.

## Validation results

Native Tauri/WKWebView acceptance passed all eleven groups with PostgreSQL 16, MySQL 8.4 and MariaDB 11.4. Enter and Tab were dispatched through the editor's keyboard handler; the first-character and PHP connection-switch checks inspected the actual visible Monaco suggestion widget. A slow-query fixture also verified that cached completion stays available, metadata lock waiting times out after eight seconds and Retry restores readiness. The project-close check verified that catalogs and file bindings were discarded. These are own-product runtime results, not screenshots or reference equivalence.

Reference machine: Mac17,2, arm64, macOS 26.3.1. One recorded run prepared the four-relation/149-column fixture in 645 ms (PostgreSQL), 215 ms (MySQL) and 61 ms (MariaDB). Warm connection-backed requests made zero metadata calls; p95 was 2/1/1 ms respectively. The synthetic 10,000-relation/100,000-column/20,000-character production-worker run measured p50/p95/p99 of 3/6/11 ms, with 4,189,000 serialized catalog bytes. At 50,000 relations/500,000 columns, the short-query run measured 1/3/3 ms and 20,989,000 serialized bytes. Timings are fixture-specific worker round trips, not a benchmark of every SQL construct or the full popup animation. See the report for the latest rerun rather than treating these samples as universal guarantees.

Baseline typecheck and locales passed. Rust: 66 passed, 3 ignored. Targeted SQL/catalog/plugin checks: 47 cases are included in the full unit suite. The full TypeScript unit suite passed 172 cases with one skipped. Earlier integration attempts exposed cold-parser deadlines, popup activation/binding refresh and quadratic table lookup; these were corrected before the accepted run. A concurrent development server occupied port 1420, so the final SQL harness used port 1437 and a private copy of the production frontend.


## SQLite, SQL Server and Oracle capability record

These adapters retain `dt-sql-parser` 4.5.1 GenericSQL as their public syntax/keyword base, with a bounded lexical adapter and independent semantic rules. The package has no native SQLite, T-SQL or Oracle grammar. Quoted identifiers and dialect literals are protected before invoking GenericSQL; the semantic layer receives their original spelling and UTF-16 ranges. This replaces the old legacy-catalog fallback for these three connections, without claiming complete language parsing.

| Driver | Active-session catalog and name rules | Explicit SQL completion slice |
|---|---|---|
| SQLite | `pragma_database_list`, namespace-qualified `sqlite_schema`, `pragma_table_xinfo`; main, temp and attached databases; temp/main/attachment lookup order; generated columns included and virtual-table implementation-only hidden columns omitted | Tables/views, schema qualification, case-insensitive lookup, double/backtick/bracket identifiers, aliases, CTEs and projected/correlated subqueries; ordinary derived tables do not inherit outer bindings |
| SQL Server | `DB_NAME()`, `SCHEMA_NAME()`, database-default case comparison, `sys.schemas/objects/columns/types`; current database only; default schema then dbo; exact spelling in case-sensitive databases | Bracket escaping, national string literals and nested comments, aliases/CTEs/projections, `TOP` projection prefixes, `CROSS/OUTER APPLY` outer visibility; database qualification restricted to the loaded database |
| Oracle | `SYS_CONTEXT` current database/schema; accessible non-maintained owners plus current owner from `ALL_OBJECTS/ALL_USERS`, columns from `ALL_TAB_COLUMNS`; unquoted names fold uppercase, quoted names remain exact | Tables/views, owner qualification, aliases without AS, CTEs including explicit recursive outputs, derived/correlated scopes, `MINUS`, alternative `q` literals and national literals |

Catalog pages expose a continuation offset rather than requiring every driver to return 5,000 rows. Oracle uses SQL-level pages of 80 plus one sentinel: the installed `oracle-rs` 0.1.7 initial-query response hardcodes its exhaustion flag and otherwise silently stops at the first 100 rows. Attempting its subsequent-fetch path failed in the disposable native fixture. Small completed SQL pages avoid relying on that path and are tested past column 100. Metadata preparation refuses silent Oracle connection recycling when the existing cursor budget is exhausted; it reports Partial with reconnect/narrow-scope recovery instead. The general Oracle console/preview driver's existing constraints remain separately scoped.

`ATTACH`/`DETACH` now invalidate SQLite metadata. Successful `USE` and DDL continue to invalidate connection context. Namespaces removed on a successful refresh are discarded. The same local cache, worker deadlines and file binding apply to all six SQL drivers; warm requests do not query catalogs.

Remaining limits are explicit: SQL Server temporary tables, table variables, TVFs, synonyms and linked/cross-database catalogs are not indexed in this slice; collation handling covers case sensitivity, not accent/width/kana equivalence. Double-quoted SQL Server references assume QUOTED_IDENTIFIER ON; that session setting is not modeled. Oracle synonyms, database links, packages, PL/SQL declarations, PIVOT/MODEL and hierarchical-query inference are not resolved. SQLite PRAGMA output relations and table-valued functions are not inferred. DDL navigation retains its separate legacy resolver. There is no general expression type checker or complete vendor grammar validator. Only the engine versions and scenarios below are accepted.

Reproduce the new driver scenarios with:

```sh
PHP_IDE_NATIVE_PORT=1438 PHP_IDE_NATIVE_TIMEOUT_MS=300000 npm run test:native -- --sql-dialects-only
```

This mode creates its own SQLite file, SQL Server 2022 amd64 container and Oracle Free 23 container, with synthetic credentials kept inside the harness and disposable profile. It checks the actual production Monaco popup in Tauri/WKWebView and writes `.artifacts/sql-dialects-native.json`. The original `--sql-only` scenario remains the separate PostgreSQL/MySQL/MariaDB regression run. Containers and temporary files are removed by the harness.

Public metadata/name references: [SQLite PRAGMA](https://www.sqlite.org/pragma.html), [SQL Server identifiers](https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers?view=sql-server-ver16), [Oracle ALL_TAB_COLUMNS](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/refrn/ALL_TAB_COLUMNS.html). These document metadata semantics; own-product native tests provide the runtime evidence.

The new native scenario has passed with a five-relation/149-column SQLite fixture, six-relation/150-column SQL Server fixture (including a second schema), and five-relation/149-column Oracle fixture. All contain a 140-column table and an exact quoted `Odd Table` / `Display Name` object. One recorded run prepared the catalogs in 347 ms, 152 ms and 1,736 ms respectively. The visible popup and Enter/Tab/undo checks ran separately for each engine. Warm requests made zero metadata calls. SQLite attachment/temp/generated-column checks ran on the same session that executed ATTACH/CREATE TEMP/DETACH. Artifacts contain the latest run; these fixture timings do not establish universal readiness or vendor syntax coverage.


The follow-up native run also passed a real SQL Server `Latin1_General_100_CS_AS` database: `Users` resolves, `users` does not, and `USE master` restores the original catalog. The final report records SQLite 3.46.0 and SQL Server 2022 build 16.0.4305.5; Oracle was provisioned from `gvenzl/oracle-free:23-slim-faststart` (its driver's reported banner is retained verbatim in the report rather than treated as a precise server version).

Follow-up checks: typecheck, locales and Clippy passed; 37 targeted SQL/catalog tests passed. The follow-up full TypeScript suite passed 183 with one skipped. Database-related Rust tests passed 13 with one live-fixture test ignored (the actual adapters were exercised by the native harness). Before extraction, the full Rust rerun passed 68 with three ignored. After extraction, the root suite passed all 28 tests and the standalone Database native crate passed 14 with its opt-in live-fixture case ignored; actual engines were exercised by Tauri. No plugin catalog entries were changed for this SQL work. The final full typecheck and production frontend build passed after the independently changing plugin coordinator/test types were reconciled.


During the independent plugin extraction, runtime ownership moved to the installed Database contribution. The core SQL controller now proxies that contribution; console UI, metadata cache and production parser worker are owned by the plugin generation. The follow-up package is Database 1.0.1, pinned in `default-plugins.json` to `a0acaf9a4937f91733a921a7aaaa68794a6e6e17`. Its [draft change](https://github.com/phpforge-dev/plugin-database/pull/1) retains the new dialect capabilities and adds vendor-keyword filtering plus rejection of foreign/four-part catalog qualifiers; its rebuilt shipped worker and 41 package tests passed. The native harness explicitly enables trusted packages only in its isolated synthetic profile before exercising SQL. This does not grant plugin permissions in a user's profile.


Final Database 1.0.1 native acceptance passed after optional package loading: all five SQL groups plus the isolated-profile package activation check. It prepared SQLite/SQL Server/Oracle catalogs in 347/956/1,624 ms in that run. Tables, views, exact quoted names, the 140th column, CTEs/derived scopes, first-character popup, Enter/Tab/undo, successful DDL invalidation, warm requests without metadata calls, SQLite session attachments/temp precedence/generated columns and SQL Server case-sensitive database/USE switching all passed. Vendor-inappropriate LIMIT candidates are excluded for SQL Server/Oracle. The final typecheck, root Rust suite, Database native-unit suite, plugin build/unit suite and Clippy passed.


The final `--sql-only` regression also passed with the installed Database package: all eleven SQL groups plus package activation, independently exercising PostgreSQL 16, MySQL 8.4 and MariaDB 11.4, PHP/Blade connection binding, metadata timeout/retry, DDL reconciliation, lifecycle and the production plugin's large-catalog worker benchmarks. The final 10k/100k/20k-character p95/p99 were 5/10 ms; the 50k/500k short-query p95/p99 were 3/3 ms. Both reports are successful: `.artifacts/sql-dialects-native.json` and `.artifacts/sql-intelligence-native.json`. All harness-owned containers and temporary projects were removed.
