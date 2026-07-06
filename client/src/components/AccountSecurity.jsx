import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, KeyRound, Fingerprint, Trash2 } from 'lucide-react';
import { authClient } from '../lib/authClient';

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
  const twoFAOn = !!user?.twoFactorEnabled;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const flash = (m, isErr) => { setMsg(isErr ? '' : m); setErr(isErr ? m : ''); };

  // ---- 2FA ----
  const [pw, setPw] = useState('');
  const [setup, setSetup] = useState(null); // { totpURI, backupCodes }
  const [code, setCode] = useState('');
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
      setSetup(null); setCode(''); setPw(''); flash('Two-factor is on.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }
  async function disable2FA() {
    setBusy(true); flash('');
    try {
      const { error } = await authClient.twoFactor.disable({ password: pw });
      if (error) throw new Error(error.message);
      setPw(''); flash('Two-factor disabled.');
    } catch (e) { flash(e.message, true); }
    setBusy(false);
  }

  // ---- Passkeys ----
  const [passkeys, setPasskeys] = useState([]);
  const [pkName, setPkName] = useState('');
  const loadPasskeys = useCallback(async () => {
    try { const { data } = await authClient.passkey.listUserPasskeys(); setPasskeys(data || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadPasskeys(); }, [loadPasskeys]);

  async function addPasskey() {
    setBusy(true); flash('');
    try {
      const res = await authClient.passkey.addPasskey({ name: pkName || 'My device' });
      if (res?.error) throw new Error(res.error.message);
      setPkName(''); await loadPasskeys(); flash('Passkey added.');
    } catch (e) { flash(e.message || 'Passkey registration was cancelled or failed.', true); }
    setBusy(false);
  }
  async function removePasskey(id) {
    setBusy(true); flash('');
    try { await authClient.passkey.deletePasskey({ id }); await loadPasskeys(); } catch (e) { flash(e.message, true); }
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
      {(msg || err) && <p className="text-xs" style={{ color: err ? '#ef4444' : '#8b74ff' }}>{err || msg}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 2FA */}
        <Card icon={ShieldCheck} title={`Two-Factor Authentication ${twoFAOn ? '· On' : '· Off'}`}>
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
              <button onClick={confirm2FA} disabled={busy || code.length !== 6} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Confirm & enable</button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: 'var(--c-dim)' }}>
                {twoFAOn ? 'Enter your password to turn off 2FA.' : 'Protect your login with an authenticator app.'}
              </p>
              <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Current password" className={inputCls} style={inputStyle} />
              {twoFAOn
                ? <button onClick={disable2FA} disabled={busy || !pw} className="text-xs px-3 py-1.5 rounded-lg" style={btn(false)}>Disable 2FA</button>
                : <button onClick={enable2FA} disabled={busy || !pw} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Enable 2FA</button>}
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
                    <button onClick={() => removePasskey(pk.id)} disabled={busy} title="Remove" style={{ color: 'var(--c-muted)', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <input value={pkName} onChange={e => setPkName(e.target.value)} placeholder="Passkey name (e.g. MacBook)" className={inputCls} style={inputStyle} />
            <button onClick={addPasskey} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg" style={btn(true)}>Add a passkey</button>
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
