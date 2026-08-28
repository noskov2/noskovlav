// Testeaza importul "Date consolidate" — un singur fisier, deja unificat de
// utilizator pe toate cele 3 canale, cu Canal Standardizat / Client Standardizat
// / Categorie / Subcategorie per rand si fara coloana de Data exacta (doar
// Anul + Numar Luna). Verifica: auto-detectarea corecta a coloanelor
// "standardizate" (nu a celor brute), canalul per rand (nu unul fix per
// fisier), sinteza datei (prima zi a lunii), si ca importul de vanzari NU
// seteaza categoria/subcategoria produsului (asta ramane doar la catalogul
// dedicat de produse).
import { chromium } from 'playwright'

const FIX = new URL('./fixtures', import.meta.url).pathname
const BASE = process.env.SMOKE_TEST_URL ?? 'http://localhost:5173'

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function readDb(page) {
  return page.evaluate(async () => {
    const dbReq = indexedDB.open('LactoDashboardDB')
    const db = await new Promise((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    function getAll(storeName) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const req = tx.objectStore(storeName).getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    const [transactions, products, importBatches] = await Promise.all([
      getAll('transactions'),
      getAll('products'),
      getAll('importBatches'),
    ])
    db.close()
    return { transactions, products, importBatches }
  })
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
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('text=SAU', { timeout: 15000 })

  const inputs = page.locator('input[type=file]')
  const consolidatedInput = inputs.nth(4) // ultimul slot, dupa cele 4 obisnuite
  log('Import CONSOLIDATED_TEST.xlsx (fișier consolidat, toate canalele)...')
  await consolidatedInput.setInputFiles(`${FIX}/CONSOLIDATED_TEST.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })

  // Verific ca auto-detectarea a preferat coloanele "standardizate", nu pe cele brute.
  const modal = page.locator('div.fixed.inset-0.z-50')
  const fieldGrid = modal.locator('div.grid > div')
  const clientSelect = fieldGrid.nth(0).locator('select')
  const channelSelect = fieldGrid.nth(13).locator('select')
  const clientMapped = await clientSelect.inputValue()
  const channelMapped = await channelSelect.inputValue()
  log(`  Auto-detectat: Client → "${clientMapped}", Canal → "${channelMapped}"`)
  if (clientMapped !== 'Client Standardizat') {
    throw new Error(`Auto-detect ar fi trebuit să prefere "Client Standardizat", a ales "${clientMapped}".`)
  }
  if (channelMapped !== 'Canal Standardizat') {
    throw new Error(`Auto-detect ar fi trebuit să prefere "Canal Standardizat", a ales "${channelMapped}".`)
  }
  log('  OK: auto-detectarea a preferat coloanele standardizate.')

  const missingBanner = await page.locator('text=Câmpuri obligatorii nemapate').count()
  if (missingBanner > 0) {
    const text = await page.locator('text=Câmpuri obligatorii nemapate').textContent()
    throw new Error(`Câmpuri obligatorii nemapate neașteptat: ${text}`)
  }

  await page.click('button:has-text("Confirmă maparea")')
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 60000, polling: 500 })

  const historyText = await page.locator('table tbody tr').first().textContent()
  log('  Rând istoric:', historyText?.trim())
  if (!historyText?.includes('MIXT')) {
    throw new Error(`Aștept eticheta "MIXT" pentru canalul batch-ului consolidat, am găsit: "${historyText}"`)
  }
  log('  OK: batch-ul consolidat apare în istoric, etichetat "MIXT" (canal per tranzacție, nu per fișier).')

  const { transactions, products, importBatches } = await readDb(page)
  if (transactions.length !== 300) throw new Error(`Aștept 300 tranzacții importate, am găsit ${transactions.length}.`)

  const channelsSeen = new Set(transactions.map((t) => t.channel))
  for (const ch of ['RETELE', 'MAGAZINE PROPRII', 'DISTRIBUTIE']) {
    if (!channelsSeen.has(ch)) throw new Error(`Canalul "${ch}" lipsește din tranzacțiile importate — canalul per rând nu a funcționat.`)
  }
  log(`  OK: toate cele 3 canale prezente în tranzacții (${[...channelsSeen].join(', ')}).`)

  const sample = transactions[0]
  if (!/^\d{4}-\d{2}-01$/.test(sample.date)) {
    throw new Error(`Data sintetizată ar trebui să fie prima zi a lunii (YYYY-MM-01), am găsit "${sample.date}".`)
  }
  log(`  OK: data sintetizată din An+Lună (ex. "${sample.date}").`)

  const withCategoryRaw = transactions.filter((t) => t.categoryRaw && t.subcategoryRaw)
  if (withCategoryRaw.length !== transactions.length) {
    throw new Error(`Aștept ca toate tranzacțiile să aibă categoryRaw+subcategoryRaw stocate, am găsit doar ${withCategoryRaw.length}.`)
  }
  log('  OK: categoryRaw/subcategoryRaw stocate pe fiecare tranzacție (informativ).')

  // "Sfant": importul de vanzari NU trebuie sa fi setat categoryId/subcategoryId pe produse.
  const untProduct = products.find((p) => p.canonicalName === 'Unt 200g')
  if (!untProduct) throw new Error('Produsul "Unt 200g" nu a fost creat din importul consolidat.')
  if (untProduct.categoryId != null || untProduct.subcategoryId != null) {
    throw new Error(
      `Importul de vânzări consolidat NU ar trebui să seteze categoria produsului — "Unt 200g" are categoryId=${untProduct.categoryId}, subcategoryId=${untProduct.subcategoryId}.`,
    )
  }
  log('  OK: importul consolidat NU a setat categoria/subcategoria pe produse (rămâne exclusiv catalogul dedicat).')

  const consolidatedBatch = importBatches.find((b) => b.sourceFileType === 'CONSOLIDATED')
  if (!consolidatedBatch || consolidatedBatch.channel !== 'MIXT') {
    throw new Error(`Batch-ul consolidat nu are channel="MIXT": ${JSON.stringify(consolidatedBatch)}`)
  }

  // --- verific ca Dashboard-ul / Canale reflecta corect cele 3 canale ---
  await page.click('a:has-text("Canale")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
    await page.waitForTimeout(300)
    if ((await page.locator('input[type=date]').count()) >= 2) break
  }
  const dateInputs = page.locator('input[type=date]')
  await dateInputs.nth(0).fill('2026-01-01')
  await dateInputs.nth(1).fill('2026-12-31')
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const channelRows = await page.locator('table tbody tr').count()
  if (channelRows !== 3) throw new Error(`Aștept 3 rânduri (canale) în raportul Canale, am găsit ${channelRows}.`)
  log(`  OK: pagina Canale arată exact 3 canale din fișierul consolidat.`)

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — importul de date consolidate (un fișier, toate canalele) funcționează corect.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
