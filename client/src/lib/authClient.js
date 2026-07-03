import { createAuthClient } from 'better-auth/react';
import { twoFactorClient, adminClient } from 'better-auth/client/plugins';
import { passkeyClient } from '@better-auth/passkey/client';

// Same-origin: the better-auth handler is mounted at /api/auth on this host.
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: '/api/auth',
  plugins: [twoFactorClient(), adminClient(), passkeyClient()],
});

export const { signIn, signUp, signOut, useSession, twoFactor, passkey } = authClient;
