import { supabase } from '../supabaseClient'
import { unwrap } from './_shared'

// What's waiting on the current user, for the badges on the tabs (migration 0037).
export interface ActionCounts {
  timesheets_to_approve: number
  my_rejected_timesheets: number
  skill_requests: number
}

export const NO_ACTION_COUNTS: ActionCounts = { timesheets_to_approve: 0, my_rejected_timesheets: 0, skill_requests: 0 }

export async function getMyActionCounts(): Promise<ActionCounts> {
  return unwrap<ActionCounts>(await supabase.rpc('my_action_counts'))
}
