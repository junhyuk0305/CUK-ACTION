import GuideReview,{ResponseReport} from './GuideReview.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, FileText, Plus, RefreshCw, Save, ShieldCheck, Trash2} from 'lucide-react';
import {getNoticeMetrics, listManagedNotices, saveNotice} from './gateway.js';
import ManagerOverview from './ManagerOverview.jsx';
import WorkflowFields from './WorkflowFields.jsx';
import './manager.css';

const statusLabels = {draft: '임시저장', published: '게시 중', archived: '게시 종료'};
const fieldLabels = {status: '재학 상태', year: '학년', department: '학과', gpa: '평균 학점', residence: '거주 개월', manual: '직접 확인'};
const emptyNotice = () => ({title: '', category: '프로젝트', department: '', deadline: '', summary: '', sourceUrl: '', applicationUrl: '', deadlineEvidence: '', rules: [], tasks: [], questions: [], followup: '', reviewed: false, status: 'draft'});
const newRule = () => ({field: 'status', op: 'eq', value: '', label: '', evidence: ''});
const koreanDate = date => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
const today = () => koreanDate(new Date());
const monthAgo = () => koreanDate(new Date(Date.now() - 30 * 86400000));
const safeUrl = value => {try {const url = new URL(value); return url.protocol === 'https:' ? url.href : null;} catch {return null;}};
const countText = value => value === null || value === undefined ? '비공개' : `${value.toLocaleString()}명`;

