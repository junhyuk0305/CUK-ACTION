import test from 'node:test';
import assert from 'node:assert/strict';
import {handleReset} from '../supabase/functions/id-password-reset/handler.js';
import {isValidLoginId,isValidPassword,loginEmail,loginIdFromEmail} from './login-id.js';

// Stand-in for the service-role client: password_reset_target returns only resettable student IDs.
function fakeDb({targets={},rpcError=null,updateError=null}={}){
 const calls={rpc:[],update:[]};
 return {calls,
  rpc:async(name,args)=>{calls.rpc.push([name,args]);return rpcError?{data:null,error:rpcError}:{data:targets[args.p_email]??null,error:null};},
  auth:{admin:{updateUserById:async(id,attrs)=>{calls.update.push([id,attrs]);return {error:updateError};}}}};
}
const post=body=>new Request('https://fn.test/id-password-reset',{method:'POST',headers:{'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
const read=async res=>({status:res.status,body:await res.text()});

test('student ID resets the matching account only',async()=>{
 const db=fakeDb({targets:{[loginEmail('student1')]:'uuid-1'}});
 const res=await read(await handleReset(post({id:'  Student1 ',password:'newpass123'}),{db}));
 assert.deepEqual(res,{status:200,body:'{"ok":true}'});
 assert.deepEqual(db.calls.rpc,[['password_reset_target',{p_email:'student1@id.cuk-action.invalid'}]]);
 assert.deepEqual(db.calls.update,[['uuid-1',{password:'newpass123'}]]);
});

test('unknown, manager and protected IDs get the same response as success and change nothing',async()=>{
 const ok=await read(await handleReset(post({id:'student1',password:'newpass123'}),{db:fakeDb({targets:{[loginEmail('student1')]:'uuid-1'}})}));
 for(const id of ['nobody1','manager1','judge1']){
  const db=fakeDb();
  assert.deepEqual(await read(await handleReset(post({id,password:'newpass123'}),{db})),ok);
  assert.equal(db.calls.update.length,0);
 }
});

test('malformed input is rejected before any lookup',async()=>{
 for(const body of [{id:'ab1',password:'newpass123'},{id:'1abc',password:'newpass123'},{id:'abc_d',password:'newpass123'},{id:'a'.repeat(21),password:'newpass123'},
  {id:'student1',password:'short'},{id:'student1',password:'가'.repeat(25)},{id:'student1',password:12345678},{id:['student1'],password:'newpass123'},{},'not json']){
  const db=fakeDb({targets:{[loginEmail('student1')]:'uuid-1'}});
  assert.equal((await handleReset(post(body),{db})).status,400,JSON.stringify(body));
  assert.equal(db.calls.rpc.length+db.calls.update.length,0);
 }
});

test('server failures do not report success, CORS preflight and other methods',async()=>{
 assert.equal((await handleReset(post({id:'student1',password:'newpass123'}),{db:fakeDb({rpcError:{message:'x'}})})).status,500);
 const db=fakeDb({targets:{[loginEmail('student1')]:'uuid-1'},updateError:{message:'x'}});
 assert.equal((await handleReset(post({id:'student1',password:'newpass123'}),{db})).status,500);
 const pre=await handleReset(new Request('https://fn.test',{method:'OPTIONS'}),{db:fakeDb()});
 assert.equal(pre.status,200);assert.match(pre.headers.get('access-control-allow-headers'),/authorization/);
 assert.equal((await handleReset(new Request('https://fn.test',{method:'GET'}),{db:fakeDb()})).status,405);
});

test('ID rules and internal email mapping',()=>{
 assert.equal(loginEmail('Abc1'),loginEmail('abc1'));
 assert.equal(loginIdFromEmail(loginEmail('judge01')),'judge01');
 assert.equal(loginIdFromEmail('someone@example.org'),'someone@example.org');
 assert.ok(isValidLoginId('abcd')&&isValidLoginId('a'+'1'.repeat(19)));
 assert.ok(!isValidLoginId('Abcd')&&!isValidLoginId('abc'));
 assert.ok(isValidPassword('a'.repeat(72))&&!isValidPassword('a'.repeat(73))&&!isValidPassword('1234567'));
});
