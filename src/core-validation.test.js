import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate} from './logic.js';
import {applicationOptions, requirementsKey, withSavedApplication, deadlineState, validateWorkflow} from './workflow.js';
import {createCoreValidationTemplates} from './core-validation-fixtures.js';
import {createWorkflowTemplates} from './workflow-fixtures.js';
import {createTestDatabase, koreanDate} from './test-fixtures.js';
import {setTestUser, testAccounts, saveNotice, loadStudentState, saveStudentState, recordActivity, getNoticeMetrics, listPublishedNotices} from './gateway.js';

// Public part of the core validation. The goldset judgments and source hash checks
// live in core-validation.source.test.js, which reads review material kept out of this repository.
const sources = [...createWorkflowTemplates('2026-11-11'), ...createCoreValidationTemplates('2026-11-11')];

test('CU12 selection adds to parent rules, rejects bad institutions and flags changed requirements', () => {
  const template = {...createCoreValidationTemplates('2026-11-11')[0], id: 'cu12'};
  validateWorkflow(template);
  for (const option of applicationOptions(template)) assert.equal(option.rules.length, template.rules.length + 1);
  assert.equal(evaluate({field: 'gpa', op: 'min', value: 3}, {gpa: 0}), 'fail');
  for (const semester of ['', '3', ' ', null]) assert.equal(evaluate({field: 'cu12Course', op: 'eq', value: 'other'}, {year: '4', semester}), 'unknown');
  assert.equal(evaluate({field: 'cu12Course', op: 'eq', value: 'bad'}, {}), 'unknown');
  assert.throws(() => validateWorkflow({...template, options: [{...template.options[0], cu12Institution: 'bad'}]}), /CU12/);
  assert.equal(deadlineState({deadline: '2026-11-10'}, new Date('2026-11-11T00:00:00+09:00')), 'closed');
  const [original] = applicationOptions(template);
  const [changed] = applicationOptions({...template, options: [{...template.options[0], cu12Institution: 'other'}]});
  const app = {noticeSnapshot: original, answers: {0: '기존 작성본'}, checks: {0: true}};
  assert.notEqual(requirementsKey(original), requirementsKey(changed));
  assert.equal(withSavedApplication(changed, app).formChanged, true);
  assert.equal(app.answers[0], '기존 작성본');
});

test('all source types: offline preparation, failed save, restoration, aggregation and archive preserve drafts', async () => {
  const values = new Map([['cuk-action-test-v2', JSON.stringify(createTestDatabase('2026-11-11'))]]);
  let fail = false;
  globalThis.localStorage = {getItem: k => values.get(k), setItem: (k, v) => {if (fail) throw Error('quota'); values.set(k, v);}};
  const manager = testAccounts.find(u => u.id === 'test-manager-a');
  try {
    assert.equal(sources.length, 6);
    for (const n of sources) {
      setTestUser(manager);
      const posted = await saveNotice({...createCoreValidationTemplates('2026-11-11')[0], options: [],
        title: '[가상 저장 검사] ' + n.title, sourceUrl: n.sourceUrl, rules: n.rules,
        questions: [{label: '가상 작성 문항', max: 100, hint: '첨부에서 추출한 문항 아님'}], reviewed: true, status: 'published'});
      for (let i = 0; i < 5; i++) {
        const id = 'core-student-' + i;
        setTestUser({id, role: 'student'});
        const row = await loadStudentState(id), before = row?.data || {applications: {}, saved: []};
        const state = {...before, saved: [...before.saved, posted.id], applications: {...before.applications,
          [posted.id]: {answers: {0: '학생이 직접 쓴 가상 답변'}, checks: {0: true}, noticeSnapshot: posted, completed: true}}};
        const version = await saveStudentState(id, state, row?.version ?? null);
        await assert.rejects(saveStudentState(id, {...state, saved: []}, row?.version ?? null), e => e.code === 'conflict');
        fail = true;
        await assert.rejects(saveStudentState(id, {...state, saved: []}, version), /저장하지 못했습니다/);
        fail = false;
        assert.deepEqual((await loadStudentState(id)).data, state);
        for (const type of ['view', 'view', 'interest', 'start', 'link', 'complete']) await recordActivity(posted.id, type);
      }
      setTestUser(manager);
      const result = await getNoticeMetrics(posted.id, koreanDate(), koreanDate());
      assert.deepEqual(result.counts, {view: 5, interest: 5, start: 5, link: 5, complete: 5});
      assert.ok(!JSON.stringify(result).includes('가상 답변'));
      await saveNotice({...posted, status: 'archived'});
      setTestUser({id: 'core-student-0', role: 'student'});
      assert.ok(!(await listPublishedNotices()).some(row => row.id === posted.id));
      assert.equal((await loadStudentState('core-student-0')).data.applications[posted.id].answers[0], '학생이 직접 쓴 가상 답변');
      await assert.rejects(recordActivity(posted.id, 'start'), /게시된 공고가 아닙니다/);
    }
  } finally {setTestUser(null); delete globalThis.localStorage;}
});
