import { db } from '@/data/db'
import {
  defaultScoreWeights,
  defaultShiftConfig,
  defaultStockThresholds,
  emptyCategoryGroupRules,
  emptyMonthTargets,
  type AppSettings,
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
  categoryGroupRules: emptyCategoryGroupRules(),
  reportsAcknowledged: [],
  reportsGenerated: [],
  reportsVerified: [],
  defaultVatRatePct: 19,
  monthlyTargets: {},
  scoreWeights: defaultScoreWeights,
  stockThresholds: defaultStockThresholds,
  stockThresholdsByCategory: {},
}

export function getStockThresholdsForCategory(settings: AppSettings, category: string): StockThresholds {
  return settings.stockThresholdsByCategory[category] ?? settings.stockThresholds
}

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get(SETTINGS_ID)
  return existing ? { ...defaultSettings, ...existing } : defaultSettings
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
