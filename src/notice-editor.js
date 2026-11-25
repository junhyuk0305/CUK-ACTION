// Pure helpers for the notice editor: the editor's view of a notice, new blocks and questions, and readiness checks.
import {PROFILE_FIELDS, noticeBlocks, noticeQuestions} from './contract.js';

export const BLOCK_LIMIT = 60;
export const BLOCK_TEXT_MAX = 2000;
export const QUESTION_LABELS = {profile: '기본 정보', short: '단답', long: '서술형', select: '선택형'};
export const MAX_LIMIT = {short: 200, long: 10000};

export const newBlock = type => type === 'image' ? {id: crypto.randomUUID(), type, src: '', alt: ''} : {id: crypto.randomUUID(), type, text: ''};
export const newQuestion = () => ({id: crypto.randomUUID(), type: 'long', label: '', hint: '', max: 1000, required: true});

// Keeps id, label, hint and required. Drops the fields of the previous type and sets defaults for the new one.
export function withType(question, type) {
  const {max, options, profileField, ...rest} = question;
  if (type === 'short' || type === 'long') return {...rest, type, max: Number.isInteger(max) ? Math.min(max, MAX_LIMIT[type]) : type === 'short' ? 100 : 1000};
  if (type === 'select') return {...rest, type, options: Array.isArray(options) ? options : []};
  const field = profileField || 'name';
  return {...rest, type, profileField: field, label: rest.label?.trim() ? rest.label : PROFILE_FIELDS[field]};
}

export const move = (list, index, delta) => {
  const next = [...list], [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item);
  return next;
};

// A notice without blocks starts from its excerpt lines (ids x1, x2...), so events recorded for those ids keep matching.
// The summary fallback (s1) is not copied because the summary field already holds that text.
function editorBlocks(notice) {
  if (Array.isArray(notice.blocks) && notice.blocks.length) return notice.blocks;
  return typeof notice.excerpt === 'string' && notice.excerpt.trim() ? noticeBlocks(notice) : [];
}
const cleanQuestion = q => q.type === 'select' && Array.isArray(q.options) ? {...q, options: q.options.map(o => String(o).trim()).filter(Boolean)} : q;

// Opening and saving both pass through this, so a saved notice reopens with the same values.
// Every question gets id, type and required written in. applyMode is left as stored; a missing value reads as external.
export function editorNotice(notice) {
  return {...notice, blocks: editorBlocks(notice), questions: noticeQuestions(notice).map(cleanQuestion)};
}

export const blockReady = block => block.type === 'image' ? !!(block.src && block.alt?.trim()) : !!block.text?.trim() && block.text.length <= BLOCK_TEXT_MAX;

export function questionReady(q) {
  if (!q.label?.trim()) return false;
  if (q.type === 'short' || q.type === 'long') return Number.isInteger(q.max) && q.max >= 1 && q.max <= MAX_LIMIT[q.type];
  if (q.type === 'select') {const count = (q.options || []).filter(o => String(o).trim()).length; return count >= 2 && count <= 20;}
  return Object.hasOwn(PROFILE_FIELDS, q.profileField);
}

// A custom rule is filled once a qualification is picked; the picker only offers ids from the qualifications table.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ruleReady(rule) {
  if (!rule.label?.trim() || !rule.evidence?.trim()) return false;
  if (rule.field === 'custom') return rule.op === 'eq' && UUID.test(String(rule.value));
  return Array.isArray(rule.value) ? rule.value.length > 0 : !!String(rule.value).trim();
}

// A list step (conditions, questions) is done when every row is filled.
// An empty list may be intended, so it counts as done only after the manager checks the review box.
export const listStepDone = (rows, ready, reviewed) => rows.length ? rows.every(ready) : !!reviewed;
