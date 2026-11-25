// QE-05, QE-07: the SQL that saveNotice sends through PostgREST, run against the migrations in PGlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const db = new PGlite();
await db.exec(await readFile(new URL('supabase/tests/bootstrap.sql', root), 'utf8'));
// Storage migrations need the Supabase storage schema, which PGlite does not have.
for (const file of (await readdir(new URL('supabase/migrations/', root))).filter(name => !name.includes('storage')).sort()) {
  await db.exec(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'));
  if (file === '202611100001_initial.sql') await db.exec('create role service_role nologin');
}
const managerA = '00000000-0000-4000-8000-0000000000a1', managerB = '00000000-0000-4000-8000-0000000000b1';
for (const id of [managerA, managerB]) {
  await db.query('insert into auth.users(id,email) values ($1,$2)', [id, `${id}@test.invalid`]);
  await db.query('insert into public.manager_grants(user_id) values ($1)', [id]);
}
const notice = title => ({ title, category: '프로젝트', department: 'Test office', summary: 'Fixture', sourceUrl: 'https://www.catholic.ac.kr/test', reviewed: false, rules: [], tasks: [], questions: [] });
async function asUser(id, run) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await run(); } finally { await db.exec('reset role'); }
}
// PostgREST upsert (Prefer: resolution=merge-duplicates) for the columns saveNotice sends.
const upsert = (id, title) => db.query(
  'insert into public.notices(id,status,data) values ($1,$2,$3) on conflict(id) do update set id=excluded.id, status=excluded.status, data=excluded.data returning id, data, updated_at',
  [id, 'draft', notice(title)]);
// PostgREST update with .eq('id').eq('updated_at') and return=representation.
const versionedUpdate = (id, version, title) => db.query(
  'update public.notices set status=$3, data=$4 where id=$1 and updated_at=$2 returning id, data, updated_at',
  [id, version, 'draft', notice(title)]);

test('QE-05: a retried new-notice save with the same client id updates one row', () => asUser(managerA, async () => {
  const id = crypto.randomUUID();
  await upsert(id, 'first try');
  const retry = await upsert(id, 'retry');
  assert.equal(retry.rows.length, 1);
  const rows = (await db.query('select data->>\'title\' as title from public.notices where id=$1', [id])).rows;
  assert.deepEqual(rows, [{ title: 'retry' }]);
  await assert.rejects(() => db.query('insert into public.notices(id,status,data) values ($1,$2,$3)', [id, 'draft', notice('plain insert')]));
}));

test('QE-05: another manager cannot take over a notice id through the upsert', async () => {
  const id = await asUser(managerA, async () => (await upsert(crypto.randomUUID(), 'owned by A')).rows[0].id);
  await asUser(managerB, () => assert.rejects(() => upsert(id, 'taken by B')));
  const row = (await db.query('select owner_id, data->>\'title\' as title from public.notices where id=$1', [id])).rows[0];
  assert.deepEqual(row, { owner_id: managerA, title: 'owned by A' });
});

test('QE-07: a save over a stale version changes 0 rows and keeps the earlier save', () => asUser(managerA, async () => {
  const { id, updated_at: opened } = (await upsert(crypto.randomUUID(), 'opened')).rows[0];
  const tabA = await versionedUpdate(id, opened, 'tab A');
  assert.equal(tabA.rows.length, 1);
  assert.notEqual(tabA.rows[0].updated_at.getTime(), opened.getTime());
  const tabB = await versionedUpdate(id, opened, 'tab B');
  assert.equal(tabB.rows.length, 0);
  assert.equal((await db.query('select data->>\'title\' as title from public.notices where id=$1', [id])).rows[0].title, 'tab A');
  const overwrite = await versionedUpdate(id, tabA.rows[0].updated_at, 'tab B over latest');
  assert.equal(overwrite.rows[0].data.title, 'tab B over latest');
}));
