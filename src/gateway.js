import {sourceRows,reviewRows,approvedRows,privateRows} from './guide.js';
import {archiveAiInput} from './archive.js';
import * as live from './backend.js';
import {DEMO} from './demo.js';
import {addDays,aggregateOverview,createScenarioEvents,createTestDatabase,migrateTestDatabase} from './test-fixtures.js';
import {applicationOptions,followupProgress,validateWorkflow} from './workflow.js';

export const testAccounts=[
 {id:'test-student-a',name:'학생 A',role:'student'},
 {id:'test-student-b',name:'학생 B',role:'student'},
 {id:'test-manager-a',name:'담당자 A',role:'manager'},
 {id:'test-manager-b',name:'담당자 B',role:'manager'},
];
const managerIds=testAccounts.filter(u=>u.role==='manager').map(u=>u.id);
const KEY='cuk-action-test-v2';
let testUser=null;
export function setTestUser(user){testUser=user;}
export function getTestUser(){return DEMO?testUser:null;}
function readDB(){const raw=localStorage.getItem(KEY);if(!raw)return createTestDatabase();const result=migrateTestDatabase(JSON.parse(raw));if(result.changed)writeDB(result.db);return result.db;}
function writeDB(db){try{localStorage.setItem(KEY,JSON.stringify(db));}catch{throw Error('테스트 데이터를 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.');}}
function current(){if(!DEMO||!testUser)throw Error('로그인이 필요합니다.');return testUser;}
function manager(){const u=current();if(u.role!=='manager')throw Error('담당자 권한이 없습니다.');return u;}
function ownNotice(db,id){const u=manager();const n=db.notices.find(n=>n.id===id&&n.owner_id===u.id);if(!n)throw Error('관리할 수 없는 공고입니다.');return n;}
export async function loadStudentState(id){if(!DEMO||!testUser)return live.loadStudentState(id);if(current().id!==id)throw Error('본인 데이터만 열 수 있습니다.');const db=readDB(),data=db.students[id];return data?{data,version:String(db.studentVersions?.[id]||0)}:null;}
export async function saveStudentState(id,data,version=null){if(!DEMO||!testUser)return live.saveStudentState(id,data,version);if(current().id!==id)throw Error('본인 데이터만 저장할 수 있습니다.');const db=readDB(),now=db.students[id]?String(db.studentVersions?.[id]||0):null;if(now!==version)throw live.conflictError();const next=String(Number(now)+1);db.students[id]=data;db.studentVersions={...db.studentVersions,[id]:next};writeDB(db);return next;}
export async function isManager(id){if(!DEMO||!testUser)return live.isManager(id);return current().id===id&&testUser.role==='manager';}
export async function listPublishedNotices(){return DEMO&&testUser?readDB().notices.filter(n=>n.status==='published'):live.listPublishedNotices();}
export async function listManagedNotices(){if(!DEMO||!testUser)return live.listManagedNotices();return readDB().notices.filter(n=>n.owner_id===manager().id);}
export async function saveNotice(value){
 if(!DEMO||!testUser){if(value.status==='published')validateWorkflow(value);return live.saveNotice(value);}
 const u=manager(),db=readDB(),{insertId,...notice}=value;
 // Same rules as backend.js: a new notice keeps the id chosen in the editor, and an existing one saves only over the version it was opened from.
 const id=value.id||insertId,stored=id&&db.notices.find(n=>n.id===id);
 if(value.id||stored)ownNotice(db,id);
 if(value.id&&stored.updated_at!==value.updated_at)throw live.conflictError();
 if(value.status==='published'){
  validateWorkflow(value);
  const textFields=['title','department','summary'];
  const sourceOk=/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(value.sourceUrl||'');
  const applicationOk=!value.applicationUrl||/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(value.applicationUrl)||/^mailto:[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.applicationUrl);
  const evidenceOk=!(value.deadline||value.deadlineNote)||!!value.deadlineEvidence?.trim();
  if(value.reviewed!==true||textFields.some(k=>typeof value[k]!=='string'||!value[k].trim())||!sourceOk||!applicationOk||!evidenceOk||(value.rules||[]).some(r=>!r.label?.trim()||!r.evidence?.trim()))throw Error('게시하려면 기본 정보, 신청 경로, 조건과 마감 근거를 검수하세요.');
  if(value.questions?.some(q=>!q.label?.trim()||!Number.isInteger(q.max)||q.max<1||q.max>10000))throw Error('문항명과 1~10000자 범위의 글자 수를 확인하세요.');
 }
 const next={...notice,id:id||crypto.randomUUID(),owner_id:u.id,dataKind:'test',updated_at:new Date().toISOString()};
 db.notices=stored?db.notices.map(n=>n.id===id?next:n):[next,...db.notices];writeDB(db);return next;
}
export async function recordActivity(noticeId,type,optionId,stepId){
 if(!DEMO||!testUser)return live.recordActivity(noticeId,type,optionId,stepId);
 const u=current(),db=readDB();if(!db.notices.some(n=>n.id===noticeId&&n.status==='published'))throw Error('게시된 공고가 아닙니다.');
 if(!['view','interest','start','complete','link'].includes(type))throw Error('알 수 없는 활동입니다.');
 if(optionId&&!db.notices.find(n=>n.id===noticeId).options?.some(o=>o.id===optionId))throw Error('신청 항목이 변경됐습니다. 공고를 다시 확인하세요.');
 db.events.push({user_id:u.id,notice_id:noticeId,option_id:optionId,type,created_at:new Date().toISOString()});writeDB(db);
}
export async function getNoticeMetrics(id,fromDate,toDate){
 if(!DEMO||!testUser)return live.getNoticeMetrics(id,fromDate,toDate);
 const db=readDB();ownNotice(db,id);
 const {counts}=aggregateOverview({notices:db.notices.filter(n=>n.id===id),events:db.events,ownerId:testUser.id,managerIds,fromDate,toDate,source:'activity'});
 const notice=db.notices.find(n=>n.id===id);
 const optionCounts=(notice.options||[]).map(option=>({id:option.id,label:option.label,counts:aggregateOverview({notices:[notice],events:db.events.filter(e=>e.option_id===option.id),ownerId:testUser.id,managerIds,fromDate,toDate,source:'activity'}).counts}));
 const suppress=count=>count>0&&count<5?null:count;
 const subjects=notice.options?.length?applicationOptions(notice):[notice];
 const followupCounts=subjects.flatMap(n=>(n.followupSteps||[]).map(step=>({label:(n.optionId?n.label+' / ':'')+step.label,count:suppress(Object.entries(db.students).filter(([studentId])=>studentId!==testUser.id&&!managerIds.includes(studentId)).map(([,student])=>student).filter(student=>followupProgress(n,student.applications?.[n.id]).rows.find(r=>r.id===step.id)?.checked).length)})));
 const responses=id==='00000000-0000-4000-8000-000000000001'&&toDate===db.fixtureAnchorDate&&fromDate===addDays(toDate,-30)?[{source:'가상 응답',zero:false,counts:{'대상':5,'신청 경로':null,'준비물':5}}]:[];
 return {noticeId:id,fromDate,toDate,counts,responses,optionCounts,followupCounts,denominator:counts.view,denominatorLabel:'선택 기간에 해당 공고를 상세 조회한 고유 학생 수',suppressionThreshold:5};
}
export async function getManagerOverview({fromDate,toDate,source='activity'}){
 if(!DEMO||!testUser)return live.getManagerOverview(fromDate,toDate);
 const owner=manager(),db=readDB();
 const events=source==='sample'?createScenarioEvents(db.fixtureAnchorDate):db.events;
 return {...aggregateOverview({notices:db.notices,events,ownerId:owner.id,managerIds,fromDate,toDate,source}),scenarioDate:db.fixtureAnchorDate};
}

