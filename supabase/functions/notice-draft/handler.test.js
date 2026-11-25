import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDraft, mask, noticeUrl, pageText, rosterLike} from './handler.js';

const URL1='https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842';
const html=`<html><head><title>사이트</title><meta property="og:title" content="2026 겨울 캡스톤 참가자 모집 &amp; 안내"><style>.x{color:red}</style><script>var phone='010-1111-2222';</script></head><body>
<nav>메뉴 홈 학사</nav>
<div class="b-content-box"><div class="fr-view">
<p>1. 모집대상: 본교 3~4학년 재학생</p>
<p>2. 모집마감: 2026. 12. 14.(월) 18:00</p>
<p>3. 신청방법: 신청서를 이메일로 제출</p>
<p>4. 제출서류: 신청서, 성적증명서</p>
<p>캡스톤 과제를 기업과 함께 수행합니다.</p>
<p>문의: 학생지원팀 홍길동 02-2164-4000, staff@catholic.ac.kr</p>
<p>참고 학번 202312345 학생 예시</p>
<img src="/_attach/image/a.png" alt="일정표 010-3333-4444">
<a href="/ko/campuslife/notice.do?mode=download&articleNo=277842&attachNo=1">명단_홍길동.xlsx</a>
</div></div>
<footer>주소 서울</footer></body></html>`;
const roster=html.replace('<p>캡스톤 과제를 기업과 함께 수행합니다.</p>','<table><tr><td>1</td><td>김철수</td><td>202311111</td></tr><tr><td>2</td><td>이영희</td><td>202322222</td></tr><tr><td>3</td><td>박민수</td><td>202333333</td></tr></table>');
const answer=fields=>async()=>Response.json({candidates:[{content:{parts:[{thought:true,text:'thinking'},{text:JSON.stringify({fields})}]}}]});

function invoke({user={id:'staff'},grant=true,key='test',url=URL1,page,model,rows=[]}={}){
 const calls={page:[],model:[]};
 const db={auth:{getUser:async()=>({data:{user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:grant?{user_id:'staff'}:null})})})})};
 const fetchPage=async href=>{calls.page.push(href);return page?page(href):new Response(html,{status:200});};
 const fetchModel=async(href,options)=>{calls.model.push(JSON.parse(options.body));return (model||answer([]))();};
 const req=new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer jwt'},body:JSON.stringify({url})});
 return handleDraft(req,{db,env:name=>name==='GEMINI_API_KEY'?key:'',fetchModel,fetchPage,published:async no=>{assert.equal(no,'277842');return rows;}}).then(async response=>({status:response.status,body:await response.json(),calls}));
}

test('fills fields by rules first, sends only masked text to the model and keeps AI fields with quoted evidence',async()=>{
 const {status,body,calls}=await invoke({model:answer([
  {name:'summary',value:'3~4학년 재학생이 12월 14일까지 신청하는 캡스톤입니다.',evidence:'캡스톤 과제를 기업과 함께 수행합니다.'},
  {name:'summary',value:'중복',evidence:'캡스톤 과제를 기업과 함께 수행합니다.'},
  {name:'title',value:'규칙이 채운 칸',evidence:'캡스톤 과제를 기업과 함께 수행합니다.'},
  {name:'department',value:'없는 근거',evidence:'원문에 없는 문장입니다.'},
 ])});
 assert.equal(status,200);
 const {fields,evidence,duplicateNoticeId}=body;
 assert.equal(duplicateNoticeId,null);
 assert.equal(fields.title,'2026 겨울 캡스톤 참가자 모집 & 안내');
 assert.equal(fields.sourceUrl,URL1);
 assert.equal(fields.deadline,'2026-12-14');
 assert.equal(fields.deadlineEvidence,'2. 모집마감: 2026. 12. 14.(월) 18:00');
 assert.equal(fields.applicationInstructions,'신청서를 이메일로 제출');
 assert.equal(evidence.applicationInstructions,'3. 신청방법: 신청서를 이메일로 제출');
 assert.deepEqual(fields.rules,[{field:'manual',op:'eq',value:'확인',label:'본교 3~4학년 재학생',evidence:'1. 모집대상: 본교 3~4학년 재학생'}]);
 assert.deepEqual(fields.tasks,['신청서','성적증명서']);
 assert.equal(fields.department,'학생지원팀');
 assert.equal(fields.summary,'3~4학년 재학생이 12월 14일까지 신청하는 캡스톤입니다.');
 assert.equal(evidence.summary,'캡스톤 과제를 기업과 함께 수행합니다.');
 assert.ok(fields.blocks.every(b=>b.type==='text'&&/^[0-9a-f-]{36}$/.test(b.id)));
 assert.equal(fields.blocks.length,7);
 const all=JSON.stringify(fields.blocks);
 for(const hidden of ['메뉴','주소 서울','명단_홍길동','일정표','color:red','var phone'])assert.ok(!all.includes(hidden),hidden);
 assert.deepEqual(calls.page,[URL1]);
 assert.equal(calls.model.length,1);
 const sent=JSON.stringify(calls.model[0]);
 for(const leak of ['02-2164-4000','staff@catholic.ac.kr','202312345','010-1111-2222','010-3333-4444','명단_홍길동','jwt'])assert.ok(!sent.includes(leak),leak);
 for(const token of ['[전화번호]','[이메일]','[학번]'])assert.ok(sent.includes(token),token);
 assert.ok(!all.includes('02-2164-4000')&&!all.includes('staff@catholic.ac.kr'));
 assert.match(calls.model[0].systemInstruction.parts[0].text,/\["summary"\]/);
});

