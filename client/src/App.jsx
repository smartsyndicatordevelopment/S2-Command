import { useState, useEffect } from 'react';
import Login from './components/Login';
import Layout from './components/Layout';
import { AppProvider } from './context/AppContext';

export default function App() {
  const [auth, setAuth] = useState(null); // null = checking, true/false

  useEffect(() => {
    fetch('/auth/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setAuth(d.authenticated))
      .catch(() => setAuth(false));
  }, []);

  if (auth === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-6 h-6 rounded-full border-2 border-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!auth) {
    return <Login onLogin={() => setAuth(true)} />;
  }

  return (
    <AppProvider>
      <Layout onLogout={() => setAuth(false)} />
    </AppProvider>
  );
}
