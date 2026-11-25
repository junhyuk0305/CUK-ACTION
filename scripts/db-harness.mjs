// Local PGlite database with every migration applied, for the foundation and night-session DB tests.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loginEmail } from '../src/login-id.js';

const root = new URL('../', import.meta.url);
const migrations = new URL('supabase/migrations/', root);
// Same order as scripts/test-db.mjs. service_role is created right after initial.sql.
const base = [
  '202611100001_initial.sql',
  'create role service_role nologin',
  '202611160001_guides.sql',
  '202611240001_id_auth.sql',
  '202611240002_manager_overview.sql',
  '202611240003_option_activity.sql',
  '202611240004_followup_activity.sql',
  '202611240005_open_notices.sql',
  '202611250001_public_notices.sql',
  '202611250002_student_only_metrics.sql',
  '202611260001_foundation.sql',
];

export const notice = {title:'RLS test notice',category:'프로젝트',department:'Test office',summary:'Verified test fixture',deadline:'2026-12-01',sourceUrl:'https://www.catholic.ac.kr/test',applicationUrl:'https://www.catholic.ac.kr/apply',deadlineEvidence:'Apply before December 1',reviewed:true,rules:[{field:'status',op:'eq',value:'재학',label:'재학생',evidence:'Students enrolled'}],tasks:['준비 항목'],questions:[{label:'지원 동기',hint:'직접 작성',max:1000}],followup:'결과 발표 확인'};

export async function createDb({ prefixes = [] } = {}) {
  const db = new PGlite();
  const sql = name => readFile(new URL(name, migrations), 'utf8');
  await db.exec(await readFile(new URL('supabase/tests/bootstrap.sql', root), 'utf8'));
  for (const step of base) await db.exec(step.endsWith('.sql') ? await sql(step) : step);
  const extra = (await readdir(fileURLToPath(migrations))).filter(name => name.endsWith('.sql')
    && prefixes.some(prefix => name.startsWith(prefix)) && !name.includes('storage') && !base.includes(name)).sort();
  for (const name of extra) await db.exec(await sql(name));

  const ids = Object.fromEntries(['studentA','studentB','studentC','studentD','managerA','managerB']
    .map((name, i) => [name, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
  for (const [name, id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values ($1,$2)', [id, loginEmail(name)]);
  for (const id of [ids.managerA, ids.managerB]) await db.query('insert into public.manager_grants(user_id) values ($1)', [id]);

  let count = 0;
  async function check(label, run) { await run(); count++; console.log(`PASS ${label}`); }
  async function asUser(id, run, role = 'authenticated') {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id || '']);
    try { return await run(); } finally { await db.exec('reset role'); }
  }
  async function denied(run) { await assert.rejects(run); }
  async function addNotice(owner, payload = notice, status = 'draft') {
    return asUser(owner, async () => (await db.query('insert into public.notices(data,status) values ($1,$2) returning id', [payload, status])).rows[0].id);
  }
  return { db, ids, asUser, denied, addNotice, check, notice, passed: () => count };
}
