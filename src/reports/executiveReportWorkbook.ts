import ExcelJS from 'exceljs'
import type { ExecutiveReportData } from '@/reports/executiveReportData'

const LEI_FMT = '#,##0.00" lei"'
const INT_FMT = '#,##0'
const PCT_FMT = '0.0"%"'

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  left: { style: 'thin' },
  right: { style: 'thin' },
  top: { style: 'thin' },
  bottom: { style: 'thin' },
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fmt?: string; fill?: string; color?: string } = {},
) {
  cell.font = { name: 'Arial', size: opts.size ?? 10, bold: opts.bold ?? false, color: opts.color ? { argb: opts.color } : undefined }
  cell.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', wrapText: true }
  if (opts.fmt) cell.numFmt = opts.fmt
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
  cell.border = THIN_BORDER
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, span: number, text: string) {
  ws.mergeCells(row, 1, row, span)
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Arial', size: 13, bold: true }
  cell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(row).height = 18
}

function kpiRow(ws: ExcelJS.Worksheet, row: number, label: string, value: number | string, fmt?: string) {
  styleCell(ws.getCell(row, 1), { bold: true })
  ws.getCell(row, 1).value = label
  styleCell(ws.getCell(row, 2), { align: 'right', fmt })
  ws.getCell(row, 2).value = value
}

function bulletList(ws: ExcelJS.Worksheet, startRow: number, span: number, items: string[]): number {
  let row = startRow
  if (items.length === 0) {
    styleCell(ws.getCell(row, 1), {})
    ws.mergeCells(row, 1, row, span)
    ws.getCell(row, 1).value = '— niciuna identificată —'
    return row + 1
  }
  for (const item of items) {
    ws.mergeCells(row, 1, row, span)
    styleCell(ws.getCell(row, 1), {})
    ws.getCell(row, 1).value = `• ${item}`
    row++
  }
  return row
}

