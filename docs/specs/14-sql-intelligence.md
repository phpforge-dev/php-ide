# SPEC-14 — Connection-aware SQL intelligence

## Goal and scope

Build SQL completion that knows the database attached to the active editor and suggests its real tables, views and columns as the developer starts typing. The experience must feel immediate after metadata preparation, including qualified names, aliases, common table expressions (CTEs) and subqueries. Generic keywords alone do not satisfy this specification.

Build on [SPEC-05](05-database-tools.md), use the editor interactions from [SPEC-03](03-workbench-ui.md), and integrate PHP/Blade through the language adapters from [SPEC-02](02-plugin-platform.md) and [SPEC-06](06-php-intelligence.md). This document defines future requirements, not delivered capabilities or validation results.

Use `dt-sql-parser` for syntax analysis, cursor-context suggestions and entity extraction. Implement the semantic binding between parser output, query scopes and connection metadata as a separate application layer. Do not assume that parser-provided entities resolve aliases, CTE output columns or nested scopes correctly without application tests.

Deliver independently accepted PostgreSQL, MySQL and MariaDB workflows first. SQLite, SQL Server and Oracle must have explicit dialect capability records before advertising equivalent completion. GenericSQL fallback must be labeled and must not imply support for engine-specific syntax. Redis is outside this SQL specification. Query execution, data mutation, formatting, query optimization and agent-generated SQL are separate concerns.

## Architecture and contracts

Keep credentials, live connections and metadata transport in Rust. Run `dt-sql-parser` and semantic resolution in a local Web Worker, with a Monaco adapter for presentation. Do not add a Node backend, remote completion service or database connection inside the worker. Completion must not require inference or internet access.

Pin the dependency version and retain its license/notice. Verify the selected package's browser/worker build, APIs and dialect coverage before integration. Use a small parser adapter so package-specific nodes do not leak into the metadata service or Monaco UI. Reuse the same resolver for console SQL and embedded SQL.

| Contract | Required information |
|---|---|
| Connection context | Project generation, session ID/generation, driver, server version when available, catalog/database, selected schema and effective name-resolution rules |
| Metadata snapshot | Context identity, revision, namespaces, tables/views, columns, declared types, nullability when available, fetch time, completeness and per-namespace errors |
| Relation identity | Catalog, schema and exact object name; display spelling, quoting/case rules and object kind |
| Completion request | Request ID, connection context, metadata revision, document URI/version, current unsaved SQL, cursor offset and cancellation state |
| Scope model | Query blocks, parent visibility, source relations, aliases, CTE bindings and projected output columns with provenance |
| Completion result | Request/context/version identity, replacement range, items, completeness, degraded reason and timing |
| Completion item | Label, insertion text, kind, source identity, qualifier, type if known, ranking inputs and optional documentation |

Use zero-based UTF-16 positions at the editor boundary and explicitly convert parser coordinates. Preserve exact identifier spelling separately from dialect-specific lookup normalization. Never merge different relations merely because their unqualified names match.

## Active connection and metadata lifecycle

