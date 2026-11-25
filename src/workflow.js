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

export function noDeadlineLabel(notice) {
  const parts = [notice.deadlineNote, notice.postedAt ? notice.postedAt + ' 게시' : ''].filter(Boolean);
  return '마감일 없음 · ' + (parts.length ? parts.join(' · ') : '원문 확인 필요');
}

export function deadlineText(notice, now = new Date()) {
  if (notice.options?.length) return `신청 항목 ${notice.options.length}개 / 마감 개별 확인`;
  if (notice.deadlineStatus === 'conflict') return '마감 자료 불일치 / 확인 필요';
  if (!notice.deadline) return noDeadlineLabel(notice);
  const suffix = notice.deadlineTime ? `${notice.deadlineTime} 한국 시간` : '시각 확인 필요';
  return `${notice.deadline} ${suffix}${deadlineState(notice, now) === 'closed' ? ' / 마감' : ''}`;
}

// Shown with deadlineText when deadlineState is 'unknown', so the two never contradict.
export function unknownDeadlineNote(notice) {
  if (notice.deadlineStatus === 'conflict') return '마감이 확정되지 않았습니다. 신청 전 담당자 확인이 필요합니다.';
  if (!notice.deadline) return '마감일이 없는 공고입니다. 신청 가능 여부와 인원 제한을 원문에서 확인하세요.';
  return '오늘 마감입니다. 마감 시각은 원문에서 확인하세요.';
}

// A parent notice also counts as saved when one of its session ids (parent::option) was saved earlier.
export function isSavedNotice(notice, saved) {
  return saved.includes(notice.id) || saved.some(id => id.startsWith(notice.id + '::'));
}

export function toggleSaved(saved, notice) {
  return isSavedNotice(notice, saved) ? saved.filter(id => id !== notice.id && !id.startsWith(notice.id + '::')) : [...saved, notice.id];
}

// In-app back buttons say where they go. The account detail returns to the page it was opened from,
// or to the archive detail when it was opened there.
const detailBack = {home: '홈으로', explore: '공고 탐색으로', applications: '내 신청으로', saved: '관심 공고로', notifications: '알림으로', archive: '실제 공고 보관함으로'};
export function detailBackLabel(page, fromArchiveItem = false) {
  return fromArchiveItem ? '보관함 공고로' : detailBack[page] || '목록으로';
}

// The public detail goes back to the list it was opened from, or to the full list for a direct link.
export function publicBackLabel(returnTo) {
  if (!returnTo) return '전체 공고로';
  return {'#browse': '전체 공고로', '#saved': '관심 공고로'}[returnTo.hash] || '홈으로';
}

export function preparationCount(notice) {
  return (notice.tasks?.length || 0) + (notice.questions?.length || 0);
}

// The card names checklist and writing counts apart, so the detail's checklist count matches.
export function preparationLabel(notice) {
  const parts = [notice.tasks?.length && `체크 ${notice.tasks.length}`, notice.questions?.length && `작성 ${notice.questions.length}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : '원문에서 신청';
}

export function startTab(notice) {
  return notice.questions?.length ? 'write' : 'prepare';
}

// The published copy of an archive item, matched by sourceArchiveId.
export function archiveNotice(archiveId, notices) {
  return notices.find(n => n.sourceArchiveId === archiveId && !n.unpublished);
}

export function requirementsKey(notice) {
  return JSON.stringify([notice.rules, notice.deadline, notice.deadlineTime || '', notice.deadlineStatus || '', notice.deadlineEvidence,
    notice.applicationUrl, notice.tasks, notice.questions, notice.followup, notice.followupSteps || []]);
}

export function withSavedApplication(notice, application) {
  const snapshot = application?.noticeSnapshot;
  if (!snapshot || notice.applyMode === 'site') return notice;
  return {...notice, questions: snapshot.questions, tasks: snapshot.tasks,
    formChanged: requirementsKey(snapshot) !== requirementsKey(notice), currentNotice: notice};
}

// A saved application missing from the current list counts as unpublished only after the list has loaded.
// Before that its copy is marked pending, so home and browse do not show it as a current notice.
export function withEndedApplications(current, applications, listReady) {
  return [...current.map(n => withSavedApplication(n, applications[n.id])),
    ...Object.entries(applications).filter(([id, a]) => a.noticeSnapshot && !current.some(n => n.id === id))
      .map(([, a]) => listReady ? {...a.noticeSnapshot, unpublished: true} : {...a.noticeSnapshot, pendingSnapshot: true})];
}

// Saved ids found in neither list. A list that has not loaded (null) holds the judgment.
export function endedSavedIds(saved, notices, archive) {
  if (!notices || !archive) return [];
  return saved.filter(id => !notices.some(n => n.id === id) && !archive.some(r => r.id === id));
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
