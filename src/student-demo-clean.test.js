import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDemo } from '../scripts/seed-demo-clean.mjs';
import { demoAccountAttributes } from '../scripts/student-demo-admin.mjs';

test('시연 계정 정리는 생성 표시와 로그인 아이디가 모두 일치한 학생만 지운다', async () => {
  const tagged = { ...demoAccountAttributes('demo40', 'test-password'), id: 'created' };
  const pages = [
    [{ id: 'existing', email: 'demo01@id.cuk-action.invalid' }, { ...tagged, id: 'other', email: 'other@id.cuk-action.invalid' }],
    [tagged],
  ];
  const deleted = [];
  let grants = [{ user_id: tagged.id }];
  const client = {
    auth: { admin: {
      listUsers: async ({ page }) => ({ data: { users: pages[page - 1], nextPage: page === 1 ? 2 : null } }),
      deleteUser: async id => { deleted.push(id); return {}; },
    } },
    from(table) {
      assert.equal(table, 'manager_grants');
      return { select: () => ({ in: (field, ids) => {
        assert.equal(field, 'user_id');
        assert.deepEqual(ids, [tagged.id]);
        return { data: grants };
      } }) };
    },
  };
  await assert.rejects(cleanDemo(client), /담당자/);
  assert.deepEqual(deleted, []);
  grants = [];
  assert.equal(await cleanDemo(client), 1);
  assert.deepEqual(deleted, [tagged.id]);
});
