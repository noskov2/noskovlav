import type { FuelDeliveryPlanConfig, Product, TransactionLine } from '@/types/domain'
import { resolveFuelTypeIds } from '@/kpi/fuelVariants'
import { addDays, dayCountInRange, reportingEndStr, todayStr } from '@/kpi/dateRanges'

export type PlanFuel = 'benzina' | 'motorina'

export interface AverageResult {
  value: number | null // L/zi efectiv folosit în simulare (manual dacă există, altfel calculat)
  source: 'manual' | 'calculat' | 'lipsă'
  calculatedValue: number | null // media calculată din vânzări, chiar și când manualul are prioritate — pentru comparație în UI
  totalLiters: number | null
  dayCount: number // zile calendaristice complete folosite la calcul
}

export interface StockNowResult {
  value: number | null // stocul estimat la momentul curent ("acum")
  reportedLiters: number | null
  reportedAsOf: number | null
  salesSinceReport: number | null // vânzări efective scăzute între momentul raportării și acum
  source: 'manual' | 'lipsă'
}

export interface FuelDayRow {
  stockInitial: number
  sale: number
  saleIsEstimate: boolean // true pentru toate zilele, cu excepția zilei curente unde vânzarea deja realizată e reală
  beforeDelivery: number
  deliveryLiters: number
  afterDelivery: number
  stockFinalTons: number
  negative: boolean
  overCapacity: boolean
}

export interface PlanDayRow {
  date: string
  isToday: boolean
  benzina: FuelDayRow
  motorina: FuelDayRow
}

export interface CompartmentLoad {
  capacityLiters: number
  contents: 'benzina-peco' | 'motorina-peco' | 'motorina-lacto' | 'gol'
  liters: number
}

export interface ScheduledDelivery {
  index: number
  departureDate: string
  arrivalDate: string
  benzinaPecoLiters: number
  motorinaPecoLiters: number
  motorinaLactoLiters: number
  totalLiters: number
  isPenultimate: boolean
  compartments: CompartmentLoad[]
  lateRisk: boolean // nu s-a putut respecta termenul sigur — stocul ajunge la zero înainte de sosire
  benzinaSkippedDueToCapacity: boolean // benzina era necesară, dar ar fi depășit plafonul de 6 tone la descărcare
}

export interface PlanWarning {
  severity: 'bad' | 'warn'
  message: string
}

export interface FuelDeliveryPlanResult {
  benzinaAvg: AverageResult
  motorinaAvg: AverageResult
  benzinaStockNow: StockNowResult
  motorinaStockNow: StockNowResult
  days: PlanDayRow[]
  deliveries: ScheduledDelivery[]
  warnings: PlanWarning[]
  coverageDaysBenzina: number | null
  coverageDaysMotorina: number | null
  minProjectedBenzina: number | null
  minProjectedMotorina: number | null
  firstFeasibleBenzinaDate: string | null // când benzina mandatorie ar încăpea sub plafonul de 6 tone, dacă vreo cursă a fost blocată
  motorinaTankCapacityLiters: number | null
  benzinaTankCapacityLiters: number | null
}

export function litersToTons(liters: number, densityKgPerLiter: number): number {
  return (liters * densityKgPerLiter) / 1000
}
export function tonsToLiters(tons: number, densityKgPerLiter: number): number {
  return (tons * 1000) / densityKgPerLiter
}

function sumQuantityInWindow(transactions: TransactionLine[], ids: Set<string>, fromMs: number, toMs: number): number {
  let sum = 0
  for (const t of transactions) {
    if (!ids.has(t.productId)) continue
    if (t.timestamp > fromMs && t.timestamp <= toMs) sum += t.quantity
  }
  return sum
}

