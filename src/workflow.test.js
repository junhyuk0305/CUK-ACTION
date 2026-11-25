import test from 'node:test';
import assert from 'node:assert/strict';
import {applicationOptions, deadlineState, deadlineText, requirementsKey, withSavedApplication, followupProgress, followupChanges, toggleFollowup, needsAttention, validateWorkflow} from './workflow.js';
import {createWorkflowTemplates, testStudentProfiles} from './workflow-fixtures.js';
import {conditions} from './logic.js';
import {createTestDatabase} from './test-fixtures.js';
import {setTestUser, testAccounts, saveNotice, loadStudentState, saveStudentState, recordActivity, getNoticeMetrics} from './gateway.js';

const anchor = '2026-11-10';
const templates = createWorkflowTemplates(anchor);
const bio = {...templates[0], id: 'bio'};
const dorm = {...templates[1], id: 'dorm'};

test('Korean deadline closes exactly at the specified minute; unknown and conflict stay unknown', () => {
  const n = {deadline: anchor, deadlineTime: '17:00'};
  assert.equal(deadlineState(n, new Date('2026-11-10T07:59:59Z')), 'open');
  assert.equal(deadlineState(n, new Date('2026-11-10T08:00:00Z')), 'closed');
  assert.equal(deadlineState({deadline: anchor}, new Date('2026-11-10T08:00:00Z')), 'unknown');
  assert.equal(deadlineState({deadline: anchor}, new Date('2026-11-10T15:00:00Z')), 'closed');
  assert.equal(deadlineState({deadline: anchor, deadlineStatus: 'conflict'}, new Date('2026-11-20')), 'unknown');
  assert.equal(deadlineText({}), '마감일 없음 · 원문 확인 필요');
  assert.equal(deadlineText({deadlineNote: '선착순'}), '마감일 없음 · 선착순');
  assert.equal(deadlineText({postedAt: '2026.02.27'}), '마감일 없음 · 2026.02.27 게시');
  assert.equal(deadlineText({deadlineNote: '선착순', postedAt: '2026.04.15'}), '마감일 없음 · 선착순 · 2026.04.15 게시');
});

test('two application options retain separate keys, paths and deadlines under one notice', () => {
  const [a, b] = applicationOptions(bio);
  assert.equal(a.id, 'bio::first'); assert.equal(b.id, 'bio::second');
  assert.equal(a.parentId, b.parentId); assert.notEqual(a.applicationUrl, b.applicationUrl);
  const now = new Date('2026-11-12T09:00:00+09:00');
  assert.equal(deadlineState(a, now), 'closed'); assert.equal(deadlineState(b, now), 'open');
  assert.equal(deadlineState(bio, now), 'open');
  assert.equal(deadlineState(bio, new Date('2026-11-19T09:00:00+09:00')), 'closed');
  const [ownSchedule] = applicationOptions({...bio, deadlineTime: '09:00', deadlineStatus: 'conflict', options: [{id: 'own', label: '별도 일정', deadline: anchor}]});
  assert.equal(ownSchedule.deadlineTime, '');
  assert.equal(ownSchedule.deadlineStatus, 'confirmed');
  assert.equal(deadlineState(ownSchedule, new Date('2026-11-10T10:00:00+09:00')), 'unknown');
});

test('changed deadline, rules and required documents retain drafts and require renewed acknowledgement', () => {
  const application = {noticeSnapshot: structuredClone(dorm), answers: {0: '보존할 작성본'}, checks: {0: true}};
  for (const patch of [{deadline: '2026-12-01'}, {deadlineTime: '17:00'}, {rules: []}, {tasks: [...dorm.tasks, '추가 증빙']}, {applicationUrl: 'https://example.org/new'}]) {
    const current = {...dorm, ...patch};
    const result = withSavedApplication(current, application);
    assert.equal(result.formChanged, true);
    assert.deepEqual(result.tasks, dorm.tasks); assert.equal(application.answers[0], '보존할 작성본');
    assert.notEqual(requirementsKey(current), requirementsKey(dorm));
  }
  assert.equal(withSavedApplication({...dorm, summary: '요약만 수정'}, application).formChanged, false);
});

