'use client';

import { useEffect, useState } from 'react';
import { getNeon, isNeonConfigured } from '@/lib/neon-browser';
import AuthPanel from '@/components/auth-panel';
import ContactsApp from '@/components/contacts-app';
import SetupNotice from '@/components/setup-notice';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Session gate.
 *
 * This is a convenience, not a security boundary: showing the app shell to a
 * signed-out user would reveal nothing, because every row the app can read is
 * already restricted by Row Level Security inside Postgres.
 */
export default function Home() {
  // Hooks run unconditionally, before any early return.
  const { data: session, isPending } = getNeon().auth.useSession();

  // The session lives in the browser, so the server render has no way to know
  // it. Waiting for mount keeps the markup identical on both sides.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isNeonConfigured) return <SetupNotice />;

  if (!mounted || isPending) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10" aria-busy="true">
        <span className="sr-only">Loading</span>
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </main>
    );
  }

  if (!session?.user) return <AuthPanel />;

  return <ContactsApp email={session.user.email} />;
}
