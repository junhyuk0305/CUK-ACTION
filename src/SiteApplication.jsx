import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { goBack, useBackLayer } from './back-layer.js';
import { eligibility, noticeQuestions } from './contract.js';
import { deadlineState } from './workflow.js';
import ApplicationForm from './ApplicationForm.jsx';
import { recordStudentEvent } from './student-events.js';
import { applicationValues, applicationClaims, applicationSnapshot, changedProfileFields, profileLabels, ruleFields } from './site-application.js';
import { submitApplication, withdrawApplication } from './student-api.js';

const statusLabels = { pass: '충족', fail: '미충족', unknown: '확인 필요' };
const choices = { year: ['1','2','3','4'], semester: ['1','2'], status: ['재학','휴학','졸업'] };
const choiceUnits = { year: '학년', semester: '학기' };

function QualificationInput({ field, profile, onEdit, disabled }) {
  const value = profile[field] ?? '';
  return <label>{profileLabels[field]}
    {choices[field] ? <select disabled={disabled} value={value} onChange={e => onEdit(field, e.target.value)}>
      <option value="">선택</option>{choices[field].map(v => <option key={v} value={v}>{v}{choiceUnits[field] ?? ''}</option>)}</select>
      : <input disabled={disabled} type={['gpa','residence'].includes(field) ? 'number' : 'text'} min={0}
          max={field === 'gpa' ? 4.5 : field === 'residence' ? 1200 : undefined} step={field === 'gpa' ? 0.01 : undefined}
          value={value} onChange={e => onEdit(field, e.target.value)} />}
  </label>;
}

function ClaimInput({ rule, qualification, claim, disabled, onChange, showInput }) {
  const status = qualification?.status;
  if (status === 'verified') return <p><span className="tag">확인됨</span></p>;
  return <>
    {status === 'claimed' && <p><span className="tag">확인 대기</span></p>}
    {status === 'rejected' && <p className="warning">담당자가 이 자격 신고를 반려했습니다. 설명을 보완해 다시 신고할 수 있습니다.</p>}
    {showInput && <>
      <label className="claim-check"><input type="checkbox" aria-label={rule.label + ' 충족함'} checked={!!claim} disabled={disabled}
        onChange={e => onChange(e.target.checked ? qualification?.note ?? '' : null)} /> 충족함</label>
      {claim && <label className="question">자격 설명
        <textarea aria-label={rule.label + ' 자격 설명'} maxLength={500} value={claim.note} disabled={disabled}
          onChange={e => onChange(e.target.value)} />
        <small>{claim.note.length} / 500자</small>
      </label>}
    </>}
  </>;
}

