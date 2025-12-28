---
summary: "Refactor guide: share finish-line assembly across CLI + daemon."
---

# Refactor: Finish Line Consumers

Goal: one shared finish‑line assembly path for CLI + daemon.

## Steps
- [x] Inventory finish‑line usage.
  - Files: `src/run/finish-line.ts`, `src/daemon/summarize.ts`, `src/run/runner.ts`.
- [x] Define `FinishLinePayload` model.
  - Input: elapsed, tokens, model label, extras, cache flag.
- [x] Add shared helper.
  - New `buildFinishLinePayload()` in `finish-line.ts` or new module.
- [x] Update daemon metrics to use helper.
  - Replace local assembly in `buildDaemonMetrics`.
- [x] Update CLI to use helper.
  - Ensure same model label normalization.
- [x] Extend tests.
  - Add daemon metric formatting test for parity.
- [x] Verify output parity.

## Done When
- CLI + daemon produce identical label formatting.
- Single entrypoint for finish‑line model assembly.

## Tests
- `pnpm -s test tests/cli.cost.finish-line.test.ts tests/daemon.*finish-line*.test.ts`
