import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

// Weekly account update email (migration 0061, Edge Function send-account-update).

export interface AccountUpdateSettings {
  id?: string
  account_id: string
  enabled: boolean
  recipients: string[]
  reply_to: string | null
  note: string | null
}

export async function getAccountUpdateSettings(accountId: string): Promise<AccountUpdateSettings | null> {
  const { data, error } = await supabase.from('account_update_emails').select('*').eq('account_id', accountId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as AccountUpdateSettings | null
}

export async function saveAccountUpdateSettings(s: AccountUpdateSettings & { name: string }): Promise<void> {
  const { error } = await supabase.from('account_update_emails').upsert(
    { account_id: s.account_id, enabled: s.enabled, recipients: s.recipients, reply_to: s.reply_to, note: s.note, name: s.name },
    { onConflict: 'account_id' },
  )
  if (error) throw new Error(error.message)
}

// When it last went out (email_log is readable by admins only — null otherwise).
export async function lastAccountUpdateSent(accountId: string): Promise<{ created_at: string; recipient: string; status: string } | null> {
  const { data } = await supabase
    .from('email_log')
    .select('created_at, recipient, status')
    .like('dedupe_key', `account_update:${accountId}:%`)
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('send-account-update', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
  return data as T
}

export function previewAccountUpdate(accountId: string, note: string | null) {
  return call<{ subject: string; html: string }>({ mode: 'preview', account_id: accountId, note })
}

export function sendAccountUpdateTest(accountId: string, note: string | null, replyTo: string | null) {
  return call<{ sentTo: string }>({ mode: 'test', account_id: accountId, note, reply_to: replyTo })
}
