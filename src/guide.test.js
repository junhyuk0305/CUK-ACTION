import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './archive-fixture.js';
import {approvedRows,initialGuide,reviewRows,privateRows,schedules,scheduleDiff,supported} from './guide.js';
import {handleGuide} from '../supabase/functions/notice-guide/handler.js';
const excerptOf=i=>fixture.find(r=>r.id===i)?.excerpt||null;
const id='277842',text=excerptOf(id);
test('reviewed dates retain their roles, precision and complete ranges',()=>{
 const [target,deadline,operation]=initialGuide(id,text);
 assert.equal(target.value,'가톨릭대학교 재학생 전체');
 assert.match(deadline.value,/2026\.12\.14/);assert.match(operation.value,/2027\. 1\. 31/);
 assert.equal(supported({...operation,kind:'deadline'},text),false);
 assert.equal(supported({...deadline,value:'2026.12.14.(토)'},text),false);
 assert.equal(supported({...deadline,value:'2026.12.14. 23:59'},text),false);
 assert.equal(supported({...deadline,evidence:'~ 2026.12.14.(월)'},text),false);
 assert.equal(supported(deadline,text+'\n모집마감: 2026.12.15'),false);
 const exchange=initialGuide('277389',excerptOf('277389'));
 assert.deepEqual(exchange.map(x=>x.kind),['payment','change']);
 assert.match(exchange[0].value,/11\. 30.*12\. 04.*09:00 ~ 16:00/);
 assert.match(exchange[1].value,/12\. 14.*12\. 18.*09:00 ~ 17:00/);
 const updated={...exchange[0],value:exchange[0].value.replace('16:00','18:00')};
 assert.deepEqual(scheduleDiff(schedules(exchange),schedules([updated,exchange[1]])),['납부 마감 시각 16:00 → 18:00']);
 assert.throws(()=>privateRows([{...target,decision:'edit',value:'발췌 밖의 자유 입력'}],text));
 const draft=reviewRows([target,deadline,operation],text);draft[1].decision='edit';draft[1].value='2026.12.14';
 assert.deepEqual(approvedRows(draft,text),[{...deadline,value:'2026.12.14'}]);
});
test('unread, acknowledged, added and removed schedules are distinct',()=>{
 const a={'납부 종료':'16:00'},b={'납부 종료':'18:00'},latest={'납부 종료':'17:00'};
 assert.deepEqual(scheduleDiff(b,latest),['납부 종료 18:00 → 17:00']);
 assert.deepEqual(scheduleDiff(a,latest),['납부 종료 16:00 → 17:00']);
 assert.deepEqual(scheduleDiff(null,latest),[]);assert.deepEqual(scheduleDiff(a,{}),['납부 종료 16:00 → 일정 삭제']);
 assert.deepEqual(scheduleDiff({},a),['납부 종료 일정 없음 → 16:00']);
});
function invoke({grant=true,key='test',model,claim=true,body={id,action:'extract'}}={}){
 const db={auth:{getUser:async()=>({data:{user:{id:'staff'}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:()=>({data:grant})})})}),rpc:()=>({error:!claim})};
 return handleGuide(new Request('https://example.test',{method:'POST',body:JSON.stringify(body)}),{db,env:()=>key,fetchModel:model,excerpt:async i=>i===id?text:null});
}
test('server sends only selected reviewed excerpt; no calls for missing source, role, ownership or key',async()=>{
 let calls=0;
 const model=async(_,options)=>{calls++;const body=JSON.parse(options.body);
 assert.equal(body.contents[0].parts[0].text,text);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 return Response.json({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({rows:initialGuide(id,text)})}]},finishReason:'STOP'}]});};
 for(const config of [{grant:false},{key:''},{claim:false},{body:{action:'extract',id:'other'}}])assert.ok(!(await invoke({...config,model})).ok);
 assert.equal(calls,0);
 const response=await invoke({model,body:{action:'extract',id,profile:'PRIVATE'}});assert.equal(response.status,200);
 assert.equal((await response.json()).rows.length,3);assert.equal(calls,1);
 assert.ok(!(await invoke({model:async()=>new Response('',{status:503})})).ok);
 assert.ok(!(await invoke({model:async()=>Response.json({promptFeedback:{blockReason:'SAFETY'}})})).ok);
});
