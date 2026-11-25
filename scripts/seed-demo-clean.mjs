import { adminClient, existingAccounts, isDemoAccount, requireStudentAccounts, runCli } from './student-demo-admin.mjs';

export async function cleanDemo(client) {
  const accounts = await existingAccounts(client);
  const students = [...accounts.values()].filter(isDemoAccount);
  await requireStudentAccounts(client, students);
  for (const student of students) {
    const { error } = await client.auth.admin.deleteUser(student.id);
    if (error) throw error;
  }
  return students.length;
}
runCli(import.meta.url, async () => {
  const count = await cleanDemo(adminClient());
  console.log('시연 계정 ' + count + '개와 연결된 학생 데이터를 삭제했습니다.');
});
