import ExcelJS from 'exceljs'
import type { MonthlyReportData } from '@/reports/monthlyReportData'

// Styling reverse-engineered cell-by-cell from the station's own
// "Statistici vânzări PECO" workbook, so a generated report is a 1:1 match:
// Arial throughout except the big Calibri title, thin borders on every
// table cell, banded rows + dark header bars on the "Top Produse" sheets.

const LEI_FMT = '#,##0.00" lei"'
const INT_FMT = '#,##0'
const QTY4_FMT = '#,##0.0000'
const PCT_FMT = '0.00%'

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  left: { style: 'thin' },
  right: { style: 'thin' },
  top: { style: 'thin' },
  bottom: { style: 'thin' },
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    bold?: boolean
    size?: number
    font?: string
    align?: 'left' | 'center' | 'right'
    fmt?: string
    fill?: string
    color?: string
  } = {},
) {
  cell.font = {
    name: opts.font ?? 'Arial',
    size: opts.size ?? 10,
    bold: opts.bold ?? false,
    color: opts.color ? { argb: opts.color } : undefined,
  }
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle' }
  if (opts.fmt) cell.numFmt = opts.fmt
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
  cell.border = THIN_BORDER
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, span: number, text: string) {
  ws.mergeCells(row, 1, row, span)
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size: 13, bold: true }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(row).height = 16.5
}

function tableHeader(ws: ExcelJS.Worksheet, row: number, headers: string[], aligns?: ('left' | 'center' | 'right')[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    styleCell(cell, { bold: true, size: 11, align: aligns?.[i] ?? (i === 0 ? 'left' : 'right') })
  })
}

function darkTableHeader(ws: ExcelJS.Worksheet, row: number, headers: string[], aligns: ('left' | 'center' | 'right')[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    styleCell(cell, { bold: true, align: aligns[i], fill: 'FF2D2D2D', color: 'FFFFFFFF' })
  })
}

function buildRezumat(wb: ExcelJS.Workbook, data: MonthlyReportData) {
  const ws = wb.addWorksheet('Rezumat')
  ws.columns = [{ width: 32 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 22 }, { width: 13 }]

  ws.mergeCells('A1:F1')
  const title = ws.getCell('A1')
  title.value = data.title
  title.font = { name: 'Calibri', size: 30, bold: true }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 36

  let r = 3
  const kpiCell = ws.getCell(r, 1)
  kpiCell.value = 'INDICATORI CHEIE'
  styleCell(kpiCell, { bold: true })
  r++

  const kpis: [string, number | string, string | undefined][] = [
    ['Total Vânzări (cu TVA)', data.totalSales, LEI_FMT],
    ['Nr. Tranzacții Unice', data.uniqueTransactions, INT_FMT],
    ['Nr. Articole Vândute', `${Math.round(data.itemsSoldExclFuelSgr)} (fara carb. si sgr.)`, undefined],
    ['Valoare Medie/Tranzacție', data.avgPerTransaction, LEI_FMT],
    ['Zile Operaționale', data.operationalDays, INT_FMT],
    ['Valoare Medie/Zi', data.avgPerDay, LEI_FMT],
  ]
  for (const [label, value, fmt] of kpis) {
    styleCell(ws.getCell(r, 1), {})
    ws.getCell(r, 1).value = label
    const vc = ws.getCell(r, 2)
    vc.value = value
    styleCell(vc, { align: typeof value === 'number' ? 'right' : 'left', fmt })
    r++
  }

  r += 2 // blank row before next section (row 12 in the reference file)
  const weekdayTitleRow = r
  sectionTitle(ws, weekdayTitleRow, 6, `  VÂNZĂRI PER ZILE ALE SĂPTĂMÂNII — ${data.monthLabelText}`)
  r++
  tableHeader(ws, r, ['Zi Săptămână', 'Valoare Totală (lei)', 'Nr. Tranzacții', 'Nr. Zile', 'Valoare Medie/Zi (lei)', '% din Total'])
  r++
  const weekdayFirstDataRow = r
  for (const w of data.byWeekday) {
    styleCell(ws.getCell(r, 1), { bold: true })
    ws.getCell(r, 1).value = w.name
    styleCell(ws.getCell(r, 2), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 2).value = w.value
    styleCell(ws.getCell(r, 3), { align: 'right', fmt: INT_FMT })
    ws.getCell(r, 3).value = w.transactions
    styleCell(ws.getCell(r, 4), { align: 'right', fmt: INT_FMT })
    ws.getCell(r, 4).value = w.days
    styleCell(ws.getCell(r, 5), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 5).value = w.avgPerDay
    styleCell(ws.getCell(r, 6), { align: 'right', fmt: PCT_FMT })
    ws.getCell(r, 6).value = w.pct
    r++
  }
  const weekdayLastDataRow = r - 1
  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 2), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 2).value = { formula: `SUM(B${weekdayFirstDataRow}:B${weekdayLastDataRow})` }
  styleCell(ws.getCell(r, 3), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 3).value = { formula: `SUM(C${weekdayFirstDataRow}:C${weekdayLastDataRow})` }
  styleCell(ws.getCell(r, 4), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 4).value = { formula: `SUM(D${weekdayFirstDataRow}:D${weekdayLastDataRow})` }
  styleCell(ws.getCell(r, 5), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 5).value = data.operationalDays > 0 ? data.totalSales / data.operationalDays : 0
  styleCell(ws.getCell(r, 6), { bold: true, align: 'right', fmt: PCT_FMT })
  ws.getCell(r, 6).value = 1
  r += 2

  const catTitleRow = r
  ws.mergeCells(catTitleRow, 1, catTitleRow, 5)
  const catTitleCell = ws.getCell(catTitleRow, 1)
  catTitleCell.value = `  VÂNZĂRI PER CATEGORIE — ${data.monthLabelText}`
  catTitleCell.font = { name: 'Arial', size: 13, bold: true }
  catTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(catTitleRow).height = 16.5
  r++
  tableHeader(ws, r, ['Categorie', 'Valoare Totală (lei)', 'Nr. Tranzacții', 'Cant. Vândută', '% din Total'])
  r++
  const catFirstDataRow = r
  for (const c of data.byCategory) {
    styleCell(ws.getCell(r, 1), {})
    ws.getCell(r, 1).value = c.category
    styleCell(ws.getCell(r, 2), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 2).value = c.value
    styleCell(ws.getCell(r, 3), { align: 'right', fmt: INT_FMT })
    ws.getCell(r, 3).value = c.transactions
    styleCell(ws.getCell(r, 4), { align: 'right', fmt: QTY4_FMT })
    ws.getCell(r, 4).value = c.quantity
    styleCell(ws.getCell(r, 5), { align: 'right', fmt: PCT_FMT })
    ws.getCell(r, 5).value = c.pct
    r++
  }
  const catLastDataRow = r - 1
  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 2), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 2).value = { formula: `SUM(B${catFirstDataRow}:B${catLastDataRow})` }
  styleCell(ws.getCell(r, 3), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 3).value = { formula: `SUM(C${catFirstDataRow}:C${catLastDataRow})` }
  styleCell(ws.getCell(r, 4), { bold: true, align: 'right', fmt: QTY4_FMT })
  ws.getCell(r, 4).value = { formula: `SUM(D${catFirstDataRow}:D${catLastDataRow})` }
  styleCell(ws.getCell(r, 5), { bold: true, align: 'right', fmt: PCT_FMT })
  ws.getCell(r, 5).value = 1
}

