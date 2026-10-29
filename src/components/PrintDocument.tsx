import type { ReactNode } from 'react'

/**
 * Wrapper for a print-only document (Quote / Invoice → Print / Export PDF).
 * Hidden on screen; when printing it fills the page width in portrait or
 * landscape.
 *
 * The page margin is 0 in index.css so the browser has nowhere to draw its
 * own header/footer (page URL, date, title). The margins are put back here
 * instead: horizontal padding, plus <thead>/<tfoot> spacers, which browsers
 * repeat on every printed page, so each page gets top and bottom space.
 * `footer` is pinned to the bottom of every page (position: fixed repeats
 * when printing) and sits in the space the <tfoot> spacer reserves.
 */
export default function PrintDocument({ footer, children }: { footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="hidden text-sm text-black print:block">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td>
              <div className="h-[12mm]" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              <div className={footer ? 'h-[32mm]' : 'h-[12mm]'} />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td className="px-[14mm] align-top">{children}</td>
          </tr>
        </tbody>
      </table>
      {footer && <div className="fixed inset-x-0 bottom-0 px-[14mm] pb-[8mm]">{footer}</div>}
    </div>
  )
}

/** Sets the page title while printing so "Save as PDF" suggests a sensible file name. */
export function printWithTitle(title: string) {
  const previous = document.title
  document.title = title
  window.print()
  document.title = previous
}
