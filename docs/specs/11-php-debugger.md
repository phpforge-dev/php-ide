# SPEC-11 — PHP debugger and Xdebug plugin

## Goal and scope

Build an interactive PHP debugger that lets a developer set breakpoints, accept an Xdebug connection, step through code and inspect paused execution without losing editor state. Make listener, session, process and source-mapping states visible and independently recoverable.

Build on [SPEC-01](01-ide-foundation.md), [SPEC-03](03-workbench-ui.md) and [SPEC-06](06-php-intelligence.md). Deliver PHP/Xdebug debugging as a separately packaged, installable, disableable and removable plugin through [SPEC-02](02-plugin-platform.md). The core must provide language-neutral extension services; it must not own Xdebug-specific behavior.

Deliver Xdebug 3 sessions over DBGp, local CLI script launch, line/conditional breakpoints, stepping, stack frames, paginated variables, watches, explicit evaluation and server/local mappings. Exception/function breakpoints, asynchronous pause, variable assignment, run-to-cursor, DBGp proxy and integrated container interpreter launch require separately specified increments. Receiving a mapped container session does not establish container-launch support.

## Architecture and contracts

### Plugin ownership and host boundary

| Owner | Responsibility |
|---|---|
| Separate PHP/Xdebug plugin package | Rust DBGp service, Xdebug negotiation, breakpoint translation, stepping, mappings, PHP launch plans, UI module and debugger-specific settings |
| Generic debugger extension API | Provider registration, typed session events, breakpoint/editor decorations and declarative debug-view contributions |
| Rust host services | Permission-checked plugin executable launch, bounded RPC, confined source resolution and resource cleanup |
| Core workbench | Shared rendering, command/keymap integration, focus, plugin manager and safe presentation of provider data |

The plugin must ship a standalone Rust executable implementing DBGp and an explicitly trusted workbench UI module. The core must not embed the PHP/Xdebug service or load arbitrary native libraries. Ordinary language hooks remain in workers; native execution and window UI require separate `native.tool` and `workbench` consent and must be described as privileged, not sandboxed. Installation must use prebuilt, platform-specific, checksummed assets without running build scripts.

- **DEBUG-20:** Publish the debugger as its own package with an independent plugin ID, manifest, version, dependencies and minimum host API version. It may be offered as a recommended/default installation, but the IDE must start, edit and provide PHP language assistance without it.
- **DEBUG-21:** Introduce explicit capabilities for debugger contributions, native tool execution and trusted workbench integration. Keep TCP listening and PHP process policy inside the separately packaged Rust adapter. Define their schemas, consent, bounds and native authorization before activation. Existing language hooks, HTTP network permission and short-lived process calls do not satisfy these contracts.
- **DEBUG-22:** Disabling, uninstalling, updating or crashing the plugin must unregister its commands/views/decorations and close its transport/process handles under the session close policy. Native cleanup must work even when the worker cannot respond. Retain only non-secret settings according to an explicit retention choice.
- **DEBUG-23:** Resolve Debug Script and future Debug Test through provider discovery. If the plugin is absent/disabled/incompatible, show Install/Enable/Update guidance with an explanation. Do not leave a functional-looking control wired to hidden built-in PHP debugging.

These extension APIs are construction requirements, not claims about the currently available plugin API. Implement them before integrating the debugger package. Ordinary language plugins must not receive the new capabilities automatically.

### Runtime contracts

| Contract | Required information |
|---|---|
| Listener configuration | Bind address, port, project scope and exposure choice |
| Debug session | Opaque ID, generation, engine/protocol identity, capabilities and execution state |
| Breakpoint | Stable local ID, canonical file, line, enabled flag, condition and per-session resolution |
| Stack frame | Session/pause generation, depth, label, server URI and optional validated local location |
| Variable page | Context/frame, property identity, page, typed display value, child count and truncation |
| Debug command | Session, transaction ID, allowed operation and expected pause generation |
| Launch | Owned process ID abstraction, script, PHP configuration, session correlation and exit status |

Separate listener state (`stopped`, `listening`, `failed`) from execution (`connecting`, `running`, `paused`, `stopping`, `ended`, `failed`). Multiple sessions must retain independent commands and snapshots. Selecting another session must never retarget an in-flight command.

## Transport and session lifecycle

- **DEBUG-01:** Implement bounded DBGp framing and XML/base64 decoding, transaction correlation and engine error handling in the plugin worker over bounded Rust-owned transport. Disable external XML entity resolution. Reject malformed lengths, missing terminators, oversized packets and excessive nesting without blocking the listener.
- **DEBUG-02:** Bind to loopback by default, initially port 9003. Any non-loopback exposure requires an explicit setting and explanation that debugging traffic may reveal source/runtime values and permit evaluation. Do not imply that an IDE key authenticates a network peer.
- **DEBUG-03:** Validate incoming initialization before presenting a session; enforce a handshake timeout and session limit. Associate accepted sessions with an explicit project scope and display unmapped sources without granting filesystem access.
- **DEBUG-04:** Negotiate supported features and bounded property depth, child count and data length. Start with depth 1, 100 children per page and 8 KiB values. Unsupported features must degrade explicitly.
- **DEBUG-05:** Correlate responses with the owning transaction and fail outstanding queries on disconnect. Use an initial 30-second timeout for paused-state queries; continuation commands remain pending until execution stops and must not inherit that query timeout.
- **DEBUG-06:** Allow stack/variable/evaluation requests only in valid paused state. Increment a pause generation whenever execution resumes; discard late data from a prior pause.

