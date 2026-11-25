// AI rewrite suggestions under the block reach section. The manager applies them in the editor.
import React, {useState} from 'react';
import {noticeBlocks} from './contract.js';
import {suggestNoticeEdits} from './manager-api.js';

export const AI_NOTE = 'AI가 정리한 정보이니 원문을 확인하세요.';

export default function NoticeSuggestions({notice, fromDate, toDate, onEdit}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const blocks = new Map(noticeBlocks(notice).map(block => [block.id, block]));
  async function load() {
    setLoading(true); setError('');
    try {setResult(await suggestNoticeEdits(notice.id, fromDate, toDate));}
    catch (e) {setError(e.message);}
    finally {setLoading(false);}
  }
  const suggestions = (result?.suggestions || []).filter(row => blocks.has(row.blockId));
  return <>
    {!result && <button type="button" className="button secondary" disabled={loading} onClick={load}>AI 수정 제안 받기</button>}
    {loading && <p className="loading-state" role="status">AI가 수정 제안을 만드는 중입니다.</p>}
    {error && <div className="warning" role="alert">{error}</div>}
    {result && (suggestions.length ? <>
      <h3>AI 수정 제안</h3>
      <div className="info-note">{AI_NOTE}</div>
      {suggestions.map(row => <div className="manager-repeat" key={row.blockId}>
        <b>{String(blocks.get(row.blockId).text || '').slice(0, 40)}</b>
        <p className="muted">이유: {row.reason}</p>
        <p>고친 문장: {row.suggestion}</p>
      </div>)}
      <button type="button" className="button primary" onClick={() => onEdit(suggestions)}>공고 수정에서 반영</button>
    </> : <p className="muted">{result.message || 'AI가 고칠 블록을 찾지 못했습니다.'}</p>)}
  </>;
}
