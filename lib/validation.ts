import { z } from 'zod';
import { PRIORITIES } from './types';

/**
 * Backend validation for contact writes.
 *
 * This module is the trusted server-side gate: it runs inside the API route
 * handlers, which the browser cannot modify. It is deliberately mirrored by
 * CHECK constraints in db/schema.sql, so that a caller who skips these routes
 * and writes straight to the Data API still cannot store an empty name or an
 * invalid priority.
 */

/** Optional free-text field: blank input is normalised to NULL rather than "". */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .max(max, `${label} must be ${max} characters or fewer`)
    .nullish()
    .transform((value) => {
      if (value == null) return null;
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    });

/**
 * The field definitions, without any default. The create and update schemas are
 * both built from these so the two can never drift apart.
 *
 * `priority`'s default lives only on the create schema: applying it to a patch
 * would silently reset an omitted priority to "medium" on every edit, and would
 * make an empty patch look non-empty.
 */
const contactFields = {
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer'),
  company: optionalText(120, 'Company'),
  role: optionalText(120, 'Role'),
  where_met: optionalText(200, 'Where you met'),
  notes: optionalText(2000, 'Notes'),
  priority: z.enum(PRIORITIES, { error: 'Priority must be one of: high, medium, low' }),
};

export const contactCreateSchema = z.object({
  ...contactFields,
  priority: contactFields.priority.default('medium'),
});

/**
 * PATCH accepts any subset of the create fields, but not an empty object —
 * an empty patch is almost always a client bug, so it fails loudly.
 */
export const contactUpdateSchema = z
  .object(contactFields)
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: 'Provide at least one field to update',
  });

export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

/** Map a Zod failure to `{ field: message }` for rendering next to inputs. */
export function formatFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_';
    // Keep the first error per field; it is the most specific one.
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/** Drop keys the caller omitted so PATCH never overwrites a field with undefined. */
export function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
