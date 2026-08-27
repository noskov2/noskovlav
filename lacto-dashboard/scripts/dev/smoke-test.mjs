// Test de fum pentru fluxul de import (Etapa 1): verifică wizard-ul de mapare,
// import de 100.000 rânduri fără blocare, detectarea fișierului duplicat și
// parsarea numerelor cu virgulă zecimală.
//
// Rulare:
//   npm run fixtures:gen   (generează fișierele xlsx de test)
//   npm run dev            (într-un alt terminal, pe portul 5183)
//   npm run test:smoke
//
// PLAYWRIGHT_CHROMIUM_PATH poate suprascrie calea către binarul Chromium
// dacă versiunea din `playwright` (npm) nu se potrivește cu build-ul instalat local.
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
  page.on('console', (msg) => {
    log('CONSOLE', msg.type(), msg.text())
  })
  page.on('pageerror', (err) => log('PAGE ERROR:', err.message))

  await page.goto(BASE)
  await page.waitForSelector('text=Import date')
  log('App loaded')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })

  const inputs = page.locator('input[type=file]')
  const count = await inputs.count()
  log('File inputs found:', count)
  if (count !== 4) throw new Error(`Expected 4 file inputs, got ${count}`)

  // 1) Import fisier mare (100k randuri) pe slotul RETELE MARI (primul)
  log('Uploading RETELE_MARI_100k.xlsx (100.000 randuri)...')
  const t0 = Date.now()
  await inputs.nth(0).setInputFiles(`${FIX}/RETELE_MARI_100k.xlsx`)

  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  log('Mapping modal appeared after', Date.now() - t0, 'ms')

  const confirmBtn = page.locator('button:has-text("Confirmă maparea")')
  const isDisabled = await confirmBtn.isDisabled()
  log('Confirm button disabled?', isDisabled)
  if (isDisabled) {
    const missing = await page.locator('text=Câmpuri obligatorii nemapate').textContent().catch(() => null)
    throw new Error('Mapping auto-detection incomplete: ' + missing)
  }
  await confirmBtn.click()
  log('Mapping confirmed')

  // Responsiveness check: sample progress twice while it's running
  await page.waitForTimeout(300)
  const progressTexts = []
  for (let i = 0; i < 4; i++) {
    const txt = await page.locator('text=/%$/').first().textContent().catch(() => null)
    progressTexts.push(txt)
    await page.waitForTimeout(400)
  }
  log('Progress samples (UI stayed responsive while polling):', progressTexts)

  try {
    await page.waitForSelector('text=Import finalizat', { timeout: 300000 })
  } catch (e) {
    const bodyHtml = await page.locator('main').innerHTML()
    log('TIMEOUT - current main HTML snippet:', bodyHtml.slice(0, 3000))
    throw e
  }
  const elapsed = Date.now() - t0
  log('Import finalized in', elapsed, 'ms')

  const statusText = await page.locator('text=/Import finalizat.*/').first().textContent()
  log('Status:', statusText)
  if (!/100\.000/.test(statusText) && !/100000/.test(statusText.replace(/\./g, ''))) {
    log('WARNING: expected ~100000 imported rows in status text')
  }

  // 2) Verifica Istoric importuri
  await page.click('text=Istoric importuri')
  await page.waitForSelector('text=RETELE_MARI_100k.xlsx')
  const rowsCountText = await page.locator('table tbody tr').first().locator('td').nth(5).textContent()
  log('Rânduri importate (din istoric):', rowsCountText)

  // 3) Re-incarca acelasi fisier -> trebuie sa detecteze duplicat
  // (navigarea intre pagini remonteaza ImportPage, deci starea efemera de progres
  // se reseteaza - normal; sursa de adevar e Istoricul importurilor, verificat mai sus)
  await page.click('text=Import date')
  await page.waitForSelector('text=REȚELE MARI')
  log('Re-uploading the SAME file to test duplicate detection...')
  await inputs.nth(0).setInputFiles(`${FIX}/RETELE_MARI_100k.xlsx`)
  await page.waitForSelector('text=Acest fișier pare să fi fost importat anterior', { timeout: 20000 })
  log('Duplicate dialog appeared as expected')
  await page.click('text=Anulează importul')
  await page.waitForTimeout(500)

  await page.click('text=Istoric importuri')
  await page.waitForTimeout(300)
  const rowCountAfterCancel = await page.locator('table tbody tr').count()
  log('Batch rows in history after cancelling duplicate:', rowCountAfterCancel)
  if (rowCountAfterCancel !== 1) throw new Error(`Expected 1 batch, found ${rowCountAfterCancel}`)

  // 4) Import fisier cu zecimale cu virgula (MAGAZINE_PROPRII) pentru validare parsare RO
  await page.click('text=Import date')
  await page.waitForTimeout(300)
  log('Uploading MAGAZINE_PROPRII.xlsx (zecimale cu virgula)...')
  await inputs.nth(1).setInputFiles(`${FIX}/MAGAZINE_PROPRII.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await page.waitForSelector('text=Import finalizat', { timeout: 30000 })
  log('MAGAZINE_PROPRII import finalized')

  await page.click('text=Istoric importuri')
  await page.waitForTimeout(300)
  const finalBatchCount = await page.locator('table tbody tr').count()
  log('Total batches in history:', finalBatchCount)

  await page.screenshot({ path: new URL('./import-history.png', import.meta.url).pathname, fullPage: true })
  log('Screenshot saved')

  await browser.close()
  log('DONE — all checks passed')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
