'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getNeon } from '@/lib/neon-browser';
import { ApiError, createContact, deleteContact, updateContact } from '@/lib/contacts-api';
import {
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  SORT_KEYS,
  SORT_LABELS,
  buildSearchFilter,
  resolveSortColumn,
  type SortDirection,
  type SortKey,
} from '@/lib/sort-filter';
import { PRIORITIES, type Contact, type Priority } from '@/lib/types';
import ContactDialog, { type ContactDraft } from '@/components/contact-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Status = 'loading' | 'ready' | 'error';
type PriorityFilter = Priority | 'all';

const PRIORITY_STYLES: Record<Priority, string> = {
  high: 'border-transparent bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  medium: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-transparent bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge className={PRIORITY_STYLES[priority] + ' capitalize'} variant="outline">
      {priority}
    </Badge>
  );
}

export default function ContactsApp({ email }: { email: string }) {
  const neon = getNeon();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT);
  const [direction, setDirection] = useState<SortDirection>(DEFAULT_DIRECTION);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce the search box so typing does not fire a query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  /**
   * Reads go straight from the browser to the Neon Data API. There is no
   * `.eq('user_id', ...)` here on purpose: the SELECT policy already restricts
   * the result to this user's rows inside Postgres. Filtering here as well
   * would imply the security lived in the client, which it does not.
   */
  const loadContacts = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);

    const fallback = resolveSortColumn(DEFAULT_SORT) as string;
    const column = resolveSortColumn(sortKey) ?? fallback;

    let query = neon.from('contacts').select('*');

    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter);

    const searchFilter = buildSearchFilter(debouncedSearch);
    if (searchFilter) query = query.or(searchFilter);

    const { data, error } = await query.order(column, { ascending: direction === 'asc' });

    if (error) {
      const expired = (error.message ?? '').toLowerCase().includes('jwt');
      setLoadError(
        expired
          ? 'Your session has expired. Please sign in again.'
          : 'Could not load your contacts.',
      );
      setStatus('error');
      return;
    }

    setContacts((data ?? []) as Contact[]);
    setStatus('ready');
  }, [neon, priorityFilter, debouncedSearch, sortKey, direction]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(contact: Contact) {
    setEditing(contact);
    setFormError(null);
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit(draft: ContactDraft) {
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    // Blank optional inputs are sent as null so the column is cleared rather
    // than set to an empty string.
    const payload = {
      name: draft.name,
      company: draft.company.trim() || null,
      role: draft.role.trim() || null,
      where_met: draft.where_met.trim() || null,
      notes: draft.notes.trim() || null,
      priority: draft.priority,
    };

    try {
      if (editing) {
        await updateContact(editing.id, payload);
        toast.success('Updated ' + payload.name);
      } else {
        await createContact(payload);
        toast.success('Added ' + payload.name);
      }
      setDialogOpen(false);
      await loadContacts();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        // Field-level messages render next to their input; only show a banner
        // when the failure was not attributable to a specific field.
        setFormError(Object.keys(error.fieldErrors).length > 0 ? null : error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);

    try {
      await deleteContact(pendingDelete.id);
      toast.success('Deleted ' + pendingDelete.name);
      setPendingDelete(null);
      await loadContacts();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete that contact.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    await neon.auth.signOut();
  }

  const hasFilters = debouncedSearch.trim() !== '' || priorityFilter !== 'all';

  return (
    <div className="min-h-dvh">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              Berkeley Networking Tracker
            </h1>
            <p className="text-muted-foreground truncate text-xs">{email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Toolbar: search, filter, sort */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex-1 sm:min-w-56">
            <label htmlFor="search" className="mb-1.5 block text-sm font-medium">
              Search
            </label>
            <Input
              id="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or company"
            />
          </div>

          <div className="sm:w-40">
            <label htmlFor="priority-filter" className="mb-1.5 block text-sm font-medium">
              Priority
            </label>
            <Select
              value={priorityFilter}
              onValueChange={(value) => setPriorityFilter(value as PriorityFilter)}
            >
              <SelectTrigger id="priority-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority} className="capitalize">
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:w-44">
            <label htmlFor="sort-key" className="mb-1.5 block text-sm font-medium">
              Sort by
            </label>
            <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
              <SelectTrigger id="sort-key" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={
              direction === 'asc'
                ? 'Sorted ascending, click to sort descending'
                : 'Sorted descending, click to sort ascending'
            }
          >
            {direction === 'asc' ? 'Asc ↑' : 'Desc ↓'}
          </Button>

          <Button onClick={openCreate}>Add contact</Button>
        </div>

        {/* Loading state */}
        {status === 'loading' && (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading contacts</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Could not load contacts</AlertTitle>
            <AlertDescription>
              <p>{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void loadContacts()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Empty state */}
        {status === 'ready' && contacts.length === 0 && (
          <div className="rounded-lg border border-dashed py-16 text-center">
            <h2 className="font-medium">
              {hasFilters ? 'No contacts match those filters' : 'No contacts yet'}
            </h2>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
              {hasFilters
                ? 'Try a different search term or priority.'
                : 'Add the first person you want to stay connected with.'}
            </p>
            <div className="mt-4">
              {hasFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setPriorityFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={openCreate}>Add contact</Button>
              )}
            </div>
          </div>
        )}

        {/* Success state */}
        {status === 'ready' && contacts.length > 0 && (
          <>
            <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
            </p>

            {/* Table for wider screens */}
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Where met</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.name}
                        {contact.notes && (
                          <p className="text-muted-foreground max-w-xs truncate text-xs font-normal">
                            {contact.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{contact.company ?? '—'}</TableCell>
                      <TableCell>{contact.role ?? '—'}</TableCell>
                      <TableCell>{contact.where_met ?? '—'}</TableCell>
                      <TableCell>
                        <PriorityBadge priority={contact.priority} />
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(contact)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setPendingDelete(contact)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Cards for narrow screens */}
            <ul className="space-y-3 md:hidden">
              {contacts.map((contact) => (
                <li key={contact.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {[contact.role, contact.company].filter(Boolean).join(' · ') ||
                          '—'}
                      </p>
                    </div>
                    <PriorityBadge priority={contact.priority} />
                  </div>

                  {contact.where_met && (
                    <p className="text-muted-foreground mt-2 text-sm">
                      Met at {contact.where_met}
                    </p>
                  )}
                  {contact.notes && <p className="mt-2 text-sm">{contact.notes}</p>}

                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(contact)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive flex-1"
                      onClick={() => setPendingDelete(contact)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contact={editing}
        busy={saving}
        formError={formError}
        fieldErrors={fieldErrors}
        onSubmit={handleSubmit}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this contact?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.name} will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
