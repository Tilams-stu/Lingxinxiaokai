# Dialogue Stage Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make companion turns follow exploration, clarification, reflection, and explicitly requested micro-action stages instead of defaulting to long advice.

**Architecture:** A pure dialogue-policy module derives a stage from user-only history and the current message. `service.ts` consumes that policy to create Pi's dynamic system prompt; no Flask route, SQLite schema, model-provider boundary, or crisis path changes.

**Tech Stack:** TypeScript, Node test runner, Pi Agent Core, DeepSeek V4 Flash.

## Global Constraints

- `companion` only; `popsci` behavior must remain independent.
- High and imminent risk must still bypass the normal Agent.
- No new data persistence, external tools, or model Provider exposure.
- No diagnostic, score, or risk output in ordinary companion text.

---

### Task 1: Add a testable dialogue-policy module

**Files:**
- Create: `agent-service/src/dialogue.ts`
- Modify: `agent-service/src/service.ts`
- Modify: `agent-service/test/service.test.mjs`

**Interfaces:**
- Produces: `DialogueStage`, `CompanionDialoguePolicy`, `deriveCompanionDialoguePolicy(messages, input)`, and `buildAgentSystemPrompt(mode, policy?)`.
- Consumes: `ContextMessage` from `context.ts`.

- [ ] **Step 1: Write failing policy tests**

```js
assert.equal(serviceModule.deriveCompanionDialoguePolicy([], '最近很累').stage, 'explore');
assert.equal(serviceModule.deriveCompanionDialoguePolicy(historyOfTwoUsers, '还是睡不好').stage, 'clarify');
assert.equal(serviceModule.deriveCompanionDialoguePolicy([], '我该怎么办？').stage, 'micro_action');
```

- [ ] **Step 2: Run the Node test suite and verify the missing export fails**

Run: `npm.cmd test`

Expected: FAIL because `deriveCompanionDialoguePolicy` is absent.

- [ ] **Step 3: Implement the pure stage derivation and dynamic prompt builder**

```ts
export function deriveCompanionDialoguePolicy(messages: ContextMessage[], input: string): CompanionDialoguePolicy {
  const userTurns = messages.filter((message) => message.role === 'user').length + 1;
  if (asksForAdvice(input)) return { stage: 'micro_action', userTurns, allowsAdvice: true };
  if (userTurns < 3) return { stage: 'explore', userTurns, allowsAdvice: false };
  if (userTurns <= 5) return { stage: 'clarify', userTurns, allowsAdvice: false };
  return { stage: 'reflect', userTurns, allowsAdvice: false };
}
```

- [ ] **Step 4: Run the full Node suite and verify green**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 2: Wire policy into the Pi Agent and document testing

**Files:**
- Modify: `agent-service/src/service.ts`
- Modify: `docs/pi-agent-service.md`
- Test: `agent-service/test/service.test.mjs`

**Interfaces:**
- Consumes: `deriveCompanionDialoguePolicy` and `buildAgentSystemPrompt` from Task 1.
- Produces: the same SSE and result-event contract as before, with stage-constrained assistant behavior.

- [ ] **Step 1: Add a failing prompt-content test**

```js
const prompt = serviceModule.buildAgentSystemPrompt('companion', policy);
assert.match(prompt, /不要主动提供方法或清单/);
assert.match(prompt, /一个开放式问题/);
```

- [ ] **Step 2: Run test and verify the prompt lacks the stage contract**

Run: `npm.cmd test`

Expected: FAIL on required exploration/clarification wording.

- [ ] **Step 3: Pass the dynamic prompt to Pi and document expected manual tests**

```ts
const policy = request.mode === 'companion'
  ? deriveCompanionDialoguePolicy(request.messages ?? [], request.input)
  : undefined;
initialState: { systemPrompt: buildAgentSystemPrompt(request.mode, policy), ... }
```

- [ ] **Step 4: Run full test and health verification**

Run: `npm.cmd test; Invoke-WebRequest http://127.0.0.1:8787/health; Invoke-WebRequest http://127.0.0.1:5000/api/health`

Expected: tests pass and both health endpoints return HTTP 200.
