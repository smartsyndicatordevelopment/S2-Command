import { useState } from 'react';
import { authClient } from '../lib/authClient';

// email/password + 2FA + passkey sign-in, with sign-up. Session updates reactively
// via useSession(), so onLogin() is just a hint for the parent.
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin');   // 'signin' | 'signup'
  const [stage, setStage] = useState('creds');  // 'creds' | '2fa'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const done = () => onLogin && onLogin();

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await authClient.signUp.email({ email, password, name });
        if (error) throw new Error(error.message || 'Could not create account');
        done();
      } else {
        const { data, error } = await authClient.signIn.email({ email, password });
        if (error) throw new Error(error.message || 'Invalid email or password');
        if (data?.twoFactorRedirect) { setStage('2fa'); }
        else done();
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function verify2fa(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) throw new Error(error.message || 'Invalid code');
      done();
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function passkeySignIn() {
    setError(''); setLoading(true);
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) throw new Error(res.error.message || 'Passkey sign-in failed');
      done();
    } catch (err) { setError(err.message || 'Passkey sign-in failed'); }
    setLoading(false);
  }

  const inputCls = 'w-full bg-card border border-border rounded-lg px-4 py-3 text-white placeholder-muted focus:outline-none focus:border-purple transition-colors';

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

        {stage === '2fa' ? (
          <form onSubmit={verify2fa} className="space-y-4">
            <p className="text-sm text-dim text-center">Enter the 6-digit code from your authenticator app.</p>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" inputMode="numeric" autoFocus className={`${inputCls} text-center tracking-[0.4em] font-mono`} />
            {error && <p className="text-red text-sm text-center">{error}</p>}
            <button type="submit" disabled={loading || code.length !== 6}
              className="w-full bg-purple hover:bg-purple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3 transition-colors">
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoFocus className={inputCls} />
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
              autoFocus={mode === 'signin'} autoComplete="email" className={inputCls} />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={inputCls} />

            {error && <p className="text-red text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading || !email || !password || (mode === 'signup' && !name)}
              className="w-full bg-purple hover:bg-purple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3 transition-colors">
              {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign In'}
            </button>

            {mode === 'signin' && (
              <button type="button" onClick={passkeySignIn} disabled={loading}
                className="w-full bg-card border border-border hover:border-purple text-dim font-medium rounded-lg py-3 transition-colors">
                Sign in with a passkey
              </button>
            )}

            <p className="text-center text-sm text-muted">
              {mode === 'signin' ? "No account yet?" : 'Already have an account?'}{' '}
              <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
                className="text-purple hover:underline">
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
