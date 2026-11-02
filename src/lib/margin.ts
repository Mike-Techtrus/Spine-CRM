import { round2 } from './money'

// Project margin (migration 0041): sell = the project line's quoted day rate,
// cost = the allocation's cost rate (defaults to the person's Day / Cost rate).
// Days with no cost rate can't be costed, so they're left out of all three
// figures and counted in uncostedDays so the page can say so.

export interface MarginItem {
  days: number
  sellRate: number
  costRate: number | null
}

export interface MarginSummary {
  revenue: number
  cost: number
  margin: number
  percent: number | null // margin ÷ revenue × 100; null when there's no revenue
  uncostedDays: number
}

export const NO_MARGIN: MarginSummary = { revenue: 0, cost: 0, margin: 0, percent: null, uncostedDays: 0 }

export function summariseMargin(items: MarginItem[]): MarginSummary {
  let revenue = 0
  let cost = 0
  let uncostedDays = 0
  for (const item of items) {
    if (!item.days) continue
    if (item.costRate === null || item.costRate === undefined || Number.isNaN(Number(item.costRate))) {
      uncostedDays += item.days
      continue
    }
    revenue += item.days * Number(item.sellRate)
    cost += item.days * Number(item.costRate)
  }
  revenue = round2(revenue)
  cost = round2(cost)
  const margin = round2(revenue - cost)
  const percent = revenue > 0 ? Math.round((margin / revenue) * 1000) / 10 : null
  return { revenue, cost, margin, percent, uncostedDays }
}

export function formatPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`
}
