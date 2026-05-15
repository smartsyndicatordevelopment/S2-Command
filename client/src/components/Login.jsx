import { useState } from 'react';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        setError('Invalid password');
        setPassword('');
      }
    } catch {
      setError('Connection error -- is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-bg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-muted mb-4">
            <span className="text-purple text-xl font-bold">S2</span>
          </div>
          <h1 className="text-xl font-semibold text-white">Command Center</h1>
          <p className="text-muted text-sm mt-1">Smart Syndicator</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-white placeholder-muted focus:outline-none focus:border-purple transition-colors"
            />
          </div>

          {error && (
            <p className="text-red text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-purple hover:bg-purple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
