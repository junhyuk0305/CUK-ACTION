import {createClient} from 'npm:@supabase/supabase-js@2';
import {handleSuggest} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
// notice_funnel checks auth.uid(), so it runs with the caller's token instead of the service key.
const funnel=async(token:string,noticeId:string,fromDate:string,toDate:string)=>{
 const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await user.rpc('notice_funnel',{p_notice_id:noticeId,p_from:fromDate,p_to:toDate});
 if(error)throw Error(error.message||'집계를 불러오지 못했습니다.');
 return data;
};
Deno.serve(req=>handleSuggest(req,{db,env:(key:string)=>Deno.env.get(key),funnel}));
