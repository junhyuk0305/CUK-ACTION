import { supabase } from './backend.js';

function client() {
  if (!supabase) throw new Error('계정 서버에 연결하지 못했습니다.');
  return supabase;
}

async function checked(request, message) {
  const { data, error } = await request;
  if (error) throw new Error(error.code === 'P0001' ? error.message : message, { cause: error });
  return data;
}

export function ownApplications(userId) {
  return checked(client().from('applications').select('notice_id,status,answers,profile_snapshot,claims,updated_at').eq('user_id', userId),
    '제출한 신청서를 불러오지 못했습니다.');
}

export function ownQualifications(userId) {
  return checked(client().from('student_qualifications').select('qualification_id,status,note,qualifications(name)').eq('user_id', userId),
    '자격 정보를 불러오지 못했습니다.');
}

export function submitApplication(noticeId, answers, snapshot, eligibility, claims) {
  return checked(client().rpc('submit_application', { p_notice_id: noticeId, p_answers: answers,
    p_profile_snapshot: snapshot, p_eligibility: eligibility, p_claims: claims }).single(), '신청서를 제출하지 못했습니다.');
}

export function withdrawApplication(noticeId) {
  return checked(client().rpc('withdraw_application', { p_notice_id: noticeId }).single(), '신청을 취소하지 못했습니다.');
}

export async function ownNoticeAlerts(userId) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const page = await checked(client().from('notifications')
      .select('id,notice_id,pass,total,read_at,notices(status,title:data->>title,deadline:data->>deadline)')
      .eq('user_id', userId).eq('kind', 'new_notice').order('id', { ascending: false }).range(from, from + 999),
      '새 공고 알림을 불러오지 못했습니다.');
    all.push(...page);
    if (page.length < 1000) return all;
  }
}

export function markNoticeRead(userId, noticeId) {
  return checked(client().from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).eq('notice_id', noticeId).eq('kind', 'new_notice').is('read_at', null),
    '알림의 읽음 상태를 저장하지 못했습니다.');
}
