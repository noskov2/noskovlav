import { PageHeader } from '@/components/layout/PageHeader'
import { useDataStore } from '@/store/dataStore'
import { updateFuelDeliveryPlanConfig } from '@/data/repo/settings'
import { FuelDeliveryPlanner } from '@/pages/tanks/FuelDeliveryPlanner'
import { emptyFuelDeliveryPlanConfig, type FuelDeliveryPlanConfig } from '@/types/domain'

export function TanksPage() {
  const { transactions, products, settings, refresh } = useDataStore()

  async function saveFuelDeliveryPlanConfig(patch: Partial<FuelDeliveryPlanConfig>) {
    await updateFuelDeliveryPlanConfig(patch)
    await refresh()
  }

  return (
    <div>
      <PageHeader
        title="Alimentare combustibil"
        description="Planificator automat de curse de alimentare cisternă (Benzină / Motorină), pe baza vânzărilor efective importate."
      />
      <FuelDeliveryPlanner
        transactions={transactions}
        products={products}
        config={settings?.fuelDeliveryPlan ?? emptyFuelDeliveryPlanConfig()}
        onConfigChange={saveFuelDeliveryPlanConfig}
      />
    </div>
  )
}
