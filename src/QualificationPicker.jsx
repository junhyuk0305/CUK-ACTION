// Value field of a custom rule: pick an existing qualification or create a new one.
import React, {useEffect, useState} from 'react';
import {Plus} from 'lucide-react';
import {createQualification, listAllQualifications} from './manager-api.js';

export default function QualificationPicker({value, testMode, onPick}) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setError('');
    try {setList(await listAllQualifications());} catch (e) {setError(e.message);}
  }
  useEffect(() => {if (!testMode) load();}, [testMode]);
  async function create() {
    setBusy(true); setError('');
    try {
      const made = await createQualification(name.trim(), description.trim());
      setList(current => [...(current || []), made]); onPick(made);
      setCreating(false); setName(''); setDescription('');
    } catch (e) {setError(e.message);} finally {setBusy(false);}
  }

  if (testMode) return <p className="help-text manager-wide">테스트 공간에서는 직접 만든 자격을 쓸 수 없습니다. 담당자 계정으로 로그인하세요.</p>;
  const selected = list?.find(q => q.id === value);
  return <>
    <label>자격<select value={selected ? value : ''} disabled={!list} onChange={event => onPick(list.find(q => q.id === event.target.value))} required>
      <option value="">{list ? '자격 선택' : '자격 목록을 불러오는 중입니다.'}</option>
      {list?.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
    </select><small>{selected?.description || '학생이 신고하면 담당자가 확인합니다.'}</small></label>
    <div className="manager-wide">
      {error && <div className="warning" role="alert">{error}{!list && <button type="button" className="text-button" onClick={load}>다시 시도</button>}</div>}
      {!creating ? <button type="button" className="text-button" onClick={() => setCreating(true)}><Plus size={16}/>새 자격 만들기</button>
        : <div className="manager-fields">
          <label>새 자격 이름<input value={name} maxLength={40} placeholder="예: 봉사 30시간 이상" onChange={event => setName(event.target.value)}/><small>1~40자. 다른 자격과 이름이 겹치면 만들 수 없습니다.</small></label>
          <label>설명<input value={description} maxLength={200} placeholder="예: 봉사센터 확인서로 확인" onChange={event => setDescription(event.target.value)}/><small>선택. 200자까지 씁니다.</small></label>
          <div className="row wrap manager-wide"><button type="button" className="button secondary" disabled={busy || !name.trim()} onClick={create}>{busy ? '만드는 중' : '자격 만들기'}</button><button type="button" className="text-button" disabled={busy} onClick={() => {setCreating(false); setError('');}}>취소</button></div>
        </div>}
    </div>
  </>;
}
