// DB checks for the manager night session. The session fills its tests here.
import assert from 'node:assert/strict';
import { createDb } from './db-harness.mjs';
import { editorNotice, newBlock, newQuestion, withType } from '../src/notice-editor.js';
import { blockRows, stageRows } from '../src/funnel.js';

const { db, ids, asUser, addNotice, check, notice, passed } = await createDb({ prefixes: ['2026112602'] });
try {
  await check('기반이 열린다', () => asUser(ids.studentA, async () => {
    assert.deepStrictEqual((await db.query('select id from public.applications')).rows, []);
  }));

  // M2. Form lock.
  const siteNotice = { ...notice, applyMode: 'site', questions: [
    { id: 'q-a1', type: 'profile', label: '이름', profileField: 'name', required: true },
    { id: 'q-b2', type: 'short', label: '지원 분야', hint: '한 줄로 적어 주세요', max: 100, required: true },
    { id: 'q-c3', type: 'long', label: '지원 동기', hint: '', max: 1000, required: true },
    { id: 'q-d4', type: 'select', label: '희망 기수', options: ['1기', '2기'], required: false },
  ] };
  const read = async id => (await db.query('select data from public.notices where id = $1', [id])).rows[0].data;
  const save = (id, data, owner = ids.managerA) => asUser(owner, () => db.query('update public.notices set data = $1 where id = $2', [data, id]));
  const withQuestions = (data, edit) => ({ ...data, questions: edit(data.questions.map(q => ({ ...q }))) });
  const locked = async (id, data, pattern = /문항 구조를 바꿀 수 없습니다/) => assert.rejects(save(id, data), pattern);
  const structureChanges = base => ({
    '삭제': withQuestions(base, qs => qs.slice(1)),
    '추가': withQuestions(base, qs => [...qs, { id: 'q-e5', type: 'short', label: '추가 문항', max: 50, required: false }]),
    '순서 변경': withQuestions(base, qs => [qs[1], qs[0], ...qs.slice(2)]),
    'type 변경': withQuestions(base, qs => { qs[2].type = 'short'; qs[2].max = 200; return qs; }),
    'required 변경': withQuestions(base, qs => { qs[1].required = false; return qs; }),
    'max 변경': withQuestions(base, qs => { qs[1].max = 150; return qs; }),
    '선택지 변경': withQuestions(base, qs => { qs[3].options = ['1기', '3기']; return qs; }),
    'profileField 변경': withQuestions(base, qs => { qs[0].profileField = 'studentNo'; return qs; }),
  });

  await check('게시 전 초안은 문항을 자유롭게 바꿀 수 있다', async () => {
    const id = await addNotice(ids.managerA, siteNotice);
    for (const data of Object.values(structureChanges(siteNotice))) await save(id, data);
    await save(id, { ...siteNotice, applyMode: 'external' });
    assert.equal((await read(id)).applyMode, 'external');
  });

  const publishedId = await addNotice(ids.managerA, siteNotice, 'published');
  for (const [name, data] of Object.entries(structureChanges(siteNotice))) {
    await check(`게시 후 문항 ${name}: 거절`, () => locked(publishedId, data));
  }

  await check('게시 후 label과 hint 변경은 통과한다', async () => {
    const data = withQuestions(siteNotice, qs => { qs[1].label = '희망 분야'; qs[2].hint = '500자 안팎으로 적어 주세요'; return qs; });
    await save(publishedId, data);
    const saved = await read(publishedId);
    assert.equal(saved.questions[1].label, '희망 분야');
    assert.equal(saved.questions[2].hint, '500자 안팎으로 적어 주세요');
  });

  await check('게시 후 본문 블록과 자격 조건 변경은 통과한다', async () => {
    const current = await read(publishedId);
    await save(publishedId, { ...current, title: '고친 제목',
      blocks: [{ id: 'b-1', type: 'heading', text: '모집 대상' }, { id: 'b-2', type: 'text', text: '재학생을 모집합니다.' }],
      rules: [...current.rules, { field: 'gpa', op: 'min', value: 3, label: '학점 3.0 이상', evidence: '평점 3.0 이상' }] });
    const saved = await read(publishedId);
    assert.equal(saved.blocks.length, 2);
    assert.equal(saved.rules.length, 2);
  });

  await check('게시 후 applyMode 변경은 거절된다', async () => {
    const current = await read(publishedId);
    await locked(publishedId, { ...current, applyMode: 'external' }, /신청 방식을 바꿀 수 없습니다/);
    const { applyMode, ...withoutMode } = current;
    await locked(publishedId, withoutMode, /신청 방식을 바꿀 수 없습니다/);
  });

  await check('applyMode가 없는 값과 external은 같은 것으로 본다', async () => {
    const id = await addNotice(ids.managerA, notice, 'published');
    await save(id, { ...notice, applyMode: 'external' });
    await save(id, { ...notice, applyMode: null });
  });

  await check('게시 종료한 공고도 문항 구조 변경이 거절된다', async () => {
    const id = await addNotice(ids.managerA, siteNotice, 'published');
    await asUser(ids.managerA, () => db.query("update public.notices set status = 'archived' where id = $1", [id]));
    for (const data of Object.values(structureChanges(siteNotice))) await locked(id, data);
    await save(id, withQuestions(siteNotice, qs => { qs[0].label = '성명'; return qs; }));
  });

  await check('id가 없는 옛 문항 공고도 같은 규칙으로 동작한다', async () => {
    const legacy = { ...notice, questions: [{ label: '지원 동기', hint: '직접 작성', max: 1000 }, { label: '활동 계획', hint: '', max: 500 }] };
    const id = await addNotice(ids.managerA, legacy, 'published');
    await locked(id, withQuestions(legacy, qs => qs.slice(1)));
    await locked(id, withQuestions(legacy, qs => [...qs, { label: '추가', hint: '', max: 100 }]));
    await locked(id, withQuestions(legacy, qs => [qs[1], qs[0]]));
    await locked(id, withQuestions(legacy, qs => { qs[0].max = 800; return qs; }));
    await locked(id, withQuestions(legacy, qs => { qs[0].required = false; return qs; }));
    await save(id, withQuestions(legacy, qs => { qs[0].label = '참여 동기'; qs[1].hint = '학기별로 적어 주세요'; return qs; }));
    // Writing the filled-in id, type and required leaves the structure the same.
    await save(id, { ...legacy, questions: (await db.query('select public.notice_questions($1) as q', [legacy])).rows[0].q });
  });

  await check('편집기가 저장하는 모양은 게시와 양식 잠금을 통과한다', async () => {
    const legacy = { ...notice, excerpt: '첫 줄\n둘째 줄', questions: [{ label: '지원 동기', hint: '직접 작성', max: 1000 }] };
    const id = await addNotice(ids.managerA, legacy, 'published');
    const opened = editorNotice(legacy);
    await save(id, { ...opened, questions: opened.questions.map(q => ({ ...q, label: '참여 동기' })) });
    assert.deepEqual((await read(id)).blocks.map(b => b.id), ['x1', 'x2']);
    const heading = { ...newBlock('heading'), text: '모집 대상' };
    const fresh = editorNotice({ ...notice, applyMode: 'site', sourceUrl: '', applicationUrl: '', tasks: [], blocks: [heading],
      questions: [withType(newQuestion(), 'profile'), { ...withType(newQuestion(), 'select'), label: '기수', options: ['1기', '2기'] }, { ...newQuestion(), label: '동기' }] });
    const freshId = await addNotice(ids.managerA, fresh, 'published');
    assert.deepEqual(editorNotice(await read(freshId)), fresh);
  });

  await check('운영자 계정의 변경은 막지 않는다', async () => {
    await db.query('update public.notices set data = $1 where id = $2', [withQuestions(siteNotice, qs => qs.slice(1)), publishedId]);
    assert.equal((await read(publishedId)).questions.length, 3);
  });

  // M3. Applicants. The student session owns submit_application, so rows go in directly as the superuser.
  const applicantNoticeId = await addNotice(ids.managerA, siteNotice, 'published');
  const qualificationId = (await db.query("insert into public.qualifications(owner_id, name) values ($1, '봉사 30시간') returning id", [ids.managerA])).rows[0].id;
  const applicationId = (await db.query(`insert into public.applications(notice_id, user_id, answers, profile_snapshot, eligibility, claims)
    values ($1, $2, $3, $4, $5, $6) returning id`, [applicantNoticeId, ids.studentA, { 'q-b2': '데이터 분석' }, { name: '학생 A', studentNo: '202612345' },
    { results: [], pass: 1, fail: 0, unknown: 0, total: 1 }, JSON.stringify([{ qualificationId, note: '확인서 있음' }])])).rows[0].id;
  await db.query("insert into public.student_qualifications(user_id, qualification_id, note, application_id) values ($1, $2, '확인서 있음', $3)", [ids.studentA, qualificationId, applicationId]);
  const applicationsOf = owner => asUser(owner, async () => (await db.query('select id from public.applications where notice_id = $1', [applicantNoticeId])).rows);
  const claimsOf = owner => asUser(owner, async () => (await db.query('select qualification_id, status from public.student_qualifications where application_id = $1', [applicationId])).rows);

  await check('담당자 A는 자기 공고의 신청서와 자기 신고를 읽는다', async () => {
    assert.deepEqual(await applicationsOf(ids.managerA), [{ id: applicationId }]);
    assert.deepEqual(await claimsOf(ids.managerA), [{ qualification_id: qualificationId, status: 'claimed' }]);
  });

  await check('담당자 B는 담당자 A 공고의 신청서와 자기 신고를 읽지 못한다', async () => {
    assert.deepEqual(await applicationsOf(ids.managerB), []);
    assert.deepEqual(await claimsOf(ids.managerB), []);
    assert.deepEqual(await asUser(ids.managerB, async () => (await db.query('select id from public.applications')).rows), []);
    assert.deepEqual(await asUser(ids.managerB, async () => (await db.query('select user_id from public.student_qualifications')).rows), []);
  });

  // M4. Funnel. Events go in directly as the superuser. The harness has 4 students, so 6 more are added.
  const students = [ids.studentA, ids.studentB, ids.studentC, ids.studentD];
  for (let i = 1; i <= 6; i++) {
    const id = `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`;
    await db.query('insert into auth.users(id,email) values ($1,$2)', [id, `funnel${i}@example.invalid`]);
    students.push(id);
  }
  const funnelNotice = {...siteNotice, blocks: [{id: 'b-1', type: 'heading', text: '모집 대상'}, {id: 'b-2', type: 'text', text: '재학생을 모집합니다.'}, {id: 'b-3', type: 'text', text: '문의는 학생지원팀으로 합니다.'}]};
  const funnelId = await addNotice(ids.managerA, funnelNotice, 'published');
  const event = (user, type, extra = {}, at = null) => db.query(`insert into public.activity_events(user_id, notice_id, type, source, block_id, question_id, created_at)
    values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`, [user, funnelId, type, extra.source || null, extra.block || null, extra.question || null, at]);
  const each = async (count, run) => { for (const user of students.slice(0, count)) await run(user); };
  await each(6, user => event(user, 'view', {source: 'alert'}));
  for (const user of students.slice(6)) await event(user, 'view', {source: 'browse'});
  await each(5, user => event(user, 'view', {source: 'direct'}));
  await each(10, user => event(user, 'block', {block: 'b-1'}));
  await event(students[0], 'block', {block: 'b-1'});
  await each(8, user => event(user, 'block', {block: 'b-2'}));
  await each(5, user => event(user, 'block', {block: 'b-3'}));
  await each(6, user => event(user, 'block', {block: 'b-old'}));
  await each(7, user => event(user, 'apply_start'));
  await each(7, user => event(user, 'question', {question: 'q-a1'}));
  await event(students[0], 'question', {question: 'q-a1'});
  await each(6, user => event(user, 'question', {question: 'q-b2'}));
  await each(3, user => event(user, 'question', {question: 'q-c3'}));
  await each(5, user => event(user, 'submit'));
  await event(students[9], 'apply_start', {}, new Date(Date.now() - 40 * 86400000).toISOString());
  for (const manager of [ids.managerA, ids.managerB]) {
    await event(manager, 'view', {source: 'kakao'});
    await event(manager, 'block', {block: 'b-3'});
    await event(manager, 'question', {question: 'q-c3'});
    await event(manager, 'submit');
  }
  const todayKst = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as d")).rows[0].d;
  const fromKst = (await db.query("select ((now() at time zone 'Asia/Seoul')::date - 7)::text as d")).rows[0].d;
  const funnelOf = (user, id = funnelId) => asUser(user, async () => (await db.query('select public.notice_funnel($1, $2, $3) as f', [id, fromKst, todayKst])).rows[0].f);

  await check('notice_funnel이 유입, 단계, 블록, 문항별 고유 학생 수를 맞게 센다', async () => {
    const f = await funnelOf(ids.managerA);
    assert.deepEqual(f.sources, {alert: 6, kakao: 0, browse: null, direct: 5});
    assert.deepEqual(f.stages, {view: 10, apply_start: 7, question: 7, submit: 5, start: 0, link: 0, complete: 0});
    assert.deepEqual(f.blocks, {'b-1': 10, 'b-2': 8, 'b-3': 5, 'b-old': 6});
    assert.deepEqual(f.questions, {'q-a1': 7, 'q-b2': 6, 'q-c3': null});
    assert.equal(f.suppressed, true);
    assert.equal(f.fromDate, fromKst);
    const reach = blockRows(funnelNotice, f.blocks);
    assert.deepEqual(reach.rows.map(row => row.count), [10, 8, 5]);
    assert.deepEqual(reach.deleted, {blocks: 1, count: 6});
    assert.equal(reach.dropIndex, 2);
    assert.deepEqual(stageRows(funnelNotice, f.stages).map(row => row.rate), [null, 70, 100, 71]);
  });

  await check('notice_funnel은 담당자 계정과 기간 밖 기록을 빼고 1~4명은 null로 돌려준다', async () => {
    const f = await funnelOf(ids.managerA);
    assert.equal(f.sources.kakao, 0);
    assert.equal(f.blocks['b-3'], 5);
    assert.equal(f.stages.submit, 5);
    assert.equal(f.stages.apply_start, 7);
    assert.equal(f.questions['q-c3'], null);
    assert.equal(f.sources.browse, null);
  });

  await check('담당자 B와 학생은 담당자 A 공고의 notice_funnel을 부르지 못한다', async () => {
    await assert.rejects(funnelOf(ids.managerB), /담당 공고의 집계만/);
    await assert.rejects(funnelOf(ids.studentA), /담당 공고의 집계만/);
    await assert.rejects(asUser(null, () => db.query('select public.notice_funnel($1, $2, $3)', [funnelId, fromKst, todayKst]), 'anon'));
  });

  await check('notice_funnel은 367일보다 긴 기간을 거절한다', async () => {
    await assert.rejects(asUser(ids.managerA, () => db.query("select public.notice_funnel($1, '2025-01-01', '2026-11-25')", [funnelId])), /최대 367일/);
  });

  // M7. Custom qualifications and decide_qualification. The claim is studentA's row from M3 on manager A's notice.
  const decide = (user, verified, qualification = qualificationId, student = ids.studentA) => asUser(user,
    async () => (await db.query('select public.decide_qualification($1, $2, $3) as s', [student, qualification, verified])).rows[0].s);
  const claimRow = async () => (await db.query('select status, decided_by, decided_at from public.student_qualifications where user_id = $1 and qualification_id = $2', [ids.studentA, qualificationId])).rows[0];

  await check('담당자 B와 학생은 담당자 A 공고의 신고를 확인하지 못하고 줄은 그대로다', async () => {
    await assert.rejects(decide(ids.managerB, true), /담당 공고에 들어온 자기 신고만/);
    await assert.rejects(decide(ids.studentA, true), /담당 공고에 들어온 자기 신고만/);
    await assert.rejects(asUser(null, () => db.query('select public.decide_qualification($1, $2, true)', [ids.studentA, qualificationId]), 'anon'));
    assert.deepEqual(await claimRow(), {status: 'claimed', decided_by: null, decided_at: null});
  });

  await check('담당자 A가 확인하면 verified와 확인한 사람, 시각이 들어간다', async () => {
    assert.equal(await decide(ids.managerA, true), 'verified');
    const row = await claimRow();
    assert.equal(row.status, 'verified');
    assert.equal(row.decided_by, ids.managerA);
    assert.ok(row.decided_at instanceof Date);
  });

  await check('확인한 신고는 반려로 바꿀 수 있고 다시 확인할 수 있다', async () => {
    assert.equal(await decide(ids.managerA, false), 'rejected');
    assert.equal((await claimRow()).status, 'rejected');
    assert.equal(await decide(ids.managerA, true), 'verified');
  });

  await check('없는 신고는 확인하지 못한다', async () => {
    await assert.rejects(decide(ids.managerA, true, qualificationId, ids.studentB), /담당 공고에 들어온 자기 신고만/);
  });

  await check('담당자는 자격을 만들고 같은 이름은 거절되며 그 자격 조건의 사이트 접수 공고가 게시된다', async () => {
    const created = await asUser(ids.managerA, async () => (await db.query("insert into public.qualifications(owner_id, name, description) values ($1, '교내 봉사 인증', '봉사센터 확인서') returning id", [ids.managerA])).rows[0].id);
    await assert.rejects(asUser(ids.managerB, () => db.query("insert into public.qualifications(owner_id, name) values ($1, '교내 봉사 인증')", [ids.managerB])), /duplicate key|unique/);
    const custom = {...siteNotice, rules: [{field: 'custom', op: 'eq', value: created, label: '교내 봉사 인증', evidence: '봉사센터 확인서 제출자'}]};
    const id = await addNotice(ids.managerA, custom, 'published');
    assert.equal((await db.query('select status from public.notices where id = $1', [id])).rows[0].status, 'published');
    await assert.rejects(addNotice(ids.managerA, {...custom, rules: [{...custom.rules[0], value: '00000000-0000-4000-8000-0000000000ff'}]}, 'published'), /직접 만든 자격/);
  });

  console.log(`\n${passed()} manager database checks passed against PostgreSQL RLS in PGlite.`);
} finally { await db.close(); }
