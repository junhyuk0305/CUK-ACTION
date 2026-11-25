import React, { useEffect, useState } from 'react';
import { ArrowRight, Bell } from 'lucide-react';
import { ownNoticeAlerts, markNoticeRead } from './student-api.js';

export function NoticeReadReceipt({ userId, noticeId }) {
  const [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    markNoticeRead(userId, noticeId).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [userId, noticeId, attempt]);
  return error && <div className="warning" role="alert">{error}
    <button className="text-button" onClick={() => setAttempt(n => n + 1)}>읽음 저장 다시 시도</button></div>;
}

export default function NewNoticeAlerts({ userId, onOpen }) {
  const [rows, setRows] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    ownNoticeAlerts(userId).then(value => { if (active) setRows(value); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [userId, attempt]);
  return <section aria-labelledby="new-notice-alerts"><h2 id="new-notice-alerts">새 공고 알림</h2>
    {error ? <div className="warning" role="alert">{error}
      <button className="text-button" onClick={() => setAttempt(n => n + 1)}>다시 시도</button></div>
      : rows === null ? <p className="loading-state" role="status">새 공고 알림을 불러오는 중입니다.</p>
      : !rows.length && <p className="muted">새 공고 알림이 없습니다.</p>}
    {rows?.map(row => {
      const notice = row.notices;
      return <article className="notification panel" key={row.id}><span className="category-icon"><Bell size={21}/></span>
        <div><span className="tiny">{row.read_at ? '읽음' : '읽지 않음'}</span>
          <h3>{notice?.title || '게시가 종료된 공고'}</h3>
          <p>지원 조건 {row.pass}/{row.total} 충족</p>
          {notice && <p>{notice.deadline ? '마감일 ' + notice.deadline : '마감일 미정'}</p>}
        </div>
        {notice?.status === 'published' && <a className="button secondary" data-open={row.notice_id}
          href={'/account.html?src=alert#notice/' + encodeURIComponent(row.notice_id)}
          onClick={e => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && e.button === 0 && onOpen(row.notice_id)) e.preventDefault(); }}>
          공고 보기<ArrowRight size={16}/></a>}
      </article>;
    })}
  </section>;
}
