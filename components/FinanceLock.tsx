'use client'

import { useState, useEffect, useCallback, ReactNode } from 'react'

const HASH_KEY = 'finance_passcode_hash'
const SESSION_KEY = 'finance_unlocked'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function LockIcon() {
  return (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function PinDots({ count, shake }: { count: number; shake: boolean }) {
  return (
    <div className={`flex gap-3 ${shake ? 'animate-pin-shake' : ''}`}>
      {[0, 1, 2, 3].map(i => (
        <div
          key={i}
          className={`w-3 h-3 rounded-full border-2 transition-all duration-100 ${
            i < count ? 'bg-gray-900 dark:bg-white border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'
          }`}
        />
      ))}
    </div>
  )
}

function NumPad({
  onDigit,
  onBack,
  full,
}: {
  onDigit: (d: string) => void
  onBack: () => void
  full: boolean
}) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9' && !full) onDigit(e.key)
      else if (e.key === 'Backspace') onBack()
    },
    [onDigit, onBack, full],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k, i) => {
        if (!k) return <div key={i} />
        const isBack = k === '⌫'
        return (
          <button
            key={i}
            onClick={() => (isBack ? onBack() : onDigit(k))}
            disabled={!isBack && full}
            className="w-14 h-14 rounded-xl text-base font-medium bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-30 select-none"
          >
            {k}
          </button>
        )
      })}
    </div>
  )
}

type Mode = 'lock' | 'set' | 'change' | 'remove'
type Step = 'verify' | 'new' | 'confirm'

interface PinState {
  digits: string
  mode: Mode
  step: Step
  tempPin: string
  error: string
  shake: boolean
  processing: boolean
}

const blankPin = (mode: Mode = 'lock', step: Step = 'verify'): PinState => ({
  digits: '',
  mode,
  step,
  tempPin: '',
  error: '',
  shake: false,
  processing: false,
})

function pinLabel(mode: Mode, step: Step): string {
  if (mode === 'lock') return 'Enter your PIN'
  if (mode === 'set') return step === 'new' ? 'Create a 4-digit PIN' : 'Confirm your new PIN'
  if (mode === 'change') {
    if (step === 'verify') return 'Enter current PIN'
    if (step === 'new') return 'Enter new PIN'
    return 'Confirm new PIN'
  }
  if (mode === 'remove') return 'Enter current PIN to remove'
  return ''
}

