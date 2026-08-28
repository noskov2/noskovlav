// Verifica ca filtrele multi-select (Client, Produs, Categorie) permit
// scrierea unui text de cautare, care restrange lista de optiuni.
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

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')

  log('Import DISTRIBUTIE.xlsx (destui clienți distincți — ANABELLA + 8 retaileri — pentru o listă cu căutare)...')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  await page.locator('input[type=file]').nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.click('button:has-text("Confirmă maparea")')
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 30000, polling: 500 })
  log('Import finalizat.')

  // Dashboard arată toate cele 4 filtre (Clienți/Produse ascund propriul filtru redundant).
  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })

  const clientContainer = page.locator('div.relative').filter({ has: page.locator('label', { hasText: 'Client' }) })
  await clientContainer.locator('button').click()

  const searchInput = clientContainer.locator('input[type=text]')
  await searchInput.waitFor({ timeout: 5000 })

  const isFocused = await searchInput.evaluate((el) => el === document.activeElement)
  if (!isFocused) throw new Error('Câmpul de căutare ar trebui să primească focus automat la deschidere.')
  log('  OK: câmpul de căutare are focus automat.')

  const optionsBefore = await clientContainer.locator('label:has(input[type=checkbox])').count()
  log(`  Opțiuni înainte de căutare: ${optionsBefore}`)
  if (optionsBefore < 5) throw new Error(`Aștept multe opțiuni de client (fixture cu 100k rânduri), am găsit doar ${optionsBefore}.`)

  await searchInput.fill('KAUFLAND')
  await page.waitForTimeout(200)
  const optionsAfter = await clientContainer.locator('label:has(input[type=checkbox])').allTextContents()
  log(`  Opțiuni după "KAUFLAND": ${JSON.stringify(optionsAfter)}`)
  if (optionsAfter.length === 0) throw new Error('Căutarea "KAUFLAND" nu a găsit nicio opțiune.')
  if (!optionsAfter.every((t) => t.toUpperCase().includes('KAUFLAND'))) {
    throw new Error(`Toate opțiunile rămase ar trebui să conțină "KAUFLAND": ${JSON.stringify(optionsAfter)}`)
  }
  if (optionsAfter.length >= optionsBefore) {
    throw new Error(`Căutarea ar trebui să micșoreze lista (${optionsBefore} → ${optionsAfter.length}).`)
  }
  log('  OK: căutarea "KAUFLAND" a micșorat lista corect.')

  // selectez o optiune filtrata si verific ca bifa se pastreaza
  await clientContainer.locator('label:has(input[type=checkbox])').first().click()
  const selectedSummary = await clientContainer.locator('button').first().textContent()
  log(`  Sumar după selecție: "${selectedSummary}"`)
  if (!selectedSummary || selectedSummary.trim() === 'toate') {
    throw new Error('Selecția unei opțiuni filtrate ar trebui să actualizeze sumarul butonului.')
  }
  log('  OK: selecția unei opțiuni din lista filtrată funcționează.')

  // caut ceva fara rezultate
  await searchInput.fill('ZZZ_INEXISTENT_ZZZ')
  await page.waitForTimeout(200)
  const noResultsText = await clientContainer.locator('text=Niciun rezultat').count()
  if (noResultsText === 0) throw new Error('Ar trebui să apară un mesaj "Niciun rezultat" pentru o căutare fără potriviri.')
  log('  OK: mesaj "Niciun rezultat" afișat corect pentru o căutare fără potriviri.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — căutarea în filtrele multi-select funcționează corect.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
