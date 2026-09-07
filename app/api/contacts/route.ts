import { NextResponse } from 'next/server';
import { contactCreateSchema, formatFieldErrors } from '@/lib/validation';
import { bearerToken, dataApiAs } from '@/lib/neon-server';
import { dataApiErrorToResponse, jsonError, type DataApiError } from '@/lib/api-errors';

/**
 * POST /api/contacts — create a contact.
 *
 * The trusted server boundary. Order matters:
 *   1. Require a bearer token (401 otherwise).
 *   2. Validate the body (400 with per-field messages otherwise).
 *   3. Write as that user, letting the database stamp ownership.
 *
 * `user_id` is never sent. The column defaults to auth.user_id(), which Neon
 * derives from the verified JWT, so a caller cannot create a row owned by
 * anybody else — the INSERT policy's WITH CHECK would reject it if they tried.
 */
export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return jsonError(401, 'You must be signed in to add a contact.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Request body must be valid JSON.');
  }

  const parsed = contactCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, 'Validation failed', {
      fieldErrors: formatFieldErrors(parsed.error),
    });
  }

  const { data, error } = await dataApiAs(token)
    .from('contacts')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return dataApiErrorToResponse(error as DataApiError);

  return NextResponse.json({ contact: data }, { status: 201 });
}
