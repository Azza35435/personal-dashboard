import { scoreColor } from '@/lib/healthScore'

interface ScoreRingProps {
  score: number | null
  size?: number
  label?: string
}

export default function ScoreRing({ score, size = 88, label }: ScoreRingProps) {
  const color = scoreColor(score)
  const r = (size - 16) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const pct = score ?? 0
  const offset = circ * (1 - Math.min(pct, 100) / 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={8} className="stroke-gray-200 dark:stroke-gray-700" />
        {score != null && (
          <circle
            cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={String(circ)} strokeDashoffset={String(offset)}
            strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        )}
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: size < 70 ? 12 : 16, fontWeight: 700, fill: score != null ? color : '#9ca3af', fontFamily: 'inherit' }}>
          {score != null ? score : '—'}
        </text>
      </svg>
      {label && <span className="text-xs text-gray-400">{label}</span>}
    </div>
  )
}