test('follow-up dependencies, changed deadlines and completion cancellation invalidate dependent confirmations', () => {
  let app = {completed: false};
  assert.equal(followupProgress(dorm, app).rows[0].ready, false);
  app.completed = true;
  app.followupChecks = toggleFollowup(dorm, app, 'payment', true);
  assert.equal(followupProgress(dorm, app).done, 0);
  for (const id of ['accepted', 'room', 'payment']) app.followupChecks = toggleFollowup(dorm, app, id, true);
  assert.equal(followupProgress(dorm, app).done, 3); assert.equal(needsAttention(dorm, app), false);
  const changed = {...dorm, followupSteps: dorm.followupSteps.map(s => s.id === 'room' ? {...s, deadline: '2026-12-01'} : s)};
  assert.equal(followupProgress(changed, app).done, 1); assert.equal(needsAttention(changed, app), true);
  app.followupChecks = toggleFollowup(dorm, app, 'accepted', false);
  assert.deepEqual(app.followupChecks, {});
  assert.equal(followupProgress(dorm, {...app, completed: false}).done, 0);
});

test('four historical-source exercises and eight fake profiles do not invent eligibility', () => {
  assert.equal(templates.length, 4); assert.equal(testStudentProfiles.length, 8);
  for (const n of templates) {validateWorkflow(n); assert.equal(n.status, 'draft'); assert.equal(n.reviewed, false); assert.ok(n.testScenario);}
  const rule = {rules: [{field: 'gpa', op: 'min', value: 3}]};
  assert.equal(conditions(rule, testStudentProfiles[0].profile).unknown, 1);
  assert.equal(conditions(rule, testStudentProfiles[5].profile).pass, 1);
  assert.equal(conditions(rule, testStudentProfiles[6].profile).pass, 0);
  assert.equal(conditions(rule, testStudentProfiles[7].profile).unknown, 0);
  for (const profile of testStudentProfiles) assert.equal(conditions(bio, profile.profile).unknown, 1);
});

test('publication rejects malformed schedules, duplicate options and missing step dependencies', () => {
  for (const patch of [{deadline: '2026-02-31'}, {deadlineTime: '25:00'}, {deadlineStatus: 'maybe'}, {options: [bio.options[0], bio.options[0]]}, {options: [{...bio.options[0], applicationUrl: 'javascript:alert(1)'}]}, {followupSteps: [{...dorm.followupSteps[0], requires: 'later'}]}]) {
    assert.throws(() => validateWorkflow({...dorm, ...patch}));
  }
});

test('offline publication → independent preparations → parent deduplication → protected option and follow-up aggregates', async () => {
  const values = new Map([['cuk-action-test-v2', JSON.stringify(createTestDatabase(anchor))]]);
  globalThis.localStorage = {getItem: k => values.get(k), setItem: (k, v) => values.set(k, v)};
  const manager = testAccounts.find(u => u.id === 'test-manager-a');
  try {
    setTestUser(manager);
    const {id: ignoredBio, ...bioDraft} = bio, {id: ignoredDorm, ...dormDraft} = dorm;
    const postedBio = await saveNotice({...bioDraft, reviewed: true, status: 'published'});
    const postedDorm = await saveNotice({...dormDraft, reviewed: true, status: 'published'});
    const [first, second] = applicationOptions(postedBio);
    for (let i = 0; i < 5; i++) {
      const user = {id: 'workflow-student-' + i, role: 'student'}; setTestUser(user);
      let app = {completed: true, noticeSnapshot: postedDorm};
      for (const step of postedDorm.followupSteps) app.followupChecks = toggleFollowup(postedDorm, app, step.id, true);
      await saveStudentState(user.id, {applications: {[first.id]: {answers: {0: '1기 작성본'}, completed: true}, [second.id]: {answers: {0: '2기 작성본'}, completed: false}, [postedDorm.id]: app}});
      const restored = (await loadStudentState(user.id)).data;
      assert.equal(restored.applications[first.id].answers[0], '1기 작성본');
      assert.equal(restored.applications[second.id].completed, false);
      for (const n of [first, second]) for (const type of ['view', 'view', 'start', 'link']) await recordActivity(postedBio.id, type, n.optionId);
      await recordActivity(postedBio.id, 'complete', first.optionId);
      await assert.rejects(() => getNoticeMetrics(postedBio.id, anchor, anchor), /담당자/);
    }
    setTestUser(manager);
    // Activity timestamps are real local test execution time; use their exact Korean day.
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    const metrics = await getNoticeMetrics(postedBio.id, today, today);
    assert.equal(metrics.counts.view, 5); assert.equal(metrics.counts.complete, 5);
    assert.deepEqual(metrics.optionCounts.map(o => o.counts.view), [5, 5]);
    assert.deepEqual(metrics.optionCounts.map(o => o.counts.complete), [5, 0]);
    // The manager's own test exercise must not inflate student follow-up counts.
    await saveStudentState(manager.id, JSON.parse(values.get('cuk-action-test-v2')).students['workflow-student-0']);
    const followups = await getNoticeMetrics(postedDorm.id, today, today);
    assert.deepEqual(followups.followupCounts.map(s => s.count), [5, 5, 5]);
    assert.ok(!JSON.stringify(followups).includes('작성본'));
    const data = JSON.parse(values.get('cuk-action-test-v2'));
    delete data.students['workflow-student-4']; values.set('cuk-action-test-v2', JSON.stringify(data));
    assert.deepEqual((await getNoticeMetrics(postedDorm.id, today, today)).followupCounts.map(s => s.count), [null, null, null]);
    setTestUser(testAccounts.find(u => u.id === 'test-manager-b'));
    await assert.rejects(() => getNoticeMetrics(postedBio.id, today, today), /관리할 수 없는/);
  } finally {setTestUser(null); delete globalThis.localStorage;}
});

