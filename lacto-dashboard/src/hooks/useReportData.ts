import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { computeAggregate } from '../analytics/aggregate'
import type { AggregateResult } from '../analytics/aggregate'
import { defaultFilters } from '../analytics/filters'
import type { GlobalFilters } from '../analytics/filters'
import { db } from '../db/db'

/**
 * Stare comună tuturor paginilor de raport: filtre globale + rezultatul
 * agregat pentru perioada curentă și cea de comparație, recalculat automat
 * la orice schimbare de filtru (spec §14: „aplicația să recalculeze instant
 * raportul").
 */
export function useReportData() {
  const [filters, setFilters] = useState<GlobalFilters>(() => defaultFilters())
  const [result, setResult] = useState<AggregateResult | null>(null)
  const [comparison, setComparison] = useState<AggregateResult | null>(null)
  const [loading, setLoading] = useState(true)

  const totalTransactions = useLiveQuery(() => db.transactions.count(), [])
  const clients = useLiveQuery(() => db.clients.toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const categories = useLiveQuery(() => db.categories.toArray(), [])

  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      computeAggregate(filters),
      filters.comparisonPeriod ? computeAggregate({ ...filters, period: filters.comparisonPeriod }) : Promise.resolve(null),
    ]).then(([r, cr]) => {
      if (cancelled) return
      setResult(r)
      setComparison(cr)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  function patchFilters(patch: Partial<GlobalFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
  }

  return { filters, patchFilters, result, comparison, loading, totalTransactions, clients, products, categories }
}
