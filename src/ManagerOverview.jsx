import React, {useEffect, useId, useRef, useState} from 'react';
import {ArrowRight, CalendarDays, ChevronRight, Eye, Bookmark, ClipboardList, CheckCircle2, Plus, RefreshCw} from 'lucide-react';
import {getManagerOverview} from './gateway.js';
import {daysLeft} from './logic.js';
import './overview.css';

const stages = [
  {key:'view',label:'상세 조회',short:'조회',icon:Eye},
  {key:'interest',label:'관심 등록',short:'관심',icon:Bookmark},
  {key:'start',label:'준비 시작',short:'준비',icon:ClipboardList},
  {key:'complete',label:'학생이 표시한 제출 완료',short:'제출 완료 표시',icon:CheckCircle2},
  {key:'link',label:'신청 경로 이동',short:'경로 이동'},
];
const statusLabels={published:'게시 중',draft:'임시저장',archived:'게시 종료'};
const series=[{key:'view',label:'상세 조회',color:'var(--blue)'},{key:'start',label:'준비 시작',color:'var(--green)',dash:'6 3'},{key:'complete',label:'제출 완료 표시',color:'var(--orange)',dash:'2 3'}];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// The aggregate RPCs accept at most 367 days; check before asking the server.
const periodDays=({fromDate,toDate})=>(Date.parse(toDate)-Date.parse(fromDate))/86400000+1;
const periodLimitText='집계 기간은 최대 367일입니다. 시작일이나 종료일을 바꿔 주세요.';
function rangeFor(days){const toDate=today(),start=new Date(toDate+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);return {fromDate:start.toISOString().slice(0,10),toDate};}
const count=value=>value===null||value===undefined?'비공개':value.toLocaleString();
const dayLabel=date=>date?.slice(5).replace('-','.')||'';

