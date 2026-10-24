# PHP and preview extraction — cleanup completed, native acceptance pending

Date: 24 October 2026. Related evidence: [parallel plugin extraction](parallel-plugin-extraction.md).

## Authorization and remaining validation

The user explicitly authorized cleanup with “Pode fazer a limpeza”, superseding the earlier self-imposed removal gate. All 21 obsolete files listed below were removed on 24 October 2026. Foundation contracts and unrelated concurrent changes were preserved.

Full native Tauri acceptance remains pending because the current macOS session is locked: the native application cannot become active and WebKit reports a hidden document. Cleanup authorization does not turn that blocked run into a pass. Package, Rust and simulated browser results remain separate evidence, and no compatibility family is promoted.

After cleanup, both direct TypeScript checks passed against the existing pinned package cache. The focused host test command below passed all 63 tests, including sandboxed formatting, optional-provider behavior and PHP semantics/refactorings. Final whole-host checks are coordinated separately; the real Tauri run still needs an unlocked session.

## Removed obsolete files (21)

PHP intelligence UI and semantic implementation:

- `src/refactor-php.ts`
- `src/refactor-ui.ts`
- `src/refactor.css`
- `src/php-editor-insights.ts`
- `src/php-gutter.css`
- `src/php-hierarchy-index.ts`
- `src/php-navigation.ts`
- `shared/php-editor-analysis.ts`
- `shared/language/php-completion.ts`
- `shared/language/php-hierarchy.ts`
- `shared/language/php-local-types.ts`
- `shared/language/php-method-family.ts`

PHP formatter implementation:

- `src/php-format.worker.ts`
- `shared/formatting/php.ts`
- `shared/formatting/config.ts`

Dedicated preview implementation and styles:

- `src/svg-preview.ts`
- `src/svg-preview.css`
- `src/image-preview.ts`
- `src/image-preview.css`

Old native PHP copies, now supplied by the external pinned Rust crate:

- `src-tauri/src/language.rs`
- `src-tauri/src/php_stubs.rs`

Mixed stylesheets are owned by the native-feature extraction coordinator. Do not remove selectors from `src/style.css`, `src/workbench.css`, `src/theme-surfaces.css`, `src/islands-shell.css` or `src/tool-windows.css` as part of this list. The remaining PHP-specific mixed rules were moved into the published PHP intelligence package and removed from the host stylesheet; consume the current default pins. PHP UI 1.0.1 is published at `34075e092a76fdf4c6bed77dfae50c02a0ab8c7b`; its 28 local tests and CI passed. See also [the integration handoff](../plugins/extraction-validation-handoff.md).

## Foundation files to keep

- `src/native-language.ts`: rewritten generic optional-provider coordinator, shared external language-worker host, project reset and empty recoverable behavior when PHP intelligence is disabled.
- `src/plugin-services.ts` and `src/tool-plugins.ts`: contribution registration, scoped APIs and disposal infrastructure.
- `src/editor-preview-layout.ts`: shared editor visibility and preview ownership; required when an active preview is disabled.
- `shared/language/php-source.ts`: lexical spans/string-site infrastructure used by other language plugins and host contracts; not a fallback PHP intelligence provider.
- `shared/php-file-kind.ts`: declaration-based project-tree file icons.
- `shared/plugin-document-associations.ts`, `shared/markdown-document.ts` and other small document-association modules: generic routing only.
- `shared/formatting/edits.ts` and `src/formatting.ts`: generic format action, minimal editor edits, stale-result protection and undo integration.
- `src/project-actions.ts`: generic project tree with an optional three-method refactoring contract; it no longer imports the old refactoring implementation.
- `src/editor-theme.ts`, shared layout, design tokens, editor/buffers, files, keymaps, permission checks and native resource/history boundaries.
- Package-oriented tests and smoke harnesses, including `src/refactor-smoke.ts`, which now obtains code actions through the active contribution.

## Dependency and import checks

Cleanup completed: `php-parser` is a root development dependency because host tests import the pinned formatter's TypeScript source. The package-cache setup does not install package dependencies or run repository scripts. Its runtime browser bundle and build replacement belong to the plugin; the core Vite `process.arch` replacement was removed.

Dependency cleanup completed: the old editor-change implementation and direct `diff` dependency were removed. The remaining frontend runtime dependencies are Monaco and the Tauri API. Parser dependencies needed by pinned package source tests remain development-only dependencies.

The old feature paths should have no remaining runtime importers. Scripts already adapted to package sources or bundles include `check-formatting.mjs`, `check-image-preview.mjs`, `preview-svg.mjs`, `check-php-editor-analysis.ts` and `check-php-semantics.ts`. Recheck import references after any concurrent edits.

## Post-cleanup verification and remaining checks

Every shell command uses the repository's RTK prefix. The first two commands passed after deletion, using the existing pinned cache without setup hooks. The browser and analysis commands are the relevant focused checks for later changes; their earlier successful runs remain recorded in the extraction research document:

```sh
rtk proxy sh -c 'node_modules/.bin/tsc --noEmit && node_modules/.bin/tsc -p tsconfig.tests.json'
rtk proxy sh -c 'node --import tsx --test tests/native-language-coordinator.test.ts tests/bash-language.test.ts tests/docker-language.test.ts tests/dotenv-editor.test.ts tests/formatting.test.ts tests/refactor-php.test.ts tests/php-hierarchy.test.ts tests/php-local-types.test.ts tests/php-method-family.test.ts tests/php-navigation.test.ts tests/php-source.test.ts'
rtk proxy sh -c 'node scripts/check-formatting.mjs'
rtk proxy sh -c 'node scripts/check-image-preview.mjs'
rtk proxy sh -c 'node scripts/preview-svg.mjs'
rtk proxy sh -c 'node --import tsx scripts/check-php-editor-analysis.ts'
```

The coordinator must run the final required host checks with stable pins, including `npm run typecheck`, `npm test` for Rust, pertinent native Tauri scenarios and any architecture/lint checks required by the change. Record the native report path and final result in the extraction research document. Do not substitute the WebKit harnesses or package tests for actual Tauri acceptance, and do not promote comparative compatibility states.
