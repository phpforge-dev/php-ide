# Standalone PHP tool plugins — 2026-10-23

## Requirement and implementation boundary

User requirement: publish PHP/Xdebug, Composer and PHPUnit/Pest as independent plugins and remove their built-in implementations from the IDE. This is independent product work, with no new PhpStorm observations or compatibility claims.

Repositories:

- [PHP Debugger / Xdebug](https://github.com/phpforge-dev/plugin-php-debugger)
- [Composer](https://github.com/phpforge-dev/plugin-composer)
- [PHPUnit / Pest](https://github.com/phpforge-dev/plugin-php-tests)

Requires PHP IDE 0.2.11 or later. Older releases cannot load the native-tool/workbench extension contract. An IDE build is required to use the extracted tools; publishing the packages alone does not update an installed IDE.

The Rust DBGp service, Composer executor and test runner, their browser panels/styles, and Composer/test language contributions belong to their respective repositories. The core no longer declares `mod debug`, `mod composer` or `mod tests`, or imports those panels/providers. No compiled-in fallback is retained.

The host retains generic package installation, permission checks, SHA-256/platform validation, JSON-lines RPC, owned-process lifecycle, event routing, shared editor/keymap/docking services and an explicit workbench SDK. Browser assets and native executables are downloaded as package content. Installation does not run npm, Cargo or repository build scripts. Node is used only for build/test tooling.

## Trust model

Ordinary language plugins remain in Web Workers. A native tool is a different, explicitly trusted package class:

| Capability | Meaning |
|---|---|
| `project.read` | Mediated project file reads |
| `native.tool` | Execute the packaged native service with user privileges; not an OS sandbox |
| `workbench` | Execute the packaged UI module in the IDE window; access to DOM and displayed data |

Native/UI capabilities are never automatically granted by the default installer. The user must review them through an explicit activation action; background installation must not interrupt project opening with native-tool consent dialogs. Known read-only language defaults retain their existing consent policy. Partial native/UI grants do not activate a tool requiring both.

This implementation uses separately consented UI modules rather than claiming an arbitrary module is a sandboxed declarative view. The source specification is adjusted to reflect that boundary. A future isolated/declarative SDK would require its own migration and evidence.

Before every tool request, Rust rechecks enabled/consented state, declared/granted permissions, project scope, allowed methods and executable checksum. The manifest pins executable hashes per platform. Updating/reinstalling with identical permissions is not a security audit or a guarantee of a trusted publisher.

## Lifecycle and UX

Installed tools register their UI and commands only after consent and platform validation. Failure appears in Plugins and the status area. Missing debugger controls lead to plugin setup guidance. A disabled or removed provider cannot receive calls through legacy IPC names; those names only resolve dynamically to installed providers.

Disable/remove/update/project changes invalidate tool events and close owned services. Unix services run in a separate process group for owned child cleanup; Windows uses owned process-tree termination. Detached processes created independently by user/project code remain a documented limitation. Source editing remains usable with all three tools removed.

Composer/test subprocess behavior and Xdebug capabilities are preserved from the independently implemented tools. No new coverage, Debug Test, exception breakpoint or arbitrary-precision PHP analysis support is implied by extraction.

## Validation

- Package Rust tests: debugger 6 passed, 2 real-engine/container cases ignored; Composer 4 passed; PHPUnit/Pest 4 passed locally.
- Composer/test TypeScript behavior: 18 passed, 1 opt-in real-runner selector case skipped, against separate package sources.
- Real Tauri scenario `npm run test:native -- --no-db --tools-only`: consent gate, external workbench loading, Composer probe/execution/progress and cancellation, test CodeLens → native runner → JUnit results → failure navigation, Xdebug listener and breakpoint controls, native permission revocation/disable, clean re-enable and complete removal while PHP editing remains available. Report: `.artifacts/tool-plugins-native.json`; 6 groups passed, zero failures.
- Real Tauri default-install scenario `npm run test:native -- --no-db --plugins-only` passed: all eight pinned packages downloaded, language workers activated, and native tools retained empty grants while awaiting explicit activation. Report: `.artifacts/tool-defaults-native.json`.
- The first tool UI run failed during concurrent background plugin installation; it is not counted as passing. The test now waits for background installs to settle before invoking the tools.
- Core checks: typecheck, 66 Rust tests (3 ignored), 170 TypeScript tests (1 ignored), Clippy with warnings denied, architecture and locales passed. The debugger UI harness passed 26 checks using the actual plugin workbench module and simulated engine events. All three package pipelines passed their Rust tests and release builds on macOS arm64, Windows x64 and Linux x64; the catalog pipeline also passed. These are separate from native UI validation on each OS. A real engine socket is exercised by package unit fixtures; the Tauri scenario uses a synthetic PHP runner/Composer archive and listener controls. It does not establish real PHPUnit/Pest/Xdebug version coverage or compatibility with PhpStorm.

Do not access user databases, registry accounts or real credentials during these tests. Future engine/container tests must provision their own disposable fixtures.
