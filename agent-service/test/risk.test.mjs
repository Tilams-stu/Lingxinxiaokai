import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRisk, crisisResources } from '../dist/safety.js';

test('classifyRisk raises imminent risk for an explicit current self-harm intention', () => {
  assert.equal(classifyRisk('我现在就想自杀，已经准备好了').level, 'imminent');
});

test('classifyRisk raises high risk for self-harm ideation without imminent intent', () => {
  assert.equal(classifyRisk('我最近反复想自杀，但没有准备行动').level, 'high');
});

test('classifyRisk keeps ordinary distress at low risk', () => {
  assert.equal(classifyRisk('今天很焦虑，睡不好，想找人说说').level, 'low');
});

test('crisisResources returns fixed immediate-support resources for elevated risk', () => {
  assert.deepEqual(crisisResources('imminent'), [
    '如有立即危险，请立刻拨打当地急救电话 120 或报警电话 110，或前往最近急诊。',
    '请尽量不要独处，联系一位可信任的人陪伴你，并移开可能伤害自己的物品。'
  ]);
});
