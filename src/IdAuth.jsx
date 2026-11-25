import React,{useState} from 'react';
import {ArrowRight,ShieldCheck,User} from 'lucide-react';
import {signUpWithId,signInWithId,resetPasswordWithId,authErrorKind} from './backend.js';
import {LOGIN_ID_RULE,PASSWORD_RULE,isValidLoginId,isValidPassword,normalizeLoginId} from './login-id.js';

const titles={login:'로그인',signup:'학생 회원가입',reset:'비밀번호 재설정'};
const actions={login:'로그인',signup:'회원가입',reset:'비밀번호 바꾸기'};
const guides={login:'로그인하면 작성 내용과 준비 상태를 이어갈 수 있습니다.',signup:'아이디와 비밀번호만으로 가입합니다. 이메일은 받지 않습니다.',reset:'아이디와 새 비밀번호를 입력하세요. 학생 계정만 바꿀 수 있습니다.'};

// Login, signup and password reset by ID. Staff accounts only log in.
export function IdAuth({staff,disabled=false}){
 const [mode,setMode]=useState('login'),[id,setId]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 function go(next){setMode(next);setPassword('');setError('');setMessage('');}
 async function submit(e){
  e.preventDefault();if(disabled)return;
  const loginId=normalizeLoginId(id);
  if(mode!=='login'&&(!isValidLoginId(loginId)||!isValidPassword(password))){setError(`아이디는 ${LOGIN_ID_RULE}, 비밀번호는 ${PASSWORD_RULE}입니다.`);return;}
  setBusy(true);setError('');setMessage('');
  try{
   if(mode==='login')await signInWithId(loginId,password);
   else if(mode==='signup')await signUpWithId(loginId,password);
   else{await resetPasswordWithId(loginId,password);go('login');setId(loginId);setMessage('입력한 아이디가 학생 계정이면 비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 보세요.');}
  }catch(err){
   const kind=authErrorKind(err),common=kind==='network'?'서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.':kind==='rate'?'시도가 많습니다. 잠시 후 다시 시도해 주세요.':'';
   if(mode==='login')setError(common||(kind==='credentials'?'로그인하지 못했습니다. 아이디와 비밀번호를 확인해 주세요.':'로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'));
   else if(mode==='signup')setError(err?.code==='user_already_exists'?'이미 쓰는 아이디입니다. 다른 아이디를 입력해 주세요.':common||'가입하지 못했습니다. 잠시 후 다시 시도해 주세요.');
   else setError(err.message);
  }finally{setBusy(false);}
 }
 return <>
  <div className="access-title">{staff?<ShieldCheck size={24}/>:<User size={24}/>}<h2>{staff?'담당자 로그인':titles[mode]}</h2></div>
  <p className="muted">{staff?'권한을 부여받은 계정만 담당 공고를 관리합니다.':guides[mode]}</p>
  {mode==='signup'&&<p className="warning">평소 쓰는 비밀번호를 쓰지 마세요. 대회 시연용 서비스입니다.</p>}
  {mode==='signup'&&<p className="access-foot">가입 전에 <a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>을 확인하세요.</p>}
  <form onSubmit={submit}>
   <label>아이디<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={20} required disabled={disabled} value={id} onChange={e=>setId(e.target.value)}/></label>
   {mode!=='login'&&<p className="access-foot">아이디: {LOGIN_ID_RULE}. 비밀번호: {PASSWORD_RULE}.</p>}
   <label>{mode==='reset'?'새 비밀번호':'비밀번호'}<input name="password" type="password" minLength={8} autoComplete={mode==='login'?'current-password':'new-password'} required disabled={disabled} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <button className="button primary" disabled={disabled||busy}>{busy?<span className="loading-inline">확인 중</span>:actions[mode]}<ArrowRight size={16}/></button>
  </form>
  {!staff&&(mode==='login'?<><button type="button" className="text-button" onClick={()=>go('signup')}>처음이라면 회원가입</button><button type="button" className="text-button" onClick={()=>go('reset')}>비밀번호를 잊었다면 재설정</button></>:<button type="button" className="text-button" onClick={()=>go('login')}>로그인으로 돌아가기</button>)}
  {error&&<p role="alert" className="warning">{error}</p>}{message&&<p role="status" className="success-note">{message}</p>}
 </>;
}
