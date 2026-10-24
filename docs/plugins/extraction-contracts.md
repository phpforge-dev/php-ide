# Extraction contracts — IDE 0.2.13

Frozen coordination baseline for the parallel extraction. Existing language worker API, standalone workbench API v1, and native tool protocol v1 remain compatible. Each feature lives in its own phpforge-dev/plugin-NAME repository, committed prebuilt assets, MIT/source attribution, tests, reproducible CI and pinned default/catalog metadata. Node is build/test tooling only.

## Language packages

Use plugin.json/main.js and IdePlugin worker hooks already defined in shared/language/plugins/api.ts. Project reads pass through ProjectFiles; no Node globals. Return null when a request does not belong to the provider. Symfony and ignore use this existing contract. Formatters use format(request, files), returning a complete buffer, with range and config behavior preserved.

## Trusted workbench packages

Export activate(sdk). sdk provides api, host, monaco, tr, msg, html, keymap, listen, own, dockWindow, resizeToolWindow, toolIcon, editorPreviewLayout. host has editor, path(), open(path,line?), status(), changed(). Additive host hooks virtual(uri,title,text,language), chooseProject(path?), terminal(cwd?) are supplied where needed. Workbench manifest may declare services:string[] naming existing IdeApi operations needed by the package. Rust validates against an explicit host allowlist and rechecks workbench/project.read and specific permissions for brokered operations. No arbitrary IPC dispatch. Trusted UI code is not a sandbox. Native tools additionally require native.tool and declared methods.

sdk.provide(name, implementation) registers an optional contribution for the current generation and is automatically disposed. Core accesses contributions through pluginService(name); absence must be recoverable and visible. Contribution names: imagePreview, svgPreview, webLanguages, phpIntelligence, git, terminal, docker, agents, database. Implementations should preserve existing exported module/controller signatures to minimize core integration changes. Do not import sibling repository paths at runtime. Self-contained browser bundles; use inline Blob workers for package-owned workers when necessary. sdk.own registers providers/listeners/observers/layout cleanup. Disabling, removing or changing project must stop activity and release UI. In-flight results must not affect a new document or provider generation.

## Native boundary

Native tool packages follow existing Rust JSONL protocol: initialize → {protocolVersion:1}; request method with {args}; notification tool/event. Core owns authorization, package integrity, project confinement, credential storage, process/PTY lifecycle and IPC/event delivery. Feature-specific command construction, protocol adapters and domain logic should move to packages; native host primitives may remain only where needed for secure system access. Do not describe a UI-only extraction as full backend extraction. No real user database or real inference in tests; fixtures are synthetic.

## Coordination and acceptance

Only coordinator edits src/main.ts, src/native.ts, src/native-language.ts, src/tool-plugins.ts, shared/contracts.ts, manifests/default/catalog and core Rust dispatch. Agents own separate package repos plus feature-specific files/tests; report integration patch instructions. Preserve pre-existing work. Run package tests before requesting removal; integrate one substitution at a time, typecheck/Rust/relevant tests and real Tauri scenarios. Publish only tested artifacts; record remaining boundaries honestly. No blanket compatibility promotion.

## Implemented native library boundary

In addition to the pre-existing executable protocol, the twelve-feature extraction uses six external Rust library crates pinned by Git revision in Cargo.toml/Cargo.lock. They contain the original feature implementations and are statically linked into the host. UI and semantic contributions can be installed/reloaded independently, but updating these native backends requires a host rebuild. This is explicitly different from a downloadable native executable plugin. The host owns authorization and resource lifetime; feature implementations remain in their respective repositories. See the extraction evidence for current validation.
