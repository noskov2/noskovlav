import { db } from '@/data/db'
import { defaultShiftConfig, emptyCategoryGroupRules, type AppSettings } from '@/types/domain'

const SETTINGS_ID = 'app-settings' as const

const defaultSettings: AppSettings = {
  id: SETTINGS_ID,
  shiftConfig: defaultShiftConfig,
  salesMapping: null,
  purchaseMapping: null,
  stockMapping: null,
  categoryGroupRules: emptyCategoryGroupRules(),
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
