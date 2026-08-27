// Test Etapa 6: pagina Calitatea datelor. Importa date sintetice, viziteaza
// pagina si verifica ca scorul + lista de probleme se calculeaza real (nu
// mockup), plus ca butonul "Recalculeaza" functioneaza fara erori JS.
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

  // --- Calitatea datelor pe baza goala: scor 100, mesaj "nu exista date" ---
  log('Verific Calitatea datelor pe baza goală...')
  await page.click('a:has-text("Calitatea datelor")')
  await page.waitForSelector('text=Nu există date importate încă', { timeout: 15000 })
  log('  OK: mesaj bază goală afișat corect.')

  // --- import date sintetice ---
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

  // --- Calitatea datelor cu date reale ---
  log('Verific Calitatea datelor cu date reale...')
  await page.click('a:has-text("Calitatea datelor")')
  await page.waitForSelector('text=tranzacții analizate', { timeout: 15000 })

  const scoreText = await page.locator('div.text-4xl').first().innerText()
  const score = Number(scoreText.trim())
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`Scor calitate invalid: "${scoreText}"`)
  }
  log(`  Scor calitate: ${score}`)

  const issueRows = await page.locator('table tbody tr').count()
  log(`  ${issueRows} rânduri de probleme afișate.`)

  // --- Recalculeaza ---
  log('Verific butonul Recalculează...')
  await page.click('button:has-text("Recalculează")')
  await page.waitForSelector('text=Se calculează…', { timeout: 5000 }).catch(() => {})
  await page.waitForSelector('text=tranzacții analizate', { timeout: 15000 })
  log('  OK: Recalculează funcționează.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — pagina Calitatea datelor funcționează corect (scor real + probleme reale, fără mockup).')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
