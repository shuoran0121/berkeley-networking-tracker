'use client';

import { getAccessToken } from './neon-browser';
import type { Contact } from './types';
import type { ContactCreateInput, ContactUpdateInput } from './validation';

/**
 * Client-side wrapper for the write API.
 *
 * Writes go to our own /api/contacts routes rather than straight to the Data
 * API, so that validation runs in server code. The session JWT is forwarded as
 * a bearer token; the server uses it to act as this user and never holds a
 * database credential of its own.
 */

/** An error carrying the per-field messages the API returned, when it had any. */
export class ApiError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.fieldErrors = fieldErrors;
  }
}

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new ApiError('Your session has expired. Please sign in again.');
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    fieldErrors?: Record<string, string>;
  } & T;

  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Something went wrong.', payload.fieldErrors ?? {});
  }

  return payload;
}

export function createContact(input: ContactCreateInput) {
  return request<{ contact: Contact }>('/api/contacts', 'POST', input);
}

export function updateContact(id: number, input: ContactUpdateInput) {
  return request<{ contact: Contact }>(`/api/contacts/${id}`, 'PATCH', input);
}

export function deleteContact(id: number) {
  return request<{ id: number }>(`/api/contacts/${id}`, 'DELETE');
}
