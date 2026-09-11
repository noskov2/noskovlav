import ExcelJS from 'exceljs'
import type { ReorderRow } from '@/kpi/reorderRecommendations'
import { formatDateRo } from '@/lib/format'

export async function buildReorderListWorkbook(supplier: string, rows: ReorderRow[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()

  const ws = wb.addWorksheet('Comandă')
  ws.columns = [{ width: 40 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 }]

  ws.mergeCells('A1:E1')
  const title = ws.getCell('A1')
  title.value = `Listă comandă — ${supplier}`
  title.font = { name: 'Calibri', size: 14, bold: true }
  title.alignment = { horizontal: 'left', vertical: 'middle' }

  const headerRow = 3
  ;['Produs', 'Cantitate recomandată', 'Stoc curent', 'Vânzare medie/zi', 'Următoarea livrare'].forEach((h, i) => {
    const cell = ws.getCell(headerRow, i + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 10, bold: true }
    cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle' }
  })

  let r = headerRow + 1
  for (const row of rows) {
    ws.getCell(r, 1).value = row.product.name
    ws.getCell(r, 2).value = row.recommendedQty
    ws.getCell(r, 3).value = row.currentStock
    ws.getCell(r, 4).value = Math.round(row.avgPerDay * 100) / 100
    ws.getCell(r, 5).value = formatDateRo(row.nextDeliveryDate)
    for (let col = 2; col <= 4; col++) ws.getCell(r, col).alignment = { horizontal: 'center' }
    r++
  }

  return wb
}

export async function downloadReorderList(supplier: string, rows: ReorderRow[]): Promise<void> {
  const wb = await buildReorderListWorkbook(supplier, rows)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Comanda_${supplier.replace(/[^\p{L}\p{N}]+/gu, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
