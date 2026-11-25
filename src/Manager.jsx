import {ResponseReport} from './GuideReview.jsx';
import React, {useEffect, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Eye, FileText, Plus, RefreshCw, Save, Trash2} from 'lucide-react';
import {getNoticeMetrics, listManagedNotices, saveNotice} from './gateway.js';
import {goBack, useBackLayer} from './back-layer.js';
import ManagerOverview from './ManagerOverview.jsx';
import Applicants from './Applicants.jsx';
import NoticeFunnel from './NoticeFunnel.jsx';
import NoticeSuggestions from './NoticeSuggestions.jsx';
import NoticeDraft from './NoticeDraft.jsx';
import QualificationPicker from './QualificationPicker.jsx';
import {getNoticeFunnel} from './manager-api.js';
import {listDate, managerPageItems} from './manager-pages.js';
import WorkflowFields from './WorkflowFields.jsx';
import {applyMode, noticeQuestions} from './contract.js';
import {blockReady, editorNotice, listStepDone, questionReady, ruleReady} from './notice-editor.js';
import {BlockEditor, PreviewDialog, QuestionEditor} from './NoticeEditorParts.jsx';
import './manager.css';

const statusLabels = {draft: '임시저장', published: '게시 중', archived: '게시 종료'};
const fieldLabels = {status: '재학 상태', year: '학년', department: '학과', gpa: '평균 학점', residence: '거주 개월', manual: '직접 확인', custom: '직접 만든 자격'};
const emptyNotice = () => ({applyMode: 'site', title: '', category: '프로젝트', department: '', deadline: '', summary: '', blocks: [], sourceUrl: '', applicationUrl: '', deadlineEvidence: '', rules: [], tasks: [], questions: [], followup: '', reviewed: false, status: 'draft'});
const newRule = () => ({field: 'status', op: 'eq', value: '', label: '', evidence: ''});
const koreanDate = date => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
const today = () => koreanDate(new Date());
const monthAgo = () => koreanDate(new Date(Date.now() - 30 * 86400000));
const safeUrl = value => {try {const url = new URL(value); return url.protocol === 'https:' ? url.href : null;} catch {return null;}};
const fieldError = validity => validity.valueMissing ? '필수 칸입니다.' : validity.typeMismatch ? '주소 형식을 확인하세요.' : validity.rangeUnderflow || validity.rangeOverflow || validity.stepMismatch || validity.badInput ? '입력 범위를 확인하세요.' : '입력값을 확인하세요.';
const permissionErrorText = '담당자 권한이 필요합니다.';
// Saved content without server bookkeeping, with object keys sorted because jsonb does not keep key order.
const noticeContent = ({id, owner_id, updated_at, isDemo, insertId, ...content}) => JSON.stringify(content, (key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
const listErrorText = '공고 목록을 불러오지 못했습니다. 다시 시도해 주세요.';
const pageSize = 30;
// Editor fields a link draft may fill. applyMode is not among them; the manager chooses it.
const draftFields = ['title', 'department', 'deadline', 'deadlineEvidence', 'summary', 'applicationInstructions', 'rules', 'tasks', 'blocks', 'sourceUrl'];
const countText = value => value === null || value === undefined ? '비공개' : `${value.toLocaleString()}명`;

export default function Manager({user,templates = [], testMode = false, onDirtyChange, onBusyChange, section, onSectionChange, navigationKey, onStudentView, metricsReturn, onMetricsShown, onDetailChange}) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricNotice, setMetricNotice] = useState(null);
  const [applicantNotice, setApplicantNotice] = useState(null);
  const [editorContext, setEditorContext] = useState(null);
  const [reviewCleared, setReviewCleared] = useState(false);
  const [checkFields, setCheckFields] = useState(false);
  const [invalidCount, setInvalidCount] = useState(0);
  const formRef = useRef(null);
  const savedNotice = useRef(null);
  const insertId = useRef(null);
  const [conflict, setConflict] = useState(null);
  const [opening, setOpening] = useState(false);
  const editorOrigin = useRef({view: 'list', scrollY: 0, element: null});
  const metricsOrigin = useRef({view: 'list', scrollY: 0, element: null});
  const applicantsOrigin = useRef({view: 'list', scrollY: 0, element: null});
  const [taskText, setTaskText] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [templateIndex, setTemplateIndex] = useState('');
  const [view, setView] = useState(section || 'overview');
  const requestedSection = useRef(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState('deadline');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  const listTop = useRef(null);
  const alive = useRef(true);
  const listRequest = useRef(0);
  function changeView(next) {setView(next); requestedSection.current = section && section !== next ? next : null; onSectionChange?.(next);}
  useEffect(() => {if (!section) return; if (requestedSection.current === section) {requestedSection.current = null; return;} setView(section); setEditing(null); setMetricNotice(null); setApplicantNotice(null); setDirty(false); setError(''); setMessage('');}, [section, navigationKey]);

  async function refresh() {
    const request = ++listRequest.current;
    setLoading(true); setError('');
    try {const list = await listManagedNotices(); if (alive.current && request === listRequest.current) {setNotices(list); setListError(''); setRevision(value => value + 1); setPage(1);}}
    catch (e) {if (alive.current && request === listRequest.current) setListError(e.message === permissionErrorText ? permissionErrorText : listErrorText);}
    finally {if (alive.current && request === listRequest.current) setLoading(false);}
  }
  useEffect(() => {alive.current = true; setNotices([]); setEditing(null); setMetricNotice(null); setApplicantNotice(null); setDirty(false); refresh(); return () => {alive.current = false; listRequest.current++;};}, [user.id]);
  useEffect(() => setPage(1), [search, statusFilter, categoryFilter, sort]);
  // Back from the student view opened after publishing, show that notice's metrics again.
  useEffect(() => {if (metricsReturn) {showMetrics(metricsReturn); onMetricsShown?.();}}, [metricsReturn]);
  useEffect(() => {onDirtyChange?.(dirty); return () => onDirtyChange?.(false);}, [dirty, onDirtyChange]);
  useEffect(() => {onBusyChange?.(saving); return () => onBusyChange?.(false);}, [saving, onBusyChange]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = event => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const canLeave = () => !saving && (!dirty || window.confirm('저장하지 않은 변경을 버릴까요?'));
  // Where a detail screen was opened from, so back returns to the same list, scroll and button.
  function here() {
    const element = document.activeElement, item = element?.closest?.('[data-notice-id]');
    return {view, scrollY: window.scrollY, element, focusLabel: element?.getAttribute('aria-label') || element?.textContent, noticeId: item?.dataset.noticeId, buttonIndex: item ? [...item.querySelectorAll('button')].indexOf(element) : -1};
  }
  // Rows are re-rendered after a save, so find the opened row again; the dashboard may still be reloading for a few frames.
  function restore(origin, tries = 30) {
    requestAnimationFrame(() => {
      const surface = document.querySelector(origin.view === 'overview' ? '.manager-overview-view' : origin.view === 'metrics' ? '.manager-metrics-view' : '.manager-list');
      const item = origin.noticeId && surface?.querySelector(`[data-notice-id="${origin.noticeId}"]`);
      const focusTarget = origin.element?.isConnected ? origin.element : item ? item.querySelectorAll('button')[origin.buttonIndex] : [...(surface?.querySelectorAll('button') || [])].find(button => (button.getAttribute('aria-label') || button.textContent) === origin.focusLabel);
      window.scrollTo({top: origin.scrollY, behavior: 'instant'});
      if (!focusTarget && origin.noticeId && tries) return restore(origin, tries - 1);
      focusTarget?.focus({preventScroll: true});
    });
  }
  function openEditor(notice, context = null) {
    if (!canLeave()) return;
    editorOrigin.current = {...here(), view: metricNotice ? 'metrics' : view};
    setEditorContext(context);
    const copy = editorNotice(structuredClone(notice));
    setEditing(copy); setPreviewing(false); setDraft(null); setTaskText((copy.tasks || []).join('\n')); setDirty(false);
    savedNotice.current = copy; insertId.current = copy.id ? null : crypto.randomUUID(); setConflict(null); setReviewCleared(false); setCheckFields(false); setInvalidCount(0);
    setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  // Overview rows come from the metrics RPC and lack editor fields. Open the stored notice, re-reading the list when it is missing.
  async function openFromOverview(row, context) {
    const known = notices.find(item => item.id === row.id);
    if (known) return openEditor(known, context);
    const request = ++listRequest.current;
    setError(''); setMessage(''); setOpening(true);
    try {
      const list = await listManagedNotices();
      if (!alive.current || request !== listRequest.current) return;
      setNotices(list); setListError('');
      const found = list.find(item => item.id === row.id);
      if (found) openEditor(found, context);
      else {setError('공고 목록에서 이 공고를 찾지 못했습니다.'); window.scrollTo(0, 0);}
    } catch {
      if (alive.current && request === listRequest.current) {setError('공고를 불러오지 못했습니다. 다시 시도해 주세요.'); window.scrollTo(0, 0);}
    } finally {if (alive.current && request === listRequest.current) setOpening(false);}
  }
  function change(key, value) {
    setReviewCleared(key !== 'reviewed' && (reviewCleared || !!editing.reviewed));
    setEditing(previous => ({...previous, [key]: value, reviewed: key === 'reviewed' ? value : false}));
    setDirty(true); setMessage('');
  }
  // Replaces one block's text with its AI suggestion and drops that suggestion.
  function applySuggestion(row) {
    change('blocks', editing.blocks.map(block => block.id === row.blockId ? {...block, text: row.suggestion} : block));
    setEditorContext(previous => ({...previous, suggestions: previous.suggestions.filter(item => item.blockId !== row.blockId)}));
  }
  function applyDraft({fields = {}, evidence = {}, duplicateNoticeId = null, message: note}) {
    const patch = Object.fromEntries(draftFields.filter(key => fields[key] !== undefined).map(key => [key, fields[key]]));
    setEditing(previous => ({...previous, ...patch, reviewed: false}));
    if (patch.tasks) setTaskText(patch.tasks.join('\n'));
    setDraft({evidence, duplicateNoticeId, message: note, blocks: !!patch.blocks}); setDirty(true); setMessage('');
  }
  const evidenceNote = key => draft?.evidence?.[key] ? <small>원문 근거: {draft.evidence[key]}</small> : null;
  function updateRow(key, index, patch) {change(key, editing[key].map((row, i) => i === index ? {...row, ...patch} : row));}
  function removeRow(key, index) {change(key, editing[key].filter((_, i) => i !== index));}
  async function persist(status, version = null) {
    if (saving) return;
    // A retry over the latest version (version given) was already confirmed on the first attempt.
    if (!version) {
      if (editing.status === 'published' && status === 'draft' && !window.confirm('현재 게시를 내리고 수정 내용을 임시저장할까요? 학생 공고 목록에서 숨겨집니다.')) return;
      if (status === 'archived' && !window.confirm(dirty ? '저장하지 않은 수정은 버리고 게시를 종료할까요? 학생이 작성한 내용은 유지됩니다.' : '게시를 종료할까요? 학생이 작성한 내용은 유지됩니다.')) return;
      if (editing.status === 'archived' && status === 'published' && !window.confirm('게시 종료한 공고를 다시 게시할까요? 학생 공고 탐색에 다시 표시됩니다.')) return;
    }
    // A draft from a school link may share its source with a published notice. Ask once whether to end that one.
    const duplicate = status === 'published' && draft?.duplicateNoticeId && notices.find(item => item.id === draft.duplicateNoticeId && item.id !== editing.id && item.status === 'published');
    const archiveDuplicate = !version && !!duplicate && window.confirm('같은 원문으로 게시 중인 공고가 있습니다. 새 공고를 게시한 뒤 기존 공고를 게시 종료할까요?');
    setSaving(true); setError(''); setMessage(''); setConflict(null);
    // Ending a publication changes only the status of the last saved version.
    const data = {...(status === 'archived' ? {...savedNotice.current, status} : {...editorNotice(editing), status, tasks: taskText.split('\n').map(text => text.trim()).filter(Boolean), insertId: insertId.current}), ...(version ? {updated_at: version} : {})};
    const applySaved = saved => {
      setEditing(saved); setDirty(false); setTaskText(saved.tasks.join('\n')); savedNotice.current = saved; setReviewCleared(false);
      setNotices(previous => [saved, ...previous.filter(item => item.id !== saved.id)]);
      setRevision(value => value + 1);
      setMessage(status === 'published' ? '게시했습니다. 로그인한 학생의 공고 탐색에 표시됩니다.' : status === 'archived' ? '게시를 종료했습니다.' : '임시저장했습니다. 학생에게는 표시되지 않습니다.');
    };
    try {
      const saved = await saveNotice(data);
      if (!alive.current) return;
      applySaved(saved);
      if (archiveDuplicate) {
        try {
          const old = await saveNotice({...duplicate, status: 'archived'});
          if (!alive.current) return;
          setNotices(previous => previous.map(item => item.id === old.id ? old : item)); setDraft(previous => ({...previous, duplicateNoticeId: null}));
          setMessage('게시했습니다. 같은 원문의 기존 공고는 게시를 종료했습니다.');
        } catch {if (alive.current) setError('게시했습니다. 기존 공고는 게시를 종료하지 못했습니다. 공고 관리에서 직접 종료하세요.');}
      }
    } catch (e) {
      if (!alive.current) return;
      if (e.code === 'conflict') {
        // A lost response can hide a save that already landed. If the server holds exactly what was sent, that save is ours.
        const latest = await latestNotice().catch(() => null);
        if (!alive.current) return;
        if (latest && noticeContent(latest) === noticeContent(data)) {applySaved(latest); return;}
        setConflict({status});
      } else setError(e.message || '저장하지 못했습니다. 입력 내용은 유지됩니다.');
      window.scrollTo(0, 0);
    }
    finally {if (alive.current) setSaving(false);}
  }
  // Another tab saved this notice first. Either load that version or save these edits over it.
  async function latestNotice() {
    const list = await listManagedNotices();
    if (!alive.current) return null;
    setNotices(list); setListError('');
    const latest = list.find(item => item.id === editing.id);
    if (!latest) throw new Error();
    return latest;
  }
  async function reloadLatest() {
    try {
      const latest = await latestNotice();
      if (!latest) return;
      const copy = editorNotice(structuredClone(latest));
      setEditing(copy); setTaskText((latest.tasks || []).join('\n')); setDirty(false);
      savedNotice.current = copy; setReviewCleared(false); setConflict(null); setMessage('');
    } catch {if (alive.current) setError('최신 내용을 불러오지 못했습니다. 다시 시도해 주세요.');}
  }
  async function overwriteLatest() {
    try {
      const latest = await latestNotice();
      if (!latest) return;
      // Ending a publication keeps the other tab's content and changes only the status.
      if (conflict.status === 'archived') savedNotice.current = latest;
      await persist(conflict.status, latest.updated_at);
    } catch {if (alive.current) setError('최신 내용을 불러오지 못했습니다. 다시 시도해 주세요.');}
  }
  // Field errors are written under each field instead of the browser bubble, which the sticky step bar can cover.
  function markInvalidFields() {
    const invalid = [];
    for (const element of formRef.current?.elements || []) {
      if (!element.willValidate) continue;
      const label = element.closest('label');
      if (element.validity.valid) {element.removeAttribute('aria-invalid'); label?.removeAttribute('data-error'); continue;}
      invalid.push(element); element.setAttribute('aria-invalid', 'true'); label?.setAttribute('data-error', fieldError(element.validity));
    }
    setInvalidCount(invalid.length);
    return invalid;
  }
  useEffect(() => {if (checkFields) markInvalidFields();}, [editing, taskText, checkFields]);
  function submitEditor(event) {
    event.preventDefault();
    setCheckFields(true);
    const [first] = markInvalidFields();
    if (first) {first.focus({preventScroll: true}); first.scrollIntoView({block: 'center'}); return;}
    persist('published');
  }
  // Runs for the on-screen back button (through goBack) and the device back button.
  function leaveEditor() {
    if (!canLeave()) return false;
    setEditing(null); setDirty(false); setError(''); setMessage(''); setEditorContext(null);
    restore(editorOrigin.current);
  }
  function leaveMetrics() {
    setMetricNotice(null); setError(''); setMessage('');
    restore(metricsOrigin.current);
  }
  function leaveApplicants() {
    setApplicantNotice(null);
    restore(applicantsOrigin.current);
  }
  useBackLayer(!!metricNotice, leaveMetrics);
  useBackLayer(!!applicantNotice, leaveApplicants);
  useBackLayer(!!editing, leaveEditor);
  const detailTitle = editing ? (editing.id ? '공고 수정' : '공고 작성') : metricNotice ? '공고 집계' : applicantNotice ? '신청자' : null;
  useEffect(() => {onDetailChange?.(detailTitle && {from: view, title: detailTitle}); return () => onDetailChange?.(null);}, [detailTitle, view]);
  function loadTemplate() {
    if (templateIndex === '' || !canLeave()) return;
    const {id, owner_id, ...template} = templates[Number(templateIndex)];
    openEditor({...emptyNotice(), ...structuredClone(template), status: 'draft', reviewed: false});
    setDirty(true);
  }

  function showList(status = 'all') {
    if (!canLeave()) return;
    if (view === 'overview') {setSearch(''); setCategoryFilter('all');}
    changeView('list'); setStatusFilter(status); setEditing(null); setMetricNotice(null); setApplicantNotice(null); setDirty(false); setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  function openMetrics(notice, period = null) {
    metricsOrigin.current = {...here(), period};
    setMetricNotice(notice); setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  function openApplicants(notice) {
    applicantsOrigin.current = here();
    setApplicantNotice(notice); window.scrollTo(0, 0);
  }
  // Metrics opened from the editor go back where the editor came from.
  function showMetrics(notice) {
    metricsOrigin.current = editing ? editorOrigin.current : {view, scrollY: 0, element: null};
    setEditing(null); setEditorContext(null); setDirty(false); setMetricNotice(notice); setError(''); setMessage(''); window.scrollTo(0, 0);
  }
  const filtered = notices.filter(notice => (statusFilter === 'all' || notice.status === statusFilter) && (categoryFilter === 'all' || notice.category === categoryFilter) && `${notice.title} ${notice.department}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === 'title' ? (a.title || '').localeCompare(b.title || '', 'ko') : sort === 'updated' ? (b.updated_at || '').localeCompare(a.updated_at || '') : (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const pageCount = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  function goPage(next) {setPage(next); listTop.current?.scrollIntoView({block: 'start'});}
  const siteMode = editing && applyMode(editing) === 'site';
  // Published or archived notices keep their question structure and apply mode; the database refuses those changes too.
  const formLocked = editing && ['published', 'archived'].includes(editing.status);
  const editorSections = editing ? [
    ['manager-basics', '기본 정보', !!(editing.title?.trim() && editing.department?.trim() && editing.summary?.trim() && (siteMode || editing.sourceUrl) && (!editing.deadline || editing.deadlineEvidence?.trim()) && editing.blocks.every(blockReady))],
    ['manager-rules', '지원 조건', listStepDone(editing.rules, ruleReady, editing.reviewed)],
    ['manager-documents', '제출 항목', listStepDone(editing.questions, questionReady, editing.reviewed || editing.tasks?.length > 0)],
    ['manager-review', '후속 절차·검수', !!editing.reviewed],
  ] : [];
  const completedSections = editorSections.filter(section => section[2]).length;
  const returnLabel = editorOrigin.current.view === 'overview' ? '담당자 대시보드로' : editorOrigin.current.view === 'metrics' ? '공고 집계로' : '공고 관리로';
  const metricView = metricNotice && (notices.find(item => item.id === metricNotice.id) || metricNotice);

  return <div className={'manager-workspace ' + (view === 'overview' && !editing && !metricNotice ? 'is-overview' : '') + (editing ? ' is-editing' : '')}>
    {!detailTitle && <><div className="page-heading"><div><div className="eyebrow">NOTICE MANAGEMENT</div><h1>{view === 'overview' ? '담당자 대시보드' : '공고 관리'}</h1><p>담당 공고의 모집 현황을 확인하고 다음 작업을 이어가세요.</p></div></div>
</>}
    {error && <div className="warning" role="alert">{error}</div>}
    {opening && <p className="loading-state" role="status">공고를 여는 중입니다.</p>}
    {conflict && editing && <div className="warning" role="alert">다른 곳에서 먼저 수정했습니다. 최신 내용을 불러오거나 내 수정으로 덮어 저장하세요.<div className="row wrap"><button type="button" className="button secondary" disabled={saving} onClick={reloadLatest}>최신 내용 불러오기</button><button type="button" className="button secondary" disabled={saving} onClick={overwriteLatest}>{conflict.status === 'archived' ? '최신 내용으로 게시 종료' : '내 수정으로 저장'}</button></div></div>}
    <div hidden={loading || view !== 'overview' || !!editing || !!metricNotice || !!applicantNotice} className="manager-overview-view"><ManagerOverview user={user} testMode={testMode} notices={notices} listError={listError} onRetryList={refresh} onOpenNotice={openFromOverview} onOpenMetrics={openMetrics} onCreate={() => openEditor(emptyNotice())} onFilterStatus={showList} onOpenList={() => showList()} refreshKey={revision}/></div>
    {metricNotice && <div hidden={!!editing} className="manager-metrics-view"><button className="back" onClick={goBack}><ArrowLeft size={16}/>{metricsOrigin.current.view === 'overview' ? '담당자 대시보드로' : '공고 관리로'}</button><NoticeMetrics notice={metricView} period={metricsOrigin.current.period} testMode={testMode} onEdit={openFromOverview}/></div>}
    {applicantNotice && <Applicants notice={applicantNotice} testMode={testMode} backLabel="공고 관리로"/>}
    {editing ? <>
      <button className="back" disabled={saving} onClick={goBack}><ArrowLeft size={16}/>{returnLabel}</button>
      <div className="manager-editor-heading"><h1>{detailTitle}</h1><span className="tag">{statusLabels[editing.status]}</span><span className={'muted tiny'+(saving ? ' loading-inline' : '')} role="status">{saving ? '저장 중' : dirty ? '저장하지 않은 변경' : editing.id ? '저장됨' : '새 공고'}</span></div>
      {editorContext && <div className="manager-editor-context"><strong>{editing.title}</strong><span>{editorContext.source === 'sample' ? '가상 시나리오' : testMode ? '이 브라우저 기록' : '서비스 기록'} / {editorContext.fromDate} ~ {editorContext.toDate}</span><small>이 집계를 확인하며 수정 중입니다. 저장 후 같은 화면으로 돌아갑니다.</small></div>}
      {editing.status === 'published' && <div className="info-note">수정 내용은 다시 게시한 뒤 반영됩니다. 임시저장하면 현재 게시가 내려갑니다.</div>}
      <nav className='manager-section-nav' aria-label='공고 작성 단계'>{editorSections.map(([id, label, done], index) => <a key={id} href={'#' + id} aria-disabled={saving || undefined} onClick={event => {event.preventDefault(); if (!saving) document.getElementById(id)?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});}}><span className={done ? 'complete' : ''}>{done ? <CheckCircle2 size={14}/> : index + 1}</span>{label}</a>)}<small>작성 {completedSections}/4</small></nav>
      {(!editing.id || draft) && <NoticeDraft testMode={testMode} draft={draft} onDraft={applyDraft}/>}
      <form ref={formRef} noValidate onSubmit={submitEditor}>
        <fieldset disabled={saving} className="manager-fieldset">
          <section className="panel manager-section">
            <h3>신청 방식</h3>
            <div className="row wrap">{[['site', '사이트 접수'], ['external', '외부 링크 신청']].map(([value, label]) => <label key={value} className="manager-review"><input type="radio" name="manager-apply-mode" checked={applyMode(editing) === value} disabled={formLocked} onChange={() => change('applyMode', value)}/><span>{label}</span></label>)}</div>
            <p className="muted">{siteMode ? '학생이 이 사이트에서 신청서를 제출합니다. 원문 주소와 신청 경로는 선택입니다.' : '학생이 신청 경로 주소로 이동해 신청합니다.'}</p>
            {formLocked && <p className="muted">게시 후에는 신청 방식을 바꿀 수 없습니다.</p>}
          </section>
          <section id="manager-basics" className="panel manager-section">
            <h3>기본 정보와 신청 경로</h3>
            {editing.sourceReview && <div className="info-note"><div><p>원문 확인일 {editing.sourceReview.checkedAt}</p><p>{editing.sourceReview.scope}</p><p>확인할 일: {Array.isArray(editing.sourceReview.remainingChecks) ? editing.sourceReview.remainingChecks.join(' / ') : editing.sourceReview.remainingChecks}</p>{editing.sourceReview.attachmentUrls?.filter(safeUrl).map((url, index) => <a key={url} className="text-button" href={safeUrl(url)} target="_blank" rel="noreferrer">근거 자료 {index + 1}<ExternalLink size={14}/></a>)}</div></div>}
            <div className="manager-fields">
              <label className="manager-wide">공고 제목<input value={editing.title} maxLength={200} onChange={event => change('title', event.target.value)} required/>{evidenceNote('title')}</label>
              <label>분류<select value={editing.category} onChange={event => change('category', event.target.value)}>{['프로젝트', '진로', '장학', '교류', '기타'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label>담당 부서<input value={editing.department} maxLength={100} onChange={event => change('department', event.target.value)} required/>{evidenceNote('department')}</label>
              <label className="manager-wide">공고 요약<textarea value={editing.summary} maxLength={2000} onChange={event => change('summary', event.target.value)} required/>{evidenceNote('summary')}</label>
              <BlockEditor blocks={editing.blocks} noticeId={editing.id || insertId.current} testMode={testMode} suggestions={editorContext?.suggestions} onApply={applySuggestion} onChange={blocks => change('blocks', blocks)}/>
              <label className="manager-wide">공식 원문 주소<input type="url" placeholder="https://www.catholic.ac.kr/..." value={editing.sourceUrl} onChange={event => change('sourceUrl', event.target.value)} aria-describedby="manager-source-hint" required={!siteMode}/></label>
              <small id="manager-source-hint" className="manager-wide manager-field-hint">웹 원문이 없으면 학과 공지 주소를 넣으세요.</small>
              <label className="manager-wide">신청 경로 주소<input type="url" placeholder="https://... 또는 mailto:담당자 이메일" value={editing.applicationUrl} onChange={event => change('applicationUrl', event.target.value)}/><small>HTTPS 주소나 mailto:로 시작하는 접수 이메일을 입력하세요.</small></label>
              <label className="manager-wide">신청 방법 안내<textarea value={editing.applicationInstructions || ''} onChange={event => change('applicationInstructions', event.target.value)} placeholder="이메일 제목, 제출 방식, 마감 시간 등을 안내하세요."/>{evidenceNote('applicationInstructions')}</label>
              <label>신청 마감일<input type="date" value={editing.deadline} onChange={event => change('deadline', event.target.value)}/>{evidenceNote('deadline')}</label>
              <label className="manager-wide">마감 근거<textarea value={editing.deadlineEvidence} placeholder="원문의 마감 날짜와 시간을 옮겨 적으세요." onChange={event => change('deadlineEvidence', event.target.value)} required={!!editing.deadline}/></label>
            </div>
            {safeUrl(editing.sourceUrl) && <a className="text-button" href={safeUrl(editing.sourceUrl)} target="_blank" rel="noreferrer">원문과 대조하기<ExternalLink size={15}/></a>}
          </section>

          <section id="manager-rules" className="panel manager-section">
            <div className="section-heading"><h3>지원 조건</h3><button type="button" className="text-button" onClick={() => change('rules', [...editing.rules, newRule()])}><Plus size={16}/>조건 추가</button></div>
            <p className="muted">조건마다 비교 기준과 원문 근거를 입력하세요.</p>
            {draft?.evidence?.rules && <p className="muted">링크 초안의 모집 대상은 '직접 확인' 조건으로 넣었습니다. 필요하면 학생 정보와 비교 방식을 바꾸세요.</p>}
            {!editing.rules.length && <p className="manager-empty">등록된 조건이 없습니다. 조건 없이 게시하면 학생에게 '지원 조건 없음'으로 보입니다.</p>}
            {editing.rules.map((rule, index) => <div className="manager-repeat" key={index}>
              <div className="section-heading"><b>조건 {index + 1}</b><button type="button" className="icon-button" aria-label={`조건 ${index + 1} 삭제`} onClick={() => removeRow('rules', index)}><Trash2 size={16}/></button></div>
              <div className="manager-fields">
                <label>학생 정보<select value={rule.field} onChange={event => updateRow('rules', index, event.target.value === 'manual' ? {field: 'manual', op: 'eq', value: '확인'} : event.target.value === 'custom' ? {field: 'custom', op: 'eq', value: ''} : rule.field === 'custom' ? {field: event.target.value, value: ''} : {field: event.target.value})}>{Object.entries(fieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>비교 방식<select value={rule.op} disabled={rule.field === 'manual' || rule.field === 'custom'} onChange={event => updateRow('rules', index, {op: event.target.value, value: event.target.value === 'in' ? [] : ''})}><option value="eq">같음</option><option value="in">목록 중 하나</option><option value="min">이상</option></select></label>
                {rule.field === 'custom' ? <QualificationPicker value={rule.value} testMode={testMode} onPick={q => updateRow('rules', index, q ? {value: q.id, label: rule.label?.trim() ? rule.label : q.name} : {value: ''})}/>
                : <label>비교값<input type={rule.op === 'min' ? 'number' : 'text'} disabled={rule.field === 'manual'} step="any" value={Array.isArray(rule.value) ? rule.value.join(', ') : rule.value} placeholder={rule.op === 'in' ? '예: 2, 3, 4' : rule.field === 'status' ? '예: 재학' : '원문 조건의 값'} onChange={event => updateRow('rules', index, {value: rule.op === 'in' ? event.target.value.split(',').map(value => value.trim()) : rule.op === 'min' && event.target.value !== '' ? Number(event.target.value) : event.target.value})} required/>{(rule.field === 'manual' || rule.op === 'in' || rule.field === 'year') && <small>{rule.field === 'manual' ? '항상 확인 필요로 표시합니다.' : rule.op === 'in' ? '값을 쉼표로 구분하세요.' : '학년은 숫자만 입력하세요.'}</small>}</label>}
                <label>학생에게 표시할 조건<input value={rule.label} placeholder="예: 2학년 이상" maxLength={200} onChange={event => updateRow('rules', index, {label: event.target.value})} required/></label>
                <label className="manager-wide">조건 {index + 1} 원문 근거<textarea value={rule.evidence} onChange={event => updateRow('rules', index, {evidence: event.target.value})} required/></label>
              </div>
            </div>)}
            <div className="info-note">학생이 입력하지 않은 정보는 ‘확인 필요’로 표시합니다.</div>
          </section>

          <section id="manager-documents" className="panel manager-section">
            <h3>{siteMode ? '신청서 문항' : '제출 항목과 작성 문항'}</h3>
            {!siteMode && <div className="manager-fields"><label className="manager-wide">준비 체크리스트<textarea value={taskText} placeholder={'신청 양식 확인\n필수 서류 준비'} onChange={event => {setTaskText(event.target.value); change('tasks', event.target.value.split('\n').map(value => value.trim()).filter(Boolean));}}/><small>제출 항목을 한 줄에 하나씩 입력하세요.</small>{evidenceNote('tasks')}</label></div>}
            <QuestionEditor questions={editing.questions} locked={formLocked} onChange={questions => change('questions', questions)}/>
            {!siteMode && <p className="muted">학생이 직접 작성합니다. 담당자는 작성 내용을 볼 수 없습니다.</p>}
          </section>

          <WorkflowFields editing={editing} change={change} testMode={testMode} siteMode={siteMode}/>
          <section id="manager-review" className="panel manager-section">
            <h3>후속 절차와 검수</h3>
            <div className="manager-fields"><label className="manager-wide">신청 후 확인할 일<textarea value={editing.followup} placeholder="발표 일정, 추가 서류, 오리엔테이션 등을 안내하세요." onChange={event => change('followup', event.target.value)}/></label></div>
            <button type="button" className="button secondary" onClick={() => setPreviewing(true)}><Eye size={16}/>미리보기</button>
            <label className="manager-review"><input type="checkbox" checked={!!editing.reviewed} onChange={event => change('reviewed', event.target.checked)}/><span>{siteMode ? '미리보기로 본문과 신청서를 확인했습니다.' : '원문과 조건, 마감, 신청 경로를 대조했습니다.'}</span></label>
            <p className="muted">내용을 수정하면 검수 확인을 다시 받아야 합니다.</p>
            <div className="info-note">{siteMode ? '카카오 발송은 연결하지 않았습니다. 알림은 서비스 안에서 보냅니다.' : '공식 접수 미연동. 카카오 발송과 학교 시스템도 미연동입니다.'}</div>
          </section>
          <div className="manager-save-bar">
            {saving && <span className="loading-inline" role="status">저장 중</span>}
            {message && <div className="manager-save-feedback"><div className="success-note" role="status"><CheckCircle2 size={17}/>{message}</div><button type="button" className="text-button" onClick={goBack}>{returnLabel}<ArrowRight size={15}/></button>{editing.status === 'published' && <>{onStudentView && <button type="button" className="text-button" onClick={() => onStudentView(editing)}>학생 화면에서 보기<ArrowRight size={15}/></button>}{editorOrigin.current.view !== 'metrics' && <button type="button" className="text-button" onClick={() => showMetrics(editing)}>집계 보기<ArrowRight size={15}/></button>}</>}</div>}
            <button type="button" className="button secondary" onClick={() => persist('draft')}><Save size={16}/>{editing.status === 'published' ? '게시 내리고 임시저장' : '임시저장'}</button>
            {editing.id && editing.status === 'published' && <button type="button" className="button secondary" onClick={() => persist('archived')}>게시 종료</button>}
            {!editing.reviewed ? <p id="manager-publish-reason" className="manager-publish-reason" role="status">{reviewCleared ? '내용이 바뀌어 검수 확인이 풀렸습니다. 다시 체크하세요.' : '검수 확인을 체크하면 게시할 수 있습니다.'}</p> : invalidCount > 0 && <p id="manager-publish-reason" className="manager-publish-reason" role="alert">필수 칸 {invalidCount}개를 확인하세요.</p>}
            <button type="submit" className="button primary manager-publish-fab" disabled={!editing.reviewed} aria-describedby={!editing.reviewed || invalidCount ? 'manager-publish-reason' : undefined}><CheckCircle2 size={16}/>{editing.status === 'published' ? '수정 내용 게시' : '검수 후 게시'}</button>
          </div>
        </fieldset>
      </form>
      {previewing && <PreviewDialog notice={editorNotice(editing)} onClose={() => setPreviewing(false)}/>}
    </> : metricNotice || applicantNotice ? null : loading ? <p className="loading-state" role="status">담당 공고를 불러오는 중입니다.</p> : view === 'overview' ? null : <>
      <div ref={listTop} className="section-heading manager-list-heading"><h2>공고 목록 {!listError && <span className="count">{notices.length}</span>}</h2><div className="row wrap"><button className="button secondary" onClick={refresh} disabled={loading}><RefreshCw size={16}/>새로고침</button><button className="button primary" onClick={() => openEditor(emptyNotice())}><Plus size={16}/>공고 등록</button></div></div>
      {listError ? <div className="warning" role="alert">{listError}<button className="text-button" onClick={refresh}>다시 시도</button></div> : <>
      <div className='manager-list-filters'><label className='manager-search'>공고 검색<input placeholder='제목 또는 담당 부서' value={search} onChange={event => setSearch(event.target.value)}/></label><label>분류<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value='all'>전체 분류</option>{['프로젝트','진로','장학','교류','기타'].map(value => <option key={value}>{value}</option>)}</select></label><label>정렬<select value={sort} onChange={event => setSort(event.target.value)}><option value='deadline'>마감 가까운 순</option><option value='title'>제목순</option><option value='updated'>최근 수정순</option></select></label></div>
      <div className='tabs manager-status-tabs' aria-label='공고 상태'>{[['all','전체'],...Object.entries(statusLabels)].map(([value,label]) => <button key={value} className={statusFilter === value ? 'active' : ''} onClick={() => setStatusFilter(value)}>{label} <span>{notices.filter(notice => value === 'all' || notice.status === value).length}</span></button>)}</div>
      <p className='manager-result-count' role='status'>검색 결과 {filtered.length}건</p>
      </>}
      {templates.length > 0 && <details className='manager-template-details'><summary>실제 공고에서 검수 초안 가져오기</summary><section className="panel manager-template"><div><b>실제 공고 검수 초안</b><p className="muted">수집본에서 정리한 초안입니다. 최신 원문을 확인한 뒤 게시하세요.</p></div><div className="row wrap"><select aria-label="검수 초안 선택" value={templateIndex} onChange={event => setTemplateIndex(event.target.value)}><option value="">공고 선택</option>{templates.map((template, index) => <option key={template.id || index} value={index}>{template.title}</option>)}</select><button className="button secondary" disabled={templateIndex === ''} onClick={loadTemplate}>초안 불러오기<ArrowRight size={16}/></button></div></section></details>}
      {loading ? <p className="loading-state" role="status">담당 공고를 불러오는 중입니다.</p> : listError ? null : !filtered.length ? <div className="empty"><FileText size={32}/><h3>{notices.length ? '조건에 맞는 공고가 없습니다.' : '아직 등록한 공고가 없습니다.'}</h3><button className='button secondary' onClick={() => {setSearch(''); setCategoryFilter('all'); setStatusFilter('all');}}>필터 초기화</button></div> : <><div className="manager-list">{filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(notice => <article key={notice.id} data-notice-id={notice.id} className="panel manager-notice"><div><div className="row wrap"><span className={'tag manager-status-' + notice.status}>{statusLabels[notice.status]}</span><span className="muted tiny">{notice.department || '부서 미입력'}</span></div><h3>{notice.title || '제목 없는 공고'}</h3><p className="muted">마감 {notice.deadline ? listDate(notice.deadline) : '미입력'}</p><small className='muted'>{notice.category} / 조건 {notice.rules.length}개 / {applyMode(notice) === 'site' ? `문항 ${noticeQuestions(notice).length}개` : `준비 항목 ${notice.tasks.length}개`}</small></div><div className="row wrap">{applyMode(notice) === 'site' && <button className="button secondary" onClick={() => openApplicants(notice)}>신청자</button>}<button className="button secondary" onClick={() => openMetrics(notice)}>집계 보기</button><button className="button primary" onClick={() => openEditor(notice)}>공고 수정<ArrowRight size={16}/></button></div></article>)}</div>{pageCount > 1 && <nav className='manager-pages' aria-label='공고 목록 페이지'><button className='button secondary' disabled={currentPage === 1} onClick={() => goPage(currentPage - 1)}>이전</button>{managerPageItems(currentPage, pageCount).map((item, index) => item === 'gap' ? <span key={'gap' + index} aria-hidden='true'>…</span> : <button key={item} className={'button ' + (item === currentPage ? 'primary' : 'secondary')} aria-current={item === currentPage ? 'page' : undefined} onClick={() => goPage(item)}>{item}</button>)}<button className='button secondary' disabled={currentPage === pageCount} onClick={() => goPage(currentPage + 1)}>다음</button></nav>}</>}

    </>}
  </div>;
}

function NoticeMetrics({notice, period, testMode, onEdit}) {
  const [fromDate, setFromDate] = useState(() => period?.fromDate || monthAgo());
  const [toDate, setToDate] = useState(() => period?.toDate || today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [funnel, setFunnel] = useState(null);
  const [funnelError, setFunnelError] = useState('');
  const currentRequest = useRef(0);
  async function load() {
    if (!fromDate || !toDate || fromDate > toDate) {setError('시작일과 종료일을 확인하세요.'); setData(null); return;}
    if ((Date.parse(toDate) - Date.parse(fromDate)) / 86400000 > 366) {setError('집계 기간은 최대 367일입니다. 시작일이나 종료일을 바꿔 주세요.'); setData(null); return;}
    const request = ++currentRequest.current;
    setLoading(true); setError(''); setData(null); setFunnel(null); setFunnelError('');
    if (!testMode) getNoticeFunnel(notice.id, fromDate, toDate).then(result => {if (request === currentRequest.current) setFunnel(result);}, e => {if (request === currentRequest.current) setFunnelError(e.message);});
    try {const result = await getNoticeMetrics(notice.id, fromDate, toDate); if (request === currentRequest.current) setData(result);}
    catch (e) {if (request === currentRequest.current) setError(e.message || '집계를 불러오지 못했습니다. 다시 시도해 주세요.');}
    finally {if (request === currentRequest.current) setLoading(false);}
  }
  useEffect(() => {load(); return () => {currentRequest.current++;};}, [notice.id]);
  function changeDate(setter, value) {currentRequest.current++; setter(value); setData(null); setFunnel(null); setFunnelError(''); setLoading(false); setError('');}
  const site = applyMode(notice) === 'site';
  const labels = [['view', '상세 조회'], ['interest', '관심 등록'], ['start', '준비 시작'], ['complete', '학생이 표시한 제출 완료'], ['link', '신청 경로 이동']];
  return <section className="manager-metrics">
    <div className="page-heading"><div><div className="eyebrow">공고 집계</div><h1>{notice.title || '제목 없는 공고'}</h1></div><div className="row wrap"><span className="tag">{testMode ? '테스트 집계' : statusLabels[notice.status]}</span><button className="button primary" onClick={() => onEdit(notice, data ? {source: 'activity', fromDate: data.fromDate || fromDate, toDate: data.toDate || toDate} : null)}>공고 수정<ArrowRight size={16}/></button></div></div>
    <form className="manager-period" onSubmit={event => {event.preventDefault(); load();}}><label>집계 시작일<input type="date" value={fromDate} max={toDate} onChange={event => changeDate(setFromDate, event.target.value)} required/></label><label>집계 종료일<input type="date" value={toDate} min={fromDate} onChange={event => changeDate(setToDate, event.target.value)} required/></label><button className="button primary" disabled={loading}>집계 조회</button></form>
    {error && <div className="warning" role="alert">{error}</div>}
    {loading && <p className="loading-state" role="status">집계를 불러오는 중입니다.</p>}
    {data && <><div className="info-note"><div><p>집계 기간 {data.fromDate || fromDate} 00:00 ~ {data.toDate || toDate} 23:59:59 (한국 시간)</p><p>기준 인원: 이 기간에 공고를 상세 조회한 학생 {countText(data.denominator)}</p></div></div><NoticeFunnel notice={notice} funnel={funnel} error={funnelError} testMode={testMode} suggest={<NoticeSuggestions notice={notice} fromDate={data.fromDate || fromDate} toDate={data.toDate || toDate} onEdit={suggestions => onEdit(notice, {source: 'activity', fromDate: data.fromDate || fromDate, toDate: data.toDate || toDate, suggestions})}/>}/>{site && !testMode ? <section className="panel workflow-metrics"><h3>관심 등록</h3><div className="manager-counts"><div><span>관심 등록</span><strong>{countText(data.counts?.interest)}</strong><small>같은 학생은 한 번만 셉니다</small></div></div><p className="muted">관심 해제 후에도 발생 이력은 남습니다.</p></section> : <section className="panel"><h3>행동 단계별 인원</h3><div className="manager-counts">{labels.map(([key, label]) => <div key={key}><span>{label}</span><strong>{countText(data.counts?.[key])}</strong><small>{key === 'view' ? '기준 인원' : '같은 학생은 한 번만 셉니다'}</small></div>)}</div><p className="muted">1~4명은 비공개입니다. 단계별 인원은 서로 중복될 수 있습니다.</p><p className="muted">관심 해제와 제출 완료 표시 취소 후에도 발생 이력은 남습니다.</p></section>}</>}
    {data && !site && <ResponseReport reports={data.responses}/>}
    {data?.optionCounts?.length>0&&<section className="panel workflow-metrics"><h3>신청 항목별 행동</h3><p>같은 학생이 두 기수를 이용해도 공고 전체에서는 한 명입니다.</p><div className="table-scroll"><table><thead><tr><th>항목</th><th>조회</th><th>준비</th><th>경로 이동</th><th>제출 완료 표시</th></tr></thead><tbody>{data.optionCounts.map(option=><tr key={option.id}><th>{option.label}</th>{['view','start','link','complete'].map(key=><td key={key}>{countText(option.counts[key])}</td>)}</tr>)}</tbody></table></div></section>}
    {data?.followupCounts?.length>0&&<section className="panel workflow-metrics"><h3>학생이 표시한 현재 후속 절차</h3><p>현재 저장 상태입니다. 위 기간별 행동 이력과 별도로 집계합니다.</p><div className="manager-counts">{data.followupCounts.map(row=><div key={row.label}><span>{row.label}</span><strong>{countText(row.count)}</strong></div>)}</div><p>1~4명은 비공개입니다. 공식 결과와 연결하지 않았습니다.</p></section>}
    <div className="admin-notes">{applyMode(notice) !== 'site' && <><section className="panel"><h3>공식 접수 결과</h3><span className="tag">공식 접수 미연동</span><p>신청 경로 이동은 제출 완료가 아닙니다.</p><p>제출 완료는 학생이 직접 표시한 상태입니다.</p></section><section className="panel"><h3>학생 정보 보호</h3><p>학생 명단과 지원서 본문은 제공하지 않습니다.</p><p>학생의 학점과 거주 정보도 제공하지 않습니다.</p></section></>}<section className="panel"><h3>집계 해석</h3><p>숫자는 학생이 멈춘 위치를 보여 줍니다. 이유는 직접 확인해야 합니다.</p><p>학교 전체의 공식 신청 인원이 아닙니다.</p></section></div>
  </section>;
}
