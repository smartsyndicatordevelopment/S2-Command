import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, KeyRound, Fingerprint, Trash2 } from 'lucide-react';
import { authClient } from '../lib/authClient';
import { secondStepStatus, enablePasskeySecondStep } from '../lib/passkeySecondStep';

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm';
const inputStyle = { backgroundColor: 'var(--c-subtle-5)', border: '1px solid var(--c-border)', color: 'var(--c-text-primary)', outline: 'none' };
const btn = (primary) => ({ backgroundColor: primary ? '#5c3ff4' : 'transparent', border: primary ? 'none' : '1px solid var(--c-border)', color: primary ? '#fff' : 'var(--c-dim)', cursor: 'pointer' });

function Card({ icon: Icon, title, children }) {
  return (
    <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-card)' }}>
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: '#8b74ff' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--c-text-primary)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function AccountSecurity() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  // Which second sign-in steps this account has. Read from the server, because turning it on with a passkey does not go
  // through the authenticator-app screens that update the session.
  const [status, setStatus] = useState(null); // { enabled, authenticatorApp, passkeys }
  const loadStatus = useCallback(async () => {
    try { setStatus(await secondStepStatus()); } catch { /* keep the last known state */ }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  const twoFAOn = status ? status.enabled : !!user?.twoFactorEnabled;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  // Adding a passkey, enabling 2FA and changing a password all need a sign-in from the last 24 hours.
  // better-auth answers "Session is not fresh" otherwise, so say what to do about it.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const flash = (m, isErr) => {
    const stale = !!isErr && /not fresh/i.test(m || '');
    setNeedsSignIn(stale);
    const text = stale
      ? 'For safety, this change needs a sign-in from the last 24 hours. Sign out, sign back in, then try again.'
      : m;
    setMsg(isErr ? '' : text); setErr(isErr ? text : '');
  };

  // ---- 2FA ----
  const [pw, setPw] = useState('');
  const [setup, setSetup] = useState(null); // { totpURI, backupCodes }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null); // shown once, right after turning on with a passkey
  const secret = setup ? new URLSearchParams(setup.totpURI.split('?')[1]).get('secret') : null;

  async function enable2FA() {
    setBusy(true); flash('');
    try {
      const { data, error } = await authClient.twoFactor.enable({ password: pw });
      if (error) throw new Error(error.message);
      setSetup(data);
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }
  async function confirm2FA() {
    setBusy(true); flash('');
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code });
      if (error) throw new Error(error.message);
      setSetup(null); setCode(''); setPw(''); await loadStatus(); flash('Two-step sign-in is on. Your authenticator app is set up.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }
  async function disable2FA() {
    setBusy(true); flash('');
    try {
      const { error } = await authClient.twoFactor.disable({ password: pw });
      if (error) throw new Error(error.message);
      setPw(''); await loadStatus(); flash('Two-step sign-in is off.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }
  async function enableWithPasskey() {
    setBusy(true); flash('');
    try {
      const codes = await enablePasskeySecondStep(pw);
      setBackupCodes(codes);
      setPw(''); await loadStatus(); flash('Two-step sign-in is on. Your passkey is the second step.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }

  // ---- Passkeys ----
  const [passkeys, setPasskeys] = useState([]);
  const [pkName, setPkName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null); // id of the passkey waiting for a yes
  const loadPasskeys = useCallback(async () => {
    try { const { data } = await authClient.passkey.listUserPasskeys(); setPasskeys(data || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadPasskeys(); }, [loadPasskeys]);

  async function addPasskey() {
    setBusy(true); flash('');
    try {
      const res = await authClient.passkey.addPasskey({ name: pkName || 'My device' });
      if (res?.error) throw new Error(res.error.message);
      setPkName(''); await loadPasskeys(); await loadStatus(); flash('Passkey added.');
    } catch (e) { flash(e.message || 'Passkey registration was cancelled or failed.', true); }
    setBusy(false);
  }
  async function removePasskey(id) {
    setBusy(true); flash('');
    try {
      const res = await authClient.passkey.deletePasskey({ id });
      if (res?.error) throw new Error(res.error.message || 'Could not remove that passkey.');
      await loadPasskeys(); await loadStatus(); flash('Passkey removed.');
    } catch (e) { flash(e.message, true); }
    setConfirmRemove(null);
    setBusy(false);
  }

  // ---- Change password ----
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  async function changePassword() {
    setBusy(true); flash('');
    try {
      const { error } = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      if (error) throw new Error(error.message);
      setCur(''); setNext(''); flash('Password changed.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--c-muted)' }}>Account & Security</p>
        <span className="text-xs" style={{ color: 'var(--c-dim)' }}>{user?.email}</span>
      </div>
      {(msg || err) && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs" role={err ? 'alert' : 'status'} style={{ color: err ? '#ef4444' : '#8b74ff' }}>{err || msg}</p>
          {needsSignIn && (
            <button
              onClick={async () => { await authClient.signOut(); }}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={btn(true)}
              title="Ends this session so you can sign in again and make the change"
            >
              Sign Out Now
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 2FA */}
        <Card icon={ShieldCheck} title={`Two-Step Sign-In ${twoFAOn ? '· On' : '· Off'}`}>
          {setup ? (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--c-dim)' }}>Add this key to your authenticator app (manual entry):</p>
              <code className="block text-xs break-all px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--c-subtle-5)', color: 'var(--c-text-primary)' }}>{secret}</code>
              {setup.backupCodes?.length > 0 && (
                <>
                  <p className="text-xs mt-2" style={{ color: 'var(--c-dim)' }}>Backup codes (save these):</p>
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono" style={{ color: 'var(--c-muted)' }}>
                    {setup.backupCodes.map((c, i) => <span key={i}>{c}</span>)}
                  </div>
                </>
              )}
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit code" className={`${inputCls} font-mono`} style={inputStyle} />
              <button onClick={confirm2FA} disabled={busy || code.length !== 6} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Confirm And Turn On</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--c-dim)' }}>
                {twoFAOn
                  ? 'After your password, signing in also asks for a second step. Enter your password to change this.'
                  : 'With this on, a correct password is not enough to sign in: you also confirm with a passkey (fingerprint, face, PIN or security key) or a code from an authenticator app.'}
              </p>
              {status && twoFAOn && (
                <ul className="text-xs space-y-1" style={{ color: 'var(--c-text-primary)' }}>
                  <li>Passkey: {status.passkeys > 0 ? `${status.passkeys} set up` : 'none yet (add one in the Passkeys box)'}</li>
                  <li>Authenticator app: {status.authenticatorApp ? 'set up' : 'not set up'}</li>
                  <li>Backup codes: {status.backupCodes ? 'made (for when a passkey or the app is lost)' : 'none'}</li>
                </ul>
              )}
              {backupCodes?.length > 0 && (
                <div className="rounded-lg p-3 space-y-2" style={{ border: '1px solid var(--c-border)', backgroundColor: 'var(--c-subtle-5)' }} role="status">
                  <p className="text-xs font-medium" style={{ color: 'var(--c-text-primary)' }}>Save These Backup Codes Now</p>
                  <p className="text-xs" style={{ color: 'var(--c-dim)' }}>If you ever lose your passkey, one of these codes gets you in. Each works once, and they are not shown again.</p>
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono select-all" style={{ color: 'var(--c-text-primary)' }}>
                    {backupCodes.map((c) => <span key={c}>{c}</span>)}
                  </div>
                  <button onClick={() => setBackupCodes(null)} className="text-xs px-3 py-1.5 rounded-lg" style={btn(false)}>I Saved Them</button>
                </div>
              )}
              <label className="block">
                <span className="sr-only">Current password</span>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Current password" autoComplete="current-password" className={inputCls} style={inputStyle} />
              </label>
              <div className="flex flex-wrap gap-2">
                {!twoFAOn && (
                  <button onClick={enableWithPasskey} disabled={busy || !pw || passkeys.length === 0} title={passkeys.length === 0 ? 'Add a passkey first (the Passkeys box on this page)' : 'Use your passkey as the second sign-in step'} className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50" style={btn(true)}>Turn On With A Passkey</button>
                )}
                {(!twoFAOn || (status && !status.authenticatorApp)) && (
                  <button onClick={enable2FA} disabled={busy || !pw} title="Set up a 6-digit code from an authenticator app" className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50" style={btn(twoFAOn ? true : false)}>{twoFAOn ? 'Add An Authenticator App' : 'Turn On With An Authenticator App'}</button>
                )}
                {twoFAOn && (
                  <button onClick={disable2FA} disabled={busy || !pw} title="Sign in with only your password again" className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-50" style={btn(false)}>Turn Off</button>
                )}
              </div>
              {!twoFAOn && passkeys.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--c-muted)' }}>To use a passkey here, add one in the Passkeys box first.</p>
              )}
            </div>
          )}
        </Card>

        {/* Passkeys */}
        <Card icon={Fingerprint} title={`Passkeys · ${passkeys.length}`}>
          <div className="space-y-2">
            {passkeys.length > 0 && (
              <div className="space-y-1">
                {passkeys.map(pk => (
                  <div key={pk.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--c-subtle-5)' }}>
                    <span style={{ color: 'var(--c-text-primary)' }}>{pk.name || 'Device'}</span>
                    {confirmRemove === pk.id ? (
                      <span className="flex items-center gap-2">
                        <span style={{ color: 'var(--c-dim)' }}>Remove this passkey?</span>
                        <button onClick={() => removePasskey(pk.id)} disabled={busy} style={{ color: '#ef4444', cursor: 'pointer' }}>Remove</button>
                        <button onClick={() => setConfirmRemove(null)} disabled={busy} style={{ color: 'var(--c-dim)', cursor: 'pointer' }}>Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmRemove(pk.id)} disabled={busy} title={`Remove the passkey ${pk.name || 'Device'}`} aria-label={`Remove the passkey ${pk.name || 'Device'}`} style={{ color: 'var(--c-muted)', cursor: 'pointer' }}><Trash2 size={12} aria-hidden="true" /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <input value={pkName} onChange={e => setPkName(e.target.value)} placeholder="Passkey name (e.g. MacBook)" className={inputCls} style={inputStyle} />
            <button onClick={addPasskey} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Add A Passkey</button>
          </div>
        </Card>

        {/* Change password */}
        <Card icon={KeyRound} title="Change password">
          <div className="space-y-2">
            <input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="Current password" className={inputCls} style={inputStyle} />
            <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="New password" className={inputCls} style={inputStyle} />
            <button onClick={changePassword} disabled={busy || !cur || !next} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Update password</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
