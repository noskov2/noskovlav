import type { FuelType } from '@/types/domain'

// Classifies a free-text "Carburant"/"Produs" value into one of the
// station's known fuel buckets. Keyword-based rather than an exact-match
// table so it keeps working across "MOTORINA", "Motorina E 5", "Diesel",
// etc. without needing every real product name enumerated.
export function classifyFuel(raw: string): FuelType {
  const s = raw.toLowerCase()
  if (s.includes('motorina') || s.includes('motorină') || s.includes('diesel')) return 'MOTORINA'
  if (s.includes('benzina') || s.includes('benzină')) return 'BENZINA'
  if (s.includes('gpl') || s.includes('gaz petrolier') || s.includes('lichefiat')) return 'GPL'
  return 'ALT'
}

export const FUEL_LABELS: Record<FuelType, string> = {
  MOTORINA: 'Motorină',
  BENZINA: 'Benzină',
  GPL: 'GPL',
  ALT: 'Alt carburant',
}
