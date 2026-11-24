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
export async function signUpWithId(id, password) {
  const { data, error } = await client().auth.signUp({ email: loginEmail(id), password });
  if (error) throw error;
  if (!data.session) throw new Error('가입 직후 로그인되지 않았습니다. 운영자에게 알려 주세요.');
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

export async function loadStudentState(userId) {
  const { data, error } = await client().from('student_state').select('data').eq('user_id', userId).maybeSingle();
  failure(error, '내 정보 조회');
  return data?.data || null;
}
export async function saveStudentState(userId, state) {
  const data = { profile: state.profile, saved: state.saved, applications: state.applications, read: state.read, seenSchedules:state.seenSchedules||{} };
  const { error } = await client().from('student_state').upsert({ user_id: userId, data });
  failure(error, '저장');
}
export async function isManager(userId) {
  const { data, error } = await client().from('manager_grants').select('user_id').eq('user_id', userId).maybeSingle();
  failure(error, '담당자 권한 확인');
  return Boolean(data);
}
export async function listPublishedNotices() {
  const { data, error } = await client().from('notices').select('*').eq('status', 'published').order('updated_at', { ascending: false });
  failure(error, '공고 조회');
  return data.map(flatten);
}
export async function listManagedNotices() {
  const { data: { user }, error: authError } = await client().auth.getUser();
  failure(authError, '로그인 확인');
  if (!user || !await isManager(user.id)) throw new Error('담당자 권한이 필요합니다.');
  const { data, error } = await client().from('notices').select('*').eq('owner_id', user.id).order('updated_at', { ascending: false });
  failure(error, '담당 공고 조회');
  return data.map(flatten);
}
export async function saveNotice(notice) {
  const { id, status = 'draft', owner_id, updated_at, isDemo, ...data } = notice;
  const query = id
    ? client().from('notices').update({ status, data }).eq('id', id)
    : client().from('notices').insert({ status, data });
  const { data: row, error } = await query.select('*').single();
  if (error?.message?.startsWith('게시하려면')) throw new Error(error.message);
  failure(error, '공고 저장');
  return flatten(row);
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
