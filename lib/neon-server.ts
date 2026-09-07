import { createClient } from '@neondatabase/neon-js';

/**
 * Server-side Data API access.
 *
 * This module must never be imported from a client component. It builds the
 * external-auth form of the client — no Neon Auth session of its own, just a
 * token provider — so the server acts strictly *as the calling user*.
 *
 * The server holds no database credential and no service role: if the token is
 * missing, expired, or forged, Neon rejects the request, and RLS still scopes
 * whatever gets through to that user's own rows. The server cannot read another
 * user's data even if this code were buggy.
 */

/** Extract a bearer token from an Authorization header. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;

  const [scheme, ...rest] = header.split(' ');
  if (scheme.toLowerCase() !== 'bearer') return null;

  const token = rest.join(' ').trim();
  return token === '' ? null : token;
}

/** A Data API client that acts as the holder of `token`. */
export function dataApiAs(token: string) {
  const url = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_NEON_DATA_API_URL is not set — see .env.example');
  }

  return createClient({
    dataApi: {
      url,
      // Consulted lazily on every request.
      getToken: async () => token,
    },
  });
}
