import { supabase } from '../supabaseClient'
import type { LineItem, RateCard, RateCardPrice } from '../types'
import { unwrap } from './_shared'

// ── Line items ─────────────────────────────────────────────────────────────

export async function listLineItems(): Promise<LineItem[]> {
  return unwrap(await supabase.from('line_items').select('*').order('part_code'))
}

export type LineItemInput = Pick<LineItem, 'line_type' | 'part_code' | 'description'>

export async function createLineItem(input: LineItemInput): Promise<LineItem> {
  return unwrap(await supabase.from('line_items').insert(input).select().single())
}

export async function updateLineItem(id: string, input: Partial<LineItemInput & { is_active: boolean }>) {
  return unwrap(await supabase.from('line_items').update(input).eq('id', id).select().single())
}

// ── Rate cards ─────────────────────────────────────────────────────────────

export async function listRateCards(): Promise<RateCard[]> {
  return unwrap(
    await supabase.from('rate_cards').select('*').order('is_default', { ascending: false }).order('name'),
  )
}

export async function createRateCard(name: string, notes: string | null): Promise<RateCard> {
  return unwrap(await supabase.from('rate_cards').insert({ name, notes }).select().single())
}

export async function updateRateCard(id: string, input: { name?: string; notes?: string | null }) {
  return unwrap(await supabase.from('rate_cards').update(input).eq('id', id).select().single())
}

// Accounts using it fall back to the Default card (accounts.rate_card_id is
// "on delete set null"); quotes keep their own unit costs.
export async function deleteRateCard(id: string): Promise<void> {
  const { error } = await supabase.from('rate_cards').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listRateCardPrices(): Promise<RateCardPrice[]> {
  return unwrap(await supabase.from('rate_card_prices').select('*'))
}

// Sets (or, with null, clears) one card's price for one line item.
export async function setRateCardPrice(rateCardId: string, lineItemId: string, unitCost: number | null) {
  if (unitCost === null) {
    const { error } = await supabase
      .from('rate_card_prices')
      .delete()
      .eq('rate_card_id', rateCardId)
      .eq('line_item_id', lineItemId)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('rate_card_prices')
    .upsert({ rate_card_id: rateCardId, line_item_id: lineItemId, unit_cost: unitCost })
  if (error) throw new Error(error.message)
}

// ── Pricing for a quote ────────────────────────────────────────────────────

export interface PricedLineItem extends LineItem {
  unit_cost: number | null // null = no price on either card
  from_custom: boolean // true when the price comes from the account's custom card
}

/**
 * Active line items priced for a client: the account's custom card where it
 * has a price, otherwise the Default card. Used by the quote form's
 * "Add from rate card" picker.
 */
export async function getPricedLineItems(
  rateCardId: string | null,
): Promise<{ card: RateCard | null; items: PricedLineItem[] }> {
  const [items, cards, prices] = await Promise.all([listLineItems(), listRateCards(), listRateCardPrices()])
  const defaultCard = cards.find((c) => c.is_default) ?? null
  const custom = rateCardId ? (cards.find((c) => c.id === rateCardId) ?? null) : null
  const priceOn = (cardId: string | undefined, itemId: string) =>
    prices.find((p) => p.rate_card_id === cardId && p.line_item_id === itemId)?.unit_cost
  return {
    card: custom ?? defaultCard,
    items: items
      .filter((i) => i.is_active)
      .map((i) => {
        const customPrice = custom ? priceOn(custom.id, i.id) : undefined
        const defaultPrice = priceOn(defaultCard?.id, i.id)
        return {
          ...i,
          unit_cost: customPrice ?? defaultPrice ?? null,
          from_custom: customPrice !== undefined,
        }
      }),
  }
}
