import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { ImportPage } from './pages/ImportPage'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/import" replace />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/importuri" element={<ImportHistoryPage />} />
        <Route path="*" element={<Navigate to="/import" replace />} />
      </Route>
    </Routes>
  )
}
