import { toDateString } from '@/import/columnMapping'

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

// Delegates to the same toDateString() used to actually parse the value
// once a row is accepted — this used to duplicate its own copy of the
// date-format regexes, which drifted out of sync (it didn't know about the
// "_1" shift-suffix or YYYY.MM.DD dates that toDateString was later taught
// to handle), silently rejecting every row of a real file before
// toDateString ever got a chance to parse them correctly.
export function isInvalidDateToken(value: unknown): boolean {
  if (value == null || value === '') return true
  if (value instanceof Date) return Number.isNaN(value.getTime())
  if (typeof value === 'number') return !Number.isFinite(value)
  const str = String(value).trim()
  if (!str) return true
  return toDateString(value) === ''
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
