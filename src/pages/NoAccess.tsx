import { Card } from '../components/ui'

// Shown to a staff user who hasn't been given any areas yet.
export default function NoAccess() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-2 text-lg font-semibold text-text">No areas assigned yet</h1>
        <p className="text-sm text-text-muted">
          Your login works, but you haven't been given access to any part of Spine CRM. Ask a Spine
          CRM admin to set your permissions.
        </p>
      </Card>
    </div>
  )
}
