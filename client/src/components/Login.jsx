import { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { authClient } from '../lib/authClient';
import { passkeySecondStepAvailable, finishWithPasskey } from '../lib/passkeySecondStep';

// Email and password sign-in with a second step (a passkey or an authenticator-app code), passkey-only sign-in, and sign-up.
// The session updates reactively via useSession(), so onLogin() is just a hint for the parent.
export default function Login({ onLogin }) {
  const [mode, setMode] = useState('signin');   // 'signin' | 'signup'
  const [stage, setStage] = useState('creds');  // 'creds' | '2fa'
  const [methods, setMethods] = useState({ passkey: false, code: false }); // second steps this person has
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useBackup, setUseBackup] = useState(false); // entering a one-time backup code instead
  const [backupCode, setBackupCode] = useState('');
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
        if (data?.twoFactorRedirect) {
          const hasCode = (data.twoFactorMethods || []).includes('totp');
          const hasPasskey = await passkeySecondStepAvailable();
          setMethods({ passkey: hasPasskey, code: hasCode });
          setCode('');
          setStage('2fa');
        } else done();
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

  async function verifyBackup(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { error } = await authClient.twoFactor.verifyBackupCode({ code: backupCode.trim() });
      if (error) throw new Error(error.message || 'That backup code is not valid.');
      done();
    } catch (err) { setError(err.message); }
    setLoading(false);
  }

  async function passkeySecondStep() {
    setError(''); setLoading(true);
    try {
      await finishWithPasskey();
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

  function backToPassword() {
    setStage('creds'); setError(''); setCode(''); setPassword(''); setUseBackup(false); setBackupCode('');
  }

  const inputCls = 'w-full bg-card border border-border rounded-lg px-4 py-3 text-white placeholder-muted focus:outline-none focus:border-purple transition-colors';
  const primaryBtn = 'w-full bg-purple hover:bg-purple-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3 transition-colors';
  const secondaryBtn = 'w-full bg-card border border-border hover:border-purple text-dim font-medium rounded-lg py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="S2 Command logo" className="inline-block w-12 h-12 rounded-lg object-cover mb-4" />
          <h1 className="text-xl font-semibold text-white">Command Center</h1>
          <p className="text-muted text-sm mt-1">Smart Syndicator</p>
        </div>

        {stage === '2fa' ? (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-white text-center">One More Step</h2>
            <p className="text-sm text-dim text-center">
              {methods.passkey && methods.code && 'Your password is correct. Confirm it is you with your passkey or a code from your authenticator app.'}
              {methods.passkey && !methods.code && 'Your password is correct. Confirm it is you with your passkey (fingerprint, face, PIN or security key).'}
              {!methods.passkey && methods.code && 'Your password is correct. Enter the 6-digit code from your authenticator app.'}
              {!methods.passkey && !methods.code && 'Two-step sign-in is on, but no second step could be found for this account. Go back and try again.'}
            </p>

            {methods.passkey && (
              <button type="button" onClick={passkeySecondStep} disabled={loading} autoFocus className={`${primaryBtn} inline-flex items-center justify-center gap-2`}>
                <Fingerprint size={16} aria-hidden="true" />
                {loading ? 'Waiting For Your Passkey...' : 'Use Your Passkey'}
              </button>
            )}

            {methods.code && (
              <form onSubmit={verify2fa} className="space-y-3">
                {methods.passkey && <p className="text-xs text-muted text-center">Or enter a code instead</p>}
                <label className="block">
                  <span className="sr-only">6-digit code from your authenticator app</span>
                  <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456" inputMode="numeric" autoComplete="one-time-code" autoFocus={!methods.passkey}
                    className={`${inputCls} text-center tracking-[0.4em] font-mono`} />
                </label>
                <button type="submit" disabled={loading || code.length !== 6} className={methods.passkey ? secondaryBtn : primaryBtn}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
              </form>
            )}

            {useBackup && (
              <form onSubmit={verifyBackup} className="space-y-3">
                <label className="block">
                  <span className="block text-xs text-muted text-center mb-2">Enter one of the backup codes you saved. Each works once.</span>
                  <input value={backupCode} onChange={e => setBackupCode(e.target.value)} placeholder="Backup code" autoComplete="off" autoFocus
                    className={`${inputCls} text-center font-mono`} />
                </label>
                <button type="submit" disabled={loading || backupCode.trim().length < 6} className={secondaryBtn}>
                  {loading ? 'Verifying...' : 'Use Backup Code'}
                </button>
              </form>
            )}

            {error && <p className="text-red text-sm text-center" role="alert">{error}</p>}

            <p className="text-center text-sm text-muted space-x-4">
              <button type="button" onClick={backToPassword} className="text-purple hover:underline">Back To Password</button>
              {!useBackup && (
                <button type="button" onClick={() => { setUseBackup(true); setError(''); }} className="text-purple hover:underline">Lost It? Use A Backup Code</button>
              )}
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="sr-only">Name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoFocus className={inputCls} />
              </label>
            )}
            <label className="block">
              <span className="sr-only">Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email"
                autoFocus={mode === 'signin'} autoComplete="email" className={inputCls} />
            </label>
            <label className="block">
              <span className="sr-only">Password</span>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} className={inputCls} />
            </label>

            {error && <p className="text-red text-sm text-center" role="alert">{error}</p>}

            <button type="submit" disabled={loading || !email || !password || (mode === 'signup' && !name)} className={primaryBtn}>
              {loading ? 'Please Wait...' : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>

            {mode === 'signin' && (
              <button type="button" onClick={passkeySignIn} disabled={loading} className={secondaryBtn}>
                Sign In With A Passkey
              </button>
            )}

            <p className="text-center text-sm text-muted">
              {mode === 'signin' ? 'No account yet?' : 'Already have an account?'}{' '}
              <button type="button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
                className="text-purple hover:underline">
                {mode === 'signin' ? 'Create One' : 'Sign In'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
