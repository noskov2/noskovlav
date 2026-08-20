import ExcelJS from 'exceljs'
import type { ProductAnalysisData } from '@/reports/productAnalysisData'
import { SANDWICH_VARIANT_LABELS } from '@/reports/productAnalysisData'

// Layout inspired by the station's own "Analiza produse" workbook (TURE /
// SANDWICH / CAFEA sections, one row per team) plus the new sections
// requested on top of it: Dulciuri Vitrină broken down per product, and
// Linii Promoții per team. Team colors are assigned once per team and kept
// stable across every section (the reference file cycled 3 colors per row
// inconsistently — here the same team always gets the same color, which
// makes it easier to track a team down the whole sheet).

const TEAM_PALETTE = ['FFFFFF00', 'FF92D050', 'FFBDD7EE', 'FFFFC7CE', 'FFD9D2E9', 'FFFCE4D6']
const INT_FMT = '#,##0'
const PCT_FMT = '0.0%'
const LEI_FMT = '#,##0.00" lei"'

function styleCell(
  cell: ExcelJS.Cell,
  opts: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right'; fmt?: string; fill?: string; color?: string } = {},
) {
  cell.font = { name: 'Calibri', size: opts.size ?? 10, bold: opts.bold ?? false, color: opts.color ? { argb: opts.color } : undefined }
  cell.alignment = { horizontal: opts.align ?? 'center', vertical: 'middle' }
  if (opts.fmt) cell.numFmt = opts.fmt
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, span: number, text: string) {
  ws.mergeCells(row, 1, row, span)
  const cell = ws.getCell(row, 1)
  cell.value = text
  cell.font = { name: 'Calibri', size: 12, bold: true }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

export async function buildProductAnalysisWorkbook(data: ProductAnalysisData): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PECO Dashboard'
  wb.created = new Date()

  const ws = wb.addWorksheet('Produse & Promoții')
  const colorOf = (teamId: string) => TEAM_PALETTE[data.teamIds.indexOf(teamId) % TEAM_PALETTE.length]

  const colCount = Math.max(9, data.vitrinaProducts.length > 0 ? data.teamIds.length + 2 : 9)
  ws.columns = Array.from({ length: colCount }, (_, i) => ({ width: i === 0 ? 26 : 15 }))

  let r = 1
  ws.mergeCells(r, 1, r, colCount)
  const title = ws.getCell(r, 1)
  title.value = data.title
  title.font = { name: 'Calibri', size: 14, bold: true }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  r += 2

  // ---- TURE ----
  sectionTitle(ws, r, 4, 'TURE')
  r++
  ;['Echipă', 'Dimineața', 'Seara', 'TOTAL'].forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    styleCell(c, { bold: true, align: i === 0 ? 'left' : 'center' })
  })
  r++
  for (const row of data.shifts) {
    const fill = colorOf(row.teamId)
    styleCell(ws.getCell(r, 1), { bold: true, align: 'left', fill })
    ws.getCell(r, 1).value = row.teamName
    styleCell(ws.getCell(r, 2), { fill, fmt: INT_FMT })
    ws.getCell(r, 2).value = row.morning
    styleCell(ws.getCell(r, 3), { fill, fmt: INT_FMT })
    ws.getCell(r, 3).value = row.evening
    styleCell(ws.getCell(r, 4), { bold: true, fill, fmt: INT_FMT })
    ws.getCell(r, 4).value = row.total
    r++
  }
  r += 2

  // ---- SANDWICH ----
  const sandwichKeys = Object.keys(SANDWICH_VARIANT_LABELS) as (keyof typeof SANDWICH_VARIANT_LABELS)[]
  sectionTitle(ws, r, sandwichKeys.length + 2, 'SANDWICH – TOTAL PERIOADA (buc)')
  r++
  ;['Echipă', ...sandwichKeys.map((k) => SANDWICH_VARIANT_LABELS[k]), 'TOTAL'].forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    styleCell(c, { bold: true, align: i === 0 ? 'left' : 'center' })
  })
  r++
  for (const row of data.sandwich) {
    const fill = colorOf(row.teamId)
    styleCell(ws.getCell(r, 1), { bold: true, align: 'left', fill })
    ws.getCell(r, 1).value = row.teamName
    sandwichKeys.forEach((k, i) => {
      styleCell(ws.getCell(r, i + 2), { fill, fmt: INT_FMT })
      ws.getCell(r, i + 2).value = row.values[k]
    })
    styleCell(ws.getCell(r, sandwichKeys.length + 2), { bold: true, fill, fmt: INT_FMT })
    ws.getCell(r, sandwichKeys.length + 2).value = row.total
    r++
  }
  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  sandwichKeys.forEach((k, i) => {
    styleCell(ws.getCell(r, i + 2), { bold: true, fmt: INT_FMT })
    ws.getCell(r, i + 2).value = data.sandwichTotals[k]
  })
  styleCell(ws.getCell(r, sandwichKeys.length + 2), { bold: true, fmt: INT_FMT })
  ws.getCell(r, sandwichKeys.length + 2).value = data.sandwich.reduce((s, row) => s + row.total, 0)
  r += 3

  // ---- CAFEA ----
  sectionTitle(ws, r, 5, 'CAFEA – TOTAL PERIOADA (buc)')
  r++
  ;['Echipă', 'Espresso Lung', 'Espresso', 'Cappuccino', 'TOTAL'].forEach((h, i) => {
    const c = ws.getCell(r, i + 1)
    c.value = h
    styleCell(c, { bold: true, align: i === 0 ? 'left' : 'center' })
  })
  r++
  for (const row of data.coffee) {
    const fill = colorOf(row.teamId)
    styleCell(ws.getCell(r, 1), { bold: true, align: 'left', fill })
    ws.getCell(r, 1).value = row.teamName
    styleCell(ws.getCell(r, 2), { fill, fmt: INT_FMT })
    ws.getCell(r, 2).value = row.espressoLung
    styleCell(ws.getCell(r, 3), { fill, fmt: INT_FMT })
    ws.getCell(r, 3).value = row.espresso
    styleCell(ws.getCell(r, 4), { fill, fmt: INT_FMT })
    ws.getCell(r, 4).value = row.cappuccino
    styleCell(ws.getCell(r, 5), { bold: true, fill, fmt: INT_FMT })
    ws.getCell(r, 5).value = row.total
    r++
  }
  styleCell(ws.getCell(r, 1), { bold: true })
  ws.getCell(r, 1).value = 'TOTAL'
  styleCell(ws.getCell(r, 2), { bold: true, fmt: INT_FMT })
  ws.getCell(r, 2).value = data.coffeeTotals.espressoLung
  styleCell(ws.getCell(r, 3), { bold: true, fmt: INT_FMT })
  ws.getCell(r, 3).value = data.coffeeTotals.espresso
  styleCell(ws.getCell(r, 4), { bold: true, fmt: INT_FMT })
  ws.getCell(r, 4).value = data.coffeeTotals.cappuccino
  styleCell(ws.getCell(r, 5), { bold: true, fmt: INT_FMT })
  ws.getCell(r, 5).value = data.coffeeTotals.total
  r += 3

  // ---- DULCIURI VITRINĂ, per product (new) ----
  const teamCols = data.teamIds.length
  sectionTitle(ws, r, teamCols + 2, 'DULCIURI VITRINĂ – CANTITATE VÂNDUTĂ PE PRODUS ȘI ECHIPĂ (buc)')
  r++
  if (data.vitrinaProducts.length === 0) {
    ws.getCell(r, 1).value = 'Niciun produs din categoria "Dulciuri Vitrină" nu are vânzări în această lună (sau categoria nu a fost încă mapată în Nomenclator → Grupuri pe categorie).'
    styleCell(ws.getCell(r, 1), { align: 'left' })
    r += 2
  } else {
    ;['Produs', ...data.teamIds.map((id) => data.teamNames[id]), 'TOTAL'].forEach((h, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = h
      styleCell(c, { bold: true, align: i === 0 ? 'left' : 'center' })
    })
    r++
    for (const p of data.vitrinaProducts) {
      styleCell(ws.getCell(r, 1), { align: 'left' })
      ws.getCell(r, 1).value = p.productName
      data.teamIds.forEach((id, i) => {
        styleCell(ws.getCell(r, i + 2), { fill: colorOf(id), fmt: INT_FMT })
        ws.getCell(r, i + 2).value = p.byTeam[id] ?? 0
      })
      styleCell(ws.getCell(r, teamCols + 2), { bold: true, fmt: INT_FMT })
      ws.getCell(r, teamCols + 2).value = p.total
      r++
    }
    styleCell(ws.getCell(r, 1), { bold: true })
    ws.getCell(r, 1).value = 'TOTAL'
    data.teamIds.forEach((id, i) => {
      styleCell(ws.getCell(r, i + 2), { bold: true, fmt: INT_FMT })
      ws.getCell(r, i + 2).value = data.vitrinaTeamTotals[id]
    })
    styleCell(ws.getCell(r, teamCols + 2), { bold: true, fmt: INT_FMT })
    ws.getCell(r, teamCols + 2).value = data.vitrinaProducts.reduce((s, p) => s + p.total, 0)
    r += 3
  }

  // ---- LINII PROMOȚII (new) ----
  sectionTitle(ws, r, 5, 'LINII PROMOȚII VÂNDUTE PE ECHIPĂ')
  r++
  if (!data.promoConfigured) {
    ws.getCell(r, 1).value = 'Grupul "Promoții" nu e încă mapat: în Nomenclator → Grupuri pe categorie, bifează ce categorie din exportul tău reprezintă liniile de promoție, ca să apară aici.'
    styleCell(ws.getCell(r, 1), { align: 'left' })
    r += 2
  } else {
    ;['Echipă', 'Linii Promoții', 'Valoare (lei)', 'Total Bonuri Echipă', '% din Total Bonuri'].forEach((h, i) => {
      const c = ws.getCell(r, i + 1)
      c.value = h
      styleCell(c, { bold: true, align: i === 0 ? 'left' : 'center' })
    })
    r++
    for (const row of data.promo) {
      const fill = colorOf(row.teamId)
      styleCell(ws.getCell(r, 1), { bold: true, align: 'left', fill })
      ws.getCell(r, 1).value = row.teamName
      styleCell(ws.getCell(r, 2), { fill, fmt: INT_FMT })
      ws.getCell(r, 2).value = row.lineCount
      styleCell(ws.getCell(r, 3), { fill, fmt: LEI_FMT })
      ws.getCell(r, 3).value = row.value
      styleCell(ws.getCell(r, 4), { fill, fmt: INT_FMT })
      ws.getCell(r, 4).value = row.totalReceipts
      styleCell(ws.getCell(r, 5), { fill, fmt: PCT_FMT })
      ws.getCell(r, 5).value = row.pctOfReceipts / 100
      r++
    }
    styleCell(ws.getCell(r, 1), { bold: true })
    ws.getCell(r, 1).value = 'TOTAL'
    styleCell(ws.getCell(r, 2), { bold: true, fmt: INT_FMT })
    ws.getCell(r, 2).value = data.promo.reduce((s, row) => s + row.lineCount, 0)
    styleCell(ws.getCell(r, 3), { bold: true, fmt: LEI_FMT })
    ws.getCell(r, 3).value = data.promo.reduce((s, row) => s + row.value, 0)
    styleCell(ws.getCell(r, 4), { bold: true, fmt: INT_FMT })
    ws.getCell(r, 4).value = data.promo.reduce((s, row) => s + row.totalReceipts, 0)
    const totalLines = data.promo.reduce((s, row) => s + row.lineCount, 0)
    const totalReceipts = data.promo.reduce((s, row) => s + row.totalReceipts, 0)
    styleCell(ws.getCell(r, 5), { bold: true, fmt: PCT_FMT })
    ws.getCell(r, 5).value = totalReceipts > 0 ? totalLines / totalReceipts : 0
  }

  return wb
}

export async function downloadProductAnalysisReport(data: ProductAnalysisData): Promise<void> {
  const wb = await buildProductAnalysisWorkbook(data)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Analiza_produse_${data.monthLabelText.replace(' ', '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
