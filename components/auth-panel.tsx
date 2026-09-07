'use client';

import { useState } from 'react';
import { getNeon } from '@/lib/neon-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Mode = 'sign-in' | 'sign-up';

export default function AuthPanel() {
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'sign-up';

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const auth = getNeon().auth;
      const result = isSignUp
        ? await auth.signUp.email({ email, password, name: name.trim() || email })
        : await auth.signIn.email({ email, password });

      if (result.error) {
        setError(result.error.message ?? 'Could not sign you in. Check your details.');
      }
      // On success the session store updates and the page swaps to the app.
    } catch {
      setError('Could not reach the authentication service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Berkeley Networking Tracker</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Keep track of the people you want to stay connected with.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isSignUp ? 'Create an account' : 'Sign in'}</CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Your contacts are private to your account.'
              : 'Welcome back.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@berkeley.edu"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? 'At least 8 characters' : ''}
              />
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? isSignUp
                  ? 'Creating account…'
                  : 'Signing in…'
                : isSignUp
                  ? 'Create account'
                  : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-4 text-center text-sm">
        {isSignUp ? 'Already have an account?' : 'Need an account?'}{' '}
        <button
          type="button"
          className="text-foreground font-medium underline underline-offset-4"
          onClick={() => {
            setMode(isSignUp ? 'sign-in' : 'sign-up');
            setError(null);
          }}
        >
          {isSignUp ? 'Sign in' : 'Sign up'}
        </button>
      </p>
    </main>
  );
}