function buildTopProducts(
  wb: ExcelJS.Workbook,
  sheetName: string,
  titleText: string,
  rows: MonthlyReportData['topProducts'],
  totalRow: { quantity: number; value: number; pct: number } | null,
) {
  const ws = wb.addWorksheet(sheetName)
  ws.columns = [{ width: 14 }, { width: 46 }, { width: 34 }, { width: 15 }, { width: 19 }, { width: 12 }]

  ws.mergeCells('A1:F1')
  const title = ws.getCell('A1')
  title.value = `  ${titleText}`
  styleCell(title, { bold: true, size: 13, align: 'center', fill: 'FF000000', color: 'FFFFFFFF' })
  ws.getRow(1).height = 16.5

  darkTableHeader(ws, 2, ['#', 'Produs', 'Categorie', 'Cant. Vândută', 'Valoare Totală (lei)', '% din Total'], [
    'left', 'left', 'left', 'center', 'right', 'right',
  ])

  let r = 3
  rows.forEach((p, i) => {
    const band = i % 2 === 0 ? 'FFF0F0F0' : 'FFFFFFFF'
    styleCell(ws.getCell(r, 1), { align: 'left', fill: band })
    ws.getCell(r, 1).value = p.rank
    styleCell(ws.getCell(r, 2), { align: 'left', fill: band })
    ws.getCell(r, 2).value = p.name
    styleCell(ws.getCell(r, 3), { align: 'left', fill: band })
    ws.getCell(r, 3).value = p.category
    styleCell(ws.getCell(r, 4), { align: 'center', fill: band, fmt: INT_FMT })
    ws.getCell(r, 4).value = p.quantity
    styleCell(ws.getCell(r, 5), { align: 'right', fill: band, fmt: LEI_FMT })
    ws.getCell(r, 5).value = p.value
    styleCell(ws.getCell(r, 6), { align: 'right', fill: band, fmt: PCT_FMT })
    ws.getCell(r, 6).value = p.pct
    r++
  })

  if (totalRow) {
    ws.getCell(r, 1).value = `TOTAL TOP ${rows.length}`
    styleCell(ws.getCell(r, 1), { bold: true, fill: 'FF1F1F1F', color: 'FFFFFFFF' })
    styleCell(ws.getCell(r, 2), { fill: 'FF1F1F1F', color: 'FFFFFFFF' })
    styleCell(ws.getCell(r, 3), { fill: 'FF1F1F1F', color: 'FFFFFFFF' })
    styleCell(ws.getCell(r, 4), { bold: true, align: 'center', fill: 'FF1F1F1F', color: 'FFFFFFFF', fmt: QTY4_FMT })
    ws.getCell(r, 4).value = totalRow.quantity
    styleCell(ws.getCell(r, 5), { bold: true, align: 'right', fill: 'FF1F1F1F', color: 'FFFFFFFF', fmt: LEI_FMT })
    ws.getCell(r, 5).value = totalRow.value
    styleCell(ws.getCell(r, 6), { bold: true, align: 'right', fill: 'FF1F1F1F', color: 'FFFFFFFF', fmt: PCT_FMT })
    ws.getCell(r, 6).value = totalRow.pct
  }
}

