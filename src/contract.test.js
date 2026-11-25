import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMode, isSchoolNotice, noticeBlocks, noticeQuestions, ruleStatus, eligibility, needsOnboarding, resolveSource, PROFILE_FIELDS } from './contract.js';
import { conditions, evaluate } from './logic.js';
import { notices } from './data.js';

test('old questions get q1, q2, long and required; questions with ids stay as they are', () => {
  const typed = { id: 'q-b2', type: 'short', label: '지원 분야', max: 100, required: false };
  assert.deepEqual(noticeQuestions({ questions: [{ label: '지원 동기', max: 1000 }, typed, { label: '계획', max: 500 }] }), [
    { id: 'q1', type: 'long', required: true, label: '지원 동기', max: 1000 },
    typed,
    { id: 'q3', type: 'long', required: true, label: '계획', max: 500 },
  ]);
  assert.deepEqual(noticeQuestions({}), []);
});

test('blocks are used as they are, excerpt lines become x1.., otherwise one s1 summary block', () => {
  const blocks = [{ id: 'b-1', type: 'heading', text: '모집 대상' }];
  assert.equal(noticeBlocks({ blocks, excerpt: '무시', summary: '무시' }), blocks);
  assert.deepEqual(noticeBlocks({ blocks: [], excerpt: '첫 줄\n\n  \r\n둘째 줄', summary: '요약' }), [
    { id: 'x1', type: 'text', text: '첫 줄' },
    { id: 'x2', type: 'text', text: '둘째 줄' },
  ]);
  assert.deepEqual(noticeBlocks({ excerpt: '', summary: '요약 문장' }), [{ id: 's1', type: 'text', text: '요약 문장' }]);
});

test('custom condition passes only for a verified qualification and never fails', () => {
  const rule = { field: 'custom', op: 'eq', value: 'qual-1', label: '봉사 30시간', evidence: '담당자 확인' };
  assert.equal(ruleStatus(rule, {}, ['qual-1']), 'pass');
  assert.equal(ruleStatus(rule, {}, new Set(['qual-1'])), 'pass');
  assert.equal(ruleStatus(rule, {}, ['qual-2']), 'unknown');
  assert.equal(ruleStatus(rule, {}, undefined), 'unknown');
});

test('eligibility matches logic.js for the existing condition types and counts fail', () => {
  const profiles = [{}, { status: '재학', year: '3', department: '경영학과', gpa: '3.5', residence: '24' }, { status: '휴학', year: '1', gpa: '2.0', residence: '3' }];
  for (const notice of notices) for (const profile of profiles) {
    const result = eligibility(notice, profile, []);
    const base = conditions(notice, profile);
    assert.deepEqual(result.results, base.results);
    assert.equal(result.pass, base.pass);
    assert.equal(result.unknown, base.unknown);
    assert.equal(result.total, base.total);
    assert.equal(result.fail, notice.rules.filter(r => evaluate(r, profile) === 'fail').length);
  }
  const mixed = eligibility({ rules: [{ field: 'status', op: 'eq', value: '재학' }, { field: 'custom', op: 'eq', value: 'q' }] }, { status: '휴학' }, []);
  assert.deepEqual([mixed.pass, mixed.fail, mixed.unknown, mixed.total], [0, 1, 1, 2]);
});

test('onboarding is needed when department, year or status is empty', () => {
  assert.equal(needsOnboarding({ department: '경영학과', year: '2', status: '재학' }), false);
  assert.equal(needsOnboarding({ department: '경영학과', year: '2', status: ' ' }), true);
  assert.equal(needsOnboarding({ department: '경영학과', status: '재학' }), true);
  assert.equal(needsOnboarding(undefined), true);
});

test('resolveSource keeps the four known values and drops unknown ones', () => {
  assert.equal(resolveSource('?src=alert', false), 'alert');
  assert.equal(resolveSource('?src=kakao', true), 'kakao');
  assert.equal(resolveSource('?src=evil', true), 'browse');
  assert.equal(resolveSource('?src=evil', false), 'direct');
  assert.equal(resolveSource('', false), 'direct');
});

test('apply mode defaults to external and school notices have an archive id', () => {
  assert.equal(applyMode({}), 'external');
  assert.equal(applyMode({ applyMode: 'site' }), 'site');
  assert.equal(isSchoolNotice({ sourceArchiveId: '277842' }), true);
  assert.equal(isSchoolNotice({}), false);
  assert.deepEqual(Object.keys(PROFILE_FIELDS), ['name', 'studentNo', 'department', 'year', 'phone']);
});
