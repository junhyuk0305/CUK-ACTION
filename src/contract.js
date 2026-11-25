// Shared data contract for the manager and student sessions. See docs/CONTRACT.md.
// Do not edit during the night sessions. Request changes in the task log instead.
import { evaluate } from './logic.js';

export const APPLY_MODES = ['site', 'external'];
export const BLOCK_TYPES = ['heading', 'text', 'image'];
export const QUESTION_TYPES = ['profile', 'short', 'long', 'select'];
// Key order is the display order.
export const PROFILE_FIELDS = { name: '이름', studentNo: '학번', department: '학과', year: '학년', phone: '연락처' };
export const EVENT_TYPES = ['view', 'block', 'apply_start', 'question', 'submit'];
export const SOURCES = ['alert', 'kakao', 'browse', 'direct'];

const blank = value => value === undefined || value === null || (typeof value === 'string' && !value.trim());

export function applyMode(notice) {
  return notice?.applyMode || 'external';
}

export function isSchoolNotice(notice) {
  return Boolean(notice?.sourceArchiveId);
}

export function noticeBlocks(notice) {
  if (Array.isArray(notice?.blocks) && notice.blocks.length) return notice.blocks;
  if (typeof notice?.excerpt === 'string' && notice.excerpt.trim()) {
    return notice.excerpt.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      .map((text, i) => ({ id: `x${i + 1}`, type: 'text', text }));
  }
  if (typeof notice?.summary === 'string' && notice.summary.trim()) return [{ id: 's1', type: 'text', text: notice.summary }];
  return [];
}

// Same result as SQL public.notice_questions(data).
export function noticeQuestions(notice) {
  const questions = Array.isArray(notice?.questions) ? notice.questions : [];
  return questions.map((q, i) => q && typeof q === 'object' && !Array.isArray(q)
    ? { ...q, id: q.id ?? `q${i + 1}`, type: q.type ?? 'long', required: q.required ?? true }
    : q);
}

// verifiedIds: qualification ids the student has verified. An array or a Set.
export function ruleStatus(rule, profile, verifiedIds) {
  if (rule.field === 'custom') return Array.from(verifiedIds ?? []).includes(rule.value) ? 'pass' : 'unknown';
  return evaluate(rule, profile ?? {});
}

export function eligibility(notice, profile, verifiedIds) {
  const results = (notice?.rules ?? []).map(rule => ({ ...rule, status: ruleStatus(rule, profile, verifiedIds) }));
  const count = status => results.filter(r => r.status === status).length;
  return { results, pass: count('pass'), fail: count('fail'), unknown: count('unknown'), total: results.length };
}

export function needsOnboarding(profile) {
  return ['department', 'year', 'status'].some(field => blank(profile?.[field]));
}

// search: location.search or URLSearchParams. cameFromList: the student opened the detail from a list.
export function resolveSource(search, cameFromList) {
  const src = new URLSearchParams(search ?? '').get('src');
  return SOURCES.includes(src) ? src : cameFromList ? 'browse' : 'direct';
}
