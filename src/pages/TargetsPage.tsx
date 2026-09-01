import { useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { getSettings, updateSettings } from '@/data/repo/settings'
import { emptyMonthTargets } from '@/types/domain'
import {
  STORE_KEY,
  TEAM_NAMES_KEY,
  teamKeyOf,
  teamShortLabel,
  resolveTeamName,
  loadTeamNames,
} from '@/data/pontaj'

// This page is a close, self-contained port of the station's own "Target
// Vânzări" tool (a separate Excel-template-driven tracker for team shift
// rotations, daily targets, and bonus tiers) — kept 1:1 with that tool's
// behavior, including its own localStorage persistence, on explicit
// request. Everything still runs 100% locally in the browser; the only
// adaptation from the original standalone file is loading the `xlsx`
// library from the app's own bundle instead of a CDN script tag, since a
// portable single-file build can't reach the internet.
//
// Bridge: this tool's "Target lunar total" (the station-wide monthly RON
// target) is also written into the app's own AppSettings.monthlyTargets,
// so the rest of the app (Dashboard's Forecast/Pace panel, Executive
// Report, Închidere lună) keeps working off a real number instead of
// going blank. Only that one field is touched — nothing else here talks
// to the app's Dexie data.

const STYLE = `
.target-tool {
  color-scheme: light;
  --page:            #f9f9f7;
  --surface-1:       #fcfcfb;
  --surface-2:       #f2f1ed;
  --text-primary:    #0b0b0b;
  --text-secondary:  #52514e;
  --text-muted:      #898781;
  --gridline:        #e1e0d9;
  --baseline:        #c3c2b7;
  --border:          rgba(11,11,11,0.10);
  --series-1:        #2a78d6;
  --series-2:        #eb6834;
  --series-3:        #1baf7a;
  --good:            #0ca30c;
  --warning:         #fab219;
  --critical:        #d03b3b;
  --good-bg:         rgba(12,163,12,0.12);
  --warning-bg:      rgba(250,178,25,0.16);
  --critical-bg:     rgba(208,59,59,0.10);
  min-height: 100vh;
  background: var(--page); color: var(--text-primary);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
.target-tool * { box-sizing: border-box; }
.target-tool .page { max-width: 1080px; margin: 0 auto; padding: 16px 16px 64px; }
.target-tool header.top {
  position: sticky; top: 0; z-index: 20; background: var(--page);
  padding: 14px 16px; margin: -16px -16px 16px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.target-tool .brand { display: flex; align-items: baseline; gap: 8px; }
.target-tool .brand h1 { font-size: 17px; margin: 0; font-weight: 700; }
.target-tool .brand .updated { font-size: 12px; color: var(--text-muted); }
.target-tool .top-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.target-tool select, .target-tool button, .target-tool .btn {
  font: inherit; font-size: 13px; color: var(--text-primary);
  background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; cursor: pointer;
}
.target-tool button:hover, .target-tool .btn:hover { background: var(--surface-2); }
.target-tool .btn-primary { background: var(--series-1); color: #fff; border-color: transparent; }
.target-tool .btn-primary:hover { filter: brightness(1.08); background: var(--series-1); }
.target-tool button.danger { color: var(--critical); }
.target-tool #fileInput { display: none; }
.target-tool #emptyState {
  margin-top: 40px; padding: 48px 24px; text-align: center;
  border: 1.5px dashed var(--baseline); border-radius: 16px; background: var(--surface-1);
}
.target-tool #emptyState.dragover { border-color: var(--series-1); background: var(--surface-2); }
.target-tool #emptyState .icon { font-size: 40px; margin-bottom: 8px; }
.target-tool #emptyState h2 { font-size: 17px; margin: 4px 0 6px; }
.target-tool #emptyState p { color: var(--text-secondary); font-size: 14px; max-width: 460px; margin: 0 auto 18px; line-height: 1.5; }
.target-tool #errorBox {
  display: none; margin-top: 16px; padding: 12px 14px; border-radius: 10px;
  background: var(--critical-bg); color: var(--text-primary); font-size: 13px; border: 1px solid var(--border);
}
.target-tool #warnBox {
  display: none; margin-top: 12px; padding: 10px 14px; border-radius: 10px;
  background: var(--warning-bg); color: var(--text-primary); font-size: 12.5px; border: 1px solid var(--border);
}
.target-tool main#dashboard { display: none; flex-direction: column; gap: 20px; }
.target-tool main#dashboard.visible { display: flex; }
.target-tool .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.target-tool .card h3 { margin: 0 0 14px; font-size: 14px; color: var(--text-secondary); font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.target-tool .hero-title { font-size: 18px; font-weight: 700; margin: 0 0 2px; }
.target-tool .hero-sub { font-size: 13px; color: var(--text-secondary); margin: 0 0 16px; }
.target-tool .stat-row { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 16px; margin-bottom: 16px; }
.target-tool .stat-tile .label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.target-tool .stat-tile .value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.target-tool .stat-tile .value.delta-good { color: var(--good); }
.target-tool .stat-tile .value.delta-bad { color: var(--critical); }
.target-tool .bar { height: 10px; border-radius: 5px; background: var(--surface-2); overflow: hidden; position: relative; }
.target-tool .bar .fill { height: 100%; border-radius: 5px; background: var(--series-1); transition: width .3s ease; }
.target-tool .bar.small { height: 7px; border-radius: 4px; }
.target-tool .bar.small .fill { border-radius: 4px; }
.target-tool .today-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 14px; align-items: center; }
.target-tool .today-date { font-size: 20px; font-weight: 700; }
.target-tool .today-sub { font-size: 12px; color: var(--text-muted); }
.target-tool .shift-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; padding: 4px 0; }
.target-tool .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.target-tool .status-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.target-tool .status-good { background: var(--good-bg); color: var(--good); }
.target-tool .status-warning { background: var(--warning-bg); color: #8a6100; }
.target-tool .status-critical { background: var(--critical-bg); color: var(--critical); }
.target-tool .status-pending { background: var(--surface-2); color: var(--text-muted); }
.target-tool .team-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(230px,1fr)); gap: 14px; }
.target-tool .team-card { border: 1px solid var(--border); border-radius: 12px; padding: 14px; background: var(--surface-1); border-top: 3px solid var(--accent); }
.target-tool .team-card .name { font-weight: 700; font-size: 14px; margin-bottom: 1px; }
.target-tool .team-card .members { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.target-tool .team-card .pct { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; margin: 8px 0 4px; }
.target-tool .team-card .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 12px; margin-top: 10px; }
.target-tool .team-card .stats div span { display: block; color: var(--text-muted); font-size: 11px; }
.target-tool .team-card .stats div b { font-variant-numeric: tabular-nums; }
.target-tool .ture-row { display: flex; gap: 10px; margin-top: 10px; font-size: 11.5px; color: var(--text-secondary); }
.target-tool .bonus-layout { display: grid; grid-template-columns: 1.1fr 1.4fr; gap: 20px; }
@media (max-width: 700px) { .target-tool .bonus-layout { grid-template-columns: 1fr; } }
.target-tool .grila-row { display: flex; justify-content: space-between; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--gridline); font-size: 13px; }
.target-tool .grila-row:last-child { border-bottom: none; }
.target-tool .grila-row .niv { font-weight: 600; }
.target-tool .grila-row .amt { color: var(--text-secondary); font-size: 12px; text-align: right; }
.target-tool table { width: 100%; border-collapse: collapse; font-size: 13px; }
.target-tool th, .target-tool td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--gridline); white-space: nowrap; }
.target-tool th { color: var(--text-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .02em; }
.target-tool td.num, .target-tool th.num { text-align: right; font-variant-numeric: tabular-nums; }
.target-tool tr.total-row td { font-weight: 700; border-top: 2px solid var(--baseline); border-bottom: none; }
.target-tool .table-scroll { overflow-x: auto; }
.target-tool tr.pending td { color: var(--text-muted); }
.target-tool .daily-table tr.today-row td { background: color-mix(in srgb, var(--series-1) 12%, transparent); }
.target-tool details.card summary { cursor: pointer; font-size: 12.5px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: .02em; list-style: none; }
.target-tool details.card summary::-webkit-details-marker { display: none; }
.target-tool details.card summary::before { content: "▸ "; }
.target-tool details.card[open] summary::before { content: "▾ "; }
.target-tool details.card .table-scroll { margin-top: 14px; }
.target-tool .chart-legend { display: flex; gap: 16px; font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; }
.target-tool .chart-legend .item { display: flex; align-items: center; gap: 6px; }
.target-tool .legend-line { width: 16px; height: 2px; background: var(--series-1); display: inline-block; }
.target-tool .legend-line.dashed { background: none; border-top: 2px dashed var(--baseline); }
.target-tool svg.chart { width: 100%; height: auto; display: block; overflow: visible; }
.target-tool .chart-tooltip { position: absolute; pointer-events: none; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12px; white-space: nowrap; display: none; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
.target-tool .chart-wrap { position: relative; }
.target-tool footer.note { text-align: center; font-size: 11.5px; color: var(--text-muted); margin-top: 8px; }
.target-tool .edit-day-btn { padding: 2px 7px; font-size: 12px; border-radius: 6px; background: transparent; border: 1px solid var(--border); cursor: pointer; }
.target-tool .edit-day-btn:hover { background: var(--surface-2); }
.target-tool .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.target-tool .modal-card { background: var(--surface-1); border-radius: 14px; padding: 20px; width: 100%; max-width: 340px; border: 1px solid var(--border); box-shadow: 0 12px 32px rgba(0,0,0,.25); }
.target-tool .modal-card.wide { max-width: 640px; }
.target-tool .modal-card h3 { margin: 0 0 14px; font-size: 15px; }
.target-tool .modal-card label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 12px; }
.target-tool .modal-card input, .target-tool .modal-card select {
  display: block; width: 100%; margin-top: 5px; padding: 8px 10px; font: inherit; font-size: 14px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary);
}
.target-tool .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.target-tool .new-month-row { display: grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap: 12px 16px; margin-bottom: 4px; }
.target-tool .new-month-note { font-size: 12px; color: var(--text-muted); background: var(--surface-2); border-radius: 8px; padding: 8px 10px; margin: 4px 0 12px; }
.target-tool .new-month-days { max-height: 320px; overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; }
.target-tool .new-month-day-row { display: grid; grid-template-columns: 28px 40px 1fr 1fr; gap: 8px; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--gridline); }
.target-tool .new-month-day-row:last-child { border-bottom: none; }
.target-tool .new-month-day-row .zi { font-weight: 600; font-size: 12.5px; }
.target-tool .new-month-day-row .ziSapt { font-size: 11px; color: var(--text-muted); }
.target-tool .new-month-day-row select { margin-top: 0; padding: 5px 8px; font-size: 12.5px; }
.target-tool .history-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--gridline); font-size: 13px; }
.target-tool .history-row:last-child { border-bottom: none; }
.target-tool .history-row .hmonth { width: 90px; flex: none; font-weight: 600; }
.target-tool .history-row .hbar { flex: 1; }
.target-tool .history-row .hpct { width: 56px; flex: none; text-align: right; font-variant-numeric: tabular-nums; }
@media print {
  .target-tool header.top, .target-tool #emptyState, .target-tool .btn, .target-tool button,
  .target-tool #fileInput, .target-tool select, .target-tool .edit-day-btn, .target-tool footer.note { display: none !important; }
  .target-tool, .target-tool .page { background: #fff; color: #000; }
  .target-tool .card, .target-tool .team-card { break-inside: avoid; border-color: #ccc; }
}
`

// ---------- generic helpers ----------
function norm(s: unknown): string {
  // NFD doesn't decompose the modern Romanian ș/ț (comma below) the way it
  // does ă/â/î — see lib/id.ts's slugify for the full explanation.
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[șş]/g, 's').replace(/[țţ]/g, 't')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim()
}
function toNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (s === '' || s === '-') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}
function fmtRON(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return Math.round(n).toLocaleString('ro-RO') + ' RON'
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return (n * 100).toFixed(1).replace('.', ',') + '%'
}
function escapeHtml(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}
function statusClass(status: unknown, pct: number | null): string {
  const s = norm(status)
  if (s) {
    if (s.includes('peste') || s.includes('ok') || s.includes('atins') || s.includes('🟢')) return 'good'
    if (s.includes('aproape') || s.includes('🟡')) return 'warning'
    if (s.includes('sub') || s.includes('🔴')) return 'critical'
  }
  if (pct == null) return 'pending'
  if (pct >= 1) return 'good'
  if (pct >= 0.9) return 'warning'
  return 'critical'
}
// ---------- parsing ----------
type Row = unknown[]
type WB = XLSX.WorkBook

