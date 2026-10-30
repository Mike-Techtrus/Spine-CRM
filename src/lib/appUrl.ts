// The address links in emails send people back to (password resets, magic
// links). Always the public app address — never the address the sender happens
// to be on: spine-crm-techtrus.vercel.app (and other *.vercel.app deployment
// URLs) sit behind Vercel's own login, so anyone without a Vercel account who
// lands there gets a Vercel sign-in page instead of Spine. Running locally,
// links come back to localhost so they can be tested.
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://spine-crm.vercel.app'

export function publicAppUrl(): string {
  const { hostname, origin } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' ? origin : PUBLIC_APP_URL
}
