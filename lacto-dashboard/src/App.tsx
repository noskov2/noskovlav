import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const ImportHistoryPage = lazy(() => import('./pages/ImportHistoryPage').then((m) => ({ default: m.ImportHistoryPage })))
const ClientMatchQueuePage = lazy(() => import('./pages/ClientMatchQueuePage').then((m) => ({ default: m.ClientMatchQueuePage })))
const ClientNomenclaturePage = lazy(() => import('./pages/ClientNomenclaturePage').then((m) => ({ default: m.ClientNomenclaturePage })))
const ProductNomenclaturePage = lazy(() => import('./pages/ProductNomenclaturePage').then((m) => ({ default: m.ProductNomenclaturePage })))

export function App() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Se încarcă…</div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
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
