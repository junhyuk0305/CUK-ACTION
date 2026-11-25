import React, { useState } from 'react';
import { DEMO } from './demo.js';
import { demoProfile } from './data.js';
import { testStudentProfiles } from './workflow-fixtures.js';
import { needsOnboarding } from './contract.js';
import { savedProfile } from './student-profile.js';
import { SiteRecordStatus } from './SiteRecords.jsx';

const qualificationTags = { verified: '확인됨', claimed: '확인 대기', rejected: '반려' };
const qualificationColors = { verified: 'green', claimed: 'gray', rejected: 'red' };

function QualificationList({ title, items, status, hideEmpty }) {
  const rows = items.filter(item => item.status === status);
  if (hideEmpty && !rows.length) return null;
  return <section className="panel"><h2>{title}</h2>
    {status === 'rejected' && <p className="help-text">공고 신청서에서 설명을 보완해 다시 신고할 수 있습니다.</p>}
    {rows.length ? <ul>{rows.map(item => <li key={item.qualification_id}>
      <strong>{item.qualifications?.name || '공고 자격'}</strong> <span className={'tag ' + qualificationColors[status]}>{qualificationTags[status]}</span>
      {item.note && <p>{item.note}</p>}
    </li>)}</ul> : <p className="help-text">{title}이 없습니다.</p>}
  </section>;
}

export default function StudentProfile({ profile, onboarding=false, busy=false, testMode, records, onSave, onReset }) {
  const [p, setProfile] = useState(profile);
  const [optional, setOptional] = useState(!onboarding);
  const set = (key, value) => setProfile(previous => ({ ...previous, [key]: value }));
  const interests = p.interests ?? [];
  function submit(e) {
    e.preventDefault();
    const action = e.nativeEvent.submitter?.value;
    if (needsOnboarding(p)) {
      const missing = Array.from(e.currentTarget.querySelectorAll('[required]')).find(input => !input.value.trim());
      missing?.reportValidity();
      return;
    }
    if (action === 'more') setOptional(true);
    else onSave(savedProfile(profile, p, action === 'later'));
  }
  return <section className="student-profile">
    <div className="page-heading"><div><h1>{onboarding ? '학생 정보 입력' : '내 정보'}</h1>
      <p>{onboarding ? '학과, 학년, 재학 상태를 입력하세요.' : '공고의 지원 조건을 내 정보와 비교합니다.'}</p></div></div>
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}><h2>기본 정보</h2>
        <div className="profile-fields">
          <label>학과 (필수)<input required maxLength={80} list="student-departments" value={p.department ?? ''} pattern=".*\S.*"
            onChange={e => set('department', e.target.value)} /></label>
          <datalist id="student-departments">{['컴퓨터정보공학부','경영학과','글로벌경영학부','기타 학과'].map(v => <option key={v} value={v}/>)}</datalist>
          <label>학년 (필수)<select required value={p.year ?? ''} onChange={e => set('year', e.target.value)}>
            <option value="">선택</option>{[...new Set(['1','2','3','4',...(p.year ? [String(p.year)] : [])])].map(v => <option key={v} value={v}>{v}학년</option>)}</select></label>
          <label>재학 상태 (필수)<select required value={p.status ?? ''} onChange={e => set('status', e.target.value)}>
            <option value="">선택</option>{[...new Set(['재학','휴학','졸업',...(p.status ? [p.status] : [])])].map(v => <option key={v}>{v}</option>)}</select></label>
        </div>
        {optional && <><p className="help-text">이름, 학번, 연락처에는 가상 정보를 입력하세요. 사이트에서 신청서를 제출하면 공고 담당자가 제출 시점의 기본 정보와 자격 정보를 확인합니다.</p><div className="profile-fields">
          <label>이름 또는 별명<input maxLength={20} value={p.name ?? ''} onChange={e => set('name', e.target.value)} /></label>
          <label>학번<input maxLength={30} value={p.studentNo ?? ''} onChange={e => set('studentNo', e.target.value)} /></label>
          <label>연락처<input type="tel" maxLength={30} value={p.phone ?? ''} onChange={e => set('phone', e.target.value)} /></label>
        </div><h2>자격 정보</h2><div className="profile-fields">
          <label>현재 학년의 학기<select value={p.semester ?? ''} onChange={e => set('semester',e.target.value)}>
            <option value="">선택하지 않음</option><option value="1">1학기</option><option value="2">2학기</option></select></label>
          <label>평균 학점<input type="number" step="0.01" min="0" max="4.5" value={p.gpa ?? ''} onChange={e => set('gpa',e.target.value)} /></label>
          <label>지역 거주 개월<input type="number" step="1" min="0" max="1200" value={p.residence ?? ''} onChange={e => set('residence',e.target.value)} /></label>
        </div><h3>관심 분야</h3><div className="interest-options">{['프로젝트','진로','장학','교류'].map(c =>
          <button type="button" key={c} aria-pressed={interests.includes(c)} className={interests.includes(c)?'active':''}
            onClick={() => set('interests',interests.includes(c)?interests.filter(x=>x!==c):[...interests,c])}>{c}</button>)}</div></>}
        {DEMO && <div className="row wrap">{testMode && <label>가상 학생 유형<select defaultValue="" aria-label="가상 학생 유형" onChange={e => {
          if(e.target.value !== '') setProfile(structuredClone(testStudentProfiles[Number(e.target.value)].profile));
        }}><option value="">선택</option>{testStudentProfiles.map((entry,i) => <option value={i} key={entry.label}>{entry.label}</option>)}</select></label>}
          <button type="button" className="text-button" onClick={() => setProfile(structuredClone(demoProfile))}>시연 프로필 채우기</button></div>}
        <div className="modal-actions">{onboarding && <button className="button secondary" type="submit" value="later" formNoValidate>나중에 입력</button>}
          <button className="button primary" type="submit" value={optional ? 'save' : 'more'}>{busy?'저장 중':optional?'내 정보 저장':'선택 정보 입력'}</button></div>
      </fieldset>
    </form>
    {!onboarding && <>{!testMode && !records.ready ? <SiteRecordStatus records={records}/> : <>
      <QualificationList title="확인된 자격" status="verified" items={records.qualifications}/>
      <QualificationList title="확인 대기 중인 자격" status="claimed" items={records.qualifications}/>
      <QualificationList title="반려된 자격" status="rejected" items={records.qualifications} hideEmpty/>
    </>}<div className="data-note"><a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>
      <button className="text-button danger" onClick={onReset}>내 데이터 삭제</button></div></>}
  </section>;
}
