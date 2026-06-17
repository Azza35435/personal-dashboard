'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const params = useSearchParams()
  const error = params.get('error')

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="bg-white/10 rounded-2xl p-8 max-w-lg w-full text-white space-y-4">
        <h1 className="text-xl font-semibold text-red-400">Sign-in Error</h1>
        <div className="bg-white/5 rounded-lg p-4 font-mono text-sm break-all">
          <p className="text-white/50 text-xs mb-1">error code</p>
          <p>{error ?? 'unknown'}</p>
        </div>
        <p className="text-white/60 text-sm">
          Copy the error code above and share it for debugging.
        </p>
        <a
          href="/"
          className="block text-center px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  )
}
