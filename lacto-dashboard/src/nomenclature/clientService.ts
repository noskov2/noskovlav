import { db } from '../db/db'
import { buildClientSnapshot, type ClientMatchSnapshot } from '../import/matching'
import { normalizeForCompare } from '../lib/ro-format'
import type { ClientAuditOperation, ClientRecord, NewClientRequest, QueueUpsertRequest } from '../types'

const ACTOR = 'utilizator'

export async function loadClientSnapshot(): Promise<ClientMatchSnapshot> {
  const [clients, aliases, blacklist] = await Promise.all([
    db.clients.toArray(),
    db.clientAliases.toArray(),
    db.clientMatchBlacklist.toArray(),
  ])
  return buildClientSnapshot({
    clients: clients.filter((c): c is typeof c & { id: number } => c.id !== undefined),
    aliases,
    blacklist,
  })
}

async function logAudit(
  operation: ClientAuditOperation,
  data: Partial<{
    fromClientId: number
    fromClientName: string
    toClientId: number
    toClientName: string
    reason: string
  }>,
  actor: string = ACTOR,
): Promise<void> {
  await db.clientAuditLog.add({ date: Date.now(), operation, actor, ...data })
}

/** Creează un client canonical nou (§4). */
export async function createClient(canonicalName: string, extra?: Partial<ClientRecord>, actor = ACTOR): Promise<number> {
  const now = Date.now()
  const id = await db.clients.add({
    canonicalName,
    canonicalNameNormalized: normalizeForCompare(canonicalName),
    createdAt: now,
    updatedAt: now,
    ...extra,
  })
  await logAudit('create', { toClientId: id as number, toClientName: canonicalName }, actor)
  return id as number
}

async function addAliasInternal(
  clientId: number,
  rawName: string,
  source: 'import-exact' | 'manual' | 'fuzzy-confirmed',
  confirmedByUser: boolean,
): Promise<void> {
  const normalizedName = normalizeForCompare(rawName)
  const existing = await db.clientAliases.where('clientId').equals(clientId).and((a) => a.normalizedName === normalizedName).first()
  if (existing) return
  await db.clientAliases.add({
    clientId,
    rawName,
    normalizedName,
    source,
    confidence: source === 'import-exact' ? 100 : 100,
    confirmedByUser,
    createdAt: Date.now(),
  })
}

/** Confirmă „Este X" pentru o intrare din coada de verificare (§7, §8: se memorează permanent). */
export async function confirmQueueMatch(normalizedName: string, clientId: number, reason?: string): Promise<void> {
  const entry = await db.clientMatchQueue.get(normalizedName)
  if (!entry) throw new Error('Intrarea din coada de verificare nu mai există.')
  const client = await db.clients.get(clientId)
  if (!client) throw new Error('Clientul selectat nu mai există.')

  await addAliasInternal(clientId, entry.rawName, 'fuzzy-confirmed', true)
  await db.transactions.where('clientNormalized').equals(normalizedName).and((t) => t.canonicalClientId === null).modify({ canonicalClientId: clientId })
  await db.clientMatchQueue.update(normalizedName, { status: 'resolved', resolvedClientId: clientId })
  await logAudit('alias-confirm', {
    fromClientName: entry.rawName,
    toClientId: clientId,
    toClientName: client.canonicalName,
    reason,
  })
}

/** „Creează client nou" din coada de verificare. */
export async function createClientFromQueue(normalizedName: string): Promise<number> {
  const entry = await db.clientMatchQueue.get(normalizedName)
  if (!entry) throw new Error('Intrarea din coada de verificare nu mai există.')

  const clientId = await createClient(entry.rawName, { mentorCode: entry.clientCode, cui: entry.cui })
  await addAliasInternal(clientId, entry.rawName, 'manual', true)
  await db.transactions.where('clientNormalized').equals(normalizedName).and((t) => t.canonicalClientId === null).modify({ canonicalClientId: clientId })
  await db.clientMatchQueue.update(normalizedName, { status: 'resolved', resolvedClientId: clientId })
  return clientId
}

/** „Ignoră" — ascunde intrarea din coada activă, fără să creeze/asocieze nimic. */
export async function ignoreQueueEntry(normalizedName: string): Promise<void> {
  await db.clientMatchQueue.update(normalizedName, { status: 'ignored' })
}

export async function reopenQueueEntry(normalizedName: string): Promise<void> {
  await db.clientMatchQueue.update(normalizedName, { status: 'pending' })
}

/** „Nu mai propune această asociere" — exclude definitiv un candidat pentru această denumire. */
export async function blacklistCandidate(normalizedName: string, candidateClientId: number): Promise<void> {
  await db.clientMatchBlacklist.add({ normalizedName, candidateClientId, createdAt: Date.now() })
  const entry = await db.clientMatchQueue.get(normalizedName)
  if (entry) {
    const candidates = entry.candidates.filter((c) => c.clientId !== candidateClientId)
    await db.clientMatchQueue.update(normalizedName, { candidates })
  }
}

/** Mută un alias la alt client — folosit atât pentru corectarea aliasurilor (§8) cât și pentru „Split client" (§9). */
export async function moveAlias(aliasId: number, toClientId: number, reason?: string): Promise<void> {
  const alias = await db.clientAliases.get(aliasId)
  if (!alias) throw new Error('Aliasul nu mai există.')
  const [fromClient, toClient] = await Promise.all([db.clients.get(alias.clientId), db.clients.get(toClientId)])
  if (!toClient) throw new Error('Clientul destinație nu mai există.')

  await db.clientAliases.update(aliasId, { clientId: toClientId, confirmedByUser: true })
  await db.transactions.where('clientNormalized').equals(alias.normalizedName).modify({ canonicalClientId: toClientId })
  await logAudit('split', {
    fromClientId: alias.clientId,
    fromClientName: fromClient?.canonicalName,
    toClientId,
    toClientName: toClient.canonicalName,
    reason,
  })
}

