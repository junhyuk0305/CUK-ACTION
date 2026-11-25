import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { aggregateOverview } from '../src/test-fixtures.js';
import { loginEmail } from '../src/login-id.js';

const db = new PGlite();
const root = new URL('../', import.meta.url);
await db.exec(await readFile(new URL('supabase/tests/bootstrap.sql', root), 'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611100001_initial.sql', root), 'utf8'));
await db.exec('create role service_role nologin');
await db.exec(await readFile(new URL('supabase/migrations/202611160001_guides.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611240001_id_auth.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611240002_manager_overview.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611240003_option_activity.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611240004_followup_activity.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611240005_open_notices.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611250001_public_notices.sql',root),'utf8'));
await db.exec(await readFile(new URL('supabase/migrations/202611250002_student_only_metrics.sql',root),'utf8'));
const ids = Object.fromEntries(['studentA','studentB','managerA','managerB','studentC','studentD','studentE','studentF'].map((name,i)=>[name,`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
for (const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email) values ($1,$2)', [id,loginEmail(name)]);
const protectedStudent='00000000-0000-4000-8000-000000000099';
await db.query(`insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,'{"protected":true}')`,[protectedStudent,loginEmail('judgestudent')]);
for (const id of [ids.managerA, ids.managerB]) await db.query('insert into public.manager_grants(user_id) values ($1)', [id]);
const state = name => ({profile:{name},saved:[],applications:{secret:{answers:{0:`${name} private draft`},checks:{0:true}}},read:[]});
const notice = {title:'RLS test notice',category:'프로젝트',department:'Test office',summary:'Verified test fixture',deadline:'2026-12-01',sourceUrl:'https://www.catholic.ac.kr/test',applicationUrl:'https://www.catholic.ac.kr/apply',deadlineEvidence:'Apply before December 1',reviewed:true,rules:[{field:'status',op:'eq',value:'재학',label:'재학생',evidence:'Students enrolled'}],tasks:['준비 항목'],questions:[{label:'지원 동기',hint:'직접 작성',max:1000}],followup:'결과 발표 확인'};
let passed = 0;
async function check(label, run) { await run(); passed++; console.log(`PASS ${label}`); }
async function asUser(id, run, role='authenticated') {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id||'']);
  try { return await run(); } finally { await db.exec('reset role'); }
}
async function denied(run) { await assert.rejects(run); }
async function addNotice(owner, payload=notice, status='draft') {
  return asUser(owner,async()=> (await db.query('insert into public.notices(data,status) values ($1,$2) returning id', [payload,status])).rows[0].id);
}

try {
  const target=email=>asUser(null,async()=>(await db.query('select public.password_reset_target($1) as id',[email])).rows[0].id,'service_role');
  await check('reset target: student allowed, ID case ignored',async()=>{
    assert.equal(await target(loginEmail('studentA')),ids.studentA);
    assert.equal(await target(loginEmail('studentA').toUpperCase()),ids.studentA);
  });
  await check('reset target: managers, protected and unknown IDs all return null',async()=>{
    assert.equal(await target(loginEmail('managerA')),null);
    assert.equal(await target(loginEmail('judgestudent')),null);
    assert.equal(await target(loginEmail('nobodyhere')),null);
  });
  await check('reset target: only service_role may execute',async()=>{
    for(const [id,role] of [[null,'anon'],[ids.studentA,'authenticated']])
      await asUser(id,()=>denied(()=>db.query('select public.password_reset_target($1)',[loginEmail('studentB')])),role);
  });
  await check('duplicate signup: IDs differing only in case map to one internal email and are rejected',async()=>{
    assert.equal(loginEmail(' StudentA '),loginEmail('studenta'));
    await denied(()=>db.query('insert into auth.users(id,email) values ($1,$2)',['00000000-0000-4000-8000-000000000098',loginEmail('STUDENTA')]));
  });
  await check('student saves own profile and draft',()=>asUser(ids.studentA,async()=>{
    await db.query('insert into public.student_state(data) values ($1)',[state('A')]);
    assert.equal((await db.query('select data from public.student_state')).rows[0].data.profile.name,'A');
  }));
  await asUser(ids.studentB,()=>db.query('insert into public.student_state(data) values ($1)',[state('B')]));
  await check('student A cannot read student B even without client filter',()=>asUser(ids.studentA,async()=>{
    const rows=(await db.query('select user_id,data from public.student_state')).rows;
    assert.equal(rows.length,1); assert.equal(rows[0].user_id,ids.studentA);
    assert.equal((await db.query('select data from public.student_state where user_id=$1',[ids.studentB])).rows.length,0);
  }));
  await check('student A cannot update, delete or forge student B data',()=>asUser(ids.studentA,async()=>{
    assert.equal((await db.query('update public.student_state set data=$1 where user_id=$2 returning user_id',[state('attacker'),ids.studentB])).rows.length,0);
    assert.equal((await db.query('delete from public.student_state where user_id=$1 returning user_id',[ids.studentB])).rows.length,0);
    await denied(()=>db.query('insert into public.student_state(user_id,data) values ($1,$2) on conflict(user_id) do update set data=excluded.data',[ids.studentB,state('attacker')]));
  }));
  await check('logout and new DB session identity restore only own data',async()=>{
    await asUser(null,()=>denied(()=>db.query('select * from public.student_state')),'anon');
    await asUser(ids.studentA,async()=>assert.equal((await db.query('select data from public.student_state')).rows[0].data.applications.secret.answers[0],'A private draft'));
  });
  await check('students cannot self-grant manager access',()=>asUser(ids.studentA,async()=>{
    assert.equal((await db.query('select * from public.manager_grants')).rows.length,0);
    await denied(()=>db.query('insert into public.manager_grants(user_id) values ($1)',[ids.studentA]));
    await denied(()=>db.query('update public.manager_grants set user_id=$1',[ids.studentA]));
  }));
  await check('student cannot create a notice',()=>denied(()=>addNotice(ids.studentA)));
  await check('manual review conditions and email application paths are supported',async()=>{
    const id=await addNotice(ids.managerB,{...notice,applicationUrl:'mailto:office@catholic.ac.kr',rules:[{field:'manual',op:'eq',value:'확인',label:'세부 대상 직접 확인',evidence:'학기별 세부 조건은 원문 확인'}]},'published');
    await asUser(ids.managerB,()=>db.query("update public.notices set status='archived' where id=$1",[id]));
  });
  const noticeA=await addNotice(ids.managerA), noticeB=await addNotice(ids.managerB);
  await check('guide: atomic owner claim, private edits, independent approved copy',async()=>{
    const write=(owner,mode,rows)=>db.query('select write_notice_guide($1,$2,$3,$4)',[owner,'277842',mode,JSON.stringify(rows)]);
    await asUser(ids.managerA,()=>db.query("update notices set data=jsonb_set(data,'{sourceUrl}',to_jsonb('https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842'::text)) where id=$1",[noticeA]));
    await denied(()=>write(ids.managerB,'draft',[]));
    await write(ids.managerA,'draft',['private']);
    await asUser(ids.managerA,()=>db.query('update notices set data=$1 where id=$2',[notice,noticeA]));
    await write(ids.managerA,'approve',['approved']);
    await denied(()=>write(ids.managerB,'approve',[]));
    for(const id of [ids.managerB,ids.studentA])await asUser(id,async()=>{
      assert.equal((await db.query('select * from guide_drafts')).rows.length,0);
      assert.deepEqual((await db.query('select rows from approved_guides')).rows[0].rows,['approved']);
      await denied(()=>write(ids.managerA,'approve',[]));
    });
  });
  await check('response reports: exact period, small cells, ownership and correction',async()=>{
    const insert=(a,b,c)=>db.query("insert into notice_responses values ($1,'verified','2026-11-01','2026-11-15',10,$2,$3,$4) on conflict(notice_id,source,starts,ends) do update set target=excluded.target,route=excluded.route,materials=excluded.materials",[noticeA,a,b,c]);
    const metrics=(end='2026-11-15')=>db.query("select response_metrics($1,'2026-11-01',$2) as reports",[noticeA,end]);
    await denied(()=>insert(-1,1,1));await denied(()=>insert(11,1,1));
    for(const small of [1,2,3,4]){
      await insert(small,small,small);await asUser(ids.managerA,async()=>assert.deepEqual((await metrics()).rows[0].reports[0].counts,{'대상':null,'신청 경로':null,'준비물':null}));
    }
    await db.query("update notice_responses set total=0,target=0,route=0,materials=0 where notice_id=$1",[noticeA]);
    await asUser(ids.managerA,async()=>assert.equal((await metrics()).rows[0].reports[0].zero,true));
    await db.query('update notice_responses set total=10 where notice_id=$1',[noticeA]);await insert(5,4,5);
    await asUser(ids.managerA,async()=>{
      assert.deepEqual((await metrics()).rows[0].reports,[{source:'verified',zero:false,counts:{'대상':5,'신청 경로':null,'준비물':5}}]);
      assert.deepEqual((await metrics('2026-11-14')).rows[0].reports,[]);
      await denied(()=>db.query('select * from notice_responses'));
    });
    for(const id of [ids.managerB,ids.studentA])await asUser(id,()=>denied(metrics));
  });
  await check('drafts hidden from students and unrelated managers',async()=>{
    await asUser(ids.studentA,async()=>assert.equal((await db.query('select * from public.notices')).rows.length,0));
    await asUser(ids.managerA,async()=>assert.deepEqual((await db.query('select id from public.notices')).rows.map(r=>r.id),[noticeA]));
  });
  await check('manager A cannot update B or transfer ownership',()=>asUser(ids.managerA,async()=>{
    assert.equal((await db.query('update public.notices set data=$1 where id=$2 returning id',[notice,noticeB])).rows.length,0);
    await denied(()=>db.query('update public.notices set owner_id=$1 where id=$2',[ids.managerB,noticeA]));
    await denied(()=>db.query('insert into public.notices(owner_id,data) values ($1,$2)',[ids.managerB,notice]));
  }));
  await check('server rejects unreviewed publication and missing evidence',()=>asUser(ids.managerA,async()=>{
    for(const data of [{...notice,reviewed:false},{...notice,reviewed:'true'},{...notice,deadlineEvidence:''},{...notice,rules:[{...notice.rules[0],evidence:''}]},{...notice,applicationUrl:'javascript:alert(1)'},{...notice,deadline:'2026-02-31'},{...notice,deadline:'',deadlineNote:'선착순',deadlineEvidence:''},{...notice,summary:''}]) {
      await denied(()=>db.query("update public.notices set status='published', data=$1 where id=$2",[data,noticeA]));
    }
  }));
  await check('server publishes notices without deadline, conditions, tasks or application link',()=>asUser(ids.managerA,async()=>{
    const open={...notice,deadline:'',deadlineEvidence:'',deadlineNote:'',applicationUrl:'',followup:'',rules:[],tasks:[],questions:[]};
    const firstCome={...open,deadlineNote:'선착순',deadlineEvidence:'선착순 모집'};
    for(const data of [open,firstCome]){const r=await db.query("insert into public.notices(data,status) values ($1,'published') returning id",[data]);assert.ok(r.rows[0].id);}
  }));
  await check('published schema rejects nontext fields and malformed nested values',()=>asUser(ids.managerA,async()=>{
    const malformed = [
      ...['title','department','summary','followup','deadlineEvidence','sourceUrl','applicationUrl','deadline','category','label','color','applicationInstructions'].map(field=>({...notice,[field]:{invalid:'object'}})),
      ...['rules','tasks','questions'].map(field=>({...notice,[field]:null})),
      {...notice,rules:[null]}, {...notice,rules:[{...notice.rules[0],value:null}]},
      {...notice,rules:[{...notice.rules[0],label:[]}]}, {...notice,rules:[{...notice.rules[0],evidence:{quote:'invalid'}}]},
      {...notice,rules:[{...notice.rules[0],op:'in',value:[null]}]},
      {...notice,rules:[{...notice.rules[0],op:'in',value:['   ']}]},
      {...notice,tasks:[{invalid:'object'}]}, {...notice,tasks:[null]},
      {...notice,questions:[null]}, {...notice,questions:[{label:{invalid:'object'},max:1000}]},
      {...notice,questions:[{label:'질문',max:'1000'}]}, {...notice,questions:[{label:'질문',max:1000,hint:[]}]},
      {...notice,sourceReview:{checkedAt:{invalid:'object'}}}, {...notice,sourceReview:{scope:[]}},
      {...notice,sourceReview:{remainingChecks:[{}]}}, {...notice,sourceReview:{attachmentUrls:'https://example.com'}},
    ];
    for (const data of malformed) await denied(()=>db.query("update public.notices set status='published',data=$1 where id=$2",[data,noticeA]));
  }));
  await check('manager publishes and student sees source and starts preparation',async()=>{
    await asUser(ids.managerA,()=>db.query("update public.notices set status='published' where id=$1",[noticeA]));
    await asUser(ids.studentA,async()=>{
      assert.equal((await db.query('select data from public.notices where id=$1',[noticeA])).rows[0].data.sourceUrl,notice.sourceUrl);
      await db.query("select public.record_activity($1,'start')",[noticeA]);
      const work={...state('A'),applications:{[noticeA]:{answers:{0:'Student authored'},checks:{0:true},completed:false}}};
      await db.query('update public.student_state set data=$1',[work]);
    });
  });
  await check('students cannot update published notice or call manager metrics',()=>asUser(ids.studentA,async()=>{
    assert.equal((await db.query('update public.notices set data=$1 where id=$2 returning id',[{...notice,title:'Forged'},noticeA])).rows.length,0);
    await denied(()=>db.query("select public.notice_metrics($1,'2026-11-01','2026-11-30')",[noticeA]));
  }));
  await check('managers cannot read student applications or raw behavior',()=>asUser(ids.managerA,async()=>{
    assert.equal((await db.query('select * from public.student_state')).rows.length,0);
    await denied(()=>db.query('select * from public.activity_events'));
  }));
  await check('manager A cannot aggregate manager B notice',()=>asUser(ids.managerA,()=>denied(()=>db.query("select public.notice_metrics($1,'2026-11-01','2026-11-30')",[noticeB]))));
  await check('events require authenticated identity and published notice',async()=>{
    await asUser(null,()=>denied(()=>db.query("select public.record_activity($1,'view')",[noticeA])),'anon');
    await asUser(ids.studentA,async()=>{
      await denied(()=>db.query("select public.record_activity($1,'view')",[noticeB]));
      await denied(()=>db.query("insert into public.activity_events(user_id,notice_id,type,created_at) values ($1,$2,'complete','2000-01-01')",[ids.studentB,noticeA]));
      await denied(()=>db.query("select public.record_activity($1,'official_complete')",[noticeA]));
    });
  });
  const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text as day")).rows[0].day;
  async function metrics(id=noticeA){return asUser(ids.managerA,async()=>(await db.query('select public.notice_metrics($1,$2::date,$2::date) as value',[id,today])).rows[0].value);}
  await check('small cohorts suppressed including denominator',async()=>{
    await asUser(ids.studentA,()=>db.query("select public.record_activity($1,'view')",[noticeA]));
    const m=await metrics(); assert.equal(m.counts.view,null);assert.equal(m.denominator,null);assert.equal(m.suppressed,true);
  });
  await check('unique people deduplicated and link never counts as completion',async()=>{
    for(const id of [ids.studentA,ids.studentB,ids.studentC,ids.studentD,ids.studentE]) await asUser(id,async()=>{
      await db.query("select public.record_activity($1,'view'),public.record_activity($1,'view'),public.record_activity($1,'link')",[noticeA]);
    });
    const m=await metrics(); assert.equal(m.counts.view,5);assert.equal(m.counts.link,5);assert.equal(m.counts.complete,0);assert.equal(m.denominator,5);
  });
  await check('self-report counts separately from official submission',async()=>{
    await asUser(ids.studentA,()=>db.query("select public.record_activity($1,'complete')",[noticeA]));
    const m=await metrics();assert.equal(m.counts.complete,null);assert.equal(m.counts.link,5);assert.equal(m.counts.official_complete,undefined);
  });
  await check('dates use inclusive Korean calendar days and exclude outside period',()=>asUser(ids.managerA,async()=>{
    const m=(await db.query("select public.notice_metrics($1,'2000-01-01','2000-01-01') as value",[noticeA])).rows[0].value;
    assert.equal(m.denominator,0);assert.equal(m.counts.link,0);
    await denied(()=>db.query("select public.notice_metrics($1,'2026-12-01','2026-11-01')",[noticeA]));
  }));
  // manager_overview: dedicated accounts so earlier and later checks stay independent.
  const ov=Object.fromEntries(['managerC','managerD','managerE',...Array.from({length:8},(_,i)=>'s'+(i+1))].map((name,i)=>[name,`00000000-0000-4000-9000-${String(i+1).padStart(12,'0')}`]));
  for (const id of Object.values(ov)) await db.query('insert into auth.users(id) values ($1)', [id]);
  for (const id of [ov.managerC, ov.managerD, ov.managerE]) await db.query('insert into public.manager_grants(user_id) values ($1)', [id]);
  const ovNotice={...notice,bundleId:'projects'};
  const n1=await addNotice(ov.managerC,{...ovNotice,title:'Overview one'},'published');
  const n2=await addNotice(ov.managerC,{...ovNotice,title:'Overview two',deadline:'2026-12-05'});
  const nOther=await addNotice(ov.managerE,{...ovNotice,title:'Other manager'},'published');
  const ovStudents=[1,2,3,4,5,6,7,8].map(i=>ov['s'+i]);
  const event=(user,noticeId,type,at)=>db.query('insert into public.activity_events(user_id,notice_id,type,created_at) values ($1,$2,$3,$4)',[user,noticeId,type,at]);
  for (const s of ovStudents.slice(0,6)) await event(s,n1,'view','2026-11-01T12:00:00+09:00');
  for (const s of ovStudents.slice(0,5)) await event(s,n1,'view','2026-11-01T13:00:00+09:00');
  for (const s of ovStudents.slice(0,5)) await event(s,n1,'interest','2026-11-02T23:59:59+09:00');
  for (const s of ovStudents.slice(0,5)) await event(s,n1,'start','2026-11-03T00:00:00+09:00');
  await event(ov.s7,n1,'complete','2026-11-01T09:00:00+09:00');
  for (const s of ovStudents.slice(0,4)) await event(s,n2,'view','2026-11-02T10:00:00+09:00');
  await event(ov.managerC,n2,'view','2026-11-02T10:00:00+09:00');
  await event(ov.managerC,n1,'link','2026-11-01T10:00:00+09:00');
  await event(ov.s8,n1,'view','2026-10-31T23:59:59+09:00');
  await event(ov.s8,n1,'view','2026-11-04T00:00:00+09:00');
  for (const s of ovStudents) await event(s,nOther,'view','2026-11-01T12:00:00+09:00');
  const overview=(user,from='2026-11-01',to='2026-11-03',role='authenticated')=>asUser(user,async()=>(await db.query('select public.manager_overview($1::date,$2::date) as value',[from,to])).rows[0].value,role);
  const deniedCode=(run,code)=>assert.rejects(run,e=>e.code===code);
  const zero={view:0,interest:0,start:0,complete:0,link:0};
  await check('manager overview: totals, daily trend and per-notice counts',async()=>{
    const m=await overview(ov.managerC);
    assert.equal(m.source,'activity');assert.equal(m.fromDate,'2026-11-01');assert.equal(m.toDate,'2026-11-03');
    assert.deepEqual(m.counts,{view:6,interest:5,start:5,complete:null,link:0});
    assert.equal(m.denominator,6);assert.equal(m.denominatorLabel,'기간 내 담당 공고를 상세 조회한 고유 학생 수');
    assert.equal(m.suppressionThreshold,5);assert.equal(m.noticeCount,2);assert.equal(m.suppressed,true);
    assert.deepEqual(m.trend,[
      {date:'2026-11-01',view:6,interest:0,start:0,complete:null,link:0},
      {date:'2026-11-02',view:null,interest:5,start:0,complete:0,link:0},
      {date:'2026-11-03',view:0,interest:0,start:5,complete:0,link:0},
    ]);
    assert.deepEqual(m.notices,[
      {id:n2,title:'Overview two',category:notice.category,status:'draft',deadline:'2026-12-05',bundleId:'projects',counts:{...zero,view:null}},
      {id:n1,title:'Overview one',category:notice.category,status:'published',deadline:notice.deadline,bundleId:'projects',counts:{view:6,interest:5,start:5,complete:null,link:0}},
    ]);
    const text=JSON.stringify(m);
    for (const id of [...ovStudents,ov.managerC,ov.managerE]) assert.ok(!text.includes(id),'overview must not expose user ids');
    await asUser(ov.managerC,()=>db.query("update public.notices set data=jsonb_set(data,'{title}','\"Overview one\"') where id=$1",[n1]));
    assert.deepEqual((await overview(ov.managerC)).notices.map(n=>n.id),[n1,n2],'notices follow latest update first');
  });
  await check('manager overview: other managers notices and own actions excluded',async()=>{
    const m=await overview(ov.managerC);
    assert.ok(!m.notices.some(n=>n.id===nOther));assert.equal(m.counts.view,6);
    assert.equal(m.counts.link,0);assert.equal(m.notices.find(n=>n.id===n2).counts.view,null);
    const other=await overview(ov.managerE);
    assert.deepEqual(other.notices.map(n=>n.id),[nOther]);assert.deepEqual(other.counts,{...zero,view:8});assert.equal(other.suppressed,false);
  });
  await check('manager overview: ovStudents get 42501 and anon cannot execute',async()=>{
    await deniedCode(()=>overview(ov.s1),'42501');
    await deniedCode(()=>overview(null,undefined,undefined,'anon'),'42501');
    await deniedCode(()=>overview(null),'42501');
  });
  await check('manager overview: 1-4 hidden, 0 stays 0, suppressed flag',async()=>{
    const small=await overview(ov.managerC,'2026-11-02','2026-11-02');
    assert.deepEqual(small.counts,{...zero,view:null,interest:5});assert.equal(small.suppressed,true);
    const empty=await overview(ov.managerC,'2026-10-01','2026-10-02');
    assert.deepEqual(empty.counts,zero);assert.equal(empty.denominator,0);assert.equal(empty.suppressed,false);
    assert.deepEqual(empty.trend.map(r=>r.date),['2026-10-01','2026-10-02']);
  });
  await check('manager overview: Korean midnight boundary regardless of session time zone',async()=>{
    await db.exec("set timezone to 'America/New_York'");
    try {
      const m=await overview(ov.managerC,'2026-11-02','2026-11-02');
      assert.equal(m.counts.interest,5);assert.equal(m.counts.start,0);
      assert.equal((await overview(ov.managerC,'2026-11-03','2026-11-03')).counts.start,5);
      const wide=await overview(ov.managerC,'2026-10-31','2026-11-04');
      assert.equal(wide.counts.view,7);assert.equal(wide.trend[0].view,null);assert.equal(wide.trend[4].view,null);
    } finally { await db.exec('reset timezone'); }
  });
  await check('manager overview: invalid periods rejected, 367 days allowed',async()=>{
    await denied(()=>overview(ov.managerC,'2026-11-03','2026-11-01'));
    await denied(()=>overview(ov.managerC,'2026-01-01','2027-01-03'));
    await denied(()=>overview(ov.managerC,null,'2026-11-01'));
    assert.equal((await overview(ov.managerC,'2026-01-01','2027-01-02')).trend.length,367);
  });
  await check('manager overview: manager without notices gets zero object',async()=>{
    const m=await overview(ov.managerD);
    assert.deepEqual(m.counts,zero);assert.equal(m.denominator,0);assert.deepEqual(m.notices,[]);
    assert.equal(m.noticeCount,0);assert.equal(m.trend.length,3);assert.equal(m.suppressed,false);
  });
  await check('manager overview: event types outside the five stages are ignored',async()=>{
    const typeCheck=(await db.query("select pg_get_constraintdef(oid) as def from pg_constraint where conname='activity_events_type_check'")).rows[0].def;
    await db.exec('alter table public.activity_events drop constraint activity_events_type_check');
    try {
      for (const s of ovStudents.slice(0,6)) await event(s,n1,'official_complete','2026-11-01T12:00:00+09:00');
      const m=await overview(ov.managerC);
      assert.deepEqual(m.counts,{view:6,interest:5,start:5,complete:null,link:0});
      assert.equal(m.counts.official_complete,undefined);assert.equal(m.trend[0].official_complete,undefined);
    } finally {
      await db.query("delete from public.activity_events where type='official_complete'");
      await db.exec(`alter table public.activity_events add constraint activity_events_type_check ${typeCheck}`);
    }
  });
  await check('manager overview matches the test-space aggregateOverview',async()=>{
    const notices=(await db.query('select id,status,owner_id,data from public.notices order by updated_at desc, id')).rows.map(r=>({...r.data,id:r.id,status:r.status,owner_id:r.owner_id}));
    const events=(await db.query('select notice_id,user_id,type,created_at from public.activity_events')).rows.map(e=>({...e,created_at:new Date(e.created_at).toISOString()}));
    for (const [from,to] of [['2026-11-01','2026-11-03'],['2026-10-31','2026-11-04'],['2026-11-02','2026-11-02']]) {
      const {suppressed,...fromDb}=await overview(ov.managerC,from,to);
      assert.equal(typeof suppressed,'boolean');
      assert.deepEqual(fromDb,aggregateOverview({notices,events,ownerId:ov.managerC,fromDate:from,toDate:to,source:'activity'}));
    }
  });
  await check('manager overview: revoking grant blocks immediately',async()=>{
    await overview(ov.managerE);
    await db.query('delete from public.manager_grants where user_id=$1',[ov.managerE]);
    await deniedCode(()=>overview(ov.managerE),'42501');
  });
  const students=[ids.studentA,ids.studentB,ids.studentC,ids.studentD,ids.studentE];
  const steps=[{id:'s1',label:'합격 확인',evidence:'발표 후 확인'},{id:'s2',label:'서류 제출',evidence:'합격자 제출',requires:'s1'}];
  const optionNotice={...notice,followupSteps:steps,options:[
    {id:'o1',label:'1기',deadline:'2026-12-01',deadlineEvidence:'1기 마감',applicationUrl:'https://www.catholic.ac.kr/apply/1'},
    {id:'o2',label:'2기',deadline:'2026-12-08',deadlineEvidence:'2기 마감',applicationUrl:'https://www.catholic.ac.kr/apply/2',followupSteps:[{id:'t1',label:'면접 확인',evidence:'2기 면접'}]}]};
  const optionId=await addNotice(ids.managerA,optionNotice,'published');
  const stepNotice=await addNotice(ids.managerA,{...notice,followupSteps:steps},'published');
  const record=(id,type,option)=>db.query('select public.record_activity($1,$2,$3)',[id,type,option]);
  const follow=(id,option,step,on)=>db.query('select public.record_followup($1,$2,$3,$4)',[id,option,step,on]);
  const metricsOf=(id,user=ids.managerA,day=today)=>asUser(user,async()=>(await db.query('select public.notice_metrics($1,$2::date,$2::date) as value',[id,day])).rows[0].value);
  await check('option activity: stored per option, unknown option rejected, two-argument call unchanged, raw table closed',async()=>{
    await asUser(ids.studentA,async()=>{
      await record(optionId,'view','o1');
      await db.query("select public.record_activity($1,'view')",[optionId]);
      await denied(()=>record(optionId,'view','missing'));
      await denied(()=>record(noticeA,'view','o1'));
      await denied(()=>record(optionId,'followup_on','o1'));
      await denied(()=>db.query('select * from public.activity_events'));
      await denied(()=>db.query("insert into public.activity_events(user_id,notice_id,type,option_id) values ($1,$2,'view','o1')",[ids.studentA,optionId]));
    });
    await asUser(null,()=>denied(()=>record(optionId,'view','o1')),'anon');
    const rows=(await db.query('select option_id,type,step_id from public.activity_events where notice_id=$1 order by id',[optionId])).rows;
    assert.deepEqual(rows,[{option_id:'o1',type:'view',step_id:null},{option_id:null,type:'view',step_id:null}]);
  });
  await check('option counts: per option unique students, small cells hidden, manager excluded',async()=>{
    for(const id of students)await asUser(id,()=>db.query("select public.record_activity($1,'start','o1'),public.record_activity($1,'start','o1'),public.record_activity($1,'link','o2')",[optionId]));
    await asUser(ids.studentB,()=>record(optionId,'complete','o2'));
    await asUser(ids.managerA,()=>db.query("select public.record_activity($1,'complete','o1')",[optionId]));
    const m=await metricsOf(optionId);
    assert.deepEqual(m.optionCounts,[{id:'o1',label:'1기',counts:{view:null,interest:0,start:5,complete:0,link:0}},{id:'o2',label:'2기',counts:{view:0,interest:0,start:0,complete:null,link:5}}]);
    assert.equal(m.counts.start,5);assert.equal(m.counts.view,null);assert.equal(m.counts.complete,null);
    assert.deepEqual((await metricsOf(noticeA)).optionCounts,[]);
    assert.deepEqual((await metricsOf(optionId,ids.managerA,'2000-01-01')).optionCounts.map(o=>o.counts.start),[0,0]);
  });
  await check('follow-up events: latest on/off per student counts, unknown step rejected, small cells hidden, manager excluded',async()=>{
    await asUser(ids.studentA,async()=>{
      await denied(()=>follow(stepNotice,null,'missing',true));
      await denied(()=>follow(stepNotice,'o1','s1',true));
      await denied(()=>follow(optionId,null,'s1',true));
      await denied(()=>follow(optionId,'o2','s1',true));
      await denied(()=>follow(stepNotice,null,'s1',null));
      await denied(()=>follow(noticeB,null,'s1',true));
      await denied(()=>db.query("insert into public.activity_events(user_id,notice_id,type,step_id) values ($1,$2,'followup_on','s1')",[ids.studentA,stepNotice]));
    });
    await asUser(null,()=>denied(()=>follow(stepNotice,null,'s1',true)),'anon');
    for(const id of students.slice(0,4))await asUser(id,()=>follow(stepNotice,null,'s1',true));
    assert.deepEqual((await metricsOf(stepNotice)).followupCounts,[{label:'합격 확인',count:null},{label:'서류 제출',count:0}]);
    await asUser(ids.managerA,()=>follow(stepNotice,null,'s1',true));
    assert.equal((await metricsOf(stepNotice)).followupCounts[0].count,null);
    await asUser(ids.studentE,async()=>{await follow(stepNotice,null,'s1',true);await follow(stepNotice,null,'s1',false);});
    assert.equal((await metricsOf(stepNotice)).followupCounts[0].count,null);
    await asUser(ids.studentE,async()=>{await follow(stepNotice,null,'s1',false);await follow(stepNotice,null,'s1',true);});
    assert.equal((await metricsOf(stepNotice)).followupCounts[0].count,5);
    // Current state is not limited by the selected period.
    assert.equal((await metricsOf(stepNotice,ids.managerA,'2000-01-01')).followupCounts[0].count,5);
    await asUser(ids.studentE,()=>follow(stepNotice,null,'s1',false));
    assert.equal((await metricsOf(stepNotice)).followupCounts[0].count,null);
    const m=await metricsOf(stepNotice);
    assert.deepEqual(Object.keys(m.counts).sort(),['complete','interest','link','start','view']);
    assert.deepEqual(Object.values(m.counts),[0,0,0,0,0]);
  });
  await check('extended metrics: other manager, student 42501 and anon blocked',async()=>{
    await denied(()=>metricsOf(optionId,ids.managerB));
    await asUser(ids.studentA,async()=>{
      await assert.rejects(()=>db.query('select public.notice_metrics($1,$2::date,$2::date)',[optionId,today]),e=>e.code==='42501');
      await assert.rejects(()=>db.query('select public.record_followup($1,null,$2,true)',[optionId,'s1']),e=>!!e);
    });
    await asUser(null,()=>denied(()=>db.query('select public.notice_metrics($1,$2::date,$2::date)',[optionId,today])),'anon');
  });
  await check('database option and follow-up counts match the offline calculation for the same activity',async()=>{
    const {setTestUser,saveNotice,saveStudentState,recordActivity,getNoticeMetrics}=await import('../src/gateway.js');
    const {applicationOptions,toggleFollowup,followupChanges}=await import('../src/workflow.js');
    const {createTestDatabase}=await import('../src/test-fixtures.js');
    const values=new Map([['cuk-action-test-v2',JSON.stringify(createTestDatabase(today))]]);
    globalThis.localStorage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
    const live=await addNotice(ids.managerB,optionNotice,'published');
    const offlineManager={id:'parity-manager',role:'manager'};
    try{
      setTestUser(offlineManager);
      const offline=await saveNotice({...optionNotice,status:'published'});
      const options=applicationOptions(offline);
      // Index 4 unchecks a prerequisite, which clears two steps in one action. The owner (last) is excluded on both sides.
      const people=[...students,ids.studentF,ids.managerB];
      const plan=[['s1','s2','t1'],['s1','s2','t1'],['s1','s2','t1'],['s1','s2','t1'],['s1','s2','t1'],['s1'],['s1','s2','t1']];
      for(const [i,uid] of people.entries()){
        const owner=i===people.length-1,offlineUser=owner?offlineManager:{id:uid,role:'student'};
        setTestUser(offlineUser);
        const apps={},changes=[];
        for(const n of options){
          let app={completed:true};
          const apply=(id,on)=>{const next={...app,followupChecks:toggleFollowup(n,app,id,on)};const c=followupChanges(n,app,next);changes.push(...c.map(x=>[n.optionId,x]));app=next;return c;};
          for(const step of n.followupSteps)if(plan[i].includes(step.id))apply(step.id,true);
          if(i===4&&n.optionId==='o1')assert.deepEqual(apply('s1',false),[{stepId:'s1',checked:false},{stepId:'s2',checked:false}]);
          apps[n.id]=app;
          await recordActivity(offline.id,'view',n.optionId);
        }
        await saveStudentState(offlineUser.id,{applications:apps});
        await asUser(uid,async()=>{
          for(const n of options)await record(live,'view',n.optionId);
          for(const [option,c] of changes)await follow(live,option,c.stepId,c.checked);
        });
      }
      setTestUser(offlineManager);
      const expected=await getNoticeMetrics(offline.id,today,today);
      const actual=await metricsOf(live,ids.managerB);
      assert.deepEqual(actual.optionCounts,expected.optionCounts);
      assert.deepEqual(actual.followupCounts,expected.followupCounts);
      assert.deepEqual(actual.followupCounts,[{label:'1기 / 합격 확인',count:5},{label:'1기 / 서류 제출',count:null},{label:'2기 / 면접 확인',count:5}]);
      assert.deepEqual(actual.optionCounts.map(o=>o.counts.view),[6,6]);
    }finally{setTestUser(null);delete globalThis.localStorage;}
  });
  await check('revoking grant blocks existing manager account immediately',async()=>{
    await db.query('delete from public.manager_grants where user_id=$1',[ids.managerA]);
    await asUser(ids.managerA,async()=>{
      assert.equal((await db.query("update public.notices set status='archived' where id=$1 returning id",[noticeA])).rows.length,0);
      await denied(()=>db.query('select public.notice_metrics($1,$2::date,$2::date)',[noticeA,today]));
      await denied(()=>db.query('select public.notice_metrics($1,$2::date,$2::date)',[optionId,today]));
      await denied(()=>db.query('select public.notice_metrics($1,$2::date,$2::date)',[stepNotice,today]));
    });
  });
  await check('invalid private state rejected with real DB failure',()=>asUser(ids.studentA,()=>denied(()=>db.query('update public.student_state set data=$1',[{...state('A'),events:[]}]))));
  await check('stale device save: version-checked update hits 0 rows and keeps the first device save',()=>asUser(ids.studentA,async()=>{
    // Versions travel as text, as PostgREST sends them; a JS Date would drop microseconds.
    const read=async()=>(await db.query('select data,updated_at::text as v from public.student_state')).rows[0];
    const save=async(name,v)=>(await db.query('update public.student_state set data=$1 where user_id=$2 and updated_at=$3 returning updated_at::text as v',[state(name),ids.studentA,v])).rows;
    const phone=await read(),pc=await read();
    assert.equal(phone.v,pc.v);
    const first=await save('phone',phone.v);
    assert.equal(first.length,1); assert.notEqual(first[0].v,phone.v);
    assert.equal((await save('stale pc',pc.v)).length,0);
    assert.deepEqual((await read()).data,state('phone'));
    const second=await save('phone again',first[0].v);
    assert.equal(second.length,1); assert.notEqual(second[0].v,first[0].v);
    await assert.rejects(()=>db.query('insert into public.student_state(data) values ($1)',[state('late first save')]),e=>e.code==='23505');
  }));
  await check('visitors read only published notice id and data',async()=>{
    const insert=async(title,status)=>(await db.query('insert into public.notices(owner_id,data,status) values ($1,$2,$3) returning id',[ids.managerB,{...notice,title},status])).rows[0].id;
    const draft=await insert('anon draft','draft'), published=await insert('anon published','published');
    const rows=(await asUser(null,()=>db.query('select id,data from public.notices'),'anon')).rows;
    assert.ok(rows.some(r=>r.id===published)); assert.ok(!rows.some(r=>r.id===draft));
    await asUser(null,()=>denied(()=>db.query('select owner_id from public.notices')),'anon');
    await asUser(null,()=>denied(()=>db.query("update public.notices set status='draft' where id=$1",[published])),'anon');
  });
  console.log(`\n${passed} database checks passed against PostgreSQL RLS in PGlite. Supabase Auth delivery/network are not exercised.`);
} finally { await db.close(); }
await import('../supabase/tests/student-only-metrics.mjs');
await import('../supabase/tests/notice-save.test.mjs');
