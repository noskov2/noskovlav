export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 10)
  const t = Date.now().toString(36)
  return `${prefix}${prefix ? '_' : ''}${t}${rnd}`
}

// Deterministic slug used as a stable id for name-keyed entities
// (products, cashiers) so re-importing the same name resolves to the
// same record instead of creating duplicates.
export function slugify(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    // NFD only decomposes SOME Romanian diacritics into base+combining-mark
    // (ă, â, î) — the modern ș/ț (comma below, U+0219/021B) never decompose
    // under Unicode's canonical NFD, so without this they'd survive the
    // strip below as a leftover non-ascii char and get collapsed to "-" by
    // the final replace — meaning "Vișine" and "Visine" (or the same word
    // typed with the older cedilla ş/ţ) would slugify to two DIFFERENT ids
    // for what a person reads as the exact same name. That's exactly the
    // kind of silent split that creates a "ghost" duplicate product record.
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
