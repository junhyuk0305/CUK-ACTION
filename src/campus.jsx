import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, Search, X} from 'lucide-react';
import Featured from './Featured.jsx';
import {DEMO} from './demo.js';
import GuideDetail from './GuideDetail.jsx';
import {readGuide} from './gateway.js';
import {initialGuide,schedules} from './guide.js';
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
async function fetchJSON(file) {
  const response = await fetch('/' + file, {cache:'no-cache'});
  if (!response.ok) throw Error();
  return response.json();
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
  const [drafts,setDrafts]=useState(''), [jump,setJump]=useState(false);
  const returnTo=useRef(null), title=useRef(null), searchBar=useRef(null), searchBox=useRef(null);
  const savedOnly=hash==='#saved', detailId=hash.startsWith('#notice/')?hash.slice(8):null;
  const home=!hash || hash==='#home';
  const {q:query, category, dept}=filters;
  useEffect(()=>{
    let active=true;
    Promise.all([fetchJSON('archive.json'),fetchJSON('ai-excerpts.json')]).then(([rows,excerpts])=>{
      if(active)setData({rows:rows.sort((a,b)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id)),excerpts});
    }).catch(()=>{if(active)setError(true)});
    return ()=>{active=false};
  },[attempt]);
  useEffect(()=>{
    const sync=()=>{try {setSaved(readSaved());setDrafts(previousDrafts());} catch {setStorageError('이 기기의 저장 목록을 읽을 수 없습니다.');}};
    const route=()=>{setHash(location.hash);setFilters(readFilters())};
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
    e.preventDefault();
    const url=new URL(location.href);url.hash=target;
    for(const key of Object.keys(noFilters))url.searchParams.delete(key);
    if(url.href!==location.href)history.pushState(null,'',url);
    returnTo.current=null;setHash(url.hash);setFilters(noFilters);setLimit(20);window.scrollTo(0,0);
  }
  async function toggle(id){
    try {
      const old=readSaved(), next=old.includes(id)?old.filter(x=>x!==id):[...old,id];
      localStorage.setItem(savedKey,JSON.stringify(next));setSaved(next);setStorageError('');
      if(next.includes(id)&&!guest[id]&&data.excerpts[id]){const rows=await readGuide(id,true)??initialGuide(id,data.excerpts[id]);if(rows.length)updateGuest(id,schedules(rows));}
    } catch {setStorageError('저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');}
  }
  const rows=data?.rows||[], item=rows.find(r=>r.id===detailId && r.use==='본문 발췌');
  const term=query.trim().toLowerCase();
  const matches=rows.filter(r=>(!savedOnly||saved.includes(r.id))&&(!category||category===r.category)&&(!dept||dept===r.department)&&(!term||[r.id,r.title,r.department,r.category,data.excerpts[r.id]].join(' ').toLowerCase().includes(term)));
  const filtered=!!(query||category||dept);
  return <><header><nav className="wrap bar" aria-label="주 메뉴">
    <a href="#home" className="brand" onClick={e=>tab(e,'home')}>CUK <b>Action</b></a>
    {[['home','홈'],['browse','전체 공고'],['saved','관심 공고']].map(([target,label])=><a key={target} href={'#'+target} aria-current={(target==='home'?home:hash==='#'+target)?'page':undefined} onClick={e=>tab(e,target)}>{label}</a>)}
  <a href="/account.html">로그인</a>
  </nav></header><main>
    {storageError&&<p className="wrap" role="alert">{storageError}</p>}
    {error?<div className="empty" role="alert"><h2>공고를 불러오지 못했습니다.</h2><button onClick={()=>{setError(false);setAttempt(attempt+1)}}>다시 시도</button></div>:!data?<p className="wrap" role="status">공고를 불러오는 중입니다.</p>:detailId?<article className="wrap detail">
      <button className="back" onClick={()=>{if(returnTo.current)history.back();else location.hash='browse'}}><ArrowLeft size={16}/>공고 목록으로</button>
      {item?<div className="cols"><section className="panel"><div className="category">{item.category}</div><h1 ref={title} tabIndex="-1">{item.title}</h1><p className="meta">{item.department} <span>게시일 {item.date}</span></p>
      <div className="actions"><a className="primary" href={item.url} target="_blank" rel="noreferrer">학교 원문 보기 <ArrowUpRight size={18}/></a><button className="secondary" aria-pressed={saved.includes(item.id)} onClick={()=>toggle(item.id)}><Bookmark size={16} fill={saved.includes(item.id)?'currentColor':'none'}/>{saved.includes(item.id)?'관심 공고에서 삭제':'관심 공고에 저장'}</button></div><p className="muted">관심 공고는 이 기기에 저장됩니다.</p></section>
      <GuideDetail key={item.id} item={item} publicOnly status={guest.status} onStatus={v=>updateGuest('status',v)} seen={guest[item.id]} onSeen={v=>updateGuest(item.id,v)}/><section className="excerpt"><h2>공고 본문</h2><div>{data.excerpts[item.id]}</div></section></div>:<h1 ref={title} tabIndex="-1">공고를 찾을 수 없습니다.</h1>}</article>:<div className={home?'landing':''}>
      {home&&<Featured rows={rows} onOpen={remember} initialId={returnTo.current?.featureId}/>}
      <div className="sheet"><section className="search-strip" ref={searchBar}><div className="intro wrap"><h1>{savedOnly?'관심 공고':'공고 찾기'}</h1>
      <label className="search"><Search size={20}/><input ref={searchBox} type="search" aria-label="공고 검색" placeholder="공고 제목, 부서, 내용 검색" value={query} onChange={e=>changeFilters({...filters,q:e.target.value})}/></label>
      <div className="filters"><div className="chips">{['',...new Set(rows.map(r=>r.category))].map(c=><button key={c} aria-pressed={category===c} onClick={()=>changeFilters({...filters,category:c})}>{c||'전체'}</button>)}</div>
      <select className="department" aria-label="게시 부서" value={dept} onChange={e=>changeFilters({...filters,dept:e.target.value})}><option value="">전체 부서</option>{[...new Set(rows.map(r=>r.department))].sort((a,b)=>a.localeCompare(b,'ko')).map(d=><option key={d}>{d}</option>)}</select>{filtered&&<button className="reset" onClick={()=>changeFilters(noFilters)}><X size={14}/>초기화</button>}</div></div></section>
      <section className="listing wrap">{savedOnly&&drafts&&<button className="secondary" onClick={()=>downloadDrafts(drafts)}>이전에 작성한 지원서 내려받기</button>}
      <div className="list-heading"><h2>{savedOnly?'이 기기에 저장한 공고':filtered?'검색 결과':'전체 공고'} <span aria-live="polite">{matches.length}건</span></h2><small>{savedOnly?'기기 저장':'2026.11.16 기준'}</small></div>
      <div className="thead" aria-hidden="true">{['공고 제목','게시 부서','분류','게시일','보기'].map(h=><b key={h}>{h}</b>)}</div>
      <div className="rows">{matches.slice(0,limit).map(r=><article key={r.id} className="row">
      <NoticeLink className="row-link" row={r} onOpen={remember}><h3 id={'row-'+r.id}>{r.title}</h3><span>{r.department}</span><span className="category">{r.category}</span><span>{r.date}</span><span className="destination">{r.use==='본문 발췌'?<>공고 보기 <ArrowRight/></>:<>학교 원문 보기 <ArrowUpRight/></>}</span></NoticeLink>
      <button className="mark" aria-label={r.title+' '+(saved.includes(r.id)?'관심 공고에서 삭제':'관심 공고에 저장')} aria-pressed={saved.includes(r.id)} onClick={()=>toggle(r.id)}><Bookmark size={18} fill={saved.includes(r.id)?'currentColor':'none'}/></button>
      </article>)}</div>{!matches.length&&<div className="empty"><h3>{filtered?'검색 결과가 없습니다.':'저장한 관심 공고가 없습니다.'}</h3><button onClick={filtered?()=>changeFilters(noFilters):e=>tab(e,'browse')}>{filtered?'검색 조건 초기화':'전체 공고 보기'}</button></div>}
      {matches.length>limit&&<button className="more" onClick={()=>setLimit(limit+20)}>공고 더 보기 <span>{Math.min(limit,matches.length)} / {matches.length}</span></button>}</section></div>
      {jump&&<button className="jump" onClick={()=>{searchBox.current?.focus({preventScroll:true});searchBar.current?.scrollIntoView()}}>공고 검색 ↑</button>}</div>}
    </main><footer><div className="wrap">CUK Action <span>가톨릭대학교 교내 공고</span></div></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);