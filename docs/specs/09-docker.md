# SPEC-09 — Docker integration

## Goal and scope

Build a Services tool window that lets a developer select a Docker context, inspect resources, manage selected containers, read logs, open a container terminal and run explicit project Compose actions.

Use Rust-managed Docker CLI calls with allowlisted operations. Depend on a separately installed CLI/engine and Compose support where needed; the IDE must not reset the daemon or install infrastructure automatically. Use [SPEC-08](08-terminal.md) for PTY sessions and the common UI/design specifications for presentation.

Initial scope includes context selection, resource listing, start/stop/restart, safe container removal, image pull, logs and Compose up/stop/build. Global prune, forced deletion, volume deletion, registry push, container creation forms and PHP interpreter/debugger integration require separate specifications.

## Architecture and contracts

| Contract | Required information |
|---|---|
| Connection | Validated context name, safe endpoint summary, availability and error state |
| Resource | Context, stable ID, kind, display name and current observed state |
| Operation | Opaque request ID, context, target, project generation and lifecycle state |
| Progress | Operation ID, ordered bounded output and truncation status |
| Compose target | Confined file, project scope and explicitly selected services |

The Rust service owns CLI spawning, parsing, cancellation and mutation serialization. Use explicit argument arrays and machine-readable output. Never offer a generic Docker command string through IPC. The renderer must not receive PIDs or credentials.

## Context and resource behavior

- **DOCKER-01:** List contexts from the configured CLI and pass the selected context explicitly on every call. Do not change the user's global active Docker context.
- **DOCKER-02:** Distinguish missing CLI, missing Compose support, unavailable engine and unauthorized context. Keep selection/configuration visible and offer Retry.
- **DOCKER-03:** Validate context membership, target identifiers, image references and Compose paths before execution. Reject flag injection and external path/symlink escapes.
- **DOCKER-04:** List containers with name, image, observed state and published ports. List images, networks and volumes with bounded detail. Preserve selection by ID and explain when a selected resource disappears.
- **DOCKER-05:** Use explicit refresh and bounded polling only while relevant views are visible. Cancel superseded requests and discard old-context results.

## Container actions, logs and terminal

- **DOCKER-06:** Start/stop/restart must act on the selected context and container, display progress and refresh actual state after completion. Revalidate availability rather than relying on a stale button state.
- **DOCKER-07:** Removal must identify the target and require confirmation. Initially require stopped containers, omit force and retain volumes. A failed removal must not trigger a broader destructive fallback.
- **DOCKER-08:** Display bounded stdout/stderr logs with timestamps, an initial 200-line tail and an explicit follow/pause control. If polling is used, label its behavior and avoid claiming exact stream interleaving.
- **DOCKER-09:** Open an interactive PTY using an explicit container exec invocation, initially `/bin/sh`. Missing shell or stopped container must produce actionable feedback. Closing the terminal must not stop the container.
- **DOCKER-10:** Do not expose environment variables or secret-bearing inspect data by default. Logs may contain private data; keep them local and do not attach them to agents automatically.

## Compose and image operations

- **DOCKER-11:** Discover `compose.yaml`, `compose.yml`, `docker-compose.yaml` and `docker-compose.yml` in the project root through confined access. Show the selected file/context and services before executing anything. Never run Compose automatically on project open.
- **DOCKER-12:** Implement explicit up, stop and build operations with progress and selected-service scope. Explain that Compose definitions can mount host paths, contact networks and run project-defined code; workspace path validation does not sandbox Compose itself.
- **DOCKER-13:** Pull images only from explicit validated references. Show download progress and refresh resource state after success, error or interruption. Authentication remains with the CLI's existing configuration.
- **DOCKER-14:** Cancellation must target an operation ID and remain available while a mutation is running. Stop the owned client process and then reconcile engine state. Cancelling the client is not rollback of work already accepted by Docker.
- **DOCKER-15:** Start with query timeouts of 8 seconds, container actions of 30 seconds and pull/Compose limits of 180 seconds. Bound retained output to 1 MiB per stream, with visible truncation and bounded streaming queues. Long-task overrides need documented upper limits.
- **DOCKER-16:** Serialize conflicting mutations and snapshot context/file selection per operation. Context or project changes must not retarget an in-flight command.

## Lifecycle and recovery

Switching projects must cancel project-scoped requests and close owned container PTYs; externally managed containers and the daemon must remain running. Application shutdown must terminate owned CLI clients and subscriptions without issuing broad engine cleanup.

After timeout, lost connection or cancellation, show an uncertain state until refresh completes. Do not announce that a container stopped or a build rolled back merely because the CLI exited. Preserve safe diagnostic output and offer retry only with an explicit current target.

## Construction steps

1. Implement context discovery, structured CLI execution and safe parsing.
2. Build connection state, resource tree and read-only details.
3. Add container lifecycle actions and target-specific confirmation.
4. Add bounded logs and PTY container terminals.
5. Add Compose discovery and explicit up/stop/build.
6. Add pull/progress/cancellation and reconciliation after interrupted work.

## Acceptance scenarios

| Case | Required result |
|---|---|
| DOCKER-A1 | Each command uses the selected context without changing global CLI state |
| DOCKER-A2 | Missing/offline dependencies show recoverable errors without losing selection |
| DOCKER-A3 | Start/restart/stop update actual selected-container state |
| DOCKER-A4 | Cancelling removal leaves the container; confirmed safe removal retains volumes |
| DOCKER-A5 | Logs are bounded and late results from another context are ignored |
| DOCKER-A6 | Container PTY supports input/resize/close without stopping the container |
| DOCKER-A7 | Compose acts only on the reviewed file/context/services and never starts on project open |
| DOCKER-A8 | Interrupted pull/build remains cancellable and triggers resource reconciliation |
| DOCKER-A9 | Invalid identifiers, image flags and Compose symlink escapes are rejected |
| DOCKER-A10 | Switching projects stops owned clients/PTYs but preserves engine resources |

Use a synthetic CLI for deterministic error/progress/cancellation cases, and a separately identified real-engine suite with unique disposable resource names. Real tests may mutate/remove only resources they created, must avoid user mounts and must clean up on failure. Record simulated-CLI, native-UI and actual-engine evidence separately; one does not substitute for another.
