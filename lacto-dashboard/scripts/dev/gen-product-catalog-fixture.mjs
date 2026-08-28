// Genereaza un mic fisier Excel cu catalogul de produse (denumire + categorie +
// subcategorie), folosind exact aceleasi denumiri de produse ca in gen-fixtures.mjs
// (DISTRIBUTIE.xlsx etc.), ca sa poata fi testata regula "sfanta": categoria
// setata aici nu trebuie niciodata suprascrisa de un import de vanzari Mentor.
import * as XLSX from 'xlsx'
import fs from 'node:fs'

const HEADERS = ['Denumire produs', 'Categorie', 'Subcategorie']

const CATALOG = [
  ['Telemea vaca 400g', 'Lactate', 'Branzeturi'],
  ['Cascaval afumat', 'Lactate', 'Branzeturi'],
  ['Smantana 20% 400g', 'Lactate', 'Proaspete'],
  ['Unt 200g', 'Lactate', 'Proaspete'],
  ['Lapte integral 1L', 'Lactate', 'Proaspete'],
  ['Iaurt grecesc 150g', 'Lactate', 'Proaspete'],
]

const dir = process.argv[2]
fs.mkdirSync(dir, { recursive: true })

const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...CATALOG])
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Catalog')
const filePath = `${dir}/CATALOG_PRODUSE.xlsx`
XLSX.writeFile(wb, filePath)
console.log(`${filePath}: ${CATALOG.length} produse`)
