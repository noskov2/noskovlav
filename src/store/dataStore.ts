import { create } from 'zustand'
import { listAllTransactions } from '@/data/repo/transactions'
import { listProducts } from '@/data/repo/products'
import { listCashiers } from '@/data/repo/cashiers'
import { listAllSupplierReceipts } from '@/data/repo/suppliers'
import { listImportBatches } from '@/data/repo/importBatches'
import { getSettings } from '@/data/repo/settings'
import type {
  AppSettings,
  Cashier,
  ImportBatch,
  Product,
  SupplierReceiptLine,
  TransactionLine,
} from '@/types/domain'

interface DataState {
  loaded: boolean
  loading: boolean
  transactions: TransactionLine[]
  products: Product[]
  cashiers: Cashier[]
  supplierReceipts: SupplierReceiptLine[]
  importBatches: ImportBatch[]
  settings: AppSettings | null
  productsById: Map<string, Product>
  cashiersById: Map<string, Cashier>
  refresh: () => Promise<void>
}

export const useDataStore = create<DataState>((set) => ({
  loaded: false,
  loading: false,
  transactions: [],
  products: [],
  cashiers: [],
  supplierReceipts: [],
  importBatches: [],
  settings: null,
  productsById: new Map(),
  cashiersById: new Map(),
  refresh: async () => {
    set({ loading: true })
    const [transactions, products, cashiers, supplierReceipts, importBatches, settings] =
      await Promise.all([
        listAllTransactions(),
        listProducts(),
        listCashiers(),
        listAllSupplierReceipts(),
        listImportBatches(),
        getSettings(),
      ])
    set({
      transactions,
      products,
      cashiers,
      supplierReceipts,
      importBatches,
      settings,
      productsById: new Map(products.map((p) => [p.id, p])),
      cashiersById: new Map(cashiers.map((c) => [c.id, c])),
      loaded: true,
      loading: false,
    })
  },
}))
