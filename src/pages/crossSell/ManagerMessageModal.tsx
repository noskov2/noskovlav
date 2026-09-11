import { useState } from 'react'
import type { Product, TransactionLine } from '@/types/domain'
import { Modal } from '@/components/ui/Modal'
import { loadLatestMonthTeamSummary, loadTeamNames, monthKeyToYearMonth } from '@/data/pontaj'
import { computePontajTeamReport, PONTAJ_ROW_PREFIX } from '@/kpi/pontajTeamReport'
import { computeFocusCategories, buildManagerMessage } from '@/kpi/managerMessage'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function ManagerMessageModal({
  open,
  onClose,
  transactions,
  products,
}: {
  open: boolean
  onClose: () => void
  transactions: TransactionLine[]
  products: Product[]
}) {
  // Deliberately independent of the page's own FilterBar (period/team/
  // cashier filters) — this message is always about the WHOLE current
  // month for the WHOLE team, matching exactly what the Target page shows,
  // regardless of what the owner happens to be filtered to on this page.
  // No memoization anywhere in this chain: summary is a fresh read every
  // render by design (so the modal never shows stale Target-page figures
  // after editing them elsewhere), and everything downstream is cheap
  // enough — a month's worth of transactions filtered and rolled up per
  // team — to just recompute whenever this on-demand modal re-renders
  // (typing in the schedule note, switching the selected team).
  const summary = open ? loadLatestMonthTeamSummary(loadTeamNames()) : null
  const monthTx = (() => {
    if (!summary) return []
    const ym = monthKeyToYearMonth(summary.monthKey)
    if (!ym) return []
    const start = `${ym.year}-${pad2(ym.month)}-01`
    const end = `${ym.year}-${pad2(ym.month)}-${pad2(new Date(ym.year, ym.month, 0).getDate())}`
    return transactions.filter((t) => t.date >= start && t.date <= end)
  })()
  const pontajReport = computePontajTeamReport(monthTx, products)

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [scheduleNote, setScheduleNote] = useState('')
  const [copied, setCopied] = useState(false)

  const selectedTeam = summary?.teams.find((t) => t.key === selectedKey) ?? summary?.teams[0] ?? null

  // Not memoized — summary is a fresh object every render by design (see
  // above), so memoizing this would recompute every time anyway; the work
  // itself (a handful of string comparisons and template lines) is trivial.
  let message = ''
  if (summary && selectedTeam) {
    const teamRow = pontajReport.teams.find((r) => r.cashier.id === `${PONTAJ_ROW_PREFIX}${selectedTeam.key}`)
    const focusCategories = teamRow ? computeFocusCategories(teamRow, pontajReport.teams) : []
    message = buildManagerMessage(selectedTeam, summary.monthLabel, focusCategories, scheduleNote)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — user can still select-all from the textarea */
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Mesaj gestionari" subtitle="Gata de copiat pe WhatsApp, un mesaj per echipă.">
      {!summary || summary.teams.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nu există nicio lună cu situație pe echipă salvată pe pagina Target — deschide pagina Target și încarcă
          (sau creează) luna curentă înainte de a genera mesajul.
        </p>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {summary.teams.map((t) => (
              <button
                key={t.key}
                onClick={() => setSelectedKey(t.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  (selectedTeam?.key ?? summary.teams[0].key) === t.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className="mb-3 block text-sm text-slate-600">
            Modificări de program (opțional — apar în mesaj dacă completezi)
            <input
              type="text"
              value={scheduleNote}
              onChange={(e) => setScheduleNote(e.target.value)}
              placeholder="ex: Vineri Echipa 2 schimbă cu Echipa 1"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
          </label>
          <textarea
            readOnly
            value={message}
            rows={11}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-800"
          />
          <button
            onClick={handleCopy}
            className="mt-3 rounded-lg bg-brand-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-600"
          >
            {copied ? 'Copiat ✓' : 'Copiază mesajul'}
          </button>
        </div>
      )}
    </Modal>
  )
}
