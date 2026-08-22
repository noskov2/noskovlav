// Validation helpers shared between the real import (importTransactions.ts)
// and the pre-import preview (importPreview.ts) — kept separate from
// columnMapping.ts's `toNumber`/`toDateString` coercion helpers (those stay
// lenient and are used once a row is already accepted) so both places agree
// on what counts as "invalid" rather than silently becoming 0/empty.

// True only for a non-empty raw value that fails to parse as a number —
// blank/undefined is NOT invalid (it's "not provided", handled elsewhere),
// but a garbled token like "abc" or "N/A" must never silently become 0.
export function isInvalidNumericToken(value: unknown): boolean {
  if (value == null || value === '') return false
  if (typeof value === 'number') return !Number.isFinite(value)
  const str = String(value).trim()
  if (str === '') return false
  const cleaned = str.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  return !Number.isFinite(parseFloat(cleaned)) || cleaned === ''
}

export function isInvalidDateToken(value: unknown): boolean {
  if (value == null || value === '') return true
  if (value instanceof Date) return Number.isNaN(value.getTime())
  if (typeof value === 'number') return !Number.isFinite(value)
  const str = String(value).trim()
  if (!str) return true
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/)
  if (isoMatch || dmyMatch) return false
  return Number.isNaN(new Date(str).getTime())
}

// Builds a stable per-line fingerprint for duplicate detection. Deliberately
// does NOT use the synthesized "no-bon-..." receiptNo (which is unique per
// row on purpose) — it uses the RAW receipt number token as seen in the
// file, so the same real transaction imported from two different exports
// (or the same file imported twice) produces the same fingerprint.
export function computeLineFingerprint(
  date: string,
  time: string,
  cashierRaw: string,
  rawReceiptNo: string,
  productRaw: string,
  quantity: number,
  value: number,
): string {
  return [
    date,
    time,
    cashierRaw.trim().toLowerCase(),
    rawReceiptNo.trim(),
    productRaw.trim().toLowerCase(),
    quantity,
    value,
  ].join('|')
}
