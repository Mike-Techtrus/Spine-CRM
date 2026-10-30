import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'
import { publicAppUrl } from '../appUrl'
import type { AdminUser, AppArea, UserRole } from '../types'

// Everything here goes through the admin-users Edge Function
// (supabase/functions/admin-users) — creating users and setting passwords
// needs the service-role key, which can't live in the browser.
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // The function returns { error: "..." } — surface that instead of the
    // generic "non-2xx status code" message.
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      if (payload?.error) throw new Error(payload.error)
    }
    throw new Error(error.message)
  }
  return data as T
}

// Where password-reset emails send people back to: the public app address,
// never a Vercel-protected one (see appUrl.ts). The app picks up the recovery
// link on any page and moves them to /set-password.
const resetRedirect = publicAppUrl

export async function listAdminUsers(): Promise<AdminUser[]> {
  return (await call<{ users: AdminUser[] }>({ action: 'list' })).users
}

export interface NewUserInput {
  email: string
  full_name: string
  role: UserRole
  permissions: AppArea[]
  password?: string // omit and set send_reset_email to let them choose their own
  send_reset_email?: boolean
}

export async function createAdminUser(input: NewUserInput): Promise<{ id: string }> {
  return call({ action: 'create', ...input, redirect_to: resetRedirect() })
}

export async function updateAdminUser(
  userId: string,
  input: { full_name: string; role: UserRole; permissions: AppArea[] },
): Promise<void> {
  await call({ action: 'update', user_id: userId, ...input })
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  await call({ action: 'set_password', user_id: userId, password })
}

export async function setUserDisabled(userId: string, disabled: boolean): Promise<void> {
  await call({ action: 'set_disabled', user_id: userId, disabled })
}

export async function sendPasswordReset(userId: string): Promise<void> {
  await call({ action: 'send_reset', user_id: userId, redirect_to: resetRedirect() })
}