export async function buildExecutiveReportWorkbook(data: ExecutiveReportData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()

  const ws = wb.addWorksheet('Executive Report')
  ws.columns = [{ width: 42 }, { width: 20 }, { width: 20 }, { width: 20 }]

  let row = 1
  sectionTitle(ws, row, 4, `Executive Monthly Report — ${data.monthLabelText}`)
  row += 2

  sectionTitle(ws, row, 4, 'Cum a mers luna?')
  row++
  kpiRow(ws, row++, 'Vânzări totale', data.summary.totalSales, LEI_FMT)
  if (data.target?.totalSales != null) kpiRow(ws, row++, 'Target vânzări', data.target.totalSales, LEI_FMT)
  kpiRow(ws, row++, 'Marfă', data.summary.goodsSales, LEI_FMT)
  kpiRow(ws, row++, 'Profit brut estimat', data.summary.grossProfitEstimate, LEI_FMT)
  kpiRow(
    ws,
    row++,
    'Marjă %',
    data.summary.totalSales > 0 ? (data.summary.grossProfitEstimate / data.summary.totalSales) * 100 : 0,
    PCT_FMT,
  )
  kpiRow(ws, row++, 'Bonuri', data.summary.receiptCount, INT_FMT)
  kpiRow(ws, row++, 'Bon mediu', data.summary.avgReceiptValue, LEI_FMT)
  kpiRow(ws, row++, 'Litri', data.summary.totalLiters, INT_FMT)
  kpiRow(ws, row++, 'Cross-sell %', data.summary.crossSellPct, PCT_FMT)
  kpiRow(ws, row++, 'Cafele', data.summary.coffeeCount, INT_FMT)
  kpiRow(ws, row++, 'Sandwich-uri', data.summary.sandwichCount, INT_FMT)
  row++

  sectionTitle(ws, row, 4, `Comparație cu luna anterioară (${data.prevMonthLabel})`)
  row++
  if (data.vsPrevMonth) {
    kpiRow(ws, row++, 'Vânzări — diferență', `${data.vsPrevMonth.totalSales.pct?.toFixed(1) ?? '—'}%`)
    kpiRow(ws, row++, 'Profit — diferență', `${data.vsPrevMonth.grossProfit.pct?.toFixed(1) ?? '—'}%`)
    kpiRow(ws, row++, 'Cross-sell — diferență (pp)', (data.vsPrevMonth.crossSellPct.abs).toFixed(1))
    kpiRow(ws, row++, 'Bon mediu — diferență', `${data.vsPrevMonth.avgReceiptValue.pct?.toFixed(1) ?? '—'}%`)
  } else {
    styleCell(ws.getCell(row, 1), {})
    ws.getCell(row, 1).value = 'Nu există date pentru luna anterioară.'
    row++
  }
  row++

  sectionTitle(ws, row, 4, `Comparație cu aceeași lună anul precedent (${data.prevYearLabel})`)
  row++
  if (data.vsPrevYear) {
    kpiRow(ws, row++, 'Vânzări — diferență', `${data.vsPrevYear.totalSales.pct?.toFixed(1) ?? '—'}%`)
    kpiRow(ws, row++, 'Profit — diferență', `${data.vsPrevYear.grossProfit.pct?.toFixed(1) ?? '—'}%`)
  } else {
    styleCell(ws.getCell(row, 1), {})
    ws.getCell(row, 1).value = 'Nu există date importate pentru aceeași lună anul precedent.'
    row++
  }
  row++

  sectionTitle(ws, row, 4, 'Top creșteri (vs. luna anterioară)')
  row++
  if (data.topGrowth.length === 0) {
    styleCell(ws.getCell(row, 1), {})
    ws.getCell(row, 1).value = '— niciuna —'
    row++
  } else {
    for (const p of data.topGrowth) {
      styleCell(ws.getCell(row, 1), {})
      ws.getCell(row, 1).value = p.name
      styleCell(ws.getCell(row, 2), { align: 'right', fmt: LEI_FMT })
      ws.getCell(row, 2).value = p.currentValue
      styleCell(ws.getCell(row, 3), { align: 'right', fmt: '+#,##0.00" lei";-#,##0.00" lei"' })
      ws.getCell(row, 3).value = p.deltaAbs
      row++
    }
  }
  row++

  sectionTitle(ws, row, 4, 'Top scăderi (vs. luna anterioară)')
  row++
  if (data.topDecline.length === 0) {
    styleCell(ws.getCell(row, 1), {})
    ws.getCell(row, 1).value = '— niciuna —'
    row++
  } else {
    for (const p of data.topDecline) {
      styleCell(ws.getCell(row, 1), {})
      ws.getCell(row, 1).value = p.name
      styleCell(ws.getCell(row, 2), { align: 'right', fmt: LEI_FMT })
      ws.getCell(row, 2).value = p.currentValue
      styleCell(ws.getCell(row, 3), { align: 'right', fmt: '+#,##0.00" lei";-#,##0.00" lei"' })
      ws.getCell(row, 3).value = p.deltaAbs
      row++
    }
  }
  row++

  sectionTitle(ws, row, 4, 'Probleme identificate')
  row++
  row = bulletList(ws, row, 4, data.problems)
  row++

  sectionTitle(ws, row, 4, 'Oportunități identificate')
  row++
  row = bulletList(ws, row, 4, data.opportunities)
  row++

  sectionTitle(ws, row, 4, 'Recomandări pentru luna următoare')
  row++
  row = bulletList(ws, row, 4, data.recommendations)
  row++

  ws.mergeCells(row, 1, row, 4)
  styleCell(ws.getCell(row, 1), { size: 8, color: 'FF94A3B8' })
  ws.getCell(row, 1).value =
    'Notă: problemele/oportunitățile de mai sus sunt generate automat din datele importate (praguri fixe, comparații), nu sunt explicații cauzale — verifică-le înainte de a acționa.'

  return wb
}

export async function downloadExecutiveReport(data: ExecutiveReportData): Promise<void> {
  const wb = await buildExecutiveReportWorkbook(data)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Executive_Report_${data.monthLabelText.replace(' ', '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