export default function ManagerOverview({user,testMode,notices=[],listError='',onRetryList,onOpenNotice,onCreate,onFilterStatus,onOpenList,refreshKey}){
  const [source,setSource]=useState(testMode?'sample':'activity');
  const [period,setPeriod]=useState(()=>rangeFor(14));
  const [draftPeriod,setDraftPeriod]=useState(()=>rangeFor(14));
  const [preset,setPreset]=useState(14),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[periodError,setPeriodError]=useState(''),[reload,setReload]=useState(0),[sort,setSort]=useState('view');
  const request=useRef(0),comparison=useRef(null),detail=useRef(null);
  const [selectedId,setSelectedId]=useState(null);
  function reveal(ref){requestAnimationFrame(()=>{ref.current?.focus({preventScroll:true});ref.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});}
  function compareBy(key){setSort(key);setSelectedId(null);reveal(comparison);}
  function inspectNotice(notice){setSelectedId(notice.id);reveal(detail);}
  useEffect(()=>{
    const current=++request.current;setLoading(true);setError('');setData(null);
    getManagerOverview({...period,source}).then(result=>{if(current===request.current)setData(result);}).catch(e=>{if(current===request.current)setError(e.message||'통합 집계를 불러오지 못했습니다. 다시 시도해 주세요.');}).finally(()=>{if(current===request.current)setLoading(false);});
    return()=>{request.current++;};
  },[user.id,period.fromDate,period.toDate,source,refreshKey,reload]);
  function choosePeriod(days){const next=rangeFor(days);setPeriodError('');setPreset(days);setPeriod(next);setDraftPeriod(next);}
  function applyPeriod(e){e.preventDefault();if(!draftPeriod.fromDate||!draftPeriod.toDate||draftPeriod.fromDate>draftPeriod.toDate){setPeriodError('집계 시작일과 종료일을 확인하세요.');return;}if(periodDays(draftPeriod)>367){setPeriodError(periodLimitText);return;}setPeriodError('');setPreset(null);setPeriod({...draftPeriod});}
  const stateCount=status=>notices.filter(n=>n.status===status).length;
  const upcoming=notices.filter(n=>n.status==='published'&&Number.isFinite(daysLeft(n.deadline))&&daysLeft(n.deadline)>=0).sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,3);
  const rows=[...(data?.notices||[])].sort((a,b)=>sort==='deadline'?String(a.deadline||'9999').localeCompare(String(b.deadline||'9999')):((b.counts?.[sort]??-1)-(a.counts?.[sort]??-1)));
  const maxStage=Math.max(1,...stages.map(s=>data?.counts?.[s.key]??0));
  const selectedNotice=data?.notices?.find(n=>n.id===selectedId);
  const openNotice=notice=>onOpenNotice?.(notices.find(n=>n.id===notice.id)||notice,{source,fromDate:data.fromDate,toDate:data.toDate,counts:notice.counts,denominator:notice.counts?.view});

  return <div className="overview" aria-label="담당자 대시보드">
    <div className="overview-heading"><div><h2>담당 공고 반응</h2><p>공고별 반응과 다음으로 확인할 일을 살펴보세요.</p></div><button className="button primary" onClick={onCreate}><Plus size={16}/>새 공고 등록</button></div>
    {listError?<div className="warning" role="alert">{listError}<button className="text-button" onClick={onRetryList}>다시 시도</button></div>:<div className="overview-portfolio" aria-label="공고 게시 현황">
      <button onClick={onOpenList}><span>전체 공고</span><strong>{notices.length}</strong><ChevronRight size={15}/></button>
      {['published','draft','archived'].map(status=><button key={status} onClick={()=>onFilterStatus?.(status)}><i className={'overview-status-dot '+status}/><span>{statusLabels[status]}</span><strong>{stateCount(status)}</strong><ChevronRight size={15}/></button>)}
    </div>}
    <section className="overview-controls" aria-label="통합 집계 설정">
      <div className="overview-source-row"><div className="tabs overview-source-tabs">{testMode&&<button className={source==='sample'?'active':''} onClick={()=>setSource('sample')}>가상 시나리오</button>}<button className={source==='activity'?'active':''} onClick={()=>setSource('activity')}>{testMode?'이 브라우저 기록':'서비스 기록'}</button></div><span className="overview-source-note">{source==='sample'?'화면 검증용 가상 수치입니다.':'선택한 기간에 발생한 행동 기록입니다.'}</span></div>
      <div className="overview-period-row"><div className="overview-presets" aria-label="집계 기간 빠른 선택">{[7,14,30].map(days=><button className={preset===days?'active':''} key={days} onClick={()=>choosePeriod(days)}>최근 {days}일</button>)}</div><form onSubmit={applyPeriod}><label><span>집계 시작일</span><input aria-label="통합 집계 시작일" type="date" value={draftPeriod.fromDate} max={draftPeriod.toDate} onChange={e=>setDraftPeriod(p=>({...p,fromDate:e.target.value}))} required/></label><span className="overview-date-separator">~</span><label><span>집계 종료일</span><input aria-label="통합 집계 종료일" type="date" value={draftPeriod.toDate} min={draftPeriod.fromDate} max={today()} onChange={e=>setDraftPeriod(p=>({...p,toDate:e.target.value}))} required/></label><button className="button secondary" type="submit">기간 적용</button></form><button className="icon-button" aria-label="통합 집계 새로고침" onClick={()=>setReload(v=>v+1)} disabled={loading}><RefreshCw size={17}/></button></div>
    </section>
    {periodError&&<div className="warning" role="alert">{periodError}</div>}
    {error&&<div className="warning" role="alert">{error}<button className="text-button" onClick={()=>setReload(v=>v+1)}>다시 시도</button></div>}
    {loading&&<div className="overview-loading" role="status">통합 지표를 불러오는 중입니다.</div>}
    {data&&<>
      <div className="overview-scope"><span><b>{data.noticeCount??notices.length}개 담당 공고</b> / {data.fromDate} ~ {data.toDate}</span><span>한국 시간 기준 / 같은 학생은 단계마다 한 번만 셉니다</span></div>
      <div className="overview-kpis">{stages.slice(0,4).map(({key,label,icon:Icon})=><button className={'overview-kpi '+key} key={key} onClick={()=>compareBy(key)} aria-label={label+' 기준 공고 비교'}><span><Icon size={17}/>{label}</span><strong>{count(data.counts?.[key])}{data.counts?.[key]!==null&&data.counts?.[key]!==undefined&&<small>명</small>}</strong><p>{key==='view'?'다른 단계를 비교하는 기준':key==='complete'?'공식 접수와 별도':'같은 학생은 한 번만 셉니다'}</p><span className="overview-kpi-link">공고별 비교<ArrowRight size={13}/></span></button>)}</div>
      <div className="overview-main-grid">
        <section className="overview-panel overview-trend"><div className="section-heading"><div><h3>일별 이용 추이</h3><p className="overview-caption">일별 조회와 준비 기록을 비교하세요.</p></div><span className="tag">{source==='sample'?'가상 시나리오':'행동 기록'}</span></div><TrendChart rows={data.trend||[]}/></section>
        <section className="overview-panel overview-actions"><div className="section-heading"><h3>다음으로 확인할 일</h3><CalendarDays size={18}/></div><button className="overview-review-action" onClick={()=>onFilterStatus?.('draft')}><span><b>검수할 임시 공고</b><small>조건과 마감 근거를 확인하세요.</small></span><strong>{listError?'-':stateCount('draft')}<small>건</small></strong><ChevronRight size={16}/></button><h4>가까운 마감</h4>{upcoming.length?upcoming.map(n=><button className="overview-due" key={n.id} onClick={()=>inspectNotice(n)}><span className={'overview-dday '+(daysLeft(n.deadline)<=3?'soon':'')}>{daysLeft(n.deadline)===0?'오늘':`D-${daysLeft(n.deadline)}`}</span><span><b>{n.title.replace(/^\[테스트\]\s*/,'')}</b><small>{n.deadline} / {n.category}</small></span><ChevronRight size={14}/></button>):<p className="overview-caption">{listError?'마감 정보를 표시할 수 없습니다.':'예정된 마감이 없습니다.'}</p>}<button className="text-button" onClick={onOpenList}>공고 관리로 이동<ArrowRight size={15}/></button></section>
      </div>
      <div className="overview-secondary-grid">
        <section className="overview-panel"><div className="section-heading"><h3>단계별 참여 현황</h3><span className="overview-caption">기간 안의 학생 수</span></div><div className="overview-stages">{stages.map((stage,index)=><div key={stage.key}><span><small>0{index+1}</small>{stage.label}</span><div className="overview-stage-track">{data.counts?.[stage.key]!==null&&<i className={stage.key} style={{width:((data.counts?.[stage.key]||0)/maxStage*100)+'%'}}/>}</div><strong>{count(data.counts?.[stage.key])}{data.counts?.[stage.key]!==null&&'명'}</strong></div>)}</div><p className="overview-footnote">같은 학생이 여러 단계에 포함될 수 있습니다. 단계 차이로 중도 포기 원인을 판단하지 않습니다.</p></section>
        <section className="overview-panel overview-definition"><h3>수치를 읽는 기준</h3><dl><div><dt>기준 인원</dt><dd>선택 기간에 담당 공고를 상세 조회한 <b>{count(data.denominator)}{data.denominator!==null&&'명'}</b></dd></div>{source==='activity'&&<div><dt>집계 대상</dt><dd>로그인한 학생의 행동만 셉니다. 공개 홈의 비로그인 방문은 포함하지 않습니다.</dd></div>}<div><dt>신청 경로 이동</dt><dd>링크를 연 기록입니다. 제출을 뜻하지 않습니다.</dd></div><div><dt>학생이 표시한 제출 완료</dt><dd>학생이 제출했다고 직접 표시한 기록입니다.</dd></div></dl><div className="overview-official"><span>공식 접수 결과</span><b>미연동</b></div><p className="overview-footnote">1~4명은 비공개입니다. 개인별 정보와 작성 본문은 제공하지 않습니다.</p></section>
      </div>
      <section className="overview-panel overview-comparison" ref={comparison} tabIndex={-1} aria-label="공고별 비교"><div className="section-heading"><div><h3>공고별 비교</h3><p className="overview-caption">같은 기간의 공고별 학생 수입니다.</p></div><label className="overview-sort">정렬<select aria-label="공고 비교 정렬" value={sort} onChange={e=>setSort(e.target.value)}><option value="view">조회 많은 순</option><option value="interest">관심 등록 많은 순</option><option value="start">준비 시작 많은 순</option><option value="complete">제출 완료 표시 많은 순</option><option value="deadline">마감 가까운 순</option></select></label></div>
      <p className="overview-caption comparison-hint">공고를 선택해 수치를 확인하고 바로 수정하세요.</p>
      {selectedNotice&&<section className="overview-notice-detail" ref={detail} tabIndex={-1} aria-label="선택 공고 수치" key={selectedNotice.id}>
        <div className="section-heading"><div><span className="tag">{source==='sample'?'가상 시나리오':testMode?'이 브라우저 기록':'서비스 기록'}</span><h4>{selectedNotice.title}</h4><p>{data.fromDate} ~ {data.toDate} / 마감 {selectedNotice.deadline}</p></div><button className="text-button" onClick={()=>{setSelectedId(null);reveal(comparison);}}>선택 닫기</button></div>
        <dl>{stages.map(s=><div key={s.key}><dt>{s.label}</dt><dd>{count(selectedNotice.counts?.[s.key])}{selectedNotice.counts?.[s.key]!=null&&'명'}</dd></div>)}</dl>
        <div className="overview-notice-next"><p>기준 인원: 이 공고를 조회한 학생 {count(selectedNotice.counts?.view)}{selectedNotice.counts?.view!=null&&'명'}. 공식 접수 미연동.</p><button className="button primary" onClick={()=>openNotice(selectedNotice)}>공고 수정<ArrowRight size={16}/></button></div>
      </section>}
      <div className="overview-table-wrap" tabIndex="0" aria-label="공고별 비교 표. 좁은 화면에서 좌우로 스크롤할 수 있습니다."><table><thead><tr><th scope="col">공고</th><th scope="col">상태</th><th scope="col">마감</th>{stages.map(s=><th scope="col" key={s.key}>{s.short}</th>)}<th scope="col" aria-label="공고 열기"></th></tr></thead><tbody>{rows.map(n=><tr key={n.id} className={selectedId===n.id?'is-selected':''}><th scope="row"><button aria-pressed={selectedId===n.id} aria-label={n.title+' 수치 확인'} onClick={()=>inspectNotice(n)}>{n.title.replace(/^\[테스트\]\s*/,'')}</button><small>{n.category}</small></th><td><span className={'tag manager-status-'+n.status}>{statusLabels[n.status]||n.status}</span></td><td>{dayLabel(n.deadline)}</td>{stages.map(s=><td className="overview-number" key={s.key}>{count(n.counts?.[s.key])}</td>)}<td><button className="text-button overview-edit-link" onClick={()=>openNotice(n)} aria-label={n.title+' 공고 수정'}>수정<ArrowRight size={14}/></button></td></tr>)}</tbody></table>{!rows.length&&<p className="overview-caption overview-empty">비교할 담당 공고가 없습니다.</p>}</div><p className="overview-footnote">공고별 인원을 더하면 같은 학생이 여러 번 들어갑니다. 상단 인원과 다를 수 있습니다.</p></section>
    </>}
  </div>;
}