- **SQL-01:** Bind every SQL console to a visible connection, database and schema context. Embedded SQL must use an explicit file-level connection binding or a visible project default. If several sources exist and no binding is selected, offer Choose Connection; never silently choose the first connected source.
- **SQL-02:** Begin background metadata preparation on connection and context selection. Load relation names and columns across the authorized namespace scope, rather than waiting for the database tree to expand or the user to type a particular table. Prioritize the selected schema and relations used by open documents. Show Preparing, Ready, Partial, Refreshing or Unavailable with useful counts and Retry/Refresh actions.
- **SQL-03:** Keep an immutable, versioned metadata snapshot in memory and transfer incremental changes to the worker. Coalesce requests and bound metadata concurrency. Warm completion must read the local snapshot without a database or IPC round trip per keystroke. Do not fetch table rows for completion.
- **SQL-04:** Define default budgets of 50,000 relations, 500,000 columns and 64 MiB of serialized metadata per connection. Treat these as initial product limits to verify and tune with named fixtures. Stop bounded loading with a visible Partial state and an action to narrow namespace scope; never report a capped snapshot as complete. Missing metadata may be fetched asynchronously for a referenced relation without blocking available suggestions.
- **SQL-05:** Scope snapshots by project, session generation, database, namespace selection and effective privileges. A connection/database switch must immediately remove old-context suggestions, even if an earlier request completes later. Identical table names in separate connections must never share column lists.
- **SQL-06:** Refresh affected metadata after successful local DDL, explicit Refresh and reconnect. Since external DDL has no guaranteed notification, revalidate metadata in the background at a configurable interval, initially 60 seconds while the context is active. Keep usable cached suggestions during refresh, mark stale state when refresh fails and remove dropped objects after successful reconciliation.
- **SQL-07:** Disconnect must cancel metadata work and invalidate completion authorization. Preserve editor text and connection selection, but do not present cached objects as a live connected catalog. Reconnect must establish a new session generation before restoring suggestions. Project close must release its snapshots and workers.
- **SQL-08:** Metadata failures must remain local to the affected namespace/relation. Respect database permissions and distinguish unavailable metadata from an object with no columns. Never persist passwords, credential-bearing URLs or metadata snapshots in project files/logs, and never forward them to agents.

## Query understanding and semantic resolution

- **SQL-09:** Parse the current unsaved statement, including text after the cursor. Recover useful context from incomplete SQL such as `SELECT u. FROM users u`, unfinished JOINs and partially typed identifiers. Keep syntax errors local; a parse failure must not suppress all known relation suggestions or freeze editing. Any bounded last-valid parse fallback must be checked against current text and scope before use.
- **SQL-10:** Complete real tables/views after FROM, JOIN, UPDATE and INSERT INTO. After a schema qualifier, restrict results to that schema. Respect the database's effective search path/default namespace and catalog rules; qualify ambiguous names rather than selecting an arbitrary object. Include database qualification only where the dialect and loaded metadata support it.
- **SQL-11:** Resolve table aliases with or without AS, including aliases declared after the cursor. After `u.`, offer only columns belonging to the visible binding of `u`. Once an alias replaces a relation name under the dialect's rules, do not treat the original name as an independently valid qualifier. Unknown qualifiers must not fall back to every column in the database.
- **SQL-12:** In expression positions, suggest columns reachable from the current query block. Prefer unqualified insertion only when unambiguous; otherwise insert an appropriate alias/schema qualifier. Do not deduplicate identically named columns from different sources into a misleading single item. Respect dialect-specific visibility of SELECT aliases in ORDER BY, GROUP BY and other clauses.
- **SQL-13:** Build a scope graph for nested query blocks. A derived table must expose only its projected output names, not every column from its underlying sources. Expand `*` and `alias.*` from known metadata; propagate expression aliases and explicit derived-table column lists. Preserve unknown types and unnamed expressions without inventing field names or types.
- **SQL-14:** Resolve non-recursive CTEs in declaration order, including chained CTEs, explicit output column lists and shadowing of physical tables. CTE columns must come from projections and source metadata. A CTE name must appear only where visible, and aliases inside its body must not leak to the outer statement.
- **SQL-15:** Support correlated subqueries where the dialect permits outer references. Inner bindings must shadow same-named outer bindings. Sibling subqueries and independent statements must not share aliases. Derived-table outer visibility must follow the dialect, including LATERAL rules, rather than treating every nested query as correlated.
- **SQL-16:** Define bounded handling for recursive CTEs and set operations. Use explicit CTE column lists or infer stable output names from the anchor/first branch, preserving uncertainty in incompatible or unresolved types. Enforce recursion/depth limits and return a degraded result instead of looping. Do not claim full recursive type inference.
- **SQL-17:** Honor dialect-specific quoted identifiers, reserved words, case folding and escaping. Completion must preserve existing quotes and replace only the active identifier segment. Strings and comments must not produce identifier suggestions except inside an explicitly recognized embedded SQL region.
- **SQL-18:** Use semantic context for INSERT column lists and UPDATE assignment targets. Restrict these to the target relation, avoid already used INSERT columns, and keep expression-side suggestions distinct from assignment targets. Unsupported constructs must have an explicit capability/limitation record rather than plausible but unrelated columns.

