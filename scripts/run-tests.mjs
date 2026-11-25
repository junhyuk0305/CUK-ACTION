// Runs every *.test.js / *.test.mjs under src, supabase/tests and supabase/functions.
// *.source.test.js files stay out; they run through `npm run test:source`.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const files = ['src', 'supabase/tests', 'supabase/functions']
  .flatMap(dir => readdirSync(dir, { recursive: true }).map(name => join(dir, String(name))))
  .filter(file => /\.test\.m?js$/.test(file) && !file.endsWith('.source.test.js'))
  .sort();
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
