'use client';

import { createClient } from '@neondatabase/neon-js';
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters';

/**
 * The browser client, built with the two-URL object form.
 *
 * It does two jobs:
 *   1. Authentication (sign up / sign in / sign out / session).
 *   2. READS of the contacts table, straight against the Neon Data API.
 *
 * Reading directly from the browser is safe *because* Row Level Security is
 * enforced inside Postgres: the JWT this client attaches carries the user's id
 * as its `sub` claim, and every policy on `contacts` compares that to
 * `user_id`. Nothing here is a trusted boundary — see lib/neon-server.ts for
 * the one that is.
 *
 * WRITES deliberately do not go through this client; they are sent to
 * /api/contacts so validation runs in server code the user cannot edit.
 */

// Read statically so Next.js can inline them at build time.
const authUrl = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const dataApiUrl = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

/** True when the app has not been pointed at a Neon project yet. */
export const isNeonConfigured = Boolean(authUrl && dataApiUrl);

type NeonBrowserClient = ReturnType<typeof buildClient>;

function buildClient() {
  return createClient({
    auth: {
      // Placeholders keep module evaluation from throwing when the app is
      // unconfigured; the UI shows a setup notice instead of a blank screen.
      url: authUrl ?? 'https://neon-auth-url-not-configured.invalid/auth',
      adapter: BetterAuthReactAdapter(),
    },
    dataApi: {
      url: dataApiUrl ?? 'https://neon-data-api-url-not-configured.invalid/rest/v1',
    },
  });
}

let cached: NeonBrowserClient | null = null;

/**
 * Memoised so every component shares one client — `useSession()` is a hook and
 * needs a stable instance across renders.
 */
export function getNeon(): NeonBrowserClient {
  if (!cached) cached = buildClient();
  return cached;
}

/**
 * The signed JWT for the current session, or null when signed out.
 *
 * This is the same token the client attaches to its own Data API reads. It is
 * forwarded to our API routes so the server can act as the user without ever
 * holding a database credential.
 */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getNeon().auth.getSession();
  return data?.session?.token ?? null;
}
