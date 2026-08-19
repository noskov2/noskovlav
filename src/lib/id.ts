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
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
