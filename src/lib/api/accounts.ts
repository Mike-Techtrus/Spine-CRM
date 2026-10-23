import { supabase } from '../supabaseClient'
import type { Account, Contact } from '../types'
import { unwrap } from './_shared'

export async function listAccounts(activeOnly = false): Promise<Account[]> {
  let query = supabase.from('accounts').select('*').order('name')
  if (activeOnly) query = query.eq('is_active', true)
  return unwrap(await query)
}

export async function getAccount(id: string): Promise<Account> {
  return unwrap(await supabase.from('accounts').select('*').eq('id', id).single())
}

export interface AccountInput {
  name: string
  website: string | null
  phone: string | null
  email: string | null
  city: string | null
  postcode: string | null
}

export async function createAccount(input: Partial<AccountInput> & { name: string }): Promise<Account> {
  return unwrap(await supabase.from('accounts').insert(input).select().single())
}

export async function updateAccount(
  id: string,
  input: Partial<AccountInput & { is_active: boolean }>,
): Promise<Account> {
  return unwrap(await supabase.from('accounts').update(input).eq('id', id).select().single())
}

// ── Contacts (minimal — no dedicated management UI yet) ─────────────────────

export async function listContacts(accountId?: string): Promise<Contact[]> {
  let query = supabase.from('contacts').select('*').order('name')
  if (accountId) query = query.eq('account_id', accountId)
  return unwrap(await query)
}

export async function createContact(input: {
  account_id: string | null
  name: string
  email: string | null
  phone: string | null
}): Promise<Contact> {
  return unwrap(await supabase.from('contacts').insert(input).select().single())
}
