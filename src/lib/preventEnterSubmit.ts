import type { KeyboardEvent } from 'react'

/**
 * Stops Enter in a plain text/number/date input from implicitly submitting
 * the surrounding form — a footgun on data-heavy forms where tabbing/typing
 * through fields can accidentally save (and create) a record before you're
 * done. Pressing Enter while focused on the Save button itself still works,
 * and Enter still inserts a newline in a textarea as normal. Pass as the
 * form's `onKeyDown`.
 */
export function preventEnterSubmit(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.tagName === 'INPUT') {
    e.preventDefault()
  }
}
