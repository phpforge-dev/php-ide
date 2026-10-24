# PHP IDE construction specifications

## Purpose

Build an independent desktop IDE for PHP and Laravel using Rust and Tauri 2. The product must let a developer open a project, edit safely, navigate PHP code, extend language behavior, customize the workspace with immediate feedback, inspect databases, manage Git changes, use terminals and Docker, consult agents, debug PHP, manage Composer dependencies and run tests without leaving the application.

These documents describe the product prospectively, as instructions for building it from the beginning. “Must” identifies a requirement; “should” identifies a preferred behavior. A requirement is not a claim that an implementation exists or has passed validation.

## Specifications

| ID | Specification | Outcome |
|---|---|---|
| SPEC-01 | [IDE foundation](01-ide-foundation.md) | A secure desktop runtime, safe workspace, editor and language service lifecycle |
| SPEC-02 | [Plugin platform](02-plugin-platform.md) | Discoverable extensions with explicit consent, bounded APIs and recoverable failures |
| SPEC-03 | [Workbench UI](03-workbench-ui.md) | A complete, keyboard-accessible daily development workflow |
| SPEC-04 | [Design system](04-design-system.md) | Consistent components, themes and live appearance adjustments |
| SPEC-05 | [Database tools](05-database-tools.md) | Reviewed connection setup, schema browsing and bounded query execution |
| SPEC-06 | [PHP intelligence](06-php-intelligence.md) | Version-aware semantic assistance and reviewed refactoring |
| SPEC-07 | [Git integration](07-git.md) | Index-aware review, commits, branches and recoverable synchronization |
| SPEC-08 | [Integrated terminal](08-terminal.md) | Native PTY sessions with bounded output and clear lifecycle |
| SPEC-09 | [Docker integration](09-docker.md) | Explicit-context resource operations, logs, terminals and Compose |
| SPEC-10 | [Agent integration](10-agent-integration.md) | Reviewed context, streamed consultation and mediated change review |
| SPEC-11 | [PHP debugger and Xdebug plugin](11-php-debugger.md) | Controlled debug sessions, breakpoints, stepping and runtime inspection |
| SPEC-12 | [Composer integration](12-composer.md) | Reviewed dependency operations, metadata assistance and bounded execution |
| SPEC-13 | [PHP test execution](13-test-execution.md) | Reliable PHPUnit/Pest selection, results and failure navigation |
| SPEC-14 | [Connection-aware SQL intelligence](14-sql-intelligence.md) | Immediate completion from active-connection metadata with aliases, schemas, CTEs and subqueries |

## Build sequence

1. Establish the runtime, typed IPC contracts, workspace confinement and component/token foundations from SPEC-01 and SPEC-04.
2. Deliver the vertical workflow from Welcome to opening, editing, saving and reopening a file. Integrate layout and focus behavior from SPEC-03.
3. Add PHP language service initialization, unsaved-buffer synchronization, completion, navigation and diagnostics using SPEC-06. Expand semantic families and reviewed refactoring independently.
4. Implement the plugin contract and an example extension. Exercise consent, timeout and recovery through the actual editor.
5. Deliver database setup and one PostgreSQL adapter end to end. Add MySQL and MariaDB as separately tested targets.
6. Deliver SPEC-07 status/diff/staging/commit before branches, remotes and advanced conflict operations.
7. Build SPEC-08 local PTY sessions and flow control, then reuse them for SPEC-09 container terminals. Add Docker resource and Compose workflows with explicit contexts.
8. Deliver SPEC-10 consultation, context review and cancellation before adding mediated editing and Keep/Discard workflows.
9. Build SPEC-12 metadata assistance and reviewed local Composer execution, then reuse setup guidance for SPEC-13 runner configuration.
10. Deliver SPEC-13 discovery, validated selectors and final test results before rerun-failed or coverage extensions.
11. Extend SPEC-02 with debugger-provider capabilities, then deliver SPEC-11 as a separate PHP/Xdebug plugin with listener/stepping/inspection and local debug launch; integrate Debug Test only after runner selection and debugger correlation work independently.
12. Build SPEC-14 metadata preparation and connection-bound SQL completion on SPEC-05, then expand scope resolution and embedded SQL through independent acceptance cases.
13. Complete distribution checks and expand tools or database adapters only through explicit capability-specific specifications.

Each step must leave a usable application. Do not defer error handling, visible state or keyboard navigation until a final polish phase.

## Shared engineering rules

- Use Rust and Tauri 2 for the application runtime. TypeScript, Monaco and xterm may run inside the WebView. Node may support development and tests; it must not become the application backend or a privileged frontend API.
- Keep privileged operations behind validated, bounded IPC contracts. Confine workspace access and reject traversal and symlink escapes.
- Preserve existing user files and unfinished edits. Operations must expose actionable errors and support retry where safe.
- Never persist passwords in project files, settings, logs or connection URLs. Never forward credentials to agents.
- Use only original assets or publicly licensed dependencies/assets with attribution. Do not extract proprietary code or components.
- Use disposable containers and synthetic projects for tests. Never connect test scripts to real user databases.

## Acceptance and evidence

Every acceptance record must identify the requirement ID, fixture, runtime, operating system, result and artifact. Record skipped cases and limitations explicitly. A UI action is accepted only when its observable result is verified.

After changes, run `npm run typecheck`, `npm test` for Rust and relevant targeted checks. Runtime or interaction changes must also be exercised in the real Tauri window through `npm run test:native` with suitable fixtures. Historical Electron results do not validate the Rust application. Documentation-only changes require these repository-mandated baseline checks; they do not require launching interactive workflows unless those workflows changed.

Keep product requirements, documentary research, authorized reference observations, hypotheses and implementation evidence distinct. Local test results do not establish PhpStorm compatibility. Update the [feature catalog](../research/phpstorm-feature-catalog.md) and [compatibility matrix](../compatibility/phpstorm.md) with precise evidence and limitations when behavior changes; never promote an entire family from a single case.

## Planning context

Read the [initial slice](../research/implementation-slice-01.md) and [feature catalog](../research/phpstorm-feature-catalog.md) before expanding scope. The initial slice is historical and includes an earlier runtime; the Rust/Tauri requirement in these specifications governs new construction. Existing research and operational guides provide background without serving as acceptance evidence for this plan.
