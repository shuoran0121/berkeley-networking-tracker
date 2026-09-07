import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/contacts/route';
import { DELETE, PATCH } from '@/app/api/contacts/[id]/route';
import { bearerToken } from '@/lib/neon-server';

/**
 * These exercise the real route handlers. Every case below is rejected before
 * the handler ever reaches the database, so no Neon project is needed to prove
 * that the auth guard and the validation gate work.
 */

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost/api/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/contacts — authentication', () => {
  it('rejects a request with no Authorization header', async () => {
    const response = await POST(json({ name: 'Priya Raman' }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'You must be signed in to add a contact.',
    });
  });

  it('rejects a non-bearer Authorization scheme', async () => {
    const response = await POST(json({ name: 'Priya' }, { authorization: 'Basic abc123' }));
    expect(response.status).toBe(401);
  });

  it('rejects an empty bearer token', async () => {
    const response = await POST(json({ name: 'Priya' }, { authorization: 'Bearer   ' }));
    expect(response.status).toBe(401);
  });
});

describe('POST /api/contacts — backend validation', () => {
  // A token is required to get past the auth gate. It is never verified here:
  // these requests fail validation first, so no Data API call is made.
  const auth = { authorization: 'Bearer test-token-not-used' };

  it('rejects an empty name with a field-level message', async () => {
    const response = await POST(json({ name: '   ', priority: 'high' }, auth));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation failed',
      fieldErrors: { name: 'Name is required' },
    });
  });

  it('rejects an invalid priority with a field-level message', async () => {
    const response = await POST(json({ name: 'Priya Raman', priority: 'urgent' }, auth));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Validation failed',
      fieldErrors: { priority: 'Priority must be one of: high, medium, low' },
    });
  });

  it('rejects a malformed JSON body', async () => {
    const request = new Request('http://localhost/api/contacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: '{not json',
    });
    expect((await POST(request)).status).toBe(400);
  });
});

describe('PATCH and DELETE /api/contacts/:id', () => {
  it('PATCH requires authentication', async () => {
    const response = await PATCH(json({ priority: 'low' }), params('1'));
    expect(response.status).toBe(401);
  });

  it('DELETE requires authentication', async () => {
    const response = await DELETE(json({}), params('1'));
    expect(response.status).toBe(401);
  });

  it('PATCH rejects a non-numeric id before querying', async () => {
    const response = await PATCH(
      json({ priority: 'low' }, { authorization: 'Bearer t' }),
      params('not-an-id'),
    );
    expect(response.status).toBe(400);
  });

  it('PATCH rejects an invalid priority', async () => {
    const response = await PATCH(
      json({ priority: 'someday' }, { authorization: 'Bearer t' }),
      params('1'),
    );
    expect(response.status).toBe(400);
  });

  it('PATCH rejects an empty patch', async () => {
    const response = await PATCH(json({}, { authorization: 'Bearer t' }), params('1'));
    expect(response.status).toBe(400);
  });
});

describe('bearerToken', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://localhost/api/contacts', { headers });

  it('reads a well-formed bearer token', () => {
    expect(bearerToken(req({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
  });

  it('is case-insensitive on the scheme', () => {
    expect(bearerToken(req({ authorization: 'bearer abc' }))).toBe('abc');
  });

  it('returns null when the header is absent', () => {
    expect(bearerToken(req({}))).toBeNull();
  });
});
