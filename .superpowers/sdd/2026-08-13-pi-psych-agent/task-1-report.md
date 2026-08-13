# Task 1 report: Pi agent service foundation

## Changed files

- `agent-service/package.json` and `agent-service/package-lock.json`: isolated Node/TypeScript service using `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` 0.84.1.
- `agent-service/src/model.ts`: DeepSeek V4 Flash Pi model composition (`deepseek-v4-flash`, 1M context, 16,384 output reserve, DeepSeek thinking mapping).
- `agent-service/src/safety.ts`: deterministic `none`/`uncertain`/`concern`/`high`/`imminent` classification and fixed crisis resources.
- `agent-service/src/tools.ts`: Pi `lookup_psychoeducation(topic)` and `get_support_resources(region)` tools restricted to approved local knowledge cards and support resources.
- `agent-service/src/context.ts`: token-based context management using a model-window threshold, `reserveTokens=16384`, `keepRecentTokens=20000`, summary compaction, state snapshot, and current input.
- `agent-service/src/service.ts` and `agent-service/src/server.ts`: loopback Node HTTP service exposing `GET /health` and SSE `POST /turn`; elevated-risk turns bypass the agent tools.
- `agent-service/test/*.test.mjs`: tests for model resolution, safety risk levels/resources, local tool boundary, token compaction, health, SSE events, crisis bypass, and agent errors.

## Test-first evidence

1. RED: `node --test test\\*.test.mjs` before implementation failed because `dist/context.js`, `dist/model.js`, `dist/safety.js`, and `dist/tools.js` did not yet exist.
2. GREEN: `npm.cmd test`

Result: 13 passed, 0 failed. The command runs TypeScript compilation followed by all Node tests.

## Concerns

- The service deliberately has no persistence/database layer and binds only to loopback. A later gateway task must supply identity, session retrieval, and persisted summaries/state snapshots.
- Runtime normal turns require `DEEPSEEK_API_KEY`; tests use injected local async streams and make no provider calls.
- The current local safety lexicon is intentionally deterministic and conservative, but it is not clinical assessment and should be reviewed/expanded with domain experts before any broader use.
