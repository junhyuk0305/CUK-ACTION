import { randomBytes } from 'node:crypto';
import { applyMode, eligibility, noticeBlocks, noticeQuestions, SOURCES } from '../src/contract.js';
import { loginEmail, isValidPassword } from '../src/login-id.js';
import { applicationSnapshot } from '../src/site-application.js';
import { adminClient, demoAccountAttributes, existingAccounts, isDemoAccount, requireStudentAccounts, runCli } from './student-demo-admin.mjs';

const departments = ['컴퓨터정보공학부', '경영학과', '글로벌경영학부', '국어국문학과'];

function demoAnswers(questions, profile, index) {
  return Object.fromEntries(questions.map(q => {
    if (q.type === 'profile') return [q.id, profile[q.profileField]];
    if (q.type === 'select') return [q.id, q.options[index % q.options.length]];
    return [q.id, (profile.name + '의 시연용 답변입니다.').slice(0, q.max)];
  }));
}

export function demoStudents(notices) {
  if (notices.length !== 3 || new Set(notices.map(n => n.id)).size !== 3 ||
    notices.some(n => !n.id || applyMode(n) !== 'site')) throw new Error('서로 다른 사이트 신청 공고 3개가 필요합니다.');
  return Array.from({ length: 40 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0');
    const profile = { name: '가상 학생 ' + suffix, studentNo: 'DEMO-' + suffix, phone: '000-0000-00' + suffix,
      department: departments[index % departments.length], year: String(index % 4 + 1), semester: String(index % 2 + 1),
      status: index % 9 === 0 ? '휴학' : '재학', gpa: (2.5 + index % 19 / 10).toFixed(1),
      residence: String(index % 30), interests: ['프로젝트'] };
    const events = [], applications = [];
    notices.forEach((notice, position) => {
      const viewers = 40 - position * 4;
      const rank = (index + position * 11) % 40;
      if (rank >= viewers) return;
      const event = (type, fields = {}) => events.push({ notice_id: notice.id, type, ...fields });
      event('view', { source: SOURCES[(index + position) % SOURCES.length] });
      const blocks = noticeBlocks(notice);
      blocks.forEach((block, i) => {
        const reached = i === 0 ? viewers - 2 : viewers - 13 - Math.min(i - 1, 3);
        if (rank < reached) event('block', { block_id: block.id });
      });
      if (rank >= viewers - 18) return;
      event('apply_start');
      const questions = noticeQuestions(notice);
      questions.forEach((q, i) => {
        const answered = i === 0 ? viewers - 20 : viewers - 26;
        if (rank < answered) event('question', { question_id: q.id });
      });
      if (rank >= viewers - 27) return;
      applications.push({ notice_id: notice.id, answers: demoAnswers(questions, profile, index),
        profile_snapshot: applicationSnapshot(profile), eligibility: eligibility(notice, profile, []) });
      event('submit');
    });
    return { loginId: 'demo' + suffix, profile, events, applications };
  });
}

async function main() {
  const ids = process.argv.slice(2).map(id => id.toLowerCase());
  if (new Set(ids).size !== 3 || ids.length !== 3 || ids.some(id => !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(id)))
    throw new Error('사용법: node scripts/seed-demo.mjs <공고 UUID 1> <공고 UUID 2> <공고 UUID 3>');
  const password = process.env.CUK_DEMO_PASSWORD;
  if (password !== undefined && !isValidPassword(password)) throw new Error('CUK_DEMO_PASSWORD는 8자 이상, 72바이트 이하여야 합니다.');
  const client = adminClient();
  const { data, error } = await client.from('notices').select('id,data').eq('status', 'published').in('id', ids);
  if (error) throw error;
  const notices = ids.map(id => data.find(n => n.id === id)).filter(Boolean).map(n => ({ ...n.data, id: n.id }));
  const students = demoStudents(notices);
  const accounts = await existingAccounts(client);
  for (const account of accounts.values()) {
    if (!isDemoAccount(account)) throw new Error('기존 계정과 시연 아이디가 겹칩니다: ' + account.email);
  }
  await requireStudentAccounts(client, [...accounts.values()]);
  for (const student of students) {
    const email = loginEmail(student.loginId);
    let user = accounts.get(email);
    if (!user) {
      const result = await client.auth.admin.createUser(demoAccountAttributes(
        student.loginId, password ?? randomBytes(24).toString('base64url')));
      if (result.error) throw result.error;
      user = result.data.user;
    }
    const { error } = await client.rpc('replace_student_demo', { p_user: user.id, p_notice_ids: ids, p_profile: student.profile,
      p_events: student.events, p_applications: student.applications });
    if (error) throw new Error(student.loginId + ' 저장 실패: ' + error.message);
  }
  console.log('가상 학생 40명, 신청서 ' + students.reduce((n,s) => n + s.applications.length, 0) + '건을 저장했습니다.');
  if (notices.some(n => noticeBlocks(n).length < 2 || noticeQuestions(n).length < 2))
    console.log('블록이나 문항이 한 개 이하인 공고는 해당 항목 사이의 이탈을 비교할 수 없습니다.');
}

runCli(import.meta.url, main);
