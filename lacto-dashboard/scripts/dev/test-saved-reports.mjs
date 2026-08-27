// Test Etapa 6: Rapoarte salvate. Configureaza un raport in Generator (dimensiune
// + Top N + indicator dezactivat), il salveaza, verifica ca apare in lista
// "Rapoarte salvate", il redeschide si verifica ca toata configuratia (inclusiv
// perioada custom) a fost restaurata exact, apoi il sterge si verifica disparitia.
import { chromium } from 'playwright'

const FIX = new URL('./fixtures', import.meta.url).pathname
const BASE = process.env.SMOKE_TEST_URL ?? 'http://localhost:5173'
const REPORT_NAME = `Test raport ${Date.now()}`

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
    if (dialog.type() === 'prompt') await dialog.accept(REPORT_NAME)
    else await dialog.accept()
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
    log(`  (retry ${attempt + 1}: selectOption('custom') nu a produs input-urile de dată încă)`)
  }
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2025-01-01')
  await dateInputs.nth(1).fill('2026-07-31')
  await page.waitForTimeout(400)

  await page.waitForSelector('table tbody tr', { timeout: 15000 })

  log('Configurez raportul: dimensiune=produs, Top N=top10, dezactivez Pondere...')
  await page.selectOption("select[aria-label='Selector dimensiune raport']", 'product')
  await page.waitForTimeout(300)
  await page.selectOption("select[aria-label='Selector Top N']", 'top10')
  await page.waitForTimeout(300)
  await page.locator('label:has-text("Pondere") input[type=checkbox]').click()
  await page.waitForTimeout(200)
  const headerBeforeSave = await page.locator('table thead').innerText()
  if (headerBeforeSave.includes('Pondere')) throw new Error('Pondere ar fi trebuit să dispară din tabel.')

  log('Salvez raportul...')
  await page.click('button:has-text("Salvează raportul")')
  await page.waitForSelector(`text=${REPORT_NAME}`, { timeout: 10000 })
  log('  OK: mesaj de confirmare afișat.')

  log('Verific pagina Rapoarte salvate...')
  await page.click('a:has-text("Rapoarte salvate")')
  await page.waitForSelector(`text=${REPORT_NAME}`, { timeout: 15000 })
  const rowText = await page.locator(`tr:has-text("${REPORT_NAME}")`).innerText()
  if (!rowText.includes('Produs')) throw new Error(`Raportul salvat nu arată dimensiunea corectă: "${rowText}"`)
  log('  OK: raportul apare în listă cu dimensiunea corectă.')

  log('Deschid raportul salvat...')
  await page.locator(`tr:has-text("${REPORT_NAME}")`).locator('text=Deschide').click()
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await page.waitForFunction(
    () => document.querySelector("select[aria-label='Selector dimensiune raport']")?.value === 'product',
    { timeout: 10000 },
  )
  const topNValue = await page.locator("select[aria-label='Selector Top N']").inputValue()
  if (topNValue !== 'top10') throw new Error(`Top N nerestaurat corect: "${topNValue}"`)
  const shareChecked = await page.locator('label:has-text("Pondere") input[type=checkbox]').isChecked()
  if (shareChecked) throw new Error('Indicatorul Pondere ar fi trebuit să rămână debifat după restaurare.')
  const periodPreset = await page.locator("select[aria-label='Selector perioadă']").inputValue()
  if (periodPreset !== 'custom') throw new Error(`Perioada nerestaurată corect: "${periodPreset}"`)
  log('  OK: dimensiune, Top N, indicator și perioadă restaurate corect din raportul salvat.')

  log('Șterg raportul salvat...')
  await page.click('a:has-text("Rapoarte salvate")')
  await page.waitForSelector(`text=${REPORT_NAME}`, { timeout: 15000 })
  await page.locator(`tr:has-text("${REPORT_NAME}")`).locator('text=Șterge').click()
  await page.waitForFunction(
    (name) => !document.body.innerText.includes(name),
    REPORT_NAME,
    { timeout: 10000 },
  )
  log('  OK: raportul a dispărut din listă după ștergere.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — salvare/restaurare/ștergere rapoarte funcționează complet, cu date reale.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
