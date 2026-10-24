# Standalone Markdown plugin extraction

Date: 2026-10-23. Implementation evidence only; no new comparative validation of PhpStorm.

## Requirement and implementation

User requirement: Markdown must be a separate, installable plugin. The independently implemented parser, language provider, outline, preview stylesheet, local-image/link handling and Mermaid renderer were moved to [plugin-markdown](https://github.com/phpforge-dev/plugin-markdown). The main repository no longer owns Markdown rendering or its Mermaid dependency. File association and generic editor bridges remain in core; formatting belongs to Prettier.

IDE 0.2.12 introduces a standalone workbench manifest for plugins requiring UI without a native service. Language code runs in the worker; preview code runs inside the window only after explicit `project.read` + `workbench` consent. Default installation pins the public Git revision and entry checksum and leaves privileged UI consent pending. Reload, disable, removal and project switch dispose providers, listeners, layout, stylesheet and markers. Disabling a preview-only view restores the text editor.

## Validation

The package has eight parser/language tests and a reproducible bundle workflow. Core tests consume the pinned public package. `npm run test:native -- --no-db --markdown-only` exercises the package in the real Tauri window: denied UI source before consent; no native executable; split/live rendering; escaped HTML; local image; file/anchor completion and navigation; valid/invalid Mermaid; diagnostics; disable/removal cleanup and no built-in provider fallback. Results are recorded in `.artifacts/markdown-plugin-native.json` when run with the matching report environment variable.

Recorded extraction validation: typecheck passed; Rust 67 passed / 3 intentionally ignored; TypeScript 172 passed / 1 skipped; architecture, locales and Clippy passed. The focused real-window report passed all four groups; a separate fresh-profile default-install run also passed, including leaving Markdown workbench consent pending (`.artifacts/markdown-defaults-native.json`). Package CI and catalog CI passed. These results validate this implementation only.

## Limits

The renderer supports a Markdown subset, not full CommonMark/GFM conformance. Raw HTML is escaped; remote images follow CSP. Mermaid is bundled within this optional plugin. Trusted workbench modules are not sandboxed like language workers. Existing historical research remains separate from this implementation evidence; the feature family stays in development and has not gained comparative compatibility status.
