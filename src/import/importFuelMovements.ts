import { uid } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toTimeString, toNumber } from '@/import/columnMapping'
import { bulkInsertFuelMovements, countAllFuelMovementFingerprints } from '@/data/repo/fuelMovements'
import { addImportBatch } from '@/data/repo/importBatches'
import { classifyFuel } from '@/kpi/tankFuel'
import type { FuelMovement, FuelMovementColumnMapping } from '@/types/domain'

export interface FuelMovementImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
  duplicateRowCount: number
  dateMin: string | null
  dateMax: string | null
}

function computeMovementFingerprint(
  tankId: string,
  product: string,
  date: string,
  time: string,
  documentNo: string,
  quantity: number,
): string {
  return [tankId, product, date, time, documentNo, quantity].join('|')
}

export async function importFuelMovementSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: FuelMovementColumnMapping,
): Promise<FuelMovementImportResult> {
  const importBatchId = uid('import')
  const rows: FuelMovement[] = []
  let skipped = 0
  let duplicateRowCount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  const existingFingerprintCounts = await countAllFuelMovementFingerprints()
  const seenInThisImport = new Map<string, number>()

  for (const row of sheet.rows) {
    const productRaw = String(row[mapping.product] ?? '').trim()
    const rawDatetime = row[mapping.datetime]
    if (!productRaw || rawDatetime === '' || rawDatetime == null) {
      skipped++
      continue
    }
    const date = toDateString(rawDatetime)
    if (!date) {
      skipped++
      continue
    }
    const time = toTimeString(rawDatetime)
    const timestamp = new Date(`${date}T${time}`).getTime()
    if (!Number.isFinite(timestamp)) {
      skipped++
      continue
    }

    const rawQuantity = row[mapping.quantity]
    if (rawQuantity === '' || rawQuantity == null) {
      skipped++
      continue
    }
    const quantity = toNumber(rawQuantity)
    const tankId = mapping.tankId ? String(row[mapping.tankId] ?? '').trim() || null : null
    const documentNo = mapping.documentNo ? String(row[mapping.documentNo] ?? '').trim() || null : null

    const fingerprint = computeMovementFingerprint(tankId ?? '', productRaw, date, time, documentNo ?? '', quantity)
    const alreadyInDb = existingFingerprintCounts.get(fingerprint) ?? 0
    const seenSoFar = seenInThisImport.get(fingerprint) ?? 0
    seenInThisImport.set(fingerprint, seenSoFar + 1)
    if (seenSoFar < alreadyInDb) {
      duplicateRowCount++
      continue
    }

    const movementTypeRaw = mapping.movementType ? String(row[mapping.movementType] ?? '').trim() || null : null
    const price = mapping.price ? (row[mapping.price] === '' || row[mapping.price] == null ? null : toNumber(row[mapping.price])) : null
    const stockAfter = mapping.stockAfter
      ? row[mapping.stockAfter] === '' || row[mapping.stockAfter] == null
        ? null
        : toNumber(row[mapping.stockAfter])
      : null

    rows.push({
      id: uid('fmov'),
      importBatchId,
      timestamp,
      date,
      time,
      productRaw,
      fuel: classifyFuel(productRaw),
      movementTypeRaw,
      direction: quantity < 0 ? 'out' : 'in',
      quantity,
      documentNo,
      explanation: mapping.explanation ? String(row[mapping.explanation] ?? '').trim() || null : null,
      gestiune: mapping.gestiune ? String(row[mapping.gestiune] ?? '').trim() || null : null,
      supplier: mapping.supplier ? String(row[mapping.supplier] ?? '').trim() || null : null,
      price,
      stockAfter,
      tankId,
      fingerprint,
    })
    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date
  }

  await bulkInsertFuelMovements(rows)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'fuelMovements',
    importedAt: Date.now(),
    rowCount: rows.length,
    dateMin,
    dateMax,
    fileHash: null,
    duplicateRowCount,
    invalidRowCount: 0,
    newProductCount: 0,
    newCashierCount: 0,
    newClientCount: 0,
  })

  return { importBatchId, rowCount: rows.length, skippedRows: skipped, duplicateRowCount, dateMin, dateMax }
}
