import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import {
  addManualAlias,
  createClient,
  deleteAlias,
  listAuditLog,
  mergeClients,
  moveAlias,
  updateClient,
} from '../nomenclature/clientService'
import { formatDate, formatNumber } from '../lib/ro-format'
import type { ClientAlias, ClientRecord } from '../types'

export function ClientNomenclaturePage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showAudit, setShowAudit] = useState(false)
  const [busy, setBusy] = useState(false)

  const clients = useLiveQuery(() => db.clients.toArray(), [])
  const aliases = useLiveQuery(
    () => (selectedId !== null ? db.clientAliases.where('clientId').equals(selectedId).toArray() : Promise.resolve<ClientAlias[]>([])),
    [selectedId],
  )
  const auditLog = useLiveQuery(() => (showAudit ? listAuditLog(50) : Promise.resolve([])), [showAudit])

  const filtered = (clients ?? [])
    .filter((c) => c.canonicalName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'ro'))

  const selected = clients?.find((c) => c.id === selectedId) ?? null

  async function handleCreateClient() {
    const name = prompt('Denumire client nou:')
    if (!name?.trim()) return
    const id = await createClient(name.trim())
    setSelectedId(id)
  }

  async function handleAddAlias() {
    if (!selected?.id) return
    const raw = prompt(`Adaugă alias pentru „${selected.canonicalName}":`)
    if (!raw?.trim()) return
    setBusy(true)
    try {
      await addManualAlias(selected.id, raw.trim())
    } finally {
      setBusy(false)
    }
  }

  async function handleMerge() {
    if (!selected?.id || !clients) return
    const targetName = prompt(
      `Unește „${selected.canonicalName}" în alt client. Scrie denumirea exactă a clientului destinație:`,
    )
    if (!targetName?.trim()) return
    const target = clients.find((c) => c.canonicalName.toLowerCase() === targetName.trim().toLowerCase())
    if (!target?.id) {
      alert('Nu am găsit un client cu această denumire exactă.')
      return
    }
    if (!confirm(`Sigur unești „${selected.canonicalName}" în „${target.canonicalName}"? Toate tranzacțiile și aliasurile trec la „${target.canonicalName}".`)) {
      return
    }
    setBusy(true)
    try {
      await mergeClients(selected.id, target.id)
      setSelectedId(target.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleMoveAlias(aliasId: number) {
    if (!clients) return
    const targetName = prompt('Mută acest alias la clientul (denumire exactă):')
    if (!targetName?.trim()) return
    const target = clients.find((c) => c.canonicalName.toLowerCase() === targetName.trim().toLowerCase())
    if (!target?.id) {
      alert('Nu am găsit un client cu această denumire exactă.')
      return
    }
    setBusy(true)
    try {
      await moveAlias(aliasId, target.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold">Nomenclator clienți</h1>
        <button className="text-xs text-slate-500 hover:underline" onClick={() => setShowAudit((v) => !v)}>
          {showAudit ? 'ascunde jurnalul' : 'jurnal modificări'}
        </button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Clienți canonici și aliasurile lor (§4). Fiecare denumire brută importată indică spre exact un
        client canonical.
      </p>

      {showAudit && (
        <div className="mb-6 border border-slate-200 dark:border-slate-800 rounded-lg p-3 max-h-56 overflow-y-auto text-xs">
          {(auditLog ?? []).length === 0 && <div className="text-slate-400">Niciun eveniment încă.</div>}
          {(auditLog ?? []).map((e) => (
            <div key={e.id} className="border-b border-slate-100 dark:border-slate-800 py-1 last:border-0">
              <span className="text-slate-400">{formatDate(new Date(e.date).toISOString().slice(0, 10))}</span>{' '}
              <span className="font-medium">{e.operation}</span>{' '}
              {e.fromClientName && <span>„{e.fromClientName}"</span>}
              {e.toClientName && <span> → „{e.toClientName}"</span>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        <div>
          <div className="flex gap-2 mb-2">
            <input
              className="flex-1 border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm"
              placeholder="Caută client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="text-xs px-2 rounded-md border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={handleCreateClient}
            >
              + client
            </button>
          </div>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg max-h-[60vh] overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                className={`block w-full text-left px-3 py-2 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 ${
                  c.id === selectedId ? 'bg-emerald-50 dark:bg-emerald-950' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
                onClick={() => setSelectedId(c.id ?? null)}
              >
                {c.canonicalName}
              </button>
            ))}
            {filtered.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">Niciun client.</div>}
          </div>
        </div>

        <div>
          {!selected ? (
            <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
              Selectează un client din listă.
            </div>
          ) : (
            <ClientDetail
              client={selected}
              aliases={aliases ?? []}
              busy={busy}
              onSave={(patch) => selected.id && updateClient(selected.id, patch)}
              onAddAlias={handleAddAlias}
              onDeleteAlias={(id) => deleteAlias(id)}
              onMoveAlias={handleMoveAlias}
              onMerge={handleMerge}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ClientDetail({
  client,
  aliases,
  busy,
  onSave,
  onAddAlias,
  onDeleteAlias,
  onMoveAlias,
  onMerge,
}: {
  client: ClientRecord
  aliases: { id?: number; rawName: string; source: string; confidence: number; confirmedByUser: boolean }[]
  busy: boolean
  onSave: (patch: Partial<ClientRecord>) => void
  onAddAlias: () => void
  onDeleteAlias: (aliasId: number) => void
  onMoveAlias: (aliasId: number) => void
  onMerge: () => void
}) {
  const [name, setName] = useState(client.canonicalName)
  const [mentorCode, setMentorCode] = useState(client.mentorCode ?? '')
  const [cui, setCui] = useState(client.cui ?? '')

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium text-slate-500">Denumire canonică</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== client.canonicalName && onSave({ canonicalName: name.trim() })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Cod client Mentor</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={mentorCode}
            onChange={(e) => setMentorCode(e.target.value)}
            onBlur={() => mentorCode !== (client.mentorCode ?? '') && onSave({ mentorCode: mentorCode || undefined })}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">CUI / CIF</label>
          <input
            className="w-full border border-slate-300 dark:border-slate-700 dark:bg-slate-800 rounded-md px-2 py-1.5 text-sm mt-1"
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            onBlur={() => cui !== (client.cui ?? '') && onSave({ cui: cui || undefined })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-slate-500">Aliasuri ({formatNumber(aliases.length)})</div>
        <div className="flex gap-3 text-xs">
          <button className="text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50" disabled={busy} onClick={onAddAlias}>
            + adaugă alias
          </button>
          <button className="text-amber-700 dark:text-amber-400 hover:underline disabled:opacity-50" disabled={busy} onClick={onMerge}>
            unește cu alt client
          </button>
        </div>
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-md divide-y divide-slate-100 dark:divide-slate-800">
        {aliases.length === 0 && <div className="px-3 py-3 text-sm text-slate-400">Niciun alias.</div>}
        {aliases.map((a) => (
          <div key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
            <span>
              {a.rawName}{' '}
              <span className="text-xs text-slate-400">
                ({a.source === 'import-exact' ? 'din import' : a.source === 'manual' ? 'manual' : 'confirmat'})
              </span>
            </span>
            <span className="flex gap-2 text-xs">
              <button className="text-slate-500 hover:underline disabled:opacity-50" disabled={busy} onClick={() => a.id && onMoveAlias(a.id)}>
                mută
              </button>
              <button className="text-rose-600 hover:underline disabled:opacity-50" disabled={busy} onClick={() => a.id && onDeleteAlias(a.id)}>
                șterge
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
