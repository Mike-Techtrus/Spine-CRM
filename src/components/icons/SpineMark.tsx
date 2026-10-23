// The Spine CRM mark: four vertebrae-like segments following a gentle S-bend —
// an abstracted nod to the old "S" glyph it replaces, without spelling it out.
export default function SpineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="9.5" y="2.3" width="9" height="3.2" rx="1.6" />
      <rect x="6" y="6.9" width="9" height="3.2" rx="1.6" />
      <rect x="9" y="11.5" width="9" height="3.2" rx="1.6" />
      <rect x="5.5" y="16.1" width="9" height="3.2" rx="1.6" />
    </svg>
  )
}
