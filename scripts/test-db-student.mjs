import assert from 'node:assert/strict';
import { createDb } from './db-harness.mjs';
import { eligibility } from '../src/contract.js';

const { db, ids, asUser, addNotice, notice, check, passed } = await createDb({ prefixes: ['2026112601'] });
try {
  await check('기반이 열린다', () => asUser(ids.studentA, async () => {
    assert.deepStrictEqual((await db.query('select id from public.applications')).rows, []);
  }));

  const siteData = { ...notice, applyMode: 'site', deadline: '', questions: [
    ...notice.questions, { id: 'track', type: 'select', label: '기수', options: ['1기','2기'], required: false },
  ] };
  const site = await addNotice(ids.managerA, siteData, 'published');
  const profile = { name: '가상 학생', status: '휴학' };
  const evaluated = eligibility(siteData, profile, []);
  const submit = async (id = site, answers = { q1: '지원합니다.' }, user = ids.studentA, claims = []) => asUser(user, async () =>
    (await db.query('select * from public.submit_application($1,$2,$3,$4,$5)',
      [id, JSON.stringify(answers), JSON.stringify(profile), JSON.stringify(evaluated), JSON.stringify(claims)])).rows[0]);
  const withdraw = (id = site, user = ids.studentA) => asUser(user, async () =>
    (await db.query('select * from public.withdraw_application($1)', [id])).rows[0]);
  const readAs = (user, id = site) => asUser(user, async () =>
    (await db.query('select * from public.applications where notice_id = $1', [id])).rows);
  let applicationId;
  await check('미충족 조건이 있어도 답과 제출 시점의 정보가 저장된다', async () => {
    const row = await submit();
    applicationId = row.id;
    assert.equal(row.status, 'submitted');
    assert.equal(row.user_id, ids.studentA);
    assert.deepEqual(row.answers, { q1: '지원합니다.' });
    assert.deepEqual(row.profile_snapshot, profile);
    assert.deepEqual(row.eligibility, evaluated);
    assert.equal(row.eligibility.fail, 1);
  });
  await check('수정 제출은 기존 신청서 한 줄을 갱신한다', async () => {
    const updated = await submit(site, { q1: '수정 답변', track: '1기' });
    assert.equal(updated.id, applicationId);
    assert.deepEqual((await readAs(ids.studentA)).map(row => row.answers), [{ q1: '수정 답변', track: '1기' }]);
  });
  await check('형식과 필수 문항, 길이와 선택지를 검사한다', async () => {
    for (const answers of [{}, { q1: ' \t\n' }, { q1: null }, { q1: {} }, { q1: '가'.repeat(1001) },
      { q1: '답', track: '없는 선택' }, { q1: '답', other: '무관한 문항' }]) {
      await assert.rejects(submit(site, answers), /문항/);
    }
    assert.equal((await readAs(ids.studentA))[0].answers.q1, '수정 답변');
  });
  await check('신청서 열람은 본인과 담당 공고 소유자로 제한한다', async () => {
    assert.deepEqual(await readAs(ids.studentB), []);
    assert.deepEqual(await readAs(ids.managerB), []);
    assert.equal((await readAs(ids.managerA))[0].id, applicationId);
    await assert.rejects(withdraw(site, ids.studentB), /취소할 신청서/);
  });
  await check('취소와 재신청은 같은 신청서에 반영한다', async () => {
    assert.equal((await withdraw()).status, 'withdrawn');
    const again = await submit();
    assert.equal(again.id, applicationId);
    assert.equal(again.status, 'submitted');
  });
  await check('로그인하지 않으면 제출하거나 취소할 수 없다', async () => {
    await assert.rejects(asUser(null, () => db.query('select public.withdraw_application($1)', [site]), 'anon'), /permission denied/i);
    await assert.rejects(submit(site, {q1: '답'}, null), /로그인/);
  });
  await check('미게시, 외부 신청, 마감 지난 공고는 거절한다', async () => {
    const draft = await addNotice(ids.managerA, siteData, 'draft');
    const external = await addNotice(ids.managerA, { ...notice, deadline: '' }, 'published');
    await assert.rejects(submit(draft), /게시된 공고/);
    await assert.rejects(submit(external), /사이트 신청/);
    const expired = await addNotice(ids.managerA, { ...siteData, deadline: '2000-01-01' }, 'published');
    await assert.rejects(submit(expired), /신청 기간/);
    await assert.rejects(withdraw(expired), /신청 기간/);
  });
  await check('한국 날짜 기준으로 마감 당일의 시각을 반영한다', async () => {
    const { today } = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text today")).rows[0];
    const todayNotice = await addNotice(ids.managerA, { ...siteData, deadline: today }, 'published');
    assert.equal((await submit(todayNotice)).status, 'submitted');
    await asUser(ids.managerA, () => db.query("update public.notices set data = data || '{\"deadlineTime\":\"00:00\"}' where id = $1", [todayNotice]));
    await assert.rejects(submit(todayNotice), /신청 기간/);
    await assert.rejects(withdraw(todayNotice), /신청 기간/);
  });

  const measured = await addNotice(ids.managerA, { ...siteData, excerpt: '첫 줄\n\n  둘째 줄' }, 'published');
  const record = (id, type, source = null, block = null, question = null, user = ids.studentA) =>
    asUser(user, () => db.query('select public.record_event($1,$2,$3,$4,$5)', [id, type, source, block, question]));
  await check('상세부터 제출까지 종류별로 기록하며 블록과 문항은 학생별 한국 날짜당 한 줄이다', async () => {
    await record(measured, 'view', 'alert');
    await record(measured, 'block', null, 'x2');
    await record(measured, 'block', null, 'x2');
    await record(measured, 'apply_start');
    await record(measured, 'question', null, null, 'q1');
    await record(measured, 'question', null, null, 'q1');
    await submit(measured);
    assert.deepEqual((await db.query('select type from public.activity_events where notice_id = $1 order by id', [measured])).rows.map(r => r.type),
      ['view', 'block', 'apply_start', 'question', 'submit']);
    assert.equal((await db.query("select source from public.activity_events where notice_id = $1 and type = 'view'", [measured])).rows[0].source, 'alert');
    await record(measured, 'block', null, 'x2', null, ids.studentB);
    await db.query("update public.activity_events set created_at = created_at - interval '1 day' where notice_id=$1 and user_id=$2 and type='block'", [measured, ids.studentA]);
    await record(measured, 'block', null, 'x2');
    assert.equal((await db.query("select count(*)::int as n from public.activity_events where notice_id=$1 and type='block'", [measured])).rows[0].n, 3);
  });
  await check('미게시 공고와 공고에 없는 블록이나 문항은 기록하지 않는다', async () => {
    const draft = await addNotice(ids.managerA, siteData);
    await assert.rejects(record(draft, 'view', 'direct'), /게시된 공고/);
    await assert.rejects(record(measured, 'block', null, 'x3'), /본문 블록/);
    await assert.rejects(record(measured, 'question', null, null, '없는 문항'), /문항/);
    await assert.rejects(record(measured, 'view', 'other'), /활동 종류/);
    await assert.rejects(record(measured, 'submit'), /활동 종류/);
    await assert.rejects(record(measured, 'view', 'direct', null, null, null), /로그인/);
  });
  await check('작성한 블록과 요약 블록을 기록하고 기수별 조회를 유지한다', async () => {
    await record(site, 'block', null, 's1');
    const custom = await addNotice(ids.managerA, { ...siteData, blocks: [{ id: 'b1', type: 'text', text: '본문' }] }, 'published');
    await record(custom, 'block', null, 'b1');
    const withOption = await addNotice(ids.managerA, { ...notice, options: [{ id: 'first', label: '1기' }] }, 'published');
    await asUser(ids.studentB, () => db.query("select public.record_event($1,'view','browse',null,null,'first')", [withOption]));
    const event = (await db.query("select option_id,source from public.activity_events where notice_id=$1", [withOption])).rows[0];
    assert.deepEqual(event, { option_id: 'first', source: 'browse' });
  });
  const qualification = (await asUser(ids.managerA, () =>
    db.query("insert into public.qualifications(name) values ('가상 봉사 자격') returning id"))).rows[0].id;
  await db.query("insert into public.student_qualifications(user_id,qualification_id,status) values ($1,$2,'verified')", [ids.studentA, qualification]);
  const makeRule = (field, op, value) => ({ field, op, value, label: field, evidence: '가상 조건' });
  const baseRules = [
    makeRule('department','eq','가상학과'), makeRule('status','eq','재학'), makeRule('year','in',['2','3']),
    makeRule('gpa','min',3), makeRule('residence','min',12), makeRule('manual','eq','직접 확인'),
    makeRule('custom','eq',qualification),
  ];
  const eligibleProfile = { department: '가상학과', status: '재학', year: '3', gpa: '3.2', residence: 12 };
  const score = async (user, rules, candidate, target = user) => asUser(user, async () =>
    (await db.query('select public.notice_eligibility($1,$2,$3) as score',
      [JSON.stringify(rules), JSON.stringify(candidate), target])).rows[0].score);
  await check('같은 입력 표에서 JS와 SQL의 조건별 판정과 합계가 일치한다', async () => {
    const cu12 = [makeRule('cu12Course','eq','home'), makeRule('cu12Course','eq','other'), makeRule('cu12Course','eq','없음')];
    const cases = [
      [[], {}, ids.studentB], [baseRules, eligibleProfile, ids.studentA],
      [baseRules, { ...eligibleProfile, year: 3, status: '휴학', department: '다른 학과', gpa: '2.99', residence: 0 }, ids.studentB],
      [baseRules, {}, ids.studentA], [baseRules, { department: ' \n\t', year: null, residence: '', gpa: '모름' }, ids.studentB],
      [baseRules, { ...eligibleProfile, gpa: '1e9999', residence: {} }, ids.studentB],
      [cu12, { year: '1' }, ids.studentB], [cu12, { year: 4, semester: 1 }, ids.studentB],
      [cu12, { year: '4', semester: '2' }, ids.studentB], [cu12, { year: '4' }, ids.studentB], [cu12, {}, ids.studentB],
    ];
    for (const [rules, candidate, user] of cases) {
      const expected = eligibility({ rules }, candidate, user === ids.studentA ? [qualification] : []);
      assert.deepEqual(await score(user, rules, candidate), expected);
    }
  });
  await check('다른 학생의 확인 자격은 자격 판정 함수로 조회되지 않는다', async () => {
    const rules = [makeRule('custom','eq',qualification)];
    assert.equal((await score(ids.studentB, rules, {}, ids.studentA)).unknown, 1);
  });
  const writeProfile = (user, candidate) => asUser(user, () =>
    db.query('insert into public.student_state(user_id,data) values ($1,$2) on conflict(user_id) do update set data = excluded.data',
      [user, JSON.stringify({ profile: candidate, applications: {}, saved: [], read: [] })]));
  await writeProfile(ids.studentA, eligibleProfile);
  await writeProfile(ids.studentB, { ...eligibleProfile, status: '휴학' });
  await writeProfile(ids.studentC, { ...eligibleProfile, department: ' \t' });
  await writeProfile(ids.studentD, { ...eligibleProfile, gpa: '판정 불가' });
  await writeProfile(ids.managerB, eligibleProfile);
  const matchingNotice = await addNotice(ids.managerA, { ...siteData, rules: baseRules }, 'draft');
  const alertsFor = async id => (await db.query('select user_id,pass,total,unknown from public.notifications where notice_id=$1 order by user_id', [id])).rows;
  const setNoticeStatus = (id, status) => asUser(ids.managerA, () => db.query('update public.notices set status=$2 where id=$1', [id, status]));
  await check('게시할 때 미충족이 없고 기본 정보가 있는 학생에게만 알림을 만든다', async () => {
    assert.deepEqual(await alertsFor(matchingNotice), []);
    await setNoticeStatus(matchingNotice, 'published');
    const matches = [
      [ids.studentA, eligibleProfile, [qualification]],
      [ids.studentD, { ...eligibleProfile, gpa: '판정 불가' }, []],
    ];
    const expected = matches.map(([user_id, candidate, verified]) => {
      const { pass, total, unknown } = eligibility({ rules: baseRules }, candidate, verified);
      return { user_id, pass, total, unknown };
    });
    assert.deepEqual(await alertsFor(matchingNotice), expected);
    const alreadyPublished = await addNotice(ids.managerA, { ...siteData, rules: baseRules }, 'published');
    assert.deepEqual(await alertsFor(alreadyPublished), expected);
  });
  await check('게시 중 저장하면 알림이 늘지 않고 재게시해도 이미 받은 학생에게는 중복되지 않는다', async () => {
    const original = await alertsFor(matchingNotice);
    await writeProfile(ids.studentB, eligibleProfile);
    await setNoticeStatus(matchingNotice, 'published');
    assert.deepEqual(await alertsFor(matchingNotice), original);
    await setNoticeStatus(matchingNotice, 'archived');
    await setNoticeStatus(matchingNotice, 'published');
    assert.deepEqual((await alertsFor(matchingNotice)).map(row => row.user_id), [ids.studentA, ids.studentB, ids.studentD]);
  });
  const claimNotice = await addNotice(ids.managerA, { ...siteData, rules: [makeRule('custom','eq',qualification)] }, 'published');
  const claimant = ids.studentB;
  const readQualification = () => asUser(claimant, async () =>
    (await db.query('select * from public.student_qualifications where user_id=$1 and qualification_id=$2', [claimant, qualification])).rows[0]);
  const sendClaim = (note, id = claimNotice) => submit(id, { q1: '가상 지원서' }, claimant, [{ qualificationId: qualification, note }]);
  await check('신청서와 자기 신고를 함께 저장하고 본인은 확인 상태를 바꿀 수 없다', async () => {
    const row = await sendClaim('가상 봉사 활동');
    assert.deepEqual(row.claims, [{ qualificationId: qualification, note: '가상 봉사 활동' }]);
    const pending = await readQualification();
    assert.equal(pending.status, 'claimed');
    assert.equal(pending.application_id, row.id);
    assert.equal(pending.note, '가상 봉사 활동');
    await assert.rejects(asUser(claimant, () => db.query("update public.student_qualifications set status='verified' where qualification_id=$1", [qualification])), /permission denied/i);
  });
  await check('잘못된 자격이나 긴 설명이 있으면 신청서와 제출 기록을 함께 되돌린다', async () => {
    const before = await readAs(claimant, claimNotice);
    const events = async () => (await db.query("select id from public.activity_events where notice_id=$1 and type='submit' order by id", [claimNotice])).rows;
    const oldEvents = await events();
    await assert.rejects(sendClaim('x'.repeat(501)), /자기 신고/);
    await assert.rejects(sendClaim('다른 공고 신청 시도', site), /자기 신고/);
    const duplicate = { qualificationId: qualification, note: '' };
    await assert.rejects(submit(claimNotice, { q1: '다른 답' }, claimant, [duplicate, duplicate]), /두 번/);
    assert.deepEqual(await readAs(claimant, claimNotice), before);
    assert.deepEqual(await events(), oldEvents);
  });
  await check('반려 후 재신고하면 확인 대기로 바뀌고 이미 확인된 행은 그대로 남는다', async () => {
    const setDecision = status => db.query('update public.student_qualifications set status=$1, decided_by=$2, decided_at=now() where user_id=$3 and qualification_id=$4',
      [status, ids.managerA, claimant, qualification]);
    await setDecision('rejected');
    await sendClaim('다시 작성한 설명');
    const pending = await readQualification();
    assert.equal(pending.status, 'claimed');
    assert.equal(pending.note, '다시 작성한 설명');
    assert.equal(pending.decided_by, null);
    assert.equal(pending.decided_at, null);
    await setDecision('verified');
    const verified = await readQualification();
    await sendClaim('다른 설명');
    assert.deepEqual(await readQualification(), verified);
  });
  const { demoStudents } = await import('./seed-demo.mjs');
  const { demoAccountAttributes } = await import('./student-demo-admin.mjs');
  const demoNotices = [];
  for (const title of ['가상 장학금', '가상 워크숍', '가상 멘토링']) {
    const data = { ...siteData, title,
      blocks: ['대상','일정','준비','절차'].map((text,i) => ({ id: 'b'+i, type: 'text', text })),
      questions: [
        { id:'p1', type:'profile', label:'학과', profileField:'department', required:true },
        { id:'q2', type:'select', label:'기수', options:['1기','2기'], required:true },
        { id:'q3', type:'short', label:'지원 분야', max:30, required:true },
        { id:'q4', type:'long', label:'지원 동기', max:100, required:true },
      ],
    };
    demoNotices.push({ ...data, id: await addNotice(ids.managerA, data, 'published') });
  }
  const demoNoticeIds = demoNotices.map(n => n.id);
  const demoPlan = demoStudents(demoNotices);
  const demoUserIds = [];
  const seedStudent = (user, row, targetIds = demoNoticeIds, role = 'service_role') => asUser(null, () =>
    db.query('select public.replace_student_demo($1,$2,$3,$4,$5)', [user, targetIds, JSON.stringify(row.profile),
      JSON.stringify(row.events), JSON.stringify(row.applications)]), role);
  const demoCounts = async () => (await db.query(
    "select (select count(*)::int from public.activity_events where user_id=any($1::uuid[]) and notice_id=any($2::uuid[])) events, " +
    "(select count(*)::int from public.applications where user_id=any($1::uuid[]) and notice_id=any($2::uuid[])) applications",
    [demoUserIds, demoNoticeIds])).rows[0];
  await check('실제 시연 계획으로 40개 계정에 프로필, 측정과 신청서를 넣는다', async () => {
    assert.equal(demoPlan.length, 40);
    for (const [i,row] of demoPlan.entries()) {
      const number = String(i + 1).padStart(2,'0');
      assert.equal(row.loginId, 'demo'+number);
      assert.equal(row.profile.name, '가상 학생 '+number);
      const attrs = demoAccountAttributes(row.loginId, 'local-test-password');
      const uid = (await db.query("insert into auth.users(id,email,raw_app_meta_data) values (gen_random_uuid(),$1,$2) returning id",
        [attrs.email, attrs.app_metadata])).rows[0].id;
      demoUserIds.push(uid);
      await seedStudent(uid, row);
    }
    assert.equal((await db.query('select count(*)::int as n from public.student_state where user_id=any($1::uuid[])', [demoUserIds])).rows[0].n, 40);
    const expected = demoPlan.reduce((s,row) => ({ events:s.events+row.events.length, applications:s.applications+row.applications.length }),
      { events:0, applications:0 });
    assert.deepEqual(await demoCounts(), expected);
    assert.equal(expected.applications, 27);
    for (const [i,id] of demoNoticeIds.entries()) {
      const rows = (await db.query('select type,count(distinct user_id)::int n from public.activity_events where notice_id=$1 group by type', [id])).rows;
      const counts = Object.fromEntries(rows.map(r => [r.type, r.n]));
      assert.equal(counts.view, [40,36,32][i]);
      assert.equal(counts.submit, [13,9,5][i]);
      assert.ok(counts.view > counts.apply_start && counts.apply_start > counts.question && counts.question > counts.submit && counts.submit > 0);
      const sources = await db.query("select distinct source from public.activity_events where notice_id=$1 and type='view' order by source", [id]);
      assert.deepEqual(sources.rows.map(r => r.source), ['alert','browse','direct','kakao']);
      const reaches = (await db.query(
        "select coalesce(block_id,question_id) item, count(distinct user_id)::int n from public.activity_events " +
        "where notice_id=$1 and type in ('block','question') group by item", [id])).rows;
      const byItem = Object.fromEntries(reaches.map(r => [r.item,r.n]));
      assert.equal(byItem.b0 - byItem.b1, 11);
      assert.equal(byItem.p1 - byItem.q2, 6);
    }
  });
  await check('같은 시연 계획을 다시 넣어도 인원과 신청서 ID가 같고 다른 공고의 기록은 보존된다', async () => {
    const counts = await demoCounts();
    const appIds = async () => (await db.query('select id from public.applications where user_id=any($1::uuid[]) and notice_id=any($2::uuid[]) order by id', [demoUserIds,demoNoticeIds])).rows;
    const beforeApps = await appIds();
    const uid = demoUserIds[0];
    await db.query("update public.student_state set data=jsonb_set(data,'{saved}',$2) where user_id=$1", [uid, JSON.stringify([site])]);
    await db.query("insert into public.activity_events(user_id,notice_id,type) values ($1,$2,'interest')", [uid,site]);
    for (const [i,row] of demoPlan.entries()) await seedStudent(demoUserIds[i], row);
    assert.deepEqual(await demoCounts(), counts);
    assert.deepEqual(await appIds(), beforeApps);
    assert.deepEqual((await db.query("select data->'saved' as saved from public.student_state where user_id=$1", [uid])).rows[0].saved, [site]);
    assert.equal((await db.query("select type from public.activity_events where user_id=$1 and notice_id=$2", [uid,site])).rows[0].type, 'interest');
  });
  await check('일반 계정, 담당자, 일반 로그인 권한 및 범위 밖 공고의 시연 기록을 거절한다', async () => {
    const uid = demoUserIds[0], row = demoPlan[0], before = await demoCounts();
    await assert.rejects(seedStudent(ids.studentA, row), /시연용 학생/);
    await assert.rejects(seedStudent(uid, row, demoNoticeIds, 'authenticated'), /permission denied/i);
    await db.query('insert into public.manager_grants(user_id) values ($1)', [uid]);
    await assert.rejects(seedStudent(uid, row), /시연용 학생/);
    await db.query('delete from public.manager_grants where user_id=$1', [uid]);
    await assert.rejects(seedStudent(uid, row, [demoNoticeIds[0],demoNoticeIds[0],demoNoticeIds[2]]), /서로 다른/);
    await assert.rejects(seedStudent(uid, { ...row, events:[{ notice_id:site, type:'view', source:'direct' }] }), /지정한 공고/);
    await assert.rejects(seedStudent(uid, { ...row, applications:[{ notice_id:site }] }), /지정한 공고/);
    await assert.rejects(seedStudent(uid, { ...row, events:[{ notice_id:demoNoticeIds[0], type:'block' }] }), /constraint/i);
    assert.deepEqual(await demoCounts(), before);
  });
  console.log(`\n${passed()} student database checks passed against PostgreSQL RLS in PGlite.`);
} finally { await db.close(); }