test('refuses restricted paths, other hosts and non detail pages before any request',async()=>{
 for(const url of [
  'https://www.catholic.ac.kr/_attach/image/a.png',
  'https://www.catholic.ac.kr/_custom/x.do?mode=view&articleNo=1',
  'https://www.catholic.ac.kr/_RES/js/a.js',
  'https://www.catholic.ac.kr/%5Fattach/a.png',
  'https://www.catholic.ac.kr/ko/%2e%2e/_attach/a.png',
  'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=download&articleNo=277842&attachNo=1',
  'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=list',
  'http://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842',
  'https://catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842',
  'https://www.catholic.ac.kr.evil.test/ko/campuslife/notice.do?mode=view&articleNo=277842',
  'https://user@www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842',
  'https://example.com/ko/campuslife/notice.do?mode=view&articleNo=277842',
  'not a url',
 ]){
  const {status,calls}=await invoke({url});
  assert.equal(status,400,url);
  assert.equal(calls.page.length+calls.model.length,0,url);
 }
 assert.equal(noticeUrl('https://www.catholic.ac.kr/ko/campuslife/notice.do?articleNo=277842&mode=view&x=1').href,URL1);
});

test('a redirect is refused and never followed',async()=>{
 for(const page of [()=>new Response(null,{status:302,headers:{location:'https://evil.test/'}}),()=>({type:'opaqueredirect',status:0,ok:false,url:URL1}),()=>({type:'basic',status:200,ok:true,url:'https://www.catholic.ac.kr/_attach/a.html',text:async()=>html})]){
  const {status,body,calls}=await invoke({page});
  assert.equal(status,400);assert.match(body.error,/다른 주소/);
  assert.equal(calls.page.length,1);assert.equal(calls.model.length,0);
 }
});

test('roster-like text skips the model and returns rule results without body blocks',async()=>{
 const {status,body,calls}=await invoke({page:()=>new Response(roster)});
 assert.equal(status,200);
 assert.equal(calls.model.length,0);
 assert.equal(body.aiSkipped,true);assert.match(body.message,/명단/);
 assert.equal(body.fields.deadline,'2026-12-14');
 assert.equal(body.fields.blocks,undefined);
 assert.ok(!JSON.stringify(body).includes('202311111'));
 assert.equal(rosterLike(mask(pageText(html).body)),false);
});

test('auth, grant and key are checked before any request',async()=>{
 const noUser=await invoke({user:null});assert.equal(noUser.status,401);
 const noGrant=await invoke({grant:false});assert.equal(noGrant.status,403);
 const noKey=await invoke({key:''});assert.equal(noKey.status,503);assert.match(noKey.body.error,/모델 키/);
 for(const r of [noUser,noGrant,noKey])assert.equal(r.calls.page.length+r.calls.model.length,0);
});

test('returns the published notice with the same article number as duplicate',async()=>{
 const rows=[{id:'other',data:{sourceUrl:'https://www.catholic.ac.kr/ko/campuslife/notice.do?articleNo=2778420&mode=view'}},{id:'same',data:{sourceUrl:'https://www.catholic.ac.kr/ko/campuslife/notice.do?articleNo=277842&mode=view'}}];
 assert.equal((await invoke({rows})).body.duplicateNoticeId,'same');
 assert.equal((await invoke({rows:[{id:'archive',data:{sourceArchiveId:'277842'}}]})).body.duplicateNoticeId,'archive');
});

test('masks phone numbers, emails and student numbers',()=>{
 assert.equal(mask('연락 010-1234-5678, 01012345678, 02)2164-4000, 2164-4000, a.b@x.ac.kr, 학번 2023123456 2023123'),'연락 [전화번호], [전화번호], [전화번호], [전화번호], [이메일], 학번 [학번] 2023123');
});
