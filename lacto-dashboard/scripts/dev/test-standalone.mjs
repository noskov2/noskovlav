// Test: build-ul standalone (un singur fisier .html, dist-standalone/index.html)
// deschis DIRECT din file:// (nu de pe un server) trebuie sa functioneze identic
// cu build-ul normal: import Excel (worker inlinat), IndexedDB, navigare (HashRouter).
import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FIX = new URL('./fixtures', import.meta.url).pathname
const HTML_PATH = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'dist-standalone', 'index.html')
const FILE_URL = 'file://' + HTML_PATH

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
  page.on('console', (msg) => log('CONSOLE', msg.type(), msg.text()))
  page.on('requestfailed', (req) => log('REQUEST FAILED:', req.url(), req.failure()?.errorText))

  log('Deschid fișierul standalone direct din file://:', FILE_URL)
  await page.goto(FILE_URL)
  await page.waitForSelector('text=Dashboard', { timeout: 15000 })
  log('OK: aplicația s-a încărcat din fișierul local, fără server.')

  // --- import catalog produse (parsare xlsx pe main thread, fara worker) ---
  log('Import catalog produse (CATALOG_PRODUSE.xlsx)...')
  await page.click('a:has-text("Import catalog produse")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  await page.locator('input[type=file]').setInputFiles(`${FIX}/CATALOG_PRODUSE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.click('button:has-text("Confirmă importul")')
  await page.waitForSelector('text=Import finalizat.', { timeout: 15000 })
  log('OK: catalogul de produse s-a importat din file:// (parsare xlsx pe main thread).')

  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  const inputs = page.locator('input[type=file]')
  log('Import DISTRIBUTIE.xlsx (testez worker-ul inlinat)...')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()

  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 60000, polling: 500 })
  log('OK: import finalizat — worker-ul inlinat a funcționat din file://.')

  // Verific ca IndexedDB a persistat datele si ca Dashboard-ul le calculeaza corect.
  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
    await page.waitForTimeout(300)
    if ((await page.locator('input[type=date]').count()) >= 2) break
  }
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2025-01-01')
  await dateInputs.nth(1).fill('2026-12-31')
  await page.waitForSelector('text=Total vânzări', { timeout: 15000 })
  await page.waitForTimeout(600)
  const card = page.locator('div', { hasText: 'Nr. tranzacții' }).filter({ has: page.locator('.text-xl') }).last()
  const txText = await card.locator('.text-xl').textContent()
  const txCount = Number((txText ?? '').replace(/\D/g, ''))
  if (txCount !== 3000) throw new Error(`Aștept 3000 tranzacții, am găsit ${txCount}.`)
  log(`OK: Dashboard-ul arată ${txCount} tranzacții — IndexedDB funcționează din file://.`)

  // Reincarc pagina (simuleaza inchiderea si redeschiderea fisierului) - datele trebuie sa persiste.
  log('Reîncarc pagina (simulez redeschiderea fișierului)...')
  await page.reload()
  await page.waitForSelector('text=Dashboard', { timeout: 15000 })
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 15000, polling: 500 })
  log('OK: datele au persistat după reîncărcare (IndexedDB e permanent, nu doar în memorie).')

  async function setCustomPeriod() {
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
      await page.waitForTimeout(300)
      if ((await page.locator('input[type=date]').count()) >= 2) break
    }
    const inputs2 = page.locator('input[type=date]')
    await inputs2.nth(0).fill('2025-01-01')
    await inputs2.nth(1).fill('2026-12-31')
    await page.waitForTimeout(400)
  }

  // --- pagina de raport (Canale) — verific ca React.lazy() inlinat de vite-plugin-singlefile functioneaza ---
  log('Verific o pagină de raport (Canale)...')
  await page.click('a:has-text("Canale")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const channelRows = await page.locator('table tbody tr').count()
  if (channelRows === 0) throw new Error('Pagina Canale nu are niciun rând.')
  log(`OK: pagina Canale funcționează (${channelRows} rânduri) — React.lazy inlinat corect.`)

  // --- export Excel (verific ca descarcarea de fisiere functioneaza din file://) ---
  log('Verific exportul Excel din Generatorul de rapoarte...')
  await page.click('a:has-text("Generator raport")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('button:has-text("Exportă Excel")'),
  ])
  const suggestedName = download.suggestedFilename()
  if (!suggestedName.endsWith('.xlsx')) throw new Error(`Nume fișier export neașteptat: ${suggestedName}`)
  log(`OK: exportul Excel a pornit o descărcare reală (${suggestedName}) din file://.`)

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — fișierul standalone funcționează complet, deschis direct din file://.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
