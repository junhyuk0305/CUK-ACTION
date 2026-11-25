import test from 'node:test';
import assert from 'node:assert/strict';
import {blockRows, combineNotices, questionRows, stageRows} from './funnel.js';

const site = {
  applyMode: 'site', summary: '요약',
  blocks: [
    {id: 'b-1', type: 'heading', text: '모집 대상'},
    {id: 'b-2', type: 'text', text: '본교 3~4학년 재학생을 모집합니다. 지원서는 이 사이트에서 제출합니다. 마감 후에는 받지 않습니다.'},
    {id: 'b-3', type: 'image', src: 'https://x.supabase.co/storage/v1/object/public/notice-images/a.png', alt: '활동 일정표'},
    {id: 'b-4', type: 'text', text: '문의는 학생지원팀으로 합니다.'},
  ],
  questions: [
    {id: 'q-a1', type: 'profile', label: '이름', profileField: 'name', required: true},
    {id: 'q-b2', type: 'short', label: '지원 분야', max: 100, required: true},
    {id: 'q-c3', type: 'long', label: '지원 동기', max: 1000, required: true},
  ],
};

test('site stages follow view, apply_start, question, submit with conversion', () => {
  const rows = stageRows(site, {view: 20, apply_start: 10, question: null, submit: 6, start: 0, link: 0, complete: 0});
  assert.deepEqual(rows.map(row => [row.key, row.count, row.rate]), [
    ['view', 20, null], ['apply_start', 10, 50], ['question', null, 'hidden'], ['submit', 6, 'hidden'],
  ]);
});

test('external stages follow view, start, link, complete and a zero stage has no rate', () => {
  const rows = stageRows({}, {view: 0, start: 0, link: 5, complete: 5});
  assert.deepEqual(rows.map(row => [row.key, row.count, row.rate]), [['view', 0, null], ['start', 0, null], ['link', 5, null], ['complete', 5, 100]]);
});

test('block rows use notice order, text start or alt, and mark the largest drop', () => {
  const {rows, deleted, dropIndex} = blockRows(site, {'b-1': 30, 'b-2': 25, 'b-3': 10, 'b-4': null});
  assert.deepEqual(rows.map(row => [row.id, row.count]), [['b-1', 30], ['b-2', 25], ['b-3', 10], ['b-4', null]]);
  assert.equal(rows[1].label, '본교 3~4학년 재학생을 모집합니다. 지원서는 이 사이트에서 제출합니다.…');
  assert.equal(rows[0].label, '모집 대상');
  assert.equal(blockRows({blocks: [{id: 'i', type: 'image', src: 'x', alt: '가'.repeat(50)}]}).rows[0].label, '가'.repeat(40) + '…');
  assert.equal(rows[2].label, '활동 일정표');
  assert.equal(dropIndex, 2);
  assert.equal(deleted, null);
});

test('blocks missing from the aggregate count 0 and ids only in the aggregate are grouped as deleted', () => {
  const {rows, deleted} = blockRows(site, {'b-1': 8, 'old-1': 6, 'old-2': null, 'old-3': 9});
  assert.deepEqual(rows.map(row => row.count), [8, 0, 0, 0]);
  assert.deepEqual(deleted, {blocks: 3, count: 9});
  assert.deepEqual(blockRows(site, {'old-1': null}).deleted, {blocks: 1, count: null});
});

test('blocks fall back to noticeBlocks for notices without blocks', () => {
  const {rows} = blockRows({excerpt: '첫 줄\n둘째 줄'}, {x1: 5});
  assert.deepEqual(rows.map(row => [row.id, row.label, row.count]), [['x1', '첫 줄', 5], ['x2', '둘째 줄', 0]]);
});

test('question rows use noticeQuestions labels and mark the largest drop', () => {
  const {rows, dropIndex} = questionRows(site, {'q-a1': 12, 'q-b2': 11, 'q-c3': 5});
  assert.deepEqual(rows.map(row => [row.label, row.count]), [['이름', 12], ['지원 분야', 11], ['지원 동기', 5]]);
  assert.equal(dropIndex, 2);
  assert.equal(questionRows({questions: [{label: '동기', max: 100}]}, {}).rows[0].id, 'q1');
  assert.equal(questionRows(site, {'q-a1': 5, 'q-b2': 5, 'q-c3': 6}).dropIndex, null);
});

test('combined notices sum per-notice counts and count hidden notices', () => {
  const combined = combineNotices([{counts: {view: 10, start: null}}, {counts: {view: 7, start: 5}}, {counts: {view: null, start: 0}}], ['view', 'start']);
  assert.deepEqual(combined, {counts: {view: 17, start: 5}, hidden: {view: 1, start: 1}});
});
