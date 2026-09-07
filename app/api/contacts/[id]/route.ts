import { NextResponse } from 'next/server';
import { contactUpdateSchema, formatFieldErrors, stripUndefined } from '@/lib/validation';
import { bearerToken, dataApiAs } from '@/lib/neon-server';
import { dataApiErrorToResponse, jsonError, type DataApiError } from '@/lib/api-errors';

type RouteContext = { params: Promise<{ id: string }> };

/** Contact ids are bigint identities; reject anything that is not one. */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * PATCH /api/contacts/:id — edit a contact.
 *
 * Note what is *not* here: any check that the row belongs to the caller. That
 * is deliberate. The UPDATE policy's USING clause makes a row owned by someone
 * else invisible to this statement, so it matches zero rows and we return 404.
 * Ownership is enforced once, in the database, rather than re-implemented here
 * where it could drift.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const token = bearerToken(request);
  if (!token) {
    return jsonError(401, 'You must be signed in to edit a contact.');
  }

  const id = parseId((await context.params).id);
  if (id === null) return jsonError(400, 'Invalid contact id.');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  const parsed = contactUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'Validation failed', {
      fieldErrors: formatFieldErrors(parsed.error),
    });
  }

  const patch = {
    ...stripUndefined(parsed.data),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select();

  if (error) return dataApiErrorToResponse(error as DataApiError);

  // Empty result means the row does not exist *or* is not visible to this
  // user. Both answers are "404" — telling them apart would leak the fact
  // that somebody else's contact exists.
  if (!data || data.length === 0) {
    return jsonError(404, 'Contact not found.');
  }

  return NextResponse.json({ contact: data[0] });
}

/** DELETE /api/contacts/:id — remove a contact. Ownership enforced by RLS. */
export async function DELETE(request: Request, context: RouteContext) {
  const token = bearerToken(request);
  if (!token) {
    return jsonError(401, 'You must be signed in to delete a contact.');
  }

  const id = parseId((await context.params).id);
  if (id === null) return jsonError(400, 'Invalid contact id.');

  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .delete()
    .eq('id', id)
    .select();

  if (error) return dataApiErrorToResponse(error as DataApiError);

  if (!data || data.length === 0) {
    return jsonError(404, 'Contact not found.');
  }

  return NextResponse.json({ id });
}
