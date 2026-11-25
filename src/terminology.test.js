// S2 bundle 9: D8 terms, plain manager words, no internal ID, archive counts from data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {archiveSummary} from './archive.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const screens = ['main.jsx', 'Manager.jsx', 'ManagerOverview.jsx', 'WorkflowFields.jsx', 'FollowupSteps.jsx', 'campus.jsx'];
const all = screens.map(read).join('\n');

test('FR-10 and 02 table: old names for the same thing are gone from screen copy', () => {
  const old = ['자기보고', '통합 집계 분모', '고유 사용자', '고유 학생', '분모', '통합 현황', '담당자 홈', '담당 공고 한눈에 보기', '담당 공고 관리', '나의 담당 공고', '담당 공고 목록',
    '신청 링크 이동', '링크 이동', '프로필 수정', '내 프로필 설정', '내 조건 설정', '정보 수정', "'직접 작성'", '지원서 직접 작성', '직접 작성 문항', '작성하기',
    '공고 둘러보기', '전체 보기', '관심 있는 기회', '공고 목록에서 관리'];
  for (const word of old) assert.ok(!all.includes(word), word);
  assert.doesNotMatch(all, /(?<!제출 )완료 표시/);
});

test('D8 names are used on student and manager screens', () => {
  const main = read('main.jsx'), manager = read('Manager.jsx') + read('ManagerOverview.jsx');
  for (const word of ["'제출 완료 표시'", "'지원서 작성'", "'제출 준비'", '지원 조건 {c.pass}/{c.total} 충족', "'프로필 설정'", '담당자 대시보드']) assert.ok(main.includes(word), word);
  for (const word of ['학생이 표시한 제출 완료', '신청 경로 이동', '담당자 대시보드', '기준 인원']) assert.ok(manager.includes(word), word);
});

test('LC-11: per-notice metrics do not show the notice UUID', () => {
  assert.ok(!read('Manager.jsx').includes('공고 ID {notice.id}'));
});

test('QE-21 = LG-06: archive counts and date come from the published list', () => {
  assert.deepEqual(archiveSummary([]), {total: 0, excerpts: 0, latest: ''});
  assert.deepEqual(archiveSummary([
    {date: '2026.11.02', excerpt: 'E'}, {date: '2026.11.20', excerpt: ''}, {date: '2026.10.31', excerpt: 'F'}, {date: '', excerpt: ''},
  ]), {total: 4, excerpts: 2, latest: '2026.11.20'});
  const fixed = /297건|375건|672건|11월 16일|2026\.11\.16/;
  assert.doesNotMatch(read('main.jsx') + read('campus.jsx'), fixed);
  assert.doesNotMatch(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /297건|375건|672건/);
});
