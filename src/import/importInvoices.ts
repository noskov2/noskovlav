import { uid, slugify } from '@/lib/id'
import type { ParsedSheet } from '@/import/excelParser'
import { toDateString, toNumber } from '@/import/columnMapping'
import { listClients, bulkSetClients } from '@/data/repo/clients'
import { bulkInsertClientInvoices } from '@/data/repo/clientInvoices'
import { addImportBatch } from '@/data/repo/importBatches'
import type { Client, ClientInvoiceLine, InvoiceColumnMapping } from '@/types/domain'

export interface InvoiceImportResult {
  importBatchId: string
  rowCount: number
  skippedRows: number
  newClientCount: number
  dateMin: string | null
  dateMax: string | null
}

function clean(v: string): string | null {
  const t = v.trim()
  return t && t !== '-' ? t : null
}

/**
 * Imports issued invoices (facturi emise către clienți business/flotă) —
 * the reverse of achiziții: sales made TO a client on invoice instead of
 * paid at the pump. Uses the same in-memory batch-resolution pattern as
 * importTransactions.ts (pre-load every client once, resolve/create in
 * memory, one bulk write at the end) instead of a per-row DB round trip —
 * a 2000+ row export otherwise takes minutes with zero feedback.
 */
export async function importInvoiceSheet(
  filename: string,
  sheet: ParsedSheet,
  mapping: InvoiceColumnMapping,
): Promise<InvoiceImportResult> {
  const importBatchId = uid('import')

  const existingClients = await listClients()
  const clientsById = new Map(existingClients.map((c) => [c.id, c]))
  const existingIds = new Set(clientsById.keys())
  const dirtyClients = new Map<string, Client>()
  const newClientIds = new Set<string>()

  function resolveClient(
    rawName: string,
    fiscalCodeRaw: string,
    regComRaw: string,
    addressRaw: string,
    localityRaw: string,
    countyRaw: string,
  ): Client {
    const trimmedName = rawName.trim() || 'Necunoscut'
    const fiscalCode = clean(fiscalCodeRaw)
    const id = slugify(fiscalCode || trimmedName) || `client-${Date.now()}`

    const current = dirtyClients.get(id) ?? clientsById.get(id)
    if (current) {
      if (!current.aliases.includes(trimmedName)) {
        const updated = { ...current, aliases: [...current.aliases, trimmedName] }
        dirtyClients.set(id, updated)
        clientsById.set(id, updated)
        return updated
      }
      return current
    }

    if (!existingIds.has(id)) newClientIds.add(id)
    const client: Client = {
      id,
      name: trimmedName,
      fiscalCode,
      regCom: clean(regComRaw),
      address: clean(addressRaw),
      locality: clean(localityRaw),
      county: clean(countyRaw),
      aliases: [trimmedName],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    dirtyClients.set(id, client)
    clientsById.set(id, client)
    return client
  }

  const lines: ClientInvoiceLine[] = []
  let skipped = 0
  let dateMin: string | null = null
  let dateMax: string | null = null

  for (const row of sheet.rows) {
    const invoiceNo = String(row[mapping.invoiceNo] ?? '').trim()
    const date = toDateString(row[mapping.date])
    const value = toNumber(row[mapping.value])
    const clientNameRaw = String(row[mapping.clientName] ?? '').trim()
    if (!invoiceNo || !date || value <= 0 || !clientNameRaw) {
      skipped++
      continue
    }

    const client = resolveClient(
      clientNameRaw,
      mapping.fiscalCode ? String(row[mapping.fiscalCode] ?? '') : '',
      mapping.regCom ? String(row[mapping.regCom] ?? '') : '',
      mapping.address ? String(row[mapping.address] ?? '') : '',
      mapping.locality ? String(row[mapping.locality] ?? '') : '',
      mapping.county ? String(row[mapping.county] ?? '') : '',
    )

    const valueNoVat = mapping.valueNoVat ? toNumber(row[mapping.valueNoVat]) : 0
    const vatValue = mapping.vatValue ? toNumber(row[mapping.vatValue]) : 0
    const onCreditRaw = mapping.onCredit ? String(row[mapping.onCredit] ?? '').trim().toLowerCase() : ''
    const onCredit = onCreditRaw === 'da' || onCreditRaw === 'yes' || onCreditRaw === 'true'

    lines.push({
      id: uid('inv'),
      importBatchId,
      invoiceNo,
      clientId: client.id,
      clientRaw: clientNameRaw,
      date,
      valueNoVat,
      vatValue,
      value,
      onCredit,
      driver: mapping.driver ? clean(String(row[mapping.driver] ?? '')) : null,
      vehicle: mapping.vehicle ? clean(String(row[mapping.vehicle] ?? '')) : null,
    })
    if (!dateMin || date < dateMin) dateMin = date
    if (!dateMax || date > dateMax) dateMax = date
  }

  if (dirtyClients.size > 0) await bulkSetClients(Array.from(dirtyClients.values()))
  await bulkInsertClientInvoices(lines)
  await addImportBatch({
    id: importBatchId,
    filename,
    kind: 'invoices',
    importedAt: Date.now(),
    rowCount: lines.length,
    dateMin,
    dateMax,
    fileHash: null,
    duplicateRowCount: 0,
    invalidRowCount: 0,
    newProductCount: 0,
    newCashierCount: 0,
    newClientCount: newClientIds.size,
  })

  return {
    importBatchId,
    rowCount: lines.length,
    skippedRows: skipped,
    newClientCount: newClientIds.size,
    dateMin,
    dateMax,
  }
}
