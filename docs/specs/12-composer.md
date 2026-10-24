# SPEC-12 — Composer integration

## Goal and scope

Let a developer understand and edit PHP dependency configuration, install dependencies, add/remove packages and run explicit Composer actions with visible commands, progress and recoverable failures.

Build on [SPEC-01](01-ide-foundation.md), [SPEC-03](03-workbench-ui.md), [SPEC-06](06-php-intelligence.md) and, for an optional container executor, [SPEC-09](09-docker.md). Keep project metadata analysis separate from execution: opening `composer.json` must never install packages or execute project scripts.

Initial scope includes root `composer.json` assistance, local/PHP archive executable setup, install, selected/all update, require/remove, dump-autoload, validate and declared scripts. Package search and Docker execution follow as independent increments. Private-registry credential management, audit/outdated/why, automatic upgrades and multi-root orchestration require separate specifications.

## Architecture and contracts

| Contract | Required information |
|---|---|
| Project metadata | Manifest document version, disk revision, lock/installed revisions and parse state |
| Executor | Auto/path/PHP archive/container mode, safe executable/image identity and prerequisites |
| Operation plan | Allowed action, packages/constraints, dev flag, script, cwd and effective arguments |
| Run | Opaque ID, immutable plan, project generation, lifecycle and timestamps |
| Progress/result | Run ID, sequenced bounded stdout/stderr, exit/cancel/timeout status and truncation |
| Package candidate | Name, description, source, published version data and availability state |

Use pure TypeScript for tolerant editor context and metadata rules; use Rust for plan validation, CLI spawning, network requests and cancellation. No generic shell string may cross IPC. The backend must validate plans independently of CodeLens or panel input.

## Configuration and editor assistance

- **COMP-01:** Detect the root manifest without executing PHP. Handle invalid/incomplete JSON with position-aware diagnostics while retaining useful cursor completion. Preserve formatting and undo when applying an edit.
- **COMP-02:** Offer relevant schema keys, package/platform names, version constraints and script references in their correct contexts. Suggestions derived from the lock file must not masquerade as current registry data.
- **COMP-03:** Distinguish required constraints, locked versions and installed versions in the dependency panel. Missing vendor data and missing lock data must be different states.
- **COMP-04:** Navigate declared packages to confined installed metadata and `@script` references to the local declaration. Missing targets require useful feedback rather than a guessed path.
- **COMP-05:** Diagnose malformed manifests, missing required packages and stale lock state only through documented, version-aware rules. If reproducing Composer's content-hash logic, test it against named Composer fixtures and expose unsupported cases; otherwise report consistency as unknown and offer explicit Validate.
- **COMP-06:** Refresh metadata and affected PHP indexes after manifest, lock or installed metadata changes, including failed/cancelled operations. Associate diagnostics with current versions and reject stale editor fixes.

## Executable setup and operation planning

- **COMP-07:** Offer auto discovery, a chosen executable/PHP archive and optional Docker mode. Show the selected identity and probe it through an explicit version action with a timeout. Treat a project-local archive as executable project code, not a trusted bundled tool.
- **COMP-08:** Create an immutable reviewable plan before each action, showing project, executor, command and likely effects on manifest/lock/vendor. Distinguish Install from Update and package-specific Update from all-dependency Update.
- **COMP-09:** Validate package names, constraints, allowed action flags and declared script names. Use argument arrays, reject injected options and never run arbitrary caller-provided shell syntax. Composer scripts themselves may contain commands; this does not make them sandboxed.
- **COMP-10:** Resolve dirty manifest buffers before running a disk-based command. Prompt Save/Cancel rather than executing configuration different from what the editor shows. Revalidate relevant revisions immediately before launch.
- **COMP-11:** Make execution of project/package scripts and plugins explicit in the plan and trust flow. Provide a supported restricted mode using the appropriate Composer controls; explain that it may change project setup behavior. Neither argument validation nor a project cwd confines executed project code.

## Panel, search and execution

- **COMP-12:** Provide Install, Update, Require, Remove, Dump Autoload, Validate and declared-script actions with enabled reasons. Confirm removal with the package and dependency section identified. Editor CodeLens and panel controls must invoke the same planner.
- **COMP-13:** Allow one Composer mutation per project at a time and reject duplicates natively. Use visible running/cancelling/succeeded/failed/cancelled/timed-out states. Preserve package-entry drafts and safe diagnostics after errors.
- **COMP-14:** Stream stdout/stderr with bounded queues and retain an initial 512 KiB output tail. Start with a 30-minute execution timeout and shorter probe/search timeouts. Mark truncation; render output as text and redact known credential-bearing arguments/URLs.
- **COMP-15:** Cancellation must stop owned processes where supported and reconcile manifest/lock/vendor afterward. Do not promise rollback of partially downloaded packages or changed files, and never automatically restore a lock file over concurrent user changes.
- **COMP-16:** Search package names through an explicit HTTPS registry adapter, with debouncing, encoded queries, bounded responses and stale-response rejection. Show version source and request errors; offline/search failure must still allow a manually entered package and constraint.
- **COMP-17:** Do not persist authentication tokens or read registry credential files into the UI/agent. Delegate existing credentials to Composer mechanisms. Unavailable noninteractive authentication must yield setup guidance, not an invisible prompt wait.

In container mode, show the chosen Docker context/image and project mount. Use explicit arguments, a confined source mount and a platform-appropriate file-ownership policy. Do not claim the container is isolated from mounted source or network. Verify Composer/PHP/platform compatibility independently from a local executable probe.

## Lifecycle and recovery

- **COMP-18:** Project switching must not retarget a running plan. Require an explicit wait/cancel decision for active mutations, reject late events and refresh the original project state on its next open.
- **COMP-19:** After failure, present what is known to have changed and offer Refresh, Edit Configuration or a new reviewed Retry. A nonzero process exit must not be transformed into success because vendor files exist.

## Construction steps

1. Define metadata/plan/executor contracts and offline manifest fixtures.
2. Build editor completion, navigation and version-aware diagnostics.
3. Implement executable selection/probe and validated local action planning.
4. Add the dependency panel, streamed execution, cancellation and reconciliation.
5. Add require/remove review and optional registry search.
6. Add Docker mode separately, then validate actual Composer behavior on disposable projects.

## Acceptance scenarios

| Case | Required result |
|---|---|
| COMP-A1 | Incomplete JSON retains editor assistance and never launches a command |
| COMP-A2 | Manifest/lock/vendor states appear separately and refresh after changes |
| COMP-A3 | Missing executable opens setup; probe identifies the selected tool |
| COMP-A4 | Dirty manifest or a stale plan blocks execution until reviewed |
| COMP-A5 | Require/remove plans preserve dev intent and reject package/flag injection |
| COMP-A6 | Script/plugin execution policy is visible before starting project code |
| COMP-A7 | Progress appears while running; duplicate runs are rejected and output is bounded |
| COMP-A8 | Cancellation/failure preserves input and reconciles changes without claiming rollback |
| COMP-A9 | Registry failure allows manual entry and drops stale search responses |
| COMP-A10 | Local and container fixture runs preserve expected file ownership and scope |
| COMP-A11 | Credentials remain absent from profiles, agent context and routine logs |

Use synthetic executables for deterministic arguments, timeouts and streaming tests. Run real Composer only in disposable projects with controlled dependencies/scripts; prefer offline fixtures and identify network-dependent tests separately. Verify the native panel/CodeLens flow in Tauri. Record executor, Composer/PHP versions and limitations independently; editor completion does not validate dependency execution.
