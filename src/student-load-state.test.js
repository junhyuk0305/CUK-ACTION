import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as workflow from './workflow.js';
const withEndedApplications = (...a) => workflow.withEndedApplications(...a), endedSavedIds = (...a) => workflow.endedSavedIds(...a);

const main = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');
const campus = readFileSync(new URL('./campus.jsx', import.meta.url), 'utf8');
const snapshot = {id: 'gone', title: '지난 공고', rules: [], tasks: [], questions: []};
const applications = {gone: {noticeSnapshot: snapshot, checks: {}, answers: {}}};

test('QE-10: an application is marked unpublished only after the notice list has loaded', () => {
  const pending = withEndedApplications([], applications, false).find(n => n.id === 'gone');
  assert.equal(pending.unpublished, undefined);
  // QA B-1: until the list arrives a copy is marked pending so home and browse leave it out.
  assert.equal(pending.pendingSnapshot, true);
  assert.equal(withEndedApplications([], applications, true).find(n => n.id === 'gone').pendingSnapshot, undefined);
  assert.equal(withEndedApplications([], applications, true).find(n => n.id === 'gone').unpublished, true);
  assert.equal(withEndedApplications([{...snapshot}], applications, true).filter(n => n.id === 'gone').length, 1);
});

test('QE-10: home, explore and saved lists hold the empty message while notices load or fail', () => {
  assert.match(main, /noticeLoad=noticesReady\?'ready':noticeError\?'error':'loading'/);
  assert.match(main, /noticeLoad!=='ready'\?<LoadState state=\{noticeLoad\}[^>]*onRetry=\{refreshNotices\}\/>:!filtered\.length&&<Empty/);
  assert.match(main, /listLoad!=='ready'\?<LoadState state=\{listLoad\}/);
  assert.match(main, /demo:!!n\?\.isDemo\|\|noticesReady&&/);
  assert.match(main, /\(page==='saved'\|\|\(!n\.unpublished&&!n\.pendingSnapshot&&/);
  assert.match(main, /<h2>교내 공고<\/h2>\{noticeLoad==='ready'&&<span className="count">\{filtered\.length\}<\/span>\}/);
});

test('QE-11: saved ids missing from both lists are reported only when both lists loaded', () => {
  const notices = [{id: 'a'}], archive = [{id: '100'}];
  assert.deepEqual(endedSavedIds(['a', '100', 'gone'], notices, archive), ['gone']);
  assert.deepEqual(endedSavedIds(['gone'], null, archive), []);
  assert.deepEqual(endedSavedIds(['gone'], notices, null), []);
  assert.match(main, /endedSaved\.map\(id=><article[^]*?onClick=\{\(\)=>save\(\{id\}\)\}>관심 해제/);
});

test('QE-03: saved and notification pages show archive loading and failure instead of an empty result', () => {
  assert.match(main, /archiveLoad=archive\?'ready':archiveError\?'error':'loading'/);
  // QA B-2: the archive failure shows next to preparation reminders, not only when there are none.
  assert.match(main, /카카오톡 발송은 연결되지 않았습니다\.<\/div>[^]*?\{archiveLoad!=='ready'&&<LoadState state=\{archiveLoad\} what="보관함 공고" onRetry=\{fetchArchive\}\/>\}[^]*?\{alarms\.length\?/);
});

test('QE-14: a failed guide read still saves the interest', () => {
  const save = main.slice(main.indexOf('async function save(n)'), main.indexOf('function followLink'));
  assert.doesNotMatch(save, /catch\(e\)\{setToast\(e\.message\);return;\}/);
  assert.match(save, /catch\{interestNotice\(n\.id,'관심 공고를 저장 중입니다\. 일정 안내는 불러오지 못했습니다\.'\);/);
});

test('QE-15: guide failures use their own state and retry, not the notice list error', () => {
  const effect = main.slice(main.indexOf("if(page==='notifications'&&archive)"), main.indexOf('async function save(n)'));
  assert.doesNotMatch(effect, /setNoticeError/);
  assert.match(effect, /setGuideError\(/);
  assert.match(main, /guideError&&<div role="alert" className="warning">\{guideError\}<button className="text-button" onClick=\{\(\)=>setGuideAttempt/);
});

test('QE-12: a failed guide read on the public home does not report the saved interest as failed', () => {
  const toggle = campus.slice(campus.indexOf('async function toggle(id)'), campus.indexOf('const rows=data?.rows'));
  assert.match(toggle, /catch \{setStorageError\('관심 공고에 저장했습니다\. 일정 안내는 불러오지 못했습니다\.'\);\}/);
  assert.match(toggle, /catch \{setStorageError\('저장하지 못했습니다\. 브라우저 저장 공간을 확인하세요\.'\);return;\}/);
});

test('QE-29: the account archive search shows its result count', () => {
  assert.match(main, /query&&archive&&<span aria-live="polite">검색 결과 \{archiveMatches\.length\.toLocaleString\(\)\}건<\/span>/);
});
