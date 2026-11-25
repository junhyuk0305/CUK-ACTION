import React from 'react';
import {DEMO} from './demo.js';

export default function WorkflowFields({editing, change, testMode = false}) {
  const update = (key, index, patch) => change(key, editing[key].map((row, i) => i === index ? {...row, ...patch} : row));
  return <section className="panel manager-section workflow-fields">
    <h3>신청 항목과 단계별 일정</h3>
    {DEMO && testMode && <p className="muted">이 기능은 테스트 공간에서 검증 중입니다.</p>}
    <div className="manager-fields">
      <label>마감 시각<input type="time" value={editing.deadlineTime || ''} onChange={e => change('deadlineTime', e.target.value)}/><small>한국 시간. 모르면 비워 두세요.</small></label>
      <label>마감 확인 상태<select value={editing.deadlineStatus || 'confirmed'} onChange={e => change('deadlineStatus', e.target.value)}><option value="confirmed">날짜 확인</option><option value="conflict">자료 불일치</option></select></label>
    </div>
    <div className="section-heading"><h3>기수별 신청 항목</h3><button type="button" className="text-button" onClick={() => change('options', [...(editing.options || []), {id: crypto.randomUUID(), label: '', deadline: '', deadlineTime: '', deadlineEvidence: '', applicationUrl: ''}])}>신청 항목 추가</button></div>
    <p className="muted">각 항목의 준비 상태를 따로 저장합니다.</p>
    {(editing.options || []).map((option, i) => <div className="manager-repeat" key={option.id}>
      <div className="section-heading"><b>신청 항목 {i + 1}</b><button type="button" className="text-button" onClick={() => change('options', editing.options.filter((_, j) => i !== j))}>신청 항목 {i + 1} 삭제</button></div>
      <div className="manager-fields">
        <label>항목 {i + 1} 이름<input value={option.label} onChange={e => update('options', i, {label: e.target.value})} required/></label>
        <label>항목 {i + 1} CU12 개설 대학<select aria-label={`항목 ${i + 1} CU12 개설 대학`} value={option.cu12Institution || ''} onChange={e => update('options', i, {cu12Institution: e.target.value})}><option value="">제한 적용 안 함</option><option value="home">본교</option><option value="other">타 대학</option></select><small>공고 277473의 과목 선택 제한에만 사용합니다.</small></label>
        <label>항목 {i + 1} 마감일<input type="date" value={option.deadline} onChange={e => update('options', i, {deadline: e.target.value})} required/></label>
        <label>항목 {i + 1} 마감 시각<input type="time" value={option.deadlineTime || ''} onChange={e => update('options', i, {deadlineTime: e.target.value})}/></label>
        <label>항목 {i + 1} 확인 상태<select value={option.deadlineStatus || 'confirmed'} onChange={e => update('options', i, {deadlineStatus: e.target.value})}><option value="confirmed">날짜 확인</option><option value="conflict">자료 불일치</option></select></label>
        <label className="manager-wide">항목 {i + 1} 신청 경로<input type="url" value={option.applicationUrl} onChange={e => update('options', i, {applicationUrl: e.target.value})} required/></label>
        <label className="manager-wide">항목 {i + 1} 마감 근거<textarea aria-label={`항목 ${i + 1} 마감 근거`} value={option.deadlineEvidence} onChange={e => update('options', i, {deadlineEvidence: e.target.value})} required/></label>
      </div>
    </div>)}
    <div className="section-heading"><h3>신청 후 단계</h3><button type="button" className="text-button" onClick={() => change('followupSteps', [...(editing.followupSteps || []), {id: crypto.randomUUID(), label: '', deadline: '', deadlineTime: '', evidence: '', requires: ''}])}>후속 단계 추가</button></div>
    {(editing.followupSteps || []).map((step, i) => <div className="manager-repeat" key={step.id}>
      <div className="section-heading"><b>후속 단계 {i + 1}</b><button type="button" className="text-button" onClick={() => change('followupSteps', editing.followupSteps.filter((_, j) => i !== j).map(s => s.requires === step.id ? {...s, requires: ''} : s))}>후속 단계 {i + 1} 삭제</button></div>
      <div className="manager-fields">
        <label>단계 {i + 1} 이름<input value={step.label} onChange={e => update('followupSteps', i, {label: e.target.value})} required/></label>
        <label>단계 {i + 1} 선행 조건<select value={step.requires || ''} onChange={e => update('followupSteps', i, {requires: e.target.value})}><option value="">학생이 표시한 제출 완료</option>{editing.followupSteps.slice(0, i).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>단계 {i + 1} 기한<input type="date" value={step.deadline || ''} onChange={e => update('followupSteps', i, {deadline: e.target.value})}/><small>미확인 기한은 비워 두세요.</small></label>
        <label>단계 {i + 1} 시각<input type="time" value={step.deadlineTime || ''} onChange={e => update('followupSteps', i, {deadlineTime: e.target.value})}/></label>
        <label className="manager-wide">단계 {i + 1} 근거<textarea aria-label={`단계 ${i + 1} 근거`} value={step.evidence} onChange={e => update('followupSteps', i, {evidence: e.target.value})} required/></label>
      </div>
    </div>)}
  </section>;
}
