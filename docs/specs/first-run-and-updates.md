# First-run plugin setup and application updates

Status: implemented locally in the Rust/Tauri host. Visible-window native acceptance and a published signed release remain separate validation steps. This is an independent product requirement, not a reference-product compatibility claim.

## User experience

A fresh application profile opens **Set up your environment** before restoring or opening a project. The user can search the 21 release-pinned plugins, select PHP essentials or make individual choices. Nothing is selected or installed silently. Each card describes the user-facing capability and requested permissions. **Install selected** immediately submits the selected packages to a background Rust queue. Progress, failures and retries remain visible; **Continue to the IDE** does not wait for downloads and also supports starting with no plugins.

The screen completes only when the user chooses Continue. Closing the app during setup resumes that unfinished setup next time. Once completed it does not appear again, including after webview cache resets or project changes. Existing profiles migrate without another first-run screen; installed packages and their permission decisions remain intact. Marketplace remains the normal place to add plugins later.

**Updates and installations** opens from Settings (the appearance dialog), with the other preferences. It is not a button pinned to the window. The panel exposes the queue, available versions, release notes, manual downloads and preferences. Update notices are in-app notifications with view and dismiss actions; they do not request OS notification permissions.

## Defaults and scheduling

| Preference | Default | Effect |
| --- | --- | --- |
| Check for new versions | On | Check on launch, network recovery and every four hours while the app is open |
| Download plugin updates automatically | Off | Opt-in background downloads; verified packages apply on the next application launch |
| Download IDE updates automatically | Off | Opt-in signed download; apply when closing normally or explicitly choosing restart |

With automation off, checking only reads metadata and displays a notice. No update package is downloaded or installed. Enabling an automatic download option enables checking; disabling checking disables both automatic options. Manual check/download remains possible. The settings are independent for plugins and IDE and persist in the native user profile.

Automatic updates never force an active session to restart. Explicit restart uses the existing unsaved-buffer guard and asks the user before stopping terminals/tasks. A signed app update applies on normal close only after that same guard accepts closure. An installation failure offers closing without the update. Plugin updates are applied before the first workbench mounts on the next native process launch, not on an arbitrary frontend reload.

## Native ownership and persistence

`app-preferences.json` stores preferences and plugin jobs under the Tauri configuration directory. Writes are serialized and use temporary-file replacement. Interrupted download jobs return to queued on the next launch. A damaged preferences file is preserved as a uniquely named backup and automation returns to off. Credentials and signing private keys are never stored in these preferences.

The Rust worker owns downloads, so opening a project or changing UI views does not cancel the queue. Initial choices reuse release-pinned validation, size/path restrictions and the existing atomic package installer. Explicit permission consent accompanies the selection. Consent replay after an interrupted install requires the exact verified release and never overrides a later manager permission/enable decision.

For updates, only user-installed packages with the same catalog origin, a strictly newer version and a compatible minimum IDE version are eligible. Project-local plugins and unrelated same-ID installations are not replaced. Updates are inspected and staged through the existing catalog bridge; repository install/build scripts are never run. Newly declared permissions pause the queue for explicit review. Disabled state and previously denied permissions survive the replacement.

The legacy download-every-default-on-project-open path is restricted to explicit synthetic native test mode. Normal users only install their selections. Existing manager loading and optional feature activation are refreshed after a background installation completes.

The six external Rust feature libraries are still linked into the IDE binary. Updating their JavaScript UI package does not replace native machine code. Publishers must keep the workbench API compatible or require a newer IDE. Native backend changes still need an IDE build/release.

## IDE update distribution

IDE downloads use `tauri-plugin-updater` through restricted host commands; no updater JavaScript permission or arbitrary update endpoint is exposed. Only the fixed official GitHub endpoint is consulted. Signed packages use HTTPS and are verified by the updater before installation. `requireSignedVersion` binds the advertised version to the signature, rejecting older artifacts relabeled as a newer release. Without a supported signed release build, automatic IDE download is disabled and the UI offers the public release downloads page instead. Development builds and Linux non-AppImage installations use this manual path. GitHub's latest-release endpoint returns HTTP 404 when the repository has no stable release, including when every tag is a prerelease. That response means there is no IDE update; the updates page does not show it as a failure.