## Completion UX and responsiveness

- **SQL-19:** Trigger suggestions automatically on the first identifier character and after a qualifier dot, with no requirement to open the database panel, refresh manually or press a shortcut. Also support explicit completion and appropriate clause/whitespace triggers. Avoid unsolicited popups in comments or ordinary string literals.
- **SQL-20:** While metadata is cold, immediately show useful available suggestions and a nonselectable loading indication. Update an already visible list when relevant metadata arrives, preserving selection by stable item identity. Do not steal focus or reopen a dismissed popup because background work finished. An empty prefix after a known alias dot must show its available columns.
- **SQL-21:** Rank exact/prefix matches and symbols valid in the current scope before unrelated keywords. Show object kind, schema/source and declared column type when known. Distinguish physical, CTE and derived columns through useful source details. Large result sets must use stable bounded presentation and prefix filtering; omitted results must be identified as incomplete.
- **SQL-22:** Enter/Tab acceptance must replace the intended token, preserve qualifiers and surrounding SQL, and form one undoable edit. Escape must dismiss suggestions. Completion must work with Unicode, multiline SQL, quoted identifiers and unsaved edits without moving the cursor unexpectedly.
- **SQL-23:** Debounce/coalesce parsing as needed, cancel obsolete work and reject responses for old document versions, cursor contexts, connection generations or metadata revisions. Keep the main thread free of parsing and full-catalog scans. Bound request processing to 200 ms; on expiry, cancel or restart the worker and return a visibly degraded result without blocking editing.
- **SQL-24:** On a documented reference machine, target warm end-to-end completion p95 at or below 100 ms and p99 at or below 200 ms for a snapshot of 10,000 relations/100,000 columns and statements up to 20,000 characters. For the default metadata budget, report latency and memory separately. On a local fixture, target initial selected-schema suggestions within one second and full readiness within five seconds for the reference dataset. These are acceptance targets, not existing measurements; cold loading must remain usable when network or catalog size prevents the readiness target.

## SQL inside PHP and Blade

- **SQL-25:** Feed recognized SQL regions through the same connection-bound pipeline as console SQL. Map offsets and edits back to the original buffer, accounting for escaping and Unicode. SQL completion must not consume unrelated PHP or framework string contexts.
- **SQL-26:** Support literal SQL regions first. Explicitly classify concatenated/interpolated SQL and placeholders: do not execute PHP or substitute runtime values to obtain a query. Preserve bind placeholders and host-language interpolation during edits. If a safe partial mapping is unavailable, show the limitation and suppress unsafe edits.
- **SQL-27:** Show the selected connection near the embedded SQL context with a direct way to change it. Two files bound to different connections must resolve identical SQL against their own catalogs. Switching that binding must invalidate in-flight suggestions without changing the source text.

## Construction steps

1. Verify and pin `dt-sql-parser`; build a worker adapter and incomplete-query fixtures for each initial dialect.
2. Define connection identity, bounded metadata snapshots, progress and incremental refresh through restricted Rust IPC.
3. Implement visible connection bindings and eager background preparation with snapshot lifecycle tests.
4. Build relation/alias resolution, quoting and schema qualification, then automatic completion and safe insertion in Monaco.
5. Add projection inference, CTEs, derived tables, correlation, shadowing and bounded recursive/set-operation handling independently.
6. Integrate embedded SQL using explicit region/range mappings and file-level bindings.
7. Measure cold/warm latency, memory, cancellation and large-catalog behavior; validate the complete workflow in Tauri.

Keep the existing completion path behind an internal migration boundary until the new path passes acceptance. Never combine candidates from incompatible connection contexts. A fallback must be explicit about reduced capability; it must not claim semantic resolution it cannot provide.

## Acceptance scenarios

The `|` marker below represents the caret, not SQL syntax. Use fixture schemas with `public.users(id, name, email)`, `public.orders(id, user_id, total)`, `billing.users(id, billing_code)` and a second connection whose `users` has different columns.

