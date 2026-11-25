// Body block editor, form builder and preview dialog for the notice editor.
import React, {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, Plus, Trash2, X} from 'lucide-react';
import {PROFILE_FIELDS} from './contract.js';
import {BLOCK_LIMIT, BLOCK_TEXT_MAX, MAX_LIMIT, QUESTION_LABELS, move, newBlock, newQuestion, withType} from './notice-editor.js';
import ApplicationForm from './ApplicationForm.jsx';
import NoticeBlocks from './NoticeBlocks.jsx';
import {AI_NOTE} from './NoticeSuggestions.jsx';
import {uploadNoticeImage} from './manager-api.js';

const blockLabels = {heading: '소제목', text: '문단', image: '이미지'};

function MoveButtons({name, index, count, onMove, onRemove}) {
  return <div className="row">
    <button type="button" className="icon-button" aria-label={`${name} 위로`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={16}/></button>
    <button type="button" className="icon-button" aria-label={`${name} 아래로`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={16}/></button>
    <button type="button" className="icon-button" aria-label={`${name} 삭제`} onClick={onRemove}><Trash2 size={16}/></button>
  </div>;
}

// Image block: uploads on choose, then asks for the required alt text. A file is required until one is uploaded.
function ImageBlock({block, name, noticeId, testMode, onChange}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError('');
    try {onChange({src: await uploadNoticeImage(file, noticeId)});} catch (e) {setError(e.message);} finally {setBusy(false);}
  }
  return <div className="manager-fields">
    {block.src && <img className="manager-wide manager-image-preview" src={block.src} alt={block.alt}/>}
    {testMode ? <p className="info-note manager-wide">테스트 공간에서는 이미지를 올릴 수 없습니다. 담당자 계정으로 로그인하세요.</p>
      : <label className="manager-wide">{name} 파일<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={choose} required={!block.src}/><small>png, jpg, webp 파일을 5MB까지 올립니다.{block.src ? ' 다른 파일을 고르면 이미지를 바꿉니다.' : ''}</small></label>}
    {busy && <p className="loading-inline manager-wide" role="status">이미지를 올리는 중입니다.</p>}
    {error && <div className="warning manager-wide" role="alert">{error}</div>}
    <label className="manager-wide">대체 글<input value={block.alt || ''} maxLength={BLOCK_TEXT_MAX} placeholder="예: 활동 일정표" onChange={event => onChange({alt: event.target.value})} required/><small>이미지를 볼 수 없는 학생에게 읽어 줄 설명입니다.</small></label>
  </div>;
}

// suggestions: AI rewrites from the metrics screen. Text changes only when the manager presses 적용.
export function BlockEditor({blocks, noticeId, testMode, suggestions = [], onApply, onChange}) {
  const full = blocks.length >= BLOCK_LIMIT;
  const patch = (index, value) => onChange(blocks.map((block, i) => i === index ? {...block, ...value} : block));
  const update = (index, text) => patch(index, {text});
  return <div className="manager-wide">
    <div className="section-heading manager-block-heading"><b>본문 블록</b><div className="row wrap">{['heading', 'text', 'image'].map(type => <button key={type} type="button" className="text-button" disabled={full} onClick={() => onChange([...blocks, newBlock(type)])}><Plus size={16}/>{blockLabels[type]} 추가</button>)}</div></div>
    {!blocks.length && <p className="manager-empty">본문 블록이 없습니다. 학생 화면 본문에는 공고 요약을 보여 줍니다.</p>}
    {blocks.map((block, index) => {
      const name = `${blockLabels[block.type] || '블록'} ${index + 1}`, suggestion = block.type !== 'image' && suggestions.find(row => row.blockId === block.id);
      return <div className="manager-repeat" key={block.id}>
        <div className="section-heading"><b>{name}</b><MoveButtons name={name} index={index} count={blocks.length} onMove={delta => onChange(move(blocks, index, delta))} onRemove={() => onChange(blocks.filter((_, i) => i !== index))}/></div>
        {block.type === 'image' ? <ImageBlock block={block} name={name} noticeId={noticeId} testMode={testMode} onChange={value => patch(index, value)}/>
          : <div className="manager-fields"><label className="manager-wide">{name} 내용{block.type === 'heading' ? <input value={block.text} maxLength={BLOCK_TEXT_MAX} onChange={event => update(index, event.target.value)} required/> : <textarea value={block.text} maxLength={BLOCK_TEXT_MAX} onChange={event => update(index, event.target.value)} required/>}</label></div>}
        {suggestion && <div className="info-note"><div><p><b>AI 수정 제안</b></p><p>이유: {suggestion.reason}</p><p>고친 문장: {suggestion.suggestion}</p><p>{AI_NOTE}</p><button type="button" className="text-button" onClick={() => onApply(suggestion)}>적용</button></div></div>}
      </div>;
    })}
    {full && <p className="muted">본문 블록은 {BLOCK_LIMIT}개까지 넣을 수 있습니다.</p>}
  </div>;
}

export function QuestionEditor({questions, locked, onChange}) {
  const update = (index, next) => onChange(questions.map((q, i) => i === index ? next : q));
  return <>
    <div className="section-heading"><b>지원서 작성 문항</b>{!locked && <button type="button" className="text-button" onClick={() => onChange([...questions, newQuestion()])}><Plus size={16}/>문항 추가</button>}</div>
    {locked && <div className="info-note">게시 후에는 문항 구조를 바꿀 수 없습니다. 제목과 안내 문구는 고칠 수 있습니다.</div>}
    {!questions.length && <p className="manager-empty">별도 작성 문항이 없습니다.</p>}
    {questions.map((question, index) => {
      const name = `문항 ${index + 1}`, set = patch => update(index, {...question, ...patch});
      return <div className="manager-repeat" key={question.id}>
        <div className="section-heading"><b>{name}</b>{!locked && <MoveButtons name={name} index={index} count={questions.length} onMove={delta => onChange(move(questions, index, delta))} onRemove={() => onChange(questions.filter((_, i) => i !== index))}/>}</div>
        <div className="manager-fields">
          <label>문항 종류<select value={question.type} disabled={locked} onChange={event => update(index, withType(question, event.target.value))}>{Object.entries(QUESTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>문항 제목<input value={question.label} onChange={event => set({label: event.target.value})} maxLength={200} required/></label>
          {question.type === 'profile' && <label>기본 정보 항목<select value={question.profileField} disabled={locked} onChange={event => set({profileField: event.target.value, ...(question.label === PROFILE_FIELDS[question.profileField] || !question.label?.trim() ? {label: PROFILE_FIELDS[event.target.value]} : {})})}>{Object.entries(PROFILE_FIELDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>학생 프로필 값으로 미리 채웁니다.</small></label>}
          {(question.type === 'short' || question.type === 'long') && <label>최대 글자 수<input type="number" min="1" max={MAX_LIMIT[question.type]} step="1" value={question.max} disabled={locked} onChange={event => set({max: event.target.value === '' ? '' : Number(event.target.value)})} required/><small>1~{MAX_LIMIT[question.type].toLocaleString()}자</small></label>}
          {question.type === 'select' && <label className="manager-wide">선택지<textarea value={(question.options || []).join('\n')} disabled={locked} placeholder={'1기\n2기'} onChange={event => set({options: event.target.value.split('\n')})} required/><small>선택지를 한 줄에 하나씩 2~20개 입력하세요.</small></label>}
          <label className="manager-review"><input type="checkbox" checked={!!question.required} disabled={locked} onChange={event => set({required: event.target.checked})}/><span>필수 문항</span></label>
          <label className="manager-wide">작성 안내<textarea value={question.hint || ''} onChange={event => set({hint: event.target.value})}/></label>
        </div>
      </div>;
    })}
  </>;
}

export function PreviewDialog({notice, onClose}) {
  const [value, setValue] = useState({answers: {}, claims: []});
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => {if (event.key === 'Escape') onClose();};
    document.addEventListener('keydown', onKey);
    return () => {document.removeEventListener('keydown', onKey); previous?.focus?.();};
  }, []);
  return <div className="modal-backdrop" onClick={onClose}><section className="modal manager-preview" role="dialog" aria-modal="true" aria-labelledby="manager-preview-title" onClick={event => event.stopPropagation()}>
    <div className="section-heading"><div><div className="eyebrow">미리보기</div><h2 id="manager-preview-title">{notice.title || '제목 없는 공고'}</h2></div><button ref={closeRef} type="button" className="icon-button" aria-label="미리보기 닫기" onClick={onClose}><X size={22}/></button></div>
    <p className="muted">학생 화면과 같은 부품으로 보여 줍니다. 입력한 답은 저장하지 않습니다.</p>
    <NoticeBlocks notice={notice}/>
    <h3>신청서</h3>
    {notice.questions.length ? <ApplicationForm notice={notice} profile={{}} verifiedIds={[]} value={value} onChange={setValue} preview/> : <p className="manager-empty">작성 문항이 없습니다.</p>}
  </section></div>;
}
