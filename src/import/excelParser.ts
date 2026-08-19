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
