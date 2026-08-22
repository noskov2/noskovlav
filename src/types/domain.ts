// Core domain types shared across the app.
// Kept storage-agnostic on purpose: today they are persisted in IndexedDB
// (see src/data/db.ts), but nothing here depends on Dexie so this layer can
// be pointed at a REST/SQL backend later without touching KPI/UI code.

export type ShiftNumber = 1 | 2

export interface ProductGroups {
  cafea: boolean
  dulciuriVitrina: boolean
  sandwich: boolean
  limonadaCeai: boolean
  carburant: boolean
  gpl: boolean
  promotii: boolean
  // True for lines that must NOT count as "marfă" for cross-sell purposes —
  // SGR/garanție, discounturi, taxe, linii tehnice, retururi. Without this,
  // any non-fuel line (including these) counted as cross-sell "marfă",
  // inflating the cross-sell %.
  crossSellExcluded: boolean
}

export const emptyGroups = (): ProductGroups => ({
  cafea: false,
  dulciuriVitrina: false,
  sandwich: false,
  limonadaCeai: false,
  carburant: false,
  gpl: false,
  promotii: false,
  crossSellExcluded: false,
})

// Which raw Categorie values (as they appear in Product.category) belong to
// each special group. Lets a station whose POS export already has a clean
// category column ("DULCIURI VITRINA", "CAFELE", ...) assign a whole
// category to a group in one action, instead of ticking every product.
export type CategoryGroupRules = Record<keyof ProductGroups, string[]>

export const emptyCategoryGroupRules = (): CategoryGroupRules => ({
  cafea: [],
  dulciuriVitrina: [],
  sandwich: [],
  limonadaCeai: [],
  carburant: [],
  gpl: [],
  promotii: [],
  crossSellExcluded: [],
})

export interface Product {
  id: string // stable slug derived from name, or uuid
  name: string
  category: string
  subcategory: string
  purchasePrice: number | null
  salePrice: number | null
  currentStock: number | null
  supplier: string
  active: boolean
  groups: ProductGroups
  aliases: string[] // raw product strings seen in imports, mapped to this product
  autoCreated: boolean // true if created implicitly during import, not yet reviewed
  vatRatePct: number | null // per-product VAT override; null = use AppSettings.defaultVatRatePct
  createdAt: number
  updatedAt: number
}

export interface Cashier {
  id: string
  name: string
  aliases: string[]
  active: boolean
  teamId: string | null
  createdAt: number
}

export interface Team {
  id: string
  name: string
  createdAt: number
}

export interface ShiftConfig {
  shift1Start: string // "HH:mm"
  shift1End: string
  shift2Start: string
  shift2End: string
}

export const defaultShiftConfig: ShiftConfig = {
  shift1Start: '07:00',
  shift1End: '19:00',
  shift2Start: '19:00',
  shift2End: '07:00',
}

// A single line item of a receipt/transaction, after normalization from Excel.
export interface TransactionLine {
  id: string
  importBatchId: string
  date: string // YYYY-MM-DD
  time: string // HH:mm:ss
  timestamp: number // epoch ms, used for sorting/range filtering
  cashierRaw: string
  cashierId: string
  receiptNo: string
  productRaw: string
  productId: string
  categoryRaw: string
  quantity: number
  value: number // sale value (as exported, VAT-inclusive unless configured otherwise)
  valueNoVat: number | null
  purchasePriceUnit: number | null // unit purchase price if present in the import
  shift: ShiftNumber | null
  promotionRaw: string | null // raw value from the mapped "promoție" column, if configured
  hasReceiptNo: boolean // false when the source row had no usable bon number — this line could not be reliably grouped into a real multi-line receipt
  fingerprint: string // dedup key: date+time+cashierRaw+receiptNo+productRaw+quantity+value
}

export type ImportKind = 'sales' | 'purchases' | 'stock'

export interface ImportBatch {
  id: string
  filename: string
  kind: ImportKind
  importedAt: number
  rowCount: number
  dateMin: string | null
  dateMax: string | null
  fileHash: string | null // SHA-256 of the parsed rows, to flag re-importing the exact same file
  duplicateRowCount: number // rows skipped because an identical transaction already existed
  invalidRowCount: number // rows skipped for missing/invalid required fields
  newProductCount: number
  newCashierCount: number
}

