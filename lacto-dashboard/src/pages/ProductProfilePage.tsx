import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { computeProductProfile } from '../analytics/productProfile'
import type { ProductProfile } from '../analytics/productProfile'
import { FilterBar } from '../components/FilterBar'
import { KpiCard } from '../components/KpiCard'
import { useReportData } from '../hooks/useReportData'
import { formatCurrency, formatNumber, formatQuantity } from '../lib/ro-format'

const MONTH_SHORT = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Noi', 'Dec']

/** Produs 360° (spec §18): profil complet al unui produs, în contextul filtrelor globale. */
export function ProductProfilePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const productId = Number(id)
  const { filters, patchFilters, clients, products, categories } = useReportData()
  const [profile, setProfile] = useState<ProductProfile | null | undefined>(undefined)

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    computeProductProfile(productId, filters).then((p) => {
      if (!cancelled) setProfile(p)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, filtersKey])

  if (Number.isNaN(productId)) {
    return <div className="text-sm text-rose-600">Produs invalid.</div>
  }

  return (
    <div>
      <button className="text-xs text-slate-500 hover:underline mb-2" onClick={() => navigate('/produse')}>
        ← înapoi la Analiză produse
      </button>
      <h1 className="text-xl font-semibold mb-1">{profile === undefined ? 'Se încarcă…' : profile === null ? 'Produs negăsit' : profile.canonicalName}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Profil complet produs — spec §18.</p>

      <FilterBar filters={filters} patchFilters={patchFilters} clients={clients} products={products} categories={categories} hide={{ product: true }} />

      {profile === undefined ? (
        <div className="text-sm text-slate-500">Se calculează…</div>
      ) : profile === null ? (
        <div className="text-sm text-slate-500 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center">
          Produsul nu a fost găsit (poate a fost șters).
        </div>
      ) : (
        <ProductProfileView profile={profile} />
      )}
    </div>
  )
}

function ProductProfileView({ profile: p }: { profile: ProductProfile }) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Vânzări totale" value={formatCurrency(p.totalValue)} />
        <KpiCard label="Cantitate totală" value={formatQuantity(p.totalQuantity)} />
        <KpiCard label="Clienți activi" value={formatNumber(p.distinctClients)} />
        <KpiCard label="Preț mediu" value={p.avgPricePerUnit !== null ? formatCurrency(p.avgPricePerUnit) : '—'} />
        <KpiCard label="Pondere în total companie" value={p.shareOfCompanyTotal !== null ? `${p.shareOfCompanyTotal.toFixed(2)}%` : '—'} />
        <KpiCard label="Preț minim" value={p.minPrice !== null ? formatCurrency(p.minPrice) : '—'} />
        <KpiCard label="Preț median" value={p.medianPrice !== null ? formatCurrency(p.medianPrice) : '—'} />
        <KpiCard label="Preț maxim" value={p.maxPrice !== null ? formatCurrency(p.maxPrice) : '—'} />
      </div>

      {p.monthlyEvolution.length > 1 && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
          <div className="text-sm font-medium mb-3">Evoluție lunară (sezonalitate)</div>
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
        <SimpleTable title="Top clienți" rows={p.topClients.map((r) => ({ name: r.name, value: r.value }))} />
        <SimpleTable title="Top canale" rows={p.topChannels.map((r) => ({ name: r.name, value: r.value }))} />
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4">
        <div className="text-sm font-medium mb-2">Clienți care au încetat să mai cumpere acest produs</div>
        {p.clientsLost.length === 0 ? (
          <div className="text-sm text-slate-400">Niciunul.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {p.clientsLost.slice(0, 20).map((n) => (
              <li key={n} className="text-rose-700 dark:text-rose-400">
                {n}
              </li>
            ))}
          </ul>
        )}
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
