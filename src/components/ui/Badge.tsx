import type { ReactNode } from 'react'
import clsx from 'clsx'

type BadgeTone = 'good' | 'warn' | 'bad' | 'neutral' | 'brand'

const toneClasses: Record<BadgeTone, string> = {
  good: 'bg-good/10 text-good',
  warn: 'bg-warn/10 text-warn',
  bad: 'bg-bad/10 text-bad',
  neutral: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-100 text-brand-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  )
}

export function AlertDot({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const colors = { green: 'bg-good', yellow: 'bg-warn', red: 'bg-bad' }
  return <span className={clsx('inline-block h-2.5 w-2.5 rounded-full', colors[level])} />
}
