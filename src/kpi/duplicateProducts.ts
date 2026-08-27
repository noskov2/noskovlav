import type { Product } from '@/types/domain'

// Same normalization approach as kpi/watchlist.ts (diacritic/case-insensitive,
// numbers split off from glued units) so "Cappy Pulpy Piersica A 1.5L" and
// "CAPPY PULPY PIERSICI PET 1,5 L" tokenize to comparable word sets despite
// different punctuation/spacing conventions across import files.
const STOPWORDS = new Set(['cu', 'si', 'de', 'la', 'fara', 'pe', 'a'])

function normalize(s: string): string {
  return s
    .toLowerCase()
    // NFD only decomposes SOME Romanian diacritics into base+combining-mark
    // (ă, â, î) — the modern ș/ț (comma below, U+0219/021B) never decompose
    // under Unicode's canonical NFD, so they'd survive the strip below
    // untouched while the same word typed with the older cedilla ş/ţ (which
    // DO decompose) or with no diacritics at all would end up on a
    // different token. Map every variant explicitly.
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' si ')
    .replace(/[.,]/g, ' ')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

// Two tokens count as a match if identical, or close enough to plausibly be
// the same word misspelled/mistyped (e.g. "piersica" vs "piersici" — the
// singular/plural slip that's a common source of real accidental
// duplicates). Short tokens (<4 chars) never fuzzy-match, since a distance-1
// typo on something like "l" or "pet" is meaningless.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = new Array(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1])
      prev = tmp
    }
  }
  return dp[n]
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen < 4) return 0
  const dist = levenshtein(a, b)
  if (dist <= 1) return 0.85
  if (dist <= 2 && maxLen >= 7) return 0.6
  return 0
}

// Greedy best-match overlap between two token sets, each token consumed at
// most once, normalized by the longer name's token count — so a name that's
// a strict subset of another (missing/extra words, e.g. a different pack
// size) scores lower than a true near-duplicate.
function softOverlapScore(tokens1: string[], tokens2: string[]): number {
  const pool = [...tokens2]
  let total = 0
  for (const tok of tokens1) {
    let bestIdx = -1
    let bestScore = 0
    for (let k = 0; k < pool.length; k++) {
      const s = tokenSimilarity(tok, pool[k])
      if (s > bestScore) {
        bestScore = s
        bestIdx = k
      }
    }
    if (bestIdx >= 0) {
      total += bestScore
      pool.splice(bestIdx, 1)
    }
  }
  const denom = Math.max(tokens1.length, tokens2.length)
  return denom > 0 ? total / denom : 0
}

export interface DuplicateCandidatePair {
  a: Product
  b: Product
  score: number
}

// High on purpose: a beverage-heavy Nomenclator has dozens of same-brand,
// same-pack-size products that differ only in flavor word ("CAPPY PULPY
// PIERSICĂ 1.5L" vs "CAPPY PULPY PORTOCALE 1.5L") — those already share
// every token except one, scoring ~0.83, so the threshold has to sit above
// that band to avoid flooding the panel with unrelated products that just
// happen to share a brand and a size. A real typo/spelling-variant
// duplicate (e.g. "PIERSICA" vs "PIERSICI") scores ~0.97+.
const DEFAULT_MIN_SCORE = 0.9

/**
 * Flags pairs of active products whose names look like the same real item
 * recorded twice under slightly different spellings — the failure mode
 * behind "this product has real recent sales but also shows up as no sale
 * in 90 days": one raw name variant per import run resolved to two separate
 * Product records instead of one, so sales/stock get split between them.
 *
 * Uses an inverted index over exact tokens to only score pairs that share at
 * least one real word — turns what would be an O(n²) full scan into
 * something proportional to how many products actually look alike, which
 * matters once a station's Nomenclator reaches several hundred products.
 */
export function findPossibleDuplicateProducts(
  products: Product[],
  minScore: number = DEFAULT_MIN_SCORE,
): DuplicateCandidatePair[] {
  const tokensByProduct = new Map<string, string[]>()
  const invertedIndex = new Map<string, string[]>()

  for (const p of products) {
    if (!p.active) continue
    const toks = tokenize(p.name)
    if (toks.length === 0) continue
    tokensByProduct.set(p.id, toks)
    for (const t of new Set(toks)) {
      // Skip very short/numeric tokens as index keys (pack sizes like "1",
      // "5", "l" are shared by huge swaths of unrelated products and would
      // blow up the candidate set) — they still count toward the score.
      if (t.length < 3) continue
      const arr = invertedIndex.get(t)
      if (arr) arr.push(p.id)
      else invertedIndex.set(t, [p.id])
    }
  }

  const byId = new Map(products.map((p) => [p.id, p]))
  const seenPairs = new Set<string>()
  const results: DuplicateCandidatePair[] = []

  for (const [id1, toks1] of tokensByProduct) {
    const candidateIds = new Set<string>()
    for (const t of toks1) {
      if (t.length < 3) continue
      for (const id2 of invertedIndex.get(t) ?? []) {
        if (id2 !== id1) candidateIds.add(id2)
      }
    }
    for (const id2 of candidateIds) {
      const pairKey = id1 < id2 ? `${id1}|${id2}` : `${id2}|${id1}`
      if (seenPairs.has(pairKey)) continue
      seenPairs.add(pairKey)
      const toks2 = tokensByProduct.get(id2)
      if (!toks2) continue
      const score = softOverlapScore(toks1, toks2)
      if (score >= minScore) {
        results.push({ a: byId.get(id1)!, b: byId.get(id2)!, score })
      }
    }
  }

  return results.sort((x, y) => y.score - x.score)
}
