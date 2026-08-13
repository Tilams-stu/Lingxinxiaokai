import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRisk, crisisResources } from '../dist/safety.js';

test('classifyRisk raises imminent risk for an explicit current self-harm intention', () => {
  assert.equal(classifyRisk('我现在就想自杀，已经准备好了').level, 'imminent');
});

test('classifyRisk raises high risk for self-harm ideation without imminent intent', () => {
  assert.equal(classifyRisk('我最近反复想自杀，但没有准备行动').level, 'high');
});

test('classifyRisk marks ordinary distress as concern', () => {
  assert.equal(classifyRisk('今天很焦虑，睡不好，想找人说说').level, 'concern');
});

test('classifyRisk maps explicit current self-harm intention with a plan or means to imminent', () => {
  assert.equal(classifyRisk('我现在想自杀，药已经放在面前了').level, 'imminent');
});

test('crisisResources returns fixed immediate-support resources for elevated risk', () => {
  const resources = crisisResources('imminent').join('\n');
  assert.match(resources, /120.*110/);
  assert.match(resources, /12356/);
  assert.match(resources, /学校心理中心/);
});
test('classifyRisk keeps explicit current intent without a plan at high, not imminent', () => {
  assert.equal(classifyRisk('\u6211\u73b0\u5728\u60f3\u81ea\u6740\uff0c\u4f46\u8fd8\u6ca1\u6709\u8ba1\u5212').level, 'high');
});
