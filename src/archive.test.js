import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {archiveAiInput, archiveSearchText} from './archive.js';

test('final archive exposes only approved IDs and exact reviewed excerpts', () => {
  const index = JSON.parse(readFileSync(new URL('../public/archive.json', import.meta.url)));
  const raw = readFileSync(new URL('../public/ai-excerpts.json', import.meta.url));
  const inputs = JSON.parse(raw);
  assert.equal(createHash('sha256').update(raw).digest('hex'), '1a833b2588e6bc26eaa9272b833a87007dfa4cc76b52bb62d84bc77583dfaa78');
  assert.equal(new Set(index.map(row => row.id)).size, 683);
  assert.equal(index.length, 683);
  const reviewed = index.filter(row => row.use === '본문 발췌').map(row => row.id);
  assert.equal(reviewed.length, 306);
  assert.deepEqual(Object.keys(inputs).sort(), reviewed.sort());
  for (const row of index) {
    assert.deepEqual(Object.keys(row).sort(), ['category','date','department','id','title','url','use']);
    const text = archiveAiInput(row.id);
    if (row.use === '원문 안내') assert.equal(text, null);
    else assert.ok(text && text === inputs[row.id]);
    assert.ok(!archiveSearchText({...row, body:'UNREVIEWED'}).includes('unreviewed'));
  }
  assert.equal(archiveAiInput('unknown'), null);
  assert.equal(archiveAiInput('__proto__'), null);
});
