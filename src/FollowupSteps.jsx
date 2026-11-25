import React from 'react';
import {deadlineText, followupProgress, toggleFollowup} from './workflow.js';

export default function FollowupSteps({notice, application, onChange}) {
  const {rows, done, total} = followupProgress(notice, application);
  return <div className="followup workflow-steps"><h3>신청 후 할 일</h3><p>{notice.followup}</p><p>후속 절차 {done}/{total} 완료 / 직접 표시한 상태</p>
    {!application?.completed && <p className="muted">제출 완료를 표시한 뒤 확인할 수 있습니다.</p>}
    {rows.map(step => <div className="workflow-step" key={step.id}><label><input type="checkbox" disabled={!step.ready} checked={step.checked} onChange={e => onChange({followupChecks: toggleFollowup(notice, application, step.id, e.target.checked)})}/>{step.label}</label><p>{deadlineText(step)}</p><small>{step.evidence}</small>{!step.ready && step.requires && <p className="muted">선행 절차를 먼저 확인하세요.</p>}</div>)}
  </div>;
}
