import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { computeClientProfile } from '../analytics/clientProfile'
import type { ClientProfile } from '../analytics/clientProfile'
import { FilterBar } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatDate, formatNumber, formatPercent, formatQuantity } from '../lib/ro-format'

const MONTH_SHORT = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

/** Client 360° (spec §17): profil complet al unui client, în contextul filtrelor globale. */
export function ClientProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clientId = Number(id)
  const { filters, patchFilters, clients, products, categories } = useReportData()
  const [profile, setProfile] = useState<ClientProfile | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    computeClientProfile(clientId, filters).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, filtersKey])

  if (Number.isNaN(clientId)) {
    return <div className="text-sm text-rose-600">Client invalid.</div>
  }

  return (
    <div>
      <button className="text-xs text-slate-500 hover:underline mb-2" onClick={() => navigate('/clienti')}>
        ← înapoi la Analiză clienți
      </button>
      <h1 className="text-xl font-semibold mb-1">{profile === undefined ? 'Se încarcă…' : profile === null ? 'Client negăsit' : profile.canonicalName}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Profil complet client — spec §17.</p>

      <FilterBar filters={filters} patchFilters={patchFilters} clients={clients} products={products} categories={categories} hide={{ client: true }} />

      {profile === undefined ? (
        <div className="text-sm text-slate-500">Se calculează…</div>
      ) : profile === null ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Clientul nu a fost găsit (poate a fost șters sau unit cu altul).
        </div>
      ) : (
        <ClientProfileView profile={profile} />
      )}
    </div>
  )
}

function ClientProfileView({ profile: p }: { profile: ClientProfile }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Vânzări totale" value={formatCurrency(p.totalValue)} growth={p.yoyGrowthPercent} />
        <KpiCard label="Cantitate" value={formatQuantity(p.totalQuantity)} />
        <KpiCard label={p.orderCountIsDocumentBased ? 'Nr. comenzi' : 'Nr. tranzacții'} value={formatNumber(p.orderCount)} />
        <KpiCard label="Valoare medie comandă" value={formatCurrency(p.avgOrderValue)} />
        <KpiCard label="Nr. produse cumpărate" value={formatNumber(p.distinctProducts)} />
        <KpiCard label="Preț mediu plătit" value={p.avgPricePerUnit !== null ? formatCurrency(p.avgPricePerUnit) : '—'} />
        <KpiCard label="Prima achiziție" value={formatDate(p.firstPurchaseDate)} />
        <KpiCard label="Ultima achiziție" value={formatDate(p.lastPurchaseDate)} />
        <KpiCard label="Frecvență medie" value={p.avgFrequencyDays !== null ? `${p.avgFrequencyDays.toFixed(0)} zile` : '—'} />
      </div>

      {p.monthlyEvolution.length > 1 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <div className="text-sm font-medium mb-3">Evoluție lunară</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={p.monthlyEvolution.map((m) => ({ label: `${MONTH_SHORT[m.month - 1]} ${m.year}`, value: m.value }))}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(v)} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Line type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SimpleTable title="Top produse" rows={p.topProducts.map((r) => ({ name: r.name, value: r.value }))} />
        <SimpleTable title="Mix categorii" rows={p.topCategories.map((r) => ({ name: r.name, value: r.value }))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <NameListCard title="Produse noi (nu erau în perioada de comparație)" names={p.productsNew} tone="positive" />
        <NameListCard title="Produse pierdute (cumpărate în comparație, nu și acum)" names={p.productsLost} tone="negative" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendListCard title="Categorii în creștere" rows={p.categoriesGrowing} />
        <TrendListCard title="Categorii în scădere" rows={p.categoriesDeclining} />
      </div>
    </>
  )
}

function SimpleTable({ title, rows }: { title: string; rows: { name: string; value: number }[] }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-slate-100 dark:border-slate-800 first:border-0">
                <td className="py-1">{r.name}</td>
                <td className="py-1 text-right whitespace-nowrap">{formatCurrency(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function NameListCard({ title, names, tone }: { title: string; names: string[]; tone: 'positive' | 'negative' }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      {names.length === 0 ? (
        <div className="text-sm text-slate-400">Niciunul.</div>
      ) : (
        <ul className="text-sm space-y-1">
          {names.slice(0, 20).map((n) => (
            <li key={n} className={tone === 'positive' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TrendListCard({ title, rows }: { title: string; rows: { name: string; diffPercent: number | null }[] }) {
  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
      <div className="text-sm font-medium mb-2">{title}</div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">—</div>
      ) : (
        <ul className="text-sm space-y-1">
          {rows.map((r) => (
            <li key={r.name} className="flex justify-between">
              <span>{r.name}</span>
              <span>{formatPercent(r.diffPercent)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
