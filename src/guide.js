export const labels={target:'대상',deadline:'모집 마감',action:'다음 행동',operation:'운영기간',payment:'납부기간',change:'수강신청 변경',materials:'준비물'};
const prefixes={target:/^(모집|지원|신청|참여)?대상$/,deadline:/^(모집일정|모집마감|신청마감|접수마감)$/,operation:/^(운영|활동)기간$/,payment:/^(등록금)?납부기간$/,change:/^수강(신청)?변경(기간)?$/,action:/^(신청|접수)방법$/,materials:/^(준비물|제출서류)$/};
export function sourceRows(text){
 return (text||'').split('\n').flatMap(evidence=>{
  const m=evidence.match(/^\s*(?:\d+[.)]\s*)?([^:：]+)[:：]\s*(.+)$/);
  if(!m)return [];
  const kind=Object.keys(prefixes).find(k=>prefixes[k].test(m[1].replace(/\s/g,'')));
  return kind?[{kind,value:m[2].trim(),evidence}]:[];
 });
}
export const scheduled=k=>['deadline','operation','payment','change'].includes(k);
const norm=s=>typeof s==='string'?s.replace(/\s+/g,' ').trim():'';
// The reviewer may omit weekday annotations and normalize spacing without changing the dates.
const dateNorm=s=>norm(s).replace(/\([월화수목금토일]\)/g,'').replace(/\s/g,'').replace(/^~/,'').replace(/\.$/,'');
function sameDate(kind,source,value){
 if(!norm(value)||!/[0-9]{1,2}\s*(?:[월./-])\s*[0-9]{1,2}/.test(source))return false;
 const weekdays=s=>s.match(/\([월화수목금토일]\)/g)?.join('')||'';
 if(weekdays(value)&&weekdays(source)!==weekdays(value))return false;
 if(kind==='deadline'&&/(~|부터|에서|–)/.test(source.replace(/^\s*~/,'')))return false;
 return dateNorm(source)===dateNorm(value);
}
export function supported(row,text){
 // Require the complete labelled line and its complete value: a matching date alone
 // must never turn an operating period into an application deadline.
 const candidates=sourceRows(text).filter(x=>x.kind===row.kind);
 return candidates.length===1 && candidates.some(x=>x.evidence===row.evidence && (scheduled(row.kind)?sameDate(row.kind,x.value,row.value):norm(x.value)===norm(row.value)));
}
// Never persist free-form model or editor text outside the reviewed excerpt.
function safeFragment(s,text){
 return typeof s==='string'&&s.length<=4000&&(text.includes(s)||dateLiteral(s));
}
function dateLiteral(s){
 return /^\s*~?\s*(?:20\d{2}\s*[.년]\s*)?(?:0?[1-9]|1[0-2])\s*[.월]\s*(?:0?[1-9]|[12]\d|3[01])\s*[.일]?\s*(?:\([월화수목금토일]\))?\s*$/.test(s);
}
export function privateRows(rows,text){
 if(!Array.isArray(rows)||rows.length>40)throw Error('초안 형식을 확인하세요.');
 return rows.map(r=>{
 const {kind,value,evidence,decision,originalKind=kind,original=value,originalEvidence=evidence}=r;
 if(!Object.hasOwn(labels,kind)||!Object.hasOwn(labels,originalKind)||!['accept','edit','hold'].includes(decision)||
 ![original,value].every(v=>safeFragment(v,text)||supported({kind,value:v,evidence},text))||
 ![evidence,originalEvidence].every(v=>typeof v==='string'&&text.includes(v)))throw Error('검수 발췌에 없는 문장은 저장할 수 없습니다.');
 return {kind,value,evidence,decision,originalKind,original,originalEvidence};
 });
}
export function reviewRows(rows,text){
 if(!Array.isArray(rows)||!rows.length||rows.length>40)throw Error('검수할 항목을 받지 못했습니다.');
 return rows.map(r=>{if(!r||!Object.hasOwn(labels,r.kind)||typeof r.value!=='string'||typeof r.evidence!=='string')throw Error('초안 형식을 확인할 수 없습니다.');
 const valid=supported(r,text),value=valid||safeFragment(r.value,text)?r.value:'',evidence=text.includes(r.evidence)?r.evidence:'';
 return {kind:r.kind,original:value,originalKind:r.kind,originalEvidence:evidence,value,evidence,decision:'hold',valid};});
}
export function approvedRows(rows,text){
 const result=rows.filter(r=>['accept','edit'].includes(r.decision)).map(({kind,value,evidence})=>({kind,value,evidence}));
 if(!result.length||result.some(r=>!supported(r,text))||new Set(result.map(r=>r.kind)).size!==result.length)throw Error('채택할 값과 원문 근거를 다시 확인하세요.');
 return result;
}
export function initialGuide(id,text){return ['277842','277389'].includes(String(id))?sourceRows(text):[];}
export const schedules=rows=>Object.fromEntries(rows.filter(r=>scheduled(r.kind)).flatMap(r=>{
 const match=r.value.match(/^(.*?)\s*\/\s*(\d{1,2}:\d\d)\s*~\s*(\d{1,2}:\d\d)\s*$/);
 if(!match)return [[labels[r.kind],r.value]];
 const action=r.kind==='payment'?'납부':labels[r.kind];
 return [[labels[r.kind],match[1]],[action+' 시작 시각',match[2]],[action+' 마감 시각',match[3]]];
}));
export function scheduleDiff(previous,current){
 if(!previous)return [];
 return [...new Set([...Object.keys(previous),...Object.keys(current)])].filter(k=>previous[k]!==current[k]&&(!(k in previous)||!(k in current)||dateNorm(previous[k])!==dateNorm(current[k]))).map(k=>k+' '+(previous[k]??'일정 없음')+' → '+(current[k]??'일정 삭제'));
}
export function applicationSchedule(n){return Object.fromEntries([['모집 마감',n.deadline],['마감 시각',n.deadlineTime],...(n.followupSteps||[]).flatMap(s=>[[s.label+' 마감',s.deadline],[s.label+' 마감 시각',s.deadlineTime]])].filter(([,v])=>v));}
