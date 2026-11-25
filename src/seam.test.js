// S1 seam checks for the test space: LG-04 manager exclusion, QE-05 and QE-07 notice saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateOverview,createTestDatabase,createTestNotices} from './test-fixtures.js';
import {getManagerOverview,getNoticeMetrics,saveNotice,setTestUser,testAccounts} from './gateway.js';

const anchor='2026-11-10';
const range={fromDate:'2026-10-12',toDate:anchor};
const at='2026-11-10T09:00:00+09:00';
const account=id=>testAccounts.find(u=>u.id===id);
function withDB(db,run){
 const values=new Map([['cuk-action-test-v2',JSON.stringify(db)]]);
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 return Promise.resolve().then(()=>run(()=>JSON.parse(values.get('cuk-action-test-v2')))).finally(()=>{setTestUser(null);delete globalThis.localStorage;});
}

test('LG-04: overview leaves out other manager accounts as well as the owner',()=>{
 const notices=createTestNotices(anchor),notice=notices.find(n=>n.owner_id==='test-manager-a');
 const events=['s1','s2','s3','s4','s5','test-manager-b'].map(user_id=>({notice_id:notice.id,user_id,type:'view',created_at:at}));
 const m=aggregateOverview({notices,events,ownerId:'test-manager-a',managerIds:['test-manager-a','test-manager-b'],...range,source:'activity'});
 assert.equal(m.counts.view,5);
});

test('LG-04: test space metrics count students only, like migration 202611250002',()=>{
 const db=createTestDatabase(anchor),notice=db.notices.find(n=>n.owner_id==='test-manager-a'&&n.status==='published');
 db.events=['s1','s2','s3','s4','s5','test-manager-b'].map(user_id=>({notice_id:notice.id,user_id,type:'view',created_at:new Date().toISOString()}));
 return withDB(db,async()=>{
  setTestUser(account('test-manager-a'));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
  assert.equal((await getNoticeMetrics(notice.id,today,today)).counts.view,5);
  assert.equal((await getManagerOverview({fromDate:today,toDate:today,source:'activity'})).counts.view,5);
 });
});

test('QE-05: a new test-space notice uses the editor id, and a retry updates the same row',()=>withDB(createTestDatabase(anchor),async read=>{
 setTestUser(account('test-manager-a'));
 const insertId=crypto.randomUUID(),draft={title:'재시도 공고',status:'draft',rules:[],tasks:[],questions:[],insertId};
 const first=await saveNotice(draft);
 assert.equal(first.id,insertId);
 assert.equal('insertId' in first,false);
 await saveNotice({...draft,title:'재시도 공고 2'});
 const rows=read().notices.filter(n=>n.id===insertId);
 assert.equal(rows.length,1);
 assert.equal(rows[0].title,'재시도 공고 2');
 assert.equal('insertId' in rows[0],false);
}));

test('QE-07: a test-space save over an older version is rejected as a conflict',()=>withDB(createTestDatabase(anchor),async read=>{
 setTestUser(account('test-manager-a'));
 const opened=read().notices.find(n=>n.owner_id==='test-manager-a'&&n.status==='draft');
 const saved=await saveNotice({...opened,title:'다른 탭 저장'});
 await assert.rejects(()=>saveNotice({...opened,title:'이 탭 저장'}),e=>e.code==='conflict');
 assert.equal(read().notices.find(n=>n.id===opened.id).title,'다른 탭 저장');
 const again=await saveNotice({...opened,title:'최신 위에 저장',updated_at:saved.updated_at});
 assert.equal(again.title,'최신 위에 저장');
}));
