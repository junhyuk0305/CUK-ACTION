import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Compass, GraduationCap, Home, Menu, Search, X} from 'lucide-react';
import './style.css';
import './student.css';
import Featured from './Featured.jsx';
import {DEMO} from './demo.js';
import GuideDetail from './GuideDetail.jsx';
import {readGuide} from './gateway.js';
import {supabase} from './backend.js';
import {archiveSummary} from './archive.js';
import {publicNoticeRows} from './student-public-notices.js';
import {applyMode, resolveSource} from './contract.js';
import {usePublicNoticeEvents} from './usePublicNoticeEvents.js';
import {modeLabel} from './StudentNoticeInfo.jsx';
import NoticeBlocks from './NoticeBlocks.jsx';
import {initialGuide,schedules} from './guide.js';
import {publicBackLabel} from './workflow.js';
import './campus.css';
import './motion.css';

const savedKey = 'cuk-action-campus-saved';
function readSaved() {
  const saved = JSON.parse(localStorage.getItem(savedKey) || 'null');
  if (saved !== null || !DEMO) return saved || [];
  const account = sessionStorage.getItem('cuk-test-account');
  if (!['test-student-a','test-student-b'].includes(account)) return [];
  const legacy = JSON.parse(localStorage.getItem('cuk-action-test-v2') || '{}');
  return (legacy.students?.[account]?.saved || []).map(String).filter(id => /^\d+$/.test(id));
}
function previousDrafts() {
  if (!DEMO) return '';
  const account = sessionStorage.getItem('cuk-test-account');
  if (!['test-student-a','test-student-b'].includes(account)) return '';
  const legacy = JSON.parse(localStorage.getItem('cuk-action-test-v2') || '{}');
  const applications = legacy.students?.[account]?.applications || {};
  return Object.entries(applications).map(([id, app]) => {
    const answers = Object.values(app?.answers || {}).filter(value => typeof value === 'string' && value.trim());
    return answers.length ? [id, ...answers].join('\n') : '';
  }).filter(Boolean).join('\n\n');
}
function downloadDrafts(text) {
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a');
  link.href=url; link.download='이전에 작성한 지원서.txt'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function NoticeLink({row, children, className, onOpen}) {
  return row.use === '본문 발췌'
    ? <a id={'open-'+row.id} className={className} href={'#notice/'+row.id} onClick={onOpen}>{children}</a>
    : <a className={className} href={row.url} target="_blank" rel="noreferrer">{children}</a>;
}
const noFilters = {q:'', category:'', dept:''};
function readFilters() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(Object.keys(noFilters).map(key => [key, params.get(key) || '']));
}
function App() {
  const [data,setData]=useState(null), [error,setError]=useState(false), [attempt,setAttempt]=useState(0);
  const [filters,setFilters]=useState(readFilters), [limit,setLimit]=useState(20);
  const [hash,setHash]=useState(location.hash), [saved,setSaved]=useState([]), [storageError,setStorageError]=useState('');
  const [guest,setGuest]=useState(()=>{try{return JSON.parse(localStorage.getItem('cuk-campus-guide')||'{}')}catch{return {}}});
  function updateGuest(key,value){try{const next={...JSON.parse(localStorage.getItem('cuk-campus-guide')||'{}'),[key]:value};localStorage.setItem('cuk-campus-guide',JSON.stringify(next));setGuest(next);}catch{setStorageError('이 기기의 안내 확인 상태를 저장하지 못했습니다.');}}
  const [drafts,setDrafts]=useState(''), [jump,setJump]=useState(false), [userId,setUserId]=useState(null), [menu,setMenu]=useState(false);
  useEffect(()=>{const listener=supabase?.auth.onAuthStateChange((_event,session)=>setUserId(session?.user?.id??null));return()=>listener?.data.subscription.unsubscribe();},[]);
  const returnTo=useRef(null), title=useRef(null), searchBar=useRef(null), searchBox=useRef(null);
  const savedOnly=hash==='#saved', detailId=hash.startsWith('#notice/')?hash.slice(8):null;
  const home=!hash || hash==='#home';
  const {q:query, category, dept}=filters;
  useEffect(()=>{
    let active=true;
    publicNoticeRows().then(rows=>{
      if(active)setData({rows:[...rows].sort((a,b)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id)),excerpts:Object.fromEntries(rows.filter(r=>r.excerpt).map(r=>[r.id,r.excerpt]))});
    }).catch(()=>{if(active)setError(true)});
    return ()=>{active=false};
  },[attempt]);
  useEffect(()=>{
    const sync=()=>{try {setSaved(readSaved());setDrafts(previousDrafts());} catch {setStorageError('이 기기의 저장 목록을 읽을 수 없습니다.');}};
    const route=()=>{
      if(!location.hash.startsWith('#notice/')){
        const url=new URL(location.href);
        if(url.searchParams.has('src')){url.searchParams.delete('src');history.replaceState(history.state,'',url);}
      }
      setHash(location.hash);setFilters(readFilters());setMenu(false);
    };
    const restoration=history.scrollRestoration;
    history.scrollRestoration='manual';
    sync(); window.addEventListener('storage',sync);window.addEventListener('hashchange',route);window.addEventListener('popstate',route);
    return ()=>{window.removeEventListener('storage',sync);window.removeEventListener('hashchange',route);window.removeEventListener('popstate',route);history.scrollRestoration=restoration};
  },[]);
  useLayoutEffect(()=>{
    if(!data)return;
    const last=returnTo.current;
    if(detailId){window.scrollTo(0,0);title.current?.focus({preventScroll:true});}
    else if(last && hash===last.hash){
      window.scrollTo(0,last.y);
      (document.getElementById(last.opener) || searchBox.current)?.focus({preventScroll:true});
    } else window.scrollTo(0,0);
  },[hash,data]);
  useEffect(()=>{
    if(!searchBar.current){setJump(false);return}
    const update=()=>setJump(searchBar.current?.getBoundingClientRect().bottom<0);
    update();window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);
    return ()=>{window.removeEventListener('scroll',update);window.removeEventListener('resize',update)};
  },[hash,data]);
  function remember(e) {
    if(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.button!==0)return;
    const a=e.currentTarget;
    returnTo.current={hash,y:scrollY,opener:a.id,featureId:a.id==='feature-start'?a.hash.slice(8):null};
  }
  function changeFilters(next) {
    const url=new URL(location.href);
    for(const [key,value] of Object.entries(next)){
      if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
    }
    history.replaceState(history.state,'',url);
    setFilters(next);setLimit(20);
  }
  function tab(e,target){
    if(e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)return;
    setMenu(false);
    e.preventDefault();
    const url=new URL(location.href);url.hash=target;url.searchParams.delete('src');
    for(const key of Object.keys(noFilters))url.searchParams.delete(key);
    if(url.href!==location.href)history.pushState(null,'',url);
    returnTo.current=null;setHash(url.hash);setFilters(noFilters);setLimit(20);window.scrollTo(0,0);
  }
  async function toggle(id){
    let next;
    try {
      const old=readSaved(); next=old.includes(id)?old.filter(x=>x!==id):[...old,id];
      localStorage.setItem(savedKey,JSON.stringify(next));setSaved(next);setStorageError('');
    } catch {setStorageError('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');return;}
    // The interest is already stored; a failed guide read only loses the schedule baseline.
    if(next.includes(id)&&!guest[id]&&data.excerpts[id]){
      try {const rows=await readGuide(id,true)??initialGuide(id,data.excerpts[id]);if(rows.length)updateGuest(id,schedules(rows));}
      catch {setStorageError('관심 공고에 저장했습니다. 일정 안내는 불러오지 못했습니다.');}
    }
  }
  const rows=data?.rows||[], row=rows.find(r=>r.id===detailId), item=row?.use==='본문 발췌'?row:null;
  const publicEvents=usePublicNoticeEvents(row,userId,!!returnTo.current);
  const term=query.trim().toLowerCase();
  const matches=rows.filter(r=>(!savedOnly||saved.includes(r.id))&&(!category||category===r.category)&&(!dept||dept===r.department)&&(!term||[r.id,r.title,r.department,r.category,data.excerpts[r.id]].join(' ').toLowerCase().includes(term)));
  const filtered=!!(query||category||dept);
  const place=detailId?(returnTo.current?returnTo.current.hash:'#browse'):hash;
  const isPlace=target=>target==='home'?!place||place==='#home':place==='#'+target;
  const latest=archiveSummary(rows).latest;
  return <div className="app-shell campus">
  <aside className={'sidebar '+(menu?'open':'')}><a className="brand" href="#home" onClick={e=>tab(e,'home')}><span className="brand-symbol"><GraduationCap size={23}/></span><span>CUK <b>ACTION</b><small>가톨릭대학교 캠퍼스 라이프</small></span></a>
    <div className="workspace-label">CAMPUS NOTICES</div>
    <nav aria-label="주 메뉴">{[['home',Home,'홈'],['browse',Compass,'전체 공고'],['saved',Bookmark,'관심 공고']].map(([target,Icon,label])=><a key={target} href={'#'+target} className={isPlace(target)?'active':undefined} aria-current={!detailId&&isPlace(target)?'page':undefined} onClick={e=>tab(e,target)}><Icon size={20}/>{label}</a>)}</nav>
    <div className="sidebar-bottom"><a className="button primary account-link" href="/account.html">{userId?'대시보드':'로그인'}</a></div>
  </aside>
  {menu&&<button className="menu-backdrop" aria-label="메뉴 닫기" onClick={()=>setMenu(false)}/>}<div className="main-shell"><header className="topbar"><button className="icon-button mobile-menu" aria-label="메뉴" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Menu size={22}/></button></header>
  <main>
    {storageError&&<p className="warning" role="alert">{storageError}</p>}
    {error?<div className="empty" role="alert"><h2>공고를 불러오지 못했습니다.</h2><button className="button secondary" onClick={()=>{setError(false);setAttempt(attempt+1)}}>다시 시도</button></div>:!data?<p className="loading-state" role="status">공고를 불러오는 중입니다.</p>:detailId?<article className="detail">
      <button className="back" onClick={()=>{if(returnTo.current)history.back();else location.hash='browse'}}><ArrowLeft size={16}/>{publicBackLabel(returnTo.current)}</button>
      {row?<><div className="detail-heading"><div><div className="row"><span className="tag">{row.category}</span><span className="tag">{modeLabel(row)}</span><span className="muted">{row.department}{row.date&&' / 게시일 '+row.date}</span></div><h1 ref={title} tabIndex="-1">{row.title}</h1><p>{item?'관심 공고는 이 기기에 저장됩니다.':'이 공고의 내용은 학교 원문에서 확인하세요.'}</p></div>
      <div className="row actions">{row.url&&<a className="button primary" href={row.url} target="_blank" rel="noreferrer">{row.staffAuthored?'공고 원문 보기':'학교 원문 보기'} <ArrowUpRight size={16}/></a>}<button className="button secondary" aria-pressed={saved.includes(row.id)} onClick={()=>toggle(row.id)}><Bookmark size={16} fill={saved.includes(row.id)?'currentColor':'none'}/>{saved.includes(row.id)?'관심 공고에서 삭제':'관심 공고에 저장'}</button><a className="button secondary" onClick={publicEvents.transfer} href={'/account.html?src='+resolveSource(location.search,!!returnTo.current)+'#start/'+(row.noticeId||row.id)}>{applyMode(row)==='site'?'신청하기':'준비 시작'} <ArrowRight size={16}/></a></div></div>
      {item&&<div className="detail-body">{item.excerpt&&!item.staffAuthored&&<div className="panel guide-panel"><GuideDetail key={item.id} item={item} publicOnly status={guest.status} onStatus={v=>updateGuest('status',v)} seen={guest[item.id]} onSeen={v=>updateGuest(item.id,v)}/></div>}<section className="panel excerpt"><h2>공고 본문</h2><NoticeBlocks notice={item} onReach={publicEvents.onReach}/></section></div>}</>:<h1 ref={title} tabIndex="-1">공고를 찾을 수 없습니다.</h1>}</article>:<>
      <div className="page-heading"><div><div className="eyebrow">{savedOnly?'MY INTERESTS':'CAMPUS NOTICES'}</div><h1>{savedOnly?'관심 공고':'공고 찾기'}</h1><p>{savedOnly?'관심 공고는 이 기기에 저장됩니다.':'가톨릭대학교 교내 공고를 검색하고 학교 원문을 확인하세요.'}</p></div>{savedOnly&&drafts&&<button className="button secondary" onClick={()=>downloadDrafts(drafts)}>이전에 작성한 지원서 내려받기</button>}</div>
      {home&&<Featured rows={rows} onOpen={remember} initialId={returnTo.current?.featureId}/>}
      <div className="filters" ref={searchBar}><div className="tabs categories">{['',...new Set(rows.map(r=>r.category))].map(c=><button key={c} className={category===c?'active':undefined} aria-pressed={category===c} onClick={()=>changeFilters({...filters,category:c})}>{c||'전체'}</button>)}</div>
      <label className="search"><Search size={17}/><input ref={searchBox} type="search" aria-label="공고 검색" placeholder="공고 제목, 부서, 내용 검색" value={query} onChange={e=>changeFilters({...filters,q:e.target.value})}/></label></div>
      <div className="discovery-controls"><div className="row"><h2>{savedOnly?'이 기기에 저장한 공고':filtered?'검색 결과':'전체 공고'} <b aria-live="polite">{matches.length}건</b></h2><span>{savedOnly?'기기 저장':latest&&latest+' 기준'}</span></div>
      <div className="row">{filtered&&<button className="text-button filter-reset" onClick={()=>changeFilters(noFilters)}><X size={14}/>초기화</button>}<select aria-label="게시 부서" value={dept} onChange={e=>changeFilters({...filters,dept:e.target.value})}><option value="">전체 부서</option>{[...new Set(rows.map(r=>r.department))].sort((a,b)=>a.localeCompare(b,'ko')).map(d=><option key={d}>{d}</option>)}</select></div></div>
      {matches.length?<div className="panel notice-table"><div className="thead" aria-hidden="true">{['공고 제목','게시 부서','분류','게시일','보기'].map(h=><b key={h}>{h}</b>)}</div>
      <div className="rows">{matches.slice(0,limit).map(r=><article key={r.id} className="notice-row">
      <div className="row-link">
        <h3 id={'row-'+r.id}><NoticeLink row={r} onOpen={remember}>{r.title}</NoticeLink> <small className="tag">{modeLabel(r)}</small></h3>
        <span>{r.department}</span><span className="category">{r.category}</span><span>{r.date}</span>
        {!r.staffAuthored&&r.url?<a className="destination" href={r.url} target="_blank" rel="noreferrer">학교 원문 보기 <ArrowUpRight size={14}/></a>
          :<a className="destination" id={'detail-'+r.id} href={'#notice/'+r.id} onClick={remember}>공고 보기 <ArrowRight size={14}/></a>}
      </div>
      <button className="mark" aria-label={r.title+' '+(saved.includes(r.id)?'관심 공고에서 삭제':'관심 공고에 저장')} aria-pressed={saved.includes(r.id)} onClick={()=>toggle(r.id)}><Bookmark size={18} fill={saved.includes(r.id)?'currentColor':'none'}/></button>
      </article>)}</div></div>:<div className="empty"><h3>{filtered?'검색 결과가 없습니다.':'저장한 관심 공고가 없습니다.'}</h3><button className="button secondary" onClick={filtered?()=>changeFilters(noFilters):e=>tab(e,'browse')}>{filtered?'검색 조건 초기화':'전체 공고 보기'}</button></div>}
      {matches.length>limit&&<button className="button secondary load-more" onClick={()=>setLimit(limit+20)}>공고 더 보기 <span>{Math.min(limit,matches.length)} / {matches.length}</span></button>}
      {jump&&<button className="jump" onClick={()=>{searchBox.current?.focus({preventScroll:true});searchBar.current?.scrollIntoView()}}>공고 검색 ↑</button>}</>}
    <footer className="campus-footer">CUK Action <span>가톨릭대학교 교내 공고</span> <a href="/privacy.html">개인정보 처리방침</a></footer>
  </main></div></div>;
}
createRoot(document.getElementById('root')).render(<App/>);