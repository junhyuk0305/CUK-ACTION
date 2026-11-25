import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ownApplications, ownQualifications } from './student-api.js';

export function useSiteRecords(userId, enabled) {
  const [rows, setRows] = useState([]);
  const [qualifications, setQualifications] = useState([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [qualificationError, setQualificationError] = useState('');
  const qualificationRequest = useRef(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setReady(false); setError(''); setQualificationError('');
    Promise.all([ownApplications(userId), ownQualifications(userId)]).then(([applications, items]) => {
      if (active) { setRows(applications); setQualifications(items); setReady(true); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; qualificationRequest.current++; };
  }, [userId, enabled, attempt]);
  async function refreshQualifications() {
    const request = ++qualificationRequest.current;
    setQualificationError('');
    try {
      const next = await ownQualifications(userId);
      if (qualificationRequest.current === request) setQualifications(next);
    } catch (e) {
      if (qualificationRequest.current === request) setQualificationError(e.message);
    }
  }
  function update(row) {
    setRows(previous => [...previous.filter(r => r.notice_id !== row.notice_id), row]);
    if (row.status === 'submitted' && row.claims?.length) void refreshQualifications();
  }
  return { rows, qualifications, error, ready, retry, update, qualificationError, refreshQualifications };
}

export function SiteRecordStatus({ records }) {
  return records.error ? <div className="warning" role="alert">{records.error}
    <button className="text-button" onClick={records.retry}>다시 시도</button></div>
    : <p className="loading-state" role="status">신청 정보를 불러오는 중입니다.</p>;
}

export function SiteApplicationRow({ entry, onOpen }) {
  return <article className="application-row site-application-row">
    <div><span className={'tag ' + (entry.status === 'submitted' ? 'green' : 'gray')}>{{ submitted: '제출 완료', withdrawn: '신청 취소', draft: '작성 중' }[entry.status]}</span>
      <h2>{entry.notice?.title ?? '게시가 종료된 공고'}</h2>
      {entry.notice?.deadline && <p className="meta-line"><span>{entry.notice.deadline} 마감</span><span>사이트 신청</span></p>}</div>
    {entry.notice && <button className="button secondary" data-open={entry.notice.id} onClick={() => onOpen(entry.notice)}>
      신청서 보기</button>}
  </article>;
}
