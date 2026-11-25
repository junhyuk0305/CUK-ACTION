import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationValues, applicationClaims, applicationSnapshot, changedProfileFields, siteApplicationEntries } from './site-application.js';

const notice = { id: 'notice', applyMode: 'site', questions: [
  { id: 'dept', type: 'profile', profileField: 'department' }, { label: '지원 동기' },
] };
test('새 신청서는 프로필 값을 채우고 명시적으로 지운 초안 값도 보존한다', () => {
  const profile = { department: '경영학과', status: '재학' };
  assert.deepEqual(applicationValues(notice, profile).answers, { dept: '경영학과', q2: '' });
  const row = { answers: { dept: '기존 학과', q2: '제출한 답' }, profile_snapshot: { gpa: '3' } };
  const draft = { answers: { dept: '' }, profile: { department: '', gpa: '4.1' } };
  const values = applicationValues(notice, profile, row, draft);
  assert.deepEqual(values.answers, { dept: '', q2: '제출한 답' });
  assert.equal(values.profile.department, '');
  assert.equal(values.profile.gpa, '4.1');
  assert.deepEqual(changedProfileFields(profile, values.profile, draft.profile), ['department','gpa']);
});
test('제출 시점 프로필에는 약속한 여덟 필드만 담는다', () => {
  assert.deepEqual(applicationSnapshot({ name: '가상 학생', semester: '1', interests: ['장학'] }), {
    name: '가상 학생', studentNo: '', department: '', year: '', status: '', phone: '', gpa: '', residence: '',
  });
});
test('내 신청은 초안과 제출 기록을 공고별로 합치고 게시가 끝난 신청도 표시한다', () => {
  const rows = [{ notice_id: 'notice', status: 'submitted' }, { notice_id: 'ended', status: 'withdrawn' }];
  const entries = siteApplicationEntries([notice], { notice: { draft: { answers: {} } } }, rows);
  assert.deepEqual(entries, [
    { id: 'notice', notice, status: 'submitted' }, { id: 'ended', notice: undefined, status: 'withdrawn' },
  ]);
});

test('자기 신고에는 현재 공고의 선택한 미확인 자격만 한 번씩 들어간다', () => {
  const ids = ['new', 'pending', 'verified', 'rejected', 'new'];
  const rules = ids.map(value => ({ field: 'custom', value }));
  const qualifications = [{ qualification_id: 'pending', status: 'claimed' },
    { qualification_id: 'verified', status: 'verified' }, { qualification_id: 'rejected', status: 'rejected' }];
  const values = [...ids, 'removed'].map(id => ({ qualificationId: id, note: id + ' 설명' }));
  const select = fromDraft => applicationClaims(rules, values, qualifications, fromDraft).map(q => q.qualificationId);
  assert.deepEqual(select(false), ['new','pending']);
  assert.deepEqual(select(true), ['new','pending','rejected']);
  assert.deepEqual(applicationClaims(rules, [], qualifications, true), []);
});
