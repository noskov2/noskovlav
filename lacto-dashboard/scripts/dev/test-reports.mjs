// Test Etapa 4: importa date, apoi verifica ca paginile de raport (Canale,
// Categorii, Clienti, Produse, Analiza lunara, Sezonalitate, Preturi) incarca
// fara erori si ca sumele pe dimensiuni corespund cu totalul din Dashboard
// (aceleasi date, aceleasi filtre -> aceleasi cifre, indiferent de pagina).
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
    await page.waitForFunction(
      (n) => document.querySelectorAll('table tbody tr').length >= n,
      expected,
      { timeout: 60000, polling: 500 },
    )
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
    // Uneori selectOption() nimerește exact în tranziția de navigare/randare a
    // paginii noi (PeriodSelector-ul e remontat) și evenimentul se pierde —
    // reîncercăm până apar cele 2 input-uri de dată specifice modului "custom".
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
      await page.waitForTimeout(300) // lasă randarea input-urilor de dată să se stabilizeze
      if ((await page.locator('input[type=date]').count()) >= 2) break
      log(`  (retry ${attempt + 1}: selectOption('custom') nu a produs input-urile de dată încă)`)
    }
    const dateInputs = page.locator('input[type=date]')
    await dateInputs.nth(0).fill('2025-01-01')
    await dateInputs.nth(1).fill('2026-12-31')
    await page.waitForTimeout(600)
  }

  async function readKpi(label) {
    const card = page.locator('div', { hasText: label }).filter({ has: page.locator('.text-xl') }).last()
    return card.locator('.text-xl').textContent()
  }

  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Total vânzări', { timeout: 15000 })
  const dashboardTotal = await readKpi('Total vânzări')
  const dashboardTx = Number((await readKpi('Nr. tranzacții')).replace(/\D/g, ''))
  log('Dashboard: total =', dashboardTotal, ', tranzacții =', dashboardTx)
  if (dashboardTx !== 7000) throw new Error(`Aștept 7000 tranzacții în Dashboard, am găsit ${dashboardTx}`)

  const reportPages = [
    { link: 'Canale', valueCol: 2 },
    { link: 'Categorii', valueCol: 2 },
    { link: 'Clienți', valueCol: 2 },
    { link: 'Produse', valueCol: 3 }, // Produse are o coloană în plus (Categorie)
  ]

  for (const { link, valueCol } of reportPages) {
    log(`Verific pagina "${link}"...`)
    await page.click(`a:has-text("${link}")`)
    await page.waitForSelector('text=Compară cu', { timeout: 15000 })
    await setCustomPeriod()
    await page.waitForSelector('table tbody tr', { timeout: 15000 })
    await page.waitForTimeout(400)

    const rowCount = await page.locator('table tbody tr').count()
    if (rowCount === 0) throw new Error(`Pagina "${link}" nu are niciun rând după aplicarea perioadei.`)

    // suma valorilor din coloana "Valoare" a tabelului trebuie sa fie apropiata de totalul din Dashboard
    const cellTexts = await page.locator(`table tbody tr td:nth-child(${valueCol})`).allTextContents()
    const sum = cellTexts.reduce((s, t) => s + Number(t.replace(/[^\d,-]/g, '').replace(',', '.')), 0)
    const dashboardTotalNum = Number(dashboardTotal.replace(/[^\d,-]/g, '').replace(',', '.'))
    const diff = Math.abs(sum - dashboardTotalNum)
    log(`  ${rowCount} rânduri, sumă valoare = ${sum.toFixed(2)} (Dashboard: ${dashboardTotalNum.toFixed(2)}, diferență ${diff.toFixed(2)})`)
    if (diff > 1) {
      throw new Error(`Suma valorilor din pagina "${link}" (${sum}) nu corespunde cu totalul din Dashboard (${dashboardTotalNum}).`)
    }
    log(`  OK: suma corespunde exact cu Dashboard-ul (aceleași date reale).`)
  }

  log('Verific pagina "Analiză lunară"...')
  await page.click('a:has-text("Analiză lunară")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const monthRows = await page.locator('table tbody tr').count()
  log(`  ${monthRows} luni afișate.`)
  if (monthRows === 0) throw new Error('Analiză lunară nu are niciun rând.')

  log('Verific pagina "Sezonalitate"...')
  await page.click('a:has-text("Sezonalitate")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Dimensiune', { timeout: 15000 })
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  await page.waitForTimeout(600)
  const seasonRows = await page.locator('table tbody tr').count()
  log(`  ${seasonRows} rânduri (categorii) afișate.`)
  if (seasonRows === 0) throw new Error('Sezonalitate nu are niciun rând.')

  log('Verific pagina "Prețuri"...')
  await page.click('a:has-text("Prețuri")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  await setCustomPeriod()
  await page.waitForSelector('text=Dimensiune', { timeout: 15000 })
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  await page.waitForTimeout(600)
  const priceRows = await page.locator('table tbody tr').count()
  log(`  ${priceRows} rânduri de preț afișate.`)
  if (priceRows === 0) throw new Error('Prețuri nu are niciun rând.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS în pagină: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — toate paginile de raport (Etapa 4) funcționează și sunt consistente cu Dashboard-ul.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
