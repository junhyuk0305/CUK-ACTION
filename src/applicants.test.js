import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibility} from './contract.js';
import {answerRows, applicantRow, claimRows, profileRows, qualificationIds, ruleRows, submittedText} from './applicants.js';

const notice = {
  applyMode: 'site', title: '학생 프로젝트 모집',
  rules: [
    {field: 'status', op: 'eq', value: '재학', label: '재학생', evidence: ''},
    {field: 'year', op: 'min', value: 3, label: '3학년 이상', evidence: ''},
    {field: 'custom', op: 'eq', value: 'qual-1', label: '봉사 30시간 이상', evidence: ''},
  ],
  questions: [
    {id: 'q-a1', type: 'profile', label: '이름', profileField: 'name', required: true},
    {id: 'q-b2', type: 'long', label: '지원 동기', max: 1000, required: true},
    {id: 'q-c3', type: 'select', label: '희망 기수', options: ['1기', '2기'], required: false},
  ],
};
const profile = {name: '김학생', studentNo: '202612345', department: '컴퓨터정보공학부', year: 2, status: '재학', phone: '010-0000-0000'};
const application = {
  id: 'app-1', user_id: 'student-1', status: 'submitted', submitted_at: '2026-11-26T01:05:00Z',
  answers: {'q-a1': '김학생', 'q-b2': '참여하고 싶습니다.'},
  profile_snapshot: profile, eligibility: eligibility(notice, profile, []),
  claims: [{qualificationId: 'qual-1', note: '봉사 확인서 있음'}, {qualificationId: 'qual-gone', note: ''}],
};
const studentQualifications = [{user_id: 'student-1', qualification_id: 'qual-1', status: 'claimed', application_id: 'app-1'}];
const qualifications = [{id: 'qual-1', name: '봉사 30시간'}];

test('applicant row shows the snapshot, m/n and a fail mark', () => {
  assert.deepEqual(applicantRow(application), {
    id: 'app-1', name: '김학생', studentNo: '202612345', department: '컴퓨터정보공학부', year: '2',
    eligibility: '1/3', failed: true, submitted: '2026-11-26 10:05', status: '제출', withdrawn: false,
  });
  const passing = applicantRow({...application, status: 'withdrawn', eligibility: {pass: 2, fail: 0, unknown: 1, total: 3}});
  assert.equal(passing.failed, false);
  assert.equal(passing.withdrawn, true);
  assert.equal(passing.status, '취소');
});

test('applicant row reads empty snapshot and eligibility', () => {
  const row = applicantRow({id: 'a', status: 'submitted', profile_snapshot: {}, eligibility: {}});
  assert.equal(row.name, '미입력');
  assert.equal(row.eligibility, '지원 조건 없음');
  assert.equal(row.failed, false);
});

test('answers follow the notice questions by id', () => {
  assert.deepEqual(answerRows(application, notice), [
    {id: 'q-a1', label: '이름', answer: '김학생'},
    {id: 'q-b2', label: '지원 동기', answer: '참여하고 싶습니다.'},
    {id: 'q-c3', label: '희망 기수', answer: '미입력'},
  ]);
  // Old questions without ids get q1, q2 from noticeQuestions.
  assert.deepEqual(answerRows({answers: {q1: '답'}}, {questions: [{label: '동기', max: 100}]}), [{id: 'q1', label: '동기', answer: '답'}]);
});

test('profile rows list every snapshot field', () => {
  const rows = profileRows(application);
  assert.deepEqual(rows.map(r => r.label), ['이름', '학번', '학과', '학년', '연락처', '재학 상태', '평균 학점', '거주 개월']);
  assert.equal(rows.find(r => r.field === 'gpa').value, '미입력');
});

test('rule rows pair each result with the snapshot value', () => {
  assert.deepEqual(ruleRows(application, studentQualifications), [
    {label: '재학생', status: 'pass', statusLabel: '충족', value: '재학'},
    {label: '3학년 이상', status: 'fail', statusLabel: '미충족', value: '2'},
    {label: '봉사 30시간 이상', status: 'unknown', statusLabel: '확인 필요', value: '신고 확인 대기'},
  ]);
  assert.equal(ruleRows(application, [])[2].value, '신고 없음');
});

test('claim rows join names and statuses', () => {
  assert.deepEqual(claimRows(application, studentQualifications, qualifications), [
    {qualificationId: 'qual-1', name: '봉사 30시간', note: '봉사 확인서 있음', status: '확인 대기', state: 'claimed'},
    {qualificationId: 'qual-gone', name: '삭제된 자격', note: '', status: '신고 없음', state: null},
  ]);
  // Another student's row for the same qualification is not this applicant's claim.
  assert.equal(claimRows(application, [{...studentQualifications[0], user_id: 'student-2', status: 'verified'}], qualifications)[0].status, '신고 없음');
  assert.deepEqual(qualificationIds([application, {...application, claims: [{qualificationId: 'qual-1'}]}]), ['qual-1', 'qual-gone']);
});

test('submitted time is Korea time', () => {
  assert.equal(submittedText('2026-11-25T15:30:00Z'), '2026-11-26 00:30');
  assert.equal(submittedText(null), '');
});
