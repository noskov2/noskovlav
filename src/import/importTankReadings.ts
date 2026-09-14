import { uid } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toTimeString, toNumber } from '@/import/columnMapping'
import { bulkInsertTankReadings, listAllTankReadings } from '@/data/repo/tankReadings'
import { addImportBatch } from '@/data/repo/importBatches'
import { classifyFuel } from '@/kpi/tankFuel'
import type { TankReading, TankReadingColumnMapping } from '@/types/domain'

export interface TankReadingImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
  duplicateRowCount: number
  dateMin: string | null
  dateMax: string | null
}

function numOrNull(col: string | null, row: Record<string, unknown>): number | null {
  if (!col) return null
  const v = row[col]
  if (v === '' || v == null) return null
  return toNumber(v)
}

export async function importTankReadingSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: TankReadingColumnMapping,
): Promise<TankReadingImportResult> {
  const importBatchId = uid('import')
  const rows: TankReading[] = []
  let skipped = 0
  let duplicateRowCount = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  // A reading is uniquely identified by its tank + exact timestamp — the
  // FCC export re-exports the whole history every time, so re-importing the
  // same (or an overlapping-period) file must not duplicate rows already
  // stored from an earlier import.
  const existing = await listAllTankReadings()
  const existingKeys = new Set(existing.map((r) => `${r.tankId}|${r.lastUpdate}`))
  const seenInThisImport = new Set<string>()

  // A disconnected probe (e.g. GPL "NOT CONNECTED") reports its book stock
  // with NO timestamp of its own — it's still part of the same reading
  // cycle as the rows immediately around it, so it inherits the nearest
  // preceding row's timestamp rather than being dropped. Only a
  // disconnected row with no earlier timestamp at all (the very first row
  // in the sheet) has nothing to fall back to and is skipped.
  let carryTimestamp: { date: string; lastUpdate: number } | null = null

  for (const row of sheet.rows) {
    const tankId = String(row[mapping.tankId] ?? '').trim()
    const fuelRaw = String(row[mapping.fuel] ?? '').trim()
    const lastUpdateRaw = row[mapping.lastUpdate]
    if (!tankId || !fuelRaw) {
      skipped++
      continue
    }

    let date: string
    let lastUpdate: number
    if (lastUpdateRaw === '' || lastUpdateRaw == null) {
      if (!carryTimestamp) {
        skipped++
        continue
      }
      date = carryTimestamp.date
      lastUpdate = carryTimestamp.lastUpdate
    } else {
      const parsedDate = toDateString(lastUpdateRaw)
      if (!parsedDate) {
        skipped++
        continue
      }
      const time = toTimeString(lastUpdateRaw)
      const parsedTs = new Date(`${parsedDate}T${time}`).getTime()
      if (!Number.isFinite(parsedTs)) {
        skipped++
        continue
      }
      date = parsedDate
      lastUpdate = parsedTs
      carryTimestamp = { date, lastUpdate }
    }

    const key = `${tankId}|${lastUpdate}`
    if (existingKeys.has(key) || seenInThisImport.has(key)) {
      duplicateRowCount++
      continue
    }
    seenInThisImport.add(key)

    const actualVolume = numOrNull(mapping.actualVolume, row)
    const bookStock = numOrNull(mapping.bookStock, row)
    const difference = mapping.difference
      ? numOrNull(mapping.difference, row)
      : actualVolume != null && bookStock != null
        ? actualVolume - bookStock
        : null

    const mainStateRaw = mapping.mainState ? String(row[mapping.mainState] ?? '').trim() : ''
    const connected = mainStateRaw.toUpperCase() !== 'NOT CONNECTED'

    rows.push({
      id: uid('tank'),
      importBatchId,
      station: mapping.station ? String(row[mapping.station] ?? '').trim() || null : null,
      tankId,
      fuelRaw,
      fuel: classifyFuel(fuelRaw),
      level: numOrNull(mapping.level, row),
      waterLevel: numOrNull(mapping.waterLevel, row),
      totalObservedVolume: numOrNull(mapping.totalObservedVolume, row),
      waterVolume: numOrNull(mapping.waterVolume, row),
      actualVolume,
      bookStock,
      difference,
      volume15C: numOrNull(mapping.volume15C, row),
      avgTemperature: numOrNull(mapping.avgTemperature, row),
      lastUpdate,
      mainState: mainStateRaw || (connected ? 'OPERATIVE' : 'NOT CONNECTED'),
      connected,
    })
    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date
  }

  await bulkInsertTankReadings(rows)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'tankReadings',
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
