import type { ShiftConfig, ShiftNumber } from '@/types/domain'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10))
  return (h || 0) * 60 + (m || 0)
}

// Returns whether `minutes` falls in the [start, end) window, correctly
// handling shifts that wrap past midnight (e.g. 19:00 -> 07:00).
function inWindow(minutes: number, start: number, end: number): boolean {
  if (start === end) return true // 24h window
  if (start < end) return minutes >= start && minutes < end
  return minutes >= start || minutes < end
}

export function determineShift(time: string, config: ShiftConfig): ShiftNumber | null {
  if (!time) return null
  const minutes = toMinutes(time)
  const s1 = toMinutes(config.shift1Start)
  const e1 = toMinutes(config.shift1End)
  const s2 = toMinutes(config.shift2Start)
  const e2 = toMinutes(config.shift2End)

  if (inWindow(minutes, s1, e1)) return 1
  if (inWindow(minutes, s2, e2)) return 2
  return null
}
