// Checks for supabase/migrations/202611260001_foundation.sql. See docs/tasks/FOUNDATION.md F3.
import assert from 'node:assert/strict';
import { createDb } from './db-harness.mjs';
import { noticeQuestions } from '../src/contract.js';

const { db, ids, asUser, denied, addNotice, check, notice, passed } = await createDb();
const admin = async (sql, params) => (await db.query(sql, params)).rows;
const rejects = (run, message) => assert.rejects(run, e => message.test(e.message));
const publish = (payload, owner = ids.managerA) => addNotice(owner, payload, 'published');

const { sourceUrl, applicationUrl, ...noUrls } = notice;
const site = {
  title: 'Site application notice', department: 'Test office', summary: 'Apply on this site', reviewed: true,
  applyMode: 'site', rules: [], tasks: [],
  questions: [
    { id: 'q-a1', type: 'profile', label: '이름', profileField: 'name', required: true },
    { id: 'q-b2', type: 'short', label: '지원 분야', hint: '한 줄로', max: 100, required: true },
    { id: 'q-c3', type: 'long', label: '지원 동기', hint: '', max: 1000, required: true },
    { id: 'q-d4', type: 'select', label: '희망 기수', options: ['1기', '2기'], required: false },
  ],
  blocks: [
    { id: 'b-1', type: 'heading', text: '모집 대상' },
    { id: 'b-2', type: 'text', text: '본교 재학생을 모집합니다.' },
    { id: 'b-3', type: 'image', src: 'https://example.supabase.co/storage/v1/object/public/notice-images/a.png', alt: '일정표' },
  ],
};
const withQuestion = (patch, index = 1) => ({ ...site, questions: site.questions.map((q, i) => i === index ? { ...q, ...patch } : q) });
const withBlock = (patch, index = 1) => ({ ...site, blocks: site.blocks.map((b, i) => i === index ? { ...b, ...patch } : b) });
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