// Media calculată = vânzări efective din perioada istorică ÷ zile calendaristice
// COMPLETE ale acelei perioade — capătul perioadei e plafonat la ultima zi
// completă (reportingEndStr), ca o zi parțială (azi, dacă e inclusă) să nu
// umfle/scadă artificial media.
function computeAverage(
  transactions: TransactionLine[],
  ids: Set<string>,
  historyStart: string | null,
  historyEnd: string | null,
  manualOverride: number | null,
): AverageResult {
  let calculatedValue: number | null = null
  let totalLiters: number | null = null
  let dayCount = 0

  if (historyStart && historyEnd) {
    const effectiveEnd = historyEnd < reportingEndStr() ? historyEnd : reportingEndStr()
    if (effectiveEnd >= historyStart) {
      dayCount = dayCountInRange({ start: historyStart, end: effectiveEnd })
      totalLiters = 0
      for (const t of transactions) {
        if (!ids.has(t.productId)) continue
        if (t.date >= historyStart && t.date <= effectiveEnd) totalLiters += t.quantity
      }
      calculatedValue = dayCount > 0 ? totalLiters / dayCount : null
    }
  }

  if (manualOverride != null) {
    return { value: manualOverride, source: 'manual', calculatedValue, totalLiters, dayCount }
  }
  if (calculatedValue != null) {
    return { value: calculatedValue, source: 'calculat', calculatedValue, totalLiters, dayCount }
  }
  return { value: null, source: 'lipsă', calculatedValue, totalLiters, dayCount }
}

// "Nu scade de două ori vânzările zilei": scade doar vânzările efective
// petrecute STRICT ÎNTRE momentul raportării stocului și acum — dacă
// raportarea e deja "la zi" (asOf ≈ acum), fereastra e goală și stocul se
// folosește direct.
function computeStockNow(
  transactions: TransactionLine[],
  ids: Set<string>,
  reportedLiters: number | null,
  reportedAsOf: number | null,
  nowMs: number,
): StockNowResult {
  if (reportedLiters == null || reportedAsOf == null) {
    return { value: null, reportedLiters, reportedAsOf, salesSinceReport: null, source: 'lipsă' }
  }
  const salesSinceReport = sumQuantityInWindow(transactions, ids, reportedAsOf, nowMs)
  return {
    value: reportedLiters - salesSinceReport,
    reportedLiters,
    reportedAsOf,
    salesSinceReport,
    source: 'manual',
  }
}

// Vânzarea estimată rămasă din ziua curentă: max(0, medie zilnică − deja
// vândut azi până acum). Zilele viitoare folosesc media zilnică întreagă.
function todayRemainingSale(avgPerDay: number | null, soldToday: number): number | null {
  if (avgPerDay == null) return null
  return Math.max(0, avgPerDay - soldToday)
}

// Rulează o simulare zi-cu-zi pură (aritmetică), primind vânzarea fiecărei
// zile și livrările deja programate — fără nicio decizie de planificare
// aici; planificarea (scheduleDeliveries) apelează asta repetat.
function runSimulation(
  stock0: number,
  salePerDate: Map<string, number>,
  deliveriesByDate: Map<string, number>,
  dates: string[],
  densityKgPerLiter: number,
  tankCapacityLiters: number | null,
): FuelDayRow[] {
  const rows: FuelDayRow[] = []
  let stock = stock0
  for (const date of dates) {
    const sale = salePerDate.get(date) ?? 0
    const stockInitial = stock
    const beforeDelivery = stockInitial - sale
    const deliveryLiters = deliveriesByDate.get(date) ?? 0
    const afterDelivery = beforeDelivery + deliveryLiters
    stock = afterDelivery
    rows.push({
      stockInitial,
      sale,
      saleIsEstimate: true,
      beforeDelivery,
      deliveryLiters,
      afterDelivery,
      stockFinalTons: litersToTons(afterDelivery, densityKgPerLiter),
      negative: afterDelivery < 0,
      overCapacity: tankCapacityLiters != null && afterDelivery > tankCapacityLiters,
    })
  }
  return rows
}

function firstNegativeDate(stock0: number, salePerDate: Map<string, number>, dates: string[]): string | null {
  let stock = stock0
  for (const date of dates) {
    stock -= salePerDate.get(date) ?? 0
    if (stock < 0) return date
  }
  return null
}

function stockAtStartOfDate(stock0: number, salePerDate: Map<string, number>, dates: string[], target: string): number {
  let stock = stock0
  for (const date of dates) {
    if (date === target) return stock
    stock -= salePerDate.get(date) ?? 0
  }
  return stock
}

function stockAtEndOfDate(stock0: number, salePerDate: Map<string, number>, dates: string[], target: string): number {
  let stock = stock0
  for (const date of dates) {
    stock -= salePerDate.get(date) ?? 0
    if (date === target) return stock
  }
  return stock
}

interface RawDelivery {
  departureDate: string
  arrivalDate: string
  benzinaPecoLiters: number
  motorinaTotalLiters: number // Peco + Lacto combinat — Lacto se decide într-o a doua trecere (penultima livrare)
  lateRisk: boolean
  benzinaSkippedDueToCapacity: boolean
}

