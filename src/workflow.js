import {daysLeft} from './logic.js';

export function applicationOptions(notice) {
  return (notice.options || []).map(option => ({...notice, ...option, deadlineTime: option.deadlineTime || '', deadlineStatus: option.deadlineStatus || 'confirmed', id: notice.id + '::' + option.id,
    parentId: notice.id, optionId: option.id, parentTitle: notice.title,
    title: notice.title + ' / ' + option.label, options: undefined,
    rules: [...notice.rules, ...(option.cu12Institution ? [{field: 'cu12Course', op: 'eq', value: option.cu12Institution,
      label: 'CU12 학년과 학기에 따른 개설 대학 제한', evidence: '공고 277473 본문 4항: 4학년 2학기(8차 학기) 학생은 본교 개설 교과목만 수강 가능.'}] : [])]}));
}

export function deadlineState(notice, now = new Date()) {
  if (notice.options?.length) {
    const states = applicationOptions(notice).map(n => deadlineState(n, now));
    return states.every(s => s === 'closed') ? 'closed' : states.includes('open') ? 'open' : 'unknown';
  }
  if (!notice.deadline || notice.deadlineStatus === 'conflict') return 'unknown';
  if (notice.deadlineTime) return now.getTime() >= Date.parse(notice.deadline + 'T' + notice.deadlineTime + ':00+09:00') ? 'closed' : 'open';
  const days = daysLeft(notice.deadline, now);
  return days < 0 ? 'closed' : days === 0 ? 'unknown' : 'open';
}

export function deadlineText(notice, now = new Date()) {
  if (notice.options?.length) return `신청 항목 ${notice.options.length}개 / 마감 개별 확인`;
  if (notice.deadlineStatus === 'conflict') return '마감 자료 불일치 / 확인 필요';
  if (!notice.deadline) return '마감 확인 필요';
  const suffix = notice.deadlineTime ? `${notice.deadlineTime} 한국 시간` : '시각 확인 필요';
  return `${notice.deadline} ${suffix}${deadlineState(notice, now) === 'closed' ? ' / 마감' : ''}`;
}

export function requirementsKey(notice) {
  return JSON.stringify([notice.rules, notice.deadline, notice.deadlineTime || '', notice.deadlineStatus || '', notice.deadlineEvidence,
    notice.applicationUrl, notice.tasks, notice.questions, notice.followup, notice.followupSteps || []]);
}

export function withSavedApplication(notice, application) {
  const snapshot = application?.noticeSnapshot;
  if (!snapshot) return notice;
  return {...notice, questions: snapshot.questions, tasks: snapshot.tasks,
    formChanged: requirementsKey(snapshot) !== requirementsKey(notice), currentNotice: notice};
}

export function followupProgress(notice, application = {}) {
  const steps = notice.followupSteps || [];
  const valid = {};
  const rows = steps.map(step => {
    const ready = !!application.completed && (!step.requires || !!valid[step.requires]);
    const checked = ready && application.followupChecks?.[step.id] === JSON.stringify(step);
    valid[step.id] = checked;
    return {...step, ready, checked};
  });
  return {rows, done: rows.filter(s => s.checked).length, total: steps.length};
}

export function toggleFollowup(notice, application, id, checked) {
  const {rows} = followupProgress(notice, application);
  const step = rows.find(s => s.id === id);
  if (!step?.ready) return application.followupChecks || {};
  const checks = {...application.followupChecks};
  const original = notice.followupSteps.find(s => s.id === id);
  if (checked) checks[id] = JSON.stringify(original); else delete checks[id];
  // Clearing a prerequisite also clears all dependent confirmations.
  for (const row of followupProgress(notice, {...application, followupChecks: checks}).rows) if (!row.checked) delete checks[row.id];
  return checks;
}

// One change per step whose checked state differs, including dependents cleared by a prerequisite.
export function followupChanges(notice, before, after) {
  const previous = followupProgress(notice, before).rows;
  return followupProgress(notice, after).rows.filter((row, i) => row.checked !== previous[i].checked).map(row => ({stepId: row.id, checked: row.checked}));
}

export function needsAttention(notice, application) {
  if (notice.options?.length) return false;
  if (notice.formChanged && application?.reviewedRequirements !== requirementsKey(notice.currentNotice)) return true;
  if (!application?.completed) return true;
  const p = followupProgress(notice, application);
  return p.total > 0 ? p.done < p.total : !application.followup;
}

export function validateWorkflow(notice) {
  const validDate = d => !d || (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d);
  const schedule = item => {
    if (!validDate(item.deadline) || (item.deadlineTime && (!item.deadline || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.deadlineTime)))) throw Error('마감 날짜와 시각을 확인하세요.');
    if (item.deadlineStatus && !['confirmed', 'conflict'].includes(item.deadlineStatus)) throw Error('마감 확인 상태를 확인하세요.');
  };
  schedule(notice);
  const ids = new Set();
  for (const option of notice.options || []) {
    if (option.cu12Institution && !['home', 'other'].includes(option.cu12Institution)) throw Error('CU12 개설 대학을 확인하세요.');
    if (!option.id || ids.has(option.id) || !option.label?.trim() || !option.deadline || !option.deadlineEvidence?.trim() || !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(option.applicationUrl || '')) throw Error('신청 항목의 이름, 마감 근거와 HTTPS 경로를 확인하세요.');
    ids.add(option.id); schedule(option);
  }
  const steps = new Set();
  for (const step of notice.followupSteps || []) {
    if (!step.id || steps.has(step.id) || !step.label?.trim() || !step.evidence?.trim() || (step.requires && !steps.has(step.requires))) throw Error('후속 절차의 이름, 근거와 선행 단계를 확인하세요.');
    steps.add(step.id); schedule(step);
  }
}
