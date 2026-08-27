// Test Etapa 5: importa date sintetice (2 fisiere, ca sa existe si o perioada
// de comparatie cu semnal real), apoi viziteaza fiecare pagina noua de
// analytics avansat si verifica ca se incarca fara erori JS si afiseaza date
// reale (nu goale, nu crash).
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

  log('Importing DISTRIBUTIE.xlsx and MAGAZINE_PROPRII.xlsx...')
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(1)

  await page.click('a:has-text("Import date")')
  await inputs.nth(1).setInputFiles(`${FIX}/MAGAZINE_PROPRII.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(2)
  log('Import finalizat (2 fișiere, 7000 rânduri).')

  async function setCustomPeriod() {
    // Interval principal ingust (2026) + comparatie explicita "anul precedent" (2025):
    // ambele perioade au date reale in fixture-uri. Un interval principal foarte lat
    // (ex. 2025-2026) ar face ca "perioada precedenta" implicita sa cada complet
    // inainte de date, lasand paginile bazate pe comparatie fara niciun client comun.
    await page.waitForSelector("select[aria-label='Selector perioadă']", { timeout: 15000 })
    await page.waitForTimeout(300)
    await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
    await page.waitForTimeout(500)
    const dateInputs = page.locator('input[type=date]')
    await dateInputs.nth(0).fill('2026-01-01')
    await dateInputs.nth(1).fill('2026-12-31')
    await page.waitForTimeout(400)

    const comparisonSelects = page.locator('select')
    const count = await comparisonSelects.count()
    for (let i = 0; i < count; i++) {
      const sel = comparisonSelects.nth(i)
      const hasOption = (await sel.locator('option[value="previous-year"]').count()) > 0
      if (hasOption) {
        await sel.selectOption('previous-year')
        break
      }
    }
    await page.waitForTimeout(600)
  }

  // --- Clienti -> Client 360 (drilldown) ---
  log('Verific drilldown Clienți -> Client 360°...')
  await page.click('a:has-text("Clienți")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  await page.locator('table tbody tr button').first().click()
  await page.waitForSelector('text=Vânzări totale', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Prima achiziție', { timeout: 15000 })
  log('  OK: Client 360° s-a încărcat.')

  // --- Produse -> Produs 360 (drilldown) ---
  log('Verific drilldown Produse -> Produs 360°...')
  await page.click('a:has-text("Produse")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  await page.locator('table tbody tr button').first().click()
  await page.waitForSelector('text=Pondere în total companie', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Preț minim', { timeout: 15000 })
  log('  OK: Produs 360° s-a încărcat.')

  // --- Pareto / ABC ---
  log('Verific Pareto / ABC...')
  await page.click('a:has-text("Pareto / ABC")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Top 5 generează', { timeout: 15000 })
  const abcRows = await page.locator('table tbody tr').count()
  if (abcRows === 0) throw new Error('Pareto/ABC: niciun rând în tabel.')
  log(`  OK: ${abcRows} rânduri ABC.`)

  // --- Dinamica clientilor ---
  log('Verific Dinamica clienților...')
  await page.click('a:has-text("Dinamica clienților")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Client nou', { timeout: 15000 })
  log('  OK: Dinamica clienților s-a încărcat.')

  // --- Matrice creștere ---
  log('Verific Matrice creștere...')
  await page.click('a:has-text("Matrice creștere")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Client mare + creștere', { timeout: 15000 })
  log('  OK: Matrice creștere s-a încărcat.')

  // --- Risc concentrare ---
  log('Verific Risc concentrare...')
  await page.click('a:has-text("Risc concentrare")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Herfindahl', { timeout: 15000 })
  log('  OK: Risc concentrare s-a încărcat.')

  // --- Alerte ---
  log('Verific Alerte...')
  await page.click('a:has-text("Alerte")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForTimeout(1500)
  const alertsEmpty = await page.locator('text=Nicio alertă').count()
  const alertsCount = await page.locator('div.border.rounded-lg.p-3').count()
  log(`  ${alertsEmpty > 0 ? 'nicio alertă generată' : alertsCount + ' alerte generate'}.`)

  // --- Cross-sell ---
  log('Verific Cross-sell...')
  await page.click('a:has-text("Cross-sell")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('select', { timeout: 15000 })
  const clientOptions = await page.locator('select').last().locator('option').count()
  if (clientOptions < 2) throw new Error('Cross-sell: nu există opțiuni de client în select.')
  await page.locator('select').last().selectOption({ index: 1 })
  await page.waitForSelector('text=Ce cumpără', { timeout: 15000 })
  log('  OK: Cross-sell s-a încărcat.')

  // --- Outlieri pret ---
  log('Verific Outlieri preț...')
  await page.click('a:has-text("Outlieri preț")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('select', { timeout: 15000 })
  await page.locator('select').last().selectOption({ index: 1 })
  await page.waitForSelector('text=Preț mediu ponderat', { timeout: 15000 })
  log('  OK: Outlieri preț s-a încărcat.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — toate paginile Etapa 5 (analytics avansat) funcționează fără erori.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
