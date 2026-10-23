import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button, Card, ErrorText, Eyebrow, Input, Label } from '../components/ui'
import SpineMark from '../components/icons/SpineMark'

type Mode = 'password' | 'magic-link'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMagicLinkSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong signing you in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dot-grid-bg flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-contrast">
            <SpineMark className="h-6 w-6" />
          </span>
          <Eyebrow>techtrus // internal</Eyebrow>
          <h1 className="font-display mt-2 text-3xl font-semibold text-text">Spine CRM</h1>
        </div>

        <Card>
          <div className="mb-4 flex items-center gap-1.5 border-b border-hair pb-3">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
            <span className="font-mono-label ml-2 text-xs text-text-faint">spine@techtrus: ~/login</span>
          </div>

          {magicLinkSent ? (
            <p className="text-sm text-text">
              Check <span className="font-medium text-text">{email}</span> for a sign-in link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@techtrus.co.uk"
                />
              </div>

              {mode === 'password' && (
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}

              <ErrorText>{error}</ErrorText>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : mode === 'password' ? 'Sign in' : 'Send magic link'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'password' ? 'magic-link' : 'password')
                  setError(null)
                }}
                className="w-full text-center text-xs text-text-muted hover:text-accent"
              >
                {mode === 'password' ? 'Use a magic link instead' : 'Use a password instead'}
              </button>
            </form>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-text-faint">
          Don't have an account yet? Ask your Spine CRM admin to invite you.
        </p>

        <img src="/techtrus-logo.png" alt="Techtrus" className="mx-auto mt-8 h-7 w-auto opacity-70" />
      </div>
    </div>
  )
}
