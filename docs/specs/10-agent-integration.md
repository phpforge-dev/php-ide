# SPEC-10 — Agent integration

## Goal and scope

Let a developer consult an agent inside the IDE, control which context is shared, follow streamed work, respond to permission requests and review proposed file changes before retaining them.

Use [SPEC-01](01-ide-foundation.md) for workspace/process boundaries, [SPEC-03](03-workbench-ui.md) for interaction state and [SPEC-07](07-git.md) for the distinction between agent edits and Git staging. Agent output must never be treated as authorization from the human user.

Deliver a read-only consultation adapter first, then a capability-limited editing adapter. Provider adapters may support a Codex app-server protocol or ACP; document each adapter's actual negotiated capabilities independently. A common chat panel must not imply identical tools, isolation, authentication or change-review semantics across providers.

## Architecture and contracts

Keep agent subprocesses, protocol transport, session identity, permission mediation and pending changes in Rust. The WebView owns prompt drafts, context selection, stream presentation and user decisions. External adapters may have their own runtime prerequisites; these must not turn Node into the IDE backend.

| Contract | Required information |
|---|---|
| Provider descriptor | ID, label, availability, setup guidance and supported capabilities |
| Session | Provider, opaque session ID, canonical project scope, mode and generation |
| Turn | Turn ID, prompt, reviewed context manifest and lifecycle state |
| Event | Session/turn ID, sequence, kind and bounded serializable payload |
| Permission request | Request ID, action kind, target, scope and offered decisions |
| Pending change | Path, base version/hash, proposed text/diff, source turn and review status |

Normalize text deltas, tool status, permission, change, completion and error events without inventing success when a provider omits information. Reject malformed frames and unknown privileged method calls. Keep protocol-specific codecs separate from UI and workspace rules.

## Setup, context and consultation

- **AGENT-01:** Discover configured executables and report missing tools/authentication as setup states. Delegate login and credential storage to supported provider mechanisms. Never request API keys or account passwords in the chat prompt.
- **AGENT-02:** Starting a session must bind a provider, project and explicit mode. Show the active provider/mode and connection state before a turn is sent.
- **AGENT-03:** Offer deliberate context selection: current selection, current buffer or chosen project files. Show names and unsaved-buffer status before sending. Do not automatically attach the entire repository, terminal history, Docker logs or database data.
- **AGENT-04:** Exclude credential-bearing environment/configuration files and passwords from automatic context. Provide safe redacted excerpts when useful. Do not send database connection credentials, private keys or authentication tokens to the agent.
- **AGENT-05:** Explain that selected code/context may leave the machine through the provider. Bound context size and report omitted/truncated files. Redaction must not be described as a guarantee that arbitrary source content contains no secrets.
- **AGENT-06:** Consultation mode must deny IDE-mediated writes, command execution and external actions, and configure a provider-enforced read-only mode where supported. Instructions alone are not an execution boundary. Providers without enforceable constraints must be labeled and unavailable for a mode promising those constraints.

## Streaming, permissions and cancellation

Represent turn state as queued, running, awaiting permission, cancelling, completed, cancelled or failed. Pending changes have a separate review lifecycle and may outlive the turn that proposed them.

- **AGENT-07:** Stream responses incrementally with ordered session/turn attribution and bounded memory. Keep prompt drafts on failure. Render provider Markdown safely, without executable HTML or privileged links.
- **AGENT-08:** Permit one active turn per session initially; disable duplicate Send actions and offer a visible Stop action. Report elapsed activity without fabricating progress percentages.
- **AGENT-09:** Permission requests must describe the action, target and scope, with allow/deny choices only for supported provider options. File contents, tool output and agent text cannot grant permission. A session grant must not silently become global approval.
- **AGENT-10:** Enforce path/operation constraints in the native host even after user approval. Permission to read a project file is not permission to execute a process or send a message to an external service.
- **AGENT-11:** Stop must cancel the provider turn where supported, resolve pending permission requests as cancelled and suppress late mutations. If cancellation is not acknowledged, show that uncertainty and offer session termination.
- **AGENT-12:** Bound protocol requests and output; initially use a 30-second handshake timeout and an explicit configurable inactivity timeout for turns. Inactivity must not be reported as successful completion. Ending a session must close owned subprocesses and subscriptions.

