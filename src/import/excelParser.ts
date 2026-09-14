import * as XLSX from 'xlsx'

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, unknown>[]
}

/**
 * Reads the first non-empty sheet of an .xlsx/.xls/.csv file into headers +
 * row objects keyed by header. Values are left as whatever SheetJS infers
 * (number, string, Date) — normalization/parsing happens later, per logical
 * field, in columnMapping.ts.
 */
export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { cellDates: true })

  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name]
    const ref = sheet['!ref']
    return !!ref
  })
  if (!sheetName) {
    throw new Error('Fișierul nu conține nicio foaie de calcul cu date.')
  }

  const sheet = workbook.Sheets[sheetName]
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  })

  if (raw.length === 0) {
    return { headers: [], rows: [] }
  }

  const headerSet = new Set<string>()
  for (const row of raw) {
    Object.keys(row).forEach((h) => headerSet.add(h))
  }

  return { headers: Array.from(headerSet), rows: raw }
}

/**
 * Like parseExcelFile, but doesn't assume row 1 is the header row — some
 * exports (e.g. the FCC tank-probe "Citiri Periodice" file) prefix a
 * one-off label row ("Stație/Magazin: X") before the real header. The
 * header row is picked as whichever of the first 10 rows has the most
 * non-empty string cells (ties go to the earliest row) — reliably the
 * header whether or not there's a preamble, since a preamble row has far
 * fewer populated cells than a real header row.
 */
export async function parseExcelFileAutoHeader(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { cellDates: true })

  const sheetName = workbook.SheetNames.find((name) => !!workbook.Sheets[name]['!ref'])
  if (!sheetName) {
    throw new Error('Fișierul nu conține nicio foaie de calcul cu date.')
  }

  const sheet = workbook.Sheets[sheetName]
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
  if (grid.length === 0) return { headers: [], rows: [] }

  const scanLimit = Math.min(grid.length, 10)
  let headerIdx = 0
  let bestScore = -1
  for (let i = 0; i < scanLimit; i++) {
    const score = grid[i].filter((c) => typeof c === 'string' && c.trim() !== '').length
    if (score > bestScore) {
      bestScore = score
      headerIdx = i
    }
  }

  const headerRow = grid[headerIdx].map((h) => String(h ?? '').trim())
  const headers = headerRow.filter((h) => h !== '')
  const rows: Record<string, unknown>[] = []
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || r.every((c) => c === '' || c == null)) continue
    const obj: Record<string, unknown> = {}
    headerRow.forEach((h, colIdx) => {
      if (h) obj[h] = r[colIdx] ?? ''
    })
    rows.push(obj)
  }
  return { headers, rows }
}
