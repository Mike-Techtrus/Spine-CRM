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

// What a day earns for margin: the day rate less any expenses bundled into it (0047).
export function labourDayRate(line: { day_rate: number; expenses_included?: number | null }): number {
  return round2(Number(line.day_rate) - Number(line.expenses_included ?? 0))
}

// Standard contractor cost per day for a role (line_items.standard_cost, 0056):
// the line's rate-card item, else an item with the same part code.
export function standardCostFor(
  line: { line_item_id?: string | null; part_code?: string | null },
  items: { id: string; part_code: string; standard_cost?: number | null }[],
): number | null {
  const code = (line.part_code ?? '').trim().toLowerCase()
  const item =
    (line.line_item_id ? items.find((i) => i.id === line.line_item_id) : undefined) ??
    (code ? items.find((i) => i.part_code.trim().toLowerCase() === code) : undefined)
  return item?.standard_cost === null || item?.standard_cost === undefined ? null : Number(item.standard_cost)
}

/**
 * Planned margin for one project line: each named person's allocated days at
 * their own cost rate, plus any quoted days nobody's been named for yet at the
 * role's standard cost (uncosted if the role has none).
 */
export function plannedMarginItems(
  line: { quoted_days: number; day_rate: number; expenses_included?: number | null },
  assignments: { allocated_days: number; cost_rate: number | null }[],
  standardCost: number | null,
): MarginItem[] {
  const sellRate = labourDayRate(line)
  const items: MarginItem[] = assignments.map((a) => ({
    days: Number(a.allocated_days),
    sellRate,
    costRate: a.cost_rate === null ? null : Number(a.cost_rate),
  }))
  const allocated = assignments.reduce((s, a) => s + Number(a.allocated_days), 0)
  const unnamed = Number(line.quoted_days) - allocated
  if (unnamed > 0) items.push({ days: unnamed, sellRate, costRate: standardCost })
  return items
}
