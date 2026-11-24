import {isValidLoginId,isValidPassword,loginEmail,normalizeLoginId,LOGIN_ID_RULE,PASSWORD_RULE} from '../../../src/login-id.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(body,status=200)=>Response.json(body,{headers,status});
const retry='잠시 후 다시 시도해 주세요.';
// Unknown, protected and manager IDs get the same response as a successful reset.
export async function handleReset(req,{db}){
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'잘못된 요청입니다.'},405);
 let body;try{body=await req.json();}catch{return reply({error:'잘못된 요청입니다.'},400);}
 const id=normalizeLoginId(body?.id),password=body?.password;
 if(!isValidLoginId(id)||!isValidPassword(password))return reply({error:`아이디는 ${LOGIN_ID_RULE}, 비밀번호는 ${PASSWORD_RULE}입니다.`},400);
 const {data:target,error}=await db.rpc('password_reset_target',{p_email:loginEmail(id)});
 if(error)return reply({error:retry},500);
 if(target){const {error:updateError}=await db.auth.admin.updateUserById(target,{password});if(updateError)return reply({error:retry},500);}
 return reply({ok:true});
}
