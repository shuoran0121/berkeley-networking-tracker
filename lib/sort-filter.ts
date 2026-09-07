import { PRIORITIES, type Priority } from './types';

/**
 * Sorting and filtering are driven by user input, so the column that reaches
 * the database is chosen from this allowlist rather than interpolated. An
 * unrecognised key is rejected outright instead of being passed through.
 */
export const SORT_COLUMNS = {
  name: 'name',
  company: 'company',
  // Text ordering of `priority` would give high -> low -> medium; the
  // generated `priority_rank` column orders them correctly.
  priority: 'priority_rank',
  created_at: 'created_at',
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;

export const SORT_KEYS = Object.keys(SORT_COLUMNS) as SortKey[];
export const DEFAULT_SORT: SortKey = 'created_at';
export const DEFAULT_DIRECTION: SortDirection = 'desc';

export type SortDirection = 'asc' | 'desc';

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && value in SORT_COLUMNS;
}

export function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc';
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

/**
 * Resolve a user-supplied sort key to a real column name.
 * Returns null when the key is not allowlisted.
 */
export function resolveSortColumn(key: unknown): string | null {
  return isSortKey(key) ? SORT_COLUMNS[key] : null;
}

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  company: 'Company',
  priority: 'Priority',
  created_at: 'Date added',
};

/**
 * Strip characters that carry meaning in a PostgREST filter expression.
 *
 * The search term is interpolated into an `or(...)` filter string, so commas,
 * parentheses and backslashes would change the *structure* of the filter rather
 * than the value being matched. `%`, `_` and `*` are wildcards and are removed
 * so that a search means what the user typed.
 */
export function sanitizeSearchTerm(term: string): string {
  return term
    .replace(/[,()\%_*."']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Build the `or(...)` filter matching a term against name or company. */
export function buildSearchFilter(term: string): string | null {
  const safe = sanitizeSearchTerm(term);
  if (safe === '') return null;
  return `name.ilike.*${safe}*,company.ilike.*${safe}*`;
}
