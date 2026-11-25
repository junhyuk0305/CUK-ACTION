// Rows for the per-notice funnel screen and the combined overview. Counts come from notice_funnel
// and manager_overview. null means 1~4 students and is hidden.
import {applyMode, noticeBlocks, noticeQuestions} from './contract.js';

export const SOURCE_LABELS = [['alert', '자격 알림'], ['kakao', '카카오 안내'], ['browse', '목록에서 열기'], ['direct', '주소로 바로 열기']];
const STAGES = {
  site: [['view', '상세 조회'], ['apply_start', '신청서 열기'], ['question', '문항 작성'], ['submit', '신청서 제출']],
  external: [['view', '상세 조회'], ['start', '준비 시작'], ['link', '신청 경로 이동'], ['complete', '학생이 표시한 제출 완료']],
};
const known = value => value !== null && value !== undefined;
// A missing key means no events (0). A null value means hidden.
const countOf = (counts, id) => id in counts ? counts[id] : 0;

// rate: number (percent of the previous stage), 'hidden' when either count is hidden, null when there is nothing to compare.
export function stageRows(notice, stages = {}) {
  return STAGES[applyMode(notice)].map(([key, label], index, list) => {
    const count = countOf(stages, key), previous = index ? countOf(stages, list[index - 1][0]) : null;
    const rate = index === 0 ? null : !known(count) || !known(previous) ? 'hidden' : previous > 0 ? Math.round(count / previous * 100) : null;
    return {key, label, count, rate};
  });
}

// Index of the row with the largest fall from the row before it. Hidden counts are skipped.
function largestDrop(rows) {
  let best = null, drop = 0;
  rows.forEach((row, index) => {
    const previous = rows[index - 1];
    if (index && known(row.count) && known(previous.count) && previous.count - row.count > drop) {best = index; drop = previous.count - row.count;}
  });
  return best;
}

const shortLabel = text => {const value = String(text || ''); return value.length > 40 ? value.slice(0, 40).trimEnd() + '…' : value;};

// Deleted blocks show the largest single-block count, because students are not unique across blocks.
// With a view count the rows start with the title: every student who opened the detail reached it, 0 included.
export function blockRows(notice, counts = {}, view) {
  const blocks = noticeBlocks(notice);
  const rows = blocks.map(block => ({id: block.id, label: shortLabel(block.type === 'image' ? block.alt || '이미지' : block.text), count: countOf(counts, block.id)}));
  if (view !== undefined) rows.unshift({id: 'title', label: '제목 (상세를 연 학생)', count: view, title: true});
  const current = new Set(blocks.map(block => block.id));
  const deletedCounts = Object.entries(counts).filter(([id]) => !current.has(id)).map(([, count]) => count);
  const visible = deletedCounts.filter(known);
  const deleted = deletedCounts.length ? {blocks: deletedCounts.length, count: visible.length ? Math.max(...visible) : null} : null;
  return {rows, deleted, dropIndex: largestDrop(rows)};
}

export function questionRows(notice, counts = {}) {
  const rows = noticeQuestions(notice).map(question => ({id: question.id, label: question.label || '제목 없는 문항', count: countOf(counts, question.id)}));
  return {rows, dropIndex: largestDrop(rows)};
}

// Sum of per-notice unique counts. One student who acted on two notices is counted twice.
export function combineNotices(rows, keys) {
  const counts = {}, hidden = {};
  for (const key of keys) {
    counts[key] = rows.reduce((sum, row) => sum + (known(row.counts?.[key]) ? row.counts[key] : 0), 0);
    hidden[key] = rows.filter(row => !known(row.counts?.[key])).length;
  }
  return {counts, hidden};
}
