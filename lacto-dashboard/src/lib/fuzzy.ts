import { normalizeForCompare } from './ro-format'

/**
 * Algoritm de fuzzy matching pentru denumiri de clienți (spec §6).
 * Combină Levenshtein, Jaro-Winkler și potrivire pe tokeni pentru un
 * confidenceScore 0-100. NU decide singur unificarea — doar propune
 * (spec §38: „regulă critică" — merge-ul automat se face doar pe cod/CUI/alias
 * confirmat/nume normalizat identic, niciodată doar pe scor fuzzy).
 */

// Forme juridice care se ignoră la scorul fuzzy (spec §6) — dar NU la
// normalizarea de bază folosită pentru identitate exactă, unde contează
// literal ce a fost importat.
const LEGAL_FORM_TOKENS = new Set(['SRL', 'SA', 'SC'])

/** Tokeni pentru comparație fuzzy: fără forme juridice, fără spații redundante. */
export function fuzzyTokens(raw: string): string[] {
  // eliminăm punctele înainte de normalizare, ca "S.R.L." -> "SRL" (nu "S R L")
  const noDots = raw.replace(/\./g, '')
  const norm = normalizeForCompare(noDots)
  return norm.split(' ').filter((t) => t.length > 0 && !LEGAL_FORM_TOKENS.has(t))
}

export function fuzzyKey(raw: string): string {
  return fuzzyTokens(raw).join(' ')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

/** Jaro similarity (0-1). */
function jaro(a: string, b: string): number {
  if (a === b) return 1
  const aLen = a.length
  const bLen = b.length
  if (aLen === 0 || bLen === 0) return 0

  const matchDistance = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1)
  const aMatches = new Array<boolean>(aLen).fill(false)
  const bMatches = new Array<boolean>(bLen).fill(false)

  let matches = 0
  for (let i = 0; i < aLen; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, bLen)
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }

  return (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3
}

/** Jaro-Winkler similarity (0-1) — bonus pentru prefix comun (max 4 caractere). */
function jaroWinkler(a: string, b: string): number {
  const jaroSim = jaro(a, b)
  let prefix = 0
  const maxPrefix = Math.min(4, a.length, b.length)
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++
  return jaroSim + prefix * 0.1 * (1 - jaroSim)
}

/** Token-sort ratio: compară tokenii sortați alfabetic (insensibil la ordine). */
function tokenSortRatio(tokensA: string[], tokensB: string[]): number {
  const sortedA = [...tokensA].sort().join(' ')
  const sortedB = [...tokensB].sort().join(' ')
  return levenshteinRatio(sortedA, sortedB)
}

/**
 * Similaritate "soft" pe tokeni: fiecare token din A e potrivit cu cel mai
 * apropiat token din B (Jaro-Winkler), nu doar exact (Jaccard clasic).
 * Necesar pentru denumiri cu un singur cuvânt (ex. ANABELA vs ANABELLA), unde
 * un Jaccard exact ar da 0 deși cuvintele sunt aproape identice.
 */
function tokenSetSoftOverlap(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const bestMatch = (from: string[], to: string[]) =>
    from.reduce((sum, t) => sum + Math.max(...to.map((o) => jaroWinkler(t, o))), 0) / from.length

  return (bestMatch(tokensA, tokensB) + bestMatch(tokensB, tokensA)) / 2
}

/**
 * Scor de încredere 0-100 că `raw` (candidat nou) este aceeași entitate cu
 * `canonical` (client deja existent). Combină similaritate la nivel de
 * caracter (Jaro-Winkler, prinde greșeli de tastare tip ANABELA/ANABELLA) cu
 * similaritate la nivel de tokeni (token-sort, token-set).
 */
export function confidenceScore(raw: string, canonical: string): number {
  const tokensA = fuzzyTokens(raw)
  const tokensB = fuzzyTokens(canonical)
  const keyA = tokensA.join(' ')
  const keyB = tokensB.join(' ')

  if (keyA === keyB && keyA.length > 0) return 100

  // Jaro-Winkler singur e prea îngăduitor pentru cuvinte scurte diferite care
  // împart câteva litere în aceeași fereastră (ex. KAUFLAND vs AUCHAN -> 72%
  // doar pe Jaro-Winkler). Levenshtein (distanță de editare strictă) nu are
  // aceeași slăbiciune, deci luăm minimul dintre cele două ca semnal de bază.
  const charSim = Math.min(jaroWinkler(keyA, keyB), levenshteinRatio(keyA, keyB))
  const sortSim = tokenSortRatio(tokensA, tokensB)
  const setSim = tokenSetSoftOverlap(tokensA, tokensB)

  const combined = 0.4 * charSim + 0.3 * sortSim + 0.3 * setSim
  return Math.round(Math.max(0, Math.min(1, combined)) * 100)
}

/** Prag minim pentru a propune un candidat în coada de verificare (spec §7). */
export const CANDIDATE_THRESHOLD = 60

export interface ScoredCandidate<T> {
  item: T
  score: number
}

/** Găsește cei mai buni candidați dintr-o listă, sortați descrescător după scor. */
export function findBestCandidates<T>(
  raw: string,
  items: T[],
  getName: (item: T) => string,
  limit = 5,
): ScoredCandidate<T>[] {
  const scored = items.map((item) => ({ item, score: confidenceScore(raw, getName(item)) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.filter((c) => c.score >= CANDIDATE_THRESHOLD).slice(0, limit)
}
