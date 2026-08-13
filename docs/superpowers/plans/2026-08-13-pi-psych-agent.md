# Pi Lightweight Mental Support Agent Implementation Plan

**Goal:** Add a loopback Node Pi agent service, safe passive conversation observation, persisted Pi-style context checkpoints, and matching legacy chat UI updates.

## Global Constraints

- Local experimental system only; never present an LLM observation as a diagnosis or formal scale.
- Flask is the only public server and SQLite is the only durable store.
- Node exposes only loopback endpoints and must not expose model credentials to browsers.
- Use `deepseek-v4-flash` through Pi's model composition boundary, with no CLI, Bash, file, network-search, or database tools.
- Context is token based: `reserveTokens=16384`, `keepRecentTokens=20000`; do not limit by message count.
- Safety rules may only raise risk and `high`/`imminent` risk bypasses the normal agent loop.

### Task 1: Agent service foundation

Create the TypeScript Node service with Pi model composition, deterministic risk policy, local knowledge/support tools, token-based `SessionContextManager`, JSON request-response and internal SSE endpoints. Add Node tests for model resolution, risk, tool boundaries, and context compaction.

### Task 2: Flask persistence and gateway

Add snapshot/checkpoint schema, atomic persistence, context retrieval, session lock, `/api/assessment`, and an internal Node gateway. Replace client-provided chat histories with a single message and retire the old emotion endpoint. Add Flask regression tests.

### Task 3: Legacy chat interface

Update companion to a state-review dialog, update popsci with source rows, remove ECharts and old emotion actions, and render in-chat crisis/error states. Preserve the existing visual language and test browser-facing request contracts.

### Task 4: Integration, documentation, and verification

Wire environment configuration, document local run instructions and safety limits, then run backend, Node, TypeScript, and frontend verification suites.
