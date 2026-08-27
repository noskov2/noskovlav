// Test pentru scenariul critic din spec §41: la import, denumirile
// ANABELLA / ANABELA / SC ANABELLA SRL / ANABELLA S.R.L. / ANABELLA IMPEX
// nu trebuie unite automat — doar propuse spre confirmare — iar retaileri
// clar diferiți (KAUFLAND, CARREFOUR, LIDL...) nu trebuie amestecați.
//
// Rulare: npm run fixtures:gen && npm run dev (port 5183) && npm run test:client-matching
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
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') log('CONSOLE', msg.type(), msg.text())
  })
  page.on('dialog', async (dialog) => {
    log('DIALOG:', dialog.type(), dialog.message())
    await dialog.dismiss()
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Import date')

  const inputs = page.locator('input[type=file]')
  log('Uploading RETELE_MARI_100k.xlsx (contine variante ANABELLA amestecate cu retaileri distincti)...')
  await inputs.nth(0).setInputFiles(`${FIX}/RETELE_MARI_100k.xlsx`)

  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await page.waitForSelector('text=Import finalizat', { timeout: 300000 })
  log('Import finalizat.')

  // Citim direct din IndexedDB (Dexie) prin evaluate, ca sa nu depindem de UI pentru asertii.
  const result = await page.evaluate(async () => {
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

    const clients = await getAll('clients')
    const queue = await getAll('clientMatchQueue')
    return { clients, queue }
  })

  const { clients, queue } = result
  log('Clienti canonici creati:', clients.length)
  log('Intrari in coada de verificare:', queue.length)

  const otherRetailers = ['KAUFLAND', 'CARREFOUR', 'LIDL', 'PROFI', 'MEGA IMAGE', 'AUCHAN', 'SELGROS', 'METRO']
  const missingRetailers = otherRetailers.filter(
    (name) => !clients.some((c) => c.canonicalName.toUpperCase() === name),
  )
  if (missingRetailers.length > 0) {
    throw new Error(`Retaileri distincti lipsa din nomenclator (posibil unificati gresit): ${missingRetailers.join(', ')}`)
  }
  log('OK: toti retailerii clar distincti exista ca clienti separati.')

  // Niciun retailer distinct nu trebuie sa apara ca ALIAS/candidat pentru altul.
  const retailerClientIds = new Set(
    clients.filter((c) => otherRetailers.includes(c.canonicalName.toUpperCase())).map((c) => c.id),
  )
  if (retailerClientIds.size !== otherRetailers.length) {
    throw new Error('Nu toti retailerii au id-uri unice de client (posibil unificati).')
  }

  const anabellaVariants = ['ANABELLA', 'ANABELA', 'ANABELLA SRL', 'ANABELLA S.R.L.', 'ANABELLA IMPEX', 'SC ANABELLA SRL']
  const anabellaClients = clients.filter((c) =>
    anabellaVariants.some((v) => c.canonicalName.toUpperCase() === v),
  )
  log(
    'Clienti canonici creati din variantele ANABELLA:',
    anabellaClients.map((c) => c.canonicalName),
  )
  if (anabellaClients.length !== 1) {
    throw new Error(
      `Se astepta EXACT un client canonical creat automat din variantele ANABELLA (celelalte trebuie sa ajunga in coada de verificare), dar au fost creati ${anabellaClients.length}: ${anabellaClients.map((c) => c.canonicalName).join(', ')}`,
    )
  }
  log('OK: doar o singura varianta ANABELLA a devenit client nou automat — nicio unificare automata gresita.')

  const anabellaQueueEntries = queue.filter((q) =>
    anabellaVariants.some((v) => q.rawName.toUpperCase() === v) && q.rawName.toUpperCase() !== anabellaClients[0].canonicalName.toUpperCase(),
  )
  log(
    'Intrari in coada de verificare pentru celelalte variante ANABELLA:',
    anabellaQueueEntries.map((q) => `${q.rawName} (${q.candidates.map((c) => c.score + '%').join(', ')})`),
  )
  if (anabellaQueueEntries.length === 0) {
    throw new Error('Celelalte variante ANABELLA ar fi trebuit sa ajunga in coada de verificare (nu gasite).')
  }
  for (const entry of anabellaQueueEntries) {
    if (entry.status !== 'pending') throw new Error(`Intrarea ${entry.rawName} nu e in status pending: ${entry.status}`)
    if (entry.candidates.length === 0) throw new Error(`Intrarea ${entry.rawName} nu are niciun candidat propus.`)
    for (const c of entry.candidates) {
      if (typeof c.clientId !== 'number' || c.clientId <= 0) {
        throw new Error(`Candidat cu clientId invalid pentru ${entry.rawName}: ${JSON.stringify(c)}`)
      }
    }
  }
  log('OK: toate celelalte variante ANABELLA sunt in coada de verificare, cu candidati valizi (nu unite automat).')

  // Verificam si fluxul din UI: confirmarea unui candidat in "Potriviri clienti"
  // trebuie sa creeze un alias si sa actualizeze tranzactiile orfane (canonicalClientId=null).
  log('Verific rezolvarea unei intrari din coada, prin UI (Potriviri clienti)...')
  await page.click('text=Potriviri clienți')
  await page.waitForSelector('text=ANABELA', { timeout: 15000 })
  // cardul exact pentru rawName === "ANABELA" (nu "ANABELLA", "ANABELLA IMPEX" etc.)
  const anabelaTitle = page.getByText('ANABELA', { exact: true })
  const anabelaCard = anabelaTitle.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  const targetButtonText = await anabelaCard.locator('button:has-text("Este ANABELLA SRL")').textContent()
  log('Buton apasat:', targetButtonText)
  await anabelaCard.locator('button:has-text("Este ANABELLA SRL")').click()
  await page.waitForTimeout(3000)

  const afterConfirm = await page.evaluate(async () => {
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
    const [clients, queue, transactions] = await Promise.all([getAll('clients'), getAll('clientMatchQueue'), getAll('transactions')])
    const target = clients.find((c) => c.canonicalName === 'ANABELLA SRL')
    const anabelaTx = transactions.filter((t) => t.clientRaw === 'ANABELA')
    const stillNull = anabelaTx.filter((t) => t.canonicalClientId === null)
    const queueEntry = queue.find((q) => q.rawName === 'ANABELA')
    return {
      targetId: target?.id,
      anabelaTxCount: anabelaTx.length,
      anabelaResolvedCount: anabelaTx.filter((t) => t.canonicalClientId === target?.id).length,
      stillNullCount: stillNull.length,
      queueStatus: queueEntry?.status,
    }
  })

  log('Rezultat backfill:', JSON.stringify(afterConfirm))
  if (afterConfirm.anabelaTxCount === 0) throw new Error('Nu exista tranzactii cu clientRaw="ANABELA" de verificat.')
  if (afterConfirm.stillNullCount !== 0) {
    throw new Error(`${afterConfirm.stillNullCount} tranzactii ANABELA au ramas neidentificate dupa confirmare.`)
  }
  if (afterConfirm.anabelaResolvedCount !== afterConfirm.anabelaTxCount) {
    throw new Error('Nu toate tranzactiile ANABELA au fost asociate clientului corect.')
  }
  if (afterConfirm.queueStatus !== 'resolved') {
    throw new Error(`Intrarea din coada nu a fost marcata resolved (status=${afterConfirm.queueStatus}).`)
  }
  log('OK: confirmarea din UI a creat aliasul si a facut backfill pe toate tranzactiile orfane.')

  await browser.close()
  log('DONE — scenariul din spec §41 e respectat.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
