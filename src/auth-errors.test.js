import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AuthApiError, AuthRetryableFetchError} from '@supabase/supabase-js';
import * as backend from './backend.js';

const authErrorKind = (...a) => backend.authErrorKind(...a);
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const main = read('./main.jsx'), idAuth = read('./IdAuth.jsx');

test('QE-13: auth failures are told apart: network, rate limit, server, wrong credentials', () => {
  assert.equal(authErrorKind(new AuthRetryableFetchError('Failed to fetch', 0)), 'network');
  assert.equal(authErrorKind(new TypeError('Failed to fetch')), 'network');
  assert.equal(authErrorKind(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')), 'rate');
  // auth-js 2.119 throws 5xx responses as AuthRetryableFetchError carrying the HTTP status (QA B-3).
  assert.equal(authErrorKind(new AuthRetryableFetchError('{"code":"unexpected_failure"}', 500)), 'server');
  assert.equal(authErrorKind(new AuthRetryableFetchError('Service Unavailable', 503)), 'server');
  assert.equal(authErrorKind(new AuthApiError('boom', 500, 'unexpected_failure')), 'server');
  assert.equal(authErrorKind(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')), 'credentials');
  assert.match(idAuth, /kind==='network'\?'서버에 연결하지 못했습니다\. 인터넷 연결을 확인하고 다시 시도해 주세요\.'/);
  assert.match(idAuth, /kind==='credentials'\?'로그인하지 못했습니다\. 아이디와 비밀번호를 확인해 주세요\.'/);
});

function fakeAuth({signUpError = null, signInError = null} = {}) {
  const calls = [];
  return {calls,
    signUp: async creds => { calls.push(['signUp', creds.email]); return signUpError ? {data: {}, error: signUpError} : {data: {session: {}}, error: null}; },
    signInWithPassword: async creds => { calls.push(['signIn', creds.email]); return {error: signInError}; }};
}
const exists = () => new AuthApiError('User already registered', 422, 'user_already_exists');

test('QE-17: a retried signup that finds its own account logs in instead of failing', async () => {
  const auth = fakeAuth({signUpError: exists()});
  await backend.signUpWithId('student1', 'newpass123', auth);
  assert.deepEqual(auth.calls.map(c => c[0]), ['signUp', 'signIn']);
});

test('QE-17: an ID taken by someone else still reports user_already_exists', async () => {
  const auth = fakeAuth({signUpError: exists(), signInError: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')});
  await assert.rejects(backend.signUpWithId('student1', 'newpass123', auth), e => e.code === 'user_already_exists');
});

test('QA B-4: a retried signup whose follow-up login is rate limited reports the rate limit, not a taken ID', async () => {
  const auth = fakeAuth({signUpError: exists(), signInError: new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')});
  await assert.rejects(backend.signUpWithId('student1', 'newpass123', auth), e => authErrorKind(e) === 'rate' && e.code !== 'user_already_exists');
  const offline = fakeAuth({signUpError: exists(), signInError: new AuthRetryableFetchError('Failed to fetch', 0)});
  await assert.rejects(backend.signUpWithId('student1', 'newpass123', offline), e => authErrorKind(e) === 'network');
});

test('QE-16: the reset message does not claim a change it cannot confirm', () => {
  assert.doesNotMatch(idAuth, /요청을 처리했습니다\. 새 비밀번호로 로그인해 보세요\./);
  assert.match(idAuth, /setMessage\('입력한 아이디가 학생 계정이면 비밀번호를 바꿨습니다\. 새 비밀번호로 로그인해 보세요\.'\)/);
});

test('QE-09: logout during a failed save asks before discarding instead of doing nothing', () => {
  const leave = main.slice(main.indexOf('async function leave()'), main.indexOf('const [page,setPage]'));
  assert.match(leave, /if\(await flush\(\)\)\{await logout\(\);return;\}if\(window\.confirm\('저장하지 못한 내용이 있습니다\. 저장하지 않고 로그아웃할까요\?'\)\)await logout\(\);/);
});