test('follow-up changes produce one event per changed step, including dependents cleared by a prerequisite', () => {
  const n = {followupSteps: [{id: 'a', label: 'A', evidence: 'e'}, {id: 'b', label: 'B', evidence: 'e', requires: 'a'}, {id: 'c', label: 'C', evidence: 'e', requires: 'b'}]};
  let app = {completed: true};
  const step = (id, on) => {const next = {...app, followupChecks: toggleFollowup(n, app, id, on)}; const changes = followupChanges(n, app, next); app = next; return changes;};
  assert.deepEqual(step('b', true), []);
  assert.deepEqual(step('a', true), [{stepId: 'a', checked: true}]);
  assert.deepEqual(step('b', true), [{stepId: 'b', checked: true}]);
  assert.deepEqual(step('c', true), [{stepId: 'c', checked: true}]);
  assert.deepEqual(step('a', false), [{stepId: 'a', checked: false}, {stepId: 'b', checked: false}, {stepId: 'c', checked: false}]);
  step('a', true);
  // Cancelling the completion report clears every checked step at once.
  assert.deepEqual(followupChanges(n, app, {...app, completed: false, followupChecks: {}}), [{stepId: 'a', checked: false}]);
  assert.deepEqual(followupChanges({}, app, app), []);
});

test('live notice publication applies workflow validation before reaching the server', async () => {
  setTestUser(null);
  const valid = {...bio, reviewed: true, status: 'published'};
  await assert.rejects(() => saveNotice({...valid, options: [{...bio.options[0], applicationUrl: 'http://insecure.example'}]}), /신청 항목의 이름, 마감 근거와 HTTPS 경로/);
  await assert.rejects(() => saveNotice({...valid, followupSteps: [{id: 'x', label: 'X', evidence: 'e', requires: 'missing'}]}), /후속 절차의 이름, 근거와 선행 단계/);
  await assert.rejects(() => saveNotice({...valid, deadlineTime: '25:00'}), /마감 날짜와 시각/);
  // Valid workflow and drafts pass to the live backend, which is not configured in Node.
  await assert.rejects(() => saveNotice(valid), /계정 서버가 연결되지 않았습니다/);
  await assert.rejects(() => saveNotice({...valid, status: 'draft', options: [{id: ''}]}), /계정 서버가 연결되지 않았습니다/);
});

test('a site notice ignores the saved snapshot, so label edits after publishing do not show the form change box', () => {
  const saved = {id: 's1', applyMode: 'site', questions: [{id: 'q1', type: 'short', label: '학점', max: 10, required: true}], tasks: []};
  const edited = {...saved, questions: [{...saved.questions[0], label: '직전 학기 학점'}]};
  const result = withSavedApplication(edited, {noticeSnapshot: saved});
  assert.equal(result, edited);
  assert.equal(result.formChanged, undefined);
});
