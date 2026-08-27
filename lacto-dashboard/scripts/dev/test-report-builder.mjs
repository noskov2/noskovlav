// Test Etapa 6: pagina Generator de rapoarte. Importa date sintetice, apoi
// verifica pentru fiecare dimensiune (inclusiv Judet/Localitate/Agent, care
// nu au nomenclator propriu) ca tabelul se populeaza cu date reale, ca
// bifele de indicatori comuta coloanele, si ca Top N taie corect numarul de
// randuri afisate.
import { chromium } from 'playwright'

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
  page.on('dialog', async (dialog) => {
    log('DIALOG:', dialog.type(), dialog.message())
    await dialog.dismiss()
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })

  async function waitForBatchCount(expected) {
    await page.click('a:has-text("Istoric importuri")')
    await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, expected, { timeout: 60000, polling: 500 })
  }

  log('Importing DISTRIBUTIE.xlsx (are Județ/Localitate/Agent completate)...')
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(1)
  log('Import finalizat.')

  await page.click('a:has-text("Generator raport")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })

  // Perioada implicită ("luna curentă") nu acoperă intervalul fixture-urilor
  // (2025-01 .. 2026-07) — setăm un interval custom care acoperă tot.
  await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
  await page.waitForTimeout(300)
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2025-01-01')
  await dateInputs.nth(1).fill('2026-07-31')
  await page.waitForTimeout(400)

  await page.waitForSelector('text=Dimensiune', { timeout: 15000 })

  const dimensionSelect = page.locator("select[aria-label='Selector dimensiune raport']")

  async function checkDimension(value, expectMinRows = 1) {
    await dimensionSelect.selectOption(value)
    await page.waitForTimeout(500)
    await page.waitForSelector('table tbody tr', { timeout: 15000 })
    const rowCount = await page.locator('table tbody tr').count()
    const firstCellText = await page.locator('table tbody tr').first().locator('td').first().innerText()
    if (rowCount < expectMinRows) throw new Error(`Dimensiune "${value}": doar ${rowCount} rânduri.`)
    if (!firstCellText.trim()) throw new Error(`Dimensiune "${value}": prima celulă e goală.`)
    log(`  OK dimensiune "${value}": ${rowCount} rânduri, prima = "${firstCellText}".`)
  }

  log('Verific toate dimensiunile motorului generic...')
  await checkDimension('client')
  await checkDimension('product')
  await checkDimension('category')
  await checkDimension('channel')
  await checkDimension('month')
  await checkDimension('county')
  await checkDimension('locality')
  await checkDimension('agent')

  // --- comutare indicatori: dezactiveaza Cantitate si verifica ca dispare coloana ---
  log('Verific comutarea indicatorilor (Cantitate)...')
  await dimensionSelect.selectOption('client')
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const headerBefore = await page.locator('table thead').innerText()
  if (!headerBefore.includes('Cantitate')) throw new Error('Coloana Cantitate lipsește implicit.')
  await page.locator('label:has-text("Cantitate") input[type=checkbox]').click()
  await page.waitForTimeout(200)
  const headerAfter = await page.locator('table thead').innerText()
  if (headerAfter.includes('Cantitate')) throw new Error('Coloana Cantitate nu a dispărut după debifare.')
  log('  OK: bifa Cantitate comută coloana.')
  await page.locator('label:has-text("Cantitate") input[type=checkbox]').click() // reactiveaza

  // --- Top N ---
  log('Verific Top N...')
  const topNSelect = page.locator("select[aria-label='Selector Top N']")
  const allRows = await page.locator('table tbody tr').count()
  await topNSelect.selectOption('top5')
  await page.waitForTimeout(300)
  const top5Rows = await page.locator('table tbody tr').count()
  if (top5Rows !== 5) throw new Error(`Top 5 ar trebui să afișeze exact 5 rânduri, a afișat ${top5Rows}.`)
  log(`  OK: Toate=${allRows} rânduri, Top 5=${top5Rows} rânduri.`)
  await topNSelect.selectOption('all')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — Generatorul de rapoarte funcționează pe toate dimensiunile, cu indicatori și Top N reale.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
