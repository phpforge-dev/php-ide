# SPEC-08 — Integrated terminal

## Goal and scope

Let a developer run an interactive shell in the project directory, keep several sessions open and return to editing without losing terminal state. The terminal must expose real process state and remain responsive under sustained output.

Build on [SPEC-01](01-ide-foundation.md) and the tool-window/focus rules in [SPEC-03](03-workbench-ui.md). Use a native Rust PTY implementation and xterm.js in the WebView. A Node PTY service or generic shell IPC endpoint must not become the application backend.

Deliver local shell tabs first. Container terminals reuse the same session transport through [SPEC-09](09-docker.md). Split terminals, persistent sessions across application restarts and semantic command tracking require separate increments.

## Architecture and session contract

| Layer | Ownership |
|---|---|
| Rust terminal service | PTY allocation, child process, input/output, resize, flow control and teardown |
| Restricted bridge | Session-scoped create/write/resize/ack/close operations and sequenced output events |
| Terminal panel | Tabs, visibility, focus, terminal emulator, selection and session status |

A session must carry an opaque ID, project generation, kind, label, initial cwd, lifecycle state and exit status. Output events must include the owning session and sequence. The frontend must never receive process handles or arbitrary native execution capability.

Represent lifecycle as creating, running, closing, exited or failed. Closing must be idempotent. Reject input and resize for unknown, closed or old-project sessions.

## Shell creation and input

- **TERM-01:** Start each local session in the canonical project root. One tab changing directories must not change the starting directory or environment of a new tab.
- **TERM-02:** Select a validated platform shell, with a documented fallback. Start it through explicit executable/arguments. Explain that user startup scripts may subsequently alter cwd/environment.
- **TERM-03:** State clearly in the UI that the terminal runs with user privileges. The initial cwd is not a filesystem sandbox. Do not promise confinement for commands typed into the shell.
- **TERM-04:** Support interactive input, Unicode, shell line editing and interrupt signals through the PTY. Distinguish user Ctrl+C from forcibly closing the session.
- **TERM-05:** Limit input messages initially to 64 KiB and cap simultaneous sessions at eight. Show the limit and a useful recovery action; do not silently refuse creation.
- **TERM-06:** Keep terminal keyboard routing explicit: shell input stays in the focused terminal, while application commands follow the documented keymap. Selection copy and interrupt behavior must be distinguishable on each platform.

Pasting multi-line text can execute commands in an interactive shell. Preserve bracketed-paste behavior where supported and make any application paste safeguards explicit. Never execute clipboard contents merely because the panel opens.

## Output, resize and performance

- **TERM-07:** Write PTY output into the emulator as terminal data, never HTML. Bound visual history to 5,000 lines initially and offer Clear without restarting the shell.
- **TERM-08:** Implement bounded flow control: initially pause reads at 256 KiB of unacknowledged output and resume below 64 KiB. Acknowledge consumption after emulator processing. Handle teardown while paused without deadlock.
- **TERM-09:** Bound native/frontend queues and document overflow behavior. Background tabs must continue draining into bounded terminal state or another explicit bounded policy; hiding a tab must not create unbounded memory growth.
- **TERM-10:** Fit the emulator after showing/resizing its panel, then propagate valid rows/columns to the PTY. Ignore zero-size measurements while hidden and debounce resize storms.
- **TERM-11:** Theme/font changes must update the emulator in place, preserving session, screen contents and input. Respect the shared semantic/ANSI palette rules in [SPEC-04](04-design-system.md).
- **TERM-12:** Constrain escape-sequence integrations: remote output must not silently open external URLs, write the clipboard or invoke IDE commands. Optional link opening must require explicit user interaction and safe scheme handling.

## Lifecycle and UX

- **TERM-13:** Hiding the tool window preserves live sessions; Close Session ends the selected session. Show this distinction in labels/tooltips. Natural shell exit must show an exit code and offer a new session.
- **TERM-14:** Switching projects or quitting must close owned sessions and release PTYs, readers and subscriptions. Ask about active work when required by the product close policy, without claiming detached processes can always be terminated.
- **TERM-15:** Renderer loss must trigger native cleanup or a deliberately specified reconnection policy. Initial delivery should close orphaned sessions.
- **TERM-16:** Never send terminal history, environment or output to an agent automatically. Avoid persisting terminal content in routine logs. Explicitly selected context follows the agent context-review policy.

When a shell fails to start, preserve the panel and show the executable, safe error and Retry/Configure action. The failure of one tab must not close other sessions.

## Construction steps

1. Implement native PTY creation, I/O, resize and idempotent close.
2. Add session-scoped IPC and output sequencing/acknowledgment.
3. Build xterm tabs, focus, hide/show and exit presentation.
4. Add flow control, queue limits and background-tab behavior.
5. Integrate theme/font changes and project teardown.
6. Validate platform-specific shell, interrupt, clipboard and resize behavior.

## Acceptance scenarios

| Case | Required result |
|---|---|
| TERM-A1 | A new tab reports the fixture project cwd and accepts Unicode input |
| TERM-A2 | Directory/environment changes in one tab do not leak into a new tab |
| TERM-A3 | Ctrl+C interrupts a foreground fixture command while leaving its shell usable |
| TERM-A4 | Resizing changes dimensions reported inside the PTY |
| TERM-A5 | Hide/show preserves the running process, screen and active tab |
| TERM-A6 | Sustained output remains bounded, activates flow control and resumes correctly |
| TERM-A7 | Closing a paused session releases resources and rejects later input |
| TERM-A8 | Natural exit shows its exact code; failure in one tab preserves others |
| TERM-A9 | Project switch rejects old events/input and creates sessions in the new root |
| TERM-A10 | Theme changes retain the live shell; escape output cannot trigger privileged UI actions |

Use deterministic local fixture commands and disposable directories. Test the Rust PTY and actual Tauri/xterm interaction; a pipe-based process test alone does not validate terminal behavior. Report Unix and Windows shell behavior separately, including limitations for detached children.
