// DB checks across the student and manager sessions. Records are made with the student functions
// (record_event, submit_application) and read with the manager functions and screens' helpers.
import assert from 'node:assert/strict';
import { createDb } from './db-harness.mjs';
import { loginEmail } from '../src/login-id.js';
import { eligibility } from '../src/contract.js';
import { editorNotice, newBlock, newQuestion, withType } from '../src/notice-editor.js';
import { blockRows, questionRows, stageRows } from '../src/funnel.js';
import { answerRows, applicantRow, claimRows, ruleRows } from '../src/applicants.js';
import { applicationSnapshot } from '../src/site-application.js';

const { db, ids, asUser, addNotice, check, notice, passed } = await createDb({ prefixes: ['2026112601', '2026112602', '2026112603', '2026112604'] });
try {
  // Six more students, so funnel cells reach the 5-student threshold.
  const extra = [];
  for (let i = 1; i <= 7; i++) {
    const id = `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`;
    await db.query('insert into auth.users(id,email) values ($1,$2)', [id, loginEmail(`extra${i}`)]);
    extra.push(id);
  }
  const rpc = (user, sql, args) => asUser(user, async () => (await db.query(sql, args)).rows);
  const today = "(now() at time zone 'Asia/Seoul')::date";
  const funnel = (user, id) => rpc(user, `select public.notice_funnel($1, ${today}, ${today}) as f`, [id]).then(rows => rows[0].f);
  const recordEvent = (user, id, type, { source = null, blockId = null, questionId = null } = {}) =>
    rpc(user, 'select public.record_event($1,$2,$3,$4,$5)', [id, type, source, blockId, questionId]);
  const submit = (user, id, answers, profile, evaluated, claims = []) =>
    rpc(user, 'select * from public.submit_application($1,$2,$3,$4,$5)',
      [id, JSON.stringify(answers), JSON.stringify(profile), JSON.stringify(evaluated), JSON.stringify(claims)]).then(rows => rows[0]);

  // A site notice in the shape the manager editor saves: editorNotice output with editor-made blocks and questions.
  const heading = { ...newBlock('heading'), text: '모집 대상' };
  const body = { ...newBlock('text'), text: '본교 재학생을 모집합니다.' };
  const name = { ...withType(newQuestion(), 'profile'), label: '이름' };
  const field = { ...withType(newQuestion(), 'short'), label: '지원 분야', max: 100 };
  const motive = { ...newQuestion(), label: '지원 동기', max: 1000 };
  const track = { ...withType(newQuestion(), 'select'), label: '희망 기수', options: ['1기', '2기'], required: false };
  const siteData = editorNotice({ ...notice, applyMode: 'site', deadline: '', blocks: [heading, body], questions: [name, field, motive, track] });
  const siteId = await addNotice(ids.managerA, siteData, 'published');
  const profileOf = i => ({ name: `가상 학생 ${i}`, studentNo: `2026000${i}`, department: '컴퓨터정보공학부', year: '3', status: '재학' });
  const answersOf = i => ({ [name.id]: `가상 학생 ${i}`, [field.id]: '기획', [motive.id]: '지원합니다.' });

  await check('편집기 모양의 사이트 공고를 학생 함수가 읽고 제출을 받는다', async () => {
    const row = await submit(extra[0], siteId, { ...answersOf(1), [track.id]: '2기' }, applicationSnapshot(profileOf(1)), eligibility(siteData, profileOf(1), []));
    assert.equal(row.status, 'submitted');
    await assert.rejects(submit(extra[0], siteId, { ...answersOf(1), [track.id]: '3기' }, {}, eligibility(siteData, {}, [])), /선택지/);
    await assert.rejects(submit(extra[0], siteId, { [name.id]: '가상' }, {}, eligibility(siteData, {}, [])), /필수 문항/);
  });

  await check('record_event와 submit_application의 기록을 notice_funnel이 그대로 센다', async () => {
    for (const [i, user] of extra.slice(0, 6).entries()) {
      await recordEvent(user, siteId, 'view', { source: i < 5 ? 'alert' : 'kakao' });
      await recordEvent(user, siteId, 'block', { blockId: heading.id });
      await recordEvent(user, siteId, 'block', { blockId: heading.id });
      if (i === 5) continue;
      await recordEvent(user, siteId, 'block', { blockId: body.id });
      await recordEvent(user, siteId, 'apply_start');
      await recordEvent(user, siteId, 'question', { questionId: field.id });
      await recordEvent(user, siteId, 'question', { questionId: motive.id });
      await submit(user, siteId, answersOf(i + 1), applicationSnapshot(profileOf(i + 1)), eligibility(siteData, profileOf(i + 1), []));
    }
    // The owner's own activity is left out.
    await db.query('insert into public.activity_events(user_id,notice_id,type,source) values ($1,$2,$3,$4)', [ids.managerA, siteId, 'view', 'alert']);
    const f = await funnel(ids.managerA, siteId);
    assert.deepEqual(f.sources, { alert: 5, kakao: null, browse: 0, direct: 0 });
    assert.deepEqual(f.stages, { view: 6, apply_start: 5, question: 5, submit: 5, start: 0, link: 0, complete: 0 });
    assert.deepEqual(f.blocks, { [heading.id]: 6, [body.id]: 5 });
    assert.deepEqual(f.questions, { [field.id]: 5, [motive.id]: 5 });
    // The screen helpers join the counts with the saved notice by id.
    assert.deepEqual(stageRows(siteData, f.stages).map(r => [r.key, r.count, r.rate]),
      [['view', 6, null], ['apply_start', 5, 83], ['question', 5, 100], ['submit', 5, 100]]);
    const blocks = blockRows(siteData, f.blocks);
    assert.deepEqual(blocks.rows.map(r => r.count), [6, 5]);
    assert.equal(blocks.deleted, null);
    assert.deepEqual(questionRows(siteData, f.questions).rows.map(r => r.count), [0, 5, 5, 0]);
  });

  await check('manager_overview가 사이트 공고의 신청서 열기와 제출을 센다', async () => {
    const o = (await rpc(ids.managerA, `select public.manager_overview(${today}, ${today}) as o`))[0].o;
    const row = o.notices.find(n => n.id === siteId);
    assert.equal(row.applyMode, 'site');
    assert.deepEqual([row.counts.view, row.counts.apply_start, row.counts.submit], [6, 5, 5]);
    assert.deepEqual([o.counts.apply_start, o.counts.submit], [5, 5]);
  });

  // A custom qualification made by manager A and a notice that asks for it.
  const qualificationId = (await rpc(ids.managerA, "insert into public.qualifications(owner_id,name) values ($1,'봉사 30시간 이상') returning id", [ids.managerA]))[0].id;
  const customRule = { field: 'custom', op: 'eq', value: qualificationId, label: '봉사 30시간 이상', evidence: '담당자가 직접 확인' };
  const claimData = editorNotice({ ...siteData, title: '자격 신고 공고', rules: [...siteData.rules, customRule] });
  const claimId = await addNotice(ids.managerA, claimData, 'published');
  const claimProfile = profileOf(9);
  const claimEval = eligibility(claimData, claimProfile, []);
  const readApplications = (user, id) => rpc(user, 'select * from public.applications where notice_id = $1 order by submitted_at desc', [id]);
  const readClaims = (user, applicationIds) => rpc(user, 'select * from public.student_qualifications where application_id = any($1::uuid[])', [applicationIds]);
  const readOwnClaim = user => rpc(user, 'select status, note, application_id, decided_by from public.student_qualifications where user_id = $1 and qualification_id = $2', [user, qualificationId]).then(rows => rows[0]);
  const decide = (manager, student, verified) => rpc(manager, 'select public.decide_qualification($1,$2,$3) as s', [student, qualificationId, verified]).then(rows => rows[0].s);
  let claimApplication;

  await check('submit_application의 신청서와 자기 신고를 담당자 표와 상세가 읽는다', async () => {
    claimApplication = await submit(ids.studentA, claimId, answersOf(9), applicationSnapshot(claimProfile), claimEval,
      [{ qualificationId, note: '봉사 32시간' }]);
    const [application] = await readApplications(ids.managerA, claimId);
    assert.equal(application.id, claimApplication.id);
    const row = applicantRow(application);
    assert.deepEqual([row.name, row.studentNo, row.department, row.year, row.eligibility, row.failed, row.status],
      ['가상 학생 9', '20260009', '컴퓨터정보공학부', '3', '1/2', false, '제출']);
    assert.deepEqual(answerRows(application, claimData).map(r => r.answer), ['가상 학생 9', '기획', '지원합니다.', '미입력']);
    const claims = await readClaims(ids.managerA, [application.id]);
    assert.deepEqual(claims.map(c => [c.status, c.note]), [['claimed', '봉사 32시간']]);
    assert.deepEqual(claimRows(application, claims, [{ id: qualificationId, name: '봉사 30시간 이상' }]).map(c => [c.name, c.note, c.status]),
      [['봉사 30시간 이상', '봉사 32시간', '확인 대기']]);
    assert.deepEqual(ruleRows(application, claims).map(r => [r.statusLabel, r.value]), [['충족', '재학'], ['확인 필요', '신고 확인 대기']]);
    assert.deepEqual(await readApplications(ids.managerB, claimId), []);
    assert.deepEqual(await readClaims(ids.managerB, [application.id]), []);
  });

  await check('decide_qualification이 학생 함수가 넣은 신고를 확인한다', async () => {
    await assert.rejects(decide(ids.managerB, ids.studentA, true), /담당 공고에 들어온 자기 신고만/);
    assert.equal(await decide(ids.managerA, ids.studentA, true), 'verified');
    const [application] = await readApplications(ids.managerA, claimId);
    assert.deepEqual(ruleRows(application, await readClaims(ids.managerA, [application.id])).map(r => r.value), ['재학', '신고 확인 완료']);
    const server = await rpc(ids.studentA, 'select public.notice_eligibility($1,$2,$3) as e', [JSON.stringify(claimData.rules), JSON.stringify(claimProfile), ids.studentA]);
    assert.deepEqual([server[0].e.pass, server[0].e.unknown], [2, 0]);
  });

  await check('확인된 신고는 학생이 다시 신고해도 verified로 남는다', async () => {
    const before = await readOwnClaim(ids.studentA);
    await submit(ids.studentA, claimId, answersOf(9), applicationSnapshot(claimProfile), claimEval, [{ qualificationId, note: '다시 적은 설명' }]);
    assert.deepEqual(await readOwnClaim(ids.studentA), before);
    // Another notice with the same qualification, owned by manager B.
    const otherId = await addNotice(ids.managerB, { ...claimData, title: '다른 담당자 공고' }, 'published');
    await submit(ids.studentA, otherId, answersOf(9), applicationSnapshot(claimProfile), claimEval, [{ qualificationId, note: '다른 공고 설명' }]);
    assert.deepEqual(await readOwnClaim(ids.studentA), before);
    assert.equal(before.status, 'verified');
    assert.equal(before.decided_by, ids.managerA);
  });

  await check('반려된 신고는 다시 신고하면 확인 대기로 돌아간다', async () => {
    await submit(ids.studentB, claimId, answersOf(8), applicationSnapshot(profileOf(8)), eligibility(claimData, profileOf(8), []), [{ qualificationId, note: '첫 설명' }]);
    assert.equal(await decide(ids.managerA, ids.studentB, false), 'rejected');
    await submit(ids.studentB, claimId, answersOf(8), applicationSnapshot(profileOf(8)), eligibility(claimData, profileOf(8), []), [{ qualificationId, note: '보완 설명' }]);
    assert.deepEqual(await readOwnClaim(ids.studentB).then(r => [r.status, r.note, r.decided_by]), ['claimed', '보완 설명', null]);
  });

  // Students with a profile for the publication alert. studentC qualifies; studentD does not.
  const state = (user, status) => db.query('insert into public.student_state(user_id,data) values ($1,$2)',
    [user, { profile: { department: '컴퓨터정보공학부', year: '3', status }, applications: {}, saved: [], read: [] }]);
  await state(ids.studentC, '재학');
  await state(ids.studentD, '휴학');
  const alerts = noticeId => db.query('select user_id from public.notifications where notice_id = $1 order by user_id', [noticeId]).then(r => r.rows.map(row => row.user_id));
  const update = (id, status, data) => rpc(ids.managerA, 'update public.notices set status = $1, data = $2 where id = $3', [status, data, id]);
  const relabel = data => ({ ...data, questions: data.questions.map((q, i) => i === 1 ? { ...q, label: '희망 분야' } : q) });

  await check('게시 알림 트리거와 양식 잠금 트리거가 같은 갱신에서 함께 돈다', async () => {
    const lockData = editorNotice({ ...siteData, title: '알림과 잠금 공고' });
    const id = await addNotice(ids.managerA, lockData);
    // Draft to published with a question label change: the lock passes and the alert goes out.
    await update(id, 'published', relabel(lockData));
    assert.deepEqual(await alerts(id), [ids.studentC]);
    // Published to archived with a structure change: the lock rejects the whole update.
    await assert.rejects(update(id, 'archived', { ...lockData, questions: lockData.questions.slice(1) }), /문항 구조를 바꿀 수 없습니다/);
    await update(id, 'archived', relabel(lockData));
    // A student who qualifies after the first publication.
    await state(extra[6], '재학');
    // Archived to published with a structure change: rejected, so no alert is made.
    await assert.rejects(update(id, 'published', { ...relabel(lockData), questions: relabel(lockData).questions.slice(0, 3) }), /문항 구조를 바꿀 수 없습니다/);
    assert.deepEqual(await alerts(id), [ids.studentC]);
    assert.equal((await db.query('select status from public.notices where id = $1', [id])).rows[0].status, 'archived');
    // Archived to published with labels only: the lock passes and only the new student gets an alert.
    await update(id, 'published', relabel(lockData));
    assert.deepEqual((await alerts(id)).sort(), [ids.studentC, extra[6]].sort());
  });

  console.log(`\n${passed()} integration database checks passed against PostgreSQL RLS in PGlite.`);
} finally {
  await db.close();
}
