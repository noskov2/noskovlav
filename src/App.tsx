import { HashRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportPage } from '@/pages/ImportPage'
import { SlowMoversPage } from '@/pages/SlowMoversPage'
import { DailyPerformancePage } from '@/pages/DailyPerformancePage'
import { ProfitabilityPage } from '@/pages/ProfitabilityPage'
import { CrossSellPage } from '@/pages/CrossSellPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { NomenclaturePage } from '@/pages/NomenclaturePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { DataQualityPage } from '@/pages/DataQualityPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/vanzare-slaba" element={<SlowMoversPage />} />
          <Route path="/zi" element={<DailyPerformancePage />} />
          <Route path="/profitabilitate" element={<ProfitabilityPage />} />
          <Route path="/cross-sell" element={<CrossSellPage />} />
          <Route path="/furnizori" element={<SuppliersPage />} />
          <Route path="/rapoarte" element={<ReportsPage />} />
          <Route path="/calitate-date" element={<DataQualityPage />} />
          <Route path="/nomenclator" element={<NomenclaturePage />} />
          <Route path="/setari" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
