import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeBlocks } from './contract.js';
import { watchNoticeBlocks } from './student-block-reach.js';

test('excerpt blocks require one continuous second at half visibility in an active tab', t => {
  const blocks = noticeBlocks({ excerpt: '첫 문단\n둘째 문단' });
  assert.deepEqual(blocks.map(b => b.id), ['x1', 'x2']);
  const elements = blocks.map(b => ({ dataset: { blockId: b.id } }));
  const doc = new EventTarget();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let observeEntries;
  doc.defaultView = { setTimeout, clearTimeout, IntersectionObserver: class {
    constructor(callback, options) { observeEntries = callback; assert.equal(options.threshold, 0.5); }
    observe() {}
    unobserve() {}
    disconnect() {}
  }};
  const reached = [];
  const stop = watchNoticeBlocks({ ownerDocument: doc, querySelectorAll: () => elements }, id => reached.push(id));
  const show = (target, ratio) => observeEntries([{ target, intersectionRatio: ratio, isIntersecting: ratio > 0 }]);
  show(elements[0], 0.5);
  t.mock.timers.tick(999);
  show(elements[0], 0.49);
  t.mock.timers.tick(1);
  assert.deepEqual(reached, []);
  show(elements[0], 0.5);
  t.mock.timers.tick(1000);
  show(elements[0], 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(reached, ['x1']);
  show(elements[1], 1);
  doc.hidden = true;
  doc.dispatchEvent(new Event('visibilitychange'));
  t.mock.timers.tick(1000);
  assert.deepEqual(reached, ['x1']);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  show(elements[1], 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(reached, ['x1', 'x2']);
  stop();
});