// Alocă pe compartimente, în ordinea fixă declarată. Benzina (dacă există)
// ocupă mereu ultimul compartiment din listă (cel de 6.000 L, per regulă).
// Motorina Lacto (dacă există) ocupă primele compartimente rămase, pline,
// până se epuizează cantitatea; restul merge la motorină Peco.
function allocateCompartments(
  compartments: number[],
  benzinaLiters: number,
  motorinaLactoLiters: number,
  motorinaPecoLiters: number,
): CompartmentLoad[] {
  const result: CompartmentLoad[] = compartments.map((c) => ({ capacityLiters: c, contents: 'gol', liters: 0 }))
  const order = [...result.keys()]
  // Benzina ocupă explicit ultimul compartiment din listă (6.000 L).
  if (benzinaLiters > 0) {
    const last = order[order.length - 1]
    result[last].contents = 'benzina-peco'
    result[last].liters = benzinaLiters
    order.pop()
  }
  let lacto = motorinaLactoLiters
  let peco = motorinaPecoLiters
  for (const idx of order) {
    if (lacto > 0) {
      const amt = Math.min(lacto, result[idx].capacityLiters)
      result[idx].contents = 'motorina-lacto'
      result[idx].liters = amt
      lacto -= amt
      if (amt < result[idx].capacityLiters) continue // compartiment parțial — nu mai pune nimic altceva aici
    } else if (peco > 0) {
      const amt = Math.min(peco, result[idx].capacityLiters)
      result[idx].contents = 'motorina-peco'
      result[idx].liters = amt
      peco -= amt
    }
  }
  return result
}

