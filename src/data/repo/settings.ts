import { db } from '@/data/db'
import {
  defaultScoreWeights,
  defaultShiftConfig,
  defaultStockThresholds,
  emptyCategoryGroupRules,
  emptyFuelDeliveryPlanConfig,
  emptyMonthTargets,
  type AppSettings,
  type FuelDeliveryPlanConfig,
  type MonthTargets,
  type StockThresholds,
} from '@/types/domain'

const SETTINGS_ID = 'app-settings' as const

const defaultSettings: AppSettings = {
  id: SETTINGS_ID,
  shiftConfig: defaultShiftConfig,
  salesMapping: null,
  purchaseMapping: null,
  stockMapping: null,
  invoiceMapping: null,
  categoryGroupRules: emptyCategoryGroupRules(),
  reportsAcknowledged: [],
  reportsGenerated: [],
  reportsVerified: [],
  defaultVatRatePct: 19,
  monthlyTargets: {},
  scoreWeights: defaultScoreWeights,
  stockThresholds: defaultStockThresholds,
  stockThresholdsByCategory: {},
  knownSuppliers: [],
  supplierDeliveryDays: {},
  tankReadingMapping: null,
  fuelMovementMapping: null,
  tankSettings: {},
  fuelDeliveryPlan: emptyFuelDeliveryPlanConfig(),
}

export function getStockThresholdsForCategory(settings: AppSettings, category: string): StockThresholds {
  return settings.stockThresholdsByCategory[category] ?? settings.stockThresholds
}

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(SETTINGS_ID)
  if (!existing) return defaultSettings
  // categoryGroupRules gets a new key whenever a new product group is added
  // (e.g. 'promotii', 'crossSellExcluded' were added after this feature
  // shipped) — a settings row saved before that key existed is missing it
  // entirely. The shallow spread below would otherwise overwrite the
  // complete defaults with that incomplete object wholesale, so every
  // caller that reads settings.categoryGroupRules[group] without a
  // fallback (import's group-guessing, Nomenclator's Grupuri pe categorie)
  // would crash on "Cannot read properties of undefined (reading 'length')"
  // for any group added after the user's settings were first saved.
  return {
    ...defaultSettings,
    ...existing,
    categoryGroupRules: { ...emptyCategoryGroupRules(), ...existing.categoryGroupRules },
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings)
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next = { ...current, ...patch }
  await db.settings.put(next)
  return next
}

export function getMonthTargets(settings: AppSettings, monthKey: string): MonthTargets {
  return settings.monthlyTargets[monthKey] ?? emptyMonthTargets()
}

export async function saveMonthTargets(monthKey: string, targets: MonthTargets): Promise<void> {
  const current = await getSettings()
  await updateSettings({ monthlyTargets: { ...current.monthlyTargets, [monthKey]: targets } })
}

// Merges a patch into fuelDeliveryPlan using a FRESH read of settings, not a
// value a caller may have captured earlier in a React render — the planner
// UI can fire its "choose a default period" effect before a just-loaded
// settings value has propagated to the component, and merging against a
// stale snapshot there would silently overwrite concurrently-saved fields
// (stocks, tanker parameters) with defaults. See saveMonthTargets above for
// the same fresh-read pattern.
export async function updateFuelDeliveryPlanConfig(patch: Partial<FuelDeliveryPlanConfig>): Promise<AppSettings> {
  const current = await getSettings()
  return updateSettings({ fuelDeliveryPlan: { ...current.fuelDeliveryPlan, ...patch } })
}
