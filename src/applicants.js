// Display rows for the applicant table and applicant detail. Data comes from applications rows; see docs/CONTRACT.md section 4.
import {PROFILE_FIELDS, noticeQuestions} from './contract.js';

export const APPLICATION_STATUS = {submitted: '제출', withdrawn: '취소'};
export const RULE_STATUS = {pass: '충족', fail: '미충족', unknown: '확인 필요'};
export const CLAIM_STATUS = {claimed: '확인 대기', verified: '확인 완료', rejected: '반려'};
// Every profile_snapshot field, in display order.
export const SNAPSHOT_FIELDS = {...PROFILE_FIELDS, status: '재학 상태', gpa: '평균 학점', residence: '거주 개월'};

const blank = value => value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length);
const text = value => blank(value) ? '미입력' : Array.isArray(value) ? value.join(', ') : String(value);
const seoulTime = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
export const submittedText = iso => {
  if (!iso) return '';
  const part = Object.fromEntries(seoulTime.formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
};

export function applicantRow(application) {
  const p = application.profile_snapshot || {}, e = application.eligibility || {};
  return {
    id: application.id, name: text(p.name), studentNo: text(p.studentNo), department: text(p.department), year: text(p.year),
    eligibility: e.total ? `${e.pass ?? 0}/${e.total}` : '지원 조건 없음', failed: (e.fail ?? 0) > 0,
    submitted: submittedText(application.submitted_at), status: APPLICATION_STATUS[application.status] || application.status,
    withdrawn: application.status === 'withdrawn',
  };
}

export function answerRows(application, notice) {
  const answers = application.answers || {};
  return noticeQuestions(notice).map(q => ({id: q.id, label: q.label, answer: text(answers[q.id])}));
}

export function profileRows(application) {
  const p = application.profile_snapshot || {};
  return Object.entries(SNAPSHOT_FIELDS).map(([field, label]) => ({field, label, value: text(p[field])}));
}

// The student's claim on one qualification, read from student_qualifications rows of this applicant.
const claimRow = (application, qualificationId, studentQualifications) =>
  studentQualifications.find(r => r.user_id === application.user_id && r.qualification_id === qualificationId);
const claimStatus = (application, qualificationId, studentQualifications) => {
  const row = claimRow(application, qualificationId, studentQualifications);
  return row ? CLAIM_STATUS[row.status] || row.status : '신고 없음';
};

// Current claim status for a custom rule. The submission-time result can still say 확인 필요.
const claimValue = (application, qualificationId, studentQualifications) => {
  const row = claimRow(application, qualificationId, studentQualifications);
  return row ? `신고 ${CLAIM_STATUS[row.status] || row.status}` : '신고 없음';
};

// Result at submission time and the snapshot value it was judged on.
export function ruleRows(application, studentQualifications = []) {
  const p = application.profile_snapshot || {};
  return (application.eligibility?.results || []).map(rule => ({
    label: rule.label || SNAPSHOT_FIELDS[rule.field] || rule.field,
    status: rule.status, statusLabel: RULE_STATUS[rule.status] || rule.status,
    value: rule.field === 'custom' ? claimValue(application, rule.value, studentQualifications)
      : rule.field === 'manual' ? '담당자 확인' : text(p[rule.field]),
  }));
}

const qualificationName = (id, qualifications) => qualifications.find(q => q.id === id)?.name || '삭제된 자격';

export function claimRows(application, studentQualifications = [], qualifications = []) {
  return (application.claims || []).map(claim => ({
    qualificationId: claim.qualificationId, name: qualificationName(claim.qualificationId, qualifications),
    note: claim.note || '', status: claimStatus(application, claim.qualificationId, studentQualifications),
    state: claimRow(application, claim.qualificationId, studentQualifications)?.status || null,
  }));
}

// Qualification ids named by claims, for one name lookup.
export function qualificationIds(applications) {
  return [...new Set(applications.flatMap(a => (a.claims || []).map(c => c.qualificationId)).filter(Boolean))];
}
