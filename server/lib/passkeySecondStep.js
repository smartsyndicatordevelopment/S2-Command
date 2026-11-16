/**
 * Passkey as the second sign-in step.
 *
 * better-auth's two-factor plugin only knows authenticator-app codes. This small plugin lets a passkey (a key held by the
 * device: fingerprint, face, Windows Hello or a hardware key) be the second step after the password instead.
 *
 * How it fits with the two-factor plugin:
 *   - "Two-step sign-in is on" is the same flag the two-factor plugin uses (user.twoFactorEnabled). With it on, a correct
 *     password does NOT sign in; the plugin sets a short-lived signed "two_factor" cookie that names the pending sign-in.
 *   - POST /passkey-2fa/options  reads that cookie and returns a passkey challenge limited to that user's own passkeys.
 *   - POST /passkey-2fa/verify   checks the answer and only then creates the session.
 *   - POST /passkey-2fa/enable   (signed in, password required, at least one passkey, backup codes already made) turns two-step
 *     sign-in on without an authenticator app. Backup codes (one-time codes for when the passkey is lost) come from the
 *     two-factor plugin: the client calls /two-factor/enable first, which stores them, and they are entered at sign-in
 *     through the plugin's own /two-factor/verify-backup-code.
 *   - GET  /passkey-2fa/status   (signed in) says which second steps the user has.
 *   - Removing the last passkey is refused while it is the only second step, so the owner cannot lock themselves out.
 *
 * The challenge is stored server-side under an identifier derived from the pending sign-in, so it cannot be replayed for a
 * different sign-in, and it is consumed on first use. Failed tries share the two-factor plugin's per-sign-in attempt counter.
 */
const TWO_FACTOR_COOKIE = 'two_factor';
const CHALLENGE_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

