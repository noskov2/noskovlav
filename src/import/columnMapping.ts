import type { PurchaseColumnMapping, SalesColumnMapping, StockColumnMapping } from '@/types/domain'

// Keyword hints used only to pre-select a likely column in the mapping
// wizard. The user always confirms (or corrects) the mapping — nothing is
// ever auto-applied without their review the first time a header set is seen.
const HINTS: Record<string, string[]> = {
  cashier: ['casier', 'operator', 'user', 'angajat', 'vanzator'],
  datetime: ['data ora', 'data/ora', 'datetime', 'data si ora'],
  date: ['data', 'zi', 'date'],
  time: ['ora', 'time', 'oră'],
  receiptNo: ['bon', 'nr bon', 'numar bon', 'chitanta', 'receipt', 'document', 'id vanzare'],
  product: ['produs', 'articol', 'denumire', 'product', 'item'],
  category: ['categorie', 'grupa', 'family', 'departament'],
  quantity: ['cantitate', 'cant', 'qty', 'buc'],
  // 'valoare totala' first: real exports often also have a "Discount
  // (Valoare Totală)" column, which also contains the generic 'valoare'
  // keyword — the exclude list below keeps discount columns out of the
  // candidate pool entirely, but keeping the specific phrase first here
  // means the intended "Valoare Totală" column wins even without it.
  value: ['valoare totala', 'valoare', 'suma', 'total', 'incasare', 'value', 'pret vanzare total'],
  // 'valoare fara tva' (the per-line TOTAL ex-VAT value) must be tried
  // before the generic 'fara tva', which would otherwise just as happily
  // match a per-UNIT column like "Preț Fără TVA" — silently turning every
  // multi-quantity line's margin math into unit-price-only, understated by
  // a factor of quantity.
  valueNoVat: ['valoare fara tva', 'fara tva', 'net', 'valoare neta'],
  purchasePrice: ['pret achizitie', 'cost achizitie', 'pret intrare', 'cost unitar', 'pret cumparare', 'cmp'],
  promotion: ['promotie', 'promotii', 'promo'],
  supplier: ['furnizor', 'supplier'],
  price: ['pret', 'price', 'cost'],
  stockQty: ['stoc', 'stock'],
  salePrice: ['pret vanzare', 'pret de vanzare', 'sale price'],
}

// A column whose header contains any of these must never be auto-picked for
// a monetary/quantity field — a "Discount ..." (or "Reducere ...") column
// routinely contains the exact same substrings ("valoare", "pret", "total")
// as the real target column, e.g. "Discount (Valoare Totală)" sitting right
// next to the real "Valoare Totală" and matching the very same keyword.
const EXCLUDE_FOR_FIELD: Partial<Record<keyof typeof HINTS, string[]>> = {
  value: ['discount', 'reducere'],
  valueNoVat: ['discount', 'reducere'],
  purchasePrice: ['discount', 'reducere'],
  price: ['discount', 'reducere'],
  salePrice: ['discount', 'reducere'],
  quantity: ['discount', 'reducere'],
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    // NFD doesn't decompose the modern Romanian ș/ț (comma below) the way
    // it does ă/â/î — see lib/id.ts's slugify for the full explanation.
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function guessColumn(headers: string[], field: keyof typeof HINTS): string | null {
  const keywords = HINTS[field]
  const excludes = EXCLUDE_FOR_FIELD[field] ?? []
  const normalizedHeaders = headers
    .map((h) => ({ raw: h, norm: norm(h) }))
    .filter((h) => !excludes.some((ex) => h.norm.includes(ex)))
  for (const kw of keywords) {
    const found = normalizedHeaders.find((h) => h.norm.includes(kw))
    if (found) return found.raw
  }
  return null
}

export function guessSalesMapping(headers: string[]): SalesColumnMapping {
  return {
    cashier: guessColumn(headers, 'cashier') ?? '',
    datetime: guessColumn(headers, 'datetime'),
    date: guessColumn(headers, 'date'),
    time: guessColumn(headers, 'time'),
    receiptNo: guessColumn(headers, 'receiptNo') ?? '',
    product: guessColumn(headers, 'product') ?? '',
    category: guessColumn(headers, 'category'),
    quantity: guessColumn(headers, 'quantity') ?? '',
    value: guessColumn(headers, 'value') ?? '',
    purchasePrice: guessColumn(headers, 'purchasePrice'),
    valueNoVat: guessColumn(headers, 'valueNoVat'),
    promotion: guessColumn(headers, 'promotion'),
  }
}

export function guessPurchaseMapping(headers: string[]): PurchaseColumnMapping {
  return {
    product: guessColumn(headers, 'product') ?? '',
    supplier: guessColumn(headers, 'supplier') ?? '',
    date: guessColumn(headers, 'date') ?? '',
    quantity: guessColumn(headers, 'quantity') ?? '',
    price: guessColumn(headers, 'price') ?? '',
  }
}

export function guessStockMapping(headers: string[]): StockColumnMapping {
  return {
    product: guessColumn(headers, 'product') ?? '',
    quantity: guessColumn(headers, 'stockQty') ?? guessColumn(headers, 'quantity') ?? '',
    salePrice: guessColumn(headers, 'salePrice'),
    category: guessColumn(headers, 'category'),
    supplier: guessColumn(headers, 'supplier'),
  }
}

export function isStockMappingComplete(m: StockColumnMapping): boolean {
  return !!m.product && !!m.quantity
}

export function isSalesMappingComplete(m: SalesColumnMapping): boolean {
  const hasDate = !!m.datetime || !!m.date
  return hasDate && !!m.cashier && !!m.product && !!m.quantity && !!m.value && !!m.receiptNo
}

export function isPurchaseMappingComplete(m: PurchaseColumnMapping): boolean {
  return !!m.product && !!m.supplier && !!m.date && !!m.quantity && !!m.price
}

// ---- Cell value coercion helpers -----------------------------------------

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value == null || value === '') return 0
  const str = String(value).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = parseFloat(str)
  return Number.isFinite(n) ? n : 0
}

export function toDateString(value: unknown): string {
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'number') {
    // Excel serial date fallback (SheetJS usually converts via cellDates, but be defensive)
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const d = new Date(excelEpoch.getTime() + value * 86400000)
    return formatDate(d)
  }
  // Some exports suffix the "Zi" value with a shift/batch marker (e.g.
  // "2026.08.20_1") that has nothing to do with the date itself — everything
  // from the first underscore on is discarded before parsing.
  let str = String(value).trim()
  const underscoreIdx = str.indexOf('_')
  if (underscoreIdx >= 0) str = str.slice(0, underscoreIdx).trim()

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  // Year-first with dot/slash separators (e.g. "2026.08.20")
  const ymdMatch = str.match(/^(\d{4})[./](\d{1,2})[./](\d{1,2})/)
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parsed = new Date(str)
  if (!Number.isNaN(parsed.getTime())) return formatDate(parsed)
  return ''
}

export function toTimeString(value: unknown): string {
  if (value instanceof Date) {
    return `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
  }
  if (typeof value === 'number') {
    // Excel time fraction of a day
    const totalSeconds = Math.round(value * 86400)
    const h = Math.floor(totalSeconds / 3600) % 24
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${pad(h)}:${pad(m)}:${pad(s)}`
  }
  const str = String(value).trim()
  const match = str.match(/(\d{1,2}):(\d{2})(:(\d{2}))?/)
  if (match) {
    return `${pad(parseInt(match[1], 10))}:${match[2]}:${match[4] ?? '00'}`
  }
  return '00:00:00'
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
