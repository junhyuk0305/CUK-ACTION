import test from 'node:test';
import assert from 'node:assert/strict';
import {listDate, managerPageItems} from './manager-pages.js';

test('few pages show every number', () => {
  assert.deepEqual(managerPageItems(1, 1), [1]);
  assert.deepEqual(managerPageItems(1, 2), [1, 2]);
  assert.deepEqual(managerPageItems(3, 5), [1, 2, 3, 4, 5]);
});

test('many pages keep first, last and the current neighbors', () => {
  assert.deepEqual(managerPageItems(5, 23), [1, 'gap', 4, 5, 6, 'gap', 23]);
  assert.deepEqual(managerPageItems(1, 23), [1, 2, 'gap', 23]);
  assert.deepEqual(managerPageItems(23, 23), [1, 'gap', 22, 23]);
  assert.deepEqual(managerPageItems(4, 23), [1, 2, 3, 4, 5, 'gap', 23]);
  assert.deepEqual(managerPageItems(20, 23), [1, 'gap', 19, 20, 21, 22, 23]);
});

test('list deadlines drop the year only for the current year', () => {
  assert.equal(listDate('2026-12-10', '2026'), '12.10');
  assert.equal(listDate('2027-01-05', '2026'), '2027.01.05');
  assert.equal(listDate('', '2026'), '');
});
