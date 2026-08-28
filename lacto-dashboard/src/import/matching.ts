import { findBestCandidates } from '../lib/fuzzy'
import { normalizeForCompare } from '../lib/ro-format'
import type { MatchCandidate } from '../types'

/**
 * Motor de identificare clienți/produse (spec §5): cod Mentor > CUI/CIF >
 * alias deja confirmat > nume normalizat exact > fuzzy (doar propunere).
 *
 * Funcții pure, fără Dexie — rulează atât în worker (pe un snapshot trimis
 * prin postMessage), cât și pe main thread (pentru reevaluări din UI).
 */

export interface ClientLite {
  id: number
  canonicalName: string
  canonicalNameNormalized: string
}

export interface ProductLite {
  id: number
  canonicalName: string
  canonicalNameNormalized: string
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

export interface ClientMatchSnapshot {
  clients: ClientLite[]
  byNormalizedName: Map<string, number>
  byCode: Map<string, number>
  byCui: Map<string, number>
  blacklist: Map<string, Set<number>>
}

export function buildClientSnapshot(params: {
  clients: { id: number; canonicalName: string; canonicalNameNormalized: string; mentorCode?: string; cui?: string }[]
  aliases: { clientId: number; normalizedName: string }[]
  blacklist: { normalizedName: string; candidateClientId: number }[]
}): ClientMatchSnapshot {
  const clients: ClientLite[] = params.clients.map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    canonicalNameNormalized: c.canonicalNameNormalized,
  }))

  const byNormalizedName = new Map<string, number>()
  for (const c of params.clients) byNormalizedName.set(c.canonicalNameNormalized, c.id)
  for (const a of params.aliases) byNormalizedName.set(a.normalizedName, a.clientId)

  const byCode = new Map<string, number>()
  for (const c of params.clients) if (c.mentorCode) byCode.set(normalizeCode(c.mentorCode), c.id)

  const byCui = new Map<string, number>()
  for (const c of params.clients) if (c.cui) byCui.set(normalizeCode(c.cui), c.id)

  const blacklist = new Map<string, Set<number>>()
  for (const b of params.blacklist) {
    if (!blacklist.has(b.normalizedName)) blacklist.set(b.normalizedName, new Set())
    blacklist.get(b.normalizedName)!.add(b.candidateClientId)
  }

  return { clients, byNormalizedName, byCode, byCui, blacklist }
}

export type ClientResolution =
  | { type: 'matched'; clientId: number }
  | { type: 'new'; normalizedName: string; rawName: string }
  | { type: 'queue'; normalizedName: string; rawName: string; candidates: MatchCandidate[] }

/**
 * Rezolvă un client pe baza priorității din spec §5. Fuzzy matching NU
 * decide singur unificarea (§38) — doar propune, în coada de verificare.
 */
export function resolveClient(
  rawName: string,
  clientCode: string | undefined,
  cui: string | undefined,
  snapshot: ClientMatchSnapshot,
): ClientResolution {
  if (clientCode) {
    const id = snapshot.byCode.get(normalizeCode(clientCode))
    if (id !== undefined) return { type: 'matched', clientId: id }
  }
  if (cui) {
    const id = snapshot.byCui.get(normalizeCode(cui))
    if (id !== undefined) return { type: 'matched', clientId: id }
  }

  const normalizedName = normalizeForCompare(rawName)
  const exact = snapshot.byNormalizedName.get(normalizedName)
  if (exact !== undefined) return { type: 'matched', clientId: exact }

  const excluded = snapshot.blacklist.get(normalizedName)
  const pool = excluded ? snapshot.clients.filter((c) => !excluded.has(c.id)) : snapshot.clients
  const candidates = findBestCandidates(rawName, pool, (c) => c.canonicalName).map((c) => ({
    clientId: c.item.id,
    canonicalName: c.item.canonicalName,
    score: c.score,
  }))

  if (candidates.length > 0) return { type: 'queue', normalizedName, rawName, candidates }
  return { type: 'new', normalizedName, rawName }
}

export interface ProductMatchSnapshot {
  byNormalizedName: Map<string, number>
  byCode: Map<string, number>
}

export function buildProductSnapshot(params: {
  products: { id: number; canonicalNameNormalized: string; productCode?: string }[]
  aliases: { productId: number; normalizedName: string }[]
}): ProductMatchSnapshot {
  const byNormalizedName = new Map<string, number>()
  for (const p of params.products) byNormalizedName.set(p.canonicalNameNormalized, p.id)
  for (const a of params.aliases) byNormalizedName.set(a.normalizedName, a.productId)

  const byCode = new Map<string, number>()
  for (const p of params.products) if (p.productCode) byCode.set(normalizeCode(p.productCode), p.id)

  return { byNormalizedName, byCode }
}

export type ProductResolution =
  | { type: 'matched'; productId: number }
  | { type: 'new'; normalizedName: string; rawName: string }

/**
 * Rezolvă un produs: cod Mentor > nume normalizat exact > creare automată.
 * Spre deosebire de clienți, produsele nu au o coadă de verificare fuzzy în
 * Etapa 2 (spec §11 nu o cere explicit) — denumiri noi devin produse noi,
 * editabile ulterior din Nomenclator produse.
 */
export function resolveProduct(
  rawName: string,
  productCode: string | undefined,
  snapshot: ProductMatchSnapshot,
): ProductResolution {
  if (productCode) {
    const id = snapshot.byCode.get(normalizeCode(productCode))
    if (id !== undefined) return { type: 'matched', productId: id }
  }

  const normalizedName = normalizeForCompare(rawName)
  const exact = snapshot.byNormalizedName.get(normalizedName)
  if (exact !== undefined) return { type: 'matched', productId: exact }

  return { type: 'new', normalizedName, rawName }
}
