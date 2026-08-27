function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Generează un CSV (separator `;`, convenție RO/Excel) și declanșează descărcarea lui. */
export function downloadCsv(fileName: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(';'))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
