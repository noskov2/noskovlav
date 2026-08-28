// Verifica doua fix-uri: (1) presetul implicit de perioada pe orice pagina
// e "An curent" (nu "Luna curenta"); (2) filtrul "Categorie" din FilterBar
// listeaza doar categoriile de top, nu si subcategoriile.
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

  // --- import catalog (Lactate > Branzeturi/Proaspete) ca sa avem categorii + subcategorii reale ---
  log('Import catalog produse (pentru categorii + subcategorii reale)...')
  await page.click('a:has-text("Import catalog produse")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  await page.locator('input[type=file]').setInputFiles(`${FIX}/CATALOG_PRODUSE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.click('button:has-text("Confirmă importul")')
  await page.waitForSelector('text=Import finalizat.', { timeout: 15000 })

  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  await page.locator('input[type=file]').nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.click('button:has-text("Confirmă maparea")')
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 60000, polling: 500 })
  log('Import finalizat.')

  // --- 1. presetul implicit trebuie sa fie "An curent" pe orice pagina de raport ---
  log('Verific presetul implicit de perioadă pe Canale...')
  await page.click('a:has-text("Canale")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  const presetValue = await page.locator("select[aria-label='Selector perioadă']").inputValue()
  if (presetValue !== 'current-year') {
    throw new Error(`Aștept presetul implicit "current-year" (An curent), am găsit "${presetValue}".`)
  }
  log('  OK: presetul implicit e "An curent".')

  log('Verific și pe Dashboard...')
  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  const presetValueDash = await page.locator("select[aria-label='Selector perioadă']").inputValue()
  if (presetValueDash !== 'current-year') {
    throw new Error(`Dashboard: aștept presetul implicit "current-year", am găsit "${presetValueDash}".`)
  }
  log('  OK: și pe Dashboard presetul implicit e "An curent".')

  // --- 2. filtrul Categorie trebuie sa listeze doar categorii de top, nu subcategorii ---
  log('Verific filtrul Categorie (doar categorii de top, fără subcategorii)...')
  await page.click('a:has-text("Canale")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  const categoryContainer = page.locator('div.relative').filter({ has: page.locator('label', { hasText: 'Categorie' }) })
  await categoryContainer.locator('button').click()
  await page.waitForSelector('text=Lactate', { timeout: 15000 })
  const optionsText = await categoryContainer.locator('label').allTextContents()
  log('  Opțiuni categorie:', optionsText)
  if (!optionsText.some((t) => t.includes('Lactate'))) {
    throw new Error('Categoria "Lactate" ar trebui să apară în filtru.')
  }
  if (optionsText.some((t) => t.includes('Branzeturi') || t.includes('Proaspete'))) {
    throw new Error(`Subcategoriile NU ar trebui să apară în filtrul Categorie: ${JSON.stringify(optionsText)}`)
  }
  log('  OK: filtrul Categorie listează doar categoria "Lactate", fără subcategorii.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — presetul implicit "An curent" și filtrul Categorie (doar top-level) funcționează corect.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
