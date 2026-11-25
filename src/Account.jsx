import React, {useEffect, useState} from 'react';
import {ArrowRight, GraduationCap} from 'lucide-react';
import {supabase, isManager, loginIdFromEmail} from './backend.js';
import {DEMO} from './demo.js';
import {IdAuth} from './IdAuth.jsx';
import {testAccounts, setTestUser} from './gateway.js';
import {ErrorBoundary} from './ErrorBoundary.js';
import './account.css';
import './motion.css';

const demoAccount = u => ({user: {id: u.id, email: u.name}, isManager: u.role === 'manager', testMode: true});
function restoredDemo() {
  try {
    const u = testAccounts.find(u => u.id === sessionStorage.getItem('cuk-test-account'));
    if (u) { setTestUser(u); return demoAccount(u); }
  } catch {}
  return null;
}

export function AccountRoot({children}) {
  const [demo, setDemo] = useState(() => DEMO ? restoredDemo() : null);
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [attempt, retry] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let generation = 0;
    let timer;
    let currentId;
    let verifiedId;
    const {data: {subscription}} = supabase.auth.onAuthStateChange((event, session) => {
      const version = ++generation;
      clearTimeout(timer);
      const id = session?.user?.id;
      const changed = id !== currentId;
      if (changed || !id) { setAccount(null); setLogoutError(''); verifiedId = undefined; }
      currentId = id;
      setError('');
      if (!id) {
        setChecking(false);
        return;
      }
      if (changed) setChecking(true);
      // Database calls must start after the auth callback releases its lock.
      timer = setTimeout(async () => {
        try {
          const {data, error: authError} = await supabase.auth.getUser();
          if (authError || data.user?.id !== id) throw Error();
          const allowed = await isManager(id);
          if (version === generation) {
            verifiedId = id;
            setAccount({user: {...data.user, email: loginIdFromEmail(data.user.email)}, isManager: allowed});
          }
        } catch {
          // A failed recheck of the same signed-in user keeps the account so unsaved edits survive.
          if (version === generation && verifiedId !== id) {
            setAccount(null);
            setError('계정 권한을 확인하지 못했습니다.');
          }
        } finally {
          if (version === generation) setChecking(false);
        }
      }, 0);
    });
    return () => { generation++; clearTimeout(timer); subscription.unsubscribe(); };
  }, [attempt]);

  async function logout() {
    setLogoutError('');
    let failed;
    try { failed = (await supabase.auth.signOut({scope:'local'})).error; } catch (e) { failed = e; }
    // Shown only while still signed in; a removed local session already moves to the login screen.
    if (failed) setLogoutError('로그아웃하지 못했습니다. 다시 시도해 주세요.');
  }
  const logoutAlert = logoutError && <p className="toast" role="alert">{logoutError}</p>;

  function enterDemo(u) {
    try { sessionStorage.setItem('cuk-test-account', u.id); } catch {}
    setTestUser(u); setDemo(demoAccount(u));
  }
  function leaveDemo() {
    try { sessionStorage.removeItem('cuk-test-account'); } catch {}
    setTestUser(null); setDemo(null);
  }

  if (DEMO && demo) return <ErrorBoundary>{children({...demo, logout: leaveDemo})}</ErrorBoundary>;
  if (checking) return <main><p role="status">계정 확인 중입니다.</p></main>;
  if (error) return <main className="access-main"><section className="panel access-card">
    <p role="alert">{error}</p><button className="button primary" onClick={() => {setChecking(true); retry(n=>n+1);}}>다시 확인</button>
    <button className="text-button" onClick={logout}>로그아웃</button>
  </section>{logoutAlert}</main>;
  if (account) return <><ErrorBoundary>{children({...account, logout})}</ErrorBoundary>{logoutAlert}</>;
  return <Login onDemo={DEMO ? enterDemo : null}/>;
}

function Login({onDemo}) {
  // Managers have no tab here; links to /account.html#manager open the staff login, also after the page has loaded.
  const [staff, setStaff] = useState(() => location.hash === '#manager');
  useEffect(() => {
    const sync = () => setStaff(location.hash === '#manager');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return <div className="access-shell"><section className="access-intro">
    <a className="brand" href="/"><GraduationCap/> CUK Action</a>
    <div><h1>가톨릭대학교 교내 공고</h1><p>로그인하면 내 공고와 작성 내용을 이어서 확인할 수 있습니다.</p></div>
  </section><main className="access-main"><section className="panel access-card">
    <IdAuth key={staff ? 'staff' : 'student'} staff={staff} disabled={!supabase}/>
    {!supabase && <p role="alert">계정 서버 설정이 필요합니다.</p>}
    {DEMO && onDemo && <div className="test-entry direct-test"><span className="tag">테스트 데이터</span><div className="test-accounts">
      {testAccounts.map((u, i) => <button className={'button ' + (i ? 'secondary' : 'primary')} key={u.id} onClick={() => onDemo(u)}>{u.name}로 체험<ArrowRight size={16}/></button>)}
    </div></div>}
    <a className="text-button" href="/">교내 공고로 돌아가기</a>
  </section></main></div>;
}
