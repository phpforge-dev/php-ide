# SPEC-07 — Git integration

## Goal and scope

Build a complete review-to-commit workflow inside the IDE: inspect changes, stage files or hunks, review the index, commit, browse history and manage branches. Add remote synchronization and advanced operations only with explicit state checks and recovery flows.

Use [SPEC-01](01-ide-foundation.md) for file integrity and process boundaries, [SPEC-03](03-workbench-ui.md) for workbench behavior and [SPEC-04](04-design-system.md) for diff/status presentation. Initial scope is one explicit repository root per project. Multi-root, submodule management, shelves and worktree creation need separate specifications.

## Architecture and contracts

Run the Git CLI through Rust with explicit argument arrays, controlled environment, timeouts and bounded output. Parse machine-oriented formats with unambiguous path delimiters. File names may contain spaces, Unicode, leading dashes and newlines; never interpolate them into shell strings.

| Contract | Required information |
|---|---|
| Repository snapshot | Canonical root, HEAD, branch/detached state, index revision and operation state |
| Changed file | Path, previous path when relevant, index/worktree status and binary/conflict flags |
| Review token | Expected repository state plus relevant file/index/config hashes |
| Mutation request | Explicit operation, validated target, review token and request ID |
| Operation result | Exit/error state, refreshed repository snapshot and whether reconciliation is required |

Serialize repository mutations and independently revalidate backend state immediately before execution. Git locks remain authoritative for external concurrency; an application queue alone cannot prevent another Git client changing the repository.

## Status, diff and commit

- **GIT-01:** Detect a valid repository and show branch/HEAD state. A project without Git must show an informative empty state rather than repeated errors.
- **GIT-02:** Separate staged, unstaged, untracked and conflicted files. Preserve staged-versus-working-tree distinctions for partially staged files. Make unsaved-buffer differences explicit; Git ordinarily operates on disk/index state.
- **GIT-03:** Show index/base/worktree diffs with path and revision context. Historical diffs must be read-only. Represent binary changes without pretending to render a text diff.
- **GIT-04:** Stage/unstage selected files and reviewed hunks without changing unrelated disk or index content. Revalidate the hunk base and reject stale selection instead of applying an approximate patch.
- **GIT-05:** Commit must review the exact staged content, require a message and validate the review token. Preserve unstaged edits and retain the message on failure. Explain when unsaved buffers differ from the content being committed.
- **GIT-06:** Treat hooks/signing failures as failures with safe output and preserved user state. Do not bypass hooks or signing automatically. After timeout/cancellation, inspect HEAD/index before declaring whether a commit occurred.
- **GIT-07:** Amend must show the commit being replaced, load its full message and require an explicit action. Detect changed HEAD/index after preview. Keep the original message draft when leaving amend mode.

## Branches, history and conflicts

- **GIT-08:** Provide a searchable branch popup showing local/remote branches, current branch and upstream. Validate new names through Git; remote checkout must create explicit local tracking without resetting a colliding local branch.
- **GIT-09:** Switching/integrating branches must resolve dirty editor buffers and reject unsafe disk changes with Save/Commit/Stash guidance. Do not silently stash, discard or force checkout.
- **GIT-10:** Local branch deletion requires target-specific confirmation, must reject the current branch and use safe merged-branch deletion initially. Remote deletion and force deletion are outside the first delivery.
- **GIT-11:** History must show real commit IDs, parents, refs, author and date, with commit → files → diff navigation. Clearly label loaded-range filters and limits; draw only relationships supported by actual parent IDs.
- **GIT-12:** Conflicts need base/ours/theirs context and an editable result. Marking resolved must stage the reviewed result only. Continue/abort actions must reflect the actual merge/rebase/cherry-pick/revert state.

Add merge, rebase, stash, cherry-pick and revert as individually tested increments. Do not advertise a generic “advanced Git” action before its conflict, continue, skip where supported and abort paths are specified. Destructive reset/clean and force push are outside the initial scope.

## Remotes and identity

- **GIT-13:** Fetch may run with dirty buffers without changing them. Pull should default to fast-forward-only against the visible upstream; divergence must require an explicit strategy rather than an automatic rebase or merge.
- **GIT-14:** Push must show remote, branch and destination before execution. Commit and Push must report commit success separately from push failure. Never infer write permission from a successful read-only remote test.
- **GIT-15:** Repository identity settings must modify only managed local values under lock with revision checking. Show effective inherited identity and explain shared configuration in linked worktrees. Never overwrite global Git settings.
- **GIT-16:** Delegate authentication to configured credential helpers, SSH agent and system tooling. Do not read private-key contents or store passwords/tokens. Redact credential-bearing URLs before UI/log output. Missing interactive authentication must fail with setup guidance rather than hanging invisibly.

## Construction steps

1. Implement repository detection, machine-format parsing and status snapshots.
2. Add read-only diffs and index-aware file/hunk staging.
3. Build reviewed commit/amend with stale-state protection.
4. Add history, branches and safe checkout/deletion.
5. Add fetch, fast-forward pull, reviewed push and local identity settings.
6. Add conflict resolution and advanced operations one at a time.

## Acceptance scenarios

| Case | Required result |
|---|---|
| GIT-A1 | Partial staging commits only the chosen content and preserves unrelated disk edits |
| GIT-A2 | External index/HEAD changes invalidate an earlier review token |
| GIT-A3 | Hook failure retains the message and does not falsely show success |
| GIT-A4 | Amend replaces the intended commit and preserves unstaged content |
| GIT-A5 | Invalid names, current-branch deletion and unmerged deletion preserve repository data |
| GIT-A6 | Fetch preserves dirty buffers; divergent pull fails without rewriting history |
| GIT-A7 | Conflict result can be reviewed, resolved and continued or safely aborted |
| GIT-A8 | History parents match Git output and historical files remain read-only |
| GIT-A9 | Two fixture repositories retain separate identities and unchanged global configuration |
| GIT-A10 | Local commit success plus push failure is displayed as two distinct outcomes |
| GIT-A11 | Timeout/cancellation triggers reconciliation before another mutation is allowed |

Use disposable repositories, local bare remotes and synthetic credential helpers. Isolate HOME/configuration and never use real accounts for tests. Verify state through Git independently of UI labels, then exercise the workflow in Tauri. Report each advanced operation and transport separately.