export default function FinanceLock({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [hasPasscode, setHasPasscode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [pin, setPin] = useState<PinState>(blankPin())

  useEffect(() => {
    setMounted(true)
    const hash = localStorage.getItem(HASH_KEY)
    setHasPasscode(!!hash)
    if (hash && sessionStorage.getItem(SESSION_KEY) !== '1') {
      setLocked(true)
    }
    return () => {
      sessionStorage.removeItem(SESSION_KEY)
    }
  }, [])

  function triggerError(msg: string, then?: () => void) {
    setPin(p => ({ ...p, error: msg, shake: true, processing: false }))
    setTimeout(() => {
      setPin(p => ({ ...p, error: '', shake: false, digits: '' }))
      then?.()
    }, 500)
  }

  useEffect(() => {
    const { digits, mode, step, tempPin, processing } = pin
    if (digits.length !== 4 || processing) return

    setPin(p => ({ ...p, processing: true }))

    ;(async () => {
      const hash = await sha256(digits)
      const stored = localStorage.getItem(HASH_KEY)

      if (mode === 'lock') {
        if (hash === stored) {
          sessionStorage.setItem(SESSION_KEY, '1')
          setLocked(false)
          setPin(blankPin())
        } else {
          triggerError('Incorrect PIN')
        }
      } else if (mode === 'set') {
        if (step === 'new') {
          setPin(p => ({ ...p, tempPin: digits, digits: '', step: 'confirm', processing: false }))
        } else {
          if (digits === tempPin) {
            localStorage.setItem(HASH_KEY, hash)
            sessionStorage.setItem(SESSION_KEY, '1')
            setHasPasscode(true)
            setLocked(false)
            setShowSettings(false)
            setPin(blankPin())
          } else {
            triggerError('PINs do not match', () =>
              setPin(p => ({ ...p, step: 'new', tempPin: '' })),
            )
          }
        }
      } else if (mode === 'change') {
        if (step === 'verify') {
          if (hash === stored) {
            setPin(p => ({ ...p, digits: '', step: 'new', processing: false }))
          } else {
            triggerError('Incorrect PIN')
          }
        } else if (step === 'new') {
          setPin(p => ({ ...p, tempPin: digits, digits: '', step: 'confirm', processing: false }))
        } else {
          if (digits === tempPin) {
            localStorage.setItem(HASH_KEY, hash)
            setShowSettings(false)
            setPin(blankPin())
          } else {
            triggerError('PINs do not match', () =>
              setPin(p => ({ ...p, step: 'new', tempPin: '' })),
            )
          }
        }
      } else if (mode === 'remove') {
        if (hash === stored) {
          localStorage.removeItem(HASH_KEY)
          sessionStorage.removeItem(SESSION_KEY)
          setHasPasscode(false)
          setLocked(false)
          setShowSettings(false)
          setPin(blankPin())
        } else {
          triggerError('Incorrect PIN')
        }
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.digits])

  const addDigit = useCallback((d: string) => {
    setPin(p => {
      if (p.digits.length >= 4 || p.processing) return p
      return { ...p, digits: p.digits + d }
    })
  }, [])

  const delDigit = useCallback(() => {
    setPin(p => ({ ...p, digits: p.digits.slice(0, -1) }))
  }, [])

  function openMode(mode: Mode) {
    setShowMenu(false)
    setPin(blankPin(mode, mode === 'change' ? 'verify' : 'new'))
    setShowSettings(true)
  }

  function closeSettings() {
    setShowSettings(false)
    setPin(blankPin())
  }

  if (!mounted) return null

  // — Lock screen —
  if (locked) {
    return (
      <div className="flex items-center justify-center h-full min-h-96">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm p-8 flex flex-col items-center gap-5 w-72">
          <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <LockIcon />
          </div>
          <h2 className="text-sm font-semibold">Finance</h2>
          <p className="text-xs text-gray-400">{pinLabel('lock', 'verify')}</p>
          <PinDots count={pin.digits.length} shake={pin.shake} />
          {pin.error && <p className="text-xs text-red-500 -mt-2">{pin.error}</p>}
          <NumPad onDigit={addDigit} onBack={delDigit} full={pin.digits.length >= 4} />
        </div>
      </div>
    )
  }

  // — Settings overlay —
  const settingsOverlay = showSettings && (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={closeSettings}
    >
      <div
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm p-8 flex flex-col items-center gap-5 w-72"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-full flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {pin.mode === 'set'
              ? 'Set passcode'
              : pin.mode === 'change'
                ? 'Change passcode'
                : 'Remove passcode'}
          </h3>
          <button
            onClick={closeSettings}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-400 self-start -mt-3">
          {pinLabel(pin.mode, pin.step)}
        </p>
        <PinDots count={pin.digits.length} shake={pin.shake} />
        {pin.error && <p className="text-xs text-red-500 -mt-2">{pin.error}</p>}
        <NumPad onDigit={addDigit} onBack={delDigit} full={pin.digits.length >= 4} />
      </div>
    </div>
  )

  // — Gear dropdown —
  const gearMenu = showMenu && (
    <div className="absolute right-0 top-8 z-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-md py-1 w-44">
      {!hasPasscode ? (
        <button
          onClick={() => openMode('set')}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          Set passcode
        </button>
      ) : (
        <>
          <button
            onClick={() => openMode('change')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            Change passcode
          </button>
          <button
            onClick={() => openMode('remove')}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-red-500"
          >
            Remove passcode
          </button>
        </>
      )}
    </div>
  )

  // — Unlocked finance page —
  return (
    <>
      {settingsOverlay}
      <div
        className="p-3 sm:p-6 h-full overflow-auto"
        onClick={() => showMenu && setShowMenu(false)}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Finance</h1>
          <div className="relative">
            <button
              onClick={e => {
                e.stopPropagation()
                setShowMenu(m => !m)
              }}
              className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Passcode settings"
            >
              <GearIcon />
            </button>
            {gearMenu}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {children}
        </div>
      </div>
    </>
  )
}
