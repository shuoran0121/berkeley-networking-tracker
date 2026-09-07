import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Shown when the app has not been pointed at a Neon project yet. */
export default function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl items-center px-4">
      <Alert>
        <AlertTitle>Neon is not configured</AlertTitle>
        <AlertDescription>
          <p>
            Copy <code className="font-mono">.env.example</code> to{' '}
            <code className="font-mono">.env.local</code> and set{' '}
            <code className="font-mono">NEXT_PUBLIC_NEON_AUTH_URL</code> and{' '}
            <code className="font-mono">NEXT_PUBLIC_NEON_DATA_API_URL</code> from your Neon
            project, then restart the dev server.
          </p>
          <p>See the Local setup section of the README for the full walkthrough.</p>
        </AlertDescription>
      </Alert>
    </main>
  );
}
