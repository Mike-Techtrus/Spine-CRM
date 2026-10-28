// admin-users — server side of the in-app Admin area (src/pages/staff/admin).
//
// Creating users and setting passwords needs Supabase's admin API, which
// needs the service-role key. That key must never be in the browser app, so
// those calls happen here instead. Every request is checked against the
// caller's own profile first: only staff with the "admin" area get through.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy new function, name it
// "admin-users" and paste this file in (or `npx supabase functions deploy
// admin-users`). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to
// Edge Functions automatically — nothing to configure.

import { createClient } from 'npm:@supabase/supabase-js@2'

// Keep in step with APP_AREAS in src/lib/types.ts.
const AREA_KEYS = [
  'dashboard',
  'opportunities',
  'quotes',
  'sales_orders',
  'invoices',
  'timesheets',
  'accounts',
  'engineers',
  'admin',
]
const ROLES = ['staff', 'field_engineer']
const MIN_PASSWORD_LENGTH = 8

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Not signed in.')

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Not signed in.')

  const { data: profile } = await admin
    .from('profiles')
    .select('role, permissions')
    .eq('id', data.user.id)
    .single()
  if (profile?.role !== 'staff' || !profile.permissions?.includes('admin')) {
    throw new HttpError(403, 'You do not have access to user administration.')
  }
  return data.user.id
}

function checkPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  return password
}

function checkRole(role: unknown): string {
  if (typeof role !== 'string' || !ROLES.includes(role)) throw new HttpError(400, 'Unknown role.')
  return role
}

// Field engineers only ever see their own timesheets, so they carry no areas.
function cleanPermissions(role: string, permissions: unknown): string[] {
  if (role !== 'staff') return []
  if (!Array.isArray(permissions)) return []
  return AREA_KEYS.filter((key) => permissions.includes(key))
}

async function listUsers() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const { data: profiles, error: profileError } = await admin.from('profiles').select('*')
  if (profileError) throw profileError

  const byId = new Map(profiles.map((p) => [p.id, p]))
  return data.users.map((u) => {
    const p = byId.get(u.id)
    return {
      id: u.id,
      email: u.email ?? '',
      full_name: p?.full_name ?? '',
      role: p?.role ?? 'field_engineer',
      permissions: p?.permissions ?? [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      disabled: !!u.banned_until && new Date(u.banned_until) > new Date(),
    }
  })
}

async function sendReset(email: string, redirectTo: unknown) {
  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: typeof redirectTo === 'string' ? redirectTo : undefined,
  })
  if (error) throw error
}

// deno-lint-ignore no-explicit-any
async function createUser(body: any) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email) throw new HttpError(400, 'Email is required.')
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const role = checkRole(body.role)
  const password = body.send_reset_email ? undefined : checkPassword(body.password)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  })
  if (error) throw new HttpError(400, error.message)
  const userId = data.user.id

  // The handle_new_user trigger has already made the profile row.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ permissions: cleanPermissions(role, body.permissions) })
    .eq('id', userId)
  if (profileError) throw profileError

  // Saves the old "Link login…" step: tie the login to an existing field
  // engineer record with the same email, if there is one.
  if (role === 'field_engineer') {
    await admin
      .from('field_engineers')
      .update({ user_id: userId })
      .ilike('email', email)
      .is('user_id', null)
  }

  if (body.send_reset_email) await sendReset(email, body.redirect_to)
  return { id: userId }
}

// deno-lint-ignore no-explicit-any
async function updateUser(callerId: string, body: any) {
  const userId = body.user_id
  if (typeof userId !== 'string') throw new HttpError(400, 'user_id is required.')
  const role = checkRole(body.role)
  const permissions = cleanPermissions(role, body.permissions)

  if (userId === callerId && (role !== 'staff' || !permissions.includes('admin'))) {
    throw new HttpError(400, "You can't remove your own admin access — ask another admin to do it.")
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const { error } = await admin
    .from('profiles')
    .update({ full_name: fullName, role, permissions })
    .eq('id', userId)
  if (error) throw error

  // Keep the auth metadata matching, since that's what the Supabase
  // dashboard shows.
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: fullName, role },
  })
  if (authError) throw authError
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const callerId = await requireAdmin(req)
    const body = await req.json()

    switch (body.action) {
      case 'list':
        return json({ users: await listUsers() })
      case 'create':
        return json(await createUser(body))
      case 'update':
        return json(await updateUser(callerId, body))
      case 'set_password': {
        if (typeof body.user_id !== 'string') throw new HttpError(400, 'user_id is required.')
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          password: checkPassword(body.password),
        })
        if (error) throw new HttpError(400, error.message)
        return json({ ok: true })
      }
      case 'set_disabled': {
        // A disabled account can't sign in or refresh its session. Supabase
        // calls this a "ban"; ~100 years stands in for "until re-enabled".
        if (typeof body.user_id !== 'string') throw new HttpError(400, 'user_id is required.')
        if (body.user_id === callerId) throw new HttpError(400, "You can't disable your own account.")
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          ban_duration: body.disabled ? '876000h' : 'none',
        })
        if (error) throw new HttpError(400, error.message)
        return json({ ok: true })
      }
      case 'send_reset': {
        if (typeof body.user_id !== 'string') throw new HttpError(400, 'user_id is required.')
        const { data, error } = await admin.auth.admin.getUserById(body.user_id)
        if (error || !data.user.email) throw new HttpError(404, 'User not found.')
        await sendReset(data.user.email, body.redirect_to)
        return json({ ok: true })
      }
      default:
        throw new HttpError(400, 'Unknown action.')
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    return json({ error: message }, status)
  }
})