try {
  await check('old-shape notice without applyMode, blocks or question ids publishes', async () => {
    assert.ok(await publish(notice));
  });
  await check('site notice publishes without source URL, application URL or tasks', async () => {
    assert.ok(await publish(site));
  });
  await check('external notice without source URL is rejected, with or without applyMode', async () => {
    await rejects(() => publish({ ...noUrls, applyMode: 'external' }), /필수 정보/);
    await rejects(() => publish(noUrls), /필수 정보/);
  });

  const [{ id: qualId }] = await admin("insert into public.qualifications(owner_id,name) values ($1,'봉사 30시간') returning id", [ids.managerA]);
  const custom = value => ({ field: 'custom', op: 'eq', value, label: '봉사 30시간 이상', evidence: '담당자가 직접 확인' });
  await check('custom rule referencing an existing qualification publishes', async () => {
    assert.ok(await publish({ ...site, rules: [custom(qualId)] }));
  });

  const invalid = [
    ['bad applyMode value', { ...site, applyMode: 'email' }, /신청 방식/],
    ['typed question missing id', withQuestion({ id: undefined }), /id, 종류/],
    ['duplicate question ids', withQuestion({ id: 'q-a1' }), /문항 id가 서로/],
    ['required not boolean', withQuestion({ required: 'yes' }), /필수 여부/],
    ['profile with bad profileField', withQuestion({ profileField: 'email' }, 0), /기본 정보 문항/],
    ['short max 201', withQuestion({ max: 201 }), /단답 문항/],
    ['long max 10001', withQuestion({ max: 10001 }, 2), /서술형 문항/],
    ['select with 1 option', withQuestion({ options: ['1기'] }, 3), /선택지를 2~20개/],
    ['select with 21 options', withQuestion({ options: Array.from({ length: 21 }, (_, i) => `${i + 1}기`) }, 3), /선택지를 2~20개/],
    ['blocks not array', { ...site, blocks: { id: 'b-1' } }, /60개 이하의 목록/],
    ['61 blocks', { ...site, blocks: Array.from({ length: 61 }, (_, i) => ({ id: `b${i}`, type: 'text', text: '글' })) }, /60개 이하의 목록/],
    ['duplicate block id', withBlock({ id: 'b-1' }), /서로 다른 id/],
    ['bad block type', withBlock({ type: 'video' }), /블록의 종류/],
    ['empty text block', withBlock({ text: '  ' }), /1~2000자/],
    ['2001-char text block', withBlock({ text: 'a'.repeat(2001) }), /1~2000자/],
    ['image without https src', withBlock({ src: 'http://example.com/a.png' }, 2), /HTTPS 이미지/],
    ['image without alt', withBlock({ alt: undefined }, 2), /HTTPS 이미지/],
    ['custom rule with unknown qualification id', { ...site, rules: [custom('00000000-0000-4000-8000-0000000000ff')] }, /자격 목록/],
    ["custom rule with op 'in'", { ...site, rules: [{ ...custom(qualId), op: 'in', value: [qualId] }] }, /자격 목록/],
  ];
  for (const [label, payload, message] of invalid)
    await check(`rejected: ${label}`, () => rejects(() => publish(JSON.parse(JSON.stringify(payload))), message));

  await check('notice_questions matches noticeQuestions for the same inputs', async () => {
    const inputs = [
      {},
      { questions: [] },
      { questions: notice.questions.concat({ label: '경험', max: 500 }) },
      { questions: [{ label: '옛 문항', max: 300 }, { id: 'q-x', type: 'short', label: '단답', max: 50, required: false }, { label: '종류만', type: 'select', options: ['a', 'b'] }] },
      { questions: [{ id: null, label: 'null id', max: 100, required: null, type: null }] },
    ];
    for (const input of inputs) {
      const [{ q }] = await admin('select public.notice_questions($1) as q', [input]);
      assert.deepStrictEqual(q, JSON.parse(JSON.stringify(noticeQuestions(input))));
    }
  });

  const noticeA = await publish(notice, ids.managerA);
  const noticeB = await publish(notice, ids.managerB);
  const app = async (user, noticeId) => (await admin('insert into public.applications(notice_id,user_id) values ($1,$2) returning id', [noticeId, user]))[0].id;
  const appA = await app(ids.studentA, noticeA), appB = await app(ids.studentB, noticeA), appC = await app(ids.studentC, noticeB);
  await admin('insert into public.student_qualifications(user_id,qualification_id,application_id) values ($1,$3,$4),($2,$3,$5)', [ids.studentA, ids.studentC, qualId, appA, appC]);
  const [{ id: noteA }] = await admin('insert into public.notifications(user_id,notice_id,pass,total,unknown) values ($1,$2,1,1,0) returning id', [ids.studentA, noticeA]);
  const [{ id: noteB }] = await admin('insert into public.notifications(user_id,notice_id,pass,total,unknown) values ($1,$2,1,1,0) returning id', [ids.studentB, noticeA]);
  const select = (user, table, column = 'user_id') => asUser(user, async () => (await db.query(`select ${column} from public.${table}`)).rows.map(r => r[column]).sort());

  await check('student reads own application and not another student\'s', async () => {
    assert.deepStrictEqual(await select(ids.studentA, 'applications', 'id'), [appA]);
    assert.deepStrictEqual(await select(ids.studentB, 'applications', 'id'), [appB]);
  });
  await check('manager reads applications on own notice, not on another manager\'s', async () => {
    assert.deepStrictEqual(await select(ids.managerA, 'applications', 'id'), [appA, appB].sort());
    assert.deepStrictEqual(await select(ids.managerB, 'applications', 'id'), [appC]);
  });
  await check('student_qualifications: own rows and the owning manager via application_id', async () => {
    assert.deepStrictEqual(await select(ids.studentA, 'student_qualifications'), [ids.studentA]);
    assert.deepStrictEqual(await select(ids.studentB, 'student_qualifications'), []);
    assert.deepStrictEqual(await select(ids.managerA, 'student_qualifications'), [ids.studentA]);
    assert.deepStrictEqual(await select(ids.managerB, 'student_qualifications'), [ids.studentC]);
  });
  await check('students cannot insert into applications, student_qualifications or notifications', () => asUser(ids.studentD, async () => {
    await denied(() => db.query('insert into public.applications(notice_id,user_id) values ($1,$2)', [noticeA, ids.studentD]));
    await denied(() => db.query('insert into public.student_qualifications(user_id,qualification_id) values ($1,$2)', [ids.studentD, qualId]));
    await denied(() => db.query('insert into public.notifications(user_id,notice_id,pass,total,unknown) values ($1,$2,1,1,0)', [ids.studentD, noticeA]));
  }));
  await check('student updates own notification read_at only', () => asUser(ids.studentA, async () => {
    assert.equal((await db.query('update public.notifications set read_at=now() where id=$1 returning id', [noteA])).rows.length, 1);
    await denied(() => db.query('update public.notifications set pass=0 where id=$1', [noteA]));
    assert.equal((await db.query('update public.notifications set read_at=now() where id=$1 returning id', [noteB])).rows.length, 0);
    assert.equal((await admin('select read_at from public.notifications where id=$1', [noteB]))[0]?.read_at ?? null, null);
  }));
  await check('manager creates a qualification; student and forged owner_id cannot', async () => {
    await asUser(ids.managerA, () => db.query("insert into public.qualifications(name) values ('토익 800')"));
    await asUser(ids.managerA, () => db.query("insert into public.qualifications(owner_id,name) values ($1,'컴활 1급')", [ids.managerA]));
    await asUser(ids.studentA, () => denied(() => db.query("insert into public.qualifications(name) values ('학생 자격')")));
    await asUser(ids.managerA, () => denied(() => db.query("insert into public.qualifications(owner_id,name) values ($1,'남의 자격')", [ids.managerB])));
    assert.equal((await admin("select owner_id from public.qualifications where name='토익 800'"))[0].owner_id, ids.managerA);
  });
  await check('anon cannot select the four new tables', () => asUser(null, async () => {
    for (const table of ['applications', 'qualifications', 'student_qualifications', 'notifications'])
      await denied(() => db.query(`select * from public.${table}`));
  }, 'anon'));

  const event = (type, extra = {}) => admin(
    'insert into public.activity_events(user_id,notice_id,type,source,block_id,question_id) values ($1,$2,$3,$4,$5,$6)',
    [ids.studentA, noticeA, type, extra.source ?? null, extra.block ?? null, extra.question ?? null]);
  await check('event rows: new types pass and column checks hold', async () => {
    await event('block', { block: 'b-1' });
    await denied(() => event('block'));
    await event('question', { question: 'q-a1' });
    await denied(() => event('question'));
    await denied(() => event('view', { block: 'b-1' }));
    await event('view', { source: 'kakao' });
    await denied(() => event('view', { source: 'bogus' }));
    await event('apply_start');
    await event('submit');
  });

  console.log(`\n${passed()} foundation database checks passed against PostgreSQL RLS in PGlite.`);
} finally { await db.close(); }
