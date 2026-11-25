import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSuggest} from './handler.js';

const notice={title:'캡스톤 참가자 모집',applyMode:'site',blocks:[
 {id:'b1',type:'heading',text:'모집 개요'},
 {id:'b2',type:'text',text:'참가 신청은 12월 14일까지 받습니다.'},
 {id:'b3',type:'text',text:'선발 기준은 서류 평가입니다.'},
 {id:'b4',type:'image',src:'https://example.test/a.png',alt:'일정표'},
]};
const fullFunnel={stages:{view:40},blocks:{b1:40,b2:20,b3:null,b4:3},sources:{alert:12},questions:{q1:7}};

function invoke({user={id:'staff'},grant=true,owner='staff',key='test',data=fullFunnel,model,body={noticeId:'n1',fromDate:'2026-11-01',toDate:'2026-11-25'}}={}){
 const tables={
  manager_grants:{data:grant?{user_id:user?.id}:null},
  notices:{data:owner?{id:'n1',owner_id:owner,data:notice}:null},
 };
 const db={auth:{getUser:async()=>({data:{user}})},from:name=>({select:()=>({eq:()=>({maybeSingle:async()=>tables[name]})})})};
 const funnel=async(token,id,from,to)=>{assert.equal(token,'jwt');assert.equal(id,'n1');assert.equal(from,'2026-11-01');assert.equal(to,'2026-11-25');return data;};
 const req=new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer jwt'},body:JSON.stringify(body)});
 return handleSuggest(req,{db,env:name=>name==='GEMINI_API_KEY'?key:'',fetchModel:model,funnel});
}
const answer=suggestions=>async()=>Response.json({candidates:[{content:{role:'model',parts:[{thought:true,text:'thinking'},{text:JSON.stringify({suggestions})}]},finishReason:'STOP'}]});

test('sends only block text and reach ratios of 5 or more, and returns cleaned suggestions',async()=>{
 let sent;
 const model=async(_,options)=>{sent=JSON.parse(options.body);return answer([
  {blockId:'b2',reason:'  마감일이 문단 끝에 있습니다. ',suggestion:' 12월 14일까지 신청하세요. '},
  {blockId:'b2',reason:'중복',suggestion:'중복 제안'},
  {blockId:'zz',reason:'없는 블록',suggestion:'버려야 합니다'},
  {blockId:'b4',reason:'이미지',suggestion:'이미지는 글을 바꾸지 않습니다'},
  {blockId:'b3',reason:'',suggestion:'이유 없음'},
  {blockId:'b1',reason:'긴 이유'.repeat(200),suggestion:'모집 안내'},
 ])();};
 const response=await invoke({model});
 assert.equal(response.status,200);
 const {suggestions}=await response.json();
 assert.deepEqual(suggestions.map(s=>s.blockId),['b2','b1']);
 assert.deepEqual(suggestions[0],{blockId:'b2',reason:'마감일이 문단 끝에 있습니다.',suggestion:'12월 14일까지 신청하세요.'});
 assert.equal(suggestions[1].reason.length,300);
 const payload=JSON.parse(sent.contents[0].parts[0].text);
 assert.deepEqual(payload.blocks.map(b=>[b.id,b.reachPercent]),[['b1',100],['b2',50],['b3',null],['b4',null]]);
 assert.equal(payload.blocks[3].text,'일정표');
 const text=JSON.stringify(sent);
 for(const leak of ['staff','jwt','alert','q1','"40"','https://example.test/a.png'])assert.ok(!text.includes(leak),leak);
 assert.deepEqual(Object.keys(payload),["title","blocks"]);for(const b of payload.blocks)assert.deepEqual(Object.keys(b),["id","type","text","reachPercent"]);
});

test('rejects missing login, grant or ownership and missing key without calling the model',async()=>{
 let calls=0;const model=async()=>{calls++;return answer([])();};
 assert.equal((await invoke({user:null,model})).status,401);
 assert.equal((await invoke({grant:false,model})).status,403);
 assert.equal((await invoke({owner:'other',model})).status,403);
 assert.equal((await invoke({owner:null,model})).status,403);
 const noKey=await invoke({key:'',model});
 assert.equal(noKey.status,503);assert.match((await noKey.json()).error,/모델 키/);
 assert.equal(calls,0);
});

test('fewer than 5 viewers or no block with 5 or more returns no suggestions without a model call',async()=>{
 let calls=0;const model=async()=>{calls++;return answer([])();};
 for(const data of [{stages:{view:null},blocks:{b1:null}},{stages:{view:4},blocks:{}},{stages:{view:30},blocks:{b1:null,b2:3}},{stages:{},blocks:{}}]){
  const response=await invoke({data,model});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body.suggestions,[]);assert.match(body.message,/5명/);
 }
 assert.equal(calls,0);
});

test('model failures surface as errors',async()=>{
 assert.equal((await invoke({model:async()=>new Response('',{status:503})})).status,400);
 assert.equal((await invoke({model:async()=>Response.json({promptFeedback:{blockReason:'SAFETY'}})})).status,400);
});
