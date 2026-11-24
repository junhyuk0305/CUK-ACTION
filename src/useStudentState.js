import {useCallback,useEffect,useRef,useState} from 'react';
import {initialProfile} from './data.js';
import {loadStudentState,saveStudentState,recordActivity} from './gateway.js';

export const freshState=()=>({profile:{...initialProfile,interests:[]},saved:[],applications:{},events:[],read:[]});
export function useStudentState(user){
 const [state,replace]=useState(freshState),[loaded,setLoaded]=useState(false),[status,setStatus]=useState('loading'),[error,setError]=useState(''),[activityError,setActivityError]=useState('');
 const latest=useRef(state),saved=useRef(''),inFlight=useRef(null),alive=useRef(true),recorded=useRef(new Set()),ready=useRef(false);
 const payload=s=>({profile:s.profile,saved:s.saved,applications:s.applications,read:s.read,seenSchedules:s.seenSchedules||{}});
 const serialize=s=>JSON.stringify(payload(s));
 const setState=useCallback(updater=>{replace(previous=>{const next=typeof updater==='function'?updater(previous):updater;latest.current=next;return next;});setStatus('pending');},[]);
 async function load(){
  setError('');setStatus('loading');
  try{const data=await loadStudentState(user.id);if(!alive.current)return;const next={...freshState(),...data,profile:{...initialProfile,...data?.profile},events:[]};latest.current=next;saved.current=serialize(next);replace(next);ready.current=true;setLoaded(true);setStatus('saved');}
  catch(e){if(alive.current){setError(e.message);setStatus('error');}}
 }
 useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;ready.current=false;};},[user.id]);
 async function flush(){
  if(!ready.current)return false;
  if(inFlight.current){const ok=await inFlight.current;if(!ok)return false;return serialize(latest.current)===saved.current?true:flush();}
  const task=(async()=>{
   let trackingFailed=false;
   while(alive.current){
    const snapshot=latest.current,serialized=serialize(snapshot);
    try{
     if(serialized!==saved.current){setStatus('saving');setError('');await saveStudentState(user.id,payload(snapshot));saved.current=serialized;}
    }catch(e){if(alive.current){setError(e.message);setStatus('error');}return false;}
    if(!trackingFailed){
     try{
      for(const e of snapshot.events){if(recorded.current.has(e.id))continue;if(!e.demo)await recordActivity(e.notice,e.type,e.optionId,e.stepId);recorded.current.add(e.id);}
      if(alive.current)setActivityError('');
     }catch(e){trackingFailed=true;if(alive.current)setActivityError(e.message);}
    }
    // Edits made during activity requests must also reach storage before exit.
    if(serialize(latest.current)!==saved.current)continue;
    if(!trackingFailed&&latest.current.events.some(e=>!recorded.current.has(e.id)))continue;
    if(alive.current)setStatus('saved');
    return true;
   }
   return false;
  })();
  inFlight.current=task;
  try{return await task;}finally{inFlight.current=null;}
 }
 useEffect(()=>{if(!loaded)return;const timer=setTimeout(()=>{flush();},400);return()=>clearTimeout(timer);},[state,loaded]);
 useEffect(()=>{const warn=e=>{if(ready.current&&serialize(latest.current)!==saved.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 return {state,setState,loaded,status,error,activityError,flush,retry:loaded?flush:load};
}
