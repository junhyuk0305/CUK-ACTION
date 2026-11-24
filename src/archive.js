import { supabase } from './backend.js';
import { DEMO } from './demo.js';

// Published notices from the Supabase notices table, shaped as the public catalogue rows.
// Filled by loadArchive(); model callers receive only the reviewed excerpt for a known notice ID.
let excerpts = {};
let loading = null;

export function archiveRow(data) {
  return { id: data.sourceArchiveId, title: data.title, department: data.department, category: data.category, date: data.postedAt || '', url: data.sourceUrl, use: data.excerpt ? '본문 발췌' : '원문 안내', excerpt: data.excerpt || '' };
}

async function readRows() {
  if (!supabase) return DEMO ? (await import('./archive-fixture.js')).default : [];
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('notices').select('data').eq('status', 'published').not('data->>sourceArchiveId', 'is', null).range(from, from + 999);
    if (error) throw error;
    rows.push(...data.map(r => archiveRow(r.data)));
    if (data.length < 1000) return rows;
  }
}

export function loadArchive() {
  loading ??= readRows().then(rows => {
    excerpts = Object.fromEntries(rows.filter(r => r.excerpt).map(r => [r.id, r.excerpt]));
    return rows;
  }, error => { loading = null; throw error; });
  return loading;
}

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