The implementation follows the [official Tauri updater documentation](https://v2.tauri.app/plugin/updater/). The public key is compiled from `PHP_IDE_UPDATER_PUBLIC_KEY`. The distribution overlay `src-tauri/tauri.updater.conf.json` creates updater signatures/artifacts; the normal developer build does not require a private key.

Distribution runs through one build workflow, `desktop-builds.yml` (**Desktop installers**), reused by `signed-updates.yml` (**Signed IDE updates**). A first `plan` job runs `scripts/release-signing.mjs`, which only looks at which secrets/variables exist: each group (updater key, Apple Developer ID + notarization, Windows Azure Trusted Signing or `.pfx`) is enabled only when complete, a partial group stops the run before any build, and the job summary records the chosen modes. Without secrets the output is unchanged from before: ad hoc macOS signature, unsigned NSIS, no `latest.json`.

**Signed IDE updates** requires the updater key and builds macOS ARM64 (app + DMG), Windows x64/NSIS and Linux x64 (deb + AppImage) from an existing version-matching tag. Every installer of that run is compiled with `PHP_IDE_UPDATER_PUBLIC_KEY`, so the installed IDE trusts the key. `latest.json` is merged only after all three platforms built, tested and produced a Tauri `.sig`; it is uploaded last, after the archives and signatures. Partial or mismatched manifests are rejected and release assets are not overwritten. **Desktop installers** keeps the previous manual flow (Windows + Linux, macOS DMG opt-in) and emits the manifest only when the key exists and macOS is part of the run.

What the release owner must create — the updater key pair, Apple and Windows certificates and the exact secret/variable names — is in [release-signing.md](release-signing.md). Existing installers built without a public key cannot bootstrap trust: their users install the first signed release manually once.

Private keys are only injected into the signing build step, and empty secrets are unset before the Tauri CLI runs. This implementation does not generate a release identity, change repository secrets or publish an installer implicitly.

### Local update acceptance (test endpoint)

`npm run test:updater:local` (macOS) validates the real flow without the release identity or repository. It generates a throwaway updater key in a temp folder and makes two release builds with a separate bundle identifier (`dev.php-ide.updater-test`, so the developer's profile and installed IDE are untouched): the "installed" current version and a newer `0.2.99` signed by the Tauri CLI. A loopback HTTP server serves `latest.json` and the archive. The loopback endpoint is compiled in through `PHP_IDE_UPDATER_TEST_ENDPOINT`; the host accepts only `http://127.0.0.1|localhost|[::1]` there and otherwise uses the official HTTPS endpoint, and the updater plugin still refuses HTTP unless the test overlay sets `dangerousInsecureTransportProtocol`. Release builds set neither.

With **Download IDE updates automatically** on, the installed app checks at launch, downloads the package and applies it when its window closes normally. The harness first serves a valid signature of other content (correct key, wrong file): the download is rejected and the app stays at the current version. It then serves the real signature: the app is replaced by `0.2.99` and `codesign --verify` passes. Evidence is written to `.artifacts/updater-local.json`. Windows (NSIS) and Linux (AppImage) installation, Developer ID/notarization and Authenticode are not covered locally; they need the first real signed release.

## Validation boundaries

Rust tests cover fresh profiles, migration, persistence, interrupted jobs, permission growth, user permission decisions, source/version eligibility, invalid preferences and automation defaults. Headless WebKit drives the actual UI with a synthetic service: search and selection, background progress/failure/retry, continue without waiting, one-time setup, default notification-only behavior, explicit permission review, staged updates, unsaved-work protection and preference persistence.

Release tooling tests require a signed artifact for every platform and reject incomplete or version-mismatched manifests. Synthetic signature strings in those tooling tests are not cryptographic evidence. Cryptographic verification and installation are covered on macOS by the local acceptance above with a throwaway key; Windows/Linux installation still needs a configured signed release. No test replaces or restarts the developer's current IDE.

Real Tauri fixture acceptance must run with an unlocked macOS session. Headless WebKit, compiled Rust tests and native-window validation remain distinct evidence layers.

## Local evidence — 24 October 2026

- `npm run check`: passed typecheck, architecture, 189 unit tests (one existing skipped case), 36 Rust tests, Clippy and both locale catalogs.
- Later the same day, a missing stable release (GitHub HTTP 404, including a repository that only has prereleases) is treated as no IDE update. `cargo test --bin php-ide` passed 41 tests and Clippy passed. The running app still needs a restart to pick up the host change.
- `npm run test:maintenance:ui`: 11 headless WebKit workflow checks passed with the actual UI and real 21-plugin metadata, using a synthetic backend. First-run and update-dialog screenshots were inspected.
- `npm run test:plugins:ui`: passed the regression against installing unselected defaults and confirmed that background completion refreshes the existing manager.
- Signed workflow YAML parsed successfully. Artifact/manifest tests reject missing signatures, missing platforms and mismatched versions; no signed release or installer was published.
- `npm run test:native -- --no-db --extraction-only`: production frontend and Rust application compiled; the runner stopped before window launch because the macOS session remained locked.

Structured evidence is `.artifacts/app-maintenance-validation.json`; UI evidence is `.artifacts/app-maintenance-ui.json`, `.artifacts/first-run-plugins.png` and `.artifacts/app-maintenance.png`. No native-window, signed-distribution, Windows installer or notarized macOS update acceptance is inferred from the headless tests. Close/update orchestration has separate tests for concurrent close requests, unsaved buffers before and during installation, and installation failure decisions.

## Local evidence — 4 November 2026 (signed distribution)

- `npm run test:updater:local` passed twice on macOS ARM64 (`.artifacts/updater-local.json`): throwaway key, installed 0.2.19 build, signed 0.2.99 package on a loopback endpoint. A valid signature of other content was downloaded in full and rejected (app stayed 0.2.19); the real signature was verified and installed when the window closed (app became 0.2.99, `codesign --verify` passed). Nothing was published and no repository setting was used.
- One earlier run got no request in 120 s and was not reproduced; the harness now waits up to 5 minutes and saves a screenshot on timeout. Launching the app through `/var/folders/...` (the `/var` → `/private/var` symlink) panics at setup with "unknown path"; the harness uses the real path. That startup issue is outside this change.
- `actionlint` 1.7.12 passed for every workflow. `tests/release-signing.test.mjs` covers the no-secret behaviour (ad hoc macOS, unsigned NSIS, no manifest), partial groups, required updater and the per-platform overlays. `npm run check` passed (202 unit tests, 42 Rust tests, Clippy).
- Not run: the GitHub workflows themselves, Developer ID/notarization, Authenticode/Azure signing and Windows/Linux in-app installation. They need the release owner's identities ([release-signing.md](release-signing.md)).
