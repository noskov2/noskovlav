import { normalizeHeader } from '../lib/ro-format'
import type { StandardFieldDef, StandardFieldId } from '../types'

/**
 * Câmpurile standard în care poate fi mapată orice coloană din Excel-urile
 * Mentor. Lista de `aliases` e folosită doar pentru sugestia automată de
 * mapare la primul import — utilizatorul poate oricând corecta (spec §3).
 */
export const STANDARD_FIELDS: StandardFieldDef[] = [
  {
    id: 'clientRaw',
    label: 'Client',
    required: true,
    type: 'string',
    aliases: ['denumire client', 'client standardizat', 'client', 'denumire partener', 'partener', 'cumparator', 'nume client'],
  },
  {
    id: 'clientCode',
    label: 'Cod client (Mentor)',
    required: false,
    type: 'string',
    aliases: ['cod client', 'client cod', 'id client', 'cod partener'],
  },
  {
    id: 'cui',
    label: 'CUI / CIF',
    required: false,
    type: 'string',
    aliases: ['cui', 'cif', 'cui/cif'],
  },
  {
    id: 'productRaw',
    label: 'Produs',
    required: true,
    type: 'string',
    aliases: ['articol', 'denumire articol', 'produs', 'denumire produs', 'nume produs'],
  },
  {
    id: 'productCode',
    label: 'Cod produs (Mentor)',
    required: false,
    type: 'string',
    aliases: ['cod produs', 'cod articol', 'sku', 'cod'],
  },
  {
    id: 'categoryRaw',
    label: 'Categorie',
    required: false,
    type: 'string',
    aliases: ['categorie', 'grupa', 'grupa produs', 'grupa de produse'],
  },
  {
    id: 'subcategoryRaw',
    label: 'Subcategorie',
    required: false,
    type: 'string',
    aliases: ['subcategorie', 'sub-categorie', 'sub categorie', 'subgrupa'],
  },
  {
    id: 'quantity',
    label: 'Cantitate',
    required: false,
    type: 'number',
    aliases: ['cantitate', 'cant', 'cantitate um', 'cant.'],
  },
  {
    id: 'value',
    label: 'Valoare',
    required: false,
    type: 'number',
    aliases: ['valoare', 'valoare vanzare', 'suma', 'val', 'valoare neta'],
  },
  {
    id: 'unitPrice',
    label: 'Preț unitar',
    required: false,
    type: 'number',
    aliases: ['pret', 'pret unitar', 'pret um', 'pret mediu', 'pret/um'],
  },
  {
    id: 'date',
    label: 'Data',
    required: true,
    type: 'date',
    aliases: ['data', 'data document', 'data factura', 'data documentului'],
  },
  {
    id: 'year',
    label: 'An (dacă nu există „Data" exactă)',
    required: false,
    type: 'number',
    aliases: ['anul', 'an'],
  },
  {
    id: 'month',
    label: 'Lună — număr (dacă nu există „Data" exactă)',
    required: false,
    type: 'number',
    aliases: ['numar luna', 'luna nr', 'nr luna', 'luna numar'],
  },
  {
    id: 'channelRaw',
    label: 'Canal (RETELE / MAGAZINE PROPRII / DISTRIBUȚIE)',
    required: false,
    type: 'string',
    aliases: ['canal standardizat', 'canal', 'canal vanzare'],
  },
  {
    id: 'documentNo',
    label: 'Nr. document',
    required: false,
    type: 'string',
    aliases: ['document', 'nr document', 'nr. document', 'numar document', 'factura'],
  },
  {
    id: 'agent',
    label: 'Agent',
    required: false,
    type: 'string',
    aliases: ['agent', 'agent vanzari', 'reprezentant'],
  },
  {
    id: 'county',
    label: 'Județ',
    required: false,
    type: 'string',
    aliases: ['judet'],
  },
  {
    id: 'locality',
    label: 'Localitate',
    required: false,
    type: 'string',
    aliases: ['localitate', 'oras', 'oras localitate'],
  },
]

export function fieldDef(id: StandardFieldId): StandardFieldDef {
  const def = STANDARD_FIELDS.find((f) => f.id === id)
  if (!def) throw new Error(`Câmp standard necunoscut: ${id}`)
  return def
}

/**
 * Propune o mapare automată coloană-Excel -> câmp-standard, pe baza
 * potrivirii denumirii antetului cu lista de aliasuri (spec §3: "propune
 * maparea coloanelor").
 */
export function autoDetectMapping(headers: string[]): Partial<Record<StandardFieldId, string>> {
  const normalizedHeaders = headers.map((h) => ({ header: h, norm: normalizeHeader(h) }))
  const mapping: Partial<Record<StandardFieldId, string>> = {}
  const usedHeaders = new Set<string>()

  for (const field of STANDARD_FIELDS) {
    const aliasesNorm = field.aliases.map((a) => normalizeHeader(a))
    let best: { header: string; score: number } | null = null

    for (const { header, norm } of normalizedHeaders) {
      if (usedHeaders.has(header) || norm === '') continue
      let score = 0
      if (aliasesNorm.includes(norm)) {
        score = 100
      } else if (aliasesNorm.some((a) => norm.startsWith(a) || a.startsWith(norm))) {
        score = 80
      } else if (aliasesNorm.some((a) => norm.includes(a) || a.includes(norm))) {
        score = 60
      }
      // La egalitate, preferă coloana "standardizată"/"unificată" — un fișier deja
      // consolidat are des perechi „Client" + „Client Standardizat" cu același scor,
      // iar a doua e cea de încredere.
      if (score > 0 && (norm.includes('STANDARDIZAT') || norm.includes('UNIFICAT'))) {
        score += 1
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { header, score }
      }
    }

    if (best) {
      mapping[field.id] = best.header
      usedHeaders.add(best.header)
    }
  }

  return mapping
}

/** Semnătură stabilă a listei de anteturi, pentru a detecta schimbarea structurii fișierului. */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => normalizeHeader(h)).join('||')
}
