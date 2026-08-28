// Reads the day-by-day team rotation ("pontaj") configured on the Target
// page — the station's own pre-set roster of which team works tură 1 /
// tură 2 each day, imported from the station's "Target Vânzări" Excel file
// (see TargetsPage.tsx, which owns writing this data).
//
// Sales attribution "by team" elsewhere in the app (Cross-sell & Casieri's
// Pe echipă view, Dashboard's Clasament echipe) must follow THIS schedule,
// not which cashier happened to be logged into the register — cashiers
// swap shifts informally among themselves, so the register login can
// differ from who was actually rostered for that shift. The pontaj is the
// schedule of record; per the station owner, it's authoritative even when
// it disagrees with who rang up the sale.
//
// TargetsPage.tsx is the sole writer of these two localStorage keys — this
// module is read-only, so the two never drift on the constants/helpers
// they share (TargetsPage imports teamShortLabel/teamKeyOf/resolveTeamName
// from here instead of keeping its own copies).

export const STORE_KEY = 'salesDashboard:months'
export const TEAM_NAMES_KEY = 'salesDashboard:teamNames'

export const PONTAJ_ROW_PREFIX = 'pontaj:'

const RO_MONTH_ABBR: Record<string, number> = {
  ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6,
  iul: 7, aug: 8, sep: 9, oct: 10, noi: 11, dec: 12,
}

interface PontajDay {
  zi: number
  echipaTura1: unknown
  echipaTura2: unknown
}
interface PontajMonthData {
  zilnic: { days: PontajDay[] } | null
}

// First "Echipa N" match in a cell's text (which may also carry team-member
// names on following lines) — the canonical short label for a team.
export function teamShortLabel(name: unknown): string {
  const m = String(name || '').match(/echipa\s*\d+/i)
  return m ? m[0] : String(name || '')
}

// Canonical lookup key for a raw "Echipa N" cell value, independent of the
// exact spacing/casing the source file happens to use.
export function teamKeyOf(raw: unknown): string {
  return teamShortLabel(raw).toLowerCase().replace(/\s+/g, ' ').trim()
}

// Real gestionar names the owner types in on the Target page (e.g. "Razvan +
// Rodica") in place of the raw "Echipa N" label, if configured.
export function resolveTeamName(raw: unknown, teamNames: Record<string, string>): string {
  const key = teamKeyOf(raw)
  if (key && teamNames[key]) return teamNames[key]
  const first = String(raw || '').split('\n')[0].replace(/\r/g, '').trim()
  return first || String(raw || '')
}

// Fallback label when a team key has no configured name yet — "echipa 1" -> "Echipa 1".
export function defaultTeamLabel(key: string): string {
  return key.replace(/^\w/, (c) => c.toUpperCase())
}

export function loadTeamNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TEAM_NAMES_KEY) || '{}')
  } catch {
    return {}
  }
}

function loadPontajStore(): Record<string, PontajMonthData> {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

function monthKeyToYearMonth(monthKey: string): { year: number; month: number } | null {
  const m = monthKey.trim().match(/^([A-ZĂÂÎȘȚ]{3})\s+(\d{4})$/i)
  if (!m) return null
  const mon = RO_MONTH_ABBR[m[1].toLowerCase()]
  if (!mon) return null
  return { year: Number(m[2]), month: mon }
}

export interface DayRotation {
  tura1: string | null // team key (e.g. "echipa 1"), via teamKeyOf
  tura2: string | null
}

// date (YYYY-MM-DD) -> which team is scheduled for each shift, built from
// every month stored on the Target page — a filtered period on another
// page can span more than one imported month. Uses each day's "Zi"
// (day-of-month) number combined with the month/year parsed from the
// stored month key, rather than the raw "Dată" cell value, since that cell
// can come through as a JS Date (locale-dependent once stringified) or as
// plain text depending on how the source Excel formatted it — "Zi" + the
// month key is unambiguous either way.
export function buildPontajIndex(): Map<string, DayRotation> {
  const store = loadPontajStore()
  const index = new Map<string, DayRotation>()
  for (const [monthKey, data] of Object.entries(store)) {
    const ym = monthKeyToYearMonth(monthKey)
    if (!ym || !data.zilnic) continue
    for (const d of data.zilnic.days) {
      if (!d.zi) continue
      const iso = `${ym.year}-${String(ym.month).padStart(2, '0')}-${String(d.zi).padStart(2, '0')}`
      const tura1Raw = String(d.echipaTura1 || '').split('\n')[0].trim()
      const tura2Raw = String(d.echipaTura2 || '').split('\n')[0].trim()
      index.set(iso, {
        tura1: tura1Raw ? teamKeyOf(tura1Raw) : null,
        tura2: tura2Raw ? teamKeyOf(tura2Raw) : null,
      })
    }
  }
  return index
}

export function hasPontajData(): boolean {
  return Object.keys(loadPontajStore()).length > 0
}

export function scheduledTeamFor(index: Map<string, DayRotation>, date: string, shift: 1 | 2 | null): string | null {
  if (!shift) return null
  const day = index.get(date)
  if (!day) return null
  return shift === 1 ? day.tura1 : day.tura2
}
