'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { PRIORITIES, type Contact, type Priority } from '@/lib/types';

export interface ContactDraft {
  name: string;
  company: string;
  role: string;
  where_met: string;
  notes: string;
  priority: Priority;
}

const EMPTY: ContactDraft = {
  name: '',
  company: '',
  role: '',
  where_met: '',
  notes: '',
  priority: 'medium',
};

function toDraft(contact: Contact | null): ContactDraft {
  if (!contact) return EMPTY;
  return {
    name: contact.name,
    company: contact.company ?? '',
    role: contact.role ?? '',
    where_met: contact.where_met ?? '',
    notes: contact.notes ?? '',
    priority: contact.priority,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null means "create"; a contact means "edit". */
  contact: Contact | null;
  busy: boolean;
  formError: string | null;
  fieldErrors: Record<string, string>;
  onSubmit: (draft: ContactDraft) => void;
}

export default function ContactDialog({
  open,
  onOpenChange,
  contact,
  busy,
  formError,
  fieldErrors,
  onSubmit,
}: Props) {
  const [draft, setDraft] = useState<ContactDraft>(EMPTY);
  const isEdit = contact !== null;

  // Reset the form whenever the dialog opens for a different contact.
  useEffect(() => {
    if (open) setDraft(toDraft(contact));
  }, [open, contact]);

  const set = <K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the details for this person.'
              : 'Someone you want to stay connected with.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(draft);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="contact-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="contact-name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? 'contact-name-error' : undefined}
              placeholder="Priya Raman"
            />
            {fieldErrors.name && (
              <p id="contact-name-error" className="text-destructive text-sm">
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact-company">Company</Label>
              <Input
                id="contact-company"
                value={draft.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Berkeley SkyDeck"
              />
              {fieldErrors.company && (
                <p className="text-destructive text-sm">{fieldErrors.company}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contact-role">Role</Label>
              <Input
                id="contact-role"
                value={draft.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Program Director"
              />
              {fieldErrors.role && <p className="text-destructive text-sm">{fieldErrors.role}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-where-met">Where you met</Label>
            <Input
              id="contact-where-met"
              value={draft.where_met}
              onChange={(e) => set('where_met', e.target.value)}
              placeholder="SkyDeck Demo Day"
            />
            {fieldErrors.where_met && (
              <p className="text-destructive text-sm">{fieldErrors.where_met}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-priority">Priority</Label>
            <Select
              value={draft.priority}
              onValueChange={(value) => set('priority', value as Priority)}
            >
              <SelectTrigger id="contact-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority} className="capitalize">
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.priority && (
              <p className="text-destructive text-sm">{fieldErrors.priority}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="What you talked about, and what to follow up on."
            />
            {fieldErrors.notes && <p className="text-destructive text-sm">{fieldErrors.notes}</p>}
          </div>

          {formError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
