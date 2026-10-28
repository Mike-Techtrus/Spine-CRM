import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Card, ErrorText, Input, Label } from '../components/ui'

// Where people land from a "reset your password" email (sent from the Admin
// area). Also usable by anyone signed in who wants to change their password.
export default function SetPassword() {
  const navigate = useNavigate()
  const { clearPasswordRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError("Passwords don't match.")
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      clearPasswordRecovery()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-xl font-semibold text-text">Set a new password</h1>
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>New password</Label>
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save password'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
