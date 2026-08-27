import { create } from 'zustand'
import { listAllTransactions } from '@/data/repo/transactions'
import { listProducts } from '@/data/repo/products'
import { listCashiers } from '@/data/repo/cashiers'
import { listTeams } from '@/data/repo/teams'
import { listAllSupplierReceipts } from '@/data/repo/suppliers'
import { listAllStockSnapshots } from '@/data/repo/stockSnapshots'
import { listImportBatches } from '@/data/repo/importBatches'
import { getSettings } from '@/data/repo/settings'
import { listMonthSnapshots } from '@/data/repo/monthSnapshots'
import { listClients } from '@/data/repo/clients'
import { listAllClientInvoices } from '@/data/repo/clientInvoices'
import { ensureDefaultTeamsSeeded } from '@/data/seedTeams'
import type {
  AppSettings,
  Cashier,
  Client,
  ClientInvoiceLine,
  ImportBatch,
  MonthSnapshot,
  Product,
  StockSnapshotLine,
  SupplierReceiptLine,
  Team,
  TransactionLine,
} from '@/types/domain'

interface DataState {
  loaded: boolean
  loading: boolean
  transactions: TransactionLine[]
  products: Product[]
  cashiers: Cashier[]
  teams: Team[]
  supplierReceipts: SupplierReceiptLine[]
  stockSnapshots: StockSnapshotLine[]
  importBatches: ImportBatch[]
  settings: AppSettings | null
  monthSnapshots: MonthSnapshot[]
  clients: Client[]
  clientInvoices: ClientInvoiceLine[]
  productsById: Map<string, Product>
  cashiersById: Map<string, Cashier>
  teamsById: Map<string, Team>
  refresh: () => Promise<void>
}

export const useDataStore = create<DataState>((set) => ({
  loaded: false,
  loading: false,
  transactions: [],
  products: [],
  cashiers: [],
  teams: [],
  supplierReceipts: [],
  stockSnapshots: [],
  importBatches: [],
  settings: null,
  monthSnapshots: [],
  clients: [],
  clientInvoices: [],
  productsById: new Map(),
  cashiersById: new Map(),
  teamsById: new Map(),
  refresh: async () => {
    set({ loading: true })
    await ensureDefaultTeamsSeeded()
    const [
      transactions,
      products,
      cashiers,
      teams,
      supplierReceipts,
      stockSnapshots,
      importBatches,
      settings,
      monthSnapshots,
      clients,
      clientInvoices,
    ] = await Promise.all([
      listAllTransactions(),
      listProducts(),
      listCashiers(),
      listTeams(),
      listAllSupplierReceipts(),
      listAllStockSnapshots(),
      listImportBatches(),
      getSettings(),
      listMonthSnapshots(),
      listClients(),
      listAllClientInvoices(),
    ])
    set({
      transactions,
      products,
      cashiers,
      teams,
      supplierReceipts,
      stockSnapshots,
      importBatches,
      settings,
      monthSnapshots,
      clients,
      clientInvoices,
      productsById: new Map(products.map((p) => [p.id, p])),
      cashiersById: new Map(cashiers.map((c) => [c.id, c])),
      teamsById: new Map(teams.map((t) => [t.id, t])),
      loaded: true,
      loading: false,
    })
  },
}))
