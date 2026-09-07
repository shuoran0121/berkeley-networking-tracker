import { describe, expect, it } from 'vitest';
import {
  contactCreateSchema,
  contactUpdateSchema,
  formatFieldErrors,
  stripUndefined,
} from '@/lib/validation';
import { PRIORITIES } from '@/lib/types';

const valid = {
  name: 'Priya Raman',
  company: 'Berkeley SkyDeck',
  role: 'Program Director',
  where_met: 'SkyDeck Demo Day',
  notes: 'Introduced me to two founders in the cohort.',
  priority: 'high',
};

describe('contactCreateSchema — required fields', () => {
  it('accepts a fully populated contact', () => {
    const result = contactCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = contactCreateSchema.safeParse({ ...valid, name: undefined });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatFieldErrors(result.error).name).toBe('Name is required');
    }
  });

  it('rejects an empty name', () => {
    const result = contactCreateSchema.safeParse({ ...valid, name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatFieldErrors(result.error).name).toBe('Name is required');
    }
  });

  it('rejects a whitespace-only name, which would otherwise look non-empty', () => {
    const result = contactCreateSchema.safeParse({ ...valid, name: '    ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatFieldErrors(result.error).name).toBe('Name is required');
    }
  });

  it('trims surrounding whitespace from an accepted name', () => {
    const result = contactCreateSchema.safeParse({ ...valid, name: '  Dana Wu  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Dana Wu');
  });
});

describe('contactCreateSchema — priority values', () => {
  it.each(PRIORITIES)('accepts the valid priority %s', (priority) => {
    const result = contactCreateSchema.safeParse({ ...valid, priority });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe(priority);
  });

  it('rejects a priority outside the allowed set', () => {
    const result = contactCreateSchema.safeParse({ ...valid, priority: 'urgent' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatFieldErrors(result.error).priority).toBe(
        'Priority must be one of: high, medium, low',
      );
    }
  });

  it('rejects a priority that differs only by case', () => {
    const result = contactCreateSchema.safeParse({ ...valid, priority: 'High' });
    expect(result.success).toBe(false);
  });

  it('defaults an omitted priority to medium', () => {
    const result = contactCreateSchema.safeParse({ name: 'Sam Ortiz' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe('medium');
  });
});

describe('contactCreateSchema — optional fields', () => {
  it('normalises blank optional text to null rather than an empty string', () => {
    const result = contactCreateSchema.safeParse({ name: 'Sam Ortiz', company: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.company).toBeNull();
  });

  it('rejects notes longer than the column allows', () => {
    const result = contactCreateSchema.safeParse({ name: 'Sam Ortiz', notes: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe('contactUpdateSchema', () => {
  it('accepts a partial update', () => {
    const result = contactUpdateSchema.safeParse({ priority: 'low' });
    expect(result.success).toBe(true);
  });

  it('still rejects an invalid priority on update', () => {
    const result = contactUpdateSchema.safeParse({ priority: 'someday' });
    expect(result.success).toBe(false);
  });

  it('still rejects a blank name on update', () => {
    const result = contactUpdateSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty patch', () => {
    const result = contactUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('stripUndefined', () => {
  it('removes omitted keys so a patch never nulls a field by accident', () => {
    expect(stripUndefined({ name: 'A', company: undefined })).toEqual({ name: 'A' });
  });

  it('keeps explicit nulls, which are a real "clear this field" instruction', () => {
    expect(stripUndefined({ company: null })).toEqual({ company: null });
  });
});