export default function Manager({user, onBack, templates = [], testMode = false, onDirtyChange, onBusyChange, section, onSectionChange, navigationKey}) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricNotice, setMetricNotice] = useState(null);
  const [editorContext, setEditorContext] = useState(null);
  const editorOrigin = useRef({view: 'list', scrollY: 0, element: null});
  const [taskText, setTaskText] = useState('');
  const [templateIndex, setTemplateIndex] = useState('');
  const [view, setView] = useState(section || 'overview');
  const requestedSection = useRef(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState('deadline');
  const [revision, setRevision] = useState(0);
  const alive = useRef(true);
  const listRequest = useRef(0);
  function changeView(next) {setView(next); requestedSection.current = section && section !== next ? next : null; onSectionChange?.(next);}
  useEffect(() => {if (!section) return; if (requestedSection.current === section) {requestedSection.current = null; return;} setView(section); setEditing(null); setMetricNotice(null); setDirty(false); setError(''); setMessage('');}, [section, navigationKey]);

  async function refresh() {
    const request = ++listRequest.current;
    setLoading(true); setError('');
    try {const list = await listManagedNotices(); if (alive.current && request === listRequest.current) {setNotices(list); setRevision(value => value + 1);}}
    catch (e) {if (alive.current && request === listRequest.current) setError(e.message || '담당 공고를 불러오지 못했습니다. 다시 시도해 주세요.');}
    finally {if (alive.current && request === listRequest.current) setLoading(false);}
  }
  useEffect(() => {alive.current = true; setNotices([]); setEditing(null); setMetricNotice(null); setDirty(false); refresh(); return () => {alive.current = false; listRequest.current++;};}, [user.id]);
  useEffect(() => {onDirtyChange?.(dirty); return () => onDirtyChange?.(false);}, [dirty, onDirtyChange]);
  useEffect(() => {onBusyChange?.(saving); return () => onBusyChange?.(false);}, [saving, onBusyChange]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = event => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const canLeave = () => !saving && (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?'));
  function openEditor(notice, context = null) {
    if (!canLeave()) return;
    const element = document.activeElement;
    editorOrigin.current = {view: metricNotice ? 'metrics' : view, scrollY: window.scrollY, element, focusLabel: element?.getAttribute('aria-label') || element?.textContent};
    setEditorContext(context);
    const copy = structuredClone(notice);
    changeView('list'); setEditing(copy); setTaskText((copy.tasks || []).join('\n')); setDirty(false);
    setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  function change(key, value) {
    setEditing(previous => ({...previous, [key]: value, reviewed: key === 'reviewed' ? value : false}));
    setDirty(true); setMessage('');
  }
  function updateRow(key, index, patch) {change(key, editing[key].map((row, i) => i === index ? {...row, ...patch} : row));}
  function removeRow(key, index) {change(key, editing[key].filter((_, i) => i !== index));}
  async function persist(status) {
    if (saving) return;
    if (editing.status === 'published' && status === 'draft' && !window.confirm('현재 게시를 내리고 수정 내용을 임시저장할까요? 학생 공고 목록에서 숨겨집니다.')) return;
    if (status === 'archived' && !window.confirm('게시를 종료할까요? 학생이 작성한 내용은 유지됩니다.')) return;
    setSaving(true); setError(''); setMessage('');
    const data = {...editing, status, tasks: taskText.split('\n').map(text => text.trim()).filter(Boolean)};
    try {
      const saved = await saveNotice(data);
      if (!alive.current) return;
      setEditing(saved); setDirty(false); setTaskText(saved.tasks.join('\n'));
      setNotices(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      setMetricNotice(previous => previous?.id === saved.id ? saved : previous);
      setRevision(value => value + 1);
      setMessage(status === 'published' ? '게시했습니다. 학생 공고 목록에 표시됩니다.' : status === 'archived' ? '게시를 종료했습니다.' : '임시저장했습니다. 학생에게는 표시되지 않습니다.');
    } catch (e) {if (alive.current) {setError(e.message || '저장하지 못했습니다. 입력 내용은 유지됩니다.'); window.scrollTo(0, 0);}}
    finally {if (alive.current) setSaving(false);}
  }
  function leaveEditor() {
    if (!canLeave()) return;
    const origin = editorOrigin.current;
    changeView(origin.view === 'overview' ? 'overview' : 'list');
    setEditing(null); setDirty(false); setError(''); setMessage(''); setEditorContext(null);
    requestAnimationFrame(() => {
      const surface = document.querySelector(origin.view === 'overview' ? '.manager-overview-view' : origin.view === 'metrics' ? '.manager-metrics-view' : '.manager-list');
      const focusTarget = origin.element?.isConnected ? origin.element : [...(surface?.querySelectorAll('button') || [])].find(button => (button.getAttribute('aria-label') || button.textContent) === origin.focusLabel);
      focusTarget?.focus({preventScroll: true});
      window.scrollTo({top: origin.scrollY, behavior: 'instant'});
    });
  }
  function loadTemplate() {
    if (templateIndex === '' || !canLeave()) return;
    const {id, owner_id, ...template} = templates[Number(templateIndex)];
    openEditor({...emptyNotice(), ...structuredClone(template), status: 'draft', reviewed: false});
    setDirty(true);
  }

  function showList(status = 'all') {
    if (!canLeave()) return;
    if (view === 'overview') {setSearch(''); setCategoryFilter('all');}
    changeView('list'); setStatusFilter(status); setEditing(null); setMetricNotice(null); setDirty(false); setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  function showOverview() {
    if (!canLeave()) return;
    changeView('overview'); setEditing(null); setMetricNotice(null); setDirty(false); setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  const filtered = notices.filter(notice => (statusFilter === 'all' || notice.status === statusFilter) && (categoryFilter === 'all' || notice.category === categoryFilter) && `${notice.title} ${notice.department}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === 'title' ? (a.title || '').localeCompare(b.title || '', 'ko') : sort === 'updated' ? (b.updated_at || '').localeCompare(a.updated_at || '') : (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const editorSections = editing ? [
    ['manager-basics', '기본 정보', !!(editing.title?.trim() && editing.department?.trim() && editing.summary?.trim() && editing.sourceUrl && editing.applicationUrl && editing.deadline && editing.deadlineEvidence?.trim())],
    ['manager-rules', '지원 조건', editing.rules.length > 0 && editing.rules.every(rule => rule.label?.trim() && rule.evidence?.trim() && (Array.isArray(rule.value) ? rule.value.length > 0 : String(rule.value).trim()))],
    ['manager-documents', '제출 항목', taskText.trim().length > 0 && editing.questions.every(question => question.label?.trim() && Number(question.max) > 0)],
    ['manager-review', '후속 절차·검수', !!(editing.followup?.trim() && editing.reviewed)],
  ] : [];
  const completedSections = editorSections.filter(section => section[2]).length;
  const returnLabel = editorOrigin.current.view === 'overview' ? '통합 현황으로 돌아가기' : editorOrigin.current.view === 'metrics' ? '공고 집계로 돌아가기' : '담당 공고 목록';

  return <div className={'manager-workspace ' + (view === 'overview' && !editing && !metricNotice ? 'is-overview' : '') + (editing ? ' is-editing' : '')}>
    <div className="page-heading"><div><div className="eyebrow">NOTICE MANAGEMENT</div><h1>{editing ? '공고 작성' : metricNotice ? '공고별 집계' : view === 'overview' ? '담당자 대시보드' : '담당 공고 관리'}</h1><p>{editing ? '원문을 확인하고 학생에게 필요한 안내를 정리하세요.' : '담당 공고의 모집 현황을 확인하고 다음 작업을 이어가세요.'}</p></div><button className="button secondary" disabled={saving} onClick={onBack}><ArrowLeft size={16}/>학생 화면</button></div>
    <div className="manager-account"><ShieldCheck size={18}/><span>{testMode ? '테스트 담당자' : '담당자 계정'} <strong>{user.email}</strong></span><span className="tag">{testMode ? '테스트 공간' : '서버 권한 검사'}</span></div>
    <div className='tabs manager-workspace-tabs' aria-label='담당자 메뉴'><button disabled={saving} className={view === 'overview' && !editing && !metricNotice ? 'active' : ''} onClick={showOverview}>통합 현황</button><button disabled={saving} className={view === 'list' || editing || metricNotice ? 'active' : ''} onClick={() => showList()}>공고 관리</button></div>
    {error && <div className="warning" role="alert">{error}</div>}
    <div hidden={loading || view !== 'overview' || !!editing || !!metricNotice} className="manager-overview-view"><ManagerOverview user={user} testMode={testMode} notices={notices} onOpenNotice={openEditor} onCreate={() => openEditor(emptyNotice())} onFilterStatus={showList} onOpenList={() => showList()} refreshKey={revision}/></div>
    {metricNotice && <div hidden={!!editing} className="manager-metrics-view"><button className="back" onClick={() => {changeView('list'); setMetricNotice(null); setError('');}}><ArrowLeft size={16}/>담당 공고 목록</button><NoticeMetrics notice={metricNotice} testMode={testMode} onEdit={openEditor}/></div>}
    {editing ? <>
      <button className="back" disabled={saving} onClick={leaveEditor}><ArrowLeft size={16}/>{returnLabel}</button>
      <div className="manager-editor-heading"><h1>{editing.id ? '공고 수정' : '공고 등록'}</h1><span className="tag">{statusLabels[editing.status]}</span><span className="muted tiny" role="status">{saving ? '저장 중' : dirty ? '저장하지 않은 변경' : editing.id ? '저장됨' : '새 공고'}</span></div>
      {editorContext && <div className="manager-editor-context"><strong>{editing.title}</strong><span>{editorContext.source === 'sample' ? '가상 시나리오' : testMode ? '이 브라우저 기록' : '서비스 기록'} / {editorContext.fromDate} ~ {editorContext.toDate}</span><small>이 집계를 확인하며 수정 중입니다. 저장 후 같은 화면으로 돌아갑니다.</small></div>}
      {editing.status === 'published' && <div className="info-note">수정 내용은 다시 게시한 뒤 반영됩니다. 임시저장하면 현재 게시가 내려갑니다.</div>}
      <nav className='manager-section-nav' aria-label='공고 작성 단계'>{editorSections.map(([id, label, done], index) => <a key={id} href={'#' + id} aria-disabled={saving || undefined} onClick={event => {event.preventDefault(); if (!saving) document.getElementById(id)?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});}}><span className={done ? 'complete' : ''}>{done ? <CheckCircle2 size={14}/> : index + 1}</span>{label}</a>)}<small>작성 {completedSections}/4</small></nav>
      <form onSubmit={event => {event.preventDefault(); persist('published');}}>
        <fieldset disabled={saving} className="manager-fieldset">
          <section id="manager-basics" className="panel manager-section">
            <h3>기본 정보와 신청 경로</h3>
            {editing.sourceReview && <div className="info-note"><div><p>원문 확인일 {editing.sourceReview.checkedAt}</p><p>{editing.sourceReview.scope}</p><p>확인할 일: {Array.isArray(editing.sourceReview.remainingChecks) ? editing.sourceReview.remainingChecks.join(' / ') : editing.sourceReview.remainingChecks}</p>{editing.sourceReview.attachmentUrls?.filter(safeUrl).map((url, index) => <a key={url} className="text-button" href={safeUrl(url)} target="_blank" rel="noreferrer">근거 자료 {index + 1}<ExternalLink size={14}/></a>)}</div></div>}
            <div className="manager-fields">
              <label className="manager-wide">공고 제목<input value={editing.title} maxLength={200} onChange={event => change('title', event.target.value)} required/></label>
              <label>분류<select value={editing.category} onChange={event => change('category', event.target.value)}>{['프로젝트', '진로', '장학', '교류', '기타'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label>담당 부서<input value={editing.department} maxLength={100} onChange={event => change('department', event.target.value)} required/></label>
              <label className="manager-wide">공고 요약<textarea value={editing.summary} maxLength={2000} onChange={event => change('summary', event.target.value)} required/></label>
              <label className="manager-wide">공식 원문 주소<input type="url" placeholder="https://www.catholic.ac.kr/..." value={editing.sourceUrl} onChange={event => change('sourceUrl', event.target.value)} required/></label>
              <label className="manager-wide">신청 경로 주소<input type="url" placeholder="https://... 또는 mailto:담당자 이메일" value={editing.applicationUrl} onChange={event => change('applicationUrl', event.target.value)} required/><small>HTTPS 주소나 mailto:로 시작하는 접수 이메일을 입력하세요.</small></label>
              <label className="manager-wide">신청 방법 안내<textarea value={editing.applicationInstructions || ''} onChange={event => change('applicationInstructions', event.target.value)} placeholder="이메일 제목, 제출 방식, 마감 시간 등을 안내하세요."/></label>
              <label>신청 마감일<input type="date" value={editing.deadline} onChange={event => change('deadline', event.target.value)} required/></label>
              <label className="manager-wide">마감 근거<textarea value={editing.deadlineEvidence} placeholder="원문의 마감 날짜와 시간을 옮겨 적으세요." onChange={event => change('deadlineEvidence', event.target.value)} required/></label>
            </div>
            {safeUrl(editing.sourceUrl) && <a className="text-button" href={safeUrl(editing.sourceUrl)} target="_blank" rel="noreferrer">원문과 대조하기<ExternalLink size={15}/></a>}
          </section>

          <section id="manager-rules" className="panel manager-section">
            <div className="section-heading"><h3>지원 조건</h3><button type="button" className="text-button" onClick={() => change('rules', [...editing.rules, newRule()])}><Plus size={16}/>조건 추가</button></div>
            <p className="muted">조건마다 비교 기준과 원문 근거를 입력하세요.</p>
            {!editing.rules.length && <p className="manager-empty">등록된 조건이 없습니다. 게시하려면 조건을 추가하세요.</p>}
            {editing.rules.map((rule, index) => <div className="manager-repeat" key={index}>
              <div className="section-heading"><b>조건 {index + 1}</b><button type="button" className="icon-button" aria-label={`조건 ${index + 1} 삭제`} onClick={() => removeRow('rules', index)}><Trash2 size={16}/></button></div>
              <div className="manager-fields">
                <label>학생 정보<select value={rule.field} onChange={event => updateRow('rules', index, event.target.value === 'manual' ? {field: 'manual', op: 'eq', value: '확인'} : {field: event.target.value})}>{Object.entries(fieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>비교 방식<select value={rule.op} disabled={rule.field === 'manual'} onChange={event => updateRow('rules', index, {op: event.target.value, value: event.target.value === 'in' ? [] : ''})}><option value="eq">같음</option><option value="in">목록 중 하나</option><option value="min">이상</option></select></label>
                <label>비교값<input type={rule.op === 'min' ? 'number' : 'text'} disabled={rule.field === 'manual'} step="any" value={Array.isArray(rule.value) ? rule.value.join(', ') : rule.value} placeholder={rule.op === 'in' ? '예: 2, 3, 4' : rule.field === 'status' ? '예: 재학' : '원문 조건의 값'} onChange={event => updateRow('rules', index, {value: rule.op === 'in' ? event.target.value.split(',').map(value => value.trim()) : rule.op === 'min' && event.target.value !== '' ? Number(event.target.value) : event.target.value})} required/><small>{rule.field === 'manual' ? '항상 확인 필요로 표시합니다.' : rule.op === 'in' ? '값을 쉼표로 구분하세요.' : '학년은 숫자만 입력하세요.'}</small></label>
                <label>학생에게 표시할 조건<input value={rule.label} placeholder="예: 2학년 이상" maxLength={200} onChange={event => updateRow('rules', index, {label: event.target.value})} required/></label>
                <label className="manager-wide">조건 {index + 1} 원문 근거<textarea value={rule.evidence} onChange={event => updateRow('rules', index, {evidence: event.target.value})} required/></label>
              </div>
            </div>)}
            <div className="info-note">학생이 입력하지 않은 정보는 ‘확인 필요’로 표시합니다.</div>
          </section>

          <section id="manager-documents" className="panel manager-section">
            <h3>제출 항목과 작성 문항</h3>
            <div className="manager-fields"><label className="manager-wide">준비 체크리스트<textarea value={taskText} placeholder={'신청 양식 확인\n필수 서류 준비'} onChange={event => {setTaskText(event.target.value); change('tasks', event.target.value.split('\n').map(value => value.trim()).filter(Boolean));}} required/><small>제출 항목을 한 줄에 하나씩 입력하세요.</small></label></div>
            <div className="section-heading"><b>직접 작성 문항</b><button type="button" className="text-button" onClick={() => change('questions', [...editing.questions, {label: '', hint: '', max: 1000}])}><Plus size={16}/>문항 추가</button></div>
            {!editing.questions.length && <p className="manager-empty">별도 작성 문항이 없습니다.</p>}
            {editing.questions.map((question, index) => <div className="manager-repeat" key={index}>
              <div className="section-heading"><b>문항 {index + 1}</b><button type="button" className="icon-button" aria-label={`문항 ${index + 1} 삭제`} onClick={() => removeRow('questions', index)}><Trash2 size={16}/></button></div>
              <div className="manager-fields">
                <label>문항 제목<input value={question.label} onChange={event => updateRow('questions', index, {label: event.target.value})} maxLength={200} required/></label>
                <label>최대 글자 수<input type="number" min="1" max="10000" step="1" value={question.max} onChange={event => updateRow('questions', index, {max: event.target.value === '' ? '' : Number(event.target.value)})} required/></label>
                <label className="manager-wide">작성 안내<textarea value={question.hint} onChange={event => updateRow('questions', index, {hint: event.target.value})}/></label>
              </div>
            </div>)}
            <p className="muted">학생이 직접 작성합니다. 담당자는 작성 내용을 볼 수 없습니다.</p>
          </section>

          <WorkflowFields editing={editing} change={change} testMode={testMode}/>
          <section id="manager-review" className="panel manager-section">
            <h3>후속 절차와 검수</h3>
            <div className="manager-fields"><label className="manager-wide">신청 후 확인할 일<textarea value={editing.followup} placeholder="발표 일정, 추가 서류, 오리엔테이션 등을 안내하세요." onChange={event => change('followup', event.target.value)} required/></label></div>
            <label className="manager-review"><input type="checkbox" checked={!!editing.reviewed} onChange={event => change('reviewed', event.target.checked)}/><span>원문과 조건, 마감, 신청 경로를 대조했습니다.</span></label>
            <p className="muted">내용을 수정하면 검수 확인을 다시 받아야 합니다.</p>
            <div className="info-note">공식 접수 미연동. 카카오 발송과 학교 시스템도 미연동입니다.</div>
          </section>
          <div className="manager-save-bar">
            {saving && <span role="status">저장 중</span>}
            {message && <div className="manager-save-feedback"><div className="success-note" role="status"><CheckCircle2 size={17}/>{message}</div><button type="button" className="text-button" onClick={leaveEditor}>{returnLabel}<ArrowRight size={15}/></button></div>}
            <button type="button" className="button secondary" onClick={() => persist('draft')}><Save size={16}/>{editing.status === 'published' ? '게시 내리고 임시저장' : '임시저장'}</button>
            {editing.id && editing.status === 'published' && <button type="button" className="button secondary" onClick={() => persist('archived')}>게시 종료</button>}
            <button type="submit" className="button primary" disabled={!editing.reviewed}><CheckCircle2 size={16}/>{editing.status === 'published' ? '수정 내용 게시' : '검수 후 게시'}</button>
          </div>
        </fieldset>
      </form>
    </> : metricNotice ? null : loading ? <p role='status'>담당 공고를 불러오는 중입니다.</p> : view === 'overview' ? null : <>
      <div className="section-heading manager-list-heading"><h2>나의 담당 공고 <span className="count">{notices.length}</span></h2><div className="row wrap"><button className="button secondary" onClick={refresh} disabled={loading}><RefreshCw size={16}/>새로고침</button><button className="button primary" onClick={() => openEditor(emptyNotice())}><Plus size={16}/>공고 등록</button></div></div>
      <div className='manager-list-filters'><label className='manager-search'>공고 검색<input placeholder='제목 또는 담당 부서' value={search} onChange={event => setSearch(event.target.value)}/></label><label>분류<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value='all'>전체 분류</option>{['프로젝트','진로','장학','교류','기타'].map(value => <option key={value}>{value}</option>)}</select></label><label>정렬<select value={sort} onChange={event => setSort(event.target.value)}><option value='deadline'>마감 가까운 순</option><option value='title'>제목순</option><option value='updated'>최근 수정순</option></select></label></div>
      <div className='tabs manager-status-tabs' aria-label='공고 상태'>{[['all','전체'],...Object.entries(statusLabels)].map(([value,label]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label} <span>{notices.filter(notice => value === 'all' || notice.status === value).length}</span></button>)}</div>
      <p className='manager-result-count' role='status'>검색 결과 {filtered.length}건</p>
      <GuideReview testMode={testMode}/>
      {templates.length > 0 && <details className='manager-template-details'><summary>실제 공고에서 검수 초안 가져오기</summary><section className="panel manager-template"><div><b>실제 공고 검수 초안</b><p className="muted">수집본에서 정리한 초안입니다. 최신 원문을 확인한 뒤 게시하세요.</p></div><div className="row wrap"><select aria-label="검수 초안 선택" value={templateIndex} onChange={event => setTemplateIndex(event.target.value)}><option value="">공고 선택</option>{templates.map((template, index) => <option key={template.id || index} value={index}>{template.title}</option>)}</select><button className="button secondary" disabled={templateIndex === ''} onClick={loadTemplate}>초안 불러오기<ArrowRight size={16}/></button></div></section></details>}
      {loading ? <p role="status">담당 공고를 불러오는 중입니다.</p> : !filtered.length ? <div className="empty"><FileText size={32}/><h3>{notices.length ? '조건에 맞는 공고가 없습니다.' : '아직 등록한 공고가 없습니다.'}</h3><button className='button secondary' onClick={() => {setSearch(''); setCategoryFilter('all'); setStatusFilter('all');}}>필터 초기화</button></div> : <div className="manager-list">{filtered.map(notice => <article key={notice.id} className="panel manager-notice"><div><div className="row wrap"><span className={'tag manager-status-' + notice.status}>{statusLabels[notice.status]}</span><span className="muted tiny">{notice.department || '부서 미입력'}</span></div><h3>{notice.title || '제목 없는 공고'}</h3><p className="muted">마감 {notice.deadline || '미입력'}</p><small className='muted'>{notice.category} / 조건 {notice.rules.length}개 / 준비 항목 {notice.tasks.length}개</small></div><div className="row wrap"><button className="button secondary" onClick={() => {setMetricNotice(notice); setMessage(''); setError('');}}>집계 보기</button><button className="button primary" onClick={() => openEditor(notice)}>공고 수정<ArrowRight size={16}/></button></div></article>)}</div>}

    </>}
  </div>;
}

function NoticeMetrics({notice, testMode, onEdit}) {
  const [fromDate, setFromDate] = useState(monthAgo);
  const [toDate, setToDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentRequest = useRef(0);
  async function load() {
    if (!fromDate || !toDate || fromDate > toDate) {setError('시작일과 종료일을 확인하세요.'); setData(null); return;}
    const request = ++currentRequest.current;
    setLoading(true); setError(''); setData(null);
    try {const result = await getNoticeMetrics(notice.id, fromDate, toDate); if (request === currentRequest.current) setData(result);}
    catch (e) {if (request === currentRequest.current) setError(e.message || '집계를 불러오지 못했습니다. 다시 시도해 주세요.');}
    finally {if (request === currentRequest.current) setLoading(false);}
  }
  useEffect(() => {load(); return () => {currentRequest.current++;};}, [notice.id]);
  function changeDate(setter, value) {currentRequest.current++; setter(value); setData(null); setLoading(false); setError('');}
  const labels = [['view', '상세 조회'], ['interest', '관심 등록'], ['start', '준비 시작'], ['complete', '제출 완료 자기보고'], ['link', '신청 링크 이동']];
  return <section className="manager-metrics">
    <div className="page-heading"><div><div className="eyebrow">PROGRAM INSIGHTS</div><h2>{notice.title || '제목 없는 공고'}</h2><p>공고 ID {notice.id}</p></div><div className="row wrap"><span className="tag">{testMode ? '테스트 집계' : statusLabels[notice.status]}</span><button className="button primary" onClick={() => onEdit(notice, data ? {source: 'activity', fromDate: data.fromDate || fromDate, toDate: data.toDate || toDate} : null)}>공고 수정<ArrowRight size={16}/></button></div></div>
    <form className="manager-period" onSubmit={event => {event.preventDefault(); load();}}><label>집계 시작일<input type="date" value={fromDate} max={toDate} onChange={event => changeDate(setFromDate, event.target.value)} required/></label><label>집계 종료일<input type="date" value={toDate} min={fromDate} onChange={event => changeDate(setToDate, event.target.value)} required/></label><button className="button primary" disabled={loading}>집계 조회</button></form>
    {error && <div className="warning" role="alert">{error}</div>}
    {loading && <p role="status">집계를 불러오는 중입니다.</p>}
    {data && <><div className="info-note"><div><p>집계 기간 {data.fromDate || fromDate} 00:00 ~ {data.toDate || toDate} 23:59:59 (한국 시간)</p><p>분모: {data.denominatorLabel || '같은 공고를 상세 조회한 고유 학생'} {countText(data.denominator)}</p></div></div><section className="panel"><div className="manager-counts">{labels.map(([key, label]) => <div key={key}><span>{label}</span><strong>{countText(data.counts?.[key])}</strong><small>{key === 'view' ? '집계 분모' : '기간 내 단계별 고유 학생'}</small></div>)}</div><p className="muted">1~4명은 비공개입니다. 단계별 인원은 서로 중복될 수 있습니다.</p><p className="muted">관심 해제와 완료 취소 후에도 발생 이력은 남습니다.</p></section></>}
    {data&&<ResponseReport reports={data.responses}/>}
    {data?.optionCounts?.length>0&&<section className="panel workflow-metrics"><h3>신청 항목별 행동</h3><p>같은 학생이 두 기수를 이용해도 공고 전체에서는 한 명입니다.</p><div className="table-scroll"><table><thead><tr><th>항목</th><th>조회</th><th>준비</th><th>링크</th><th>완료 자기보고</th></tr></thead><tbody>{data.optionCounts.map(option=><tr key={option.id}><th>{option.label}</th>{['view','start','link','complete'].map(key=><td key={key}>{countText(option.counts[key])}</td>)}</tr>)}</tbody></table></div></section>}
    {data?.followupCounts?.length>0&&<section className="panel workflow-metrics"><h3>현재 후속 절차 자기보고</h3><p>현재 저장 상태입니다. 위 기간별 행동 이력과 별도로 집계합니다.</p><div className="manager-counts">{data.followupCounts.map(row=><div key={row.label}><span>{row.label}</span><strong>{countText(row.count)}</strong></div>)}</div><p>1~4명은 비공개입니다. 공식 결과와 연결하지 않았습니다.</p></section>}
    <div className="admin-notes"><section className="panel"><h3>공식 접수 결과</h3><span className="tag">공식 접수 미연동</span><p>링크 이동은 제출 완료가 아닙니다.</p><p>자기보고는 학생이 직접 표시한 상태입니다.</p></section><section className="panel"><h3>학생 정보 보호</h3><p>학생 명단과 지원서 본문은 제공하지 않습니다.</p><p>학생의 학점과 거주 정보도 제공하지 않습니다.</p></section><section className="panel"><h3>집계 해석</h3><p>행동 기록만으로 중도 포기 원인을 알 수 없습니다.</p><p>학교 전체의 공식 신청 인원이 아닙니다.</p></section></div>
  </section>;
}
