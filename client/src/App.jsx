import { useEffect, useState } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';
import { AppProvider } from './context/AppContext';
import { authClient } from './lib/authClient';

export default function App() {
  const { data: session, isPending } = authClient.useSession();

  // The spinner is for the first session check only. A later re-check (it happens right after the password is accepted, while the
  // second sign-in step is on screen) must not replace the sign-in screen, or the second step would be thrown away.
  const [checkedOnce, setCheckedOnce] = useState(false);
  useEffect(() => { if (!isPending) setCheckedOnce(true); }, [isPending]);

  if (isPending && !checkedOnce) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-6 h-6 rounded-full border-2 border-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    // Session updates reactively after sign-in, so onLogin is just a hint.
    return <Login onLogin={() => {}} />;
  }

  return (
    <AppProvider>
      <Layout onLogout={async () => { await authClient.signOut(); }} />
    </AppProvider>
  );
}
