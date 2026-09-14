import ExcelJS from 'exceljs'

export async function downloadSimpleTable(
  filename: string,
  sheetTitle: string,
  headers: string[],
  rows: (string | number)[][],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()
  const ws = wb.addWorksheet(sheetTitle)
  ws.columns = headers.map(() => ({ width: 18 }))
  const headerRow = ws.addRow(headers)
  headerRow.font = { name: 'Calibri', size: 10, bold: true }
  for (const r of rows) ws.addRow(r)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
