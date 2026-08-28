// Genereaza un fisier Excel "consolidat" (deja unificat pe toate cele 3 canale,
// cu Canal Standardizat / Client Standardizat / Categorie / Subcategorie per
// rand, fara coloana de Data exacta — doar Anul + Numar Luna), dupa modelul
// fisierului atasat de utilizator, pentru testarea importului dedicat.
import * as XLSX from 'xlsx'
import fs from 'node:fs'

const HEADERS = [
  'Anul', 'Luna', 'Numar Luna', 'Trimestru', 'Agent de pe document',
  'Canal vanzare', 'Canal Standardizat', 'Client', 'Client Standardizat',
  'Articol', 'Subcategorie', 'Categorie', 'TOTAL MASA (cantitate)',
  'VALOARE LEI', 'Pret Mediu Unitar', 'Tip Tranzactie', 'Oras',
]

const MONTH_NAMES = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie']

const CHANNELS = ['RETELE', 'MAGAZINE PROPRII', 'DISTRIBUTIE']
// Aceiasi clienti ca in gen-fixtures.mjs, pentru a testa suprapunerea cu importurile obisnuite.
const CLIENTS = ['KAUFLAND', 'CARREFOUR', 'LIDL', 'A - PROPOS S.R.L.', 'ANABELLA SRL']
// Aceleasi produse ca in gen-fixtures.mjs (PRODUCTS), pentru suprapunere.
const PRODUCTS = [
  ['Telemea vaca 400g', 'Lactate', 'Branzeturi'],
  ['Cascaval afumat', 'Lactate', 'Branzeturi'],
  ['Smantana 20% 400g', 'Lactate', 'Proaspete'],
  ['Unt 200g', 'Lactate', 'Proaspete'],
  ['Lapte integral 1L', 'Lactate', 'Proaspete'],
  ['Iaurt grecesc 150g', 'Lactate', 'Proaspete'],
]
const AGENTS = ['Popescu I.', 'Ionescu M.', 'PARII CRISTIAN']
const ORASE = ['Botosani', 'Suceava', 'NESPECIFICAT']

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(arr, rnd) {
  return arr[Math.floor(rnd() * arr.length)]
}

const rnd = mulberry32(7)
const rows = [HEADERS]
const count = 300
for (let i = 0; i < count; i++) {
  const year = 2026
  const month = 1 + Math.floor(rnd() * 7) // Ian-Iul 2026
  const channel = pick(CHANNELS, rnd)
  const client = pick(CLIENTS, rnd)
  const [product, categorie, subcategorie] = pick(PRODUCTS, rnd)
  const qty = Math.round((rnd() * 500 + 1) * 10) / 10
  const unitPrice = Math.round((10 + rnd() * 30) * 100) / 100
  const value = Math.round(qty * unitPrice * 100) / 100
  rows.push([
    String(year),
    MONTH_NAMES[month - 1],
    String(month),
    String(Math.ceil(month / 3)),
    pick(AGENTS, rnd),
    channel,
    channel,
    client,
    client,
    product,
    subcategorie,
    categorie,
    String(qty),
    String(value),
    String(unitPrice),
    'VANZARE',
    pick(ORASE, rnd),
  ])
}

const dir = process.argv[2]
fs.mkdirSync(dir, { recursive: true })
const ws = XLSX.utils.aoa_to_sheet(rows)
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
const filePath = `${dir}/CONSOLIDATED_TEST.xlsx`
XLSX.writeFile(wb, filePath)
console.log(`${filePath}: ${rows.length - 1} rânduri`)
