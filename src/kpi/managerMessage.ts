import type { TeamSituatieSummary } from '@/data/pontaj'
import type { CashierCrossSellRow } from '@/kpi/crossSell'
import { formatLei, formatPct } from '@/lib/format'

// Which cross-sell categories a team should be told to push, this month —
// only categories where the team is the CLEAR lowest among all teams (never
// tied for last, so a 2-team station doesn't flag everything), ranked by
// how far below the peer average they are. Capped at 2 so the message stays
// focused instead of listing every category.
interface CategoryDef {
  label: string
  rate: (r: CashierCrossSellRow) => number
}
const CATEGORY_DEFS: CategoryDef[] = [
  { label: 'cafea', rate: (r) => r.coffee.per100Receipts },
  { label: 'sandwich-uri', rate: (r) => r.sandwich.per100Receipts },
  { label: 'dulciuri vitrină', rate: (r) => r.vitrina.per100Receipts },
  { label: 'promoții', rate: (r) => r.promo.per100Receipts },
]

export function computeFocusCategories(teamRow: CashierCrossSellRow, allTeamRows: CashierCrossSellRow[]): string[] {
  const others = allTeamRows.filter((r) => r !== teamRow)
  if (others.length === 0) return []

  const candidates: { label: string; gapPct: number }[] = []
  for (const def of CATEGORY_DEFS) {
    const value = def.rate(teamRow)
    const isClearLowest = others.every((r) => def.rate(r) >= value) && others.some((r) => def.rate(r) > value)
    if (!isClearLowest) continue
    const peerAvg = others.reduce((s, r) => s + def.rate(r), 0) / others.length
    candidates.push({ label: def.label, gapPct: peerAvg > 0 ? ((peerAvg - value) / peerAvg) * 100 : 0 })
  }
  return candidates
    .sort((a, b) => b.gapPct - a.gapPct)
    .slice(0, 2)
    .map((c) => c.label)
}

// WhatsApp-ready text — plain lines, no markdown (WhatsApp doesn't render
// it), short enough to read on a phone. Every figure comes straight from
// TeamSituatieSummary (itself read from the Target page's own computed
// situatie/bonus — see src/data/pontaj.ts), so this message can never show
// a different "realizat" than the Target page does.
export function buildManagerMessage(
  team: TeamSituatieSummary,
  monthLabel: string,
  focusCategories: string[],
  scheduleNote: string,
): string {
  const lines: string[] = []
  lines.push(`📊 ${team.label} — ${monthLabel}`)
  lines.push('')
  lines.push(
    `Realizat: ${formatLei(team.realizat ?? 0)} din ${formatLei(team.targetLunar ?? 0)} target` +
      (team.procent != null ? ` (${formatPct(team.procent * 100)})` : ''),
  )
  if (team.targetPana != null) lines.push(`Target până azi: ${formatLei(team.targetPana)}`)
  if (team.diferenta != null) {
    const sign = team.diferenta >= 0 ? '+' : ''
    lines.push(`Diferență față de target-până-azi: ${sign}${formatLei(team.diferenta)}`)
  }
  if (team.bonusEchipa != null) {
    lines.push('')
    lines.push(
      `🎯 Bonus estimat: ${formatLei(team.bonusEchipa)}/echipă` +
        (team.bonusOm != null ? ` (${formatLei(team.bonusOm)}/persoană)` : ''),
    )
  }
  if (focusCategories.length > 0) {
    lines.push('')
    lines.push(`📌 De insistat: ${focusCategories.join(', ')}`)
  }
  if (scheduleNote.trim()) {
    lines.push('')
    lines.push(`📅 ${scheduleNote.trim()}`)
  }
  return lines.join('\n')
}
