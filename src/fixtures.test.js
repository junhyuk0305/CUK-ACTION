import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateOverview,createScenarioEvents,createTestDatabase,createTestNotices,migrateTestDatabase,testNoticeBundles} from './test-fixtures.js';
import {getManagerOverview,getNoticeMetrics,setTestUser,testAccounts} from './gateway.js';

const anchor='2026-11-10';
const range={fromDate:'2026-10-12',toDate:anchor};

test('12 synthetic notices cover four bundles and two manager scopes',()=>{
 const notices=createTestNotices(anchor);
 assert.equal(notices.length,12);assert.equal(new Set(notices.map(n=>n.id)).size,12);
 assert.equal(notices.filter(n=>n.owner_id==='test-manager-a').length,8);
 assert.equal(notices.filter(n=>n.owner_id==='test-manager-b').length,4);
 assert.equal(notices.filter(n=>n.status==='published').length,8);
 assert.equal(notices.filter(n=>n.status==='draft').length,2);
 assert.equal(notices.filter(n=>n.status==='archived').length,2);
 for(const bundle of testNoticeBundles)assert.equal(notices.filter(n=>n.bundleId===bundle.id).length,3);
 assert.equal(notices[0].title,'[테스트] 학생 프로젝트 모집');
 assert.equal(notices[1].title,'[테스트] 캠퍼스 아이디어 공모');
 for(const n of notices){assert.ok(n.title.startsWith('[테스트]'));assert.ok(n.rules.length);assert.ok(n.tasks.length);assert.ok(n.applicationUrl.startsWith('https://example.org/'));}
});

test('migration preserves authored notices, student drafts and actual events',()=>{
 const old={students:{a:{applications:{private:{answers:{0:'private draft'}}}}},events:[{notice_id:'custom',user_id:'a',type:'view'}],notices:[{...createTestNotices(anchor)[0],title:'학생이 바꾼 제목',deadline:'2027-01-01',bundleId:undefined},{id:'custom',title:'직접 등록한 공고'}]};
 const before=structuredClone(old),{db,changed}=migrateTestDatabase(old,anchor);
 assert.equal(changed,true);assert.deepEqual(old,before);
 assert.deepEqual(db.students,old.students);assert.deepEqual(db.events,old.events);
 assert.equal(db.notices.find(n=>n.id===old.notices[0].id).title,'학생이 바꾼 제목');
 assert.equal(db.notices.find(n=>n.id===old.notices[0].id).deadline,'2027-01-01');
 assert.deepEqual(db.notices.find(n=>n.id==='custom'),old.notices[1]);
 assert.equal(db.notices.length,13);
 assert.equal(migrateTestDatabase(db,'2026-12-01').changed,false);
});

test('overview deduplicates users across notices and separates links from reports',()=>{
 const notices=createTestNotices(anchor),owned=notices.filter(n=>n.owner_id==='test-manager-a');
 const events=[];
 for(let i=0;i<5;i++)for(const n of owned.slice(0,2))for(const type of ['view','view','link'])events.push({notice_id:n.id,user_id:'student-'+i,type,created_at:'2026-11-10T09:00:00+09:00'});
 events.push({notice_id:owned[0].id,user_id:'test-manager-a',type:'view',created_at:'2026-11-10T09:00:00+09:00'});
 const m=aggregateOverview({notices,events,ownerId:'test-manager-a',...range,source:'activity'});
 assert.equal(m.counts.view,5);assert.equal(m.counts.link,5);assert.equal(m.counts.complete,0);
 assert.equal(m.denominator,5);assert.equal(m.notices.length,8);
 assert.equal(m.notices[0].counts.view,5);assert.equal(m.notices[1].counts.view,5);
 assert.equal(m.trend.at(-1).view,5);
});

test('small cohorts are suppressed globally, per day and per notice',()=>{
 const notices=createTestNotices(anchor),events=[{notice_id:notices[0].id,user_id:'one',type:'complete',created_at:'2026-11-10T09:00:00+09:00'}];
 const m=aggregateOverview({notices,events,ownerId:'test-manager-a',...range,source:'activity'});
 assert.equal(m.counts.complete,null);assert.equal(m.notices[0].counts.complete,null);assert.equal(m.trend.at(-1).complete,null);assert.equal(m.counts.view,0);
});

test('period respects Korean calendar days and rejects malformed dates',()=>{
 const notices=createTestNotices(anchor),events=Array.from({length:5},(_,i)=>({notice_id:notices[0].id,user_id:'s'+i,type:'view',created_at:'2026-11-09T15:00:00Z'}));
 const args={notices,events,ownerId:'test-manager-a',source:'activity'};
 assert.equal(aggregateOverview({...args,fromDate:anchor,toDate:anchor}).counts.view,5);
 assert.equal(aggregateOverview({...args,fromDate:'2026-11-09',toDate:'2026-11-09'}).counts.view,0);
 for(const fromDate of ['2026-02-31','2026-11-11','invalid'])assert.throws(()=>aggregateOverview({...args,fromDate,toDate:anchor}));
});

test('sample events are deterministic, scoped and never added to activity storage',async()=>{
 const data=createTestDatabase(anchor),values=new Map([['cuk-action-test-v2',JSON.stringify(data)]]);
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 setTestUser(testAccounts.find(u=>u.id==='test-manager-a'));
 assert.deepEqual(createScenarioEvents(anchor),createScenarioEvents(anchor));
 const sample=await getManagerOverview({...range,source:'sample'}),activity=await getManagerOverview({...range,source:'activity'});
 assert.ok(sample.counts.view>=5);assert.ok(sample.counts.start>=5);assert.ok(sample.counts.complete>=5);
 assert.equal(activity.counts.view,0);assert.equal(activity.counts.start,0);assert.equal(activity.counts.complete,0);
 assert.equal(JSON.parse(values.get('cuk-action-test-v2')).events.length,0);
 assert.equal(sample.noticeCount,8);assert.equal(sample.source,'sample');
 const individual=await getNoticeMetrics(data.notices[0].id,range.fromDate,range.toDate);
 assert.equal(individual.counts.view,0);
 setTestUser(testAccounts.find(u=>u.id==='test-student-a'));
 await assert.rejects(()=>getManagerOverview({...range,source:'sample'}),/담당자 권한/);
 setTestUser(null);
 await assert.rejects(()=>getManagerOverview({...range,source:'sample'}),/연결되지/);
 delete globalThis.localStorage;
});
