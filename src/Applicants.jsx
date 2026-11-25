// Applicant table and applicant detail for a site-mode notice.
import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {goBack, useBackLayer} from './back-layer.js';
import {applicantRow, answerRows, claimRows, profileRows, qualificationIds, ruleRows} from './applicants.js';
import {decideQualification, listApplications, listClaims, listQualifications} from './manager-api.js';

export default function Applicants({notice, testMode, backLabel}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const listScroll = useRef(0);
  async function load() {
    setError(''); setData(null);
    try {
      const applications = await listApplications(notice.id);
      const [claims, qualifications] = await Promise.all([listClaims(applications.map(a => a.id)), listQualifications(qualificationIds(applications))]);
      setData({applications, claims, qualifications});
    } catch (e) {setError(e.message || '신청자를 불러오지 못했습니다. 다시 시도해 주세요.');}
  }
  useEffect(() => {if (!testMode) load();}, [notice.id, testMode]);
  function open(id) {listScroll.current = window.scrollY; setSelectedId(id); window.scrollTo(0, 0);}
  function close() {setSelectedId(null); requestAnimationFrame(() => window.scrollTo({top: listScroll.current, behavior: 'instant'}));}
  useBackLayer(!!selectedId, close);
  const selected = data?.applications.find(a => a.id === selectedId);

  // A decided claim updates the same row here, so the detail and its rule rows show the new status.
  const decided = (userId, qualificationId, status) => setData(current => ({...current,
    claims: current.claims.map(r => r.user_id === userId && r.qualification_id === qualificationId ? {...r, status} : r)}));
  if (selected) return <ApplicantDetail application={selected} notice={notice} claims={data.claims} qualifications={data.qualifications} onDecided={decided}/>;
  return <section className="manager-applicants">
    <button className="back" onClick={goBack}><ArrowLeft size={16}/>{backLabel}</button>
    <div className="page-heading"><div><h1>{notice.title || '제목 없는 공고'}</h1><p>신청자 목록</p></div></div>
    {testMode ? <div className="info-note">테스트 공간에서는 신청자 명단을 볼 수 없습니다. 담당자 계정으로 로그인하세요.</div>
      : error ? <div className="warning" role="alert">{error}<button className="text-button" onClick={load}>다시 시도</button></div>
      : !data ? <p className="loading-state" role="status">신청자를 불러오는 중입니다.</p>
      : !data.applications.length ? <div className="empty"><h3>아직 신청한 학생이 없습니다.</h3></div>
      : <section className="panel workflow-metrics">
        <h3>신청서 {data.applications.length}건</h3>
        <p className="help-text">줄을 누르면 지원자 상세를 엽니다.</p>
        <div className="table-scroll" role="region" tabIndex={0} aria-label="신청서 표. 좁은 화면에서 좌우로 스크롤할 수 있습니다."><table><thead><tr><th scope="col">이름</th><th scope="col">학번</th><th scope="col">학과</th><th scope="col">학년</th><th scope="col">자격</th><th scope="col">제출 시각</th><th scope="col">상태</th></tr></thead>
          <tbody>{data.applications.map(applicantRow).map(row => <tr key={row.id} className={row.withdrawn ? 'is-withdrawn' : ''} onClick={() => open(row.id)}>
            <th scope="row"><button type="button" className="text-button">{row.name}</button></th><td>{row.studentNo}</td><td>{row.department}</td><td>{row.year}</td>
            <td>{row.eligibility}{row.failed && <> <span className="tag red">자격 미충족</span></>}</td><td>{row.submitted}</td><td><span className={'tag' + (row.withdrawn ? ' gray' : '')}>{row.status}</span></td>
          </tr>)}</tbody></table></div>
      </section>}
  </section>;
}

function ApplicantDetail({application, notice, claims, qualifications, onDecided}) {
  const row = applicantRow(application);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  async function decide(qualificationId, verified) {
    setBusy(qualificationId); setError('');
    try {onDecided(application.user_id, qualificationId, await decideQualification(application.user_id, qualificationId, verified));}
    catch (e) {setError(e.message);} finally {setBusy(null);}
  }
  const actions = r => r.state && <div className="row wrap">
    {r.state !== 'verified' && <button type="button" className="button secondary" disabled={!!busy} onClick={() => decide(r.qualificationId, true)}>확인</button>}
    {r.state !== 'rejected' && <button type="button" className="button secondary" disabled={!!busy} onClick={() => decide(r.qualificationId, false)}>반려</button>}
  </div>;
  return <section className="manager-applicants manager-applicant-detail">
    <button className="back" onClick={goBack}><ArrowLeft size={16}/>신청자 목록으로</button>
    <div className="page-heading"><div><h1>{row.name}</h1><p className="meta-line"><span>지원자 상세</span><span>{notice.title}</span><span>제출 {row.submitted}</span></p></div><div className="row wrap"><span className={'tag' + (row.withdrawn ? ' gray' : '')}>{row.status}</span>{row.failed && <span className="tag red">자격 미충족</span>}</div></div>
    <Rows title="제출 답변" head={['문항', '답변']} rows={answerRows(application, notice).map(r => [r.label, r.answer])}/>
    <Rows title="제출 시점 프로필" head={['항목', '값']} rows={profileRows(application).map(r => [r.label, r.value])}/>
    <Rows title={application.eligibility?.total ? `제출 시점 자격 판정 ${row.eligibility}` : '제출 시점 자격 판정'} head={['조건', '판정', '근거']} rows={ruleRows(application, claims).map(r => [r.label, <span className={'tag' + ({pass: ' green', fail: ' red', unknown: ' orange'}[r.status] || ' gray')}>{r.statusLabel}</span>, r.value])} empty="지원 조건이 없는 공고입니다."/>
    {error && <div className="warning" role="alert">{error}</div>}
    <Rows title="자기 신고" head={['자격', '학생 설명', '상태', '처리']} rows={claimRows(application, claims, qualifications).map(r => [r.name, r.note || '설명 없음', r.status, actions(r)])} empty="자기 신고가 없습니다."/>
  </section>;
}

function Rows({title, head, rows, empty}) {
  return <section className="panel workflow-metrics">
    <h3>{title}</h3>
    {!rows.length ? <p className="help-text">{empty}</p> : <div className="table-scroll"><table><thead><tr>{head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map(([first, ...rest], i) => <tr key={i}><th scope="row">{first}</th>{rest.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
