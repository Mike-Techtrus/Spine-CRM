import { useState } from 'react'
import { Card } from './ui'
import { GuideStep as Step } from './HowToGuide'

const STORAGE_KEY = 'spine.timesheetGuide.open'

// Open on someone's first visit; after that, remember whether they closed it.
function initialOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-5 rounded border ${className}`} />
      {label}
    </span>
  )
}

/** "How to" panel at the top of Timesheets → My timesheets. Wording differs for staff and contractors. */
export default function TimesheetGuide({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState(initialOpen)

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Not remembered — fine.
    }
  }

  return (
    <Card className="mb-6">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-semibold text-text">How to fill in your timesheet</span>
        <span className="text-xs text-text-muted">{open ? 'Hide guide ▲' : 'Show guide ▼'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 text-sm">
          <ol className="space-y-4">
            <Step n={1} title="Pick the week">
              Use <strong>← Prev</strong>, <strong>This week</strong> and <strong>Next →</strong> on the grid below. Weeks run
              Monday to Sunday; today&apos;s date is highlighted in green.
            </Step>
            <Step n={2} title="Fill in the days you worked">
              Each row is a project line you&apos;ve been assigned to. For every day you worked on it, choose{' '}
              <strong>Full</strong>, <strong>AM</strong> or <strong>PM</strong>. You can&apos;t book more than one day in
              total on the same date — the <em>Day total</em> row turns red if you do.
            </Step>
            <Step n={3} title="Keep an eye on Days left">
              <em>Days left</em> shows how many of your allocated days remain on that line, including what you&apos;ve
              just entered. If it goes red you&apos;re over your allocation and the week won&apos;t submit — speak to the
              project owner if you need more days.
            </Step>
            <Step n={4} title="Save draft as you go">
              <strong>Save draft</strong> keeps your entries without sending them. You can come back and change drafts
              any time. To remove a day, set it back to <strong>—</strong> and save.
            </Step>
            <Step n={5} title="Submit the week">
              {isStaff ? (
                <>
                  Press <strong>Submit week</strong> when the week is right. As a member of staff your time is{' '}
                  <strong>approved straight away</strong> — no one else needs to sign it off.
                </>
              ) : (
                <>
                  Press <strong>Submit week</strong> when the week is right. It goes to the{' '}
                  <strong>project owner for approval</strong>. Submitted days are locked while they wait.
                </>
              )}
            </Step>
            <Step n={6} title="Non-project time">
              For work that isn&apos;t on one of your project lines, use <strong>Log other time</strong> (top right) to
              record a single day against a client.
            </Step>
          </ol>

          <div className="rounded-md border border-border bg-sunken p-3">
            <p className="mb-2 text-xs font-mono-label text-text-muted">What the colours mean</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted">
              <Swatch className="border-border-strong bg-sunken" label="Saved draft" />
              {!isStaff && <Swatch className="border-warning/40 bg-warning/10" label="Submitted — waiting for approval" />}
              <Swatch className="border-accent/40 bg-accent/10" label="Approved" />
              <Swatch className="border-danger bg-sunken" label="Rejected — hover for the reason" />
            </div>
          </div>

          <div>
            <p className="mb-1 font-medium text-text">Need to change something you&apos;ve already submitted?</p>
            <ul className="list-disc space-y-1 pl-5 text-text-muted">
              {isStaff ? (
                <li>
                  Click the day in <strong>All my entries</strong> below and press{' '}
                  <strong>Un-approve (back to draft)</strong>. Change it on the grid, then submit the week again.
                </li>
              ) : (
                <>
                  <li>
                    <strong>Rejected days</strong> show with a red border. Hover over them to see why, change them, then
                    submit the week again.
                  </li>
                  <li>
                    For a day that&apos;s already submitted or approved, ask the <strong>project owner</strong> to send it
                    back to draft.
                  </li>
                </>
              )}
              <li>Days that have already been invoiced can&apos;t be changed.</li>
            </ul>
          </div>

          <div>
            <p className="mb-1 font-medium text-text">Expenses</p>
            <ul className="list-disc space-y-1 pl-5 text-text-muted">
              <li>
                Under <strong>My expenses</strong>, press <strong>Add expense</strong> for hotels, mileage, parking and so on —
                choose the project, enter the amount you paid (and the VAT part if the receipt shows it) and add a photo of
                the receipt.
              </li>
              {isStaff ? (
                <li>Your own expenses are approved straight away.</li>
              ) : (
                <li>
                  The project owner approves them. Approved expenses are paid back on your monthly contractor statement.
                  You can change or delete one until it&apos;s approved; a rejected one shows why — fix it and it goes back
                  for approval.
                </li>
              )}
            </ul>
          </div>

          <p className="text-xs text-text-faint">
            Can&apos;t see a project you&apos;re working on? Ask the project owner to assign you to it — it&apos;ll then
            appear as a row on the grid.
          </p>
        </div>
      )}
    </Card>
  )
}
