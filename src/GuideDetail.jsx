import './guide.css';
import React,{useEffect,useState} from 'react';
import {initialGuide,labels,schedules,scheduleDiff} from './guide.js';
import {archiveAiInput} from './archive.js';
import {readGuide} from './gateway.js';

export function Differences({before,now,onRead}){
 const changes=scheduleDiff(before,now);
 return changes.length?<section className="warning"><h3>변경된 일정</h3>{changes.map(s=><p key={s}>{s}</p>)}<button onClick={onRead}>변경 일정 확인</button></section>:null;
}
export default function GuideDetail({item,publicOnly=false,status,onStatus,seen,onSeen}){
 const [rows,setRows]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[skip,setSkip]=useState(false);
 const text=archiveAiInput(item.id);
 useEffect(()=>{let active=true;const load=()=>readGuide(item.id,publicOnly).then(r=>{if(active){setRows(r??initialGuide(item.id,text));setError('');}}).catch(e=>{if(active)setError(e.message);});
 load();window.addEventListener('focus',load);window.addEventListener('storage',load);
 return()=>{active=false;window.removeEventListener('focus',load);window.removeEventListener('storage',load);};},[item.id,publicOnly,retry]);
 const now=schedules(rows||[]);
 useEffect(()=>{if(rows?.length&&!seen&&!error)onSeen(now);},[rows,seen,error]);
 if(error)return <p role="alert">{error} <button onClick={()=>setRetry(retry+1)}>다시 시도</button></p>;
 if(!rows?.length)return null;
 const target=rows.find(r=>r.kind==='target'),exchange=/타대학 소속 학점교류생/.test(item.title);
 const fact=r=><div key={r.kind}><strong>{labels[r.kind]}</strong><p>{r.value}{r.kind==='change'?' (변경이 필요한 경우)':''}</p><details><summary>{labels[r.kind]} 원문 근거</summary>{r.evidence}</details></div>;
 return <section className="guide-facts" aria-label="학생 안내">
 {target?fact(target):exchange?<div><strong>대상</strong><p>타대학 소속 학점교류생</p><details><summary>대상 원문 근거</summary>{item.title}</details></div>:<p>대상은 원문에서 확인하세요.</p>}
 {rows.filter(r=>r.kind==='deadline').map(fact)}{!exchange&&!rows.some(r=>r.kind==='deadline')&&<p>모집 마감은 원문에서 확인하세요.</p>}
 {rows.some(r=>r.kind==='deadline'&&!/\d:\d|\d시/.test(r.value))&&<small>마감 시각은 원문에서 확인하세요.</small>}
 <div><strong>다음 행동</strong><p><a href={item.url} target="_blank" rel="noreferrer">{exchange?'학교 원문에서 납부 방법 확인':'학교 원문에서 신청 방법 확인'}</a></p></div>
 {rows.filter(r=>!['target','deadline'].includes(r.kind)).map(fact)}
 {!rows.some(r=>r.kind==='materials')&&<p>준비물은 원문에서 확인하세요.</p>}
 {target?.value==='가톨릭대학교 재학생 전체'&&(status?<p>{status==='재학'?'재학생 대상 조건을 충족합니다.':'현재 프로필은 재학생 대상 조건과 다릅니다.'}</p>:skip?<p>대상은 재학생 전체입니다.</p>:<div><label>재학 여부 <select defaultValue="" onChange={e=>onStatus(e.target.value)}><option value="" disabled>선택</option>{['재학','휴학','졸업'].map(v=><option key={v}>{v}</option>)}</select></label> <button onClick={()=>setSkip(true)}>건너뛰기</button></div>)}
 <Differences before={seen} now={now} onRead={()=>onSeen(now)}/><small>AI가 정리한 정보이니 원문을 확인하세요.</small></section>;
}
