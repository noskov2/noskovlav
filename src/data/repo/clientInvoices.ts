import { db } from '@/data/db'
import type { ClientInvoiceLine } from '@/types/domain'

export async function bulkInsertClientInvoices(rows: ClientInvoiceLine[]): Promise<void> {
  await db.clientInvoices.bulkPut(rows)
}

export async function listAllClientInvoices(): Promise<ClientInvoiceLine[]> {
  return db.clientInvoices.toArray()
}

export async function deleteImportBatchClientInvoices(importBatchId: string): Promise<void> {
  await db.clientInvoices.where('importBatchId').equals(importBatchId).delete()
}

export async function reassignClientInvoices(fromClientId: string, toClientId: string): Promise<number> {
  const rows = await db.clientInvoices.where('clientId').equals(fromClientId).toArray()
  await db.clientInvoices.bulkPut(rows.map((r) => ({ ...r, clientId: toClientId })))
  return rows.length
}
