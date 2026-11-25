// LG-04: metrics count student accounts only. LG-03: a profile reset does not keep old follow-up checks.
// Own PGlite instance so the main test-db.mjs state (revoked grants, extra events) does not leak in.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const root = new URL('../../', import.meta.url);
const run = async file => db.exec(await readFile(new URL(file, root), 'utf8'));
await run('supabase/tests/bootstrap.sql');
await run('supabase/migrations/202611100001_initial.sql');
await db.exec('create role service_role nologin');
for (const name of ['202611160001_guides', '202611240001_id_auth', '202611240002_manager_overview', '202611240003_option_activity',
  '202611240004_followup_activity', '202611240005_open_notices', '202611250001_public_notices', '202611250002_student_only_metrics'])
  await run(`supabase/migrations/${name}.sql`);

const uid = i => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`;
const owner = uid(1), otherManager = uid(2), students = [3, 4, 5, 6, 7].map(uid);
for (const id of [owner, otherManager, ...students]) await db.query('insert into auth.users(id) values ($1)', [id]);
for (const id of [owner, otherManager]) await db.query('insert into public.manager_grants(user_id) values ($1)', [id]);

let passed = 0, failed = 0;
async function check(label, body) {
  try { await body(); passed++; console.log(`PASS ${label}`); } catch (e) { failed++; console.log(`FAIL ${label}: ${e.message}`); }
}
async function asUser(id, body) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await body(); } finally { await db.exec('reset role'); }
}
const steps = [{ id: 's1', label: '합격 확인', evidence: '발표 후 확인' }];
const base = { title: 'Scope notice', category: '프로젝트', department: 'Test office', summary: 'Verified test fixture', deadline: '2026-12-01',
  sourceUrl: 'https://www.catholic.ac.kr/test', applicationUrl: 'https://www.catholic.ac.kr/apply', deadlineEvidence: 'Apply before December 1',
  reviewed: true, rules: [{ field: 'status', op: 'eq', value: '재학', label: '재학생', evidence: 'Students enrolled' }], tasks: ['준비 항목'],
  questions: [], followup: '결과 발표 확인', followupSteps: steps };
const addNotice = data => asUser(owner, async () => (await db.query("insert into public.notices(data,status) values ($1,'published') returning id", [data])).rows[0].id);
const plain = await addNotice(base);
const withOption = await addNotice({ ...base, title: 'Scope option notice', options: [
  { id: 'o1', label: '1기', deadline: '2026-12-01', deadlineEvidence: '1기 마감', applicationUrl: 'https://www.catholic.ac.kr/apply/1' }] });
const today = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day;
const metrics = id => asUser(owner, async () => (await db.query('select public.notice_metrics($1,$2::date,$2::date) as value', [id, today])).rows[0].value);
const overview = () => asUser(owner, async () => (await db.query('select public.manager_overview($1::date,$1::date) as value', [today])).rows[0].value);
const record = (user, id, type, option = null) => asUser(user, () => db.query('select public.record_activity($1,$2,$3)', [id, type, option]));
const follow = (user, id, option, on) => asUser(user, () => db.query('select public.record_followup($1,$2,$3,$4)', [id, option, 's1', on]));
const state = (applications = {}) => ({ profile: {}, saved: [], applications, read: [] });
const checked = { followupChecks: { s1: JSON.stringify(steps[0]) }, completed: true };
const saveState = (user, data) => asUser(user, () => db.query(
  'insert into public.student_state(data) values ($1) on conflict (user_id) do update set data = excluded.data', [data]));

try {
  await check('LG-04: another manager viewing does not lift 4 students over the threshold', async () => {
    for (const id of [...students.slice(0, 4), otherManager]) { await record(id, plain, 'view'); await record(id, withOption, 'start', 'o1'); }
    const m = await metrics(plain), o = await metrics(withOption), all = await overview();
    assert.equal(m.counts.view, null, 'notice_metrics view');
    assert.equal(o.optionCounts[0].counts.start, null, 'option start');
    assert.equal(all.counts.view, null, 'manager_overview view');
    assert.equal(all.notices.find(n => n.id === plain).counts.view, null, 'overview per notice');
  });
  await check('LG-04: the fifth student is counted, managers still are not', async () => {
    await record(students[4], plain, 'view'); await record(students[4], withOption, 'start', 'o1');
    assert.equal((await metrics(plain)).counts.view, 5);
    assert.equal((await metrics(withOption)).optionCounts[0].counts.start, 5);
    assert.equal((await overview()).counts.view, 5);
  });
  await check('LG-04: another manager follow-up check is not counted', async () => {
    for (const id of [...students.slice(0, 4), otherManager]) await follow(id, plain, null, true);
    assert.deepEqual((await metrics(plain)).followupCounts, [{ label: '합격 확인', count: null }]);
  });
  await check('LG-03: profile reset removes that student from the current follow-up count', async () => {
    for (const id of students) await saveState(id, state({ [plain]: checked, [`${withOption}::o1`]: checked }));
    await follow(students[4], plain, null, true);
    for (const id of students) await follow(id, withOption, 'o1', true);
    assert.equal((await metrics(plain)).followupCounts[0].count, 5);
    assert.equal((await metrics(withOption)).followupCounts[0].count, 5);
    // Same write the app sends for "내 데이터 삭제": an empty state on the same account.
    await saveState(students[4], state());
    assert.equal((await metrics(plain)).followupCounts[0].count, null, 'plain notice');
    assert.equal((await metrics(withOption)).followupCounts[0].count, null, 'option key notice::o1');
  });
  await check('LG-03: other saves that keep the check do not close it', async () => {
    await saveState(students[4], state({ [plain]: checked }));
    await follow(students[4], plain, null, true);
    await saveState(students[4], { ...state({ [plain]: checked }), profile: { name: 'renamed' } });
    assert.equal((await metrics(plain)).followupCounts[0].count, 5);
    const offs = (await db.query("select count(*)::int as n from public.activity_events where user_id=$1 and notice_id=$2 and type='followup_off'", [students[4], plain])).rows[0].n;
    assert.equal(offs, 1, 'only the reset wrote an off event');
  });
  await check('LG-03: students still cannot write activity rows directly', () => asUser(students[0], () =>
    assert.rejects(db.query("insert into public.activity_events(user_id,notice_id,type,step_id) values ($1,$2,'followup_off','s1')", [students[0], plain]))));
  if (failed) throw new Error(`${failed} student-only metric checks failed`);
  console.log(`\n${passed} student-only metric checks passed.`);
} finally { await db.close(); }
