import type { Product, TransactionLine } from '@/types/domain'
import { fuelProductIds, productIdsInGroup } from '@/kpi/productGroups'

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

const MOTORINA_KEYWORDS = ['motorina', 'diesel']
const BENZINA_KEYWORDS = ['benzina', 'petrol', 'euro95', 'euro 95', 'premium', 'optim', 'jetane', 'v-power', 'vpower', 'excellium']
const GPL_KEYWORDS = ['gpl']

export type FuelTypeKey = 'motorina' | 'benzina' | 'gpl' | 'altul'

export const FUEL_TYPE_LABELS: Record<FuelTypeKey, string> = {
  motorina: 'Motorină',
  benzina: 'Benzină',
  gpl: 'GPL',
  altul: 'Alt combustibil',
}

// Splits every fuel product into Motorină / Benzină / GPL / Alt combustibil.
// GPL is recognized either by the dedicated "GPL" group flag OR by name —
// a station manager who never manually ticked that checkbox (only
// "Carburant") would otherwise see their GPL silently land in "Alt
// combustibil" instead of the GPL row, which is exactly the "GPL shows 0L"
// symptom this mirrors for the group-flag path. Motorină/Benzină are
// name-matched the same way coffee/sandwich variants are, since there's no
// separate group for them. Nothing silently drops: any fuel product that
// doesn't match a specific keyword lands in "Alt combustibil" rather than
// disappearing from the totals.
export function resolveFuelTypeIds(products: Product[]): Record<FuelTypeKey, Set<string>> {
  const fuelIds = fuelProductIds(products)
  const gplIds = productIdsInGroup(products, 'gpl')
  const motorina = new Set<string>()
  const benzina = new Set<string>()
  const gpl = new Set<string>()
  const altul = new Set<string>()

  for (const p of products) {
    if (!fuelIds.has(p.id)) continue
    const name = norm(p.name)
    if (gplIds.has(p.id) || GPL_KEYWORDS.some((k) => name.includes(k))) {
      gpl.add(p.id)
      continue
    }
    if (MOTORINA_KEYWORDS.some((k) => name.includes(k))) motorina.add(p.id)
    else if (BENZINA_KEYWORDS.some((k) => name.includes(k))) benzina.add(p.id)
    else altul.add(p.id)
  }

  return { motorina, benzina, gpl, altul }
}

export interface FuelTypeStat {
  value: number
  quantity: number
}

export interface FuelBreakdown {
  motorina: FuelTypeStat
  benzina: FuelTypeStat
  gpl: FuelTypeStat
  altul: FuelTypeStat
  total: FuelTypeStat
}

export function computeFuelBreakdown(transactions: TransactionLine[], products: Product[]): FuelBreakdown {
  const ids = resolveFuelTypeIds(products)
  const breakdown: FuelBreakdown = {
    motorina: { value: 0, quantity: 0 },
    benzina: { value: 0, quantity: 0 },
    gpl: { value: 0, quantity: 0 },
    altul: { value: 0, quantity: 0 },
    total: { value: 0, quantity: 0 },
  }
  for (const t of transactions) {
    let key: FuelTypeKey | null = null
    if (ids.motorina.has(t.productId)) key = 'motorina'
    else if (ids.benzina.has(t.productId)) key = 'benzina'
    else if (ids.gpl.has(t.productId)) key = 'gpl'
    else if (ids.altul.has(t.productId)) key = 'altul'
    if (!key) continue
    breakdown[key].value += t.value
    breakdown[key].quantity += t.quantity
    breakdown.total.value += t.value
    breakdown.total.quantity += t.quantity
  }
  return breakdown
}
