import { db } from '@/data/db'
import { slugify } from '@/lib/id'
import type { Client } from '@/types/domain'
import { reassignClientInvoices } from '@/data/repo/clientInvoices'

export async function listClients(): Promise<Client[]> {
  return db.clients.toArray()
}

export async function getClient(id: string): Promise<Client | undefined> {
  return db.clients.get(id)
}

export async function upsertClient(client: Client): Promise<void> {
  await db.clients.put({ ...client, updatedAt: Date.now() })
}

export async function deleteClient(id: string): Promise<void> {
  await db.clients.delete(id)
}

export async function bulkSetClients(clients: Client[]): Promise<void> {
  await db.clients.bulkPut(clients)
}

/**
 * Resolves a raw invoice row to a canonical Client, creating one on first
 * sight. Identity is the fiscal code (CUI) when the file provides one — the
 * one field that reliably identifies a Romanian company across invoices,
 * even if its name is spelled slightly differently next time (legal-form
 * suffix added/dropped, diacritics, etc.). Falls back to the normalized name
 * only for the rare row with no fiscal code at all (e.g. an individual).
 */
export async function resolveOrCreateClient(
  rawName: string,
  fiscalCodeRaw: string,
  regCom: string,
  address: string,
  locality: string,
  county: string,
): Promise<Client> {
  const trimmedName = rawName.trim() || 'Necunoscut'
  const fiscalCode = fiscalCodeRaw.trim() && fiscalCodeRaw.trim() !== '-' ? fiscalCodeRaw.trim() : null
  const id = slugify(fiscalCode || trimmedName) || `client-${Date.now()}`

  const existing = await db.clients.get(id)
  if (existing) {
    if (!existing.aliases.includes(trimmedName)) {
      const updated: Client = { ...existing, aliases: [...existing.aliases, trimmedName] }
      await db.clients.put(updated)
      return updated
    }
    return existing
  }

  const clean = (v: string) => (v.trim() && v.trim() !== '-' ? v.trim() : null)
  const client: Client = {
    id,
    name: trimmedName,
    fiscalCode,
    regCom: clean(regCom),
    address: clean(address),
    locality: clean(locality),
    county: clean(county),
    aliases: [trimmedName],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await db.clients.put(client)
  return client
}

/**
 * Merges `sourceId` into `targetId`: reassigns every invoice, folds the
 * alias lists together, and deletes the source record. Mirrors
 * mergeCashiers/mergeProducts — for when the same client ended up split
 * across two records (e.g. one import row missing the fiscal code).
 */
export async function mergeClients(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return
  const [source, target] = await Promise.all([db.clients.get(sourceId), db.clients.get(targetId)])
  if (!source || !target) return

  await reassignClientInvoices(sourceId, targetId)
  const mergedAliases = Array.from(new Set([...target.aliases, ...source.aliases]))
  await db.clients.put({
    ...target,
    aliases: mergedAliases,
    fiscalCode: target.fiscalCode ?? source.fiscalCode,
    regCom: target.regCom ?? source.regCom,
    address: target.address ?? source.address,
    locality: target.locality ?? source.locality,
    county: target.county ?? source.county,
    updatedAt: Date.now(),
  })
  await db.clients.delete(sourceId)
}
