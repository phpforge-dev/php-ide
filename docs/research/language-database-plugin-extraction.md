# Language and database plugin extraction evidence

Date: 24 October 2026. Independent implementation and architectural evidence only; no new reference-product observation or compatibility promotion.

## Ownership and contracts

Symfony/Twig and ignore completion are independent project.read language workers in [plugin-symfony](https://github.com/phpforge-dev/plugin-symfony) and [plugin-ignore](https://github.com/phpforge-dev/plugin-ignore). Basic file associations and editor syntax remain host infrastructure. Their previous provider implementations have been removed from the core; host tests import the pinned package sources.

[plugin-web-languages](https://github.com/phpforge-dev/plugin-web-languages) owns JavaScript/TypeScript semantic adapters, React/Vue declarations, project snapshots and self-contained TypeScript/Vue workers. The shared Monaco instance remains in the host. Before creating a JS/TS model the host records original mode flags and disables Monaco's built-in semantic registrations; the plugin registers disposable adapters and restores its selected capabilities when reactivated. Worker source is compressed inside the browser bundle and expanded locally, without Node or remote imports. Both the package worker factory and the public Monaco factory receive their compiler options and extra libraries before initialization.

[plugin-database](https://github.com/phpforge-dev/plugin-database) owns source dialogs/tree, SQL consoles/results, SQL/embedded-PHP intelligence, metadata catalogs, DDL generation, query preprocessing and driver-specific transport adaptation. Its native library owns driver/protocol implementations and confined Laravel import. The host statically links the pinned Rust crate; a native backend update requires rebuilding the IDE. Package UI code is trusted workbench code, not a sandbox. Authorization, file/process protection and credential release remain host responsibilities. Database::shutdown cancels pending dispatch futures, clears sessions and transient passwords and attempts PostgreSQL/MySQL query cancellation.

Shared sql-types.ts and database-contracts.ts contain only data and service contracts. src/sql-intelligence.ts is an optional contribution facade; it contains no parser, cache or worker. Exact current revisions, versions and permissions are authoritative in default-plugins.json and src-tauri/Cargo.toml.

## Verified evidence

| Check | Result and precise scope |
|---|---|
| Symfony/ignore independent packages | 14 package tests and reproducible CI builds passed; 12 provider tests also passed with the actual host |
| Web package browser harness | JavaScript JSDoc, TS cross-file navigation/diagnostics, React inference, Vue template/component props, snapshot ownership, disable/re-enable and worker routing passed |
| Public Monaco worker regression | Public getTypeScriptWorker invocation matching the native smoke scenario passed; package CI passed at 32a3fd83012da48d7a8f5def950a79b3f517cc79 |
| Database 1.0.2 package | 45 TypeScript tests and a bundled browser lifecycle check passed; native tests passed on Linux/macOS/Windows in CI at b5e78bfb10144868be039e2b114ff514bc5d7b5b |
| Native database safety | 14 Rust tests passed, including disposable SQLite browse/metadata, query cancellation during shutdown, transient-password removal and confined Laravel import; the real multi-engine fixture is explicitly ignored by default |
| Host contract migration | TypeScript validation and 59 targeted SQL/datasource/plugin tests passed with implementations imported from pinned packages; assertions were preserved |
| Database visual fixture | preview-database.mjs mounts the pinned production bundle through an SDK and synthetic API; source tree, fields, masked Laravel import, invalid-import recovery, cancel behavior and schema/SSH/driver tabs passed; generated dialog screenshot was inspected |
| Database test routing | check-database-versions.mjs sqlite passed against the cached package native crate using --lib, rather than accidentally selecting zero tests in the host crate |

Reports: .artifacts/database-plugin-fixture.json and .artifacts/database-versions.json. Browser screenshots are .artifacts/database-*.png. These synthetic browser results are separate from the real Tauri window acceptance.

## Authorized cleanup completed

The user subsequently explicitly authorized “Pode fazer a limpeza”. This supersedes the earlier internal decision to wait for complete foreground Tauri acceptance. The 22 unused dedicated web/database implementation copies listed below have now been removed, and shared/env-document.ts retains only its file-association predicate. The published package remains the source of runtime implementations. Before removal, all seven root SQL parser/resolver/catalog/embedded/model/DDL/datasource files were checked byte-for-byte against the pinned database package; concurrent user SQL fixes were preserved.

After removal, both direct TypeScript compiler checks passed, 74 focused tests passed against the pinned package implementations, and the frontend architecture check passed. No setup hook or cache fetch was executed by these checks. The coordinator also completed shared CSS cleanup and removed obsolete direct npm/Cargo dependencies. Full post-cleanup npm checks passed; complete native UI acceptance remains blocked.

The macOS session is still locked. Complete foreground Tauri feature/lifecycle acceptance after this cleanup remains unexecuted, and no native application was launched for this cleanup validation. Existing package CI, synthetic browser checks and earlier partial native observations remain separate evidence layers; they do not establish complete host acceptance or product compatibility.

## Removed inventory and remaining validation

The dedicated removal completed for exactly these 22 files:

1. src/web-languages.ts
2. src/web-project.ts
3. src/framework-types.ts
4. src/vue.worker.ts
5. src/vue-requests.ts
6. src/database-panel.ts
7. src/database-connection.css
8. src/sql-console.ts
9. src/sql-intelligence.css
10. src/sql-intelligence.worker.ts
11. shared/sql.ts
12. shared/sql-ddl.ts
13. shared/datasource.ts
14. shared/sql-intelligence/catalog.ts
15. shared/sql-intelligence/resolve.ts
16. shared/sql-intelligence/parser.ts
17. shared/sql-intelligence/embedded.ts
18. shared/language/plugins/database.ts
19. src-tauri/src/database.rs
20. src-tauri/src/database/oracle.rs
21. src-tauri/src/database/redis_edit.rs
22. src-tauri/src/laravel_database.rs

shared/env-document.ts was trimmed to the isEnvPath file-association predicate. Its unused EnvEntry, parseEnv, readEnv and maskEnv helpers now belong to the independent language packages. The Symfony and ignore provider files were already removed earlier; do not remove their generic routing or file associations.

Retained shared/sql-types.ts, shared/database-contracts.ts, the SQL DTOs and IPC contract declarations in shared/contracts.ts, the optional src/sql-intelligence.ts facade, and shared/plugin-document-associations.ts. Keep src/editor-workers.ts as generic host worker infrastructure with built-in JS/TS semantic modes disabled before the first model. Keep the generic language coordinator and optional contribution registry. Mixed shared CSS belongs to the separate CSS extraction owner: do not delete or rewrite shared shell/layout/theme rules as part of this dedicated-file cleanup.

The source comparison before deletion confirmed that current SQL fixes are present in the pinned package; native Oracle/Redis sources were previously checked after normalizing Rust formatting, with only intentional shutdown additions in database.rs. The current UI stylesheet extraction was published separately as Database 1.0.3 at 28b63bfad6537a9af2954232cb9a0e1883ed838a; its native source is unchanged from the previously validated 1.0.2 revision. Current default/catalog pins remain authoritative.

Focused cleanup verification commands (the two direct TypeScript checks, focused unit suite and architecture check passed after removal; database fixture/SQLite commands passed independently before removal):

```sh
rtk proxy node node_modules/typescript/bin/tsc --noEmit
rtk proxy node node_modules/typescript/bin/tsc -p tsconfig.tests.json
rtk proxy node --import tsx --test tests/symfony.test.ts tests/gitignore.test.ts tests/sql.test.ts tests/sql-intelligence.test.ts tests/sql-catalog.test.ts tests/datasource.test.ts tests/plugins.test.ts tests/native-language-coordinator.test.ts
rtk proxy node scripts/check-architecture.mjs
rtk proxy node scripts/check-database-versions.mjs sqlite
rtk proxy node scripts/preview-database.mjs
```

These initial commands intentionally avoid setup hooks while another agent publishes package pins. Both database scripts validate the existing cache revision/version and reject a stale cache rather than fetching silently. Once package publication and default/catalog updates settle, the coordinator must run the normal npm run typecheck, npm test and relevant final native acceptance, and record the actual remaining native report outcome. The real Tauri run requires the session to remain unlocked and accessible. Re-run package-specific tests only when additional changes or unresolved failures justify them.