function scheduleDeliveries(
  config: FuelDeliveryPlanConfig,
  benzinaStock0: number,
  motorinaStock0: number,
  benzinaSalePerDate: Map<string, number>,
  motorinaSalePerDate: Map<string, number>,
  dates: string[],
): { deliveries: RawDelivery[]; firstFeasibleBenzinaDate: string | null } {
  const today = dates[0]
  const deliveries: RawDelivery[] = []
  let benzinaStock = benzinaStock0
  let motorinaStock = motorinaStock0
  let cursor = today
  let firstFeasibleBenzinaDate: string | null = null
  const motorinaTankCapacityLiters = tonsToLiters(config.motorinaTankCapacityTons, config.motorinaDensityKgPerLiter)

  const maxIterations = 20
  for (let i = 0; i < maxIterations; i++) {
    const cursorIdx = dates.indexOf(cursor)
    const remainingDates = cursorIdx >= 0 ? dates.slice(cursorIdx) : []
    if (remainingDates.length === 0) break

    const benDeadline = firstNegativeDate(benzinaStock, benzinaSalePerDate, remainingDates)
    const motDeadline = firstNegativeDate(motorinaStock, motorinaSalePerDate, remainingDates)
    if (benDeadline == null && motDeadline == null) break

    const deadlineDate = benDeadline != null && motDeadline != null ? (benDeadline < motDeadline ? benDeadline : motDeadline) : (benDeadline ?? motDeadline)!
    const lastSafeDate = addDays(deadlineDate, -1)
    let arrivalDate = lastSafeDate
    let departureDate = addDays(arrivalDate, -config.transitDays)

    const earliestDeparture = addDays(today, 1)
    let lateRisk = false
    if (departureDate < earliestDeparture) {
      departureDate = earliestDeparture
      arrivalDate = addDays(departureDate, config.transitDays)
      lateRisk = arrivalDate > lastSafeDate
    }
    if (arrivalDate > dates[dates.length - 1]) break // dincolo de orizont, nu mai planificăm

    // Comparăm cu deadlineDate (ziua în care stocul ar deveni negativ fără
    // livrare), nu cu arrivalDate — arrivalDate e prin construcție exact
    // deadlineDate − 1 (ultima zi sigură), deci combustibilul care a impus
    // termenul nu ar fi NICIODATĂ "<= arrivalDate" dacă am compara greșit,
    // iar livrarea nu s-ar mai programa niciodată.
    const benNeeded = benDeadline != null && benDeadline <= deadlineDate
    const motNeeded = motDeadline != null && motDeadline <= deadlineDate

    const benzinaAtArrivalStart = stockAtStartOfDate(benzinaStock, benzinaSalePerDate, remainingDates, arrivalDate)
    const benzinaAtArrivalEnd = stockAtEndOfDate(benzinaStock, benzinaSalePerDate, remainingDates, arrivalDate)
    const motorinaAtArrivalEnd = stockAtEndOfDate(motorinaStock, motorinaSalePerDate, remainingDates, arrivalDate)

    let benzinaPecoLiters = 0
    let benzinaSkipped = false
    if (benNeeded || motNeeded) {
      if (benNeeded) {
        const peakTons = litersToTons(benzinaAtArrivalStart + config.mandatoryBenzinaLoadLiters, config.benzinaDensityKgPerLiter)
        if (peakTons <= config.benzinaTankCapacityTons) {
          benzinaPecoLiters = config.mandatoryBenzinaLoadLiters
        } else {
          benzinaSkipped = true
          if (firstFeasibleBenzinaDate == null) {
            // caută prima zi, pornind de la sosirea curentă, în care plafonul de 6 tone nu ar fi depășit
            let probe = arrivalDate
            for (let d = 0; d < 120; d++) {
              const stockAtProbeStart = stockAtStartOfDate(benzinaStock, benzinaSalePerDate, remainingDates, probe)
              const probeTons = litersToTons(stockAtProbeStart + config.mandatoryBenzinaLoadLiters, config.benzinaDensityKgPerLiter)
              if (probeTons <= config.benzinaTankCapacityTons) {
                firstFeasibleBenzinaDate = probe
                break
              }
              probe = addDays(probe, 1)
              if (probe > dates[dates.length - 1]) break
            }
          }
        }
      }

      const motorinaCapForTrip = config.maxTankerLoadLiters - benzinaPecoLiters
      const motorinaRoomInTank = Math.max(0, motorinaTankCapacityLiters - motorinaAtArrivalEnd)
      const motorinaTotalLiters = Math.min(motorinaCapForTrip, motorinaRoomInTank)

      deliveries.push({
        departureDate,
        arrivalDate,
        benzinaPecoLiters,
        motorinaTotalLiters,
        lateRisk,
        benzinaSkippedDueToCapacity: benzinaSkipped,
      })

      benzinaStock = benzinaAtArrivalEnd + benzinaPecoLiters
      motorinaStock = motorinaAtArrivalEnd + motorinaTotalLiters
      // Cursor-ul trece la ziua URMĂTOARE sosirii, nu la ziua sosirii
      // însăși — vânzarea zilei de sosire e deja scăzută în
      // benzinaAtArrivalEnd/motorinaAtArrivalEnd de mai sus, așa că
      // folosirea arrivalDate ca prag pentru runda următoare ar scădea
      // vânzarea acelei zile a doua oară (deadline-uri calculate prea
      // devreme → livrări programate inutil de des/de mari).
      cursor = addDays(arrivalDate, 1)
    } else {
      // nu ar trebui să ajungă aici (cel puțin unul dintre benNeeded/motNeeded e mereu adevărat
      // dat fiind că deadlineDate a fost calculat din unul dintre ele) — gardă de siguranță.
      break
    }
  }

  return { deliveries, firstFeasibleBenzinaDate }
}