async function buildPasskeySecondStep({ rpID, origin }) {
  const { createAuthEndpoint, createAuthMiddleware } = await import('@better-auth/core/api');
  const { APIError } = await import('@better-auth/core/error');
  const { base64 } = await import('@better-auth/utils/base64');
  const { generateAuthenticationOptions, verifyAuthenticationResponse } = await import('@simplewebauthn/server');
  const { sessionMiddleware, getSessionFromCtx } = await import('better-auth/api');
  const { setSessionCookie, expireCookie } = await import('better-auth/cookies');
  const z = await import('zod');

  const unauthorized = (message) => new APIError('UNAUTHORIZED', { message });
  const bad = (message) => new APIError('BAD_REQUEST', { message });
  const EXPIRED = 'Your sign-in timed out. Enter your password again.';

  // The pending sign-in named by the signed two_factor cookie: { identifier, user, expiresAt, cookie } or a thrown 401.
  async function pendingSignIn(ctx) {
    const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE);
    const identifier = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
    if (!identifier) throw unauthorized(EXPIRED);
    const record = await ctx.context.internalAdapter.findVerificationValue(identifier);
    if (!record || new Date(record.expiresAt).getTime() <= Date.now()) throw unauthorized(EXPIRED);
    const user = await ctx.context.internalAdapter.findUserById(record.value);
    if (!user || !user.twoFactorEnabled) throw unauthorized(EXPIRED);
    return { identifier, user, expiresAt: record.expiresAt, cookie };
  }

  const passkeysOf = (ctx, userId) => ctx.context.adapter.findMany({ model: 'passkey', where: [{ field: 'userId', value: userId }] });

  async function hasAuthenticatorApp(ctx, userId) {
    const row = await ctx.context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: userId }] });
    return !!row && row.verified !== false;
  }

  // Counts one try against the pending sign-in (same counter the authenticator-code step uses). Returns a function that
  // records a failure. Once the tries are used up the pending sign-in is cancelled and the password must be entered again.
  async function beginAttempt(ctx, pending) {
    const id = `2fa-attempts-${pending.identifier}`;
    const consumed = await ctx.context.internalAdapter.consumeVerificationValue(id).catch(() => null);
    if (!consumed) throw unauthorized(EXPIRED);
    const parsed = Number(consumed.value);
    const attempts = Number.isInteger(parsed) && parsed >= 0 ? parsed : MAX_ATTEMPTS;
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.context.internalAdapter.consumeVerificationValue(pending.identifier).catch(() => {});
      expireCookie(ctx, pending.cookie);
      throw bad('Too many tries. Enter your password again.');
    }
    const rearm = (count) => ctx.context.internalAdapter.createVerificationValue({ value: `${count}`, identifier: id, expiresAt: pending.expiresAt }).catch(() => {});
    return { fail: () => rearm(attempts + 1), restore: () => rearm(attempts) };
  }

  const challengeId = (pending) => `pk2fa-${pending.identifier}`;

  return {
    id: 'passkey-second-step',
    endpoints: {
      passkeySecondStepOptions: createAuthEndpoint('/passkey-2fa/options', { method: 'POST' }, async (ctx) => {
        const pending = await pendingSignIn(ctx);
        const passkeys = await passkeysOf(ctx, pending.user.id);
        if (!passkeys.length) return ctx.json({ available: false });
        const options = await generateAuthenticationOptions({
          rpID,
          userVerification: 'preferred',
          allowCredentials: passkeys.map((p) => ({ id: p.credentialID, transports: p.transports ? p.transports.split(',') : undefined })),
        });
        await ctx.context.internalAdapter.deleteVerificationByIdentifier(challengeId(pending)).catch(() => {});
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: challengeId(pending),
          value: JSON.stringify({ expectedChallenge: options.challenge, userId: pending.user.id }),
          expiresAt: new Date(Math.min(Date.now() + CHALLENGE_TTL_SECONDS * 1000, new Date(pending.expiresAt).getTime())),
        });
        return ctx.json({ available: true, options });
      }),

      passkeySecondStepVerify: createAuthEndpoint('/passkey-2fa/verify', {
        method: 'POST',
        body: z.object({ response: z.record(z.any(), z.any()) }),
      }, async (ctx) => {
        const pending = await pendingSignIn(ctx);
        const attempt = await beginAttempt(ctx, pending);
        const FAILED = 'That passkey could not be verified. Try again.';
        const fail = async (message = FAILED) => { await attempt.fail(); return unauthorized(message); };

        const stored = await ctx.context.internalAdapter.consumeVerificationValue(challengeId(pending)).catch(() => null);
        if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) throw await fail();
        let challenge;
        try { challenge = JSON.parse(stored.value); } catch { throw await fail(); }
        if (!challenge || challenge.userId !== pending.user.id || !challenge.expectedChallenge) throw await fail();

        const resp = ctx.body.response;
        if (typeof resp.id !== 'string' || !resp.id) throw await fail();
        const passkey = await ctx.context.adapter.findOne({
          model: 'passkey',
          where: [{ field: 'credentialID', value: resp.id }, { field: 'userId', value: pending.user.id }],
        });
        // The passkey must belong to the person whose password was just accepted.
        if (!passkey || passkey.userId !== pending.user.id) throw await fail();

        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response: resp,
            expectedChallenge: challenge.expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
              id: passkey.credentialID,
              publicKey: base64.decode(passkey.publicKey),
              counter: passkey.counter,
              transports: passkey.transports ? passkey.transports.split(',') : undefined,
            },
            requireUserVerification: false,
          });
        } catch (err) {
          ctx.context.logger.warn(`passkey second step failed to verify: ${err?.name || 'Error'}`);
          throw await fail();
        }
        if (!verification.verified) throw await fail();

        // Use up the pending sign-in. Only one request can win this, so a replayed answer cannot create a second session.
        const consumed = await ctx.context.internalAdapter.consumeVerificationValue(pending.identifier);
        if (!consumed || consumed.value !== pending.user.id) {
          expireCookie(ctx, pending.cookie);
          throw unauthorized(EXPIRED);
        }
        await ctx.context.adapter.update({
          model: 'passkey',
          where: [{ field: 'id', value: passkey.id }],
          update: { counter: verification.authenticationInfo.newCounter },
        });
        const dontRememberMe = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret);
        const session = await ctx.context.internalAdapter.createSession(pending.user.id, !!dontRememberMe);
        if (!session) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Could not start the session.' });
        await setSessionCookie(ctx, { session, user: pending.user }, !!dontRememberMe);
        expireCookie(ctx, pending.cookie);
        return ctx.json({ ok: true });
      }),

      passkeySecondStepStatus: createAuthEndpoint('/passkey-2fa/status', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
        const user = ctx.context.session.user;
        const [passkeys, authenticatorApp, row] = await Promise.all([
          passkeysOf(ctx, user.id), hasAuthenticatorApp(ctx, user.id),
          ctx.context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: user.id }] }),
        ]);
        // Backup codes live on the two-factor row (made by /two-factor/enable); they work even with no authenticator app.
        return ctx.json({ enabled: !!user.twoFactorEnabled, authenticatorApp, passkeys: passkeys.length, backupCodes: !!row?.backupCodes });
      }),

      passkeySecondStepEnable: createAuthEndpoint('/passkey-2fa/enable', {
        method: 'POST',
        body: z.object({ password: z.string().min(1) }),
        use: [sessionMiddleware],
      }, async (ctx) => {
        const user = ctx.context.session.user;
        const accounts = await ctx.context.internalAdapter.findAccounts(user.id);
        const hash = accounts?.find((a) => a.providerId === 'credential' && a.password)?.password;
        if (!hash || !(await ctx.context.password.verify({ hash, password: ctx.body.password }))) throw bad('That password is not correct.');
        const passkeys = await passkeysOf(ctx, user.id);
        if (!passkeys.length) throw bad('Add a passkey first, then turn this on.');
        // Backup codes are the way back in if the passkey is lost, so they must exist first. The client makes them by calling
        // /two-factor/enable (which stores them and shows them once) right before this.
        const row = await ctx.context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: user.id }] });
        if (!row?.backupCodes) throw bad('Backup codes have not been made yet. Try turning this on again.');
        // A browser remembered from an earlier setup must not skip the new second step.
        await ctx.context.adapter.deleteMany({
          model: 'verification',
          where: [{ field: 'value', value: user.id }, { field: 'identifier', operator: 'starts_with', value: 'trust-device-' }],
        }).catch(() => {});
        const updated = await ctx.context.internalAdapter.updateUser(user.id, { twoFactorEnabled: true });
        await setSessionCookie(ctx, { session: ctx.context.session.session, user: updated });
        return ctx.json({ ok: true });
      }),
    },
    hooks: {
      before: [{
        matcher: (context) => context.path === '/passkey/delete-passkey',
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx);
          if (!session?.user?.twoFactorEnabled) return;
          const [passkeys, authenticatorApp] = await Promise.all([passkeysOf(ctx, session.user.id), hasAuthenticatorApp(ctx, session.user.id)]);
          const removing = passkeys.some((p) => p.id === ctx.body?.id);
          if (removing && passkeys.length <= 1 && !authenticatorApp) {
            throw bad('This is your only second sign-in step. Add another passkey or an authenticator app, or turn two-step sign-in off, before removing it.');
          }
        }),
      }],
    },
    rateLimit: [{ pathMatcher: (path) => path.startsWith('/passkey-2fa/'), window: 10, max: 5 }],
  };
}

module.exports = { buildPasskeySecondStep, MAX_ATTEMPTS };
