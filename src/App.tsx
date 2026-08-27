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
import { TargetsPage } from '@/pages/TargetsPage'
import { ReceiptsPage } from '@/pages/ReceiptsPage'
import { StockPage } from '@/pages/StockPage'
import { ClosingPage } from '@/pages/ClosingPage'
import { CondicaPvPage } from '@/pages/CondicaPvPage'
import { MonthlyComparisonPage } from '@/pages/MonthlyComparisonPage'

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
          <Route path="/targeturi" element={<TargetsPage />} />
          <Route path="/bonuri" element={<ReceiptsPage />} />
          <Route path="/stoc" element={<StockPage />} />
          <Route path="/inchidere-luna" element={<ClosingPage />} />
          <Route path="/condica-pv" element={<CondicaPvPage />} />
          <Route path="/comparatie-lunara" element={<MonthlyComparisonPage />} />
          <Route path="/nomenclator" element={<NomenclaturePage />} />
          <Route path="/setari" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