export function computeFuelDeliveryPlan(
  transactions: TransactionLine[],
  products: Product[],
  config: FuelDeliveryPlanConfig,
  nowMs: number = Date.now(),
): FuelDeliveryPlanResult {
  const fuelIds = resolveFuelTypeIds(products)
  const today = todayStr()
  const dates: string[] = []
  for (let i = 0; i <= config.horizonDays; i++) dates.push(addDays(today, i))

  const benzinaAvg = computeAverage(transactions, fuelIds.benzina, config.historyStart, config.historyEnd, config.manualAvgBenzinaLitersPerDay)
  const motorinaAvg = computeAverage(transactions, fuelIds.motorina, config.historyStart, config.historyEnd, config.manualAvgMotorinaLitersPerDay)

  const startOfToday = new Date(`${today}T00:00:00`).getTime()
  const benzinaSoldToday = sumQuantityInWindow(transactions, fuelIds.benzina, startOfToday - 1, nowMs)
  const motorinaSoldToday = sumQuantityInWindow(transactions, fuelIds.motorina, startOfToday - 1, nowMs)

  const benzinaStockNow = computeStockNow(transactions, fuelIds.benzina, config.stockBenzinaLiters, config.stockBenzinaAsOf, nowMs)
  const motorinaStockNow = computeStockNow(transactions, fuelIds.motorina, config.stockMotorinaLiters, config.stockMotorinaAsOf, nowMs)

  const warnings: PlanWarning[] = []
  if (benzinaAvg.value == null) warnings.push({ severity: 'warn', message: 'Lipsește media de benzină — introdu o medie manuală sau selectează o perioadă istorică cu vânzări de benzină.' })
  if (motorinaAvg.value == null) warnings.push({ severity: 'warn', message: 'Lipsește media de motorină — introdu o medie manuală sau selectează o perioadă istorică cu vânzări de motorină.' })
  if (benzinaStockNow.value == null) warnings.push({ severity: 'warn', message: 'Lipsește stocul raportat de benzină (cu data și ora măsurătorii).' })
  if (motorinaStockNow.value == null) warnings.push({ severity: 'warn', message: 'Lipsește stocul raportat de motorină (cu data și ora măsurătorii).' })

  const benzinaTankCapacityLiters = tonsToLiters(config.benzinaTankCapacityTons, config.benzinaDensityKgPerLiter)
  const motorinaTankCapacityLiters = tonsToLiters(config.motorinaTankCapacityTons, config.motorinaDensityKgPerLiter)

  if (benzinaAvg.value == null || motorinaAvg.value == null || benzinaStockNow.value == null || motorinaStockNow.value == null) {
    return {
      benzinaAvg,
      motorinaAvg,
      benzinaStockNow,
      motorinaStockNow,
      days: [],
      deliveries: [],
      warnings,
      coverageDaysBenzina: null,
      coverageDaysMotorina: null,
      minProjectedBenzina: null,
      minProjectedMotorina: null,
      firstFeasibleBenzinaDate: null,
      motorinaTankCapacityLiters,
      benzinaTankCapacityLiters,
    }
  }

  const benzinaTodayRemaining = todayRemainingSale(benzinaAvg.value, benzinaSoldToday)!
  const motorinaTodayRemaining = todayRemainingSale(motorinaAvg.value, motorinaSoldToday)!

  const benzinaSalePerDate = new Map<string, number>()
  const motorinaSalePerDate = new Map<string, number>()
  dates.forEach((date, i) => {
    benzinaSalePerDate.set(date, i === 0 ? benzinaTodayRemaining : benzinaAvg.value!)
    motorinaSalePerDate.set(date, i === 0 ? motorinaTodayRemaining : motorinaAvg.value!)
  })

  const { deliveries: rawDeliveries, firstFeasibleBenzinaDate } = scheduleDeliveries(
    config,
    benzinaStockNow.value,
    motorinaStockNow.value,
    benzinaSalePerDate,
    motorinaSalePerDate,
    dates,
  )

  // Penultima livrare a planului primește deviația de motorină către Lacto.
  const penultimateIdx = rawDeliveries.length >= 2 ? rawDeliveries.length - 2 : -1
  const lactoLiters = tonsToLiters(config.lactoMotorinaTons, config.motorinaDensityKgPerLiter)

  const benzinaDeliveriesByDate = new Map<string, number>()
  const motorinaDeliveriesByDate = new Map<string, number>()
  const deliveries: ScheduledDelivery[] = rawDeliveries.map((d, idx) => {
    const isPenultimate = idx === penultimateIdx
    const motorinaLacto = isPenultimate ? Math.min(lactoLiters, d.motorinaTotalLiters) : 0
    const motorinaPeco = d.motorinaTotalLiters - motorinaLacto
    benzinaDeliveriesByDate.set(d.arrivalDate, (benzinaDeliveriesByDate.get(d.arrivalDate) ?? 0) + d.benzinaPecoLiters)
    motorinaDeliveriesByDate.set(d.arrivalDate, (motorinaDeliveriesByDate.get(d.arrivalDate) ?? 0) + motorinaPeco)
    return {
      index: idx,
      departureDate: d.departureDate,
      arrivalDate: d.arrivalDate,
      benzinaPecoLiters: d.benzinaPecoLiters,
      motorinaPecoLiters: motorinaPeco,
      motorinaLactoLiters: motorinaLacto,
      totalLiters: d.benzinaPecoLiters + d.motorinaTotalLiters,
      isPenultimate,
      compartments: allocateCompartments(config.compartmentCapacitiesLiters, d.benzinaPecoLiters, motorinaLacto, motorinaPeco),
      lateRisk: d.lateRisk,
      benzinaSkippedDueToCapacity: d.benzinaSkippedDueToCapacity,
    }
  })

  // A doua trecere: simulare finală zi-cu-zi, cu livrările (și eventuala
  // deviație Lacto) deja fixate — aceasta e simularea afișată în tabel.
  const benzinaRows = runSimulation(benzinaStockNow.value, benzinaSalePerDate, benzinaDeliveriesByDate, dates, config.benzinaDensityKgPerLiter, benzinaTankCapacityLiters)
  const motorinaRows = runSimulation(motorinaStockNow.value, motorinaSalePerDate, motorinaDeliveriesByDate, dates, config.motorinaDensityKgPerLiter, motorinaTankCapacityLiters)

  const days: PlanDayRow[] = dates.map((date, i) => ({
    date,
    isToday: date === today,
    benzina: { ...benzinaRows[i], saleIsEstimate: true },
    motorina: { ...motorinaRows[i], saleIsEstimate: true },
  }))

  for (const row of days) {
    if (row.benzina.negative) warnings.push({ severity: 'bad', message: `Stoc negativ estimat la benzină pe ${row.date}.` })
    if (row.motorina.negative) warnings.push({ severity: 'bad', message: `Stoc negativ estimat la motorină pe ${row.date}.` })
    if (row.benzina.overCapacity) warnings.push({ severity: 'bad', message: `Rezervorul de benzină ar depăși capacitatea (${config.benzinaTankCapacityTons} tone) pe ${row.date}.` })
    if (row.motorina.overCapacity) warnings.push({ severity: 'bad', message: `Rezervorul de motorină ar depăși capacitatea (${config.motorinaTankCapacityTons} tone) pe ${row.date}.` })
  }
  for (const d of deliveries) {
    if (d.totalLiters > config.maxTankerLoadLiters + 0.001) {
      warnings.push({ severity: 'bad', message: `Cursa din ${formatDateInternal(d.departureDate)} depășește plafonul cisternei de ${formatNumberInternal(config.maxTankerLoadLiters)} L.` })
    }
    for (const c of d.compartments) {
      if (c.liters > c.capacityLiters + 0.001) {
        warnings.push({ severity: 'bad', message: `Compartimentul de ${formatNumberInternal(c.capacityLiters)} L e supraîncărcat pe cursa din ${formatDateInternal(d.departureDate)}.` })
      }
    }
    if (d.lateRisk) {
      warnings.push({
        severity: 'bad',
        message: `Cursa care sosește ${formatDateInternal(d.arrivalDate)} nu poate ajunge la timp — stocul va atinge zero înainte de sosire. Nu există o dată mai devreme fezabilă (plecarea minimă posibilă e ${formatDateInternal(addDays(today, 1))}).`,
      })
    }
    if (d.benzinaSkippedDueToCapacity) {
      warnings.push({
        severity: 'warn',
        message: `Pe cursa din ${formatDateInternal(d.departureDate)}, cei 6.000 L obligatorii de benzină ar depăși plafonul de ${config.benzinaTankCapacityTons} tone la descărcare — nu au fost încărcați.${
          firstFeasibleBenzinaDate ? ` Prima dată fezabilă pentru benzină: ${formatDateInternal(firstFeasibleBenzinaDate)}.` : ''
        }`,
      })
    }
  }

  const coverageDaysBenzina = benzinaAvg.value > 0 ? benzinaStockNow.value / benzinaAvg.value : null
  const coverageDaysMotorina = motorinaAvg.value > 0 ? motorinaStockNow.value / motorinaAvg.value : null
  const minProjectedBenzina = days.length ? Math.min(...days.map((d) => d.benzina.afterDelivery)) : null
  const minProjectedMotorina = days.length ? Math.min(...days.map((d) => d.motorina.afterDelivery)) : null

  return {
    benzinaAvg,
    motorinaAvg,
    benzinaStockNow,
    motorinaStockNow,
    days,
    deliveries,
    warnings,
    coverageDaysBenzina,
    coverageDaysMotorina,
    minProjectedBenzina,
    minProjectedMotorina,
    firstFeasibleBenzinaDate,
    motorinaTankCapacityLiters,
    benzinaTankCapacityLiters,
  }
}

// Mici formatatoare locale (fără dependență de lib/format.ts, ca să nu
// introducă un ciclu de import din kpi/ către lib/ pentru niște mesaje de
// avertizare) — intenționat minimale.
function formatDateInternal(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}.${m}.${y}`
}
function formatNumberInternal(n: number): string {
  return Math.round(n).toLocaleString('ro-RO')
}
