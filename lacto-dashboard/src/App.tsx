import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const ImportHistoryPage = lazy(() => import('./pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })))
const ClientMatchQueuePage = lazy(() => import('./pages/ClientMatchQueuePage').then((m) => ({ default: m.ClientMatchQueuePage })))
const ClientNomenclaturePage = lazy(() => import('./pages/ClientNomenclaturePage').then((m) => ({ default: m.ClientNomenclaturePage })))
const ProductNomenclaturePage = lazy(() => import('./pages/ProductNomenclaturePage').then((m) => ({ default: m.ProductNomenclaturePage })))
const ChannelsPage = lazy(() => import('./pages/ChannelsPage').then((m) => ({ default: m.ChannelsPage })))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const ClientsPage = lazy(() => import('./pages/ClientsPage').then((m) => ({ default: m.ClientsPage })))
const ProductsPage = lazy(() => import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const MonthlyAnalysisPage = lazy(() => import('./pages/MonthlyAnalysisPage').then((m) => ({ default: m.MonthlyAnalysisPage })))
const SeasonalityPage = lazy(() => import('./pages/SeasonalityPage').then((m) => ({ default: m.SeasonalityPage })))
const PricesPage = lazy(() => import('./pages/PricesPage').then((m) => ({ default: m.PricesPage })))

export function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Se încarcă…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/canale" element={<ChannelsPage />} />
          <Route path="/categorii" element={<CategoriesPage />} />
          <Route path="/clienti" element={<ClientsPage />} />
          <Route path="/produse" element={<ProductsPage />} />
          <Route path="/analiza-lunara" element={<MonthlyAnalysisPage />} />
          <Route path="/sezonalitate" element={<SeasonalityPage />} />
          <Route path="/preturi" element={<PricesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/importuri" element={<ImportHistoryPage />} />
          <Route path="/potriviri-clienti" element={<ClientMatchQueuePage />} />
          <Route path="/nomenclator-clienti" element={<ClientNomenclaturePage />} />
          <Route path="/nomenclator-produse" element={<ProductNomenclaturePage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
