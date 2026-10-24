# SPEC-03 — Workbench UI

## Goal

Let a developer move from opening a project to editing, navigation and tool use with clear focus, visible state and recoverable errors. Every exposed control must complete a useful flow; hide unavailable actions or explain why they cannot run.

## Workspace composition

| Region | Content | Interaction contract |
|---|---|---|
| Top bar | Project switcher, global search, appearance and settings | Current project is always identifiable |
| Left rail and panel | Project tree and navigation tools | Toggle, resize and restore without losing selection |
| Center | Tabs, editor, breadcrumbs and contextual results | Preserve caret, scroll and dirty state per document |
| Right rail and panel | Database and other contextual tools | Opening a tool preserves the active editor |
| Bottom tools | Terminal, problems, Git and other configured tools | Show active tool and restore useful dimensions |
| Status bar | Language/index state and relevant task progress | Show meaningful state rather than decorative labels |

Initial layout should allocate most width to the editor and use collapsible tool windows. Keep panel sizes bounded so resizing cannot make the editor unusable. At narrow widths, collapse secondary panels before hiding essential document actions.

## Primary flows

### Open and resume a project

- **UI-01:** Welcome must provide an obvious Open Project action and recent projects with name/path. Missing recent folders must show Locate or Remove rather than repeatedly failing.
- **UI-02:** Display startup progress until the workbench is ready. A splash must yield to the ready window or an actionable failure; it must never hide a failed initialization indefinitely.
- **UI-03:** Restore valid tabs, active file and layout after opening the same project. Missing files must not prevent the project from opening. Resolve dirty buffers before switching.

### Edit and navigate

- **UI-04:** Single-click tree preview and persistent tabs must have explicit semantics. Editing a preview must promote it to a durable tab. Dirty documents cannot disappear when another file is previewed.
- **UI-05:** Tabs must show name, dirty marker, selection and close action; duplicate names must gain path context. Closing a dirty tab invokes Save/Discard/Cancel.
- **UI-06:** Definition navigation must open the correct range, focus the editor and preserve a return location. Multiple targets require a keyboard-navigable chooser; no target requires explicit feedback.
- **UI-07:** Search must show scope, query, loading, empty and failed states. Debounce queries, ignore stale responses and keep the prior editor intact on Escape. Enter must open the selected result and reveal its range.
- **UI-08:** Completion, diagnostics, hover and fixes must remain attached to the correct document/version. Applying a fix must preserve undo.

### Open tools and configure the interface

- **UI-09:** Each tool window needs an active indicator, meaningful empty state, close/toggle action and contextual primary action. A database empty state should lead directly to Add Connection.
- **UI-10:** Non-destructive visual settings must update the workbench immediately in a non-modal panel. Keep the edited surface visible. Explain autosave and offer reset to defaults.
- **UI-11:** Long tasks must show progress or an indeterminate state, with cancellation where supported. Errors should preserve input and offer Retry or Edit Configuration.

## Commands, keyboard and focus

Create a command registry with stable IDs, localized labels, enabled conditions and optional keybindings. Menus, toolbars and search must invoke the same command behavior. Choose platform-aware bindings, display them beside actions and identify conflicts rather than assigning silent duplicates.

- **UI-12:** Support keyboard access to the project tree, tabs, global search, tool windows and dialogs. Menus and result lists use arrows, Enter and Escape consistently.
- **UI-13:** Track the focus origin. Closing a popup/panel restores it when the origin still exists. Modal dialogs trap focus; non-modal appearance panels must not trap it.
- **UI-14:** Hidden overlays must not intercept pointer or keyboard events. Escape must close the topmost transient surface only.
- **UI-15:** Controls require accessible names and visible focus indicators. Active/dirty/error states must not rely solely on color. Tooltips must not be the only way to discover essential actions.

## State and persistence

Separate project state, document state, tool state and transient overlays. Persist layout, project tabs and preferences; do not persist open confirmation dialogs or passwords. Validate stored sizes against the current window before restoring them.

Use a shared interaction-state vocabulary: idle, loading, success, empty, error and disabled with reason. Keep error details local to the affected tool; reserve blocking dialogs for decisions that block safe continuation. Avoid success notifications for every routine keystroke or autosaved visual preference.

## Construction and acceptance

Deliver Welcome/open project first, then tree/editor/tabs, command registry and focus management, tool-window layout, search/navigation and settings integration.

| Case | Required result |
|---|---|
| UI-A1: keyboard-only open/edit/save | User completes the workflow and sees the persisted file content |
| UI-A2: preview then edit | The edited tab remains when another tree item is selected |
| UI-A3: resize, restart, reopen | Valid panel sizes and active document are restored |
| UI-A4: failed search followed by retry | Input survives and successful results replace the error |
| UI-A5: nested transient surfaces | Escape closes only the top surface and restores correct focus |
| UI-A6: change appearance while editing | Actual editor/tool surfaces update without an obscuring backdrop |
| UI-A7: closed popup over editor | Clicking and typing reach the editor |
| UI-A8: reduced window width and 200% zoom | Essential actions remain reachable without overlapping controls |

Exercise these in the real Tauri window. Capture representative empty/loading/error/dirty states and keyboard focus, not only the default screen. Separate macOS, Windows and Linux results.
