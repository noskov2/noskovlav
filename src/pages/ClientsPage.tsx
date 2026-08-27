import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { useDataStore } from '@/store/dataStore'
import { computeClientSummaries, type ClientSummary } from '@/kpi/clientInvoices'
import { monthLabel } from '@/kpi/dateRanges'
import { formatDateRo, formatLei, formatNumber } from '@/lib/format'
import type { ClientInvoiceLine } from '@/types/domain'

export function ClientsPage() {
  const { clients, clientInvoices } = useDataStore()
  const [month, setMonth] = useState<string>('all')
  const [selected, setSelected] = useState<ClientSummary | null>(null)

  const monthOptions = useMemo(() => {
    const keys = new Set(clientInvoices.map((i) => i.date.slice(0, 7)))
    return Array.from(keys).sort().reverse()
  }, [clientInvoices])

  const monthFilteredInvoices = useMemo(
    () => (month === 'all' ? clientInvoices : clientInvoices.filter((i) => i.date.slice(0, 7) === month)),
    [clientInvoices, month],
  )

  const summaries = useMemo(
    () => computeClientSummaries(clients, monthFilteredInvoices),
    [clients, monthFilteredInvoices],
  )

  const creditInvoices = useMemo(
    () => [...monthFilteredInvoices.filter((i) => i.onCredit)].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [monthFilteredInvoices],
  )
  const creditTotal = useMemo(() => creditInvoices.reduce((s, i) => s + i.value, 0), [creditInvoices])
  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients])

  const totalValue = useMemo(() => monthFilteredInvoices.reduce((s, i) => s + i.value, 0), [monthFilteredInvoices])

  if (clientInvoices.length === 0) {
    return (
      <div>
        <PageHeader title="Clienți" description="Facturi emise către clienți (vânzări pe credit / cu factură, nu la pompă)." />
        <EmptyState
          icon="🧾"
          title="Nicio factură emisă încărcată încă"
          description="Mergi la Import date → Facturi clienți pentru a încărca exportul de facturi emise (nr. factură, dată, client, valoare)."
          actionTo="/import?kind=invoices"
        />
      </div>
    )
  }

  const columns: DataTableColumn<ClientSummary>[] = [
    {
      key: 'name',
      header: 'Client',
      render: (s) => (
        <button className="text-left text-brand-700 hover:underline" onClick={() => setSelected(s)}>
          {s.client.name}
        </button>
      ),
      sortValue: (s) => s.client.name,
    },
    { key: 'locality', header: 'Localitate', render: (s) => s.client.locality ?? '—', sortValue: (s) => s.client.locality ?? '' },
    { key: 'county', header: 'Județ', render: (s) => s.client.county ?? '—', sortValue: (s) => s.client.county ?? '' },
    { key: 'invoiceCount', header: 'Nr. facturi', align: 'right', render: (s) => formatNumber(s.invoiceCount), sortValue: (s) => s.invoiceCount },
    { key: 'totalValue', header: 'Total facturat', align: 'right', render: (s) => formatLei(s.totalValue), sortValue: (s) => s.totalValue },
    {
      key: 'credit',
      header: 'Pe credit',
      align: 'right',
      render: (s) =>
        s.creditCount > 0 ? (
          <span className="font-medium text-warn">
            {formatNumber(s.creditCount)} / {formatLei(s.creditValue)}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      sortValue: (s) => s.creditValue,
    },
    {
      key: 'last',
      header: 'Ultima factură',
      render: (s) => (s.lastInvoiceDate ? formatDateRo(s.lastInvoiceDate) : '—'),
      sortValue: (s) => s.lastInvoiceDate ?? '',
    },
  ]

  return (
    <div>
      <PageHeader title="Clienți" description="Facturi emise către clienți (vânzări pe credit / cu factură, nu la pompă)." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
        >
          <option value="all">Toate lunile</option>
          {monthOptions.map((key) => (
            <option key={key} value={key}>
              {monthLabel(`${key}-01`)}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">
          {formatNumber(summaries.length)} clienți · {formatNumber(monthFilteredInvoices.length)} facturi · {formatLei(totalValue)} total
        </span>
      </div>

      <div className="mb-5 rounded-xl border border-warn/30 bg-warn/5 p-4 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Facturi pe credit local (neîncasate imediat)</h3>
          <span className="text-sm font-semibold text-warn">
            {formatNumber(creditInvoices.length)} facturi · {formatLei(creditTotal)}
          </span>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Facturi marcate „Pentru Credit Local" — au fost emise dar nu s-au încasat pe loc, deci reprezintă bani de
          urmărit/recuperat de la clienți.
        </p>
        {creditInvoices.length === 0 ? (
          <p className="text-sm text-slate-400">Nicio factură pe credit în perioada selectată.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100 bg-white scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1.5">Dată</th>
                  <th className="px-2 py-1.5">Nr. Factură</th>
                  <th className="px-2 py-1.5">Client</th>
                  <th className="px-2 py-1.5 text-right">Valoare</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {creditInvoices.map((i) => (
                  <tr key={i.id}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{formatDateRo(i.date)}</td>
                    <td className="px-2 py-1.5">{i.invoiceNo}</td>
                    <td className="px-2 py-1.5">{clientNameById.get(i.clientId) ?? i.clientRaw}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{formatLei(i.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable
          columns={columns}
          rows={summaries}
          rowKey={(s) => s.client.id}
          searchable
          searchPredicate={(s, q) => s.client.name.toLowerCase().includes(q)}
          defaultSortKey="totalValue"
          pageSize={25}
        />
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.client.name ?? ''} subtitle="Istoric facturi" wide>
        {selected && <ClientInvoiceDetail summary={selected} invoices={monthFilteredInvoices.filter((i) => i.clientId === selected.client.id)} />}
      </Modal>
    </div>
  )
}

function ClientInvoiceDetail({ summary, invoices }: { summary: ClientSummary; invoices: ClientInvoiceLine[] }) {
  const sorted = [...invoices].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const { client } = summary
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Nr. facturi" value={formatNumber(summary.invoiceCount)} />
        <Stat label="Total facturat" value={formatLei(summary.totalValue)} />
        <Stat label="Facturi pe credit" value={formatNumber(summary.creditCount)} />
        <Stat label="Valoare pe credit" value={formatLei(summary.creditValue)} />
      </div>

      <div className="mb-4 text-sm text-slate-600">
        {client.fiscalCode && <p>Cod fiscal: {client.fiscalCode}</p>}
        {client.regCom && <p>Reg. Com.: {client.regCom}</p>}
        {(client.address || client.locality || client.county) && (
          <p>Adresă: {[client.address, client.locality, client.county].filter(Boolean).join(', ')}</p>
        )}
        {client.aliases.length > 1 && (
          <p className="mt-1 text-xs text-slate-400">Apare și ca: {client.aliases.filter((a) => a !== client.name).join(', ')}</p>
        )}
      </div>

      <h4 className="mb-2 text-sm font-semibold text-slate-700">Istoric facturi</h4>
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-2 py-1.5">Dată</th>
            <th className="px-2 py-1.5">Nr. Factură</th>
            <th className="px-2 py-1.5 text-right">Valoare</th>
            <th className="px-2 py-1.5">Pe credit</th>
            <th className="px-2 py-1.5">Șofer / Vehicul</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {sorted.map((i) => (
            <tr key={i.id}>
              <td className="px-2 py-1.5">{formatDateRo(i.date)}</td>
              <td className="px-2 py-1.5">{i.invoiceNo}</td>
              <td className="px-2 py-1.5 text-right">{formatLei(i.value)}</td>
              <td className="px-2 py-1.5">
                {i.onCredit ? <span className="font-medium text-warn">Da</span> : <span className="text-slate-400">Nu</span>}
              </td>
              <td className="px-2 py-1.5 text-slate-500">{[i.driver, i.vehicle].filter(Boolean).join(' / ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-slate-800">{value}</p>
    </div>
  )
}