| Case | Required result |
|---|---|
| SQL-A1 | Typing `SELECT * FROM us|` automatically suggests real matching relations without expanding the tree or pressing completion |
| SQL-A2 | `SELECT u.| FROM public.users u` offers id/name/email with provenance/types and excludes orders.total and billing_code |
| SQL-A3 | `SELECT * FROM billing.us|` offers only matching relations in billing; accepting preserves the qualifier |
| SQL-A4 | `SELECT | FROM users u JOIN orders o ON o.user_id = u.id` distinguishes u.id/o.id and qualifies ambiguous insertions |
| SQL-A5 | `WITH people AS (SELECT id, email AS contact FROM users) SELECT p.| FROM people p` exposes only id/contact |
| SQL-A6 | Chained CTEs and explicit output column lists expose their declared/projected names; a CTE shadowing users does not inherit hidden physical columns |
| SQL-A7 | `SELECT d.| FROM (SELECT user_id, SUM(total) AS amount FROM orders GROUP BY user_id) d` offers only user_id/amount |
| SQL-A8 | Correlated, shadowed and sibling-subquery fixtures include only legally visible bindings; non-LATERAL derived tables do not inherit illegal outer references |
| SQL-A9 | Wildcard projections, recursive CTE output names and UNION output names resolve under documented rules without recursion loops or invented types |
| SQL-A10 | Search-path collisions, mixed-case quoted names and dialect quoting insert the correct qualified identifier with a precise replacement range |
| SQL-A11 | INSERT/UPDATE target completion excludes unrelated relations and already listed INSERT columns |
| SQL-A12 | Switching connections while completion is pending never shows the previous connection's columns, including identical relation names |
| SQL-A13 | Cold loading shows progress/partial results; failed namespaces remain retryable; a dismissed popup stays closed after loading completes |
| SQL-A14 | Local and external DDL refresh additions/removals; failed refresh is visibly stale; disconnect/reconnect rejects prior-generation results |
| SQL-A15 | Incomplete or malformed SQL remains editable and returns bounded useful results; rapid typing/cancellation never applies an obsolete edit |
| SQL-A16 | PHP/Blade literals use the selected connection and preserve escaping/Unicode; unsupported dynamic regions and unrelated strings receive no unsafe SQL edits |
| SQL-A17 | Worker failure, depth limits and metadata caps show recoverable degradation; cross-project snapshots and secrets never leak |
| SQL-A18 | Warm requests make zero metadata database calls; named performance fixtures record p50/p95/p99, cold readiness, memory and budget outcomes |
| SQL-A19 | Enter/Tab/Escape, undo, selected item stability and first-character completion pass in the actual Tauri window |

Test parser behavior, scope resolution and Monaco adaptation separately, including negative cases that assert forbidden suggestions are absent. Use disposable databases and synthetic schemas only. Exercise PostgreSQL, MySQL and MariaDB independently and record parser version, engine version, runtime, OS, fixture and artifacts for each claimed capability. Additional adapters need their own quoting, namespace and syntax cases.

Run `npm run typecheck`, `npm test`, targeted SQL/worker checks and `npm run test:native` with the appropriate disposable fixtures when implementing behavior. Measure production-built workers in the native application, not only a development browser. Record skipped cases and remaining limitations precisely in the feature catalog and compatibility matrix; local acceptance does not establish equivalence with PhpStorm.

## Dependency references and evidence boundary

- [dt-sql-parser](https://github.com/DTStack/dt-sql-parser): public package documentation for parser APIs, supported dialects, cursor suggestions and entity extraction. These capabilities are inputs to integration, not evidence that this specification is implemented.
- [Monaco SQL Languages](https://github.com/DTStack/monaco-sql-languages): related integration reference; adopting that wrapper is not required by this specification.

The connection-aware resolver, cache policies, UX and performance budgets above are product requirements. No proprietary implementation is inferred or required, and no comparative reference observation or implementation acceptance is asserted here.