function Modal({ titleId, busy, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}

function WithdrawDialog({ onConfirm, onClose, busy, error }) {
  return <Modal titleId="site-withdraw-title" busy={busy} onClose={onClose}>
    <h2 id="site-withdraw-title">제출한 신청을 취소할까요?</h2><p>담당자에게 취소한 신청으로 보입니다. 마감 전에는 다시 제출할 수 있습니다.</p>
    {error && <p className="warning" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>돌아가기</button>
      <button type="button" className="button primary" disabled={busy} onClick={onConfirm}>{busy ? '취소 중' : '신청 취소'}</button></div>
  </Modal>;
}

function SubmitDialog({ changes, profile, onSubmit, onClose, busy, error }) {
  const [selected, setSelected] = useState([]);
  return <Modal titleId="site-confirm-title" busy={busy} onClose={onClose}>
    <h2 id="site-confirm-title">신청서를 제출할까요?</h2><p>공고 담당자가 답변과 제출 시점의 프로필, 신고한 자격 설명을 확인합니다.</p>
    {changes.length > 0 && <><h3>내 정보에도 저장</h3><p>저장할 항목을 선택하세요.</p>
      <div className="checklist">{changes.map(field => <label key={field}>
        <input type="checkbox" disabled={busy} checked={selected.includes(field)} onChange={e =>
          setSelected(e.target.checked ? [...selected,field] : selected.filter(f => f !== field))} />
        {profileLabels[field]} / {profile[field] || '비움'}</label>)}</div></>}
    {error && <p className="warning" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>돌아가기</button>
      <button type="button" className="button primary" disabled={busy} onClick={() => onSubmit(selected)}>{busy ? '제출 중' : '제출 확인'}</button></div>
  </Modal>;
}

export default function SiteApplication({ notice, profile, draft, row, qualifications, onDraft, onResult, onBack }) {
  // Join the history one render late, so the detail screen's entry is below this one even when the form opens with the detail.
  const [layerReady, setLayerReady] = useState(false);
  useEffect(() => setLayerReady(true), []);
  useBackLayer(layerReady, onBack);
  const editedQuestions = useRef(new Set());
  const started = useRef(null);
  useEffect(() => {
    if (!notice.unpublished && started.current !== notice.id) {
      started.current = notice.id;
      recordStudentEvent(notice.id, 'apply_start');
    }
  }, [notice.id, notice.unpublished]);
  function questionBlur(e) {
    const id = e.target.dataset.questionId;
    if (editedQuestions.current.delete(id) && e.target.value.trim()) {
      recordStudentEvent(notice.id, 'question', { questionId: id });
    }
  }
  const [confirming,setConfirming] = useState(false), [withdrawing,setWithdrawing] = useState(false), [busy,setBusy] = useState(false);
  const [error,setError] = useState(''), [message,setMessage] = useState('');
  const values = applicationValues(notice, profile, row, draft);
  const verified = qualifications.filter(q => q.status === 'verified').map(q => q.qualification_id);
  const claims = applicationClaims(notice.rules, values.claims, qualifications, draft?.claims != null);
  const match = eligibility(notice, values.profile, verified);
  const questions = noticeQuestions(notice);
  const locked = !!notice.unpublished || deadlineState(notice) === 'closed';
  const changed = changedProfileFields(profile, values.profile, draft?.profile);
  function edit(patch) { if (locked || busy) return; setMessage(''); setError(''); onDraft({ ...draft, ...patch }); }
  function editClaim(id, note) {
    const next = claims.filter(claim => claim.qualificationId !== id);
    if (note !== null) next.push({ qualificationId: id, note });
    edit({ claims: next });
  }
  function editField(field, text) {
    const answers = { ...values.answers };
    for (const q of questions) if (q.type === 'profile' && q.profileField === field) answers[q.id] = text;
    edit({ answers, profile: { ...draft?.profile, [field]: text } });
  }
  function formValue(next) {
    const edits = { ...draft?.profile };
    const answers = { ...next.answers };
    const q = questions.find(q => q.type === 'profile' && answers[q.id] !== values.answers[q.id]);
    if (q) {
      edits[q.profileField] = answers[q.id];
      for (const other of questions) if (other.type === 'profile' && other.profileField === q.profileField) answers[other.id] = answers[q.id];
    }
    edit({ answers, claims: next.claims, profile: edits });
  }
  function inputs(group) {
    return <ApplicationForm notice={{ questions: group }} profile={values.profile} verifiedIds={verified}
      value={{ answers: values.answers, claims }} onChange={formValue} readOnly={locked || busy} />;
  }
  async function submit(selected) {
    if (busy || locked) return;
    setBusy(true); setError('');
    try {
      const result = await submitApplication(notice.id, values.answers, applicationSnapshot(values.profile), match, claims);
      onResult(result, Object.fromEntries(selected.map(field => [field, values.profile[field]])));
      setConfirming(false); setMessage('신청서를 제출했습니다.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function withdraw() {
    if (busy || locked) return;
    setBusy(true); setError('');
    try { onResult(await withdrawApplication(notice.id)); setWithdrawing(false); setMessage('신청을 취소했습니다.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <><button className="back" onClick={goBack}><ArrowLeft size={16}/>공고 상세로</button>
    <div className="page-heading"><div>{row && <span className="tag">{row.status === 'submitted' ? '제출 완료' : '신청 취소'}</span>}
      <h1>{notice.title}</h1><p>신청서에는 가상 정보만 입력하세요.</p></div></div>
    {locked && <p className="warning">접수가 종료됐습니다.</p>}
    <form className="panel site-form" onChange={e => { const id=e.target.dataset.questionId; if(id) editedQuestions.current.add(id); }} onBlur={questionBlur} onSubmit={e => { e.preventDefault(); setError(''); setConfirming(true); }}>
      <h2>기본 정보</h2>{questions.some(q => q.type === 'profile') ? inputs(questions.filter(q => q.type === 'profile')) : <p>요청한 기본 정보가 없습니다.</p>}
      <h2>자격 확인</h2>
      {match.results.map((rule, i) => <div key={i} className="rule-check">
        <div className="rule-title"><strong>{rule.label}</strong><span className={'status-text ' + rule.status}>{statusLabels[rule.status]}</span></div>
        {rule.evidence && <p className="muted">{rule.evidence}</p>}
        {rule.field === 'manual' && <p className="muted">원문에서 직접 확인하세요.</p>}
        {ruleFields(rule).length > 0 && <div className="profile-fields">{ruleFields(rule).map(field =>
          <QualificationInput key={field} field={field} profile={values.profile} onEdit={editField} disabled={locked || busy} />)}</div>}
        {rule.field === 'custom' && <ClaimInput rule={rule} disabled={locked || busy}
          qualification={qualifications.find(q => q.qualification_id === rule.value)}
          claim={claims.find(q => q.qualificationId === rule.value)}
          showInput={match.results.findIndex(r => r.field === 'custom' && r.value === rule.value) === i}
          onChange={text => editClaim(rule.value, text)} />}</div>)}
      {!match.total && <p>자격 조건이 없습니다.</p>}
      <h2>문항</h2>{questions.some(q => q.type !== 'profile') ? inputs(questions.filter(q => q.type !== 'profile')) : <p>작성할 문항이 없습니다.</p>}
      <h2>제출</h2>{match.fail > 0 && <p className="warning">충족하지 않는 조건이 있습니다. 신청은 할 수 있고 담당자가 확인합니다.</p>}
      {error && !confirming && !withdrawing && <p role="alert" className="warning">{error}</p>}
      {message && <p role="status" className="success-note">{message}</p>}
      <div className="row wrap"><button className="button primary" type="submit" disabled={locked || busy}>{row?.status === 'submitted' ? '수정 제출' : '신청서 제출'}</button>
        {row?.status === 'submitted' && <button className="button secondary" type="button" disabled={locked || busy} onClick={() => { setError(''); setWithdrawing(true); }}>신청 취소</button>}</div>
    </form>
    {confirming && <SubmitDialog changes={changed} profile={values.profile} busy={busy} error={error} onSubmit={submit} onClose={() => setConfirming(false)} />}
    {withdrawing && <WithdrawDialog busy={busy} error={error} onConfirm={withdraw} onClose={() => setWithdrawing(false)} />}
  </>;
}
