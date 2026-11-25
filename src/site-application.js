import { noticeQuestions, PROFILE_FIELDS } from './contract.js';

export const profileLabels = { ...PROFILE_FIELDS, status: '재학 상태', gpa: '평균 학점', residence: '거주 개월', semester: '학기' };
const snapshotFields = ['name', 'studentNo', 'department', 'year', 'status', 'phone', 'gpa', 'residence'];

export function applicationValues(notice, profile, row, draft) {
  const effective = { ...profile, ...row?.profile_snapshot, ...draft?.profile };
  const saved = { ...row?.answers, ...draft?.answers };
  const answers = {};
  for (const q of noticeQuestions(notice)) {
    answers[q.id] = String(saved[q.id] ?? (q.type === 'profile' ? effective[q.profileField] ?? '' : ''));
    if (q.type === 'profile') effective[q.profileField] = answers[q.id];
  }
  return { profile: effective, answers, claims: draft?.claims ?? row?.claims ?? [] };
}

export function applicationSnapshot(profile) {
  return Object.fromEntries(snapshotFields.map(field => [field, profile[field] ?? '']));
}

export function changedProfileFields(profile, effective, edited) {
  return Object.keys(edited ?? {}).filter(field => Object.hasOwn(profileLabels, field)
    && String(profile[field] ?? '') !== String(effective[field] ?? ''));
}

export function ruleFields(rule) {
  if (rule.field === 'cu12Course') return rule.value === 'home' ? [] : ['year', 'semester'];
  return Object.hasOwn(profileLabels, rule.field) ? [rule.field] : [];
}

export function siteApplicationEntries(notices, localApplications, rows) {
  const byId = new Map(notices.filter(n => n.applyMode === 'site' && !n.parentId).map(n => [n.id, n]));
  const entries = new Map();
  for (const [id, notice] of byId) {
    if (localApplications[id]?.draft) entries.set(id, { id, notice, status: 'draft' });
  }
  for (const row of rows) entries.set(row.notice_id, { id: row.notice_id, notice: byId.get(row.notice_id), status: row.status });
  return [...entries.values()];
}

export function applicationClaims(rules, values, qualifications, fromDraft) {
  const allowed = new Set(rules.filter(rule => rule.field === 'custom').map(rule => rule.value));
  for (const item of qualifications) {
    if (item.status === 'verified' || item.status === 'rejected' && !fromDraft) allowed.delete(item.qualification_id);
  }
  const claims = [];
  for (const value of values) {
    if (allowed.delete(value.qualificationId)) claims.push({ qualificationId: value.qualificationId, note: value.note ?? '' });
  }
  return claims;
}
