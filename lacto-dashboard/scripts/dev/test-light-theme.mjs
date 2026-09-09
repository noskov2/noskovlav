// Verifica faptul ca aplicatia ramane mereu in tema deschisa (alba), chiar
// daca sistemul de operare are preferinta de "dark mode" activata.
import { chromium } from 'playwright'

const BASE = process.env.SMOKE_TEST_URL ?? 'http://localhost:5173'

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

async function main() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const page = await browser.newPage({ colorScheme: 'dark' })
  const pageErrors = []
  page.on('pageerror', (err) => {
    pageErrors.push(err.message)
    log('PAGE ERROR:', err.message)
  })

  await page.goto(BASE)
  await page.waitForSelector('text=Dashboard')

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  log('Fundal body cu preferința sistemului pe „dark":', bg)
  if (bg !== 'rgb(248, 250, 252)') {
    throw new Error(`Fundalul ar trebui să rămână alb-deschis (slate-50) indiferent de tema sistemului, am găsit: ${bg}`)
  }
  log('OK: aplicația rămâne albă chiar cu sistemul pe dark mode.')

  await page.click('a:has-text("Dashboard")')
  await page.waitForTimeout(300)
  if (pageErrors.length > 0) {
    throw new Error(`S-au înregistrat erori JS: ${pageErrors.join(' | ')}`)
  }

  await browser.close()
  log('DONE — tema deschisă e forțată corect, indiferent de preferința sistemului.')
}

main().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