// Column mapping: maps a logical field to the header name found in the user's Excel file.
export interface SalesColumnMapping {
  cashier: string
  datetime: string | null
  date: string | null
  time: string | null
  receiptNo: string
  product: string
  category: string | null
  quantity: string
  value: string
  purchasePrice: string | null
  valueNoVat: string | null
  promotion: string | null // column that says which promotion (if any) a line belongs to
}

export interface PurchaseColumnMapping {
  product: string
  supplier: string
  date: string
  quantity: string
  price: string
}

export interface SupplierReceiptLine {
  id: string
  importBatchId: string
  productId: string
  productRaw: string
  supplier: string
  date: string // YYYY-MM-DD
  quantity: number
  price: number // unit purchase price
}

export interface StockColumnMapping {
  product: string
  quantity: string
  salePrice: string | null
  // The stock/nomenclature export's own category column, if present — this
  // is treated as the authoritative category for a product (it overwrites
  // whatever a sales import or heuristic had guessed), since this file is
  // typically the station's real product master list.
  category: string | null
}

// A snapshot row: "this product had this much stock, at this sale price,
// as of this exact date/time" — the date/time is chosen by the user at
// import time (not read from the file), so several snapshots over time
// never get mixed up in calculations.
export interface StockSnapshotLine {
  id: string
  importBatchId: string
  asOf: number // epoch ms, user-selected "valid as of" moment for the whole import
  productId: string
  productRaw: string
  quantity: number
  salePrice: number | null
}

// A monthly target set for one scope (the station, or one team). Every
// field is optional — leaving one blank just means "no target set for this
// metric", not zero, so Dashboard/Forecast skip fields that were never
// configured instead of showing a misleading 0% pace.
export interface TargetSet {
  totalSales: number | null
  goodsSales: number | null
  gplValue: number | null
  crossSellPct: number | null
  coffeeCount: number | null
  sandwichCount: number | null
  grossProfit: number | null
  avgReceiptValue: number | null
}

export const emptyTargetSet = (): TargetSet => ({
  totalSales: null,
  goodsSales: null,
  gplValue: null,
  crossSellPct: null,
  coffeeCount: null,
  sandwichCount: null,
  grossProfit: null,
  avgReceiptValue: null,
})

export interface MonthTargets {
  station: TargetSet
  byTeam: Record<string, TargetSet> // teamId -> TargetSet
}

export const emptyMonthTargets = (): MonthTargets => ({ station: emptyTargetSet(), byTeam: {} })

// Weights used to combine each normalized cross-sell metric into the 0-100
// cashier Performance Score (see kpi/cashierScore.ts). Values are relative
// (not required to sum to 100 — the score computation normalizes by their
// sum), so a station can emphasize e.g. cross-sell over cafea without
// having to re-balance every other weight by hand.
export interface ScoreWeights {
  salesPerShift: number
  crossSellPct: number
  coffeePer100: number
  sandwichPer100: number
  vitrinaPer100: number
  promoPer100: number
}

export const defaultScoreWeights: ScoreWeights = {
  salesPerShift: 30,
  crossSellPct: 30,
  coffeePer100: 15,
  sandwichPer100: 15,
  vitrinaPer100: 5,
  promoPer100: 5,
}

// Days-of-Stock thresholds used to classify a product's stock risk (see
// kpi/stockRotation.ts). ruptureDays/lowDays/overstockDays are strictly
// increasing: below ruptureDays = risc ruptură, below lowDays = stoc
// scăzut, above overstockDays = suprastoc, everything between = sănătos.
export interface StockThresholds {
  ruptureDays: number
  lowDays: number
  overstockDays: number
}

export const defaultStockThresholds: StockThresholds = { ruptureDays: 7, lowDays: 14, overstockDays: 60 }

export interface AppSettings {
  id: 'app-settings' // singleton row
  shiftConfig: ShiftConfig
  salesMapping: SalesColumnMapping | null
  purchaseMapping: PurchaseColumnMapping | null
  stockMapping: StockColumnMapping | null
  categoryGroupRules: CategoryGroupRules
  reportsAcknowledged: string[] // "YYYY-MM" months whose report banner was dismissed/downloaded
  defaultVatRatePct: number // used to derive ex-VAT sales value when the import has no "Valoare fără TVA" column and the product has no override
  monthlyTargets: Record<string, MonthTargets> // "YYYY-MM" -> targets for that month
  scoreWeights: ScoreWeights
  stockThresholds: StockThresholds // global default
  stockThresholdsByCategory: Record<string, StockThresholds> // per-category override, only for categories explicitly customized
}
