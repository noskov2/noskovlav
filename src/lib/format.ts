export function formatLei(value: number): string {
  return `${value.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function formatPct(value: number, decimals = 1): string {
  return `${value.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`
}

export function formatSignedPct(value: number, decimals = 1): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPct(value, decimals)}`
}

export function formatSignedLei(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatLei(value)}`
}

export function formatDateRo(dateStr: string): string {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}
