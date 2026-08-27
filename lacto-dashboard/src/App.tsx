import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ClientMatchQueuePage } from './pages/ClientMatchQueuePage'
import { ClientNomenclaturePage } from './pages/ClientNomenclaturePage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { ImportPage } from './pages/ImportPage'
import { ProductNomenclaturePage } from './pages/ProductNomenclaturePage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/import" replace />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/importuri" element={<ImportHistoryPage />} />
        <Route path="/potriviri-clienti" element={<ClientMatchQueuePage />} />
        <Route path="/nomenclator-clienti" element={<ClientNomenclaturePage />} />
        <Route path="/nomenclator-produse" element={<ProductNomenclaturePage />} />
        <Route path="*" element={<Navigate to="/import" replace />} />
      </Route>
    </Routes>
  )
}
