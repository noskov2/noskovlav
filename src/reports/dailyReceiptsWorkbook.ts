import ExcelJS from 'exceljs'
import type { DailyReceiptsData } from '@/reports/dailyReceiptsData'

// Styling reverse-engineered cell-by-cell from the station's own
// "Raport bonuri" workbook so the generated file matches it 1:1.

const INT_FMT = '#,##0'

function styleCell(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fmt?: string; fill?: string; color?: string } = {},
) {
  cell.font = { name: 'Calibri', size: opts.size ?? 10, bold: opts.bold ?? false, color: opts.color ? { argb: opts.color } : undefined }
  cell.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle' }
  if (opts.fmt) cell.numFmt = opts.fmt
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
}

export async function buildDailyReceiptsWorkbook(data: DailyReceiptsData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()

  const ws = wb.addWorksheet('Bonuri Zilnice')
  ws.columns = [{ width: 13 }, { width: 15 }, { width: 13 }, { width: 10 }, { width: 13 }, { width: 10 }]

  ws.mergeCells('A1:F1')
  const title = ws.getCell('A1')
  title.value = data.title
  title.font = { name: 'Calibri', size: 14, bold: true }
  title.alignment = { horizontal: 'center', vertical: 'middle' }

  const headerRow = 3
  ;['Data', 'Combustibil', 'Marfă', 'Mixt', 'Total Bonuri', '% Mixt'].forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1)
    cell.value = h
    styleCell(cell, { bold: true })
  })

  let r = headerRow + 1
  const firstDataRow = r
  for (const row of data.rows) {
    styleCell(ws.getCell(r, 1), { align: 'left' })
    ws.getCell(r, 1).value = row.dateLabel
    styleCell(ws.getCell(r, 2), {})
    ws.getCell(r, 2).value = row.fuelOnly
    styleCell(ws.getCell(r, 3), {})
    ws.getCell(r, 3).value = row.goodsOnly
    styleCell(ws.getCell(r, 4), {})
    ws.getCell(r, 4).value = row.mixed
    styleCell(ws.getCell(r, 5), { bold: true })
    ws.getCell(r, 5).value = { formula: `SUM(B${r}:D${r})` }
    styleCell(ws.getCell(r, 6), {})
    ws.getCell(r, 6).value = { formula: `ROUND(D${r}/E${r}*100,1)&"%"` }
    r++
  }
  const lastDataRow = r - 1

  const totalFill = 'FF2E75B6'
  const avgFill = 'FFBDD7EE'
  const maxFill = 'FFE2EFDA'

  styleCell(ws.getCell(r, 1), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 2), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 2).value = { formula: `SUM(B${firstDataRow}:B${lastDataRow})` }
  styleCell(ws.getCell(r, 3), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` }
  styleCell(ws.getCell(r, 4), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 4).value = { formula: `SUM(D${firstDataRow}:D${lastDataRow})` }
  styleCell(ws.getCell(r, 5), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 5).value = { formula: `SUM(E${firstDataRow}:E${lastDataRow})` }
  styleCell(ws.getCell(r, 6), { bold: true, fill: totalFill, color: 'FFFFFFFF' })
  ws.getCell(r, 6).value = { formula: `ROUND(D${r}/E${r}*100,1)&"%"` }
  const totalRow = r
  r++

  styleCell(ws.getCell(r, 1), { bold: true, fill: avgFill })
  ws.getCell(r, 1).value = 'MEDIE/ZI'
  styleCell(ws.getCell(r, 2), { bold: true, fill: avgFill })
  ws.getCell(r, 2).value = { formula: `ROUND(AVERAGE(B${firstDataRow}:B${lastDataRow}),1)` }
  styleCell(ws.getCell(r, 3), { bold: true, fill: avgFill })
  ws.getCell(r, 3).value = { formula: `ROUND(AVERAGE(C${firstDataRow}:C${lastDataRow}),1)` }
  styleCell(ws.getCell(r, 4), { bold: true, fill: avgFill })
  ws.getCell(r, 4).value = { formula: `ROUND(AVERAGE(D${firstDataRow}:D${lastDataRow}),1)` }
  styleCell(ws.getCell(r, 5), { bold: true, fill: avgFill })
  ws.getCell(r, 5).value = { formula: `ROUND(AVERAGE(E${firstDataRow}:E${lastDataRow}),1)` }
  r++

  styleCell(ws.getCell(r, 1), { bold: true, fill: maxFill })
  ws.getCell(r, 1).value = 'ZI MAX'
  styleCell(ws.getCell(r, 2), { bold: true, fill: maxFill })
  ws.getCell(r, 2).value = { formula: `MAX(B${firstDataRow}:B${lastDataRow})` }
  styleCell(ws.getCell(r, 3), { bold: true, fill: maxFill })
  ws.getCell(r, 3).value = { formula: `MAX(C${firstDataRow}:C${lastDataRow})` }
  styleCell(ws.getCell(r, 4), { bold: true, fill: maxFill })
  ws.getCell(r, 4).value = { formula: `MAX(D${firstDataRow}:D${lastDataRow})` }
  styleCell(ws.getCell(r, 5), { bold: true, fill: maxFill })
  ws.getCell(r, 5).value = { formula: `MAX(E${firstDataRow}:E${lastDataRow})` }

  for (let col = 2; col <= 5; col++) {
    for (let row = firstDataRow; row <= totalRow + 2; row++) {
      ws.getCell(row, col).numFmt = INT_FMT
    }
  }

  return wb
}

export async function downloadDailyReceiptsReport(data: DailyReceiptsData): Promise<void> {
  const wb = await buildDailyReceiptsWorkbook(data)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Raport_bonuri_${data.monthLabelText.replace(' ', '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
