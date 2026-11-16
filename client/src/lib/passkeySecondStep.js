import { startAuthentication } from '@simplewebauthn/browser';
import { authClient } from './authClient';

// Client side of "passkey as the second sign-in step" (server: server/lib/passkeySecondStep.js).
// After the password is accepted the server holds a pending sign-in; these calls finish it with a passkey.

async function post(path, body) {
  const { data, error } = await authClient.$fetch(path, { method: 'POST', body: body || {} });
  if (error) throw new Error(error.message || 'Something went wrong. Try again.');
  return data;
}

/** Whether the person signing in has a passkey they can use for the second step. */
export async function passkeySecondStepAvailable() {
  try { return !!(await post('/passkey-2fa/options')).available; } catch { return false; }
}

/** Asks the device for the passkey and finishes the sign-in. Throws an Error with a plain message on failure. */
export async function finishWithPasskey() {
  const { available, options } = await post('/passkey-2fa/options');
  if (!available) throw new Error('No passkey is set up for this account.');
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch {
    throw new Error('The passkey prompt was closed or timed out. Try again.');
  }
  await post('/passkey-2fa/verify', { response });
  // The session cookie is set now; tell the session hook to re-read it.
  authClient.$store?.notify?.('$sessionSignal');
}

/** Which second steps the signed-in person has: { enabled, authenticatorApp, passkeys }. */
export async function secondStepStatus() {
  const { data, error } = await authClient.$fetch('/passkey-2fa/status', { method: 'GET' });
  if (error) throw new Error(error.message || 'Could not read your sign-in settings.');
  return data;
}

/**
 * Turns two-step sign-in on with a passkey as the second step (needs the password and at least one passkey).
 * Returns the backup codes to show the person once.
 */
export async function enablePasskeySecondStep(password) {
  // First make the backup codes (one-time codes for getting in if the passkey is lost). The library's own endpoint stores them
  // and returns them once; its authenticator-app key is ignored here, so no app is set up.
  const { data, error } = await authClient.twoFactor.enable({ password });
  if (error) throw new Error(error.message || 'That password is not correct.');
  await post('/passkey-2fa/enable', { password });
  return data?.backupCodes || [];
}