function findSheet(wb: WB, keyword: string): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find((n) => norm(n).includes(norm(keyword)))
  return name ? wb.Sheets[name] : null
}
function rowsOf(sheet: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as Row[]
}
function findHeaderRow(rows: Row[], pred: (r: Row) => boolean): number {
  for (let i = 0; i < rows.length; i++) if (pred(rows[i])) return i
  return -1
}
function colIdx(header: Row, pred: (c: string) => boolean): number {
  return header.findIndex((c) => pred(norm(c)))
}

interface Rezumat {
  title: string | null
  subtitle: string | null
  monthlyTotal: number | null
  dailyTarget: number | null
  shift1Target: number | null
  shift2Target: number | null
}
function parseRezumat(wb: WB): Rezumat | null {
  const sheet = findSheet(wb, 'rezumat')
  if (!sheet) return null
  const rows = rowsOf(sheet)
  const out: Rezumat = { title: null, subtitle: null, monthlyTotal: null, dailyTarget: null, shift1Target: null, shift2Target: null }
  const titles: string[] = []
  for (const row of rows) {
    const cells = row.filter((c) => c != null)
    if (cells.length === 1 && typeof cells[0] === 'string' && cells[0].length > 8) {
      titles.push(cells[0].trim())
      continue
    }
    if (cells.length < 2) continue
    const label = norm(cells[0])
    const value = toNum(cells[cells.length - 1])
    if (value == null) continue
    if (label.includes('target') && label.includes('total') && label.includes('zile')) out.monthlyTotal = value
    else if (label.includes('target zilnic')) out.dailyTarget = value
    else if (label.includes('tura 1')) out.shift1Target = value
    else if (label.includes('tura 2')) out.shift2Target = value
  }
  out.title = titles[0] || null
  out.subtitle = titles[1] || null
  return out
}

interface TeamSituatie {
  name: unknown
  targetLunar: number | null
  targetPana: number | null
  realizat: number | null
  diferenta: number | null
  procent: number | null
  tureRamaseDim?: number | null
  tureRamaseSeara?: number | null
  tureTotalDim?: number | null
  tureTotalSeara?: number | null
  bonusOm?: number
  bonusEchipa?: number
}
function parseSituatieTarget(wb: WB): { teams: TeamSituatie[]; totals: TeamSituatie | null } | null {
  const sheet = findSheet(wb, 'situatie')
  if (!sheet) return null
  const rows = rowsOf(sheet)
  const headerIdx = findHeaderRow(rows, (r) => r.some((c) => norm(c) === 'echipa'))
  if (headerIdx === -1) return null
  const header = rows[headerIdx]
  const idx = {
    name: colIdx(header, (h) => h === 'echipa'),
    targetLunar: colIdx(header, (h) => h.includes('target lunar')),
    targetPana: colIdx(header, (h) => h.includes('target pana')),
    realizat: colIdx(header, (h) => h.includes('realizat')),
    diferenta: colIdx(header, (h) => h.includes('diferenta')),
    procent: colIdx(header, (h) => h.includes('%')),
  }
  const dimIdxs: number[] = []
  const searaIdxs: number[] = []
  header.forEach((h, i) => {
    const n = norm(h)
    if (n === 'dimineata') dimIdxs.push(i)
    if (n === 'seara') searaIdxs.push(i)
  })
  const teams: TeamSituatie[] = []
  let totals: TeamSituatie | null = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r[idx.name] == null) break
    if (norm(r[idx.name]).startsWith('total')) {
      totals = { name: r[idx.name], targetLunar: toNum(r[idx.targetLunar]), targetPana: toNum(r[idx.targetPana]), realizat: toNum(r[idx.realizat]), diferenta: toNum(r[idx.diferenta]), procent: toNum(r[idx.procent]) }
      break
    }
    teams.push({
      name: r[idx.name], targetLunar: toNum(r[idx.targetLunar]), targetPana: toNum(r[idx.targetPana]),
      realizat: toNum(r[idx.realizat]), diferenta: toNum(r[idx.diferenta]), procent: toNum(r[idx.procent]),
      tureRamaseDim: toNum(r[dimIdxs[0]]), tureRamaseSeara: toNum(r[searaIdxs[0]]),
      tureTotalDim: toNum(r[dimIdxs[1]]), tureTotalSeara: toNum(r[searaIdxs[1]]),
    })
  }
  return { teams, totals }
}

interface GrilaRow { nivel: unknown; procent: unknown; bonusPersoana: unknown; bonusEchipa: unknown; conditie?: unknown }
interface BonusTeamRow { name: unknown; targetLunar: number | null; realizat: number | null; procent: number | null; bonusOm: number | null; bonusEchipa: number | null }
function parseBonusare(wb: WB): { grila: GrilaRow[]; teams: BonusTeamRow[]; total: number | null } {
  const sheet = findSheet(wb, 'bonus')
  if (!sheet) return { grila: [], teams: [], total: null }
  const rows = rowsOf(sheet)
  const grilaHeaderIdx = findHeaderRow(rows, (r) => r.some((c) => norm(c) === 'nivel'))
  const grila: GrilaRow[] = []
  if (grilaHeaderIdx !== -1) {
    const header = rows[grilaHeaderIdx]
    const idx = {
      nivel: colIdx(header, (h) => h === 'nivel'),
      procent: colIdx(header, (h) => h.includes('% realizare')),
      bonusPersoana: colIdx(header, (h) => h.includes('bonus') && h.includes('persoana')),
      bonusEchipa: colIdx(header, (h) => h.includes('bonus') && h.includes('echipa')),
      conditie: colIdx(header, (h) => h.includes('conditie')),
    }
    for (let i = grilaHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r[idx.procent] == null || !String(r[idx.procent]).includes('%')) break
      grila.push({ nivel: r[idx.nivel], procent: r[idx.procent], bonusPersoana: r[idx.bonusPersoana], bonusEchipa: r[idx.bonusEchipa], conditie: r[idx.conditie] })
    }
  }
  const sumHeaderIdx = findHeaderRow(rows, (r) => r.some((c) => norm(c) === 'echipa') && r.some((c) => norm(c).includes('bonus')))
  const teams: BonusTeamRow[] = []
  let total: number | null = null
  if (sumHeaderIdx !== -1) {
    const header = rows[sumHeaderIdx]
    const idx = {
      name: colIdx(header, (h) => h === 'echipa'),
      targetLunar: colIdx(header, (h) => h.includes('target')),
      realizat: colIdx(header, (h) => h.includes('realiz')),
      procent: colIdx(header, (h) => h.includes('%')),
      bonusOm: colIdx(header, (h) => h.includes('bonus') && h.includes('om')),
      bonusEchipa: colIdx(header, (h) => h.includes('bonus') && h.includes('echipa')),
    }
    for (let i = sumHeaderIdx + 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || r[idx.name] == null) break
      if (norm(r[idx.name]).startsWith('total bonusuri')) { total = toNum(r[idx.bonusEchipa]); break }
      teams.push({ name: r[idx.name], targetLunar: toNum(r[idx.targetLunar]), realizat: toNum(r[idx.realizat]), procent: toNum(r[idx.procent]), bonusOm: toNum(r[idx.bonusOm]), bonusEchipa: toNum(r[idx.bonusEchipa]) })
    }
  }
  return { grila, teams, total }
}

interface DayRow {
  zi: number
  data: unknown
  ziSapt: unknown
  echipaTura1: unknown
  echipaTura2: unknown
  targetZi: number | null
  realizat: number | null
  diferenta: number | null
  procent: number | null
  status: unknown
}
function parseTargetZilnic(wb: WB): { days: DayRow[]; total: { targetZi: number | null; realizat: number | null } | null } | null {
  const sheet = findSheet(wb, 'zilnic')
  if (!sheet) return null
  const rows = rowsOf(sheet)
  const headerIdx = findHeaderRow(rows, (r) => r.some((c) => norm(c) === 'zi') && r.some((c) => norm(c) === 'data'))
  if (headerIdx === -1) return null
  const header = rows[headerIdx]
  const idx = {
    zi: colIdx(header, (h) => h === 'zi'), data: colIdx(header, (h) => h === 'data'),
    ziSapt: colIdx(header, (h) => h.includes('sapt')),
    echipa1: colIdx(header, (h) => h.includes('tura 1')), echipa2: colIdx(header, (h) => h.includes('tura 2')),
    targetZi: colIdx(header, (h) => h.includes('target') && h.includes('zi')),
    realizat: colIdx(header, (h) => h.includes('realizat')),
    diferenta: colIdx(header, (h) => h.includes('diferenta')),
    procent: colIdx(header, (h) => h.includes('%')),
    status: colIdx(header, (h) => h === 'status'),
  }
  const days: DayRow[] = []
  let total: { targetZi: number | null; realizat: number | null } | null = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r[idx.zi] == null) break
    if (typeof r[idx.zi] !== 'number') { total = { targetZi: toNum(r[idx.targetZi]), realizat: toNum(r[idx.realizat]) }; break }
    days.push({
      zi: r[idx.zi] as number, data: r[idx.data], ziSapt: r[idx.ziSapt], echipaTura1: r[idx.echipa1], echipaTura2: r[idx.echipa2],
      targetZi: toNum(r[idx.targetZi]), realizat: toNum(r[idx.realizat]), diferenta: toNum(r[idx.diferenta]), procent: toNum(r[idx.procent]), status: r[idx.status],
    })
  }
  return { days, total }
}

