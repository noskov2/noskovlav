/**
 * Utilitare pentru formate românești: numere cu virgulă/punct, date
 * dd.mm.yyyy / dd/mm/yyyy, date serial Excel, și formatare pentru afișare
 * (spec §37).
 */

const currencyFormatter = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const RO_DIACRITICS: Record<string, string> = {
  ă: 'a', â: 'a', î: 'i', ș: 's', ş: 's', ț: 't', ţ: 't',
  Ă: 'A', Â: 'A', Î: 'I', Ș: 'S', Ş: 'S', Ț: 'T', Ţ: 'T',
}

export function stripDiacritics(str: string): string {
  const mapped = str.replace(/[ăâîșşțţĂÂÎȘŞȚŢ]/g, (ch) => RO_DIACRITICS[ch] ?? ch)
  return mapped.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Normalizează un text pentru comparație: majuscule, fără diacritice, fără punctuație, spații unice. */
export function normalizeForCompare(str: string): string {
  return stripDiacritics(str)
    .toUpperCase()
    .replace(/&/g, ' SI ')
    .replace(/[.,;:'"`()[\]{}\-_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeHeader(header: string): string {
  return normalizeForCompare(String(header ?? ''))
}

/**
 * Parsează un număr în format românesc sau internațional.
 * Acceptă: 1234.56 | 1234,56 | 1.234,56 | 1,234.56 | numere deja numerice.
 * Returnează null dacă valoarea nu poate fi interpretată ca număr.
 */
export function parseRoNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null

  let str = String(raw).trim()
  if (str === '') return null
  str = str.replace(/\s/g, '').replace(/lei/i, '')

  const hasComma = str.includes(',')
  const hasDot = str.includes('.')

  if (hasComma && hasDot) {
    // Ultimul separator întâlnit este cel zecimal.
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  } else if (hasComma) {
    // O singură virgulă -> zecimală. Mai multe -> separatori de mii.
    const parts = str.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      str = parts.join('.')
    } else {
      str = str.replace(/,/g, '')
    }
  } else if (hasDot) {
    const parts = str.split('.')
    if (parts.length > 2) {
      // Mai multe puncte -> separatori de mii (1.234.567)
      str = str.replace(/\./g, '')
    } else if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0) {
      // Ambiguu (ex: 1.234) — tratăm ca separator de mii, convenție RO.
      str = str.replace(/\./g, '')
    }
    // altfel rămâne punct zecimal (ex: 1234.5)
  }

  const n = Number(str)
  return Number.isFinite(n) ? n : null
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

/**
 * Parsează o dată din formate: serial Excel, obiect Date, dd.mm.yyyy,
 * dd/mm/yyyy, yyyy-mm-dd. Returnează ISO yyyy-mm-dd sau null.
 */
export function parseRoDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return toIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate())
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    const ms = EXCEL_EPOCH_UTC + Math.round(raw) * 86400000
    const d = new Date(ms)
    return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }

  const str = String(raw).trim()
  if (str === '') return null

  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))

  m = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (m) return toIsoDate(Number(m[3]), Number(m[2]), Number(m[1]))

  m = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/)
  if (m) return toIsoDate(2000 + Number(m[3]), Number(m[2]), Number(m[1]))

  const asExcelSerial = Number(str)
  if (Number.isFinite(asExcelSerial) && asExcelSerial > 0) {
    return parseRoDate(asExcelSerial)
  }

  return null
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`
}

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${currencyFormatter.format(n)} lei`
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${percentFormatter.format(n)}%`
}

export function formatQuantity(n: number | null | undefined, unit = 'kg'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${currencyFormatter.format(n)} ${unit}`
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('ro-RO').format(n)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