Stopping listening, stopping a script and detaching from a session are distinct actions. Define each action's affected sessions and process ownership before exposing it. Never terminate an unrelated web server or container merely because its debug connection closes.

## Breakpoints, stepping and source navigation

- **DEBUG-07:** Toggle breakpoints in the editor gutter and through the command registry. Persist non-secret breakpoint configuration by project, distinguish enabled/disabled/conditional/unresolved states and synchronize it per session.
- **DEBUG-08:** Track line changes in open documents, deduplicate moved markers and expose the resolved engine location when available. Warn about unsaved source differing from executed disk content; do not imply that edited text is executing already.
- **DEBUG-09:** Support Continue, Step Into, Step Over, Step Out, Stop and Detach only when the session permits them. Show current execution location and selected frame separately. Keyboard actions must use the shared configurable keymap and respect editor/debugger focus.
- **DEBUG-10:** Map server/local paths in both directions by longest matching component prefix. Validate local destinations inside the authorized workspace, handle URI encoding/platform separators and reject traversal/symlink escapes. `/app` must not match `/application`.
- **DEBUG-11:** An unmapped frame must offer Map Path with a reviewable suggestion. Applying a mapping must refresh navigation without restarting the session. Never open an arbitrary engine-supplied host path directly.

## Variables, watches and evaluation

- **DEBUG-12:** Show frame-specific contexts and lazy property trees, including type, NULL, empty strings, object identity and explicit truncation. Fetch more children on demand; do not recursively load the entire runtime graph.
- **DEBUG-13:** Re-evaluate watches only at a valid pause, with capability-accurate frame semantics. If engine evaluation uses the active execution context rather than a selected historical frame, label that distinction instead of presenting a misleading value.
- **DEBUG-14:** Evaluation requires an explicit user action and must explain that PHP expressions may have side effects. Bound expression length initially to 20,000 characters, preserve failed input and show protocol/runtime errors locally. Do not promise read-only evaluation.
- **DEBUG-15:** Keep runtime values and console output local; do not attach them to agents or persist them in routine logs. Bound retained console output and avoid duplicate output when both the launcher and engine supply it.

## Local launch and recovery

- **DEBUG-16:** Debug Script must validate a confined PHP file, selected interpreter and Xdebug availability, establish the listener first, then launch PHP with explicit arguments and a correlation identifier. Do not rewrite project ini files automatically.
- **DEBUG-17:** Show interpreter, script, working directory and effective debug connection settings before launch. Save or explicitly resolve dirty-script differences. A launch exit code must remain separate from debug-session disconnect state.
- **DEBUG-18:** Port conflicts, absent Xdebug, failed launch, malformed peers and dropped connections must yield actionable Retry/Configure feedback while preserving breakpoints and editor buffers. No automatic installation of extensions is part of this flow.
- **DEBUG-19:** Project switching must resolve active sessions, terminate owned launches according to the close policy, reject old events and clear runtime values. Preserve per-project non-secret settings; do not leak frames across projects.

## Construction steps

1. Define and version the generic debugger-provider, trusted workbench and native execution contracts in SPEC-02.
2. Create the separate plugin package and prove install/disable/uninstall without changing core PHP editing.
3. Define the session/transaction/pause contracts and a synthetic DBGp peer.
4. Implement bounded transport, loopback listener and session teardown.
5. Add gutter breakpoints, continuation commands and visible paused location.
6. Add stack, lazy variables, watches and explicit evaluation.
7. Add safe mappings and unmapped-frame recovery.
8. Add local script launch and project lifecycle handling.
9. Validate against a real Xdebug engine and the actual Tauri UI independently.

## Acceptance scenarios

| Case | Required result |
|---|---|
| DEBUG-A1 | Occupied port produces a recoverable error; default binding remains loopback |
| DEBUG-A2 | A real fixture stops at a line/conditional breakpoint and reports the actual location |
| DEBUG-A3 | Step Into/Over/Out and Continue update the correct session and stack |
| DEBUG-A4 | Resuming invalidates late variable responses from the previous pause |
| DEBUG-A5 | More than 200 children load in bounded pages, with correct NULL/empty/truncated values |
| DEBUG-A6 | Longest-prefix mapping resolves a container frame; external paths remain inaccessible |
| DEBUG-A7 | Invalid evaluation returns a useful error without ending the session |
| DEBUG-A8 | Local launch validates Xdebug, correlates the session and reports process exit separately |
| DEBUG-A9 | Malformed packets/disconnect fail pending queries and preserve the listener/editor |
| DEBUG-A10 | Two sessions remain independent; project switch rejects their late events |
| DEBUG-A11 | IDE startup, PHP editing and language assistance work with the debugger uninstalled |
| DEBUG-A12 | Installing/enabling the package registers its provider; disabling/removing it clears contributions and owned resources |
| DEBUG-A13 | Denied listener/launch capabilities cannot be bypassed through crafted host requests |
| DEBUG-A14 | Plugin crash/update closes native handles; stale events cannot restore removed UI |
| DEBUG-A15 | Missing/disabled/incompatible provider leads to useful setup guidance from Debug Script/Test |

Use socket-level synthetic peers for framing/errors and disposable PHP/Xdebug fixtures for real execution. Container tests must create their own resources and mounts containing only synthetic files. Record PHP/Xdebug version, OS, binding and mappings. Synthetic UI, real engine and Tauri interaction evidence are separate; none establishes PhpStorm compatibility.