/** Șterge un alias — tranzacțiile aferente redevin neidentificate (rămân disponibile pentru re-triere). */
export async function deleteAlias(aliasId: number): Promise<void> {
  const alias = await db.clientAliases.get(aliasId)
  if (!alias) return
  await db.clientAliases.delete(aliasId)
  await db.transactions.where('clientNormalized').equals(alias.normalizedName).modify({ canonicalClientId: null })
  await logAudit('alias-delete', { fromClientId: alias.clientId, fromClientName: alias.rawName })
}

/** Unește doi clienți: toate aliasurile și tranzacțiile lui `fromClientId` trec la `toClientId` (§9). */
export async function mergeClients(fromClientId: number, toClientId: number, reason?: string): Promise<void> {
  if (fromClientId === toClientId) throw new Error('Nu poți uni un client cu el însuși.')
  const [fromClient, toClient] = await Promise.all([db.clients.get(fromClientId), db.clients.get(toClientId)])
  if (!fromClient || !toClient) throw new Error('Unul dintre clienți nu mai există.')

  await db.transaction('rw', db.clients, db.clientAliases, db.transactions, db.clientAuditLog, async () => {
    // păstrează numele canonical vechi ca alias, ca denumirile exacte din trecut să mai rezolve
    await addAliasInternal(toClientId, fromClient.canonicalName, 'manual', true)
    await db.clientAliases.where('clientId').equals(fromClientId).modify({ clientId: toClientId })
    // canonicalClientId nu e indexat (operație rară, nu justifică un index în plus pe calea de import)
    await db.transactions.toCollection().filter((t) => t.canonicalClientId === fromClientId).modify({ canonicalClientId: toClientId })
    await db.clients.delete(fromClientId)
    await logAudit('merge', {
      fromClientId,
      fromClientName: fromClient.canonicalName,
      toClientId,
      toClientName: toClient.canonicalName,
      reason,
    })
  })
}

export async function listClients(): Promise<ClientRecord[]> {
  const clients = await db.clients.toArray()
  return clients.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))
}

/** Adaugă manual un alias existent (§8: „Aliasurile trebuie să poată fi adăugate"). */
export async function addManualAlias(clientId: number, rawName: string): Promise<void> {
  await addAliasInternal(clientId, rawName, 'manual', true)
  await db.transactions.where('clientNormalized').equals(normalizeForCompare(rawName)).and((t) => t.canonicalClientId === null).modify({ canonicalClientId: clientId })
}

export async function updateClient(id: number, patch: Partial<ClientRecord>): Promise<void> {
  const next = { ...patch, updatedAt: Date.now() }
  if (patch.canonicalName) next.canonicalNameNormalized = normalizeForCompare(patch.canonicalName)
  await db.clients.update(id, next)
}

export async function listAliasesForClient(clientId: number) {
  return db.clientAliases.where('clientId').equals(clientId).toArray()
}

export async function listAuditLog(limit = 100) {
  return db.clientAuditLog.orderBy('date').reverse().limit(limit).toArray()
}

/**
 * Aplică rezultatul identificării calculate în worker pentru un import: creează
 * clienții noi (denumiri fără niciun candidat plauzibil — nu există risc de
 * unificare greșită, §38) și actualizează coada de verificare pentru denumirile
 * ambigue. Returnează maparea normalizedName -> id client nou creat.
 */
export async function applyImportResolutions(
  newClients: NewClientRequest[],
  queueUpserts: QueueUpsertRequest[],
): Promise<Record<string, number>> {
  const clientIdMap: Record<string, number> = {}

  for (const req of newClients) {
    const id = await createClient(req.rawName, { mentorCode: req.clientCode, cui: req.cui }, 'import automat')
    await addAliasInternal(id, req.rawName, 'import-exact', false)
    clientIdMap[req.normalizedName] = id
  }

  const now = Date.now()
  for (const req of queueUpserts) {
    // Candidații care indicau spre o denumire nouă descoperită ÎN ACEST import
    // (nu încă un client real) au acum id-ul real, creat mai sus.
    const resolvedCandidates = req.candidates
      .map((c) => (c.pendingNormalizedName ? { ...c, clientId: clientIdMap[c.pendingNormalizedName] } : c))
      .filter((c) => c.clientId !== undefined)

    const existing = await db.clientMatchQueue.get(req.normalizedName)
    if (existing) {
      await db.clientMatchQueue.update(req.normalizedName, {
        occurrences: existing.occurrences + req.occurrences,
        lastSeenAt: now,
        candidates: resolvedCandidates,
        clientCode: req.clientCode ?? existing.clientCode,
        cui: req.cui ?? existing.cui,
      })
    } else {
      await db.clientMatchQueue.put({
        normalizedName: req.normalizedName,
        rawName: req.rawName,
        clientCode: req.clientCode,
        cui: req.cui,
        candidates: resolvedCandidates,
        status: 'pending',
        occurrences: req.occurrences,
        firstSeenAt: now,
        lastSeenAt: now,
      })
    }
  }

  return clientIdMap
}
