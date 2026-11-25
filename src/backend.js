import { createClient } from '@supabase/supabase-js';
import { loginEmail, normalizeLoginId } from './login-id.js';
export { loginIdFromEmail } from './login-id.js';

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL || '';
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
function isPublicKey(value) {
  if (value.startsWith('sb_publishable_')) return true;
  try {
    const payload = JSON.parse(atob(value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch { return false; }
}
export const backendConfigured = /^https:\/\/[^/]+/.test(url) && isPublicKey(key);
export const supabase = backendConfigured ? createClient(url, key) : null;

function client() {
  if (!supabase) throw new Error('계정 서버가 연결되지 않았습니다. 운영자 설정이 필요합니다.');
  return supabase;
}
function failure(error, action) {
  if (error) throw new Error(`${action}에 실패했습니다. 연결과 로그인 상태를 확인해 주세요.`, { cause: error });
}
// ID login: the ID is stored in Supabase Auth as an internal email that is never shown or mailed.
// A retried signup whose first response was lost finds its own account; logging in with the same password continues as that account.
export async function signUpWithId(id, password, auth = client().auth) {
  const { data, error } = await auth.signUp({ email: loginEmail(id), password });
  if (error?.code === 'user_already_exists') {
    const { error: signInError } = await auth.signInWithPassword({ email: loginEmail(id), password });
    if (!signInError) return;
    // A failed follow-up login says nothing about who owns the ID; report the outage or rate limit itself.
    if (['network', 'rate', 'server'].includes(authErrorKind(signInError))) throw signInError;
  }
  if (error) throw error;
  if (!data.session) throw new Error('가입 직후 로그인되지 않았습니다. 운영자에게 알려 주세요.');
}
// Network, rate limit and server failures must not be reported as a wrong ID or password.
export function authErrorKind(error) {
  // auth-js also throws 5xx responses as AuthRetryableFetchError, so the status decides before the name.
  if (error?.status >= 500) return 'server';
  if (error?.status === 429 || error?.code === 'over_request_rate_limit') return 'rate';
  if ((error?.name === 'AuthRetryableFetchError' && !error.status) || error instanceof TypeError) return 'network';
  if (error?.code === 'invalid_credentials' || error?.status === 400) return 'credentials';
  return 'other';
}
export async function signInWithId(id, password) {
  const { error } = await client().auth.signInWithPassword({ email: loginEmail(id), password });
  if (error) throw error;
}
export async function resetPasswordWithId(id, password) {
  const { error } = await client().functions.invoke('id-password-reset', { body: { id: normalizeLoginId(id), password } });
  if (!error) return;
  let message; try { message = (await error.context.json()).error; } catch {}
  throw new Error(message || '비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
function flatten(row) { return { ...row.data, id: row.id, status: row.status, owner_id: row.owner_id, updated_at: row.updated_at, isDemo: false }; }

// Version = the row's updated_at exactly as the server sent it. A save only lands on that version.
export function conflictError() { return Object.assign(new Error('다른 기기에서 먼저 수정했습니다. 새로 불러오면 이 화면의 저장 안 된 내용은 사라집니다.'), { code: 'conflict' }); }
export async function loadStudentState(userId) {
  const { data, error } = await client().from('student_state').select('data,updated_at').eq('user_id', userId).maybeSingle();
  failure(error, '내 정보 조회');
  return data ? { data: data.data, version: data.updated_at } : null;
}
export async function saveStudentState(userId, state, version = null) {
  const data = { profile: state.profile, saved: state.saved, applications: state.applications, read: state.read, seenSchedules:state.seenSchedules||{} };
  const table = client().from('student_state');
  if (version === null) {
    const { data: row, error } = await table.insert({ user_id: userId, data }).select('updated_at').single();
    if (error?.code === '23505') throw conflictError();
    failure(error, '저장');
    return row.updated_at;
  }
  const { data: rows, error } = await table.update({ data }).eq('user_id', userId).eq('updated_at', version).select('updated_at');
  failure(error, '저장');
  if (!rows.length) throw conflictError();
  return rows[0].updated_at;
}
export async function isManager(userId) {
  const { data, error } = await client().from('manager_grants').select('user_id').eq('user_id', userId).maybeSingle();
  failure(error, '담당자 권한 확인');
  return Boolean(data);
}
// PostgREST returns at most 1000 rows per request, so notice lists are read in pages with a stable order.
async function readNoticePages(query, action) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().order('updated_at', { ascending: false }).order('id').range(from, from + 999);
    failure(error, action);
    rows.push(...data.map(flatten));
    if (data.length < 1000) return rows;
  }
}
export async function listPublishedNotices() {
  return readNoticePages(() => client().from('notices').select('*').eq('status', 'published'), '공고 조회');
}
export async function listManagedNotices() {
  const { data: { user }, error: authError } = await client().auth.getUser();
  failure(authError, '로그인 확인');
  if (!user || !await isManager(user.id)) throw new Error('담당자 권한이 필요합니다.');
  return readNoticePages(() => client().from('notices').select('*').eq('owner_id', user.id), '담당 공고 조회');
}
export async function saveNotice(notice) {
  const { id, insertId, status = 'draft', owner_id, updated_at, isDemo, ...data } = notice;
  // A new notice carries an id chosen when the editor opened, so a retry after a lost response updates that row.
  // An existing notice saves only over the version it was opened from; 0 rows means another tab saved first.
  const query = id
    ? client().from('notices').update({ status, data }).eq('id', id).eq('updated_at', updated_at)
    : client().from('notices').upsert({ ...(insertId ? { id: insertId } : {}), status, data });
  const { data: rows, error } = await query.select('*');
  // validate_notice rejects content with P0001 and a reason written for the manager; show that reason as is.
  if (error?.code === 'P0001') throw new Error(error.message, { cause: error });
  if (error?.code === '23514') throw new Error('공고 내용의 형식이나 크기를 확인해 주세요.', { cause: error });
  failure(error, '공고 저장');
  if (!rows.length) throw conflictError();
  return flatten(rows[0]);
}
export async function getNoticeMetrics(id, fromDate, toDate) {
  const { data, error } = await client().rpc('notice_metrics', { p_notice_id: id, p_from: fromDate, p_to: toDate });
  failure(error, '집계 조회');
  const {data:responses,error:responseError}=await client().rpc('response_metrics',{p_notice_id:id,p_from:fromDate,p_to:toDate});
  failure(responseError,'응답 집계 조회');return {...data,responses};
}
export async function recordActivity(noticeId, type, optionId, stepId) {
  const { error } = stepId
    ? await client().rpc('record_followup', { p_notice_id: noticeId, p_option_id: optionId || null, p_step_id: stepId, p_checked: type === 'followup_on' })
    : await client().rpc('record_activity', { p_notice_id: noticeId, p_type: type, ...(optionId ? { p_option_id: optionId } : {}) });
  failure(error, '활동 기록 저장');
}
export async function getManagerOverview(fromDate, toDate) {
  const { data, error } = await client().rpc('manager_overview', { p_from: fromDate, p_to: toDate });
  failure(error, '통합 집계 조회');
  return data;
}
