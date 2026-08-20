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
}

export const emptyGroups = (): ProductGroups => ({
  cafea: false,
  dulciuriVitrina: false,
  sandwich: false,
  limonadaCeai: false,
  carburant: false,
  gpl: false,
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

export interface AppSettings {
  id: 'app-settings' // singleton row
  shiftConfig: ShiftConfig
  salesMapping: SalesColumnMapping | null
  purchaseMapping: PurchaseColumnMapping | null
  stockMapping: StockColumnMapping | null
  categoryGroupRules: CategoryGroupRules
}