## Reviewed changes

- **AGENT-13:** Editing adapters must route supported file writes into an IDE-managed pending-change layer. Reads through the mediated API must see the pending overlay consistently. Do not claim universal interception of a provider's independent filesystem or shell access.
- **AGENT-14:** Keep direct filesystem/process access disabled for a mode promising review-before-write. If an adapter cannot honor that boundary, expose a distinct mode and do not present its writes as pending-only changes.
- **AGENT-15:** Show changed files, base/proposed diff and explicit Keep/Discard actions. Keep writes the reviewed content after checking the current buffer and disk revision. Stale bases require re-review; never overwrite a concurrent user edit.
- **AGENT-16:** Discard must remove only the pending proposal and preserve existing user files/edits. Keep/Discard must not stage, commit or push Git changes automatically. New files require confined targets; deletion/rename support requires explicit contracts before being advertised.
- **AGENT-17:** Applying several files needs preflight and recoverable transaction handling. Report partial failure if rollback cannot complete. Retain reviewable proposals after provider failure instead of silently applying or losing them.

Shell tools can modify files or external systems outside mediated file APIs. An editing mode requiring review-before-write must reject such tools or isolate them with independently enforced write boundaries; a working directory alone is insufficient. External messages, deployments and other irreversible actions require direct user authorization and must not be inferred from a coding prompt.

## Lifecycle and privacy

Switching projects must cancel the active turn, clear outstanding permissions and detach old context. Resolve pending changes through Keep/Discard/Cancel before discarding their project scope. Reject old-session events and decisions.

Do not persist transcripts or context by default in the first delivery. If history is added, specify opt-in, storage, retention, deletion and secret treatment separately. Keep routine protocol diagnostics free of full prompts, document contents and credentials.

## Construction steps

1. Define provider capabilities and a deterministic synthetic protocol peer.
2. Implement Rust transport, setup/handshake and session teardown.
3. Build context review, consultation mode and streaming UI.
4. Add permission mediation, cancellation and late-event rejection.
5. Add mediated pending changes, diff review and conflict-safe Keep/Discard.
6. Integrate providers individually and publish capability/limitation records.

## Acceptance scenarios

| Case | Required result |
|---|---|
| AGENT-A1 | Missing executable/authentication yields setup guidance with the prompt preserved |
| AGENT-A2 | Only reviewed fixture context is sent; automatic context excludes credentials |
| AGENT-A3 | Consultation rejects write/process requests despite an agent asking for them |
| AGENT-A4 | Stream events update the correct turn; malformed events fail safely |
| AGENT-A5 | Denying permission prevents the corresponding operation and allows the session to recover |
| AGENT-A6 | Stop cancels pending permissions and late responses cannot apply changes |
| AGENT-A7 | Proposed edits stay off disk until Keep and are visible in a review diff |
| AGENT-A8 | Concurrent disk/buffer changes block Keep without losing either version |
| AGENT-A9 | Discard preserves original user content; Keep does not stage or commit |
| AGENT-A10 | Project switch rejects stale events and prompts for unresolved proposals |
| AGENT-A11 | Provider crash retains drafts/proposals and exposes a clean restart path |
| AGENT-A12 | A provider lacking isolation is not labeled as enforcing review-before-write |

Use synthetic agents for streaming, permission, timeout and filesystem cases, then exercise the real Rust/Tauri panel. Keep protocol handshake checks separate from inference-consuming turns. Real-provider inference tests require explicit authorization because they may consume account limits; never use real credentials in fixtures. Record adapter, protocol version, mode and enforcement limits separately. A successful chat response alone does not validate agent editing or safety boundaries.
