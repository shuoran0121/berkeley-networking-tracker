import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  isPriority,
  isSortDirection,
  resolveSortColumn,
  SORT_KEYS,
  buildSearchFilter,
  sanitizeSearchTerm,
} from '@/lib/sort-filter';

describe('resolveSortColumn', () => {
  it.each(SORT_KEYS)('resolves the allowlisted key %s', (key) => {
    expect(resolveSortColumn(key)).toBeTruthy();
  });

  it('maps priority to the generated rank column so high sorts before medium', () => {
    expect(resolveSortColumn('priority')).toBe('priority_rank');
  });

  it('rejects a column that is not allowlisted', () => {
    expect(resolveSortColumn('user_id')).toBeNull();
  });

  it('rejects an injection-shaped value instead of passing it through', () => {
    expect(resolveSortColumn('name; drop table contacts')).toBeNull();
  });

  it('rejects non-string input', () => {
    expect(resolveSortColumn(undefined)).toBeNull();
    expect(resolveSortColumn(null)).toBeNull();
    expect(resolveSortColumn(7)).toBeNull();
  });

  it('has a default sort that is itself allowlisted', () => {
    expect(resolveSortColumn(DEFAULT_SORT)).toBeTruthy();
  });
});

describe('guards', () => {
  it('accepts only asc and desc as directions', () => {
    expect(isSortDirection('asc')).toBe(true);
    expect(isSortDirection('desc')).toBe(true);
    expect(isSortDirection('sideways')).toBe(false);
  });

  it('accepts only the three priorities', () => {
    expect(isPriority('high')).toBe(true);
    expect(isPriority('urgent')).toBe(false);
  });
});

describe('search filter construction', () => {
  it('matches the term against both name and company', () => {
    expect(buildSearchFilter('raman')).toBe('name.ilike.*raman*,company.ilike.*raman*');
  });

  it('returns null for a blank term so no filter is applied', () => {
    expect(buildSearchFilter('   ')).toBeNull();
  });

  it('strips characters that would change the filter structure', () => {
    const filter = buildSearchFilter('a,b(c)d');
    expect(filter).toBe('name.ilike.*a b c d*,company.ilike.*a b c d*');
  });

  it('strips wildcards so a search means what was typed', () => {
    expect(sanitizeSearchTerm('%_*')).toBe('');
  });

  it('caps very long terms', () => {
    expect(sanitizeSearchTerm('x'.repeat(500))).toHaveLength(80);
  });
});
