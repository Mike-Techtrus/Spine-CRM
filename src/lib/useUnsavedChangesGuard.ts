import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

const DEFAULT_MESSAGE = 'You have unsaved changes that will be lost. Leave this page anyway?'

/**
 * Warns before the user navigates away from a form with unsaved changes —
 * both in-app (clicking a nav link, a "cancel"/"back" link, or any other
 * route change) and when closing/refreshing the tab or typing a new URL.
 *
 * Call `allowNextNavigation()` immediately before a navigate() that should
 * be allowed through without prompting (e.g. right after a successful save).
 */
export function useUnsavedChangesGuard(isDirty: boolean, message: string = DEFAULT_MESSAGE) {
  const isDirtyRef = useRef(isDirty)
  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  const bypassRef = useRef(false)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassRef.current) return false
    return isDirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(message)) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker, message])

  // Closing the tab, refreshing, or typing a new URL/bookmark doesn't go
  // through the router at all, so it needs its own guard.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  function allowNextNavigation() {
    bypassRef.current = true
  }

  return { allowNextNavigation }
}
