import test from 'node:test';
import assert from 'node:assert/strict';
import {recordEvents} from './useStudentState.js';

// Same shape as backend.js failure(): the PostgREST error rides on cause.
// Messages are the raise texts of record_activity and record_followup (202611240003, 202611240004).
const messages = {'42501': '게시된 공고가 아닙니다.', P0001: '신청 항목이 변경됐습니다. 공고를 다시 확인하세요.', '': 'TypeError: Failed to fetch'};
const serverError = (code, message = messages[code]) => new Error('활동 기록 저장에 실패했습니다. 연결과 로그인 상태를 확인해 주세요.', {cause: {code, message}});
const events = ids => ids.map(id => ({id, notice: 'n-' + id, type: 'view'}));

test('a server-rejected event (unpublished notice) does not block later events', async () => {
  const sent = [], recorded = new Set();
  const record = async notice => { sent.push(notice); if (notice === 'n-A') throw serverError('42501'); };
  await recordEvents(events(['A', 'F']), recorded, record);
  assert.deepEqual(sent, ['n-A', 'n-F']);
  assert.deepEqual([...recorded], ['A', 'F']);
  // The next flush does not resend the rejected event.
  await recordEvents(events(['A', 'F']), recorded, record);
  assert.deepEqual(sent, ['n-A', 'n-F']);
});

test('a validation rejection (changed option or step) is dropped the same way', async () => {
  const sent = [], recorded = new Set();
  await recordEvents(events(['A', 'B']), recorded, async notice => { sent.push(notice); if (notice === 'n-A') throw serverError('P0001'); });
  assert.deepEqual(sent, ['n-A', 'n-B']);
  assert.ok(recorded.has('B'));
});

test('a 42501 for a missing login or function permission stops and keeps the event (N-1)', async () => {
  for (const message of ['로그인이 필요합니다.', 'permission denied for function record_activity']) {
    const sent = [], recorded = new Set();
    await assert.rejects(recordEvents(events(['A', 'F']), recorded, async notice => { sent.push(notice); throw serverError('42501', message); }));
    assert.deepEqual(sent, ['n-A'], message);
    assert.equal(recorded.size, 0, message);
  }
});

test('a network failure stops and keeps the event for retry', async () => {
  const sent = [], recorded = new Set();
  const offline = async notice => { sent.push(notice); throw serverError(''); };
  await assert.rejects(recordEvents(events(['A', 'F']), recorded, offline));
  assert.deepEqual(sent, ['n-A']);
  assert.equal(recorded.size, 0);
  await recordEvents(events(['A', 'F']), recorded, async notice => { sent.push(notice); });
  assert.deepEqual(sent, ['n-A', 'n-A', 'n-F']);
});
