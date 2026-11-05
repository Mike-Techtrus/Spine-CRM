// The "How to" panels shown at the top of each section. Keep the wording in step
// with the screens: if a button is renamed or a rule changes, change it here too.
// The timesheet guide for My timesheets is separate (TimesheetGuide.tsx).
import HowToGuide, { GuideStep, GuideSteps, GuideTips, SalesFlow } from './HowToGuide'

// ── Sales pipeline ───────────────────────────────────────────────────────────

export function OpportunitiesGuide() {
  return (
    <HowToGuide id="opportunities" title="How opportunities work">
      <SalesFlow current="Opportunity" />
      <GuideSteps>
        <GuideStep n={1} title="Start with an opportunity">
          Emails about new work can go through the <strong>Intake</strong> tab first. Otherwise, press{' '}
          <strong>New opportunity</strong> for every piece of work a customer asks about. Pick the client (the
          company we invoice, e.g. CDW) and, if there is one, the end client (who the work is actually for).
        </GuideStep>
        <GuideStep n={2} title="Add a quote">
          Save the opportunity, then press <strong>New quote</strong> on it. An opportunity can have several quotes — for
          options or revised prices.
        </GuideStep>
        <GuideStep n={3} title="The stage looks after itself">
          No quotes → <em>Qualifying</em>; a draft or sent quote → <em>Quoting</em>; any quote accepted →{' '}
          <em>Closed Won</em>; every quote declined or expired → <em>Closed Lost</em>. You can&apos;t set it by hand.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Once a quote is accepted, the opportunity&apos;s value is taken from accepted quotes and locks.</li>
        <li>
          Use the search box, the column filters and <strong>Columns</strong> to choose what the list shows;{' '}
          <strong>Export to Excel</strong> at the bottom downloads exactly what you can see.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function IntakeGuide() {
  return (
    <HowToGuide id="intake" title="How intake works">
      <GuideSteps>
        <GuideStep n={1} title="An email comes in">
          Press <strong>Add email</strong> and paste it in (or, once the mailbox is connected, new emails arrive here by
          themselves). The AI reads it: is it new work or about an opportunity we already have, what kind of job it is, and
          what we know so far.
        </GuideStep>
        <GuideStep n={2} title="Check what it found">
          The match to an existing opportunity uses the CDW OPP number first, then the email thread, then end client and
          project. The qualification sheet shows each thing we need to know before quoting, what the email says, and the
          words it came from. Anything missing is listed with why it matters for the price.
        </GuideStep>
        <GuideStep n={3} title="Create, link or dismiss">
          <strong>Create opportunity</strong> (the fields are filled in for you to check) or{' '}
          <strong>Link and update its sheet</strong> for a reply on a job we already have. The opportunity keeps a running
          qualification sheet that each linked email adds to. <strong>Dismiss</strong> anything that isn&apos;t
          opportunity-related.
        </GuideStep>
        <GuideStep n={4} title="Ask for what's missing">
          <strong>Copy</strong> the draft reply into Outlook, edit it and send it yourself — Spine never sends emails.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>The AI only suggests. Nothing changes in Spine until you press a button, and you can edit everything afterwards.</li>
        <li>Wrong choice? Open it under <strong>Done</strong> and press <strong>Back to review</strong>.</li>
      </GuideTips>
    </HowToGuide>
  )
}

export function QuotesGuide() {
  return (
    <HowToGuide id="quotes" title="How quotes work">
      <SalesFlow current="Quote" />
      <GuideSteps>
        <GuideStep n={1} title="Create it from an opportunity">
          Open the opportunity and press <strong>New quote</strong> — the client and end client come across.
        </GuideStep>
        <GuideStep n={2} title="Add the lines">
          Use <strong>Add from rate card…</strong> to pull in a role or item at the client&apos;s rate-card price, or type a
          line yourself. Give every line a <strong>line type</strong> (Resource, Outsource Resource, Expenses…) — it decides
          what earns rebate and what becomes a project line.
        </GuideStep>
        <GuideStep n={3} title="Day rates with travel built in">
          Each line shows <strong>Rate</strong> (from the rate card, or typed in) <strong>+ Expenses</strong> (travel/subsistence
          per day) <strong>= Price</strong>. Only the Price is printed; keeping expenses separate means rebate and margin are on
          the rate only.
        </GuideStep>
        <GuideStep n={4} title="Send it">
          <strong>Print / Export PDF</strong> gives the customer copy. Set the status to <em>Sent</em>. Quotes are valid
          for 30 days.
        </GuideStep>
        <GuideStep n={5} title="When the PO arrives">
          Set the status to <em>Accepted</em> and save, then press <strong>Create Sales Order from this Quote</strong>.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Value, VAT and Total are worked out from the lines (VAT at 20%).</li>
        <li>Changing a rate card later never changes a saved quote.</li>
        <li>
          <strong>Price builder</strong> works out the profit first: roles × days at sell and cost rates, plus expenses
          (hotels, mileage, parking…) with an optional markup. Choose to bundle the expenses into the day rates (over all
          roles or one role) or charge them on a separate Expenses line, then press <strong>Fill quote lines</strong>. The
          workings are saved with the quote, for us only — never printed.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function SalesOrdersGuide() {
  return (
    <HowToGuide id="sales-orders" title="How sales orders work">
      <SalesFlow current="Sales order" />
      <GuideSteps>
        <GuideStep n={1} title="Create it from an accepted quote">
          On the quote, press <strong>Create Sales Order from this Quote</strong>. Add the customer&apos;s{' '}
          <strong>PO number</strong>, PO received date and the start and end dates, save, then attach the PO itself under{' '}
          <strong>PO copy</strong> (PDF, or take a photo on a phone). <strong>Check with AI</strong> reads it and shows whether
          the PO value, total, PO number and quote reference match — <strong>Use these figures</strong> fills them in for you to
          check and save.
        </GuideStep>
        <GuideStep n={2} title="Went ahead without a PO?">
          Tick <strong>Proceeding without a PO</strong> and note who approved it. The order shows{' '}
          <strong>PO: Outstanding</strong> and appears in Admin → Data checks until the PO arrives. When it does, enter the PO
          number and received date (or attach it and use <strong>Check with AI</strong>) and save — leave the box ticked so the
          record stays. Spine offers to add the PO number to any draft or sent invoices already raised.
        </GuideStep>
        <GuideStep n={3} title="Day-rate work? Create a project">
          Press <strong>Create project</strong> to set up the timesheet lines from the quote, so people can be assigned and
          log their days against it. Extra days for a project that already exists? Use{' '}
          <strong>Add to existing project</strong> instead.
        </GuideStep>
        <GuideStep n={4} title="Invoice against it">
          Press <strong>Create Invoice from this Sales Order</strong> for fixed-price or one-off invoices. For day-rate
          work, invoice from the project instead (approved timesheet days).
        </GuideStep>
        <GuideStep n={5} title="Close it when finished">
          The <em>Invoicing</em> panel shows how much is left to invoice (ex VAT). When nothing more will be invoiced, use{' '}
          <strong>Close sales order</strong> with a reason — <strong>Reopen</strong> undoes it.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Invoiced to date adds itself up from the linked invoices (drafts and cancelled ones don&apos;t count).</li>
        <li>Admin → Data checks lists orders that are over-invoiced, stalled or missing a value.</li>
      </GuideTips>
    </HowToGuide>
  )
}

export function InvoicesGuide() {
  return (
    <HowToGuide id="invoices" title="How invoices work">
      <SalesFlow current="Invoice" />
      <GuideSteps>
        <GuideStep n={1} title="Create the invoice">
          Either open the sales order and press <strong>Create Invoice from this Sales Order</strong>, or, for day-rate
          work, open the project and use <strong>Create draft invoice</strong> to bill approved timesheet days.
        </GuideStep>
        <GuideStep n={2} title="Check the lines">
          Each line has a description, quantity, price and line type. Add expenses or other manual lines here. The due date
          is filled in from the client&apos;s payment terms.
        </GuideStep>
        <GuideStep n={3} title="Send it">
          <strong>Print / Export PDF</strong> gives the customer copy, with the bank details from Admin → Invoice settings.
          Set the status to <em>Sent</em> and save.
        </GuideStep>
        <GuideStep n={4} title="Record the payment">
          When the money arrives, use <strong>Record payment</strong> with the date it reached the bank, then set the status
          to <em>Paid</em>. The CDW rebate report goes by this payment date, so don&apos;t skip it.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Draft invoices don&apos;t count towards the sales order&apos;s invoiced total until they&apos;re sent.</li>
        <li>Deleting an invoice made from timesheets frees those days to be invoiced again.</li>
        <li>
          The <strong>Contractor costs</strong> tab is for what we owe contractors, not customer invoices.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function ContractorCostsGuide() {
  return (
    <HowToGuide id="contractor-costs" title="How contractor costs work">
      <GuideSteps>
        <GuideStep n={1} title="Pick the month worked">
          The list shows each contractor&apos;s approved days for that month, priced at their cost rate on the project (or
          their day rate for other time).
        </GuideStep>
        <GuideStep n={2} title="Record the statement">
          When their invoice to us comes in, check it against the figure here and press <strong>Record statement</strong>.
          That fixes the amount and locks those days.
        </GuideStep>
        <GuideStep n={3} title="Mark it paid">
          Once paid, mark the statement paid with the date and payment reference. <strong>Print / PDF</strong> gives a copy
          for the contractor.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Days approved after a statement is recorded can go on another statement for the same month.</li>
        <li>An unpaid statement can be deleted — its days go back to &quot;not yet recorded&quot;.</li>
        <li>A day with no cost rate stops the statement; set the cost rate on the project&apos;s assignment first.</li>
        <li>Staff time isn&apos;t shown — it&apos;s paid through payroll.</li>
      </GuideTips>
    </HowToGuide>
  )
}

// ── Projects and timesheets ──────────────────────────────────────────────────

export function ProjectsGuide() {
  return (
    <HowToGuide id="projects" title="How projects work">
      <SalesFlow current="Project" />
      <GuideSteps>
        <GuideStep n={1} title="Create it from the sales order">
          On the sales order, press <strong>Create project</strong>. The day-rate lines on the accepted quote become project
          lines, with the quoted days and day rate.
        </GuideStep>
        <GuideStep n={2} title="Set the owner and assign people">
          The owner approves contractors&apos; timesheets. Under each line, assign a contractor or staff member and give
          them their allocated days (half days are fine). Their cost rate fills in from their profile — change it here if
          this job pays differently.
        </GuideStep>
        <GuideStep n={3} title="People log time">
          Assigned people see a row for each line on their weekly timesheet. They can&apos;t go over their allocated days.
        </GuideStep>
        <GuideStep n={4} title="Invoice the approved days">
          In the <em>Invoicing</em> panel, choose the period and press <strong>Create draft invoice</strong>. It bills
          approved days at the quoted day rate; those days are then locked.
        </GuideStep>
        <GuideStep n={5} title="Close it">
          When the work&apos;s done, press <strong>Close project (completed)</strong> — it lists anything still waiting
          (approvals, drafts, days not invoiced) first. A project that isn&apos;t going ahead can be{' '}
          <strong>cancelled</strong> instead, but only while nothing has been timesheeted. Either can be reopened.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>
          The Margin card compares sell rate with cost rate — planned (all quoted days: named people at their own cost
          rate, the rest at the role&apos;s standard contractor cost) and delivered (approved days).
        </li>
        <li>
          Days running out? Raise a new quote on the same opportunity. When the PO comes in, on its sales order press{' '}
          <strong>Add to existing project</strong> — the extra days join this project as new lines, invoiced against the new
          PO.
        </li>
        <li>Set the status to Complete at the end — no more time can be submitted against it.</li>
      </GuideTips>
    </HowToGuide>
  )
}

export function TeamTimesheetsGuide() {
  return (
    <HowToGuide id="team-timesheets" title="How to approve timesheets">
      <GuideSteps>
        <GuideStep n={1} title="Find what's waiting">
          Filter the status to <em>Submitted</em>. The number on the Timesheets tab is how many are waiting for you.
        </GuideStep>
        <GuideStep n={2} title="Approve or reject">
          Open a day and press <strong>Approve</strong>, or <strong>Reject</strong> with a reason — the person sees the
          reason and can correct it. Only the project owner or an admin can approve project time, and never their own.
        </GuideStep>
        <GuideStep n={3} title="Made a mistake?">
          <strong>Un-approve (back to draft)</strong> sends an approved day back so it can be changed. Days already
          invoiced or on a contractor statement can&apos;t be changed.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Staff time is approved automatically when submitted; only contractors&apos; time waits here.</li>
      </GuideTips>
    </HowToGuide>
  )
}

// ── Reports ──────────────────────────────────────────────────────────────────

export function RebateReportGuide() {
  return (
    <HowToGuide id="rebate-report" title="How to check the CDW rebate">
      <GuideSteps>
        <GuideStep n={1} title="Pick the quarter">
          Choose the dates (or a quick period). Leave <em>Period is by</em> on <strong>Payment received</strong> to match
          CDW&apos;s credit note — it counts invoices by the date they were paid.
        </GuideStep>
        <GuideStep n={2} title="Check the conditions">
          The client and rate default to the account with a rebate. Line types that earn rebate, and leaving out expenses
          bundled into day rates, are already set to match how CDW works it out.
        </GuideStep>
        <GuideStep n={3} title="Compare and export">
          Check the total against the credit note. The per-invoice table shows what makes it up; use{' '}
          <strong>Export to Excel</strong> or <strong>Print / PDF</strong> to share it.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>
          If it warns about Paid invoices with no payment date, record their payments (Invoices → Record payment) or they
          won&apos;t land in any quarter.
        </li>
        <li>The report works everything out afresh — it never changes the invoices.</li>
      </GuideTips>
    </HowToGuide>
  )
}

// ── Admin ────────────────────────────────────────────────────────────────────

export function DataChecksGuide() {
  return (
    <HowToGuide id="data-checks" title="How to use data checks">
      <GuideSteps>
        <GuideStep n={1} title="Pick a group">
          Each group is one kind of problem, with a note on how to fix it. Click a row to open the record.
        </GuideStep>
        <GuideStep n={2} title="Fix it on the record">
          Once the record is fixed it drops off the list on its own.
        </GuideStep>
        <GuideStep n={3} title="Or put it to rest">
          <strong>Close</strong> a stalled or old sales order that won&apos;t be invoiced, or <strong>Dismiss</strong> a row
          with a reason when it&apos;s correct as it is.
        </GuideStep>
      </GuideSteps>
    </HowToGuide>
  )
}

export function RateCardsGuide() {
  return (
    <HowToGuide id="rate-cards" title="How rate cards work">
      <GuideSteps>
        <GuideStep n={1} title="Line types">
          Each line type says whether it&apos;s billed <em>from timesheets</em> (becomes a project line) or{' '}
          <em>added manually</em>, and whether it <strong>earns rebate</strong>.
        </GuideStep>
        <GuideStep n={2} title="Line items and the Default card">
          Line items are the roles and products you quote, each with a part code and line type. The Default card holds
          the standard price for each.
        </GuideStep>
        <GuideStep n={3} title="Custom cards">
          A custom card only needs the prices that differ — anything not on it uses the Default price. Give a customer a
          card in Customer Accounts → Edit.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>Price changes only affect new quote lines; saved quotes keep their prices.</li>
        <li>Changing &quot;Earns rebate&quot; doesn&apos;t recalculate past records.</li>
        <li>
          <strong>Std contractor cost / day</strong> is what we usually pay a contractor for that role (same on every card).
          It fills the Price builder&apos;s cost per day and costs project days nobody&apos;s been named for yet.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function CustomerAccountsGuide() {
  return (
    <HowToGuide id="customer-accounts" title="How customer accounts work">
      <GuideSteps>
        <GuideStep n={1} title="Add or edit an account">
          <strong>Add account</strong> for a new customer; <strong>Edit</strong> to change one. Accounts are used as both
          client (who we invoice) and end client (who the work is for).
        </GuideStep>
        <GuideStep n={2} title="Billing details">
          The billing name and address print on invoices — fill them in before the first invoice.
        </GuideStep>
        <GuideStep n={3} title="Terms, rebate and rate card">
          <strong>Payment terms</strong> set each invoice&apos;s due date. <strong>Rebate %</strong> is for customers with
          an agreed rebate (CDW 7.5%; everyone else 0). <strong>Rate card</strong> picks a custom price list for quotes.
        </GuideStep>
      </GuideSteps>
    </HowToGuide>
  )
}

export function PeopleGuide({ staff }: { staff: boolean }) {
  return (
    <HowToGuide id={staff ? 'people-staff' : 'people-contractors'} title={staff ? 'How staff profiles work' : 'How contractor profiles work'}>
      <GuideSteps>
        <GuideStep n={1} title="Add the person">
          Fill in the form below and press <strong>Add {staff ? 'staff member' : 'contractor'}</strong>. The {staff ? 'cost rate is what a day of their time costs' : 'day rate is what we pay them per day'}
          {' '}— it&apos;s copied onto project assignments for the margin.
        </GuideStep>
        <GuideStep n={2} title="Link their login">
          So they can sign in and fill in timesheets, create a login in Admin → Logins first, then pick it in the{' '}
          <strong>Login</strong> box here. Each login can be linked to one person.
        </GuideStep>
        <GuideStep n={3} title="Fill in the profile">
          Open their profile to add the address, CV, skills{staff ? '' : ' and certifications'}. They can also do this
          themselves under My Profile.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>
          <strong>Find &amp; availability</strong> searches people by skill and shows who&apos;s free; <strong>Expiring</strong>{' '}
          lists certifications and ID coming up for renewal.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function FindPeopleGuide() {
  return (
    <HowToGuide id="find-people" title="How to find someone for a job">
      <GuideSteps>
        <GuideStep n={1} title="Choose the skills">
          Pick every skill the job needs — only people with all of them are shown. Set a minimum level if it matters.
        </GuideStep>
        <GuideStep n={2} title="Read the weeks">
          The list is sorted by free days over the next 4 weeks, with each of the next 8 weeks alongside.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>
          Booked days are timesheet days plus an estimate for allocated days not yet logged, spread over the sales
          order&apos;s dates. Allocations with no end date show as &quot;unscheduled&quot;.
        </li>
      </GuideTips>
    </HowToGuide>
  )
}

export function LoginsGuide() {
  return (
    <HowToGuide id="logins" title="How logins and permissions work">
      <GuideSteps>
        <GuideStep n={1} title="Add a login">
          <strong>Add login</strong> with their name, email and profile (staff or contractor). Either set a password
          or email them a link to choose their own.
        </GuideStep>
        <GuideStep n={2} title="Choose what they can change">
          Tick the areas a staff member can edit. All staff can view everything; admins can change everything.
          Contractors only see their own timesheets and profile.
        </GuideStep>
        <GuideStep n={3} title="Someone leaving?">
          Open their login and press <strong>Disable account</strong> — <strong>Enable account</strong> undoes it. Nothing
          they entered is lost.
        </GuideStep>
      </GuideSteps>
      <GuideTips>
        <li>For timesheets, the login also needs linking to their contractor or staff record in User Accounts.</li>
      </GuideTips>
    </HowToGuide>
  )
}

// ── My Profile ───────────────────────────────────────────────────────────────

export function MyProfileGuide() {
  return (
    <HowToGuide id="my-profile" title="How to keep your profile up to date">
      <GuideSteps>
        <GuideStep n={1} title="Your details">
          You can change your phone number and address. For your name, email or rate, ask an admin.
        </GuideStep>
        <GuideStep n={2} title="Photo, CV and ID">
          Upload a profile photo, your latest CV, and your driving licence or passport. On a phone, <strong>Take photo</strong>{' '}
          uses the camera. ID documents are only seen by you and admins.
        </GuideStep>
        <GuideStep n={3} title="Skills and certifications">
          Add your skills with your level, and expiry dates for certifications — you&apos;ll get a reminder before they run
          out. Can&apos;t find a skill? Request it and an admin will add it.
        </GuideStep>
      </GuideSteps>
    </HowToGuide>
  )
}
