import { supabase } from '../supabaseClient'
import type { ContractorSkill, FieldEngineer, Skill, SkillCategory, SkillLevel } from '../types'
import { unwrap } from './_shared'

// ── Admin: skills database (migration 0014) ────────────────────────────────

export async function listSkillCategories(): Promise<SkillCategory[]> {
  return unwrap(await supabase.from('skill_categories').select('*').order('sort_order').order('name'))
}

export async function createSkillCategory(name: string, sort_order: number): Promise<SkillCategory> {
  return unwrap(await supabase.from('skill_categories').insert({ name, sort_order }).select().single())
}

export async function updateSkillCategory(id: string, input: { name?: string; sort_order?: number }) {
  return unwrap(await supabase.from('skill_categories').update(input).eq('id', id).select().single())
}

export async function deleteSkillCategory(id: string): Promise<void> {
  const { error } = await supabase.from('skill_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listSkills(): Promise<Skill[]> {
  return unwrap(await supabase.from('skills').select('*').order('name'))
}

export interface SkillInput {
  category_id: string
  name: string
  description: string | null
}

export async function createSkill(input: SkillInput): Promise<Skill> {
  return unwrap(await supabase.from('skills').insert(input).select().single())
}

export async function updateSkill(id: string, input: Partial<SkillInput & { is_active: boolean }>): Promise<Skill> {
  return unwrap(await supabase.from('skills').update(input).eq('id', id).select().single())
}

export async function deleteSkill(id: string): Promise<void> {
  const { error } = await supabase.from('skills').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// How many contractors have each skill — a skill in use can't be deleted.
export async function countSkillUsage(): Promise<Record<string, number>> {
  const rows = unwrap(await supabase.from('contractor_skills').select('skill_id'))
  const counts: Record<string, number> = {}
  for (const r of rows) counts[r.skill_id] = (counts[r.skill_id] ?? 0) + 1
  return counts
}

// ── Contractor profile: skills ─────────────────────────────────────────────

export async function listContractorSkills(fieldEngineerId: string): Promise<ContractorSkill[]> {
  return unwrap(
    await supabase.from('contractor_skills').select('*').eq('field_engineer_id', fieldEngineerId).order('created_at'),
  )
}

export interface ContractorSkillInput {
  level: SkillLevel | null
  obtained_on: string | null
  expires_on: string | null
  notes: string | null
}

export async function addContractorSkill(
  fieldEngineerId: string,
  skillId: string,
  input: ContractorSkillInput,
): Promise<ContractorSkill> {
  return unwrap(
    await supabase
      .from('contractor_skills')
      .insert({ field_engineer_id: fieldEngineerId, skill_id: skillId, ...input })
      .select()
      .single(),
  )
}

export async function updateContractorSkill(id: string, input: ContractorSkillInput): Promise<ContractorSkill> {
  return unwrap(await supabase.from('contractor_skills').update(input).eq('id', id).select().single())
}

export async function removeContractorSkill(id: string): Promise<void> {
  const { error } = await supabase.from('contractor_skills').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Contractor profile: CV ─────────────────────────────────────────────────

const CV_BUCKET = 'contractor-cvs'

export const CV_ACCEPT = '.pdf,.doc,.docx'
export const CV_MAX_BYTES = 10 * 1024 * 1024 // matches the bucket's limit in 0014

// Uploads a new CV, points the contractor record at it, then removes the old
// file. Each upload gets a fresh path so a cached download link never serves
// the previous CV.
export async function uploadContractorCv(engineer: FieldEngineer, file: File): Promise<FieldEngineer> {
  const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '_')
  const path = `${engineer.id}/${Date.now()}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, file, { contentType: file.type || undefined })
  if (uploadError) throw new Error(uploadError.message)

  const updated = unwrap<FieldEngineer>(
    await supabase
      .from('field_engineers')
      .update({ cv_path: path, cv_file_name: file.name, cv_uploaded_at: new Date().toISOString() })
      .eq('id', engineer.id)
      .select()
      .single(),
  )
  if (engineer.cv_path) await supabase.storage.from(CV_BUCKET).remove([engineer.cv_path])
  return updated
}

export async function removeContractorCv(engineer: FieldEngineer): Promise<FieldEngineer> {
  const updated = unwrap<FieldEngineer>(
    await supabase
      .from('field_engineers')
      .update({ cv_path: null, cv_file_name: null, cv_uploaded_at: null })
      .eq('id', engineer.id)
      .select()
      .single(),
  )
  if (engineer.cv_path) await supabase.storage.from(CV_BUCKET).remove([engineer.cv_path])
  return updated
}

// A short-lived link to download the CV (the bucket is private).
export async function getContractorCvUrl(engineer: FieldEngineer): Promise<string> {
  if (!engineer.cv_path) throw new Error('No CV uploaded.')
  const { data, error } = await supabase.storage
    .from(CV_BUCKET)
    .createSignedUrl(engineer.cv_path, 60, { download: engineer.cv_file_name ?? true })
  if (error) throw new Error(error.message)
  return data.signedUrl
}
