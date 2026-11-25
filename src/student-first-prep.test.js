import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as workflow from './workflow.js';
import {deadlineText} from './workflow.js';

const call = name => (...a) => workflow[name](...a);
const preparationCount = call('preparationCount'), startTab = call('startTab'), archiveNotice = call('archiveNotice'), unknownDeadlineNote = call('unknownDeadlineNote');
const main = readFileSync(new URL('./main.jsx', import.meta.url), 'utf8');

test('PS-05/FR-07: preparation counts tasks and questions; start opens writing first when questions exist', () => {
  assert.equal(preparationCount({tasks: [], questions: []}), 0);
  assert.equal(preparationCount({tasks: ['a', 'b'], questions: [{label: 'q'}]}), 3);
  assert.equal(startTab({tasks: ['a'], questions: [{label: 'q'}]}), 'write');
  assert.equal(startTab({tasks: ['a'], questions: []}), 'prepare');
});

test('PS-05/FR-07: cards show the preparation count and notices without preparation link to the source instead of starting', () => {
  const preparationLabel = call('preparationLabel');
  assert.equal(preparationLabel({tasks: ['a', 'b'], questions: [{label: 'q'}]}), '체크 2 · 작성 1');
  assert.equal(preparationLabel({tasks: ['a', 'b'], questions: []}), '체크 2');
  assert.equal(preparationLabel({tasks: [], questions: [{label: 'q'}]}), '작성 1');
  assert.equal(preparationLabel({tasks: [], questions: []}), '원문에서 신청');
  assert.match(main, /<span>\{preparationLabel\(n\)\}<\/span>/);
  assert.match(main, /function start\(n,nextTab=startTab\(n\)\)/);
  assert.match(main, /const noPreparation=!!notice&&!hasApplication&&!preparationCount\(notice\)/);
  assert.match(main, /noPreparation\?<a className="button primary" href=\{safeLink\(notice\.applicationUrl\|\|notice\.sourceUrl\)\}[^]*?>원문에서 신청<ExternalLink/);
});

test('FR-01/D4: an archive item links to the published copy with the same sourceArchiveId', () => {
  const notices = [{id: 'u1', sourceArchiveId: '100'}, {id: 'u2', sourceArchiveId: '200', unpublished: true}];
  assert.equal(archiveNotice('100', notices).id, 'u1');
  assert.equal(archiveNotice('200', notices), undefined);
  assert.equal(archiveNotice('300', notices), undefined);
  assert.match(main, /archiveTarget&&<button className="button primary" data-open=\{archiveTarget\.id\} onClick=\{\(\)=>open\(archiveTarget\)\}>이 공고 준비하기/);
});

test('FR-06/QE-25: the detail interest button targets the same parent notice as the list card', () => {
  assert.match(main, /const interestTarget=notice\?\.parentId\?notices\.find\(n=>n\.id===notice\.parentId\)\|\|notice:notice/);
  assert.match(main, /onClick=\{\(\)=>save\(interestTarget\)\}><Bookmark size=\{17\} fill=\{isSavedNotice\(interestTarget,state\.saved\)/);
});

test('PS-13: the home list heading does not claim profile matching', () => {
  assert.doesNotMatch(main, /<h2>나에게 맞는 공고<\/h2>/);
});

test('PS-10: the home hero does not ask to check zero remaining items', () => {
  assert.match(main, /remaining>0\?`남은 준비 \$\{remaining\}개를 확인하고 이어서 준비하세요\.`:'남은 준비가 없습니다\. 제출 후 제출 완료를 표시하세요\.'/);
});

test('PS-14: a deadline today without a time is not called unconfirmed', () => {
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(new Date());
  assert.equal(workflow.deadlineState({deadline: today}), 'unknown');
  assert.match(deadlineText({deadline: today}), /시각 확인 필요/);
  assert.equal(unknownDeadlineNote({deadline: today}), '오늘 마감입니다. 마감 시각은 원문에서 확인하세요.');
  assert.match(unknownDeadlineNote({deadline: today, deadlineStatus: 'conflict'}), /마감이 확정되지 않았습니다/);
  assert.match(unknownDeadlineNote({}), /마감일이 없는 공고입니다/);
  assert.match(main, /deadlineState\(notice\)==='unknown'&&<div className='warning'>\{unknownDeadlineNote\(notice\)\}<\/div>/);
});

test('PS-11: the interest toast changes to a finished message when the save lands', () => {
  assert.match(main, /if\(saveStatus==='saved'\)\{if\(done\)\{setToast\(t=>t===owner\.text\?done:t\)/);
});

test('PS-12: home counts are not zero-padded', () => {
  assert.doesNotMatch(main, /padStart\(2,'0'\)/);
});

test('QE-26: a second interest click on the same notice waits for the first', () => {
  const save = main.slice(main.indexOf('async function save(n)'), main.indexOf('function followLink'));
  assert.match(save, /if\(interestBusy\.current\.has\(n\.id\)\)return;interestBusy\.current\.add\(n\.id\);/);
  assert.match(save, /finally\{interestBusy\.current\.delete\(n\.id\);\}/);
});

test('QE-27: a detail left open after its notice is unpublished cannot start a new application', () => {
  assert.match(main, /const notice=selected\?\(notices\.find\(n=>n\.id===selected\.id\)\|\|\{\.\.\.selected,unpublished:noticesReady\}\):null/);
});

test('FR-06/QE-25: a session id saved earlier counts for the parent, and unsaving the parent removes both', () => {
  const isSavedNotice = call('isSavedNotice'), toggleSaved = call('toggleSaved');
  const parent = {id: 'bio', options: [{id: '1'}, {id: '2'}]};
  assert.equal(isSavedNotice(parent, ['bio::1']), true);
  assert.equal(isSavedNotice(parent, ['other', 'bio2']), false);
  assert.deepEqual(toggleSaved(['x', 'bio::1', 'bio'], parent), ['x']);
  assert.deepEqual(toggleSaved(['x'], parent), ['x', 'bio']);
  assert.deepEqual(toggleSaved(['bio::1', 'bio::2'], {id: 'bio::1'}), ['bio::2']);
});

test('PS-11: completion messages are kept per notice and only replace that notice\'s own toast', () => {
  assert.match(main, /interestDone=useRef\(new Map\(\)\)/);
  assert.match(main, /setToast\(t=>t===owner\.text\?done:t\)/);
});

test('FRW-1: a manager in the student view sees a sidebar return button named for where it goes', () => {
  assert.match(main, /const managerBackLabel=managerReturn\?'공고 집계로':'담당자 대시보드로';/);
  assert.match(main, /<button className='nav-bottom' onClick=\{\(\)=>navigate\('manager','overview'\)\}><BarChart3 size=\{18\}\/>\{managerBackLabel\}<\/button>/);
});

test('FRW-3: archive rows with a published copy say they can be prepared in the app', () => {
  assert.match(main, /\{excerpt&&archiveNotice\(r\.id,notices\)&&<> · <b>앱에서 준비 가능<\/b><\/>\}/);
});

test('FRW-4: starting a new application shows a toast', () => {
  const start = main.slice(main.indexOf('function start(n'), main.indexOf('function updateApp'));
  assert.match(start, /if\(!state\.applications\[n\.id\]\)setToast\('내 신청에 추가했습니다\.'\);setTab\(nextTab\);/);
});

test('FRW-5: notifications show the notice loading status next to existing alarms, not a second failure banner', () => {
  assert.match(main, /\{alarms\.length>0&&noticeLoad==='loading'&&<LoadState state=\{noticeLoad\}\/>\}\{alarms\.length\?/);
});
