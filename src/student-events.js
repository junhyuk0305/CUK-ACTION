import { supabase } from './backend.js';

export function eventArgs(id, type, { source, blockId, questionId, optionId } = {}) {
  return { p_notice_id: id, p_type: type, p_source: source ?? null, p_block_id: blockId ?? null,
    p_question_id: questionId ?? null, ...(type === 'view' && optionId ? { p_option_id: optionId } : {}) };
}

// Tracking is best effort. A rejected event must not interrupt navigation or writing.
export async function recordStudentEvent(id, type, detail) {
  if (!id || !supabase) return false;
  try {
    const { error } = await supabase.rpc('record_event', eventArgs(id, type, detail));
    return !error;
  } catch { return false; }
}

export async function publicEventNoticeId(row) {
  if (row.noticeId) return row.noticeId;
  const { data, error } = await supabase.from('notices').select('id')
    .eq('status', 'published').eq('data->>sourceArchiveId', row.id).limit(1).maybeSingle();
  return error ? null : data?.id;
}

const transferKey = 'cuk-public-view-transfer';
export function rememberPublicView(userId, noticeId) {
  try { sessionStorage.setItem(transferKey, JSON.stringify({ userId, noticeId, at: Date.now() })); } catch {}
}
export function takePublicView(userId, noticeId) {
  try {
    const item = JSON.parse(sessionStorage.getItem(transferKey));
    sessionStorage.removeItem(transferKey);
    return item?.userId === userId && item.noticeId === noticeId && Date.now() - item.at < 60000;
  } catch { return false; }
}