interface ShiftRow {
  data: unknown; tura: unknown; echipa: unknown
  realizat: number | null; targetTura: number | null; diferenta: number | null; procent: number | null; status: unknown
}
function parseTracker(wb: WB): { shifts: ShiftRow[] } | null {
  const sheet = findSheet(wb, 'echipe')
  if (!sheet) return null
  const rows = rowsOf(sheet)
  const headerIdx = findHeaderRow(rows, (r) => r.some((c) => norm(c) === 'data') && r.some((c) => norm(c) === 'tura'))
  if (headerIdx === -1) return null
  const header = rows[headerIdx]
  const idx = {
    data: colIdx(header, (h) => h === 'data'), tura: colIdx(header, (h) => h === 'tura'),
    echipa: colIdx(header, (h) => h.includes('echipa')), realizat: colIdx(header, (h) => h === 'realizat'),
    targetTura: colIdx(header, (h) => h.includes('target')), diferenta: colIdx(header, (h) => h.includes('diferenta')),
    procent: colIdx(header, (h) => h.includes('%')), status: colIdx(header, (h) => h === 'status'),
  }
  const shifts: ShiftRow[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r[idx.data] == null || !String(r[idx.data]).includes('/')) break
    shifts.push({
      data: r[idx.data], tura: r[idx.tura], echipa: r[idx.echipa], realizat: toNum(r[idx.realizat]), targetTura: toNum(r[idx.targetTura]),
      diferenta: toNum(r[idx.diferenta]), procent: toNum(r[idx.procent]), status: r[idx.status],
    })
  }
  return { shifts }
}

// ---------- bonus tier computation ----------
function parsePctRange(str: unknown): { min: number; minExclusive: boolean; max: number } | null {
  const s = String(str || '')
  let m = s.match(/>\s*(\d+(?:[.,]\d+)?)\s*%/)
  if (m) return { min: parseFloat(m[1].replace(',', '.')) / 100, minExclusive: true, max: Infinity }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*[–-]\s*(\d+(?:[.,]\d+)?)\s*%/)
  if (m) return { min: parseFloat(m[1].replace(',', '.')) / 100, minExclusive: false, max: parseFloat(m[2].replace(',', '.')) / 100 }
  m = s.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (m) return { min: parseFloat(m[1].replace(',', '.')) / 100, minExclusive: false, max: Infinity }
  return null
}
function computeBonusTier(pct: number | null, grila: GrilaRow[]): { bonusPersoana: number; bonusEchipa: number } {
  if (pct == null || !grila || !grila.length) return { bonusPersoana: 0, bonusEchipa: 0 }
  for (const g of grila) {
    const range = parsePctRange(g.procent)
    if (!range) continue
    const aboveMin = range.minExclusive ? pct > range.min : pct >= range.min
    if (aboveMin && pct <= range.max) {
      return { bonusPersoana: toNum(g.bonusPersoana) || 0, bonusEchipa: toNum(g.bonusEchipa) || 0 }
    }
  }
  return { bonusPersoana: 0, bonusEchipa: 0 }
}

// ---------- raw sales export (per-transaction) ----------
function detectRawSalesSheet(wb: WB): { name: string; rows: Row[] } | null {
  for (const name of wb.SheetNames) {
    const rows = rowsOf(wb.Sheets[name])
    if (!rows.length) continue
    const header = rows[0]
    const hasCasier = header.some((c) => norm(c).includes('casier'))
    const hasValoare = header.some((c) => norm(c).includes('valoare'))
    const hasCreat = header.some((c) => norm(c).includes('creat'))
    if (hasCasier && hasValoare && hasCreat) return { name, rows }
  }
  return null
}
function isExcludedFuel(produsNume: unknown): boolean {
  const n = norm(produsNume)
  return n.includes('benzina') || n.includes('motorina')
}
interface RawSalesResult { shiftsByDate: Record<string, { tura1: number | null; tura2: number | null }>; warnings: string[]; skipped: number }
function parseRawSales(wb: WB): RawSalesResult | null {
  const found = detectRawSalesSheet(wb)
  if (!found) return null
  const rows = found.rows
  const header = rows[0]
  const idx = {
    zi: colIdx(header, (h) => h === 'zi'),
    creat: colIdx(header, (h) => h.includes('creat')),
    casier: colIdx(header, (h) => h.includes('casier')),
    produs: colIdx(header, (h) => h.includes('produs')),
    valoare: colIdx(header, (h) => h.includes('valoare')),
  }
  const byDate = new Map<string, { t: number; casier: unknown; valoare: number }[]>()
  let skipped = 0
  let excludedTotal = 0, excludedCount = 0, gplTotal = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const ziRaw = r[idx.zi]
    if (ziRaw == null) continue
    const m = String(ziRaw).match(/^(\d{4})\.(\d{2})\.(\d{2})/)
    if (!m) { skipped++; continue }
    const dateKey = `${m[3]}/${m[2]}`
    const created = r[idx.creat]
    const casier = r[idx.casier]
    const valoare = toNum(r[idx.valoare]) || 0
    if (!(created instanceof Date) || !casier) { skipped++; continue }
    const produsNume = idx.produs !== -1 ? r[idx.produs] : null
    if (isExcludedFuel(produsNume)) { excludedTotal += valoare; excludedCount++; continue }
    if (norm(produsNume).includes('gaz petrolier') || norm(produsNume).includes('gpl')) gplTotal += valoare
    if (!byDate.has(dateKey)) byDate.set(dateKey, [])
    byDate.get(dateKey)!.push({ t: created.getTime(), casier, valoare })
  }
  const shiftsByDate: Record<string, { tura1: number | null; tura2: number | null }> = {}
  const warnings: string[] = []
  if (excludedCount) warnings.push(`Exclus benzină + motorină: ${fmtRON(excludedTotal)} (${excludedCount} linii)${gplTotal ? ' · GPL păstrat: ' + fmtRON(gplTotal) : ''}.`)
  for (const [date, entries] of byDate) {
    entries.sort((a, b) => a.t - b.t)
    const segments: { casier: unknown; sum: number; min: number; max: number }[] = []
    for (const e of entries) {
      const last = segments[segments.length - 1]
      if (last && last.casier === e.casier) { last.sum += e.valoare; last.max = e.t }
      else segments.push({ casier: e.casier, sum: e.valoare, min: e.t, max: e.t })
    }
    let tura1: number | null = null, tura2: number | null = null
    if (segments.length === 1) {
      const hour = new Date(segments[0].min).getHours()
      if (hour < 16) tura1 = segments[0].sum
      else tura2 = segments[0].sum
      warnings.push(`${date}: un singur casier găsit, presupun o singură tură.`)
    } else if (segments.length === 2) {
      segments.sort((a, b) => a.min - b.min)
      tura1 = segments[0].sum; tura2 = segments[1].sum
    } else {
      segments.sort((a, b) => a.min - b.min)
      let gapIdx = 1, maxGap = -1
      for (let i = 1; i < segments.length; i++) {
        const gap = segments[i].min - segments[i - 1].max
        if (gap > maxGap) { maxGap = gap; gapIdx = i }
      }
      tura1 = segments.slice(0, gapIdx).reduce((s, seg) => s + seg.sum, 0)
      tura2 = segments.slice(gapIdx).reduce((s, seg) => s + seg.sum, 0)
      warnings.push(`${date}: ${segments.length} casieri detectați, grupați euristic în 2 ture.`)
    }
    shiftsByDate[date] = { tura1, tura2 }
  }
  return { shiftsByDate, warnings, skipped }
}

// ---------- config / rotation / recompute ----------
interface DashboardData {
  rezumat: Rezumat | null
  situatie: { teams: TeamSituatie[]; totals: TeamSituatie | null } | null
  bonus: { grila: GrilaRow[]; teams: BonusTeamRow[]; total: number | null }
  zilnic: { days: DayRow[]; total: { targetZi: number | null; realizat: number | null } | null } | null
  tracker: { shifts: ShiftRow[] } | null
  config: { shift1Target: number | null; shift2Target: number | null; dailyTarget: number | null; grila: GrilaRow[] }
  rotation: Record<string, { tura1: string; tura2: string }>
  rawRealizat: Record<string, { tura1: number | null; tura2: number | null }>
  cutoffZi: number | null
  warnings: string[]
  savedAt: number
}

function buildRotation(zilnicDays: DayRow[] | undefined): Record<string, { tura1: string; tura2: string }> {
  const rotation: Record<string, { tura1: string; tura2: string }> = {}
  ;(zilnicDays || []).forEach((d) => {
    rotation[String(d.data)] = {
      tura1: teamShortLabel(String(d.echipaTura1 || '').split('\n')[0]),
      tura2: teamShortLabel(String(d.echipaTura2 || '').split('\n')[0]),
    }
  })
  return rotation
}
function seedRawRealizatFromTracker(tracker: { shifts: ShiftRow[] } | null): Record<string, { tura1: number | null; tura2: number | null }> {
  const raw: Record<string, { tura1: number | null; tura2: number | null }> = {}
  if (!tracker) return raw
  tracker.shifts.forEach((s) => {
    if (s.realizat == null) return
    const date = String(s.data || '')
    if (!raw[date]) raw[date] = { tura1: null, tura2: null }
    const isT1 = /t\s*1(\D|$)/i.test(String(s.tura || ''))
    if (isT1) raw[date].tura1 = s.realizat
    else raw[date].tura2 = s.realizat
  })
  return raw
}
function mergeRawRealizat(
  existing: Record<string, { tura1: number | null; tura2: number | null }>,
  incoming: Record<string, { tura1: number | null; tura2: number | null }>,
): Record<string, { tura1: number | null; tura2: number | null }> {
  const merged = { ...existing }
  Object.keys(incoming).forEach((date) => {
    const prev = merged[date] || { tura1: null, tura2: null }
    merged[date] = {
      tura1: incoming[date].tura1 != null ? incoming[date].tura1 : prev.tura1,
      tura2: incoming[date].tura2 != null ? incoming[date].tura2 : prev.tura2,
    }
  })
  return merged
}
function recompute(data: DashboardData) {
  const cfg = data.config
  const rotation = data.rotation
  const raw = data.rawRealizat
  const teamTotals: Record<string, { short: string; realizat: number; targetPana: number; tureTotalDim: number; tureTotalSeara: number; tureWorkedDim: number; tureWorkedSeara: number }> = {}
  const ensureTeam = (short: string) => {
    if (!teamTotals[short]) teamTotals[short] = { short, realizat: 0, targetPana: 0, tureTotalDim: 0, tureTotalSeara: 0, tureWorkedDim: 0, tureWorkedSeara: 0 }
    return teamTotals[short]
  }
  let cutoffZi: number | null = null
  ;(data.zilnic?.days || []).forEach((d) => {
    const rot = rotation[String(d.data)] || ({} as { tura1?: string; tura2?: string })
    const r = raw[String(d.data)] || {}
    if (rot.tura1) ensureTeam(rot.tura1).tureTotalDim++
    if (rot.tura2) ensureTeam(rot.tura2).tureTotalSeara++
    const realizatZi = r.tura1 != null || r.tura2 != null ? (r.tura1 || 0) + (r.tura2 || 0) : null
    d.realizat = realizatZi
    d.diferenta = realizatZi != null && d.targetZi != null ? realizatZi - d.targetZi : null
    d.procent = realizatZi != null && d.targetZi ? realizatZi / d.targetZi : null
    d.status = null
    if (realizatZi != null && (cutoffZi == null || d.zi > cutoffZi)) cutoffZi = d.zi
  })
  ;(data.zilnic?.days || []).forEach((d) => {
    if (cutoffZi == null || d.zi > cutoffZi) return
    const rot = rotation[String(d.data)] || ({} as { tura1?: string; tura2?: string })
    const r = raw[String(d.data)] || {}
    if (rot.tura1) { const t = ensureTeam(rot.tura1); t.tureWorkedDim++; t.targetPana += cfg.shift1Target || 0; t.realizat += r.tura1 || 0 }
    if (rot.tura2) { const t = ensureTeam(rot.tura2); t.tureWorkedSeara++; t.targetPana += cfg.shift2Target || 0; t.realizat += r.tura2 || 0 }
  })
  const nameLookup: Record<string, unknown> = {}
  ;(data.situatie?.teams || []).forEach((t) => { nameLookup[teamShortLabel(t.name)] = t.name })
  const shorts = Object.keys(teamTotals).sort()
  const teams = shorts.map((short) => {
    const t = teamTotals[short]
    const targetLunar = t.tureTotalDim * (cfg.shift1Target || 0) + t.tureTotalSeara * (cfg.shift2Target || 0)
    const procent = targetLunar ? t.realizat / targetLunar : null
    const bonus = computeBonusTier(procent, cfg.grila)
    return {
      name: (nameLookup[short] as string) || short,
      targetLunar, targetPana: t.targetPana, realizat: t.realizat,
      diferenta: t.realizat - t.targetPana, procent,
      tureRamaseDim: t.tureTotalDim - t.tureWorkedDim, tureRamaseSeara: t.tureTotalSeara - t.tureWorkedSeara,
      tureTotalDim: t.tureTotalDim, tureTotalSeara: t.tureTotalSeara,
      bonusOm: bonus.bonusPersoana, bonusEchipa: bonus.bonusEchipa,
    }
  })
  const totalTargetLunar = teams.reduce((s, t) => s + t.targetLunar, 0)
  const totalTargetPana = teams.reduce((s, t) => s + t.targetPana, 0)
  const totalRealizat = teams.reduce((s, t) => s + t.realizat, 0)
  data.situatie = {
    teams,
    totals: {
      name: 'TOTAL', targetLunar: totalTargetLunar, targetPana: totalTargetPana, realizat: totalRealizat,
      diferenta: totalRealizat - totalTargetPana, procent: totalTargetLunar ? totalRealizat / totalTargetLunar : null,
    },
  }
  data.bonus = {
    grila: cfg.grila,
    teams: teams.map((t) => ({ name: t.name, targetLunar: t.targetLunar, realizat: t.realizat, procent: t.procent, bonusOm: t.bonusOm, bonusEchipa: t.bonusEchipa })),
    total: teams.reduce((s, t) => s + t.bonusEchipa, 0),
  }
  data.zilnic!.total = {
    targetZi: (data.zilnic?.days || []).reduce((s, d) => s + (d.targetZi || 0), 0),
    realizat: (data.zilnic?.days || []).reduce((s, d) => s + (d.realizat || 0), 0),
  }
  data.cutoffZi = cutoffZi

  if (data.tracker?.shifts) {
    data.tracker.shifts.forEach((s) => {
      const r = raw[String(s.data || '')] || {}
      const isT1 = /t\s*1(\D|$)/i.test(String(s.tura || ''))
      const val = isT1 ? r.tura1 : r.tura2
      const target = isT1 ? cfg.shift1Target : cfg.shift2Target
      s.targetTura = target
      s.realizat = val != null ? val : null
      s.diferenta = val != null && target != null ? val - target : null
      s.procent = val != null && target ? val / target : null
      s.status = null
    })
  }
}

