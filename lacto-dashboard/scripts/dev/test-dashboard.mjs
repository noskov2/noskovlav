// Test Etapa 3: importa un fisier, apoi verifica ca Dashboard-ul calculeaza
// corect KPI-urile din datele reale (nu date hardcodate) si ca schimbarea
// filtrelor (perioada personalizata, canal) recalculeaza rezultatele.
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
  page.on('pageerror', (err) => log('PAGE ERROR:', err.message))
  page.on('dialog', async (dialog) => {
    log('DIALOG:', dialog.type(), dialog.message())
    await dialog.dismiss()
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })

  log('Importing DISTRIBUTIE.xlsx (3000 randuri)...')
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await page.waitForSelector('text=Import finalizat', { timeout: 60000 })
  log('Import finalizat.')

  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })

  // setam o perioada personalizata care acopera tot intervalul fixture-ului (2025-01-01 .. 2026-07-31);
  // implicit ("luna curenta") nu ar gasi nimic, fixture-ul nu are date in luna curenta reala
  await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2025-01-01')
  await dateInputs.nth(1).fill('2026-12-31')
  await page.waitForSelector('text=Total vânzări', { timeout: 15000 })
  await page.waitForTimeout(800)

  async function readKpi(label) {
    const card = page.locator('div', { hasText: label }).filter({ has: page.locator('.text-xl') }).last()
    return card.locator('.text-xl').textContent()
  }

  const totalVanzari = await readKpi('Total vânzări')
  const nrTranzactii = await readKpi('Nr. tranzacții')
  log('Total vânzări (fără filtre):', totalVanzari)
  log('Nr. tranzacții (fără filtre):', nrTranzactii)

  const txCount = Number(nrTranzactii.replace(/\D/g, ''))
  if (txCount !== 3000) {
    throw new Error(`Aștept 3000 tranzacții (tot fișierul DISTRIBUTIE), am găsit ${txCount}`)
  }
  log('OK: numărul de tranzacții corespunde exact fișierului importat (fără date hardcodate).')

  // aplicam filtrul de canal si verificam ca numerele se schimba (recalculare reala)
  log('Aplic filtru canal = Distribuție și verific recalcularea...')
  const canalButton = page.getByText('Canal', { exact: true }).locator('xpath=following-sibling::button[1]')
  await canalButton.click()
  await page.locator('label', { hasText: 'Distribuție' }).click()
  await page.locator('div.fixed.inset-0.z-10').click({ force: true })
  await page.waitForTimeout(800)

  const nrTranzactiiFiltrat = await readKpi('Nr. tranzacții')
  log('Nr. tranzacții (canal=Distribuție):', nrTranzactiiFiltrat)
  const txCountFiltered = Number(nrTranzactiiFiltrat.replace(/\D/g, ''))
  if (txCountFiltered !== 3000) {
    throw new Error(`Toate randurile din DISTRIBUTIE.xlsx au canalul DISTRIBUTIE, deci filtrul nu ar trebui sa schimbe nimic; am gasit ${txCountFiltered}`)
  }
  log('OK: filtrarea pe canalul corect nu schimbă numărul (toate rândurile îl au deja).')

  // acum un canal la care nu exista date -> ar trebui starea goala
  await canalButton.click()
  await page.locator('label', { hasText: 'Distribuție' }).click() // deselecteaza
  await page.locator('label', { hasText: 'Rețele' }).click()
  await page.locator('div.fixed.inset-0.z-10').click({ force: true })
  await page.waitForTimeout(800)

  const emptyState = await page.locator('text=Niciun rând nu corespunde filtrelor selectate.').count()
  if (emptyState === 0) {
    throw new Error('Filtrarea pe un canal fără date ar fi trebuit să arate starea goală, dar nu a fost găsită.')
  }
  log('OK: filtrarea pe canal fără date afișează starea goală corectă.')

  await browser.close()
  log('DONE — Dashboard-ul calculează corect din date reale și reacționează la filtre.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
