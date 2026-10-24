# Extraction validation handoff

Status: published package builds and unit/lifecycle tests pass; complete native extraction acceptance is still pending. The user explicitly authorized cleanup while native acceptance remains blocked by the locked macOS session. The native feature copies and mixed feature CSS listed below were removed under that authorization. The macOS session was confirmed locked through public CoreGraphics flags. The native runner now stops early with an actionable lock error. No real databases or agent inference are used.

## Resume native acceptance

1. Verify `CGSSessionScreenIsLocked` is false and the user session is on console. Do not launch while locked.
2. Run the actual Tauri fixture suite with `--production-ui --no-db --extraction-only`; build the frontend and Rust binary first. Use a fresh isolated synthetic profile. The runner creates its own SQLite file and disposable Docker fixtures.
3. Require every selected feature group and the final disable/re-enable lifecycle check to pass. Keep all unhandled errors as failures except Monaco's exact standard `Canceled` cancellation. Require document visibility to be visible.
4. The user explicitly authorized removing the old copies before this pending native gate; cleanup is now implemented. Notify the database/web and PHP/preview agents of any native regression. Earlier partial passes remain partial evidence.
5. Repeat typecheck, architecture checks, unit/Rust checks and the same complete native suite after removal. Update the evidence matrix with the exact resulting report.

## Native feature owner removal list (completed with explicit user authorization)

Removed these old feature implementations, already owned by external packages:

- `src/git-panel.ts`, `src/git-account.ts`, `src/git-branches.ts`, `src/git-log-view.ts`, `src/git-tools.ts`, `src/merge-editor.ts`, `src/tree-git-status.ts`, `src/editor-changes.ts`.
- `src/docker-panel.ts`, `src/terminal-panel.ts`, `src/agent-panel.ts`.
- `src/git-log.css`, `src/tree-git-status.css`.
- `src-tauri/src/git.rs`, `src-tauri/src/git_scenarios.rs`, `src-tauri/src/docker.rs`, `src-tauri/src/terminal.rs`, `src-tauri/src/agents.rs`.
- `shared/merge.ts`: `tests/merge.test.ts` now imports `../.tools/plugin-packages/git/shared/merge`; no other live import remains.

Keep generic Rust RPC/process/workspace/credential/permission brokers and the shell's optional contribution facades. The native libraries are statically linked external Git dependencies; disabling a plugin revokes its feature services and releases resources, rather than unloading machine code.

The other owners remove database/web and PHP/image/SVG copies and their dedicated CSS under the same explicit user authorization. They do not edit mixed shell CSS.

## Mixed CSS cleanup (completed by native feature owner)

The six published UI packages now contain their feature-specific rules copied from these five core files: `src/style.css`, `src/workbench.css`, `src/theme-surfaces.css`, `src/islands-shell.css`, `src/tool-windows.css`. Feature-private core copies have been stripped; generic shell rules remain.

Re-run `python3 docs/plugins/extraction-css-audit.py` on the latest core sources. It is a read-only selector audit, writing `/tmp/ide-owned-css.json` and `/tmp/ide-residual-css.json`. Inspect the private selectors and the residual rules before applying residual text back to those exact five source files. The script splits mixed selector lists and preserves generic rules. Never apply a stale precomputed residual after concurrent edits.

The pre-cleanup audit identified560 rules: Git188; Docker123; agents63; terminal27; database154; PHP5. The post-cleanup audit reports zero feature-private rules in all five core stylesheets. SVG/image had no mixed rules. Preserve generic editor layout/split, usages popup, semantic token theme styles, core `#db`/`#agent` containers and `#show-db` shell visibility control. Feature-private selectors include Git/merge/account/line-diff; Docker/services; terminal/xterm; agents; DB/SQL/data/driver/connection/Redis; PHP gutter/hierarchy/refactor.

## Published CSS package evidence

All six local builds/tests pass: Git3, Docker3, agents3, terminal3, database45, PHP28. Git's fixture additionally verifies shared tree/editor shell restoration on unload. Native source directories are unchanged, so Cargo remains on the earlier tested native revisions. Defaults/catalog use these new UI revisions and exact main hashes:

| Package | UI version | Revision |
| --- | --- | --- |
| Git | 1.0.1 | 7277252ab6ed9cf7f59aae54efd2acfafe38dca9 |
| Docker Services | 1.0.1 | 0de570e1e61b980c9c67f718269ff25379982731 |
| Agents | 1.0.1 | e6236905963b6341d4f6033862847a00a68843f6 |
| Terminal | 1.0.1 | bbdf64de5d3f1e9e31c17753a239555734841f1d |
| Database | 1.0.3 | 28b63bfad6537a9af2954232cb9a0e1883ed838a |
| PHP Intelligence | 1.0.1 | 34075e092a76fdf4c6bed77dfae50c02a0ab8c7b |

These checks do not establish complete native acceptance for these UI revisions. Full native acceptance remains pending after cleanup. The explicit cleanup authorization does not substitute for that validation.

## Post-cleanup browser validation

The repaired browser fixtures load pin/version/main-hash-verified production JS and CSS from `.tools/plugin-packages` through the SDK service registry. They never read sibling plugin working directories. All passed after core CSS removal with no captured page errors:

- `scripts/check-tool-windows-ui.mjs`:18 synthetic Git/Docker UI checks; report `.artifacts/tools-redesign-browser.json` and dark/light screenshots.
- `scripts/preview-islands.mjs`: dark/light welcome, workbench and terminal captures under `.artifacts/fidelity/foundation-*.png`; actual terminal session tab and agent contribution required.
- `scripts/preview-workbench.mjs`: appearance controls/persistence, Git gutter, references, agent panel, database dialog and Docker logs; screenshots and `.artifacts/appearance-checks.json`.

The shared loader is `scripts/pinned-workbench-fixture.mjs`. Window geometry APIs are explicitly replaced with browser fixture no-ops. All backend responses are synthetic; these browser checks do not establish real Git/Docker/PTY/agent/native behavior. Full Tauri acceptance remains pending until the macOS session is unlocked.

## Host cleanup follow-up — 24 October 2026

The plugin manager no longer contains the install-all smoke branch or its download/error status. Only `src/native-smoke.ts` prepares all pinned packages for an explicitly enabled synthetic native run; regular installation stays in the Rust maintenance queue. The manager browser regression uses a smoke-marked fixture to verify mounting the manager still causes no unsolicited downloads.

Production Tauri resources no longer include `tests/fixtures/projects/`. Native runners copy the requested fixtures into disposable projects and pass their paths explicitly, including packaged runs. Fixtures remain in the repository for validation. Historical slice documents remain historical evidence rather than current architecture instructions.

Validation for this follow-up: `npm run check` passed (189 unit tests, one pre-existing skip, 36 Rust tests, architecture, typecheck, Clippy and locales); `npm run test:plugins:ui` and the production web build passed. The native window scenario was not rerun for this follow-up; the locked-session limitation above still applies.
