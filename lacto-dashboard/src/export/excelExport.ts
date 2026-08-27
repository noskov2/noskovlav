import * as XLSX from 'xlsx'
import { computeAggregate } from '../analytics/aggregate'
import { computeAlerts } from '../analytics/alerts'
import type { Alert } from '../analytics/alerts'
import type { ComparedRow } from '../analytics/compare'
import { mergeWithComparison } from '../analytics/compare'
import type { GlobalFilters } from '../analytics/filters'
import { formatDate } from '../lib/ro-format'
import { formatPeriodLabel } from '../lib/periods'

/**
 * Export Excel (spec §31). Ediția community a `xlsx` (SheetJS) nu suportă
 * stilizare de celule la scriere — coloanele monetare/procentuale sunt scrise
 * ca numere simple (fără formatare condiționată de culoare), o limitare
 * documentată, nu simulată.
 */

export interface ExportColumn {
  key: keyof ComparedRow | 'avgPrice'
  label: string
}

const ALL_COLUMNS: ExportColumn[] = [
  { key: 'value', label: 'Valoare' },
  { key: 'quantity', label: 'Cantitate' },
  { key: 'count', label: 'Tranzacții' },
  { key: 'distinctClients', label: 'Clienți' },
  { key: 'avgPrice', label: 'Preț mediu' },
  { key: 'share', label: 'Pondere %' },
  { key: 'diffValue', label: 'Diferență' },
  { key: 'diffPercent', label: 'Diferență %' },
]

function rowToRecord(r: ComparedRow, nameLabel: string, columns: ExportColumn[]): Record<string, unknown> {
  const record: Record<string, unknown> = { [nameLabel]: r.name }
  for (const col of columns) {
    if (col.key === 'avgPrice') {
      record[col.label] = r.quantity > 0 ? Number((r.value / r.quantity).toFixed(2)) : null
    } else if (col.key === 'share') {
      record[col.label] = Number(r.share.toFixed(2))
    } else {
      const v = r[col.key] as number | null
      record[col.label] = v === null ? null : v
    }
  }
  return record
}

export function breakdownToSheet(rows: ComparedRow[], nameLabel: string, columns: ExportColumn[] = ALL_COLUMNS) {
  return XLSX.utils.json_to_sheet(rows.map((r) => rowToRecord(r, nameLabel, columns)))
}

/** Exportă exact tabelul curent din Generatorul de rapoarte (spec §31: „raport curent"). */
export function exportCurrentReport(rows: ComparedRow[], nameLabel: string, columns: ExportColumn[], reportTitle: string) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, breakdownToSheet(rows, nameLabel, columns), reportTitle.slice(0, 31) || 'Raport')
  XLSX.writeFile(wb, `${reportTitle || 'raport'}.xlsx`)
}

function alertsToSheet(alerts: Alert[]) {
  const SEVERITY_LABEL: Record<Alert['severity'], string> = { red: 'Critic', amber: 'Atenție', green: 'Info' }
  return XLSX.utils.json_to_sheet(
    alerts.map((a) => ({ Severitate: SEVERITY_LABEL[a.severity], Mesaj: a.message })),
  )
}

/** Executive Report (spec §31): un singur fișier Excel cu toate secțiunile principale. */
export async function exportExecutiveReport(filters: GlobalFilters): Promise<void> {
  const [result, comparison, alerts] = await Promise.all([
    computeAggregate(filters),
    filters.comparisonPeriod ? computeAggregate({ ...filters, period: filters.comparisonPeriod }) : Promise.resolve(null),
    computeAlerts(filters),
  ])

  const wb = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.json_to_sheet([
    { Indicator: 'Perioadă', Valoare: formatPeriodLabel(filters.period) },
    { Indicator: 'Comparație', Valoare: filters.comparisonPeriod ? formatPeriodLabel(filters.comparisonPeriod) : '—' },
    { Indicator: 'Generat la', Valoare: formatDate(new Date().toISOString().slice(0, 10)) },
    { Indicator: 'Total vânzări (lei)', Valoare: Number(result.totalValue.toFixed(2)) },
    { Indicator: 'Cantitate totală', Valoare: Number(result.totalQuantity.toFixed(2)) },
    { Indicator: 'Nr. tranzacții', Valoare: result.transactionCount },
    { Indicator: 'Clienți distincți', Valoare: result.distinctClients },
    { Indicator: 'Produse distincte', Valoare: result.distinctProducts },
    { Indicator: 'Valoare medie / tranzacție', Valoare: Number(result.avgValuePerTransaction.toFixed(2)) },
    { Indicator: 'Preț mediu / unitate', Valoare: result.avgPricePerUnit !== null ? Number(result.avgPricePerUnit.toFixed(2)) : null },
  ])
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Rezumat')

  XLSX.utils.book_append_sheet(wb, breakdownToSheet(mergeWithComparison(result.byChannel, comparison?.byChannel ?? null, result.totalValue), 'Canal'), 'Canale')
  XLSX.utils.book_append_sheet(
    wb,
    breakdownToSheet(mergeWithComparison(result.byCategory, comparison?.byCategory ?? null, result.totalValue), 'Categorie'),
    'Categorii',
  )
  XLSX.utils.book_append_sheet(wb, breakdownToSheet(mergeWithComparison(result.byClient, comparison?.byClient ?? null, result.totalValue), 'Client'), 'Clienți')
  XLSX.utils.book_append_sheet(wb, breakdownToSheet(mergeWithComparison(result.byProduct, comparison?.byProduct ?? null, result.totalValue), 'Produs'), 'Produse')

  const monthlySheet = XLSX.utils.json_to_sheet(
    result.byMonth.map((m) => ({ An: m.year, Lună: m.month, Valoare: Number(m.value.toFixed(2)), Cantitate: Number(m.quantity.toFixed(2)), Tranzacții: m.count, Clienți: m.distinctClients })),
  )
  XLSX.utils.book_append_sheet(wb, monthlySheet, 'Evoluție lunară')

  XLSX.utils.book_append_sheet(wb, alertsToSheet(alerts), 'Alerte')

  XLSX.writeFile(wb, 'executive-report.xlsx')
}
