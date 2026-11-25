import React from 'react';
export function ResponseReport({reports}){
 return <section className="panel"><h3>학생이 더 확인한 내용</h3>{!reports?.length?<p>이 기간에는 연결된 학생 응답 자료가 없습니다.</p>:reports.map(r=>{
 const sorted=Object.entries(r.counts).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
 return <div key={r.source}><b>{r.source}</b>{r.zero?<p>응답자 0명</p>:sorted.length?sorted.map(([k,n])=><p key={k}>{sorted.findIndex(v=>v[1]===n)+1}위 {k} {n}명</p>):<p>표시할 만큼 응답이 모이지 않았습니다.</p>}</div>;})}</section>;
}
