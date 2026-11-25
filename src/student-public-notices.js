import { supabase } from './backend.js';
import { archiveRow, loadArchive } from './archive.js';

// Preserve reviewed excerpts for the guide. Fetch only new-format or staff-authored
// notices as a supplement to the existing public catalogue.
export async function publicNoticeRows() {
  const archive = await loadArchive();
  if (!supabase) return archive;
  const rows = new Map(archive.map(row => [String(row.id), row]));
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('notices').select('id,data')
      .eq('status', 'published')
      .or('data->>sourceArchiveId.is.null,data->>applyMode.eq.site,data->blocks.not.is.null')
      .order('id').range(from, from + 999);
    if (error) throw error;
    for (const { id, data: notice } of data) {
      const row = archiveRow(notice);
      const key = String(row.id || id);
      rows.set(key, { ...row, id: key, noticeId: id, staffAuthored: !row.id, applyMode: notice.applyMode,
        summary: notice.summary, blocks: notice.blocks,
        use: !row.id || notice.blocks?.length || notice.applyMode === 'site' ? '본문 발췌' : row.use });
    }
    if (data.length < 1000) return [...rows.values()];
  }
}
