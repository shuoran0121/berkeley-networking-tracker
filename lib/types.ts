/** The only priority values the system accepts, mirrored by a CHECK constraint. */
export const PRIORITIES = ['high', 'medium', 'low'] as const;

export type Priority = (typeof PRIORITIES)[number];

/** A row of the `contacts` table, as returned by the Neon Data API. */
export interface Contact {
  id: number;
  user_id: string;
  name: string;
  company: string | null;
  role: string | null;
  where_met: string | null;
  notes: string | null;
  priority: Priority;
  priority_rank: number;
  created_at: string;
  updated_at: string;
}
