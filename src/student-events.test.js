import test from 'node:test';
import assert from 'node:assert/strict';
import { eventArgs, rememberPublicView, takePublicView } from './student-events.js';

test('tracking sends only event identifiers and uses option RPC only for option views', () => {
  assert.deepEqual(eventArgs('n','view',{ source:'alert', optionId:'spring' }), {
    p_notice_id:'n', p_type:'view', p_source:'alert', p_option_id:'spring', p_block_id:null, p_question_id:null,
  });
  assert.deepEqual(eventArgs('n','question',{ questionId:'q2', answer:'private', optionId:'spring' }), {
    p_notice_id:'n', p_type:'question', p_source:null, p_block_id:null, p_question_id:'q2',
  });
});

test('a view carried to the account page is consumed once and matches both student and notice', () => {
  const store = new Map();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable:true, value: {
    getItem:key=>store.get(key)??null, setItem:(key,value)=>store.set(key,value), removeItem:key=>store.delete(key),
  }});
  try {
    rememberPublicView('a','one');
    assert.equal(takePublicView('a','two'),false);
    rememberPublicView('a','one');
    assert.equal(takePublicView('b','one'),false);
    rememberPublicView('a','one');
    assert.equal(takePublicView('a','one'),true);
    assert.equal(takePublicView('a','one'),false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis,'sessionStorage',descriptor);
    else delete globalThis.sessionStorage;
  }
});