function verifyGuideOwner(db,id){
 const u=manager();
 if(db.notices.some(n=>n.sourceUrl?.match(/[?&]articleNo=(\d+)(?:&|$)/)?.[1]===id&&n.owner_id!==u.id)||db.guides?.[id]&&db.guides[id].owner!==u.id)throw Error('관리할 수 없는 공고입니다.');
 return u.id;
}
export async function readGuide(id,publicOnly=false){
 if(DEMO&&!publicOnly&&testUser)return readDB().guides?.[id]?.approved??null;
 if(!live.supabase)return null;
 const {data,error}=await live.supabase.from('approved_guides').select('rows').eq('official_id',id).maybeSingle();
 if(error)throw Error('최신 안내를 불러오지 못했습니다.');
 return data?.rows??null;
}
export async function readGuideDraft(id){
 if(DEMO&&testUser){const db=readDB();verifyGuideOwner(db,id);return db.guides?.[id]?.draft||[];}
 const {data,error}=await live.supabase.from('guide_drafts').select('rows').eq('official_id',id).maybeSingle();
 if(error)throw Error('초안을 읽지 못했습니다.');return data?.rows||[];
}
export async function guideAction(action,id,rows){
 const text=archiveAiInput(id);if(!text)throw Error('검수 발췌가 없습니다.');
 if(DEMO&&testUser){
  const db=readDB(),owner=verifyGuideOwner(db,id);
  db.guides??={};const guide=db.guides[id]??={owner};
  if(action==='extract')throw Error('테스트 공간에서는 모델 키를 사용하지 않습니다. 테스트 초안을 불러오세요.');
  if(action==='sample')return reviewRows(sourceRows(text),text);
  if(action==='approve')guide.approved=approvedRows(rows,text);
  else if(action==='draft')guide.draft=privateRows(rows,text);
  else throw Error('잘못된 요청입니다.');
  writeDB(db);return;
 }
 const {data,error}=await live.supabase.functions.invoke('notice-guide',{body:{action,id,...(rows?{rows}:{})}});
 if(error){let message;try{message=(await error.context.json()).error;}catch{}throw Error(message||'AI 검수 서버에 연결하지 못했습니다. 다시 시도하세요.');}
 return data.rows;
}
