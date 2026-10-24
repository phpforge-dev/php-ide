# SPEC-02 — Plugin platform

## Goal and boundaries

Allow developers to add focused language assistance without changing the IDE core. Deliver discovery, installation, consent, activation, editor integration, diagnostics and removal as one usable workflow.

Define a native plugin format. Loading VS Code or JetBrains extensions, new language engines and unrestricted DOM access are outside the initial isolated language contract. A separately consented native-tool/workbench increment is defined below. Built-in trusted modules and installable plugins must have distinct trust boundaries even if they contribute similar language results.

## Package contract

Each package must contain a `plugin.json` manifest and a JavaScript entry point:

```json
{
  "id": "example.php-hints",
  "name": "PHP Hints",
  "version": "1.0.0",
  "minIdeVersion": "0.2.0",
  "main": "main.js",
  "description": "Local PHP suggestions.",
  "activation": { "languages": ["php"], "files": ["composer.json"] },
  "permissions": []
}
```

The version above is illustrative. The implementation must publish its actual supported host version and comparison rules; do not imply a separately versioned SDK exists.

- **PLUG-01:** Validate IDs, names, versions, known permissions and a relative entry point confined to the package. Reject traversal, symlink escapes, invalid JSON and incompatible host versions before execution.
- **PLUG-02:** Establish package limits: manifest 64 KiB, entry point 1 MiB, installed content 20 MiB and 2,000 files. Reject archives with external targets. Installation must stage and validate before replacing an installed package.
- **PLUG-03:** Discover user packages and `.php-ide/plugins/` project packages. Explain duplicate IDs and apply deterministic precedence; never silently replace trusted core contributions.

## Lifecycle and permissions

Represent state as discovered, invalid, awaiting consent, disabled, activating, active, failed or incompatible. Installation must not imply activation approval. New plugins require consent even with no optional permissions. Explain that language hooks receive the text of participating documents.

| Permission | Capability | Required disclosure |
|---|---|---|
| `project.read` | Confined reads and listing | May include secrets in project files |
| `project.write` | Confined writes | Can modify project files; not equivalent to editor conflict handling |
| `process` | Run an explicit executable and argument list | Runs with user privileges; project cwd is not an OS sandbox |
| `network` | Bounded HTTP(S) requests | Can contact external and local services |

- **PLUG-04:** Store consent by plugin identity and scope; project consent must be tied to the canonical project. Added permissions require review. A version bump alone must not be presented as a code audit.
- **PLUG-05:** Run third-party JavaScript in a Web Worker with no DOM, Node or direct Tauri bridge. Route capabilities through a host bridge, with native authorization checks for privileged operations. Constrain direct network, storage and nested-worker escape paths.
- **PLUG-06:** Allow partial grants and return structured permission-denied errors. Do not automatically grant a capability because a hook needs it.
- **PLUG-07:** Bound activation to 5 seconds and language hooks to 4 seconds initially. Terminate a timed-out worker, remove its contributions, and let the user retry or disable it. These limits are product defaults, not evidence of complete protection against hostile code.
- **PLUG-08:** Disable, reload, uninstall and project switch must terminate workers, cancel pending work and clear stale contributions. Core editing must remain usable after failure.

## Language API

Provide `ide.register`, manifest/granted-permission access, bounded logging and mediated project/process/network services. A package must register once. Use serializable data and UTF-16 offsets with zero-based line/column positions.

Initial contributions should include contextual completion, definition, hover, diagnostics, CodeLens and proposed text fixes. The implementation must document exactly which language/editor adapters call each hook. A language declared in the manifest is a document filter; it does not automatically create an editor integration.

- **PLUG-09:** Define deterministic aggregation: the first applicable non-null completion/definition result wins in documented provider order; diagnostics and CodeLens aggregate with provider identity. Deduplicate results where safe.
- **PLUG-10:** Validate contribution sizes, positions and destinations. Start with caps of 1,000 suggestions, 100 destinations, 500 diagnostics and 200 CodeLens per response. Reject external destinations and arbitrary internal commands.
- **PLUG-11:** Apply proposed fixes only after user action, validate the current document version and retain undo. Hooks must not bypass write permission by returning executable UI data.
- **PLUG-12:** Keep results from superseded requests out of the editor. Attribute failures to the responsible plugin without exposing document contents in routine logs.

## Debugger extension increment

PHP/Xdebug must be a separate plugin as specified in [SPEC-11](11-php-debugger.md). Extend the initial language-only contract before delivering it; ordinary worker plugins must remain isolated. Native tool packages must explicitly request trusted workbench and executable capabilities; those packages are not sandboxed.

- **PLUG-13:** Define a versioned debugger-provider API for registration, session state/events, breakpoints, stack/variable data, allowed actions and declarative views. Prefer shared core components. If the package supplies a UI module in the window, require explicit workbench consent and describe its access to DOM/displayed data; never claim worker isolation for it.
- **PLUG-14:** Add native-tool executable and trusted workbench capabilities with explicit consent, checksummed platform assets and bounded RPC. The separately packaged Rust adapter owns TCP/debug-process behavior. Specify bind address/port bounds, handle ownership, payload limits, backpressure, cancellation and process argument validation. Do not reuse HTTP fetch permission as authority to open listening sockets.
- **PLUG-15:** Tie every provider, native handle and contribution to plugin identity, activation generation and project scope. Native checks must reject stale/revoked handles; disable/uninstall/crash/update must clean resources independently of worker cooperation.
- **PLUG-16:** Version/negotiate these APIs and explain incompatible packages in the manager. Keep PHP/Xdebug protocol behavior in its plugin package; a clean core installation must remain useful without it.

Validate provider install/disable/removal, denied capabilities, malformed contribution data, crash cleanup and core editing without the package. These are future API requirements; the existing language-plugin contract alone does not establish debugger extensibility.

## Manager and distribution UX

The Plugins screen must show name, origin, installed version, permissions, activation status and last error. Offer install from folder, ZIP and explicit Git URL. A catalog may add search and manually requested updates; installing dependencies, background updates, ratings and signatures require separate scope.

Show installation progress and a clear success/failure result. Preserve the installed version if validation or an update fails. Review permission changes before activating an update. Uninstall must distinguish user-managed packages from project-owned folders and explain when manual removal is required.

## Construction and acceptance

Build the manifest validator, discovery and consent store first; then the worker bridge and one harmless sample plugin; then editor adapters and the manager; finally installation/update handling.

Acceptance must demonstrate:

1. A plugin with no optional permissions waits for consent and then contributes completion inside a real PHP editor.
2. Denied project reads/writes fail through the native bridge, including crafted requests and external symlinks.
3. An infinite-loop hook times out while editing continues, and disabling it clears diagnostics.
4. Switching projects revokes the old project context and drops late results.
5. A malformed ZIP and a failed update leave the prior installation usable.
6. A proposed fix can be inspected, applied and undone; an obsolete version is rejected.
7. Each advertised hook is exercised through every editor adapter claiming support, not only through host unit tests.

Use synthetic packages and local repositories. Report Worker/WebView security checks separately from Node-based harness checks; a Web Worker is not an operating-system sandbox.
