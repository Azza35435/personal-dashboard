'use client'

import { useEffect, useState } from 'react'

// Behavioural mobile check (< md breakpoint). Pure layout differences should
// use Tailwind `md:` classes instead — this is for switching interaction
// models (drag vs tap) and view structure (grid vs stack).
export function useIsMobile(): boolean {
  // starts false even on phones so server-prerendered HTML matches the first
  // client render (no hydration mismatch); flips in the effect
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
