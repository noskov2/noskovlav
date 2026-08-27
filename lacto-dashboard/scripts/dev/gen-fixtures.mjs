import * as XLSX from 'xlsx'
import fs from 'node:fs'

const HEADERS = [
  'Denumire client',
  'Cod client',
  'CUI',
  'Denumire articol',
  'Cod produs',
  'Cantitate',
  'Valoare vanzare',
  'Pret unitar',
  'Data document',
  'Nr. document',
  'Agent',
  'Judet',
  'Localitate',
]

const CLIENT_VARIANTS = [
  'ANABELLA',
  'ANABELA',
  'ANABELLA SRL',
  'ANABELLA S.R.L.',
  'ANABELLA IMPEX',
  'SC ANABELLA SRL',
]
const OTHER_CLIENTS = ['KAUFLAND', 'CARREFOUR', 'LIDL', 'PROFI', 'MEGA IMAGE', 'AUCHAN', 'SELGROS', 'METRO']
const PRODUCTS = [
  ['Telemea vaca 400g', 'Telemea'],
  ['Cascaval afumat', 'Cascaval'],
  ['Smantana 20% 400g', 'Smantana'],
  ['Unt 200g', 'Unt'],
  ['Lapte integral 1L', 'Lapte'],
  ['Iaurt grecesc 150g', 'Iaurt'],
]
const AGENTS = ['Popescu I.', 'Ionescu M.', 'Georgescu A.']
const JUDETE = ['Botosani', 'Suceava', 'Iasi', 'Neamt']

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)]
}

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randDate(rnd, from, to) {
  const t = from + rnd() * (to - from)
  const d = new Date(t)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function genRows(count, seed, useCommaDecimals) {
  const rnd = mulberry32(seed)
  const rows = [HEADERS]
  const from = new Date(2025, 0, 1).getTime()
  const to = new Date(2026, 6, 31).getTime()
  for (let i = 0; i < count; i++) {
    const client = rnd() < 0.15 ? pick(CLIENT_VARIANTS, rnd) : pick(OTHER_CLIENTS, rnd)
    const [productName] = pick(PRODUCTS, rnd)
    const qty = Math.round(rnd() * 500 + 1)
    const unitPrice = Math.round((10 + rnd() * 30) * 100) / 100
    const value = Math.round(qty * unitPrice * 100) / 100
    const fmt = (n) => (useCommaDecimals ? String(n).replace('.', ',') : n)
    rows.push([
      client,
      `CL${1000 + Math.floor(rnd() * 500)}`,
      `RO${10000000 + Math.floor(rnd() * 9000000)}`,
      productName,
      `PR${100 + Math.floor(rnd() * 50)}`,
      fmt(qty),
      fmt(value),
      fmt(unitPrice),
      randDate(rnd, from, to),
      `DOC${100000 + i}`,
      pick(AGENTS, rnd),
      pick(JUDETE, rnd),
      'Botosani',
    ])
  }
  return rows
}

function writeXlsx(filePath, rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filePath)
  console.log(`${filePath}: ${rows.length - 1} rânduri`)
}

const dir = process.argv[2]
fs.mkdirSync(dir, { recursive: true })

writeXlsx(`${dir}/RETELE_MARI_100k.xlsx`, genRows(100000, 1, false))
writeXlsx(`${dir}/MAGAZINE_PROPRII.xlsx`, genRows(4000, 2, true))
writeXlsx(`${dir}/DISTRIBUTIE.xlsx`, genRows(3000, 3, false))
writeXlsx(`${dir}/DISTRIBUTIE_2.xlsx`, genRows(2000, 4, true))
