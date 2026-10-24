# Parallel plugin extraction — IDE 0.2.13

Date: 24 October 2026. This is architectural implementation evidence for the independent IDE. It does not describe PhpStorm internals and does not establish compatibility with PhpStorm.

## Requirement and contracts

The user requested separate agents to extract all twelve identified candidates into their own repositories, starting with shared contracts. After the package and focused tests passed, the user explicitly authorized the remaining cleanup while the macOS lock still prevented complete visible-window acceptance. The coordination baseline is [extraction-contracts.md](../plugins/extraction-contracts.md): existing language-worker hooks, trusted workbench API v1, explicitly brokered host services, optional contributions, lifecycle disposal and native authorization. Node remains build/test tooling; the application remains Rust + Tauri 2.

The contracts precede the parallel extraction. Language contributions run through the existing worker bridge; privileged UI modules export `activate(sdk)` and register optional contributions with `sdk.provide`. Workbench code runs in the trusted IDE window and is not a sandbox. Registration does not itself prove that a workflow works.

## Twelve new repositories

| Capability | Repository | Ownership moved into the package |
|---|---|---|
| Symfony / Twig | [plugin-symfony](https://github.com/phpforge-dev/plugin-symfony) | Routes, templates, services, parameters and environment-reference language hooks |
| Ignore files | [plugin-ignore](https://github.com/phpforge-dev/plugin-ignore) | Ignore-pattern completion and relative project paths |
| SVG preview | [plugin-svg-preview](https://github.com/phpforge-dev/plugin-svg-preview) | Live source preview, XML validation/recovery, layout controls, zoom and backgrounds |
| Image preview | [plugin-image-preview](https://github.com/phpforge-dev/plugin-image-preview) | Image display, natural dimensions, fit/zoom, backgrounds, reload and recoverable errors |
| PHP formatting | [plugin-php-formatter](https://github.com/phpforge-dev/plugin-php-formatter) | PHP printer, bundled parser, EditorConfig inheritance and safe selection formatting |
| Web intelligence | [plugin-web-languages](https://github.com/phpforge-dev/plugin-web-languages) | JavaScript, TypeScript, JSX/TSX, React and Vue language integration and workers |
| PHP intelligence | [plugin-php-intelligence](https://github.com/phpforge-dev/plugin-php-intelligence) | Local types, hierarchy, semantic navigation, inspections, refactoring UI/engine, Phpactor runtime and read-only PHAR stub reader |
| Git | [plugin-git](https://github.com/phpforge-dev/plugin-git) | Git UI, editor integrations and native Git feature implementation |
| Terminal | [plugin-terminal](https://github.com/phpforge-dev/plugin-terminal) | Terminal UI and native terminal feature implementation |
| Docker Services | [plugin-docker-services](https://github.com/phpforge-dev/plugin-docker-services) | Container/service UI and native Docker feature implementation |
| Agents | [plugin-agents](https://github.com/phpforge-dev/plugin-agents) | Agent UI, protocol/provider orchestration and native feature implementation |
| Database / SQL | [plugin-database](https://github.com/phpforge-dev/plugin-database) | Database explorer, SQL console, SQL intelligence and native database feature implementation |

The earlier Laravel, Dotenv, Dockerfile/Compose, Bash, Prettier, PHP debugger/Xdebug, Composer, PHPUnit/Pest and Markdown packages are not part of these twelve new extractions. Dockerfile/Compose intelligence and Docker Services remain separate packages. PHP formatting and PHP intelligence also have separate lifecycles.

Exact package revisions, browser-entry hashes and required permissions belong to [default-plugins.json](../../default-plugins.json). Native source revisions belong to [src-tauri/Cargo.toml](../../src-tauri/Cargo.toml) and its lockfile. These are the authoritative pins; repository default branches alone are not reproducible installation evidence.

## Native linking boundary

Six packages contain Rust libraries: PHP intelligence, Git, terminal, Docker Services, agents and database. The IDE consumes their external Git sources at pinned revisions and statically links the libraries into its application build. Feature code belongs to the separate repositories, but those native backends cannot all be installed or upgraded solely by downloading a Marketplace package into an existing application binary. A backend revision change requires rebuilding the host. This differs from the separately packaged native executable protocol used by the earlier debugger, Composer and PHP test plugins.

The optional workbench and semantic contributions can be activated, disabled and reloaded during a session. Disabling a linked feature withdraws its contribution, revokes broker access and asks the host to release owned resources; it does not unload machine code from the running binary. Installing UI assets does not grant consent to native services. The Rust boundary rechecks enabled state and permissions, including access from existing panels or callers. PHP refactoring transactions receive an injected history snapshot interface so local-history ownership stays with the host.

The host retains the application shell, editor/buffers, files and confinement, tabs/layout, design system, keymap coordination, plugin manager, authorization, credential protection and resource-release orchestration. Shared file associations, lexical string-site infrastructure and generic editor-preview layout are foundation contracts. Their presence does not constitute a hidden replacement for a disabled feature provider.

## Evidence and acceptance status

| Evidence | Result and scope |
|---|---|
| Independent package repositories and committed browser bundles | Published; builds and package tests are available in their CI workflows |
| Root TypeScript validation | `npm run typecheck` passed after source removal |
| Host baseline | Architecture and locales passed; 184 unit tests passed and one remains explicitly skipped |
| Rust host baseline | `npm test`: 28 passed; `npm run lint:rust`: passed after startup visibility fix and diagnostic cleanup |
| Targeted host tests | 62 tests passed for the language coordinator, Bash/Docker/Dotenv routing, PHP/Prettier sandbox formatting, PHP semantics, navigation and refactorings |
| Preview and formatter package tests | SVG 2, image 2 and PHP formatter 6 tests passed; lifecycle and Node-free formatter bundle execution included |
| PHP intelligence package | 28 frontend tests and 6 Rust tests passed; one installed-Phpactor test is explicitly ignored by default and passed separately with the fixture tools directory supplied |
| WebKit formatter harness | Five checks passed, including the real packaged formatter in a sandbox worker, stale-result rejection, undo and read-only protection |
| WebKit image harness | Ten checks passed, including error recovery, late-read rejection, reload and restoring the editor on disable |
| SVG visual harness | Packaged bundle passed invalid XML/entity/namespace checks, recovery and a rendered-pixel check; screenshots are implementation evidence |
| Full extracted-feature native Tauri acceptance | Blocked by the local macOS session being locked (`CGSessionCopyCurrentDictionary`: screenLocked=true). A visible-window startup assertion fails before feature checks. The coordinator must rerun with the session unlocked before claiming full native host acceptance. Source cleanup was separately authorized by the user and does not count as that acceptance |

Useful local reports include `.artifacts/formatting-ui.json` and `.artifacts/image-preview-webkit.json`. Harness sources are [check-formatting.mjs](../../scripts/check-formatting.mjs), [check-image-preview.mjs](../../scripts/check-image-preview.mjs) and [preview-svg.mjs](../../scripts/preview-svg.mjs). Package checks, simulated browser checks, compiled Rust tests and the real Tauri window are separate evidence layers.

Following the explicit cleanup instruction, 62 obsolete implementation files and 560 feature-private CSS rules were removed. Focused replacement tests and TypeScript checks passed. Foundation contracts, optional contribution facades and the existing user SQL changes were preserved. No complete native Tauri acceptance is claimed while the session is locked.

## Limits and comparison

No new reference observation was performed for this extraction. No compatibility family is promoted, and previous unvalidated, partial, ignored or unexecuted cases keep their existing status. A successful plugin lifecycle check does not validate every PHP construct, Git operation, database version, terminal shell, Docker configuration, agent provider or web framework feature.

Database and SQL capability/version evidence remains in the existing SQL research and matrix entries. The extraction changes ownership and lifecycle; it does not widen grammar, driver or vendor coverage. Fixtures and disposable services are required for host tests; these checks must not use real user databases or real agent inference.

The startup investigation also found that Tauri window visibility and embedded WebView visibility are separate. Startup now explicitly reveals both. AppKit diagnostics confirmed the view is unhidden with a nonempty visible rectangle, while the locked macOS session prevents app activation. Failed focus and launch experiments are not feature-validation evidence.

Feature-only mixed CSS has been copied into the six privileged external UI packages and published at the current default pins. The dedicated source copies and matching legacy core selectors have now been removed from the host. The core runtime npm dependencies are Tauri API and Monaco; parser libraries needed only by package-source tests are development dependencies. Unused direct Rust driver/process dependencies were removed, while the external native crates retain their own dependencies. The public catalog update passed its validation workflow and is commit `f347904` in `phpforge-dev/plugins`; publishing it does not release an IDE installer.

The six UI-only CSS/lifecycle updates also passed their published CI runs: Git `40059279132`, Docker Services `40059281484`, Agents `40059282656`, Terminal `40059284129`, Database `40059286643` and PHP Intelligence `40059288379`. Their native library sources were unchanged, so the Cargo pins remain at the previously tested revisions. Cleanup inventory and remaining native validation instructions are in [the validation handoff](../plugins/extraction-validation-handoff.md).

Owner-specific removal inventories are recorded in [PHP and preview handoff](preview-plugin-extraction-pending.md) and [language/database handoff](language-database-plugin-extraction.md). Those inventories preserve the existing SQL changes and distinguish foundation contracts from plugin implementations.

## Post-cleanup verification

`npm run check` passed after removal: typecheck, architecture, 184 unit tests (one skipped), 28 Rust tests, Clippy and both locales. `npm run build:web` and the actual Rust application build passed. The host retains only Tauri API and Monaco as npm runtime dependencies; 93 obsolete packages and eight direct Rust dependencies were removed. Generic plugin archive decompression retains flate2.

The pinned production bundles passed the database Chromium fixture (six checks), Git/Docker fixture (18 checks), islands/workbench visual flows, PHP formatter WebKit fixture (five checks), and JavaScript/TypeScript/React/Vue browser suite (six groups) after source/CSS cleanup. The database dialog screenshot was inspected. CSS audit reports zero remaining feature-private rules in the mixed host stylesheets; git diff --check passed. These simulated browser results do not replace native Tauri acceptance.

`npm run test:native -- --no-db --extraction-only` compiled the frontend and Rust application, then correctly stopped before launching because macOS remained locked. No native pass is claimed. Structured local evidence: `.artifacts/plugin-cleanup-validation.json`; the remaining task is visible-window acceptance with the session unlocked, rather than source cleanup.
