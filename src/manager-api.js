// Manager session DB and server calls. See docs/CONTRACT.md sections 6, 8 and 9. Filled by the manager session.
//
// RPC
// - notice_funnel(p_notice_id, p_from, p_to)
// - decide_qualification(p_user_id, p_qualification_id, p_verified)
//
// Tables
// - read applications for own notices
// - read student_qualifications for own notices
// - insert qualifications
//
// Server functions
// - notice-draft { url } -> { fields, evidence, duplicateNoticeId }
// - notice-suggest { noticeId, fromDate, toDate } -> { suggestions }
//
// Storage
// - upload image to notice-images at <manager id>/<notice id>/<file>
import {supabase} from './backend.js';

function client() {
  if (!supabase) throw new Error('계정 서버가 연결되지 않았습니다. 운영자 설정이 필요합니다.');
  return supabase;
}
function failure(error, action) {
  if (error) throw new Error(`${action}에 실패했습니다. 연결과 로그인 상태를 확인해 주세요.`, {cause: error});
}

// RLS returns only applications of notices the signed-in manager owns.
export async function listApplications(noticeId) {
  const {data, error} = await client().from('applications').select('*').eq('notice_id', noticeId).order('submitted_at', {ascending: false});
  failure(error, '신청자 조회');
  return data;
}
// Self-claims that came in through these applications.
export async function listClaims(applicationIds) {
  if (!applicationIds.length) return [];
  const {data, error} = await client().from('student_qualifications').select('*').in('application_id', applicationIds);
  failure(error, '자기 신고 조회');
  return data;
}
export async function listQualifications(ids) {
  if (!ids.length) return [];
  const {data, error} = await client().from('qualifications').select('id,name').in('id', ids);
  failure(error, '자격 조회');
  return data;
}
// Unique students per source, stage, block and question. Only the notice owner may call it.
export async function getNoticeFunnel(noticeId, fromDate, toDate) {
  const {data, error} = await client().rpc('notice_funnel', {p_notice_id: noticeId, p_from: fromDate, p_to: toDate});
  failure(error, '단계 집계 조회');
  return data;
}
// AI rewrite suggestions per body block. The server sends only body text and block ratios of 5 or more students.
export async function suggestNoticeEdits(noticeId, fromDate, toDate) {
  const {data, error} = await client().functions.invoke('notice-suggest', {body: {noticeId, fromDate, toDate}});
  if (!error) return data;
  let message; try {message = (await error.context.json()).error;} catch {}
  throw new Error(message || 'AI 수정 제안을 받지 못했습니다. 잠시 후 다시 시도해 주세요.', {cause: error});
}
// Draft fields from a school notice detail address. The server reads the page in memory and masks personal data before AI.
export async function draftNotice(url) {
  const {data, error} = await client().functions.invoke('notice-draft', {body: {url}});
  if (!error) return data;
  let message; try {message = (await error.context.json()).error;} catch {}
  throw new Error(message || '초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.', {cause: error});
}
// Every qualification. Signed-in users may read them all.
export async function listAllQualifications() {
  const {data, error} = await client().from('qualifications').select('id,name,description').order('name');
  failure(error, '자격 목록 조회');
  return data;
}
// Managers insert qualifications directly. Names are unique.
export async function createQualification(name, description) {
  const {data: {user}} = await client().auth.getUser();
  const {data, error} = await client().from('qualifications').insert({owner_id: user?.id, name, description: description || null}).select('id,name,description').single();
  if (error?.code === '23505') throw new Error('같은 이름의 자격이 이미 있습니다. 목록에서 고르세요.', {cause: error});
  failure(error, '자격 만들기');
  return data;
}
// Marks a self-claim verified or rejected. Returns the new status. The DB message is shown as is.
export async function decideQualification(userId, qualificationId, verified) {
  const {data, error} = await client().rpc('decide_qualification', {p_user_id: userId, p_qualification_id: qualificationId, p_verified: verified});
  if (error) throw new Error(error.message || '자기 신고를 처리하지 못했습니다. 다시 시도해 주세요.', {cause: error});
  return data;
}
// Uploads a notice image to notice-images at <user id>/<notice id>/<uuid>.<ext> and returns its public URL.
// Type and size are checked before any request. Tests pass a fake storage and user id.
const IMAGE_TYPES = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'};
export const IMAGE_MAX = 5 * 1024 * 1024;
export async function uploadNoticeImage(file, noticeId, {storage, userId} = {}) {
  const ext = IMAGE_TYPES[file?.type];
  if (!ext) throw new Error('png, jpg, webp 파일만 올릴 수 있습니다.');
  if (file.size > IMAGE_MAX) throw new Error('이미지는 5MB까지 올릴 수 있습니다.');
  if (!storage) storage = client().storage;
  if (!userId) userId = (await client().auth.getUser()).data.user?.id;
  if (!userId) throw new Error('로그인 상태를 확인해 주세요.');
  const bucket = storage.from('notice-images'), path = `${userId}/${noticeId}/${crypto.randomUUID()}.${ext}`;
  const {error} = await bucket.upload(path, file, {contentType: file.type, upsert: false});
  failure(error, '이미지 올리기');
  return bucket.getPublicUrl(path).data.publicUrl;
}
