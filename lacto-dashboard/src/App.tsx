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
const ClientProfilePage = lazy(() => import('./pages/ClientProfilePage').then((m) => ({ default: m.ClientProfilePage })))
const ProductProfilePage = lazy(() => import('./pages/ProductProfilePage').then((m) => ({ default: m.ProductProfilePage })))
const MonthlyAnalysisPage = lazy(() => import('./pages/MonthlyAnalysisPage').then((m) => ({ default: m.MonthlyAnalysisPage })))
const SeasonalityPage = lazy(() => import('./pages/SeasonalityPage').then((m) => ({ default: m.SeasonalityPage })))
const PricesPage = lazy(() => import('./pages/PricesPage').then((m) => ({ default: m.PricesPage })))
const ParetoPage = lazy(() => import('./pages/ParetoPage').then((m) => ({ default: m.ParetoPage })))
const ClientDynamicsPage = lazy(() => import('./pages/ClientDynamicsPage').then((m) => ({ default: m.ClientDynamicsPage })))
const GrowthMatrixPage = lazy(() => import('./pages/GrowthMatrixPage').then((m) => ({ default: m.GrowthMatrixPage })))
const AlertsPage = lazy(() => import('./pages/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const ConcentrationRiskPage = lazy(() => import('./pages/ConcentrationRiskPage').then((m) => ({ default: m.ConcentrationRiskPage })))
const CrossSellPage = lazy(() => import('./pages/CrossSellPage').then((m) => ({ default: m.CrossSellPage })))
const PriceOutliersPage = lazy(() => import('./pages/PriceOutliersPage').then((m) => ({ default: m.PriceOutliersPage })))
const DataQualityPage = lazy(() => import('./pages/DataQualityPage').then((m) => ({ default: m.DataQualityPage })))
const ReportBuilderPage = lazy(() => import('./pages/ReportBuilderPage').then((m) => ({ default: m.ReportBuilderPage })))
const SavedReportsPage = lazy(() => import('./pages/SavedReportsPage').then((m) => ({ default: m.SavedReportsPage })))

export function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Se încarcă…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/alerte" element={<AlertsPage />} />
          <Route path="/canale" element={<ChannelsPage />} />
          <Route path="/categorii" element={<CategoriesPage />} />
          <Route path="/clienti" element={<ClientsPage />} />
          <Route path="/clienti/:id" element={<ClientProfilePage />} />
          <Route path="/produse" element={<ProductsPage />} />
          <Route path="/produse/:id" element={<ProductProfilePage />} />
          <Route path="/analiza-lunara" element={<MonthlyAnalysisPage />} />
          <Route path="/sezonalitate" element={<SeasonalityPage />} />
          <Route path="/preturi" element={<PricesPage />} />
          <Route path="/outlieri-pret" element={<PriceOutliersPage />} />
          <Route path="/pareto" element={<ParetoPage />} />
          <Route path="/dinamica-clienti" element={<ClientDynamicsPage />} />
          <Route path="/matrice-crestere" element={<GrowthMatrixPage />} />
          <Route path="/risc-concentrare" element={<ConcentrationRiskPage />} />
          <Route path="/cross-sell" element={<CrossSellPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/importuri" element={<ImportHistoryPage />} />
          <Route path="/potriviri-clienti" element={<ClientMatchQueuePage />} />
          <Route path="/nomenclator-clienti" element={<ClientNomenclaturePage />} />
          <Route path="/nomenclator-produse" element={<ProductNomenclaturePage />} />
          <Route path="/calitatea-datelor" element={<DataQualityPage />} />
          <Route path="/generator-raport" element={<ReportBuilderPage />} />
          <Route path="/rapoarte-salvate" element={<SavedReportsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
