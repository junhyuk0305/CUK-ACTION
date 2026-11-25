// Draft a new notice from a school notice link. The result fills the editor fields; the manager checks each against the source.
import React, {useState} from 'react';
import {draftNotice} from './manager-api.js';
import {AI_NOTE} from './NoticeSuggestions.jsx';

export default function NoticeDraft({testMode, draft, onDraft}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setLoading(true); setError('');
    try {onDraft(await draftNotice(url.trim()));}
    catch (e) {setError(e.message);}
    finally {setLoading(false);}
  }
  return <section className="panel manager-section">
    <h3>학교 공지 링크로 초안 만들기</h3>
    {testMode ? <p className="muted">테스트 공간에서는 링크 초안을 만들 수 없습니다. 담당자 계정으로 로그인하세요.</p> : <>
      <form className="manager-fields" onSubmit={submit}>
        <label className="manager-wide">학교 공지 주소<input type="url" value={url} placeholder="https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=..." onChange={event => setUrl(event.target.value)} disabled={loading} required/><small>가톨릭대학교 공지사항 상세 주소만 넣을 수 있습니다. 이미지와 첨부는 읽지 않습니다.</small></label>
        <div><button className="button secondary" disabled={loading || !url.trim()}>초안 만들기</button></div>
      </form>
      {loading && <p className="loading-state" role="status">원문을 읽고 초안을 만드는 중입니다.</p>}
      {error && <div className="warning" role="alert">{error}</div>}
      {draft && <>
        <div className="info-note">{AI_NOTE}</div>
        <p className="muted">채운 칸 아래에 원문 근거를 붙였습니다.{draft.blocks ? ' 본문은 원문 한 줄을 블록 하나로 넣었습니다.' : ''} 신청 방식은 직접 고르세요.</p>
        {draft.message && <p className="muted">{draft.message}</p>}
        {draft.duplicateNoticeId && <div className="warning" role="status">같은 원문으로 게시 중인 공고가 있습니다.</div>}
      </>}
    </>}
  </section>;
}