function buildDailyEvolution(wb: ExcelJS.Workbook, data: MonthlyReportData) {
  const ws = wb.addWorksheet('Evoluție Zilnică')
  ws.columns = [{ width: 12 }, { width: 16 }, { width: 22 }, { width: 18 }, { width: 22 }]

  sectionTitle(ws, 1, 5, `  EVOLUȚIE ZILNICĂ A VÂNZĂRILOR — ${data.monthLabelText}`)
  tableHeader(ws, 2, ['Data', 'Zi Săptămână', 'Valoare Totală (lei)', 'Nr. Tranzacții', 'Valoare Medie/Trz (lei)'])

  let r = 3
  const firstDataRow = r
  for (const d of data.dailyEvolution) {
    styleCell(ws.getCell(r, 1), {})
    ws.getCell(r, 1).value = d.dateLabel
    styleCell(ws.getCell(r, 2), {})
    ws.getCell(r, 2).value = d.weekday
    styleCell(ws.getCell(r, 3), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 3).value = d.value
    styleCell(ws.getCell(r, 4), { align: 'right', fmt: INT_FMT })
    ws.getCell(r, 4).value = d.transactions
    styleCell(ws.getCell(r, 5), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 5).value = d.avgPerTransaction
    r++
  }
  const lastDataRow = r - 1

  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 3), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` }
  styleCell(ws.getCell(r, 4), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 4).value = { formula: `SUM(D${firstDataRow}:D${lastDataRow})` }
  r++

  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'MEDIE'
  styleCell(ws.getCell(r, 3), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 3).value = data.dailyAverage.value
  styleCell(ws.getCell(r, 4), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 4).value = data.dailyAverage.transactions
  styleCell(ws.getCell(r, 5), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 5).value = data.dailyAverage.avgPerTransaction
}

function buildHourlyDistribution(wb: ExcelJS.Workbook, data: MonthlyReportData) {
  const ws = wb.addWorksheet('Distribuție Orară')
  ws.columns = [{ width: 20 }, { width: 22 }, { width: 18 }, { width: 22 }, { width: 14 }]

  sectionTitle(ws, 1, 5, `  DISTRIBUȚIE VÂNZĂRI PE ORE ALE ZILEI — ${data.monthLabelText}`)
  tableHeader(ws, 2, ['Ora', 'Valoare Totală (lei)', 'Nr. Tranzacții', 'Valoare Medie/Trz (lei)', '% din Total'])

  let r = 3
  const firstDataRow = r
  for (const h of data.hourlyDistribution) {
    styleCell(ws.getCell(r, 1), {})
    ws.getCell(r, 1).value = h.label
    styleCell(ws.getCell(r, 2), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 2).value = h.value
    styleCell(ws.getCell(r, 3), { align: 'right', fmt: INT_FMT })
    ws.getCell(r, 3).value = h.transactions
    styleCell(ws.getCell(r, 4), { align: 'right', fmt: LEI_FMT })
    ws.getCell(r, 4).value = h.avgPerTransaction
    styleCell(ws.getCell(r, 5), { align: 'right', fmt: PCT_FMT })
    ws.getCell(r, 5).value = h.pct
    r++
  }
  const lastDataRow = r - 1

  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 2), { bold: true, align: 'right', fmt: LEI_FMT })
  ws.getCell(r, 2).value = { formula: `SUM(B${firstDataRow}:B${lastDataRow})` }
  styleCell(ws.getCell(r, 3), { bold: true, align: 'right', fmt: INT_FMT })
  ws.getCell(r, 3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` }
  styleCell(ws.getCell(r, 5), { bold: true, align: 'right', fmt: PCT_FMT })
  ws.getCell(r, 5).value = 1
}

export async function buildMonthlyReportWorkbook(data: MonthlyReportData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()

  buildRezumat(wb, data)
  buildTopProducts(wb, 'Top Produse', `TOP PRODUSE — Valoare Vânzări (${data.monthLabelText})`, data.topProducts, data.topProductsTotal)
  buildTopProducts(
    wb,
    'Top Produse exceptie carb, tig',
    `TOP PRODUSE — Excl. Carburanți, Țigări (${data.monthLabelText})`,
    data.topProductsExcl,
    null,
  )
  buildDailyEvolution(wb, data)
  buildHourlyDistribution(wb, data)

  return wb
}

export async function downloadMonthlyReport(data: MonthlyReportData): Promise<void> {
  const wb = await buildMonthlyReportWorkbook(data)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Statistici_vanzari_Peco_${data.monthLabelText.replace(' ', '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
