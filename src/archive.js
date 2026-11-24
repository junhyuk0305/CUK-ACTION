import excerpts from '../public/ai-excerpts.json' with { type: 'json' };

// Model callers receive only the reviewed excerpt for a known notice ID.
export function archiveAiInput(id) {
  return Object.hasOwn(excerpts, id) ? excerpts[id] : null;
}

export function archiveSearchText(notice) {
  return [notice.id, notice.title, notice.department, notice.category, archiveAiInput(notice.id) || ''].join(' ').toLowerCase();
}