function deriveDashboard(wb: WB): DashboardData {
  const rezumat = parseRezumat(wb)
  const situatie = parseSituatieTarget(wb)
  const bonus = parseBonusare(wb)
  const zilnic = parseTargetZilnic(wb)
  const tracker = parseTracker(wb)
  const warnings: string[] = []
  if (!rezumat) warnings.push('Foaia „Rezumat” nu a fost găsită — lipsesc targetele generale.')
  if (!situatie) warnings.push('Foaia „Situatie target” nu a fost găsită — lipsește situația per echipă.')
  if (!zilnic) warnings.push('Foaia „Target Zilnic” nu a fost găsită — lipsește evoluția zi de zi.')
  if (!bonus || !bonus.teams.length) warnings.push('Foaia „Bonusare” nu a fost găsită sau nu are formatul așteptat.')
  if (!tracker) warnings.push('Foaia „Target Echipe” nu a fost găsită — lipsesc detaliile pe tură.')

  const config = {
    shift1Target: rezumat?.shift1Target ?? null,
    shift2Target: rezumat?.shift2Target ?? null,
    dailyTarget: rezumat?.dailyTarget ?? null,
    grila: bonus?.grila || [],
  }
  const rotation = buildRotation(zilnic?.days)
  const rawRealizat = seedRawRealizatFromTracker(tracker)

  const data: DashboardData = { rezumat, situatie, bonus, zilnic, tracker, config, rotation, rawRealizat, cutoffZi: null, warnings, savedAt: Date.now() }
  if (config.shift1Target != null && config.shift2Target != null && zilnic && zilnic.days.length) {
    recompute(data)
  }
  return data
}

// ---------- month key ----------
function monthKeyFrom(data: DashboardData, fileName: string): string {
  const t = data.rezumat?.title || data.rezumat?.subtitle || ''
  const m = t.match(/(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie|ian|feb|mar|apr|iun|iul|sep|oct|nov|dec)\w*\s+(\d{4})/i)
  if (m) return (m[1].slice(0, 3) + ' ' + m[2]).toUpperCase()
  return (fileName || 'FIȘIER').toUpperCase()
}

// ---------- storage ----------
// STORE_KEY/TEAM_NAMES_KEY and the read-only helpers below (teamShortLabel,
// teamKeyOf, resolveTeamName, loadTeamNames) live in @/data/pontaj so
// Cross-sell & Casieri and the Dashboard can read this page's pontaj
// without duplicating the keys/logic — this page stays the only writer.
function loadStore(): Record<string, DashboardData> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}
function saveStore(store: Record<string, DashboardData>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch { /* storage full/unavailable */ }
}
function saveTeamNames(names: Record<string, string>) {
  try { localStorage.setItem(TEAM_NAMES_KEY, JSON.stringify(names)) } catch { /* storage full/unavailable */ }
}
// Every place a team can show up on this page, so the "Nume echipe" modal
// offers one input per team actually present in the loaded month instead of
// guessing a fixed count.
function collectTeamKeys(data: DashboardData): { key: string; label: string }[] {
  const seen = new Map<string, string>()
  function add(raw: unknown) {
    const label = teamShortLabel(raw)
    const key = teamKeyOf(raw)
    if (label && key && !seen.has(key)) seen.set(key, label)
  }
  ;(data.zilnic?.days || []).forEach((d) => { add(d.echipaTura1); add(d.echipaTura2) })
  ;(data.tracker?.shifts || []).forEach((s) => add(s.echipa))
  ;(data.situatie?.teams || []).forEach((t) => add(t.name))
  ;(data.bonus?.teams || []).forEach((t) => add(t.name))
  return Array.from(seen.entries())
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
// Keys match monthKeyFrom's 3-letter truncation of the Romanian month name
// (e.g. "noiembrie".slice(0,3) === "noi", never "nov").
const MONTH_ORDER: Record<string, number> = { IAN: 0, FEB: 1, MAR: 2, APR: 3, MAI: 4, IUN: 5, IUL: 6, AUG: 7, SEP: 8, OCT: 9, NOI: 10, DEC: 11 }
const MONTH_ABBR_RO = ['IAN', 'FEB', 'MAR', 'APR', 'MAI', 'IUN', 'IUL', 'AUG', 'SEP', 'OCT', 'NOI', 'DEC']
const MONTH_NAMES_RO = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
]
const WEEKDAYS_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
function storeKeyForMonth(monthIdx: number, year: number): string {
  return `${MONTH_ABBR_RO[monthIdx]} ${year}`
}
function monthSortKey(key: string): number | null {
  const m = String(key).match(/^([A-ZĂÂÎȘȚ]{3})\s+(\d{4})$/i)
  if (!m) return null
  const idx = MONTH_ORDER[m[1].toUpperCase()]
  return idx == null ? null : parseInt(m[2], 10) * 100 + idx
}
function sortedMonthKeys(store: Record<string, DashboardData>): string[] {
  return Object.keys(store).sort((a, b) => {
    const ka = monthSortKey(a), kb = monthSortKey(b)
    if (ka != null && kb != null) return ka - kb
    return String(a).localeCompare(String(b))
  })
}

// ---------- new month skeleton (no Excel needed) ----------
// The owner's team rotation follows a fixed, repeating pattern (confirmed by
// the station owner directly) — so a brand-new month doesn't need to be
// typed in blind. We detect the cycle length from the most recently saved
// month's rotation and continue it day-by-day into the new month, letting
// the owner fix any individual day before saving (people do swap shifts).
function detectRotationCycle(days: DayRow[]): { tura1: string; tura2: string }[] | null {
  if (days.length < 4) return null
  const seq = days.map((d) => ({
    tura1: teamShortLabel(String(d.echipaTura1 || '').split('\n')[0]),
    tura2: teamShortLabel(String(d.echipaTura2 || '').split('\n')[0]),
  }))
  const maxPeriod = Math.floor(seq.length / 2)
  for (let period = 1; period <= maxPeriod; period++) {
    let ok = true
    for (let i = period; i < seq.length; i++) {
      if (seq[i].tura1 !== seq[i - period].tura1 || seq[i].tura2 !== seq[i - period].tura2) { ok = false; break }
    }
    if (ok) return seq.slice(0, period)
  }
  return null
}
// Where the new month's day 1 falls in that cycle, continuing on from the
// source month's last day (calendar-adjacent months only — a skipped month
// would throw this off, which is why every day stays editable in the modal).
function computeCycleOffset(sourceDays: DayRow[], cycle: { tura1: string; tura2: string }[]): number {
  if (!sourceDays.length || !cycle.length) return 0
  const lastIdx = (sourceDays.length - 1) % cycle.length
  return (lastIdx + 1) % cycle.length
}
function newMonthTeamOptions(latestData: DashboardData | null): { key: string; label: string }[] {
  const keys = latestData ? collectTeamKeys(latestData) : []
  if (keys.length) return keys
  return [
    { key: 'echipa 1', label: 'Echipa 1' },
    { key: 'echipa 2', label: 'Echipa 2' },
    { key: 'echipa 3', label: 'Echipa 3' },
  ]
}
function defaultNewMonthTarget(store: Record<string, DashboardData>): { monthIdx: number; year: number } {
  const keys = sortedMonthKeys(store)
  const now = new Date()
  if (!keys.length) return { monthIdx: now.getMonth(), year: now.getFullYear() }
  const m = keys[keys.length - 1].match(/^([A-ZĂÂÎȘȚ]{3})\s+(\d{4})$/i)
  const idx = m ? MONTH_ORDER[m[1].toUpperCase()] : null
  if (!m || idx == null) return { monthIdx: now.getMonth(), year: now.getFullYear() }
  const year = parseInt(m[2], 10)
  return idx === 11 ? { monthIdx: 0, year: year + 1 } : { monthIdx: idx + 1, year }
}
function buildNewMonthSkeleton(
  monthIdx: number,
  year: number,
  shift1Target: number | null,
  shift2Target: number | null,
  grila: GrilaRow[],
  dayAssignments: { tura1: string; tura2: string }[],
): DashboardData {
  const numDays = new Date(year, monthIdx + 1, 0).getDate()
  const dailyTarget = shift1Target != null && shift2Target != null ? shift1Target + shift2Target : null
  const days: DayRow[] = []
  for (let zi = 1; zi <= numDays; zi++) {
    const dateObj = new Date(year, monthIdx, zi)
    const assignment = dayAssignments[zi - 1] || { tura1: 'Echipa 1', tura2: 'Echipa 2' }
    days.push({
      zi,
      data: `${String(zi).padStart(2, '0')}.${String(monthIdx + 1).padStart(2, '0')}.${year}`,
      ziSapt: WEEKDAYS_RO[dateObj.getDay()],
      echipaTura1: assignment.tura1,
      echipaTura2: assignment.tura2,
      targetZi: dailyTarget, realizat: null, diferenta: null, procent: null, status: null,
    })
  }
  const monthName = MONTH_NAMES_RO[monthIdx]
  const rezumat: Rezumat = {
    title: `Target Vânzări ${monthName} ${year}`,
    subtitle: null,
    monthlyTotal: dailyTarget != null ? dailyTarget * numDays : null,
    dailyTarget, shift1Target, shift2Target,
  }
  const data: DashboardData = {
    rezumat, situatie: null, bonus: { grila, teams: [], total: null },
    zilnic: { days, total: null }, tracker: null,
    config: { shift1Target, shift2Target, dailyTarget, grila },
    rotation: buildRotation(days), rawRealizat: {}, cutoffZi: null, warnings: [], savedAt: Date.now(),
  }
  recompute(data)
  return data
}

