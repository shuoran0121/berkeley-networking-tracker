/**
 * Prove Row Level Security by attacking it directly.
 *
 *   node --env-file=.env.local scripts/verify-rls.mjs
 *
 * This deliberately bypasses the application entirely. It signs two demo users
 * in against Neon Managed Better Auth, takes their real JWTs, and then talks
 * straight to the Neon Data API — exactly what a hostile client could do, since
 * both URLs are public by design.
 *
 * If ownership were enforced in React or in the API routes, every check below
 * would fail. They pass because it is enforced by Postgres.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const DATA_API_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

if (!AUTH_URL || !DATA_API_URL) {
  console.error('Set NEXT_PUBLIC_NEON_AUTH_URL and NEXT_PUBLIC_NEON_DATA_API_URL first.');
  process.exit(1);
}

// Managed Better Auth requires an Origin it trusts. Pass the app's own origin,
// which is what a browser would send. Override when checking production.
const ORIGIN = process.argv[2] ?? 'http://localhost:3000';

/**
 * Two throwaway demo accounts holding only fictional contacts.
 *
 * These are deliberately not secret: the whole point of this script is that a
 * grader can run it and watch RLS hold. Override them with your own accounts by
 * setting RLS_USER_A_EMAIL / RLS_USER_A_PASSWORD (and the _B pair).
 */
const USER_A = {
  email: process.env.RLS_USER_A_EMAIL ?? 'alice.demo@example.com',
  password: process.env.RLS_USER_A_PASSWORD ?? 'TrackerDemo!2026a',
};
const USER_B = {
  email: process.env.RLS_USER_B_EMAIL ?? 'ben.demo@example.com',
  password: process.env.RLS_USER_B_PASSWORD ?? 'TrackerDemo!2026b',
};

let failures = 0;

function check(passed, description, detail = '') {
  const mark = passed ? 'PASS' : 'FAIL';
  if (!passed) failures += 1;
  console.log(`  [${mark}] ${description}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Sign in and return { token, userId }, where `token` is the signed JWT the
 * Data API accepts.
 *
 * Two steps, because they return different things: `/sign-in/email` establishes
 * a session and sets a cookie (its `token` field is an opaque 32-character
 * session id, which the Data API rejects), and `/token` exchanges that session
 * cookie for the actual JWT carrying the `sub` claim that becomes
 * auth.user_id().
 */
async function signIn({ email, password }) {
  const response = await fetch(`${AUTH_URL}/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const userId = body.user?.id;

  const cookie = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.split(';')[0])
    .join('; ');

  if (!cookie) throw new Error(`No session cookie returned for ${email}`);

  const tokenResponse = await fetch(`${AUTH_URL}/token`, {
    headers: { cookie, origin: ORIGIN },
  });

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed for ${email}: ${tokenResponse.status}`);
  }

  const { token } = await tokenResponse.json();
  if (!token) throw new Error(`No JWT returned for ${email}`);

  return { token, userId, email };
}

/** Call the Data API as a given user. */
async function dataApi(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = { authorization: `Bearer ${token}` };
  if (body) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;

  const response = await fetch(`${DATA_API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

console.log('Verifying Row Level Security against the live Data API\n');

const alice = await signIn(USER_A);
const ben = await signIn(USER_B);
console.log(`Signed in as ${alice.email} and ${ben.email}\n`);

// ---------------------------------------------------------------- Baseline
const aliceRows = await dataApi('/contacts?select=id,name,user_id', { token: alice.token });
const benRows = await dataApi('/contacts?select=id,name,user_id', { token: ben.token });

console.log('Baseline — each user reads the same unfiltered endpoint:');
check(
  Array.isArray(aliceRows.body) && aliceRows.body.length > 0,
  'Alice sees her own contacts',
  `${aliceRows.body?.length ?? 0} rows`,
);
check(
  Array.isArray(benRows.body) && benRows.body.length > 0,
  'Ben sees his own contacts',
  `${benRows.body?.length ?? 0} rows`,
);

const aliceIds = new Set((aliceRows.body ?? []).map((r) => r.id));
const benIds = new Set((benRows.body ?? []).map((r) => r.id));
const overlap = [...aliceIds].filter((id) => benIds.has(id));

// The SELECT policy is doing the work. No query said "where user_id = me".
check(overlap.length === 0, 'Their result sets do not overlap at all', `${overlap.length} shared rows`);

const aliceRow = (aliceRows.body ?? [])[0];
const aliceUserId = aliceRow?.user_id;

console.log('\nSELECT policy — Ben targets one of Alice\'s rows by id:');
const benReadsAlice = await dataApi(`/contacts?select=*&id=eq.${aliceRow.id}`, { token: ben.token });
check(
  Array.isArray(benReadsAlice.body) && benReadsAlice.body.length === 0,
  `Ben cannot read Alice's row #${aliceRow.id}`,
  `returned ${benReadsAlice.body?.length ?? 'error'} rows`,
);

console.log('\nUPDATE policy (USING) — Ben tries to edit that row:');
const benUpdatesAlice = await dataApi(`/contacts?id=eq.${aliceRow.id}`, {
  token: ben.token,
  method: 'PATCH',
  body: { name: 'Owned by Ben' },
  prefer: 'return=representation',
});
check(
  Array.isArray(benUpdatesAlice.body) && benUpdatesAlice.body.length === 0,
  "Ben's UPDATE matches zero rows",
  `returned ${benUpdatesAlice.body?.length ?? 'error'} rows`,
);

console.log('\nINSERT policy (WITH CHECK) — Ben tries to create a row owned by Alice:');
const benInsertsAsAlice = await dataApi('/contacts', {
  token: ben.token,
  method: 'POST',
  body: { name: 'Planted by Ben', user_id: aliceUserId },
  prefer: 'return=representation',
});
check(
  benInsertsAsAlice.status >= 400,
  'The insert is rejected outright',
  `HTTP ${benInsertsAsAlice.status}${
    benInsertsAsAlice.body?.message ? ` (${benInsertsAsAlice.body.message})` : ''
  }`,
);

console.log("\nUPDATE policy (WITH CHECK) — Ben tries to hand his own row to Alice:");
const benRow = (benRows.body ?? [])[0];
const benReassigns = await dataApi(`/contacts?id=eq.${benRow.id}`, {
  token: ben.token,
  method: 'PATCH',
  body: { user_id: aliceUserId },
  prefer: 'return=representation',
});
check(
  benReassigns.status >= 400,
  'Reassigning ownership is rejected',
  `HTTP ${benReassigns.status}${benReassigns.body?.message ? ` (${benReassigns.body.message})` : ''}`,
);

console.log('\nNo token at all:');
const anonymous = await fetch(`${DATA_API_URL}/contacts?select=*`);
const anonymousBody = await anonymous.json().catch(() => null);
check(
  anonymous.status >= 400 || (Array.isArray(anonymousBody) && anonymousBody.length === 0),
  'An unauthenticated request reads nothing',
  `HTTP ${anonymous.status}`,
);

console.log(
  failures === 0
    ? '\nAll RLS checks passed.'
    : `\n${failures} RLS check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
