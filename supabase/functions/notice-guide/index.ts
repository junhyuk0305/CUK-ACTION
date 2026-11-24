import {createClient} from 'npm:@supabase/supabase-js@2';
import {handleGuide} from './handler.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
// The reviewed excerpt is read from the published notice with this school article number.
const excerpt=async(id:string)=>{
 const {data,error}=await db.from('notices').select('data').eq('status','published').eq('data->>sourceArchiveId',id).limit(1).maybeSingle();
 if(error)throw error;
 return data?.data?.excerpt||null;
};
Deno.serve(req=>handleGuide(req,{db,env:(key:string)=>Deno.env.get(key),excerpt}));
