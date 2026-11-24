import React,{useState,useEffect,useRef} from 'react';
import {guideAction,readGuideDraft} from './gateway.js';
import {labels,supported,approvedRows} from './guide.js';
import {archiveAiInput} from './archive.js';
export default function GuideReview({testMode}){
 const [list,setList]=useState([]),[id,setId]=useState('277842'),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[dirty,setDirty]=useState(false);
 const lock=useRef(false),text=archiveAiInput(id);
 useEffect(()=>{let active=true;fetch('/archive.json').then(r=>r.json()).then(r=>{if(active)setList(r.filter(n=>archiveAiInput(n.id)));}).catch(()=>{if(active)setMsg('공고 목록을 읽지 못했습니다. 새로고침하세요.');});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;setBusy(true);setRows([]);setDirty(false);setMsg('');readGuideDraft(id).then(r=>{if(active)setRows(r);}).catch(e=>{if(active)setMsg(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[id]);
 async function run(action){
 if(lock.current)return;lock.current=true;setBusy(true);setMsg('');
 try{
 if(['sample','extract'].includes(action)){
 if((dirty||rows.some(r=>r.decision!=='hold'))&&!confirm('작성 중인 초안을 새 초안으로 바꿀까요?'))return;
 const next=await guideAction(action,id);await guideAction('draft',id,next);setRows(next);setDirty(false);setMsg(action==='sample'?'테스트 대역으로 만든 초안입니다.':'AI 초안을 저장했습니다.');
 }else{
 if(action==='approve')approvedRows(rows,text);
 await guideAction('draft',id,rows);setDirty(false);
 if(action==='approve')await guideAction(action,id,rows);
 setMsg(action==='approve'?'승인한 항목을 학생 안내에 반영했습니다.':'검수 초안을 저장했습니다.');
 }
 }catch(e){setMsg(e.message);}finally{lock.current=false;setBusy(false);}
 }
 const change=(i,patch)=>{setDirty(true);setRows(old=>old.map((r,j)=>i===j?{...r,...patch}:r));};
 return <section className="panel guide-review"><h2>공식 공고 AI 검수</h2><fieldset disabled={busy}><label>검수할 공고 <select value={id} onChange={e=>{if(!dirty||confirm('저장하지 않은 수정을 버릴까요?'))setId(e.target.value);}}>{list.map(n=><option key={n.id} value={n.id}>{n.id} {n.title}</option>)}</select></label>
 <button onClick={()=>run('extract')}>AI 초안 만들기</button>{testMode&&<button onClick={()=>run('sample')}>테스트 초안 불러오기</button>}
 {rows.map((r,i)=><fieldset key={i}><legend>{labels[r.kind]}</legend><blockquote>{r.evidence}</blockquote><p>AI 초안: {labels[r.originalKind||r.kind]} / {r.original}</p>{r.decision==='edit'&&<><label>항목 종류 <select value={r.kind} onChange={e=>change(i,{kind:e.target.value})}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>검수된 근거 문장 <select value={r.evidence} onChange={e=>change(i,{evidence:e.target.value})}>{[...new Set([r.evidence,...text.split('\n')])].map(line=><option key={line}>{line}</option>)}</select></label></>}<label>최종값 <input value={r.value} onChange={e=>change(i,{value:e.target.value,decision:'edit'})}/></label>
 <label>검수 결과 <select value={r.decision} onChange={e=>change(i,{decision:e.target.value,...(e.target.value==='accept'?{value:r.original,kind:r.originalKind||r.kind,evidence:r.originalEvidence||r.evidence}:{})})}><option value="hold">보류</option><option value="accept">채택</option><option value="edit">수정</option></select></label>
 {!supported(r,text)&&<p>원문에서 값이나 항목 종류를 확인할 수 없습니다.</p>}</fieldset>)}
 {!!rows.length&&<><button onClick={()=>run('draft')}>초안 저장</button><button onClick={()=>run('approve')}>학생 안내 승인</button></>}</fieldset><p role="status">{msg}</p></section>;
}
export function ResponseReport({reports}){
 return <section className="panel"><h3>학생이 더 확인한 내용</h3>{!reports?.length?<p>이 기간에는 연결된 학생 응답 자료가 없습니다.</p>:reports.map(r=>{
 const sorted=Object.entries(r.counts).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
 return <div key={r.source}><b>{r.source}</b>{r.zero?<p>응답자 0명</p>:sorted.length?sorted.map(([k,n])=><p key={k}>{sorted.findIndex(v=>v[1]===n)+1}위 {k} {n}명</p>):<p>표시할 만큼 응답이 모이지 않았습니다.</p>}</div>;})}</section>;
}