// ---------- bridge into the app's own AppSettings.monthlyTargets ----------
// Syncs both the target AND the "Realizat până acum" this page itself
// computed from the uploaded Excel — the Dashboard's Forecast panel reads
// stationActual.realizat as its "Actual" so the two pages can never show
// different numbers for the same thing (station managers trust this page's
// Excel-tracked total over a figure recomputed from imported transactions,
// which can lag behind if an import is incomplete).
async function syncStationTargetToApp(
  storeKey: string,
  monthlyTotal: number | null,
  realizat: number | null,
  targetPana: number | null,
) {
  const m = storeKey.match(/^([A-ZĂÂÎȘȚ]{3})\s+(\d{4})$/i)
  if (!m) return
  const monIdx = MONTH_ORDER[m[1].toUpperCase()]
  if (monIdx == null) return
  const appMonthKey = `${m[2]}-${String(monIdx + 1).padStart(2, '0')}`
  const settings = await getSettings()
  const current = settings.monthlyTargets[appMonthKey] ?? emptyMonthTargets()
  await updateSettings({
    monthlyTargets: {
      ...settings.monthlyTargets,
      [appMonthKey]: {
        ...current,
        station: { ...current.station, totalSales: monthlyTotal },
        stationActual: { realizat, targetPana, savedAt: Date.now() },
      },
    },
  })
}

