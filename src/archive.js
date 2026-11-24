import excerpts from '../public/ai-excerpts.json' with { type: 'json' };

// Model callers receive only the reviewed excerpt for a known notice ID.
export function archiveAiInput(id) {
  return Object.hasOwn(excerpts, id) ? excerpts[id] : null;
}

export function archiveSearchText(notice) {
  return [notice.id, notice.title, notice.department, notice.category, archiveAiInput(notice.id) || ''].join(' ').toLowerCase();
}

// Same articleNo rule as gateway.js verifyGuideOwner: a published notice replaces its archive ID.
export function archiveNoticeId(id, notices) {
  return notices.find(n => n.sourceUrl?.match(/[?&]articleNo=(\d+)(?:&|$)/)?.[1] === id)?.id ?? id;
}

export function mergeGuestSaved(saved, ids, notices) {
  return [...new Set([...saved, ...(Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string').map(id => archiveNoticeId(id, notices))])];
}
