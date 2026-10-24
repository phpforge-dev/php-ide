# SPEC-05 — Database connections and tools

## Goal and delivery scope

Let a developer configure a data source, verify connectivity, inspect schema and run bounded queries with clear control over credentials and side effects.

Deliver PostgreSQL first, then MySQL and MariaDB with independent acceptance records. Add SQLite, SQL Server, Oracle and Redis only through adapter-specific capability and authentication checks. Redis must use a key/value workflow rather than pretending to be SQL. A shared driver implementation does not establish support for every engine version.

## Architecture and contracts

Keep connection transport, credentials, sessions, query execution and cancellation in Rust. The WebView owns editable drafts and presentation. Adapter methods should cover capabilities, test, connect, disconnect, list namespaces/tables, columns, bounded preview and query execution; unsupported operations must return explicit capability errors.

Model non-secret `DataSourceProfile` separately from an in-memory `ConnectionDraft` and `Session`. A profile includes ID, label, driver, host/port or file path, database, user and TLS configuration. Passwords and credential-bearing URLs must never be serialized into profiles, layouts, recent items or logs.

Requests must include a profile/session identifier and request ID. Results must include columns, typed or safely encoded values, truncation/page metadata and safe timing/error information. Preserve distinctions among NULL, empty string, numbers, binary data and truncated text.

## Connection setup UX

Use a dialog with a source list, driver identity, aligned labeled fields and a footer containing Test Connection, Apply and Connect. Show advanced options only when relevant to the selected adapter. Defaults must follow the chosen driver and remain editable.

- **DB-01:** Adding/editing a connection creates a draft. Cancel must discard draft changes and transient secrets. Apply saves only non-secret configuration; Connect validates, establishes a session and makes success visible in the database tree.
- **DB-02:** Test Connection operates on the draft and shows pending, success or actionable failure without silently saving it. Changing connection fields invalidates the previous test result.
- **DB-03:** Validate required fields, port ranges and incompatible options before connecting. Preserve input on failure. Distinguish authentication, DNS/network, TLS and missing-driver errors without revealing secrets.
- **DB-04:** Mask passwords by default and make any temporary reveal explicit. Keep secrets in memory for the session only. After restarting, request credentials again unless a separately specified OS credential-store integration is available.
- **DB-05:** Connection attempts and metadata requests need bounded timeouts and cancellation. Prevent duplicate clicks from producing duplicate sessions. Close abandoned sessions when deleting a source or closing its scope.
- **DB-06:** Expose TLS modes accurately. When verification is requested, validate certificates and host identity; never silently fall back to insecure transport. Clearly show when a selected mode is unsupported.

## Laravel environment import

Offer Import from Laravel .env from the connection editor. Confirm a project root with `composer.json`, let the user select an eligible environment file and parse it as bounded text; do not execute PHP or shell code.

- **DB-07:** Read at most 64 KiB through confined project access. Support documented DB_* fields and credential-bearing DB_URL/DATABASE_URL inputs for supported network drivers. Define precedence explicitly: a valid URL supplies connection fields, while separate fields fill missing values; surface malformed URLs rather than silently selecting another source.
- **DB-08:** Import into a reviewable draft only. Do not save, test or connect automatically. Keep imported secrets masked and remove credentials from any displayed URL.
- **DB-09:** Explain unsupported interpolation, PHP configuration logic, cached configuration and URL options. Do not claim to reproduce Laravel configuration resolution. A Docker-internal hostname should prompt guidance to review host/port, not an automatic environment rewrite.
- **DB-10:** A failed import must leave the previous draft intact. Cancel must clear transient imported credentials. Never include the source file or secrets in an agent request.

## Browsing and query workflow

After connecting, show connection state and a lazily loaded namespace/table tree. Selecting a table must reveal columns and a bounded data preview, with a manual refresh action. Keep metadata failure local to the affected node.

- **DB-11:** Use paginated or explicitly capped previews. Initial product defaults should be 200 rows per page, a 1,000-row query display cap and a 30-second query timeout, overridable only within documented upper bounds. Mark truncation visibly.
- **DB-12:** Execute table previews through a driver-enforced read-only transaction where supported. A keyword check is not a security boundary; adapters lacking this guarantee must disclose the limit and avoid claiming enforced read-only access.
- **DB-13:** Bind console tabs to a visible connection/database. Run only explicit user actions; show running, cancelling, cancelled, succeeded and failed states. Cancellation must reach the driver/server where available, with session disposal as a documented fallback.
- **DB-14:** Preserve SQL and prior results on failure. Render cells as data, never HTML. Quote identifiers using the adapter and bind value parameters for generated queries.
- **DB-15:** Separate inspection from data/DDL mutation. The first delivery may provide inspection only. Enabling writes requires an explicit execution policy, visible target, transaction/commit/rollback behavior and reviewed changes; automatic commit of grid edits is outside the first delivery.
- **DB-16:** On disconnect, invalidate session IDs and disable execution until reconnecting. Do not silently replay a query after reconnecting, especially a possible mutation.

Redis expansion must define SCAN pagination, data types, TTL and payload limits separately. Oracle and SQL Server expansion must define naming, authentication, TLS and client-library requirements separately. SQLite expansion must define file access, locking and read-only handling.

## Construction steps

1. Define profile/draft/session types and adapter capabilities.
2. Build the connection dialog with validation, secret handling and synthetic responses.
3. Implement PostgreSQL connect/test/disconnect and metadata in Rust.
4. Connect tree, column view, preview and cancellation to the actual native bridge.
5. Implement Laravel import and its review/cancel behavior.
6. Add MySQL and MariaDB independently; record supported versions.
7. Specify mutation support and additional adapters as separate increments.

## Acceptance scenarios

| Case | Required result |
|---|---|
| DB-A1 | Correct fixture credentials connect and reveal the expected schema |
| DB-A2 | Wrong password produces a useful error without appearing in UI diagnostics or logs |
| DB-A3 | Apply/restart restores non-secret profile and asks for the missing password |
| DB-A4 | Editing a tested field removes stale success status |
| DB-A5 | Laravel import fills a draft; cancelling makes no profile/session change |
| DB-A6 | Malformed URL, oversized file and symlink escape are rejected without losing the draft |
| DB-A7 | Large preview is bounded, identifies truncation and preserves NULL versus empty string |
| DB-A8 | A long query can be cancelled; later results cannot overwrite the cancelled state |
| DB-A9 | TLS verification failure does not trigger an insecure retry |
| DB-A10 | Disconnect/reconnect does not replay an earlier query |
| DB-A11 | Project switch closes or explicitly re-scopes sessions without exposing old credentials |

Provision disposable containers with fixture schemas, random local ports, readiness checks and cleanup on success/failure. Test each claimed engine/version, authentication failure, metadata and query path. Use synthetic environment files. Verify the setup/import/cancel and query flows in Tauri; adapter unit tests alone do not validate the connection UI. No test may access a real user database.
