import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createContractorStatement,
  deleteContractorStatement,
  getCompanySettings,
  listApprovedDaysBetween,
  listApprovedPersonExpensesBetween,
  listContractorStatements,
  listFieldEngineers,
  listStatementDays,
  listStatementExpenses,
  markStatementPaid,
  markStatementUnpaid,
  type ContractorStatement,
  type CostDay,
  type ProjectExpense,
} from '../../lib/api'
import { DAY_TYPE_DAYS, DAY_TYPE_LABELS, PERSON_KINDS, type CompanySettings, type FieldEngineer } from '../../lib/types'
import { round2 } from '../../lib/money'
import { Button, Card, ErrorText, Input, Label, StatTile, StatusBadge } from '../../components/ui'
import PrintDocument, { printWithTitle } from '../../components/PrintDocument'
import InvoiceTabs from './InvoiceTabs'
import { ContractorCostsGuide } from '../../components/guides'

// Invoices → Contractor costs (migration 0043): each contractor's approved
// days in a month at their cost rate. "Record statement" fixes the amount and
// locks those days; then mark it paid once the money's gone out.

function money(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function days(n: number) {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function monthStart(ym: string) {
  return `${ym}-01`
}

function monthEnd(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

function monthLabel(ym: string) {
  return new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function lastMonth() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Cost per day: stamped rate once on a statement; otherwise the allocation's
// cost rate, or the person's Day rate for non-project time.
function rateFor(day: CostDay, person: FieldEngineer | undefined): number | null {
  if (day.contractor_rate !== null) return Number(day.contractor_rate)
  const allocation = day.project_assignment?.cost_rate
  if (allocation !== null && allocation !== undefined) return Number(allocation)
  return person?.day_rate != null ? Number(person.day_rate) : null
}

function workLabel(day: CostDay) {
  const line = day.project_assignment?.project_line
  if (line) return `${line.project.reference} · ${line.part_code || line.line_type}`
  return day.client?.name ? `${day.client.name} (other time)` : 'Other time'
}

interface PersonRow {
  person: FieldEngineer
  open: CostDay[] // approved, not on a statement yet
  openDays: number
  openAmount: number // days + expenses
  openExpenses: ProjectExpense[] // approved expenses they paid, not on a statement yet (0060)
  openExpensesAmount: number
  uncostedDays: number
  statements: ContractorStatement[]
}

export default function ContractorCosts() {
  const [month, setMonth] = useState(lastMonth())
  const [people, setPeople] = useState<FieldEngineer[]>([])
  const [dayList, setDayList] = useState<CostDay[] | null>(null)
  const [expenseList, setExpenseList] = useState<ProjectExpense[]>([])
  const [statements, setStatements] = useState<ContractorStatement[]>([])
  const [company, setCompany] = useState<CompanySettings | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState<{
    statement: ContractorStatement
    person: FieldEngineer
    days: CostDay[]
    expenses: ProjectExpense[]
  } | null>(null)

  async function refresh() {
    const [everyone, list, st, exp] = await Promise.all([
      listFieldEngineers('contractor'),
      listApprovedDaysBetween(monthStart(month), monthEnd(month)),
      listContractorStatements(monthStart(month)),
      listApprovedPersonExpensesBetween(monthStart(month), monthEnd(month)).catch(() => [] as ProjectExpense[]),
    ])
    setPeople(everyone)
    setExpenseList(exp)
    setDayList(list)
    setStatements(st)
  }

  useEffect(() => {
    setDayList(null)
    setError(null)
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load.'))
  }, [month])

  useEffect(() => {
    getCompanySettings()
      .then(setCompany)
      .catch(() => setCompany(null))
  }, [])

  // Print once the statement's days have loaded and rendered.
  useEffect(() => {
    if (!printing) return
    const timer = window.setTimeout(() => {
      printWithTitle(`Contractor statement ${printing.statement.reference} ${printing.person.name}`)
      setPrinting(null)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [printing])

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const rows: PersonRow[] = useMemo(() => {
    if (!dayList) return []
    const map = new Map<string, PersonRow>()
    const row = (person: FieldEngineer) =>
      map.get(person.id) ??
      map
        .set(person.id, {
          person,
          open: [],
          openDays: 0,
          openAmount: 0,
          openExpenses: [],
          openExpensesAmount: 0,
          uncostedDays: 0,
          statements: [],
        })
        .get(person.id)!
    for (const d of dayList) {
      const person = personById.get(d.field_engineer_id)
      if (!person) continue // staff time — paid through payroll
      if (d.contractor_statement_id) continue
      const r = row(person)
      const n = DAY_TYPE_DAYS[d.day_type]
      const rate = rateFor(d, person)
      r.open.push(d)
      r.openDays += n
      if (rate === null) r.uncostedDays += n
      else r.openAmount = round2(r.openAmount + n * rate)
    }
    for (const e of expenseList) {
      const person = e.field_engineer_id ? personById.get(e.field_engineer_id) : undefined
      if (!person || e.contractor_statement_id) continue
      const r = row(person)
      r.openExpenses.push(e)
      r.openExpensesAmount = round2(r.openExpensesAmount + Number(e.amount))
      r.openAmount = round2(r.openAmount + Number(e.amount))
    }
    for (const s of statements) {
      const person = personById.get(s.field_engineer_id)
      if (person) row(person).statements.push(s)
    }
    return [...map.values()].sort((a, b) => a.person.name.localeCompare(b.person.name))
  }, [dayList, expenseList, statements, personById])

  const totals = useMemo(() => {
    const open = rows.reduce((s, r) => s + r.openAmount, 0)
    const recorded = statements.filter((s) => s.status === 'recorded').reduce((s, x) => s + Number(x.amount), 0)
    const paid = statements.filter((s) => s.status === 'paid').reduce((s, x) => s + Number(x.amount), 0)
    const allDays = rows.reduce((s, r) => s + r.openDays, 0) + statements.reduce((s, x) => s + Number(x.days), 0)
    return { open: round2(open), recorded: round2(recorded), paid: round2(paid), days: allDays }
  }, [rows, statements])

  async function run(key: string, action: () => Promise<unknown>, fallback: string) {
    setBusy(key)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setBusy(null)
    }
  }

  function record(r: PersonRow) {
    const what = [
      r.openDays > 0 ? `${days(r.openDays)} day(s)` : '',
      r.openExpenses.length > 0 ? `${r.openExpenses.length} expense(s)` : '',
    ]
      .filter(Boolean)
      .join(' and ')
    if (!window.confirm(`Record ${what} for ${r.person.name} in ${monthLabel(month)} — ${money(r.openAmount)}? They will be locked.`)) return
    run(r.person.id, () => createContractorStatement(r.person.id, monthStart(month)), 'Failed to record the statement.')
  }

  function markPaid(s: ContractorStatement) {
    const paidOn = window.prompt('Date paid (YYYY-MM-DD)', todayIso())
    if (!paidOn) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      setError('Please give the date as YYYY-MM-DD, e.g. 2026-11-28.')
      return
    }
    const reference = window.prompt('Payment reference (optional)', '') ?? ''
    run(s.id, () => markStatementPaid(s.id, paidOn, reference.trim() || null), 'Failed to mark as paid.')
  }

  function remove(s: ContractorStatement) {
    if (!window.confirm(`Delete ${s.reference}? Its days go back to "not yet recorded".`)) return
    run(s.id, () => deleteContractorStatement(s.id), 'Failed to delete the statement.')
  }

  async function print(s: ContractorStatement) {
    const person = personById.get(s.field_engineer_id)
    if (!person) return
    setError(null)
    try {
      const [statementDays, statementExpenses] = await Promise.all([listStatementDays(s.id), listStatementExpenses(s.id)])
      setPrinting({ statement: s, person, days: statementDays, expenses: statementExpenses })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the statement.')
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold text-text">Invoices</h1>
      </div>
      <div className="print:hidden">
        <InvoiceTabs />
        <ContractorCostsGuide />

        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Label>Month worked</Label>
            <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-auto" />
          </div>
          <p className="max-w-xl text-xs text-text-faint">
            Approved contractor days, each at its cost rate (the project allocation&apos;s rate, or the person&apos;s Day
            rate for non-project time), plus approved project expenses they paid themselves. <strong>Record statement</strong>{' '}
            fixes the amount and locks them; anything approved later can go on another statement. Staff time isn&apos;t shown — it&apos;s paid through payroll.
          </p>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Approved days" value={days(totals.days)} />
          <StatTile label="Not yet recorded" value={money(totals.open)} />
          <StatTile label="Recorded, to pay" value={money(totals.recorded)} />
          <StatTile label="Paid" value={money(totals.paid)} />
        </div>

        {!dayList && !error && <p className="text-sm text-text-muted">Loading…</p>}

        {dayList && rows.length === 0 && (
          <Card>
            <p className="text-sm text-text-muted">No approved contractor days or expenses in {monthLabel(month)}.</p>
          </Card>
        )}

        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.person.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link
                    to={`${PERSON_KINDS.contractor.path}/${r.person.id}`}
                    className="text-sm font-semibold text-text hover:text-accent hover:underline"
                  >
                    {r.person.name}
                  </Link>
                  <p className="text-xs text-text-faint">
                    Day rate {r.person.day_rate != null ? money(Number(r.person.day_rate)) : 'not set'}
                  </p>
                </div>
                {(r.openDays > 0 || r.openExpenses.length > 0) && (
                  <div className="text-right">
                    <p className="text-sm text-text">
                      {r.openDays > 0 && `${days(r.openDays)} day${r.openDays === 1 ? '' : 's'}`}
                      {r.openDays > 0 && r.openExpenses.length > 0 && ' + '}
                      {r.openExpenses.length > 0 && `${money(r.openExpensesAmount)} expenses`} not yet recorded ·{' '}
                      {money(r.openAmount)}
                    </p>
                    {r.uncostedDays > 0 ? (
                      <p className="text-xs text-warning">
                        {days(r.uncostedDays)} day(s) have no cost rate — set the allocation&apos;s rate or their Day rate.
                      </p>
                    ) : (
                      <Button className="mt-2" onClick={() => record(r)} disabled={busy !== null}>
                        {busy === r.person.id ? 'Recording…' : 'Record statement'}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {r.openExpenses.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs text-text-muted">Show the expenses not yet recorded</summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
                    {r.openExpenses.map((e) => (
                      <li key={e.id}>
                        {e.expense_date} · {e.reference} · {e.project?.reference} · {e.category}
                        {e.description ? ` (${e.description})` : ''} · {money(Number(e.amount))}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {r.open.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs text-text-muted">Show the days not yet recorded</summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
                    {r.open.map((d) => {
                      const rate = rateFor(d, r.person)
                      return (
                        <li key={d.id}>
                          {d.work_date} · {DAY_TYPE_LABELS[d.day_type]} · {workLabel(d)} ·{' '}
                          {rate === null ? <span className="text-warning">no rate</span> : money(rate * DAY_TYPE_DAYS[d.day_type])}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}

              {r.statements.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-raised text-left text-xs font-mono-label text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Statement</th>
                        <th className="px-3 py-2 text-right">Days</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.statements.map((s) => (
                        <tr key={s.id} className="border-t border-border">
                          <td className="px-3 py-2 font-mono-label text-text">{s.reference}</td>
                          <td className="px-3 py-2 text-right text-text-muted">{days(Number(s.days))}</td>
                          <td className="px-3 py-2 text-right text-text">
                            {money(Number(s.amount))}
                            {Number(s.expenses ?? 0) > 0 && (
                              <span className="block text-[11px] text-text-faint">incl. {money(Number(s.expenses))} expenses</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={s.status === 'paid' ? 'approved' : 'submitted'} label={s.status === 'paid' ? 'Paid' : 'To pay'} />
                            {s.paid_on && (
                              <span className="ml-2 text-xs text-text-faint">
                                {s.paid_on}
                                {s.payment_reference && ` · ${s.payment_reference}`}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="flex justify-end gap-3 text-xs">
                              <button onClick={() => print(s)} className="text-accent hover:underline">
                                Print / PDF
                              </button>
                              {s.status === 'recorded' ? (
                                <>
                                  <button onClick={() => markPaid(s)} disabled={busy !== null} className="text-accent hover:underline">
                                    Mark paid
                                  </button>
                                  <button onClick={() => remove(s)} disabled={busy !== null} className="text-text-muted hover:text-danger">
                                    Delete
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => run(s.id, () => markStatementUnpaid(s.id), 'Failed to update.')}
                                  disabled={busy !== null}
                                  className="text-text-muted hover:text-text"
                                >
                                  Not paid
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {printing && <StatementPrint {...printing} company={company} />}
    </div>
  )
}

function StatementPrint({
  statement,
  person,
  days: list,
  expenses,
  company,
}: {
  statement: ContractorStatement
  person: FieldEngineer
  days: CostDay[]
  expenses: ProjectExpense[]
  company: CompanySettings | null
}) {
  const expensesTotal = Number(statement.expenses ?? 0)
  const ym = statement.period_month.slice(0, 7)
  const address = [person.address_line_1, person.address_line_2, person.city, person.postcode].filter(Boolean)
  return (
    <PrintDocument
      footer={
        company?.company_name ? (
          <p className="border-t border-black/30 pt-2 text-[10px] text-black/70">
            {company.company_name}
            {company.registered_address && ` · ${company.registered_address}`}
          </p>
        ) : undefined
      }
    >
      <div className="mb-6 flex items-start justify-between">
        <div>
          <img src="/techtrus-logo.png" alt="Techtrus" className="mb-4 h-8 w-auto" />
          <p className="font-semibold">{person.name}</p>
          {address.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold">Contractor statement</p>
          <p>Statement {statement.reference}</p>
          <p>Work in {monthLabel(ym)}</p>
          <p>Issued {new Date(statement.created_at).toLocaleDateString('en-GB')}</p>
        </div>
      </div>

      <table className="mb-6 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-black">
            <th className="py-1.5 pr-2">Date</th>
            <th className="py-1.5 pr-2">Work</th>
            <th className="py-1.5 pr-2">Day</th>
            <th className="py-1.5 pr-2 text-right">Rate</th>
            <th className="py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => {
            const rate = Number(d.contractor_rate ?? 0)
            return (
              <tr key={d.id} className="border-b border-black/20">
                <td className="py-1.5 pr-2">{new Date(`${d.work_date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                <td className="py-1.5 pr-2">{workLabel(d)}</td>
                <td className="py-1.5 pr-2">{DAY_TYPE_LABELS[d.day_type]}</td>
                <td className="py-1.5 pr-2 text-right">{money(rate)}</td>
                <td className="py-1.5 text-right">{money(round2(rate * DAY_TYPE_DAYS[d.day_type]))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {expenses.length > 0 && (
        <>
          <p className="mb-1 font-semibold">Expenses</p>
          <table className="mb-6 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1.5 pr-2">Date</th>
                <th className="py-1.5 pr-2">Project</th>
                <th className="py-1.5 pr-2">Expense</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-black/20">
                  <td className="py-1.5 pr-2">{new Date(`${e.expense_date}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                  <td className="py-1.5 pr-2">{e.project?.reference ?? ''}</td>
                  <td className="py-1.5 pr-2">
                    {e.reference} · {e.category}
                    {e.description ? ` — ${e.description}` : ''}
                  </td>
                  <td className="py-1.5 text-right">{money(Number(e.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="ml-auto w-64">
        <div className="flex justify-between py-1">
          <span>Days</span>
          <span>{days(Number(statement.days))}</span>
        </div>
        {expensesTotal > 0 && (
          <>
            <div className="flex justify-between py-1">
              <span>Days amount</span>
              <span>{money(round2(Number(statement.amount) - expensesTotal))}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Expenses</span>
              <span>{money(expensesTotal)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between border-t border-black py-1 font-semibold">
          <span>Total</span>
          <span>{money(Number(statement.amount))}</span>
        </div>
        {statement.paid_on && (
          <p className="mt-2 text-right text-xs">
            Paid {new Date(`${statement.paid_on}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
            {statement.payment_reference && ` · ref ${statement.payment_reference}`}
          </p>
        )}
      </div>
      <p className="mt-6 text-xs">
        Day amounts are as agreed per day, excluding VAT. If you are VAT registered, please invoice us for the days plus VAT,
        quoting {statement.reference}.{expensesTotal > 0 && ' Expenses are paid back at the amount on your receipts.'}
      </p>
    </PrintDocument>
  )
}
