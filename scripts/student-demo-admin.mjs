import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginEmail } from '../src/login-id.js';

export const marker = 'student-1126-v1';
const accounts = Array.from({ length: 40 }, (_, i) => loginEmail('demo' + String(i + 1).padStart(2, '0')));
const emails = new Set(accounts);

export function demoAccountAttributes(loginId, password) {
  return { email: loginEmail(loginId), email_confirm: true, password,
    app_metadata: { cuk_demo_seed: marker, protected: true } };
}

export function isDemoAccount(user) {
  return emails.has(user.email) && user.app_metadata?.cuk_demo_seed === marker;
}

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function existingAccounts(client) {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (emails.has(user.email)) byEmail.set(user.email, user);
    if (!data.nextPage && data.users.length < 1000) return byEmail;
  }
}

export async function requireStudentAccounts(client, users) {
  if (!users.length) return;
  const { data, error } = await client.from('manager_grants').select('user_id').in('user_id', users.map(u => u.id));
  if (error) throw error;
  if (data.length) throw new Error('담당자 권한이 있는 계정이 포함돼 작업을 중단했습니다.');
}

export function runCli(moduleUrl, main) {
  if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(moduleUrl)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}
