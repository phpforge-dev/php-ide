# SPEC-01 — IDE foundation

## Goal and scope

Build a desktop environment that can open a PHP project, edit files without data loss and obtain language assistance while keeping the interface responsive. Target macOS, Windows and Linux; report platform validation separately.

The foundation includes startup, project lifecycle, filesystem access, editor models, settings, IPC and PHP language integration. Git, terminal, debugging, Docker and agents must remain separate services with their own contracts; their complete feature sets are outside this specification.

## Architecture

Use the following ownership boundaries:

| Layer | Responsibilities | Restrictions |
|---|---|---|
| WebView UI | Workbench, editor models, interaction state, accessible presentation | No Node runtime, direct privileged filesystem access or arbitrary shell bridge |
| Shared TypeScript | Serializable contracts, parsers and pure domain rules | No dependency on Node or privileged platform APIs |
| Native bridge | Typed requests, response adaptation and event subscriptions | Only explicitly allowed operations |
| Rust services | Workspace, processes, persistence, language sessions, database and plugin authorization | Validate every operation independently of UI state |
| External tools | PHP language server and explicitly configured tool processes | Controlled arguments, lifecycle, timeouts and bounded output |

Use `src/` for UI and bridge code, `shared/` for portable logic and contracts, and `src-tauri/src/` for native services. Keep fixtures, tests and generated reports separate. Do not organize service behavior around a single growing UI module.

## Runtime and IPC requirements

- **BASE-01:** Package a Tauri 2 application with a Rust backend and bundled frontend assets. The packaged app must start without a development server or Node backend.
- **BASE-02:** Define an allowlisted operation name and input/output schema for each IPC action. A shared dispatcher is permitted only if it rejects unknown operations and validates each payload.
- **BASE-03:** Associate asynchronous work with a request ID and project generation. Ignore responses from a closed project or superseded editor version. Cancellation must release native resources where supported and suppress stale UI updates everywhere.
- **BASE-04:** Return structured errors with a stable code, safe message and retry information. Redact secrets before emitting logs or errors. Cap request sizes, output and execution duration per operation.
- **BASE-05:** Restrict Tauri capabilities and content security policy to required behavior. Render untrusted documentation and plugin content through sanitized text/Markdown paths.

## Project and file lifecycle

Welcome must offer Open Project and recent projects. Opening a folder must establish its canonical workspace root before discovering files or starting services. Show progress for discovery and indexing separately. If the folder is missing or inaccessible, preserve the welcome screen and offer another folder or retry.

Represent project state as `closed → opening → ready | failed → closing`. A project switch must resolve unsaved edits before replacing the active workspace, cancel old requests and stop its watchers, plugins and language sessions. Project-specific settings and results must not leak into the next project.

- **BASE-06:** Resolve paths against the canonical root, including symlink targets. Reject external paths and traversal for workspace-scoped actions. Any future external-file feature requires a separate explicit access contract.
- **BASE-07:** Keep one logical document model per canonical file. Record document version, dirty state and disk revision/hash. Language requests must use the current unsaved text.
- **BASE-08:** Save atomically after checking the disk revision. On external conflict, retain the buffer and offer comparison, reload or an explicit overwrite decision. A normal Save must never silently overwrite a newer disk version.
- **BASE-09:** Watch create/change/delete/rename events with debouncing. Refresh clean buffers safely; show conflicts for dirty buffers. Explain binary, oversized or unsupported-encoding files rather than displaying corrupted text. Start with UTF-8 text and a configurable, bounded file-size policy.
- **BASE-10:** Persist non-secret settings with a schema version, validated defaults and atomic writes. Separate global appearance/keymap preferences from project state. Invalid settings must fall back with a recoverable notification.

Closing a dirty document or quitting must offer Save, Discard and Cancel. Recovery drafts should be local, opt-in for sensitive content, size bounded and deleted after resolution; do not copy credentials into general settings. Define retention and recovery behavior before enabling crash recovery.

## PHP language services

Use Monaco as the editing surface and a PHP language server through LSP. Start the service through Rust using explicit executable/arguments and framed stdio. Expose missing PHP/runtime dependencies as actionable setup errors.

- **BASE-11:** Implement initialize, initialized, didOpen, didChange, didClose and shutdown/exit. Report initializing, indexing, ready, unavailable and restarting states.
- **BASE-12:** Connect completion, definition and diagnostics to actual editor actions. Preserve the originating document version and correctly translate UTF-16 positions and URIs. Support Unicode fixtures.
- **BASE-13:** Allow basic editing while indexing. Explain when semantic results are incomplete. Do not invent a symbol or infer successful indexing from a running process.
- **BASE-14:** Restart a failed language service through an explicit recovery action, resynchronize open buffers and bound restart attempts. Preserve editor contents through failure.

PHPDoc, generics, inheritance, framework inference and vendor navigation need individual fixtures and acceptance records; successful completion for one method must not certify the whole PHP language family.

## Construction steps

1. Scaffold Rust/Tauri and the frontend build; prove packaged startup.
2. Implement typed IPC, canonical workspace access and conflict-safe saving.
3. Add Welcome, project state and Monaco models.
4. Implement watchers, persisted settings and resource cleanup.
5. Integrate LSP, first with a protocol fixture and then a real PHP fixture.
6. Connect error recovery and lifecycle tests through the native window.

## Acceptance scenarios

| Case | Action | Required observable result |
|---|---|---|
| BASE-A1 | Launch a packaged build offline | Welcome appears without Vite or a Node backend |
| BASE-A2 | Open a fixture, edit, save and reopen | Exact text survives and dirty state clears only after success |
| BASE-A3 | Change the same file externally before Save | Buffer is retained and a conflict decision appears |
| BASE-A4 | Request a path traversal or symlink escape over IPC | Rust rejects access and no external file changes |
| BASE-A5 | Switch projects during a delayed completion | Old response never appears in the new project |
| BASE-A6 | Complete and navigate from an unsaved PHP buffer | Results correspond to that buffer and navigation can return |
| BASE-A7 | Kill the language process | Editing continues; state and restart action appear |
| BASE-A8 | Cancel quit with unsaved edits | Window and buffer remain intact |

Validate filesystem invariants with Rust tests, protocol/version behavior with focused tests, and the complete open/edit/save/navigation flow in Tauri. Record platform and fixture limits explicitly.
