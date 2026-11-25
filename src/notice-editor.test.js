import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMode, noticeQuestions} from './contract.js';
import {blockReady, editorNotice, listStepDone, move, newBlock, newQuestion, questionReady, ruleReady, withType} from './notice-editor.js';

const siteNotice = {
  applyMode: 'site', title: '학생 프로젝트 모집', department: '학생처', summary: '요약', sourceUrl: '', tasks: [], rules: [], status: 'draft',
  blocks: [{id: 'b-1', type: 'heading', text: '모집 대상'}, {id: 'b-2', type: 'text', text: '3~4학년 재학생'}],
  questions: [
    {id: 'q-a1', type: 'profile', label: '이름', hint: '', profileField: 'name', required: true},
    {id: 'q-b2', type: 'short', label: '지원 분야', hint: '한 줄', max: 100, required: true},
    {id: 'q-c3', type: 'long', label: '지원 동기', hint: '', max: 1000, required: false},
    {id: 'q-d4', type: 'select', label: '희망 기수', hint: '', options: ['1기', '2기'], required: false},
  ],
};

test('a new-shape notice saves and reopens with the same values', () => {
  const saved = editorNotice(siteNotice);
  assert.deepEqual(saved, siteNotice);
  // The database stores JSON; reopening the stored copy gives the same editor values.
  assert.deepEqual(editorNotice(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(saved.applyMode, 'site');
  for (const q of saved.questions) assert.ok(typeof q.id === 'string' && q.id && typeof q.type === 'string' && typeof q.required === 'boolean');
});

test('old questions get id, type and required written in, and keep the shape the form lock compares', () => {
  const old = {title: '옛 공고', summary: '요약', questions: [{label: '지원 동기', max: 1000}, {label: '계획', hint: '', max: 500}]};
  const saved = editorNotice(old);
  assert.deepEqual(saved.questions, [
    {id: 'q1', type: 'long', required: true, label: '지원 동기', max: 1000},
    {id: 'q2', type: 'long', required: true, label: '계획', hint: '', max: 500},
  ]);
  assert.deepEqual(noticeQuestions(saved), noticeQuestions(old));
  assert.equal('applyMode' in saved, false);
  assert.equal(applyMode(saved), 'external');
  assert.deepEqual(editorNotice(saved), saved);
});

test('a notice without blocks starts from excerpt lines and otherwise starts empty', () => {
  assert.deepEqual(editorNotice({summary: '요약', excerpt: '첫 줄\n\n둘째 줄'}).blocks, [{id: 'x1', type: 'text', text: '첫 줄'}, {id: 'x2', type: 'text', text: '둘째 줄'}]);
  assert.deepEqual(editorNotice({summary: '요약'}).blocks, []);
  const saved = editorNotice({summary: '요약', excerpt: '첫 줄'});
  assert.deepEqual(editorNotice(saved), saved);
});

test('block and question ids are set once and survive edits and reordering', () => {
  const [a, b] = [newBlock('heading'), newBlock('text')];
  assert.notEqual(a.id, b.id);
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  const edited = {...a, text: '모집 대상'};
  assert.equal(edited.id, a.id);
  assert.deepEqual(move([a, b], 1, -1).map(x => x.id), [b.id, a.id]);
  const q = newQuestion();
  assert.equal(q.type, 'long');
  assert.equal(q.required, true);
  assert.equal(withType(q, 'select').id, q.id);
});

test('changing the type drops the old type fields and sets defaults', () => {
  const long = {id: 'q-1', type: 'long', label: '동기', hint: '', max: 1000, required: true};
  assert.deepEqual(withType(long, 'short'), {id: 'q-1', type: 'short', label: '동기', hint: '', max: 200, required: true});
  assert.deepEqual(withType(long, 'select'), {id: 'q-1', type: 'select', label: '동기', hint: '', options: [], required: true});
  assert.deepEqual(withType({...long, label: ''}, 'profile'), {id: 'q-1', type: 'profile', label: '이름', hint: '', profileField: 'name', required: true});
  assert.equal(withType({id: 'q-2', type: 'select', label: 'x', options: ['a', 'b'], required: true}, 'long').max, 1000);
});

test('select options are trimmed and blank lines dropped on save', () => {
  const saved = editorNotice({...siteNotice, questions: [{id: 'q-d4', type: 'select', label: '기수', options: [' 1기', '', '2기 ', ''], required: true}]});
  assert.deepEqual(saved.questions[0].options, ['1기', '2기']);
  assert.deepEqual(editorNotice(saved), saved);
});

test('readiness checks follow the publish limits', () => {
  assert.equal(questionReady({type: 'short', label: 'a', max: 200}), true);
  assert.equal(questionReady({type: 'short', label: 'a', max: 201}), false);
  assert.equal(questionReady({type: 'long', label: 'a', max: 10000}), true);
  assert.equal(questionReady({type: 'long', label: 'a', max: ''}), false);
  assert.equal(questionReady({type: 'select', label: 'a', options: ['1기', ' ']}), false);
  assert.equal(questionReady({type: 'select', label: 'a', options: ['1기', '2기']}), true);
  assert.equal(questionReady({type: 'profile', label: 'a', profileField: 'phone'}), true);
  assert.equal(questionReady({type: 'profile', label: 'a', profileField: 'gpa'}), false);
  assert.equal(questionReady({type: 'long', label: ' ', max: 10}), false);
  assert.equal(blockReady({type: 'text', text: '글'}), true);
  assert.equal(blockReady({type: 'text', text: ' '}), false);
  assert.equal(blockReady({type: 'heading', text: 'x'.repeat(2001)}), false);
});

test('a custom rule is filled only with a qualification id', () => {
  const rule = {field: 'custom', op: 'eq', value: '', label: '봉사 30시간 이상', evidence: '봉사 확인서 제출자'};
  assert.equal(ruleReady(rule), false);
  assert.equal(ruleReady({...rule, value: '봉사'}), false);
  assert.equal(ruleReady({...rule, value: '5f0c2a9e-1b3d-4c7a-9e2f-0a1b2c3d4e5f'}), true);
  assert.equal(ruleReady({...rule, value: '5f0c2a9e-1b3d-4c7a-9e2f-0a1b2c3d4e5f', evidence: ' '}), false);
  assert.equal(ruleReady({field: 'status', op: 'eq', value: '재학', label: '재학생', evidence: '재학생'}), true);
  assert.equal(ruleReady({field: 'year', op: 'in', value: [], label: '학년', evidence: '학년'}), false);
});

test('an empty condition or question step is not done until the review box is checked', () => {
  assert.equal(listStepDone([], ruleReady, false), false);
  assert.equal(listStepDone([], ruleReady, true), true);
  assert.equal(listStepDone([{field: 'status', op: 'eq', value: '재학', label: '재학생', evidence: '원문'}], ruleReady, false), true);
  assert.equal(listStepDone([{field: 'status', op: 'eq', value: '', label: '', evidence: ''}], ruleReady, true), false);
});
