import {createClient} from 'npm:@supabase/supabase-js@2';
import excerpts from '../../../public/ai-excerpts.json' with {type:'json'};
import {handleGuide} from './handler.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(req=>handleGuide(req,{db,env:(key:string)=>Deno.env.get(key),excerpts}));
