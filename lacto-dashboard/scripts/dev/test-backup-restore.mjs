// Test Etapa 6: Backup / Restore. Importa date, exporta un backup, modifica
// starea (import suplimentar), apoi restaureaza backup-ul si verifica ca
// starea bazei de date revine EXACT la ce era la momentul backup-ului
// (numar de tranzactii, batch-uri de import) - dovada ca restaurarea e reala,
// nu doar un mesaj de succes.
import { chromium } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
    log('DIALOG:', dialog.type(), dialog.message().slice(0, 80))
    await dialog.accept()
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')
  await page.click('a:has-text("Import date")')
  await page.waitForSelector('input[type=file]', { state: 'attached' })

  async function waitForBatchCount(expected) {
    await page.click('a:has-text("Istoric importuri")')
    await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length >= n, expected, { timeout: 60000, polling: 500 })
  }

  log('Importing DISTRIBUTIE.xlsx (3000 rânduri)...')
  const inputs = page.locator('input[type=file]')
  await inputs.nth(2).setInputFiles(`${FIX}/DISTRIBUTIE.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(1)
  log('Import finalizat (1 batch).')

  // --- export backup ---
  log('Exportă backup...')
  await page.click('a:has-text("Backup")')
  await page.waitForSelector('text=Export backup', { timeout: 15000 })
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('button:has-text("Descarcă backup")')])
  const backupPath = path.join(os.tmpdir(), `lacto-backup-test-${Date.now()}.json`)
  await download.saveAs(backupPath)
  const backupJson = JSON.parse(fs.readFileSync(backupPath, 'utf-8'))
  const backedUpTxCount = backupJson.tables.transactions.length
  const backedUpBatchCount = backupJson.tables.importBatches.length
  if (backedUpTxCount !== 3000) throw new Error(`Backup: aștept 3000 tranzacții, am găsit ${backedUpTxCount}`)
  if (backedUpBatchCount !== 1) throw new Error(`Backup: aștept 1 batch, am găsit ${backedUpBatchCount}`)
  log(`  OK: backup conține ${backedUpTxCount} tranzacții, ${backedUpBatchCount} batch.`)
  await page.waitForSelector('text=Backup descărcat cu succes.', { timeout: 10000 })

  // --- modifica starea: import suplimentar ---
  log('Import suplimentar (MAGAZINE_PROPRII.xlsx, 2000 rânduri) pentru a schimba starea...')
  await page.click('a:has-text("Import date")')
  await inputs.nth(1).setInputFiles(`${FIX}/MAGAZINE_PROPRII.xlsx`)
  await page.waitForSelector('text=Mapare coloane', { timeout: 15000 })
  await page.locator('button:has-text("Confirmă maparea")').click()
  await waitForBatchCount(2)
  log(`  Stare modificată: 2 batch-uri de import acum.`)

  // --- restaurare din backup ---
  log('Restaurez din backup-ul salvat...')
  await page.click('a:has-text("Backup")')
  await page.waitForSelector('text=Restaurare backup', { timeout: 15000 })
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Restaurează din fișier…")')])
  await fileChooser.setFiles(backupPath)
  await page.waitForSelector('text=Restaurare finalizată', { timeout: 20000 })
  log('  OK: mesaj de restaurare finalizată afișat.')

  // pagina se reincarca automat dupa restaurare (setTimeout de 1500ms in BackupPage) —
  // asteptam evenimentul real de load, nu doar textul "Dashboard" din sidebar-ul
  // care poate fi inca prezent pe pagina veche chiar inainte de reload.
  await page.waitForEvent('load', { timeout: 20000 })
  await page.waitForSelector('text=Dashboard', { timeout: 20000 })
  await page.waitForTimeout(500)

  log('Verific starea după restaurare (trebuie să corespundă backup-ului, nu stării modificate)...')
  await page.click('a:has-text("Istoric importuri")')
  await page.waitForSelector('table tbody tr', { timeout: 15000 })
  const batchRowsAfterRestore = await page.locator('table tbody tr').count()
  if (batchRowsAfterRestore !== 1) {
    throw new Error(`După restaurare aștept 1 batch (cel din backup), am găsit ${batchRowsAfterRestore}.`)
  }
  log(`  OK: ${batchRowsAfterRestore} batch de import (corespunde backup-ului, nu celor 2 din starea modificată).`)

  await page.click('a:has-text("Dashboard")')
  await page.waitForSelector('text=Compară cu', { timeout: 15000 })
  // luna curentă (implicit) nu are date în fixture — setăm un interval custom care acoperă tot.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.selectOption("select[aria-label='Selector perioadă']", 'custom')
    await page.waitForTimeout(300)
    if ((await page.locator('input[type=date]').count()) >= 2) break
  }
  const dashboardDateInputs = page.locator('input[type=date]')
  await dashboardDateInputs.nth(0).fill('2025-01-01')
  await dashboardDateInputs.nth(1).fill('2026-12-31')
  await page.waitForSelector('text=Total vânzări', { timeout: 15000 })
  await page.waitForTimeout(800)
  const totalTxText = await page.locator('div', { hasText: 'Nr. tranzacții' }).filter({ has: page.locator('.text-xl') }).last().locator('.text-xl').textContent()
  const totalTx = Number((totalTxText ?? '').replace(/\D/g, ''))
  if (totalTx !== 3000) {
    throw new Error(`După restaurare aștept 3000 tranzacții (din backup), am găsit ${totalTx}.`)
  }
  log(`  OK: ${totalTx} tranzacții — starea a fost restaurată exact din backup, nu din starea modificată (5000).`)

  fs.unlinkSync(backupPath)

  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — backup/restore funcționează complet: export real, restaurare completă și verificabilă.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
