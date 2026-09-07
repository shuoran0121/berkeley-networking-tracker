import { NextResponse } from 'next/server';

/** The error shape the Data API (PostgREST) returns. */
export interface DataApiError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Translate a database error into an HTTP response.
 *
 * Constraint violations are the user's fault and are reported as 400 with the
 * same wording the client-side validation uses. Everything unrecognised is a
 * 500 with a generic message — internal errors are logged, never echoed to the
 * caller, since they can carry schema details.
 */
export function dataApiErrorToResponse(error: DataApiError) {
  const message = error.message ?? '';

  if (message.includes('contacts_name_not_blank')) {
    return jsonError(400, 'Validation failed', { fieldErrors: { name: 'Name is required' } });
  }

  if (message.includes('contacts_priority_valid')) {
    return jsonError(400, 'Validation failed', {
      fieldErrors: { priority: 'Priority must be one of: high, medium, low' },
    });
  }

  // JWT rejected by Neon: expired, malformed, or signed by someone else.
  if (error.code === 'PGRST301' || /jwt|token/i.test(message)) {
    return jsonError(401, 'Your session has expired. Please sign in again.');
  }

  // RLS or missing grant.
  if (error.code === '42501') {
    return jsonError(403, 'You do not have access to that contact.');
  }

  console.error('[contacts] unexpected Data API error', error);
  return jsonError(500, 'Something went wrong saving your contact.');
}
