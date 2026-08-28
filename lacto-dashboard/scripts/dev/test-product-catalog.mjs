// Testeaza cerinta: "vreau un loc unde import toate produsele, cu categorie si
// subcategorie, si acestea raman sfinte" — importa catalogul de produse ÎNTÂI,
// apoi un import de vanzari Mentor (DISTRIBUTIE.xlsx, cu aceleasi denumiri de
// produse) si verifica DIRECT DIN INDEXEDDB ca:
//  1. importul de catalog creeaza categoriile/subcategoriile si le leaga corect
//     de produse;
//  2. importul de vanzari NU creeaza produse duplicate pentru denumiri deja
//     existente (le potriveste exact, ca inainte);
//  3. categoria/subcategoria produselor deja catalogate NU se schimba deloc
//     dupa importul de vanzari, indiferent de ce vine in date.
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
    const [products, categories] = await Promise.all([getAll('products'), getAll('categories')])
    db.close()
    return { products, categories }
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

  // --- pasul 1: import catalog produse, INAINTE de orice vanzare ---
  log('Import catalog produse (CATALOG_PRODUSE.xlsx)...')
  await page.click('a:has-text("Import catalog produse")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  const fileInput = page.locator('input[type=file]')
  await fileInput.setInputFiles(`${FIX}/CATALOG_PRODUSE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.waitForSelector('button:has-text("Confirmă importul")', { timeout: 15000 })
  await page.click('button:has-text("Confirmă importul")')
  await page.waitForSelector('text=Import finalizat.', { timeout: 15000 })
  const summaryText = await page.locator('text=produse noi create').textContent()
  log('  Rezumat import catalog:', summaryText)
  if (!summaryText?.includes('6')) throw new Error(`Aștept 6 produse noi create, am găsit: "${summaryText}"`)

  const afterCatalog = await readDb(page)
  const catByName = new Map(afterCatalog.categories.map((c) => [c.name, c]))
  const lactate = catByName.get('Lactate')
  const branzeturi = catByName.get('Branzeturi')
  const proaspete = catByName.get('Proaspete')
  if (!lactate || lactate.parentId) throw new Error('Categoria "Lactate" nu a fost creată corect ca top-level.')
  if (!branzeturi || branzeturi.parentId !== lactate.id) throw new Error('"Branzeturi" nu e subcategorie a "Lactate".')
  if (!proaspete || proaspete.parentId !== lactate.id) throw new Error('"Proaspete" nu e subcategorie a "Lactate".')
  log('  OK: categoria Lactate + subcategoriile Branzeturi/Proaspete create corect.')

  const untBefore = afterCatalog.products.find((p) => p.canonicalName === 'Unt 200g')
  if (!untBefore) throw new Error('Produsul "Unt 200g" nu a fost creat din catalog.')
  if (untBefore.categoryId !== lactate.id || untBefore.subcategoryId !== proaspete.id) {
    throw new Error(`"Unt 200g" nu are categoria/subcategoria așteptată: ${JSON.stringify(untBefore)}`)
  }
  log('  OK: "Unt 200g" → Lactate › Proaspete, setat din catalog.')
  const productCountBefore = afterCatalog.products.length
  if (productCountBefore !== 6) throw new Error(`Aștept exact 6 produse după catalog, am găsit ${productCountBefore}.`)

  // --- pasul 2: import vanzari Mentor cu ACELEASI denumiri de produse ---
  log('Import vânzări (DISTRIBUTIE.xlsx, aceleași denumiri de produse)...')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, 1, { timeout: 60000, polling: 500 })
  log('  Import vânzări finalizat.')

  // --- pasul 3: verific ca nimic nu s-a schimbat la categorie/subcategorie ---
  const afterSales = await readDb(page)
  const productCountAfter = afterSales.products.length
  if (productCountAfter !== 6) {
    throw new Error(`Aștept tot 6 produse (fără duplicate) după importul de vânzări, am găsit ${productCountAfter}.`)
  }
  log('  OK: importul de vânzări nu a creat produse duplicate (a potrivit exact pe nume).')

  const untAfter = afterSales.products.find((p) => p.canonicalName === 'Unt 200g')
  if (!untAfter || untAfter.categoryId !== lactate.id || untAfter.subcategoryId !== proaspete.id) {
    throw new Error(`"Unt 200g" și-a schimbat categoria/subcategoria după import de vânzări: ${JSON.stringify(untAfter)}`)
  }
  log('  OK: "Unt 200g" e tot Lactate › Proaspete după import de vânzări — categoria a rămas sfântă.')

  for (const name of ['Telemea vaca 400g', 'Cascaval afumat', 'Smantana 20% 400g', 'Lapte integral 1L', 'Iaurt grecesc 150g']) {
    const before = afterCatalog.products.find((p) => p.canonicalName === name)
    const after = afterSales.products.find((p) => p.canonicalName === name)
    if (!before || !after) throw new Error(`Produsul "${name}" lipsește.`)
    if (before.categoryId !== after.categoryId || before.subcategoryId !== after.subcategoryId) {
      throw new Error(`Categoria produsului "${name}" s-a schimbat după import de vânzări.`)
    }
  }
  log('  OK: toate cele 6 produse din catalog și-au păstrat exact categoria/subcategoria.')

  // --- pasul 4: verific afisarea in Nomenclator produse (Lactate › Proaspete) ---
  await page.click('a:has-text("Nomenclator produse")')
  await page.waitForSelector('text=Unt 200g', { timeout: 15000 })
  await page.click('text=Unt 200g')
  await page.waitForSelector('text=Lactate › Proaspete', { timeout: 15000 })
  log('  OK: „Lactate › Proaspete” afișat corect în Nomenclator produse.')

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — catalogul de produse (categorie + subcategorie) rămâne sfânt, neatins de importurile de vânzări.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
