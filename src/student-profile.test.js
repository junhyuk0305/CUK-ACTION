import test from 'node:test';
import assert from 'node:assert/strict';
import { needsOnboarding } from './contract.js';
import { savedProfile } from './student-profile.js';

const ready = { department: '사회학과', year: '2', status: '재학' };
test('a returning student must fill each missing required field before continuing', () => {
  assert.equal(needsOnboarding(ready), false);
  for (const field of ['department','year','status']) {
    for (const blank of ['', '  ', null, undefined]) assert.equal(needsOnboarding({ ...ready, [field]:blank }), true);
  }
});
test('deferring optional information keeps saved values and stores the three required fields', () => {
  const old = { name:'기존 별명', phone:'', interests:['교류'] };
  const edited = { ...old, ...ready, department:' 사회학과 ', name:'작성 중', phone:'010-0000-0000' };
  assert.deepEqual(savedProfile(old, edited, true), { ...old, ...ready });
  assert.equal(savedProfile(old, edited).phone, '010-0000-0000');
});
