import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabs } from '@/components/ui/Tabs'
import { useDataStore } from '@/store/dataStore'
import { setGroupForCategory, upsertProduct } from '@/data/repo/products'
import { mergeCashiers, upsertCashier } from '@/data/repo/cashiers'
import { deleteTeam, upsertTeam } from '@/data/repo/teams'
import { updateSettings } from '@/data/repo/settings'
import { slugify, uid } from '@/lib/id'
import type { Cashier, CategoryGroupRules, Product, ProductGroups, Team } from '@/types/domain'

const GROUP_LABELS: Record<keyof ProductGroups, string> = {
  cafea: 'Cafea',
  dulciuriVitrina: 'Dulciuri Vitrină',
  sandwich: 'Sandwich',
  limonadaCeai: 'Limonadă/Ceai',
  carburant: 'Carburant',
  gpl: 'GPL',
}

export function NomenclaturePage() {
  const [tab, setTab] = useState<'produse' | 'grupuri' | 'casieri'>('produse')
  const { products, cashiers, teams, transactions, settings, refresh } = useDataStore()

  if (transactions.length === 0 && products.length === 0 && cashiers.length === 0) {
    return (
      <div>
        <PageHeader title="Nomenclator" />
        <EmptyState description="Nomenclatorul de produse și casieri se completează automat pe măsură ce imporți date. Poți reveni aici oricând pentru a ajusta categorii, prețuri și grupuri speciale." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Nomenclator"
        description="Configurează produsele (categorie, prețuri, grupuri speciale), casierii și corespondența denumirilor din import."
      />
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Tabs
          tabs={[
            { key: 'produse', label: `Produse (${products.length})` },
            { key: 'grupuri', label: 'Grupuri pe categorie' },
            { key: 'casieri', label: `Casieri (${cashiers.length})` },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'produse' | 'grupuri' | 'casieri')}
        />
        <div className="mt-4">
          {tab === 'produse' && (
            <ProductsTab products={products} onSave={async (p) => { await upsertProduct(p); await refresh() }} />
          )}
          {tab === 'grupuri' && (
            <GroupsByCategoryTab
              products={products}
              rules={settings?.categoryGroupRules ?? null}
              onToggle={async (category, group, enabled) => {
                await setGroupForCategory(category, group, enabled)
                const current = settings?.categoryGroupRules ?? {
                  cafea: [], dulciuriVitrina: [], sandwich: [], limonadaCeai: [], carburant: [], gpl: [],
                }
                const list = current[group]
                const nextList = enabled ? Array.from(new Set([...list, category])) : list.filter((c) => c !== category)
                await updateSettings({ categoryGroupRules: { ...current, [group]: nextList } })
                await refresh()
              }}
            />
          )}
          {tab === 'casieri' && (
            <CashiersTab
              cashiers={cashiers}
              teams={teams}
              onSave={async (c) => { await upsertCashier(c); await refresh() }}
              onMerge={async (source, target) => { await mergeCashiers(source, target); await refresh() }}
              onAddTeam={async (name) => {
                const id = slugify(name) || uid('team')
                await upsertTeam({ id, name, createdAt: Date.now() })
                await refresh()
              }}
              onRenameTeam={async (team) => { await upsertTeam(team); await refresh() }}
              onDeleteTeam={async (id) => { await deleteTeam(id); await refresh() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ProductsTab({ products, onSave }: { products: Product[]; onSave: (p: Product) => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Record<string, Partial<Product>>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) : products
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [products, query])

  function fieldValue<K extends keyof Product>(p: Product, key: K): Product[K] {
    return (draft[p.id]?.[key] as Product[K]) ?? p[key]
  }

  function setField(p: Product, patch: Partial<Product>) {
    setDraft((d) => ({ ...d, [p.id]: { ...d[p.id], ...patch } }))
  }

  async function commit(p: Product) {
    const patch = draft[p.id]
    if (!patch) return
    await onSave({ ...p, ...patch })
    setDraft((d) => {
      const copy = { ...d }
      delete copy[p.id]
      return copy
    })
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Caută produs sau categorie..."
        className="mb-3 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
      />
      <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Produs</th>
              <th className="px-3 py-2">Categorie</th>
              <th className="px-3 py-2">Subcategorie</th>
              <th className="px-3 py-2">Furnizor</th>
              <th className="px-3 py-2 text-right">Preț achiziție</th>
              <th className="px-3 py-2 text-right">Preț vânzare</th>
              <th className="px-3 py-2 text-right">Stoc curent</th>
              <th className="px-3 py-2">Grupuri</th>
              <th className="px-3 py-2 text-center">Activ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.slice(0, 300).map((p) => {
              const hasDraft = !!draft[p.id]
              return (
                <tr key={p.id} className={hasDraft ? 'bg-amber-50/60' : undefined}>
                  <td className="px-3 py-1.5 font-medium text-slate-800">
                    {p.name}
                    {p.autoCreated && <span className="ml-1.5 rounded bg-slate-100 px-1 text-[10px] text-slate-400">auto</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-28 rounded border border-slate-200 px-1.5 py-0.5"
                      value={fieldValue(p, 'category')}
                      onChange={(e) => setField(p, { category: e.target.value })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-28 rounded border border-slate-200 px-1.5 py-0.5"
                      value={fieldValue(p, 'subcategory')}
                      onChange={(e) => setField(p, { subcategory: e.target.value })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-24 rounded border border-slate-200 px-1.5 py-0.5"
                      value={fieldValue(p, 'supplier')}
                      onChange={(e) => setField(p, { supplier: e.target.value })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right"
                      value={fieldValue(p, 'purchasePrice') ?? ''}
                      onChange={(e) => setField(p, { purchasePrice: e.target.value === '' ? null : Number(e.target.value) })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right"
                      value={fieldValue(p, 'salePrice') ?? ''}
                      onChange={(e) => setField(p, { salePrice: e.target.value === '' ? null : Number(e.target.value) })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      step="1"
                      className="w-20 rounded border border-slate-200 px-1.5 py-0.5 text-right"
                      value={fieldValue(p, 'currentStock') ?? ''}
                      onChange={(e) => setField(p, { currentStock: e.target.value === '' ? null : Number(e.target.value) })}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(GROUP_LABELS) as (keyof ProductGroups)[]).map((g) => {
                        const groups = fieldValue(p, 'groups')
                        return (
                          <label
                            key={g}
                            className={`cursor-pointer rounded-full border px-1.5 py-0.5 text-[10px] ${
                              groups[g] ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-400'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={groups[g]}
                              onChange={(e) => {
                                setField(p, { groups: { ...groups, [g]: e.target.checked } })
                              }}
                              onBlur={() => commit(p)}
                            />
                            {GROUP_LABELS[g]}
                          </label>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={fieldValue(p, 'active')}
                      onChange={(e) => {
                        setField(p, { active: e.target.checked })
                      }}
                      onBlur={() => commit(p)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {hasDraft && (
                      <button onClick={() => commit(p)} className="rounded bg-brand-500 px-2 py-0.5 text-xs text-white">
                        Salvează
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 300 && (
        <p className="mt-2 text-xs text-slate-400">Se afișează primele 300 din {filtered.length} produse — rafinează căutarea.</p>
      )}
    </div>
  )
}

function GroupsByCategoryTab({
  products,
  rules,
  onToggle,
}: {
  products: Product[]
  rules: CategoryGroupRules | null
  onToggle: (category: string, group: keyof ProductGroups, enabled: boolean) => Promise<void>
}) {
  const [pending, setPending] = useState<string | null>(null)

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const cat = p.category || 'Necategorizat'
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [products])

  if (categories.length === 0) {
    return <p className="text-sm text-slate-400">Niciun produs importat încă — categoriile apar aici după primul import.</p>
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">
        Bifează ce categorii din nomenclatorul tău aparțin fiecărui grup special. Aplicarea e imediată — se
        actualizează toate produsele din categoria respectivă, inclusiv cele deja importate — și rămâne activă
        pentru orice produs nou din acea categorie la viitoarele importuri.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-100 scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Categorie (nr. produse)
              </th>
              {(Object.keys(GROUP_LABELS) as (keyof ProductGroups)[]).map((g) => (
                <th key={g} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {GROUP_LABELS[g]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {categories.map(([category, count]) => (
              <tr key={category}>
                <td className="px-3 py-1.5 font-medium text-slate-800">
                  {category} <span className="font-normal text-slate-400">({count})</span>
                </td>
                {(Object.keys(GROUP_LABELS) as (keyof ProductGroups)[]).map((g) => {
                  const checked = rules?.[g]?.includes(category) ?? false
                  const cellKey = `${category}:${g}`
                  return (
                    <td key={g} className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending === cellKey}
                        onChange={async (e) => {
                          setPending(cellKey)
                          await onToggle(category, g, e.target.checked)
                          setPending(null)
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CashiersTab({
  cashiers,
  teams,
  onSave,
  onMerge,
  onAddTeam,
  onRenameTeam,
  onDeleteTeam,
}: {
  cashiers: Cashier[]
  teams: Team[]
  onSave: (c: Cashier) => Promise<void>
  onMerge: (source: string, target: string) => Promise<void>
  onAddTeam: (name: string) => Promise<void>
  onRenameTeam: (team: Team) => Promise<void>
  onDeleteTeam: (id: string) => Promise<void>
}) {
  const [mergeSource, setMergeSource] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams])
  const memberCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cashiers) {
      if (!c.teamId) continue
      m.set(c.teamId, (m.get(c.teamId) ?? 0) + 1)
    }
    return m
  }, [cashiers])

  return (
    <div>
      <div className="mb-4 rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-600">Echipe</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {teams.length === 0 && <span className="text-xs text-slate-400">Nicio echipă definită încă.</span>}
          {teams.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-700"
            >
              <input
                defaultValue={t.name}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== t.name) onRenameTeam({ ...t, name: e.target.value })
                }}
                className="w-auto min-w-0 max-w-[10rem] border-none bg-transparent p-0 text-xs font-medium text-brand-700 focus:outline-none focus:ring-0"
                style={{ width: `${Math.max(t.name.length, 4)}ch` }}
              />
              <span className="text-brand-400">· {memberCount.get(t.id) ?? 0}</span>
              <button
                onClick={() => onDeleteTeam(t.id)}
                title="Șterge echipa"
                className="ml-0.5 rounded-full px-1 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Nume echipă nouă (ex: Echipa 4)"
            className="rounded border border-slate-200 px-2 py-1 text-xs"
          />
          <button
            disabled={!newTeamName.trim()}
            onClick={async () => {
              await onAddTeam(newTeamName.trim())
              setNewTeamName('')
            }}
            className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            Adaugă echipă
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-lg bg-slate-50 p-3">
        <p className="mb-2 text-xs font-medium text-slate-600">
          Unește doi casieri (dacă apar sub denumiri diferite în exporturi) — toate tranzacțiile sursei vor fi mutate la destinație.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mergeSource} onChange={(e) => setMergeSource(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="">Casier sursă...</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-slate-400">→</span>
          <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm">
            <option value="">Casier destinație...</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget}
            onClick={async () => {
              await onMerge(mergeSource, mergeTarget)
              setMergeSource('')
              setMergeTarget('')
            }}
            className="rounded bg-brand-500 px-3 py-1 text-sm text-white disabled:opacity-40"
          >
            Unește
          </button>
        </div>
      </div>

      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Nume canonic</th>
            <th className="px-2 py-1.5">Denumiri văzute în import</th>
            <th className="px-2 py-1.5">Echipă</th>
            <th className="px-2 py-1.5 text-center">Activ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {cashiers
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={c.name}
                    onBlur={(e) => {
                      if (e.target.value !== c.name) onSave({ ...c, name: e.target.value })
                    }}
                    className="rounded border border-slate-200 px-2 py-0.5"
                  />
                </td>
                <td className="px-2 py-1.5 text-slate-500">{c.aliases.join(', ')}</td>
                <td className="px-2 py-1.5">
                  <select
                    value={c.teamId ?? ''}
                    onChange={(e) => onSave({ ...c, teamId: e.target.value || null })}
                    className="rounded border border-slate-200 px-2 py-0.5"
                  >
                    <option value="">Fără echipă</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {c.teamId && !teamsById.has(c.teamId) && (
                    <span className="ml-1 text-[10px] text-warn">echipă ștearsă</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={c.active} onChange={(e) => onSave({ ...c, active: e.target.checked })} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
