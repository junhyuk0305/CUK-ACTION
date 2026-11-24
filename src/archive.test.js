import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveAiInput, archiveRow, archiveSearchText, archiveNoticeId, loadArchive, mergeGuestSaved} from './archive.js';

test('published notice data maps to catalogue rows and only excerpted notices feed the model', async () => {
  assert.deepEqual(archiveRow({sourceArchiveId:'1', title:'T', department:'D', category:'기타', postedAt:'2026.11.20', sourceUrl:'https://x', excerpt:'E'}),
    {id:'1', title:'T', department:'D', category:'기타', date:'2026.11.20', url:'https://x', use:'본문 발췌', excerpt:'E'});
  assert.equal(archiveRow({sourceArchiveId:'2'}).use, '원문 안내');
  const rows = await loadArchive();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const text = archiveAiInput(row.id);
    if (row.use === '원문 안내') assert.equal(text, null);
    else assert.equal(text, row.excerpt);
    assert.ok(!archiveSearchText({...row, body:'UNREVIEWED'}).includes('unreviewed'));
  }
  assert.equal(archiveAiInput('unknown'), null);
  assert.equal(archiveAiInput('__proto__'), null);
});

test('guest saved archive IDs merge into account saved list', () => {
  const published = [{id:'n-1', sourceUrl:'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842'}, {id:'n-2', sourceUrl:'https://www.catholic.ac.kr/ko/campuslife/notice.do?articleNo=2778420&mode=view'}];
  assert.deepEqual(mergeGuestSaved([], ['277848', '277849', '277850'], published), ['277848', '277849', '277850']);
  assert.deepEqual(mergeGuestSaved(['277848', 'n-1'], ['277848', '277842', '277848'], published), ['277848', 'n-1']);
  assert.equal(archiveNoticeId('277842', published), 'n-1');
  assert.equal(archiveNoticeId('277843', published), '277843');
  assert.deepEqual(mergeGuestSaved(['a'], null, published), ['a']);
  assert.deepEqual(mergeGuestSaved([], [277842, '277842'], published), ['n-1']);
});
