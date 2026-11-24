export function evaluate(rule, profile) {
  // CU12 notice 277473: only the selected course is restricted, not the whole notice.
  if (rule.field === 'cu12Course') {
    if (rule.op !== 'eq' || !['home', 'other'].includes(rule.value)) return 'unknown';
    if (rule.value === 'home') return 'pass';
    const year = String(profile.year ?? ''), semester = String(profile.semester ?? '');
    if (!['1', '2', '3', '4'].includes(year)) return 'unknown';
    if (year !== '4') return 'pass';
    if (!['1', '2'].includes(semester)) return 'unknown';
    return semester === '2' ? 'fail' : 'pass';
  }
  if (rule.field === 'manual') return 'unknown';
  const value = profile[rule.field];
  if (value === '' || value === undefined || value === null || (typeof value === 'string' && !value.trim())) return 'unknown';
  if (rule.op === 'min') return Number.isFinite(Number(value)) ? (Number(value) >= rule.value ? 'pass' : 'fail') : 'unknown';
  if (rule.op === 'in') return rule.value.includes(value) ? 'pass' : 'fail';
  return value === rule.value ? 'pass' : 'fail';
}
export function conditions(notice, profile) {
  const results = notice.rules.map(r => ({...r, status: evaluate(r, profile)}));
  return { results, pass: results.filter(r=>r.status==='pass').length, unknown: results.filter(r=>r.status==='unknown').length, total: results.length };
}
export function daysLeft(date, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
}
export function deadlineLabel(date) { const d=daysLeft(date); return d<0?'마감':d===0?'오늘 마감':`D-${d}`; }
export function progress(notice, application = {}) { const done=notice.tasks.filter((_,i)=>application.checks?.[i]).length; return {done,total:notice.tasks.length,percent:notice.tasks.length?Math.round(done/notice.tasks.length*100):0}; }
export function metrics(events, id) {
  const relevant=events.filter(e=>e.notice===id);
  return ['view','interest','start','complete','link'].map(type=>new Set(relevant.filter(e=>e.type===type).map(e=>e.visitor)).size);
}
