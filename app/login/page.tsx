'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Supabase reports a failed signup trigger (our invite-only gate) as a
// generic "Database error saving new user".
function isNotInvitedError(message: string) {
  return message.includes('not_invited') || message.includes('Database error saving new user')
}

function LoginInner() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [signingIn, setSigningIn] = useState(false)

  const signIn = async () => {
    setSigningIn(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-8">
        <h1 className="font-semibold text-lg tracking-tight text-gray-900 dark:text-gray-100">My Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sign in to your dashboard</p>

        {error && (
          <div className="mt-5 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2.5">
            {isNotInvitedError(error) ? (
              <>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">This account isn&apos;t invited</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                  This dashboard is invite-only. Ask the owner to add your Google email, then try again.
                </p>
              </>
            ) : (
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            )}
          </div>
        )}

        <button
          onClick={signIn}
          disabled={signingIn}
          className="mt-6 w-full flex items-center justify-center gap-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z" />
          </svg>
          {signingIn ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">Invite-only · friends &amp; family</p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
