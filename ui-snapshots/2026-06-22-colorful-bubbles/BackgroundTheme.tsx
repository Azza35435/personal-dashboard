'use client'

import { useEffect } from 'react'
import SunCalc from 'suncalc'

const MELBOURNE = { lat: -37.8136, lng: 144.9631 }
const TRANSITION_MS = 30 * 60 * 1000

function getLightFactor(now: Date): number {
  const times = SunCalc.getTimes(now, MELBOURNE.lat, MELBOURNE.lng)
  const sr = times.sunrise.getTime()
  const ss = times.sunset.getTime()
  const t = now.getTime()
  const T = TRANSITION_MS

  if (t < sr - T) return 0
  if (t < sr + T) return (t - (sr - T)) / (2 * T)
  if (t < ss - T) return 1
  if (t < ss + T) return 1 - (t - (ss - T)) / (2 * T)
  return 0
}

export default function BackgroundTheme() {
  useEffect(() => {
    function apply() {
      const factor = getLightFactor(new Date())
      // Interpolate: 10 (night) ↔ 252 (day) for bg; 245 ↔ 15 for text
      const bg = Math.round(10 + 242 * factor)
      const fg = Math.round(245 - 230 * factor)
      document.body.style.backgroundColor = `rgb(${bg},${bg},${bg})`
      document.body.style.color = `rgb(${fg},${fg},${fg})`
      if (factor >= 0.5) {
        document.documentElement.classList.remove('dark')
      } else {
        document.documentElement.classList.add('dark')
      }
    }
    apply()
    const id = setInterval(apply, 30_000)
    return () => clearInterval(id)
  }, [])

  return null
}
