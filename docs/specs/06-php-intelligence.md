# SPEC-06 — PHP intelligence

## Goal and scope

Build language assistance that understands the active PHP buffer and helps a developer complete code, inspect types, navigate symbols, find references and review safe refactorings. Editing must remain available while indexing or recovering from a language-service failure.

Build on [SPEC-01](01-ide-foundation.md), use the editor interactions from [SPEC-03](03-workbench-ui.md), and integrate framework contributions through [SPEC-02](02-plugin-platform.md). PHP intelligence must not depend on an agent or a network inference service.

Deliver completion, definition and diagnostics first; then references, implementation navigation, type information, PHPDoc, hierarchy and reviewed rename/import actions. Laravel/Blade and other framework rules require separate fixtures. Debugging, running tests and full PHP runtime analysis are outside this specification.

## Architecture and contracts

Use a PHP language server, initially Phpactor, through framed LSP over a Rust-managed stdio process. Keep protocol transport, workspace authorization and process lifecycle in Rust. Keep editor adaptation and pure semantic helpers separate from the server. Do not claim that a local helper constitutes a complete PHP parser or universal index.

| Contract | Required information |
|---|---|
| Document snapshot | Project generation, canonical URI, language, version and current unsaved text |
| Semantic request | Request ID, snapshot version, position, operation and cancellation state |
| Navigation result | Validated URI/range, origin and optional target label |
| Diagnostic | Provider, code, severity, range, message and optional proposed fixes |
| Workspace edit | Target URI, expected version/hash, text edits and change summary |
| Service state | Starting, indexing, ready, degraded, restarting or unavailable, with safe error detail |

Use zero-based UTF-16 positions at the editor boundary and explicitly convert any provider-specific offsets. Read-only dependency/stub documents outside the workspace require a dedicated allowlisted resource resolver; ordinary workspace IPC must remain confined.

## Indexing and lifecycle

- **PHP-01:** Validate the PHP executable and language-server artifact before starting. Pin distributed artifacts with checksums and retain license/patch provenance. Missing dependencies must produce Setup or Retry actions.
- **PHP-02:** Discover Composer metadata and documented source/vendor roots without running project scripts automatically. Distinguish file discovery from semantic indexing progress.
- **PHP-03:** Synchronize open/change/close events, including unsaved text. Associate each response with its document version and project generation; discard obsolete results.
- **PHP-04:** Update the index after file creation, deletion, rename and Composer metadata changes. Debounce watchers and invalidate affected caches. Clearly report incomplete results during rebuilds.
- **PHP-05:** Restart a crashed server through bounded recovery, resynchronize open buffers and preserve editor state. Cancellation must reach LSP where supported and always suppress stale presentation.
- **PHP-06:** Keep caches project-specific and versioned by relevant tool/configuration inputs. Invalidate incompatible caches rather than presenting them as current results.

## Semantic behavior

- **PHP-07:** Completion must respect reachable members, visibility, namespaces, imports, static/instance context and the current prefix. Show kind and useful detail; Enter/Tab acceptance must replace the intended range and remain undoable.
- **PHP-08:** Definition and implementation navigation must distinguish declarations, inherited methods, interfaces and traits. Open a single target directly; show a chooser for multiple targets and explicit feedback for none. Preserve a return location.
- **PHP-09:** Find Usages must return bounded, cancellable semantic references grouped by file, with scope and completeness visible. Comments, strings and unrelated homonyms must not be presented as semantic uses. A textual search fallback must be labeled separately.
- **PHP-10:** Type information must distinguish known, union, nullable and unknown types. Test flow narrowing, nullsafe access, imported aliases, late static returns and trait adaptations independently. Unknown types must not acquire invented members.
- **PHP-11:** Support declared PHPDoc constructs incrementally: parameter/return annotations, array element types, documented properties/methods, templates and generic inheritance. Publish a capability/limitation table; one passing template case must not imply arbitrary generic inference.
- **PHP-12:** Resolve project, vendor and native-symbol sources through distinct policies. Native stubs must open read-only with provenance; vendor navigation must not silently grant broad external filesystem access.
- **PHP-13:** Diagnostics must update after edits, clear when resolved and retain provider identity. Suppress obsolete diagnostics and keep syntax failures local to the affected document.

## Refactoring and framework contributions

- **PHP-14:** Autoimport must resolve ambiguous symbols explicitly, preserve namespace/import formatting and apply insertion plus completion as one undoable action.
- **PHP-15:** Rename must produce a reviewable workspace edit with affected files and ranges. Validate document versions/disk hashes before applying; reject stale previews. Prevent partial application through preflight and rollback or another documented recoverable transaction strategy.
- **PHP-16:** Quick fixes and formatting must use current buffer versions, preserve undo and never write merely because a diagnostic was emitted.
- **PHP-17:** Framework plugins may contribute strings, routes, views and framework-aware symbols only through declared editor adapters. Label results and document provider precedence. A declared language filter does not create integration automatically.

Missing index records must return an empty or explicitly incomplete result without crashing the service. This is not proof that a symbol has no runtime uses. Dynamic calls, reflection and unsupported PHP constructs must remain documented limitations.

## Construction steps

1. Define document/version contracts and fixture-driven LSP transport.
2. Add server setup, lifecycle and visible index state.
3. Connect completion, definition and diagnostics to unsaved buffers.
4. Add references, implementations, hover and read-only stub navigation.
5. Build independent type/PHPDoc/trait/generic fixtures and record gaps.
6. Add reviewed autoimport/rename/fixes and framework adapters.
7. Measure cold/warm indexing and request latency on named fixture sizes; establish budgets from those measurements rather than claiming unmeasured performance.

## Acceptance scenarios

| Case | Required result |
|---|---|
| PHP-A1 | Completion/definition reflect an unsaved edit, including Unicode before the cursor |
| PHP-A2 | Alias, trait and interface navigation select the correct declaration and support return navigation |
| PHP-A3 | References distinguish qualified homonyms and exclude comments/strings |
| PHP-A4 | An absent index record returns safely without a server crash |
| PHP-A5 | Union/null/unknown fixtures preserve uncertainty; unsupported inference is reported |
| PHP-A6 | Each documented PHPDoc/generic construct has its own expected result |
| PHP-A7 | Vendor/native navigation opens the authorized source; stubs cannot be saved |
| PHP-A8 | Editing after rename preview rejects stale application without partial changes |
| PHP-A9 | Server failure/restart retains buffers; old-project responses never appear |
| PHP-A10 | File creation/deletion and Composer changes invalidate the appropriate index state |

Use synthetic PHP/Composer fixtures and negative cases. Test protocol behavior separately from a real server and actual Tauri editor interactions. Record each semantic family and engine version independently; local correctness does not establish PhpStorm compatibility.
