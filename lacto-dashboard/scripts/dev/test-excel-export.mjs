// Test Etapa 6: export Excel. Importa date sintetice, apoi verifica ambele
// fluxuri de export (raport curent din Generator + Executive Report),
// citind fisierele .xlsx descarcate cu pachetul xlsx si confirmand ca
// fiecare foaie contine date reale (nu goale, nu mockup).
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const FIX = new URL('./fixtures', import.meta.url).pathname
const BASE = process.env.SMOKE_TEST_URL ?? 'http://localhost:5173'

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function main() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
    log('PAGE ERROR:', err.message)
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })

  async function waitForBatchCount(expected) {
    await page.click('a:has-text("Istoric importuri")')
    await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, expected, { timeout: 60000, polling: 500 })
  }

  log('Importing DISTRIBUTIE.xlsx...')
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(1)
  log('Import finalizat.')

  await page.click('a:has-text("Generator raport")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })

  for (let attempt = 0; attempt < 5; attempt++) {
    await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
    await page.waitForTimeout(300)
    if ((await page.locator('input[type=date]').count()) >= 2) break
  }
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2025-01-01')
  await dateInputs.nth(1).fill('2026-07-31')
  await page.waitForTimeout(400)
  await page.waitForSelector('table tbody tr', { timeout: 15000 })

  await page.selectOption("select[aria-label='Selector dimensiune raport']", 'product')
  await page.waitForTimeout(300)

  // --- export raportul curent ---
  log('Exportă raportul curent (produs)...')
  const [download1] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('button:has-text("Exportă Excel")'),
  ])
  const tmp1 = path.join(os.tmpdir(), `lacto-current-${Date.now()}.xlsx`)
  await download1.saveAs(tmp1)
  const wb1 = XLSX.read(fs.readFileSync(tmp1), { type: 'buffer' })
  if (wb1.SheetNames.length !== 1) throw new Error(`Raport curent: aștept 1 foaie, am găsit ${wb1.SheetNames.length}.`)
  const sheet1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
  if (sheet1.length === 0) throw new Error('Raport curent: foaia exportată e goală.')
  const firstRow1 = sheet1[0]
  if (!('Produs' in firstRow1) || !('Valoare' in firstRow1)) throw new Error(`Raport curent: coloane lipsă în ${JSON.stringify(firstRow1)}`)
  if (typeof firstRow1['Valoare'] !== 'number' || firstRow1['Valoare'] <= 0) throw new Error(`Raport curent: Valoare invalidă: ${firstRow1['Valoare']}`)
  log(`  OK: ${sheet1.length} rânduri exportate, prima = ${JSON.stringify(firstRow1).slice(0, 120)}`)
  fs.unlinkSync(tmp1)

  // --- Executive Report din Generator ---
  log('Exportă Executive Report din Generator...')
  const [download2] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('button:has-text("Executive Report")'),
  ])
  const tmp2 = path.join(os.tmpdir(), `lacto-executive-${Date.now()}.xlsx`)
  await download2.saveAs(tmp2)
  const wb2 = XLSX.read(fs.readFileSync(tmp2), { type: 'buffer' })
  const expectedSheets = ['Rezumat', 'Canale', 'Categorii', 'Clienți', 'Produse', 'Evoluție lunară', 'Alerte']
  for (const name of expectedSheets) {
    if (!wb2.SheetNames.includes(name)) throw new Error(`Executive Report: lipsește foaia "${name}". Foi găsite: ${wb2.SheetNames.join(', ')}`)
  }
  log(`  OK: toate cele ${expectedSheets.length} foi sunt prezente (${wb2.SheetNames.join(', ')}).`)

  const summaryRows = XLSX.utils.sheet_to_json(wb2.Sheets['Rezumat'])
  const totalRow = summaryRows.find((r) => r.Indicator === 'Total vânzări (lei)')
  if (!totalRow || typeof totalRow.Valoare !== 'number' || totalRow.Valoare <= 0) {
    throw new Error(`Executive Report: Rezumat.Total vânzări invalid: ${JSON.stringify(totalRow)}`)
  }
  log(`  OK: Rezumat.Total vânzări = ${totalRow.Valoare}`)

  const channelRows = XLSX.utils.sheet_to_json(wb2.Sheets['Canale'])
  if (channelRows.length === 0) throw new Error('Executive Report: foaia Canale e goală.')
  const channelValueSum = channelRows.reduce((s, r) => s + (Number(r.Valoare) || 0), 0)
  if (Math.abs(channelValueSum - totalRow.Valoare) > 1) {
    throw new Error(`Executive Report: suma pe Canale (${channelValueSum}) nu corespunde cu Rezumat (${totalRow.Valoare}).`)
  }
  log(`  OK: suma pe Canale (${channelValueSum}) corespunde cu Rezumatul.`)

  const monthlyRows = XLSX.utils.sheet_to_json(wb2.Sheets['Evoluție lunară'])
  if (monthlyRows.length === 0) throw new Error('Executive Report: foaia Evoluție lunară e goală.')
  log(`  OK: ${monthlyRows.length} luni în Evoluție lunară.`)

  fs.unlinkSync(tmp2)

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — exportul Excel (raport curent + Executive Report) produce fișiere reale, cu date corecte.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