export function TargetsPage() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const $ = <T extends HTMLElement>(id: string): T => root.querySelector<T>('#' + id)!

    const els = {
      empty: $<HTMLDivElement>('emptyState'),
      dashboard: $<HTMLElement>('dashboard'),
      errorBox: $<HTMLDivElement>('errorBox'),
      warnBox: $<HTMLDivElement>('warnBox'),
      updatedLabel: $<HTMLSpanElement>('updatedLabel'),
      monthSelect: $<HTMLSelectElement>('monthSelect'),
      deleteMonthBtn: $<HTMLButtonElement>('deleteMonthBtn'),
      hero: $<HTMLDivElement>('heroCard'),
      today: $<HTMLDivElement>('todayCard'),
      teamGrid: $<HTMLDivElement>('teamGrid'),
      bonus: $<HTMLDivElement>('bonusCard'),
      chart: $<HTMLDivElement>('chartCard'),
      daily: $<HTMLDivElement>('dailyCard'),
      trackerWrap: $<HTMLDivElement>('trackerTableWrap'),
      trackerCard: $<HTMLDetailsElement>('trackerCard'),
      history: $<HTMLDivElement>('historyCard'),
      teamNamesBtn: $<HTMLButtonElement>('teamNamesBtn'),
      teamNamesModal: $<HTMLDivElement>('teamNamesModal'),
      teamNamesFields: $<HTMLDivElement>('teamNamesFields'),
      newMonthBtn: $<HTMLButtonElement>('newMonthBtn'),
      newMonthModal: $<HTMLDivElement>('newMonthModal'),
      newMonthMonth: $<HTMLSelectElement>('newMonthMonth'),
      newMonthYear: $<HTMLInputElement>('newMonthYear'),
      newMonthShift1: $<HTMLInputElement>('newMonthShift1'),
      newMonthShift2: $<HTMLInputElement>('newMonthShift2'),
      newMonthNote: $<HTMLDivElement>('newMonthNote'),
      newMonthDays: $<HTMLDivElement>('newMonthDays'),
    }

    let teamNames: Record<string, string> = loadTeamNames()

    function showError(msg: string) {
      els.errorBox.textContent = msg
      els.errorBox.style.display = msg ? 'block' : 'none'
    }
    function showWarnings(list: string[] | undefined) {
      if (!list || !list.length) { els.warnBox.style.display = 'none'; return }
      els.warnBox.innerHTML = list.map(escapeHtml).join(' · ')
      els.warnBox.style.display = 'block'
    }

    function statTile(label: string, value: string, cls?: string): string {
      return `<div class="stat-tile"><div class="label">${escapeHtml(label)}</div><div class="value${cls ? ' ' + cls : ''}">${value}</div></div>`
    }

    function renderHero(data: DashboardData) {
      const r = data.rezumat || ({} as Rezumat)
      const totals = data.situatie?.totals || ({} as TeamSituatie)
      const monthlyTotal = r.monthlyTotal ?? totals.targetLunar ?? null
      const realizat = totals.realizat ?? data.zilnic?.total?.realizat ?? null
      const targetPana = totals.targetPana ?? null
      const pct = totals.procent ?? (monthlyTotal ? (realizat ?? 0) / monthlyTotal : null)
      const pctVsPana = targetPana && realizat != null ? realizat / targetPana : null

      const days = data.zilnic?.days || []
      const daysWithData = days.filter((d) => d.realizat != null).length
      const projectedTotal = daysWithData && days.length ? ((realizat ?? 0) / daysWithData) * days.length : null

      let html = ''
      html += `<div class="hero-title">${escapeHtml(r.title || 'Target vânzări')}</div>`
      if (r.subtitle) html += `<div class="hero-sub">${escapeHtml(r.subtitle)}</div>`
      html += '<div class="stat-row">'
      html += statTile('Target lunar total', fmtRON(monthlyTotal))
      html += statTile('Realizat până acum', fmtRON(realizat))
      if (targetPana != null) html += statTile('Target până azi', fmtRON(targetPana))
      if (totals.diferenta != null) {
        const cls = totals.diferenta >= 0 ? 'delta-good' : 'delta-bad'
        html += statTile('Diferență față de target-până-azi', (totals.diferenta >= 0 ? '+' : '') + fmtRON(totals.diferenta), cls)
      }
      if (projectedTotal != null && monthlyTotal) {
        const cls = projectedTotal >= monthlyTotal ? 'delta-good' : 'delta-bad'
        html += statTile('Proiecție sfârșit de lună (la ritmul actual)', fmtRON(projectedTotal), cls)
      }
      html += '</div>'
      html += `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px;">
        <span>Progres luni curente</span><span>${fmtPct(pct)} din target lunar${pctVsPana != null ? ' · ' + fmtPct(pctVsPana) + ' din target-până-azi' : ''}</span></div>`
      const barPct = Math.max(0, Math.min(100, (pct || 0) * 100))
      const barCls = statusClass(null, pct)
      html += `<div class="bar"><div class="fill" style="width:${barPct}%;background:var(--${barCls === 'pending' ? 'series-1' : barCls});"></div></div>`
      els.hero.innerHTML = html
    }

    function renderToday(data: DashboardData) {
      if (!data.zilnic || data.cutoffZi == null) { els.today.style.display = 'none'; return }
      const nextZi = data.cutoffZi + 1
      const day = data.zilnic.days.find((d) => d.zi === nextZi) || data.zilnic.days.find((d) => d.zi === data.cutoffZi)
      if (!day) { els.today.style.display = 'none'; return }
      const isPending = day.zi === nextZi
      els.today.style.display = 'block'
      const teamColor = (name: unknown) => {
        const n = String(name || '')
        if (/echipa\s*1/i.test(n)) return 'var(--series-1)'
        if (/echipa\s*2/i.test(n)) return 'var(--series-2)'
        if (/echipa\s*3/i.test(n)) return 'var(--series-3)'
        return 'var(--text-muted)'
      }
      let html = `<h3>${isPending ? 'Următoarea zi de urmărit' : 'Ultima zi înregistrată'}</h3>`
      html += '<div class="today-grid">'
      html += `<div><div class="today-date">${escapeHtml(String(day.data || ''))} <span class="today-sub">${escapeHtml(String(day.ziSapt || ''))}</span></div>
        <div class="today-sub">Ziua ${day.zi} din lună</div></div>`
      html += `<div>
        <div class="shift-chip"><span class="dot" style="background:${teamColor(day.echipaTura1)}"></span>Tura 1: ${escapeHtml(resolveTeamName(day.echipaTura1, teamNames))}</div>
        <div class="shift-chip"><span class="dot" style="background:${teamColor(day.echipaTura2)}"></span>Tura 2: ${escapeHtml(resolveTeamName(day.echipaTura2, teamNames))}</div>
      </div>`
      if (isPending) {
        html += `<div><div class="today-sub">Target zi</div><div style="font-weight:700;">${fmtRON(day.targetZi)}</div>
          <div class="today-sub" style="margin-top:6px;">Realizat</div><div style="color:var(--text-muted);">încă neîncărcat</div></div>`
      } else {
        const cls = statusClass(day.status, day.procent)
        html += `<div><div class="today-sub">Target zi</div><div style="font-weight:700;">${fmtRON(day.targetZi)}</div>
          <div class="today-sub" style="margin-top:6px;">Realizat</div><div style="font-weight:700;">${fmtRON(day.realizat)}</div></div>
          <div><span class="status-badge status-${cls}">${fmtPct(day.procent)}</span></div>`
      }
      html += '</div>'
      els.today.innerHTML = html
    }

    function renderTeams(data: DashboardData) {
      const teams = data.situatie?.teams || []
      if (!teams.length) { els.teamGrid.innerHTML = '<div class="card">Nu există date de echipă în acest fișier.</div>'; return }
      const accents = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)']
      els.teamGrid.innerHTML = teams.map((t, i) => {
        const cls = statusClass(null, t.procent)
        const override = teamNames[teamKeyOf(t.name)]
        const [autoShort, autoMembers] = String(t.name || '').split(/\s*[—-]\s*/)
        const displayName = override || autoShort || t.name
        const displayMembers = override ? '' : autoMembers || ''
        const barPct = Math.max(0, Math.min(100, (t.procent || 0) * 100))
        return `<div class="team-card" style="--accent:${accents[i % 3]}">
          <div class="name">${escapeHtml(displayName)}</div>
          <div class="members">${escapeHtml(displayMembers)}</div>
          <div class="pct" style="color:var(--${cls === 'pending' ? 'text-primary' : cls})">${fmtPct(t.procent)}</div>
          <div class="bar small"><div class="fill" style="width:${barPct}%;background:var(--${cls === 'pending' ? 'series-1' : cls});"></div></div>
          <div class="stats">
            <div><span>Target lunar</span><b>${fmtRON(t.targetLunar)}</b></div>
            <div><span>Realizat</span><b>${fmtRON(t.realizat)}</b></div>
            <div><span>Target până azi</span><b>${fmtRON(t.targetPana)}</b></div>
            <div><span>Diferență</span><b style="color:${(t.diferenta || 0) >= 0 ? 'var(--good)' : 'var(--critical)'}">${(t.diferenta ?? 0) >= 0 ? '+' : ''}${fmtRON(t.diferenta)}</b></div>
          </div>
          <div class="ture-row">
            <span>☀️ Ture rămase dim: <b>${t.tureRamaseDim ?? '—'}</b>/${t.tureTotalDim ?? '—'}</span>
            <span>🌙 Ture rămase seară: <b>${t.tureRamaseSeara ?? '—'}</b>/${t.tureTotalSeara ?? '—'}</span>
          </div>
        </div>`
      }).join('')
    }

    function renderBonus(data: DashboardData) {
      const b = data.bonus || { grila: [], teams: [], total: null }
      if (!b.teams.length && !b.grila.length) { els.bonus.style.display = 'none'; return }
      els.bonus.style.display = 'block'
      let html = '<h3>Bonusare</h3><div class="bonus-layout">'
      html += '<div>'
      if (b.grila.length) {
        html += b.grila.map((g) => `<div class="grila-row">
          <div><div class="niv">${escapeHtml(g.nivel)}</div><div class="amt">${escapeHtml(g.procent)} din target</div></div>
          <div class="amt">${escapeHtml(g.bonusPersoana)} / persoană<br>${escapeHtml(g.bonusEchipa)} / echipă</div>
        </div>`).join('')
      } else {
        html += '<div style="color:var(--text-muted);font-size:13px;">Grila de bonus nu a fost găsită.</div>'
      }
      html += '</div>'
      html += '<div class="table-scroll"><table><thead><tr><th>Echipă</th><th class="num">% realizare</th><th class="num">Bonus/persoană</th><th class="num">Bonus/echipă</th></tr></thead><tbody>'
      b.teams.forEach((t) => {
        const override = teamNames[teamKeyOf(t.name)]
        const [autoShort] = String(t.name || '').split(/\s*[—-]\s*/)
        const displayName = override || autoShort || t.name
        html += `<tr><td>${escapeHtml(displayName)}</td><td class="num">${fmtPct(t.procent)}</td><td class="num">${fmtRON(t.bonusOm)}</td><td class="num">${fmtRON(t.bonusEchipa)}</td></tr>`
      })
      if (b.total != null) html += `<tr class="total-row"><td colspan="3">Total bonusuri de plătit</td><td class="num">${fmtRON(b.total)}</td></tr>`
      html += '</tbody></table></div></div>'
      els.bonus.innerHTML = html
    }

    function renderDaily(data: DashboardData) {
      if (!data.zilnic || !data.zilnic.days.length) { els.daily.style.display = 'none'; return }
      els.daily.style.display = 'block'
      const cutoff = data.cutoffZi
      let html = '<h3>Evoluție zilnică</h3><div class="table-scroll"><table class="daily-table"><thead><tr>' +
        '<th>Zi</th><th>Dată</th><th>Tura 1</th><th>Tura 2</th><th class="num">Target</th><th class="num">Realizat</th><th class="num">Diferență</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>'
      data.zilnic.days.forEach((d) => {
        const pending = cutoff != null && d.zi > cutoff
        const cls = pending ? 'pending' : statusClass(d.status, d.procent)
        const isToday = cutoff != null && d.zi === cutoff + 1
        html += `<tr class="${pending ? 'pending' : ''}${isToday ? ' today-row' : ''}">
          <td>${d.zi}</td><td>${escapeHtml(String(d.data || ''))} <span style="color:var(--text-muted);font-size:11px;">${escapeHtml(String(d.ziSapt || '').slice(0, 3))}</span></td>
          <td>${escapeHtml(resolveTeamName(d.echipaTura1, teamNames))}</td>
          <td>${escapeHtml(resolveTeamName(d.echipaTura2, teamNames))}</td>
          <td class="num">${fmtRON(d.targetZi)}</td>
          <td class="num">${pending ? '—' : fmtRON(d.realizat)}</td>
          <td class="num">${pending ? '—' : ((d.diferenta ?? 0) >= 0 ? '+' : '') + fmtRON(d.diferenta)}</td>
          <td>${pending ? '<span class="status-badge status-pending">în așteptare</span>' : `<span class="status-badge status-${cls}">${fmtPct(d.procent)}</span>`}</td>
          <td><button class="edit-day-btn" data-date="${escapeHtml(String(d.data || ''))}" title="Editează manual ziua ${escapeHtml(String(d.data || ''))}">✎</button></td>
        </tr>`
      })
      if (data.zilnic.total) {
        html += `<tr class="total-row"><td colspan="4">Total lună</td><td class="num">${fmtRON(data.zilnic.total.targetZi)}</td><td class="num">${fmtRON(data.zilnic.total.realizat)}</td><td colspan="3"></td></tr>`
      }
      html += '</tbody></table></div>'
      els.daily.innerHTML = html
    }

    function renderTracker(data: DashboardData) {
      if (!data.tracker || !data.tracker.shifts.length) { els.trackerCard.style.display = 'none'; return }
      els.trackerCard.style.display = 'block'
      let html = '<table><thead><tr><th>Dată</th><th>Tură</th><th>Echipă</th><th class="num">Realizat</th><th class="num">Target</th><th>Status</th></tr></thead><tbody>'
      data.tracker.shifts.forEach((s) => {
        const pending = s.realizat == null
        const cls = pending ? 'pending' : statusClass(s.status, s.procent)
        const displayName = resolveTeamName(s.echipa, teamNames)
        html += `<tr class="${pending ? 'pending' : ''}">
          <td>${escapeHtml(String(s.data || ''))}</td><td>${escapeHtml(String(s.tura || ''))}</td><td>${escapeHtml(displayName)}</td>
          <td class="num">${pending ? '—' : fmtRON(s.realizat)}</td><td class="num">${fmtRON(s.targetTura)}</td>
          <td>${pending ? '<span class="status-badge status-pending">—</span>' : `<span class="status-badge status-${cls}">${fmtPct(s.procent)}</span>`}</td>
        </tr>`
      })
      html += '</tbody></table>'
      els.trackerWrap.innerHTML = html
    }

    function renderHistory() {
      const store = loadStore()
      const keys = sortedMonthKeys(store)
      if (keys.length < 2) { els.history.style.display = 'none'; return }
      els.history.style.display = 'block'
      const rows = keys.map((k) => {
        const d = store[k]
        const totals = d.situatie?.totals || ({} as TeamSituatie)
        const pct = totals.procent
        const barPct = Math.max(0, Math.min(100, (pct || 0) * 100))
        const cls = statusClass(null, pct ?? null)
        return `<div class="history-row">
          <div class="hmonth">${escapeHtml(k)}</div>
          <div class="hbar"><div class="bar small"><div class="fill" style="width:${barPct}%;background:var(--${cls === 'pending' ? 'series-1' : cls});"></div></div></div>
          <div class="hpct">${fmtPct(pct)}</div>
        </div>`
      }).join('')
      els.history.innerHTML = '<h3>Istoric luni</h3>' + rows
    }

    function renderChart(data: DashboardData) {
      if (!data.zilnic || !data.zilnic.days.length) { els.chart.style.display = 'none'; return }
      els.chart.style.display = 'block'
      const days = data.zilnic.days
      const cutoff = data.cutoffZi
      let cumTarget = 0, cumReal = 0
      const pointsTarget: number[] = [], pointsReal: number[] = []
      days.forEach((d) => {
        cumTarget += d.targetZi || 0
        pointsTarget.push(cumTarget)
        if (cutoff == null || d.zi <= cutoff) {
          cumReal += d.realizat || 0
          pointsReal.push(cumReal)
        }
      })
      const maxVal = Math.max(cumTarget, cumReal) * 1.05 || 1
      const W = 760, H = 260, padL = 56, padR = 16, padT = 16, padB = 28
      const innerW = W - padL - padR, innerH = H - padT - padB
      const n = days.length
      const x = (i: number) => padL + (innerW * i) / Math.max(1, n - 1)
      const y = (v: number) => padT + innerH - (innerH * v) / maxVal

      const pathTarget = pointsTarget.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
      const pathReal = pointsReal.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

      const ticks = 4
      let gridSvg = ''
      for (let t = 0; t <= ticks; t++) {
        const v = (maxVal / ticks) * t
        const yy = y(v)
        gridSvg += `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" stroke="var(--gridline)" stroke-width="1"/>`
        gridSvg += `<text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--text-muted)">${Math.round(v / 1000)}k</text>`
      }
      let xTickSvg = ''
      for (let i = 0; i < n; i += Math.ceil(n / 8)) {
        xTickSvg += `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${days[i].zi}</text>`
      }
      let dotsSvg = ''
      pointsReal.forEach((v, i) => { dotsSvg += `<circle class="hover-dot" data-i="${i}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="8" fill="transparent"/>` })

      const todayX = cutoff != null ? x(cutoff) : null

      els.chart.innerHTML = `
        <h3>Target cumulat vs. realizat cumulat</h3>
        <div class="chart-legend">
          <span class="item"><span class="legend-line dashed"></span>Target cumulat</span>
          <span class="item"><span class="legend-line"></span>Realizat cumulat</span>
        </div>
        <div class="chart-wrap">
          <svg class="chart" viewBox="0 0 ${W} ${H}" id="cumChart">
            ${gridSvg}
            ${todayX != null ? `<line x1="${todayX.toFixed(1)}" y1="${padT}" x2="${todayX.toFixed(1)}" y2="${H - padB}" stroke="var(--baseline)" stroke-width="1" stroke-dasharray="3 3"/>` : ''}
            <path d="${pathTarget}" fill="none" stroke="var(--baseline)" stroke-width="2" stroke-dasharray="5 4"/>
            <path d="${pathReal}" fill="none" stroke="var(--series-1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            ${pointsReal.length ? `<circle cx="${x(pointsReal.length - 1).toFixed(1)}" cy="${y(pointsReal[pointsReal.length - 1]).toFixed(1)}" r="4" fill="var(--series-1)"/>` : ''}
            ${xTickSvg}
            ${dotsSvg}
          </svg>
          <div class="chart-tooltip" id="chartTooltip"></div>
        </div>`

      const tooltip = els.chart.querySelector<HTMLDivElement>('#chartTooltip')!
      const svg = els.chart.querySelector<SVGSVGElement>('#cumChart')!
      svg.querySelectorAll('.hover-dot').forEach((dot) => {
        dot.addEventListener('mouseenter', (e) => {
          const i = +dot.getAttribute('data-i')!
          const day = days[i]
          tooltip.innerHTML = `<b>${escapeHtml(String(day.data))}</b><br>Target cumul.: ${fmtRON(pointsTarget[i])}<br>Realizat cumul.: ${fmtRON(pointsReal[i])}`
          tooltip.style.display = 'block'
          positionTooltip(e as MouseEvent)
        })
        dot.addEventListener('mousemove', (e) => positionTooltip(e as MouseEvent))
        dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none' })
      })
      function positionTooltip(e: MouseEvent) {
        const wrapRect = svg.parentElement!.getBoundingClientRect()
        tooltip.style.left = e.clientX - wrapRect.left + 12 + 'px'
        tooltip.style.top = e.clientY - wrapRect.top - 36 + 'px'
      }
    }

    function render(data: DashboardData) {
      currentData = data
      showWarnings(data.warnings)
      renderHero(data)
      renderToday(data)
      renderTeams(data)
      renderBonus(data)
      renderChart(data)
      renderDaily(data)
      renderTracker(data)
      renderHistory()
      els.dashboard.classList.add('visible')
      els.empty.style.display = 'none'
      els.teamNamesBtn.style.display = 'inline-block'
      const d = new Date(data.savedAt)
      els.updatedLabel.textContent = 'actualizat ' + d.toLocaleDateString('ro-RO') + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })
      if (currentKey) {
        const totals = data.situatie?.totals
        const monthlyTotal = data.rezumat?.monthlyTotal ?? totals?.targetLunar ?? null
        const realizat = totals?.realizat ?? data.zilnic?.total?.realizat ?? null
        const targetPana = totals?.targetPana ?? null
        syncStationTargetToApp(currentKey, monthlyTotal, realizat, targetPana).catch(() => {})
      }
    }

    // ---------- month switcher ----------
    let currentKey: string | null = null
    let currentData: DashboardData | null = null
    function refreshMonthSelect() {
      const store = loadStore()
      const keys = sortedMonthKeys(store)
      if (keys.length <= 1) { els.monthSelect.style.display = 'none'; els.deleteMonthBtn.style.display = keys.length ? 'inline-block' : 'none'; return }
      els.monthSelect.style.display = 'inline-block'
      els.deleteMonthBtn.style.display = 'inline-block'
      els.monthSelect.innerHTML = keys.map((k) => `<option value="${escapeHtml(k)}" ${k === currentKey ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')
    }
    els.monthSelect.addEventListener('change', () => {
      const store = loadStore()
      const key = els.monthSelect.value
      if (store[key]) { currentKey = key; render(store[key]); refreshMonthSelect() }
    })
    els.deleteMonthBtn.addEventListener('click', () => {
      if (!currentKey) return
      if (!confirm('Ștergi datele salvate pentru ' + currentKey + '?')) return
      const store = loadStore()
      delete store[currentKey]
      saveStore(store)
      const keys = sortedMonthKeys(store)
      if (keys.length) { currentKey = keys[keys.length - 1]; render(store[currentKey]); refreshMonthSelect() }
      else {
        currentKey = null
        els.dashboard.classList.remove('visible')
        els.empty.style.display = 'block'
        els.monthSelect.style.display = 'none'
        els.deleteMonthBtn.style.display = 'none'
        els.updatedLabel.textContent = ''
      }
    })

    // ---------- file handling ----------
    function handleRawSalesUpload(wb: WB) {
      if (!currentKey) { showError('Încarcă mai întâi șablonul lunar (cu targetele) — abia apoi poți încărca vânzările brute peste el.'); return }
      const store = loadStore()
      const data = store[currentKey]
      if (!data || !data.config || !data.rotation) { showError('Luna curentă nu are configurația necesară (targete/rotație). Reîncarcă șablonul lunar și încearcă din nou.'); return }
      const parsed = parseRawSales(wb)
      if (!parsed) { showError('Nu am recunoscut structura fișierului de vânzări brute.'); return }
      const knownDates = new Set(Object.keys(data.rotation))
      const matched: Record<string, { tura1: number | null; tura2: number | null }> = {}
      const unmatched: string[] = []
      Object.keys(parsed.shiftsByDate).forEach((d) => {
        if (knownDates.has(d)) matched[d] = parsed.shiftsByDate[d]
        else unmatched.push(d)
      })
      data.rawRealizat = mergeRawRealizat(data.rawRealizat, matched)
      recompute(data)
      data.savedAt = Date.now()
      const msgs: string[] = []
      const matchedDates = Object.keys(matched).sort()
      if (matchedDates.length) msgs.push('Actualizat din vânzări: ' + matchedDates.join(', ') + '.')
      else msgs.push('Nicio zi din fișier nu corespunde lunii curente.')
      if (unmatched.length) msgs.push('Ignorat (dată în afara lunii încărcate): ' + unmatched.join(', ') + '.')
      msgs.push(...parsed.warnings)
      data.warnings = msgs
      store[currentKey] = data
      saveStore(store)
      render(data)
    }

    function handleFile(file: File) {
      showError('')
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result, { type: 'array', cellDates: true })
          if (detectRawSalesSheet(wb)) { handleRawSalesUpload(wb); return }
          const data = deriveDashboard(wb)
          if (!data.rezumat && !data.situatie && !data.zilnic) {
            showError('Nu am putut recunoaște structura fișierului. Verifică dacă e exportat din același șablon (foile Rezumat / Target Zilnic / Situatie target) sau e un export de vânzări brute (coloanele Casier / Creat La / Valoare Totală).')
            return
          }
          const key = monthKeyFrom(data, file.name)
          const store = loadStore()
          const existing = store[key]
          if (existing?.rawRealizat) {
            data.rawRealizat = mergeRawRealizat(data.rawRealizat, existing.rawRealizat)
            recompute(data)
          }
          store[key] = data
          saveStore(store)
          currentKey = key
          render(data)
          refreshMonthSelect()
        } catch (err) {
          showError('Eroare la citirea fișierului: ' + (err instanceof Error ? err.message : String(err)))
        }
      }
      reader.onerror = () => showError('Nu am putut citi fișierul.')
      reader.readAsArrayBuffer(file)
    }

    const fileInput = $<HTMLInputElement>('fileInput')
    fileInput.addEventListener('change', (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) handleFile(f)
      ;(e.target as HTMLInputElement).value = ''
    })

    ;['dragover', 'dragenter'].forEach((evt) => els.empty.addEventListener(evt, (e) => { e.preventDefault(); els.empty.classList.add('dragover') }))
    ;['dragleave', 'drop'].forEach((evt) => els.empty.addEventListener(evt, (e) => { e.preventDefault(); els.empty.classList.remove('dragover') }))
    els.empty.addEventListener('drop', (e) => {
      const file = (e as DragEvent).dataTransfer?.files?.[0]
      if (file) handleFile(file)
    })

    // ---------- print ----------
    $<HTMLButtonElement>('printBtn').addEventListener('click', () => window.print())

    // ---------- backup export / restore ----------
    $<HTMLButtonElement>('backupBtn').addEventListener('click', () => {
      const store = loadStore()
      const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url; a.download = `backup-target-vanzari-${stamp}.json`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })
    const restoreInput = $<HTMLInputElement>('restoreInput')
    restoreInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      ;(e.target as HTMLInputElement).value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const incoming = JSON.parse(ev.target!.result as string)
          if (typeof incoming !== 'object' || incoming == null) throw new Error('format invalid')
          const store = loadStore()
          Object.assign(store, incoming)
          Object.keys(store).forEach((k) => {
            const d = store[k]
            if (d?.config && d.rotation && d.rawRealizat) recompute(d)
          })
          saveStore(store)
          const keys = sortedMonthKeys(store)
          if (keys.length) {
            currentKey = keys[keys.length - 1]
            render(store[currentKey])
            refreshMonthSelect()
          }
          showError('')
        } catch (err) {
          showError('Fișierul de backup nu a putut fi citit: ' + (err instanceof Error ? err.message : String(err)))
        }
      }
      reader.readAsText(file)
    })

    // ---------- manual day edit ----------
    const editModal = $<HTMLDivElement>('editDayModal')
    const editTitle = $<HTMLHeadingElement>('editDayTitle')
    const editTura1Input = $<HTMLInputElement>('editTura1')
    const editTura2Input = $<HTMLInputElement>('editTura2')
    let editingDate: string | null = null

    els.daily.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.edit-day-btn')
      if (!btn || !currentKey) return
      const date = btn.getAttribute('data-date')!
      const store = loadStore()
      const data = store[currentKey]
      if (!data) return
      data.rawRealizat = data.rawRealizat || {}
      editingDate = date
      editTitle.textContent = 'Editare zi ' + date
      const existing = data.rawRealizat[date] || { tura1: null, tura2: null }
      editTura1Input.value = existing.tura1 != null ? String(existing.tura1) : ''
      editTura2Input.value = existing.tura2 != null ? String(existing.tura2) : ''
      editModal.style.display = 'flex'
      editTura1Input.focus()
    })
    $<HTMLButtonElement>('editDayCancel').addEventListener('click', () => { editModal.style.display = 'none' })
    editModal.addEventListener('click', (e) => { if (e.target === editModal) editModal.style.display = 'none' })
    $<HTMLButtonElement>('editDaySave').addEventListener('click', () => {
      if (!editingDate || !currentKey) { editModal.style.display = 'none'; return }
      const store = loadStore()
      const data = store[currentKey]
      if (!data) { editModal.style.display = 'none'; return }
      data.rawRealizat = data.rawRealizat || {}
      const v1 = editTura1Input.value.trim()
      const v2 = editTura2Input.value.trim()
      data.rawRealizat[editingDate] = {
        tura1: v1 === '' ? null : parseFloat(v1),
        tura2: v2 === '' ? null : parseFloat(v2),
      }
      recompute(data)
      data.savedAt = Date.now()
      store[currentKey] = data
      saveStore(store)
      editModal.style.display = 'none'
      render(data)
    })

    // ---------- team names ----------
    els.teamNamesBtn.addEventListener('click', () => {
      if (!currentData) return
      const keys = collectTeamKeys(currentData)
      els.teamNamesFields.innerHTML = keys.length
        ? keys
            .map(
              ({ key, label }) => `<label>
                ${escapeHtml(label)}
                <input type="text" data-team-key="${escapeHtml(key)}" value="${escapeHtml(teamNames[key] || '')}" placeholder="${escapeHtml(label)}" />
              </label>`,
            )
            .join('')
        : '<p style="color:var(--text-muted);font-size:13px;">Nicio echipă găsită în luna curentă.</p>'
      els.teamNamesModal.style.display = 'flex'
      els.teamNamesFields.querySelector('input')?.focus()
    })
    $<HTMLButtonElement>('teamNamesCancel').addEventListener('click', () => { els.teamNamesModal.style.display = 'none' })
    els.teamNamesModal.addEventListener('click', (e) => { if (e.target === els.teamNamesModal) els.teamNamesModal.style.display = 'none' })
    $<HTMLButtonElement>('teamNamesSave').addEventListener('click', () => {
      const inputs = els.teamNamesFields.querySelectorAll<HTMLInputElement>('input[data-team-key]')
      const next = { ...teamNames }
      inputs.forEach((input) => {
        const key = input.getAttribute('data-team-key')!
        const value = input.value.trim()
        if (value) next[key] = value
        else delete next[key]
      })
      teamNames = next
      saveTeamNames(teamNames)
      els.teamNamesModal.style.display = 'none'
      if (currentData) render(currentData)
    })

    // ---------- new month ----------
    function renderNewMonthDays() {
      const monthIdx = Number(els.newMonthMonth.value)
      const year = Number(els.newMonthYear.value) || new Date().getFullYear()
      const numDays = new Date(year, monthIdx + 1, 0).getDate()
      const store = loadStore()
      const keys = sortedMonthKeys(store)
      const latestKey = keys[keys.length - 1]
      const latestData = latestKey ? store[latestKey] : null
      const latestDays = latestData?.zilnic?.days || []
      const cycle = latestDays.length ? detectRotationCycle(latestDays) : null
      const offset = cycle ? computeCycleOffset(latestDays, cycle) : 0
      const teamOptions = newMonthTeamOptions(latestData)

      let rows = ''
      for (let zi = 1; zi <= numDays; zi++) {
        const dateObj = new Date(year, monthIdx, zi)
        let t1 = teamOptions[0]?.label || 'Echipa 1'
        let t2 = teamOptions[1]?.label || teamOptions[0]?.label || 'Echipa 2'
        if (cycle && cycle.length) {
          const c = cycle[(offset + zi - 1) % cycle.length]
          if (c.tura1) t1 = c.tura1
          if (c.tura2) t2 = c.tura2
        }
        const optHtml = (selected: string) =>
          teamOptions
            .map(
              (o) =>
                `<option value="${escapeHtml(o.label)}" ${teamKeyOf(o.label) === teamKeyOf(selected) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
            )
            .join('')
        rows += `<div class="new-month-day-row">
          <span class="zi">${zi}</span>
          <span class="ziSapt">${escapeHtml(WEEKDAYS_RO[dateObj.getDay()].slice(0, 3))}</span>
          <select data-zi="${zi}" data-shift="1">${optHtml(t1)}</select>
          <select data-zi="${zi}" data-shift="2">${optHtml(t2)}</select>
        </div>`
      }
      els.newMonthDays.innerHTML = rows

      if (cycle) {
        els.newMonthNote.textContent = `Tipar detectat în ${latestKey}: se repetă la fiecare ${cycle.length} zile — rotația de mai jos e continuată automat din el. Corectează orice zi dacă echipele au schimbat între ele.`
      } else if (latestKey) {
        els.newMonthNote.textContent = `Nu am putut detecta un tipar fix de rotație în ${latestKey} — completează echipele de mai jos manual.`
      } else {
        els.newMonthNote.textContent = 'Nicio lună anterioară salvată — completează echipele de mai jos manual.'
      }
    }
    function openNewMonthModal() {
      const store = loadStore()
      const { monthIdx, year } = defaultNewMonthTarget(store)
      els.newMonthMonth.value = String(monthIdx)
      els.newMonthYear.value = String(year)
      const keys = sortedMonthKeys(store)
      const latestData = keys.length ? store[keys[keys.length - 1]] : null
      els.newMonthShift1.value = latestData?.config?.shift1Target != null ? String(latestData.config.shift1Target) : ''
      els.newMonthShift2.value = latestData?.config?.shift2Target != null ? String(latestData.config.shift2Target) : ''
      renderNewMonthDays()
      els.newMonthModal.style.display = 'flex'
    }
    els.newMonthBtn.addEventListener('click', openNewMonthModal)
    els.newMonthMonth.addEventListener('change', renderNewMonthDays)
    els.newMonthYear.addEventListener('change', renderNewMonthDays)
    $<HTMLButtonElement>('newMonthCancel').addEventListener('click', () => { els.newMonthModal.style.display = 'none' })
    els.newMonthModal.addEventListener('click', (e) => { if (e.target === els.newMonthModal) els.newMonthModal.style.display = 'none' })
    $<HTMLButtonElement>('newMonthSave').addEventListener('click', () => {
      const monthIdx = Number(els.newMonthMonth.value)
      const year = Number(els.newMonthYear.value)
      if (!year || year < 2000 || year > 2100) { showError('Anul introdus pentru luna nouă nu este valid.'); return }
      const store = loadStore()
      const key = storeKeyForMonth(monthIdx, year)
      if (store[key] && !confirm(`Există deja o lună salvată pentru ${key}. O suprascrii?`)) return

      const s1 = els.newMonthShift1.value.trim()
      const s2 = els.newMonthShift2.value.trim()
      const shift1Target = s1 === '' ? null : parseFloat(s1)
      const shift2Target = s2 === '' ? null : parseFloat(s2)

      const numDays = new Date(year, monthIdx + 1, 0).getDate()
      const dayAssignments: { tura1: string; tura2: string }[] = []
      for (let zi = 1; zi <= numDays; zi++) {
        const sel1 = els.newMonthDays.querySelector<HTMLSelectElement>(`select[data-zi="${zi}"][data-shift="1"]`)
        const sel2 = els.newMonthDays.querySelector<HTMLSelectElement>(`select[data-zi="${zi}"][data-shift="2"]`)
        dayAssignments.push({ tura1: sel1?.value || 'Echipa 1', tura2: sel2?.value || 'Echipa 2' })
      }

      const keys = sortedMonthKeys(store)
      const latestData = keys.length ? store[keys[keys.length - 1]] : null
      const grila = latestData?.bonus?.grila || []

      const data = buildNewMonthSkeleton(monthIdx, year, shift1Target, shift2Target, grila, dayAssignments)
      store[key] = data
      saveStore(store)
      currentKey = key
      showError('')
      render(data)
      refreshMonthSelect()
      els.newMonthModal.style.display = 'none'
    })

    // ---------- init from storage ----------
    const store = loadStore()
    const keys = sortedMonthKeys(store)
    if (keys.length) {
      currentKey = keys[keys.length - 1]
      render(store[currentKey])
      refreshMonthSelect()
    }
  }, [])

  return (
    <div className="target-tool" ref={rootRef}>
      <style>{STYLE}</style>
      <div className="page">
        <header className="top">
          <div className="brand">
            <h1>🎯 Target Vânzări</h1>
            <span className="updated" id="updatedLabel"></span>
          </div>
          <div className="top-actions">
            <select id="monthSelect" style={{ display: 'none' }}></select>
            <button id="teamNamesBtn" style={{ display: 'none' }} title="Înlocuiește «Echipa 1», «Echipa 2» etc. cu numele gestionarilor">✎ Nume echipe</button>
            <button id="newMonthBtn" className="btn-primary" title="Creează scheletul (targete + rotație echipe) pentru o lună nouă, fără fișier Excel">+ Lună nouă</button>
            <button id="printBtn" title="Printează / exportă PDF">🖨 Printează</button>
            <button id="backupBtn" title="Descarcă o copie de siguranță a tuturor lunilor salvate">⬇ Backup</button>
            <label className="btn" htmlFor="restoreInput" title="Încarcă o copie de siguranță salvată anterior">⬆ Restaurează</label>
            <input type="file" id="restoreInput" accept=".json" style={{ display: 'none' }} />
            <button id="deleteMonthBtn" className="danger" style={{ display: 'none' }} title="Șterge luna curentă">Șterge luna</button>
            <label className="btn btn-primary" htmlFor="fileInput">⬆ Încarcă Excel</label>
            <input type="file" id="fileInput" accept=".xlsx,.xls" />
          </div>
        </header>

        <div id="errorBox"></div>
        <div id="warnBox"></div>

        <div id="emptyState">
          <div className="icon">📊</div>
          <h2>Niciun fișier încărcat încă</h2>
          <p>
            Începe cu șablonul lunar (foile „Rezumat", „Target Zilnic", „Bonusare") — stabilește targetele și rotația
            echipelor. După aceea poți încărca oricând un export de vânzări brute (cu coloanele Casier, Creat La,
            Valoare Totală) ca să actualizezi situația — aplicația recunoaște singură ce fel de fișier e. Totul se
            procesează local, în browser — nimic nu e trimis pe server.
          </p>
          <label className="btn btn-primary" htmlFor="fileInput">⬆ Alege fișier Excel</label>
        </div>

        <main id="dashboard">
          <section className="card" id="heroCard"></section>
          <section className="card" id="todayCard" style={{ display: 'none' }}></section>
          <section>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.02em', margin: '0 0 12px' }}>
              Situație pe echipă
            </h3>
            <div className="team-grid" id="teamGrid"></div>
          </section>
          <section className="card" id="bonusCard"></section>
          <section className="card" id="chartCard"></section>
          <section className="card" id="dailyCard"></section>
          <details className="card" id="trackerCard">
            <summary>Detalii pe tură</summary>
            <div className="table-scroll" id="trackerTableWrap"></div>
          </details>
          <section className="card" id="historyCard" style={{ display: 'none' }}></section>
        </main>

        <footer className="note">
          Fișierul se procesează integral local, în acest browser. Datele rămân salvate în acest browser
          (localStorage) pentru a reapărea la următoarea vizită.
        </footer>
      </div>

      <div className="modal-overlay" id="editDayModal" style={{ display: 'none' }}>
        <div className="modal-card">
          <h3 id="editDayTitle">Editare zi</h3>
          <label>
            Tura 1 (RON)
            <input type="number" id="editTura1" step="0.01" inputMode="decimal" />
          </label>
          <label>
            Tura 2 (RON)
            <input type="number" id="editTura2" step="0.01" inputMode="decimal" />
          </label>
          <div className="modal-actions">
            <button id="editDayCancel">Anulează</button>
            <button id="editDaySave" className="btn-primary">Salvează</button>
          </div>
        </div>
      </div>

      <div className="modal-overlay" id="teamNamesModal" style={{ display: 'none' }}>
        <div className="modal-card">
          <h3>Nume echipe</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px' }}>
            Înlocuiește „Echipa 1”, „Echipa 2” etc. cu numele reale ale gestionarilor — apare peste tot în pagină
            (evoluție zilnică, detalii pe tură, situație pe echipă, bonusare). Lasă gol ca să rămână eticheta
            implicită.
          </p>
          <div id="teamNamesFields"></div>
          <div className="modal-actions">
            <button id="teamNamesCancel">Anulează</button>
            <button id="teamNamesSave" className="btn-primary">Salvează</button>
          </div>
        </div>
      </div>

      <div className="modal-overlay" id="newMonthModal" style={{ display: 'none' }}>
        <div className="modal-card wide">
          <h3>Lună nouă</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            Creează scheletul lunii — targete și rotația echipelor pe zile — fără să fie nevoie de un fișier Excel.
            Rotația se continuă automat din ultima lună salvată (tipar fix), iar tu poți corecta orice zi mai jos
            înainte de a salva.
          </p>
          <div className="new-month-row">
            <label>
              Lună
              <select id="newMonthMonth">
                {MONTH_NAMES_RO.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              An
              <input type="number" id="newMonthYear" step="1" />
            </label>
            <label>
              Target tură 1 (RON/zi)
              <input type="number" id="newMonthShift1" step="0.01" inputMode="decimal" />
            </label>
            <label>
              Target tură 2 (RON/zi)
              <input type="number" id="newMonthShift2" step="0.01" inputMode="decimal" />
            </label>
          </div>
          <div className="new-month-note" id="newMonthNote"></div>
          <div className="new-month-days" id="newMonthDays"></div>
          <div className="modal-actions">
            <button id="newMonthCancel">Anulează</button>
            <button id="newMonthSave" className="btn-primary">Salvează luna</button>
          </div>
        </div>
      </div>
    </div>
  )
}
