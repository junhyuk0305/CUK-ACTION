import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as workflow from './workflow.js';

const call = name => (...a) => workflow[name](...a);
const detailBackLabel = call('detailBackLabel'), publicBackLabel = call('publicBackLabel');
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const main = read('./main.jsx'), campus = read('./campus.jsx'), idAuth = read('./IdAuth.jsx');

test('PS-08/FR-03 (D5): the shared login form is titled for everyone', () => {
  assert.match(idAuth, /const titles=\{login:'로그인',/);
});

test('PS-06/FR-08 (D9): the account detail back button names the screen it returns to', () => {
  assert.equal(detailBackLabel('home'), '홈으로');
  assert.equal(detailBackLabel('explore'), '공고 탐색으로');
  assert.equal(detailBackLabel('applications'), '내 신청으로');
  assert.equal(detailBackLabel('saved'), '관심 공고로');
  assert.equal(detailBackLabel('notifications'), '알림으로');
  assert.equal(detailBackLabel('archive'), '실제 공고 보관함으로');
  assert.equal(detailBackLabel('archive', true), '보관함 공고로');
  assert.equal(detailBackLabel('saved', true), '보관함 공고로');
  assert.match(main, /<button className="back" onClick=\{goBack\}><ArrowLeft size=\{16\}\/>\{fromManager\.current\?'공고 집계로':detailBackLabel\(page,!!archiveItem\)\}<\/button>/);
  assert.match(main, /<button className="back" onClick=\{goBack\}><ArrowLeft size=\{16\}\/>\{detailBackLabel\(page\)\}<\/button>/);
});

test('FR-09: the public detail back button names where it goes', () => {
  assert.equal(publicBackLabel(null), '전체 공고로');
  assert.equal(publicBackLabel({hash: ''}), '홈으로');
  assert.equal(publicBackLabel({hash: '#home'}), '홈으로');
  assert.equal(publicBackLabel({hash: '#browse'}), '전체 공고로');
  assert.equal(publicBackLabel({hash: '#saved'}), '관심 공고로');
  assert.match(campus, /<ArrowLeft size=\{16\}\/>\{publicBackLabel\(returnTo\.current\)\}<\/button>/);
});

test('PS-09: account browse states how many closed notices the open-only filter hides', () => {
  assert.match(main, /closedHidden=openOnly\?notices\.filter\(n=>listMatch\(n,true\)&&deadlineState\(n\)==='closed'\)\.length:0/);
  assert.match(main, /closedHidden>0&&<span>마감 지난 공고 \{closedHidden\}건 제외<\/span>/);
});

test('QE-20: a public deep link to a source-only notice shows the notice with its school link', () => {
  assert.match(campus, /row=rows\.find\(r=>r\.id===detailId\), item=row\?\.use==='본문 발췌'\?row:null/);
  assert.match(campus, /\{row\?<><div className="detail-heading">.*?<span className="tag">\{row\.category\}<\/span>.*?<h1 ref=\{title\} tabIndex="-1">\{row\.title\}<\/h1>.*?<a className="button primary" href=\{row\.url\}/s);
});

test('the sidebar logo goes to the public home page', () => {
  assert.match(main, /<a className="brand" href="\/">/);
});
