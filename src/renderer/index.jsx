import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { Login } from './views/Login';
import { Shell } from './views/Shell';
import { AppProvider } from './context';
import { StandaloneConsole } from './components/Console';
import { Spinner } from './components/ui';

function Root() {
  const [session, setSession] = useState(undefined);
  const hash = window.location.hash;

  useEffect(() => {
    window.pve.session().then(setSession).catch(() => setSession(null));
    return window.pve.onSessionExpired(() => setSession(null));
  }, []);

  // Pop-out console windows share the main process session.
  if (hash.startsWith('#console?')) {
    const params = Object.fromEntries(new URLSearchParams(hash.slice('#console?'.length)));
    return <StandaloneConsole {...params} />;
  }

  if (session === undefined)
    return (
      <div className="center-fill">
        <Spinner size={26} />
      </div>
    );

  if (!session) return <Login onLogin={setSession} />;

  const logout = async () => {
    await window.pve.logout();
    setSession(null);
  };

  return (
    <AppProvider session={session} onLogout={logout} key={session.host + session.userid}>
      <Shell />
    </AppProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
