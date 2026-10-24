# SPEC-13 — PHP test discovery and execution

## Goal and scope

Let a developer discover PHPUnit/Pest tests, run a meaningful scope from the editor or test panel, inspect results and navigate directly to a failing test. Keep command execution, runner results and discovery confidence distinct.

Build on [SPEC-01](01-ide-foundation.md), [SPEC-03](03-workbench-ui.md), [SPEC-06](06-php-intelligence.md) and [SPEC-12](12-composer.md) for missing-dependency guidance. Running project tests executes project code with the user's privileges; a confined runner path is not a test sandbox.

Deliver local PHPUnit/Pest file/class/group/test actions, bounded process output and JUnit-based final results first. Saved configurations, rerun-failed and streamed output can follow as explicit increments. Test coverage, parallel runners, remote/container interpreters and Debug Test require their own capability checks; [SPEC-11](11-php-debugger.md) is a prerequisite for debugger integration.

## Architecture and contracts

| Contract | Required information |
|---|---|
| Runner descriptor | Framework, executable/interpreter, detected version, configuration and capabilities |
| Discovered node | Stable local ID, file/range, framework, kind, parent and supported execution selector |
| Run plan | Project, runner/configuration, scope, filter/arguments, source revisions and environment policy |
| Run | Opaque ID, generation, immutable plan, start/end time and process lifecycle |
| Test result | Runner identity, test/dataset identity, status, duration, message and validated source location |
| Run summary | Exit code, totals, report validity/completeness, cancellation and truncation state |

Rust owns executable/configuration validation, process lifecycle, output and temporary artifacts. Portable discovery/result adaptation belongs in shared modules. The WebView owns tree presentation, editor actions and navigation. Generated invocation arguments must come from a validated plan, never an arbitrary shell command.

## Discovery and configuration

- **TEST-01:** Detect candidate frameworks from Composer metadata and local runner files without running tests or installing dependencies. Show runner/version uncertainty explicitly. If both frameworks are present, use an explicit documented selection policy and allow the user to change it.
- **TEST-02:** Discover supported PHPUnit classes/methods/attributes and Pest literal tests/nested descriptions without counting comments, strings or unrelated method calls. Preserve source ranges and parent hierarchy. Unsupported dynamic definitions must remain visible as discovery limitations.
- **TEST-03:** Keep static discovery separate from execution truth. Data providers, inherited tests and runtime-generated tests may create results not known statically; add such nodes from reports instead of discarding them.
- **TEST-04:** Offer a reviewable PHP interpreter, runner path and project configuration file. Detect common root configuration candidates but require selection when ambiguous. Do not rewrite XML, bootstrap files or project environment automatically.
- **TEST-05:** Show Run File/Class/Group/Test only where an adapter can construct a reliable selector. If a requested single test cannot be selected safely, explain and offer a broader explicit scope rather than silently running the whole suite.

## Plans and execution

- **TEST-06:** Show the selected scope, framework, configuration, cwd and effective command before or alongside execution. Editor CodeLens/gutter and test-panel actions must use the same planner. No tests may start merely because a file opens.
- **TEST-07:** Validate paths and arguments in Rust, including symlink targets and leading-option injection. Escape framework regular-expression filters correctly; shell escaping alone does not preserve test-name semantics. Validate selectors against real named runner versions.
- **TEST-08:** Resolve unsaved files before execution through Save/Cancel or a clearly specified saved-source mode. Never present results as validating unsaved buffer content that the process did not execute.
- **TEST-09:** Start with one active test run per project. Create a unique report location in a private temporary directory, remove any stale report before launch and clean it on all exit paths. Record config/source changes during the run and mark results stale when necessary.
- **TEST-10:** Bound execution initially to 10 minutes, retained output to a 256 KiB tail and JUnit input to 8 MiB. Expose truncation and timeout. Streaming output must be bounded and must not be interpreted as structured per-test success unless the adapter has a reliable event protocol.
- **TEST-11:** Stop must cancel owned processes with platform-appropriate cleanup and mark unfinished tests cancelled/unknown. Do not infer failure or success for tests that produced no result. Detached children require a documented lifecycle limitation.
- **TEST-12:** Test environment and bootstrap scripts may contact services or change data. Display the configuration context and never silently substitute production credentials or reuse the IDE database session. Secrets must not enter run-history settings or agent context.

