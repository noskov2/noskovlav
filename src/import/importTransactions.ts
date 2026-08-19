import { uid } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toNumber, toTimeString } from '@/import/columnMapping'
import { resolveOrCreateCashier } from '@/data/repo/cashiers'
import { resolveOrCreateProduct } from '@/data/repo/products'
import { bulkInsertTransactions } from '@/data/repo/transactions'
import { addImportBatch } from '@/data/repo/importBatches'
import { determineShift } from '@/processing/shift'
import type { SalesColumnMapping, ShiftConfig, TransactionLine } from '@/types/domain'

export interface ImportProgress {
  processed: number
  total: number
}

export interface ImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
  dateMin: string | null
  dateMax: string | null
}

export async function importSalesSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: SalesColumnMapping,
  shiftConfig: ShiftConfig,
  onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const importBatchId = uid('import')
  const lines: TransactionLine[] = []
  let skipped = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  const total = sheet.rows.length
  for (let i = 0; i < total; i++) {
    const row = sheet.rows[i]

    const productRaw = String(row[mapping.product] ?? '').trim()
    if (!productRaw) {
      skipped++
      continue
    }

    let date = ''
    let time = ''
    if (mapping.datetime) {
      const raw = row[mapping.datetime]
      date = toDateString(raw)
      time = toTimeString(raw)
    } else {
      date = mapping.date ? toDateString(row[mapping.date]) : ''
      time = mapping.time ? toTimeString(row[mapping.time]) : '00:00:00'
    }
    if (!date) {
      skipped++
      continue
    }

    const cashierRaw = String(row[mapping.cashier] ?? '').trim() || 'Necunoscut'
    const categoryRaw = mapping.category ? String(row[mapping.category] ?? '').trim() : ''
    const quantity = toNumber(row[mapping.quantity])
    const value = toNumber(row[mapping.value])
    const purchasePriceUnit = mapping.purchasePrice ? toNumber(row[mapping.purchasePrice]) || null : null
    const valueNoVat = mapping.valueNoVat ? toNumber(row[mapping.valueNoVat]) || null : null
    const receiptNo = String(row[mapping.receiptNo] ?? '').trim() || `auto-${date}-${i}`

    const cashier = await resolveOrCreateCashier(cashierRaw)
    const product = await resolveOrCreateProduct(productRaw, categoryRaw, purchasePriceUnit)

    const timestamp = new Date(`${date}T${time}`).getTime()
    const shift = determineShift(time, shiftConfig)

    lines.push({
      id: uid('tx'),
      importBatchId,
      date,
      time,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      cashierRaw,
      cashierId: cashier.id,
      receiptNo,
      productRaw,
      productId: product.id,
      categoryRaw,
      quantity,
      value,
      valueNoVat,
      purchasePriceUnit,
      shift,
    })

    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date

    if (onProgress && i % 200 === 0) onProgress({ processed: i, total })
  }

  await bulkInsertTransactions(lines)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'sales',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin,
    dateMax,
  })

  onProgress?.({ processed: total, total })

  return { importBatchId, rowCount: lines.length, skippedRows: skipped, dateMin, dateMax }
}