function TrendChart({rows}){
  const [active,setActive]=useState(null),[table,setTable]=useState(false);
  const id=useId();
  useEffect(()=>{setActive(null);},[rows]);
  const max=Math.max(10,...rows.flatMap(row=>series.map(s=>row[s.key]||0)));
  const top=Math.ceil(max/10)*10;
  const point=(value,index)=>[rows.length>1?index/(rows.length-1)*600:300,180-value/top*160];
  const paths=key=>{let segments=[],segment=[];rows.forEach((row,index)=>{if(row[key]===null||row[key]===undefined){if(segment.length)segments.push(segment);segment=[];}else segment.push(point(row[key],index));});if(segment.length)segments.push(segment);return segments;};
  const selected=rows[active??Math.max(0,rows.length-1)];
  const labelIndices=[...new Set([0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1])].filter(i=>i>=0);
  const any=rows.some(row=>series.some(s=>(row[s.key]||0)>0));
  return <>
    <div className="overview-legend">{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label}</span>)}</div>
    <div className="overview-chart" role="group" aria-label="일별 상세 조회, 준비 시작, 제출 완료 표시 그래프">
      <div className="overview-y-axis" aria-hidden="true">{[top,top*.75,top*.5,top*.25,0].map(value=><span key={value}>{Math.round(value)}</span>)}</div>
      <div className="overview-plot"><svg viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-labelledby={id+'-title'}><title id={id+'-title'}>선택 기간의 일별 학생 수 추이. 아래 날짜 선택과 데이터 표에서 정확한 값을 확인할 수 있습니다.</title>{[20,60,100,140,180].map(y=><line x1="0" x2="600" y1={y} y2={y} className="overview-gridline" key={y}/>)}{series.map(s=><g key={s.key}>{paths(s.key).map((points,index)=><polyline key={index} points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} vectorEffect="non-scaling-stroke"/>)}{rows.map((row,index)=>row[s.key]!==null&&row[s.key]!==undefined?<circle key={index} cx={point(row[s.key],index)[0]} cy={point(row[s.key],index)[1]} r={active===index?4:2.5} fill={s.color}/>:null)}</g>)}{active!==null&&<line x1={point(0,active)[0]} x2={point(0,active)[0]} y1="15" y2="185" className="overview-focusline"/>}{rows.map((row,index)=><rect key={row.date} x={Math.max(0,point(0,index)[0]-300/Math.max(1,rows.length-1))} y="0" width={600/Math.max(1,rows.length-1)} height="200" fill="transparent" onMouseEnter={()=>setActive(index)} onClick={()=>setActive(index)}><title>{row.date}: {series.map(s=>s.label+' '+count(row[s.key])+'명').join(', ')}</title></rect>)}</svg><div className="overview-x-axis">{labelIndices.map(index=><span key={index}>{dayLabel(rows[index]?.date)}</span>)}</div></div>
    </div>
    {!any&&<p className="overview-chart-empty">표시할 공개 수치가 없습니다. 기록이 없거나 1~4명인 항목입니다.</p>}
    {selected&&<div className="overview-chart-readout" aria-live="polite"><b>{dayLabel(selected.date)}</b>{series.map(s=><span key={s.key}>{s.label} <strong>{count(selected[s.key])}{selected[s.key]!==null&&'명'}</strong></span>)}</div>}
    {rows.length>1&&<label className="overview-date-slider"><span>날짜 선택</span><input type="range" min="0" max={rows.length-1} value={active??rows.length-1} onChange={e=>setActive(Number(e.target.value))} aria-label="추이 날짜 선택" aria-valuetext={selected?.date}/></label>}
    <div className="overview-chart-footer"><p>일별 인원을 더한 값은 기간 전체 인원과 다릅니다.</p><button className="text-button" onClick={()=>setTable(!table)} aria-expanded={table}>{table?'데이터 표 닫기':'데이터 표 보기'}</button></div>
    {table&&<div className="overview-table-wrap overview-trend-table" tabIndex="0"><table><caption>일별 학생 수</caption><thead><tr><th>날짜</th>{series.map(s=><th key={s.key}>{s.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.date}><th scope="row">{row.date}</th>{series.map(s=><td key={s.key}>{count(row[s.key])}</td>)}</tr>)}</tbody></table></div>}
  </>;
}
