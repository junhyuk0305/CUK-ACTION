import {createClient} from 'npm:@supabase/supabase-js@2';
import {handleDraft} from './handler.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
// Redirects are returned, not followed. The handler refuses them.
const fetchPage=(url:string)=>fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});
// Published notices that may share the article number. The handler checks the number exactly.
const published=async(articleNo:string)=>{
 const {data,error}=await db.from('notices').select('id,data').eq('status','published').or(`data->>sourceArchiveId.eq.${articleNo},data->>sourceUrl.ilike.*articleNo=${articleNo}*`).limit(20);
 if(error)throw Error('같은 원문의 공고를 확인하지 못했습니다.');
 return data;
};
Deno.serve(req=>handleDraft(req,{db,env:(key:string)=>Deno.env.get(key),fetchPage,published}));