## Results and navigation

- **TEST-13:** Parse JUnit safely with size/depth limits and external entities disabled. Distinguish passed, assertion failure, error, skipped, cancelled and unknown/incomplete. Preserve dataset instances and duplicate names through stable composite identities.
- **TEST-14:** Combine report validity with process status. A zero exit without an expected report is a reporting problem, not proof of passing tests. A nonzero exit with valid results must show both test outcomes and runner failure context. Zero discovered/executed tests requires explicit feedback.
- **TEST-15:** Group results by file/class/group with totals, duration and status text/icons. Show stdout/stderr separately from failure detail. Keep previous results visible with a stale/previous-run label while a new run starts.
- **TEST-16:** Navigate from a result to the validated test or failure location. Resolve framework-specific report paths against authorized sources; reject external paths and clearly label fallbacks when a report lacks a line number. Changing selection must not guess a failure range.
- **TEST-17:** Rerun must use an identifiable saved plan. Rerun Failed must reconstruct selectors from failed result identities, including supported datasets, and disclose any broader fallback. Do not silently reuse stale runner configuration.

## Extension boundaries and recovery

A Debug Test increment must discover the separately installed PHP/Xdebug provider, offer Install/Enable guidance when unavailable, and preserve the exact selected scope/configuration while establishing an Xdebug listener and session correlation. Report debugger connection failure separately from test results. Do not expose a functional-looking Debug button before that flow is implemented and tested.

A Coverage increment must identify the available coverage engine, validate configuration, parse a bounded report, map source revisions and distinguish covered/uncovered/non-executable lines. A normal passing test run does not imply coverage was collected. Parallel execution must specify worker identity, result merging, cancellation and shared-fixture isolation before being offered.

- **TEST-18:** Missing runners/configuration, malformed reports and launch failure must preserve the selected scope and offer Configure, Open Output or a reviewed retry. Dependency setup must be explicit through Composer rather than automatic installation.
- **TEST-19:** Project switching must resolve active runs, cancel or detach only under a specified policy, reject old-project events and retain only non-secret reusable plans. Application shutdown must release report files and owned process resources.

## Construction steps

1. Define runner/selector/result contracts and static PHPUnit/Pest fixtures.
2. Implement discovery and explicit configuration with unsupported-case feedback.
3. Build backend invocation plans and verify filters against actual runners.
4. Add temporary JUnit collection, safe parsing and final-result reconciliation.
5. Connect editor Run actions, test tree and failure navigation in Tauri.
6. Add cancellation, missing-dependency recovery and stale-result handling.
7. Add saved/rerun-failed workflows, then specify debug/coverage/parallel extensions separately.

## Acceptance scenarios

| Case | Required result |
|---|---|
| TEST-A1 | Discovery excludes comments/unrelated calls and identifies supported test ranges |
| TEST-A2 | Selected method/Pest description runs exactly the intended scope, including regex punctuation |
| TEST-A3 | Supported datasets retain separate results without losing their source test association |
| TEST-A4 | Dirty files and changed runner/configuration require a current plan |
| TEST-A5 | Pass/failure/error/skipped and zero-tests states appear with accurate totals |
| TEST-A6 | A failure opens the correct authorized file/range or an explicitly labeled fallback |
| TEST-A7 | Missing/malformed/oversized reports cannot produce a false green run |
| TEST-A8 | Cancellation/timeout leaves unfinished tests unknown/cancelled and cleans temporary files |
| TEST-A9 | Rerun-failed selects only supported failed identities or asks before broadening scope |
| TEST-A10 | Missing runner preserves scope and leads to explicit setup without installing automatically |
| TEST-A11 | Switching projects rejects old results and preserves unrelated user files |
| TEST-A12 | Nonzero exit plus partial valid results remains visibly incomplete |

Use synthetic runners for argument, report, timeout and cancellation cases, then real PHPUnit/Pest versions in disposable fixtures. All test databases/services must be created for the fixture and removed afterward; never use real user databases. Validate CLI selector accuracy separately from actual Tauri CodeLens/result/navigation interaction. Record framework/PHP versions, dataset forms and unsupported discovery/report cases individually; one successful runner does not validate the other.
