import type { PurchaseColumnMapping, SalesColumnMapping, StockColumnMapping } from '@/types/domain'

// Keyword hints used only to pre-select a likely column in the mapping
// wizard. The user always confirms (or corrects) the mapping — nothing is
// ever auto-applied without their review the first time a header set is seen.
const HINTS: Record<string, string[]> = {
  cashier: ['casier', 'operator', 'user', 'angajat', 'vanzator'],
  datetime: ['data ora', 'data/ora', 'datetime', 'data si ora'],
  date: ['data', 'zi', 'date'],
  time: ['ora', 'time', 'oră'],
  receiptNo: ['bon', 'nr bon', 'numar bon', 'chitanta', 'receipt', 'document'],
  product: ['produs', 'articol', 'denumire', 'product', 'item'],
  category: ['categorie', 'grupa', 'family', 'departament'],
  quantity: ['cantitate', 'cant', 'qty', 'buc'],
  value: ['valoare', 'suma', 'total', 'incasare', 'value', 'pret vanzare total'],
  valueNoVat: ['fara tva', 'net', 'valoare neta'],
  purchasePrice: ['pret achizitie', 'cost achizitie', 'pret intrare', 'cost unitar', 'pret cumparare'],
  promotion: ['promotie', 'promotii', 'promo'],
  supplier: ['furnizor', 'supplier'],
  price: ['pret', 'price', 'cost'],
  stockQty: ['stoc', 'stock'],
  salePrice: ['pret vanzare', 'pret de vanzare', 'sale price'],
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function guessColumn(headers: string[], field: keyof typeof HINTS): string | null {
  const keywords = HINTS[field]
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: norm(h) }))
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
  const str = String(value).trim()
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
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
