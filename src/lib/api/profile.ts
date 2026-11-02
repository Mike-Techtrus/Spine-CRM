import { supabase } from '../supabaseClient'
import type { FieldEngineer, PersonDocument, PersonDocumentType, SkillRequest } from '../types'
import { unwrap } from './_shared'
import { setProfileFile } from './skills'

// ── My Profile: details (0036) ─────────────────────────────────────────────

export interface MyProfileInput {
  phone: string
  address_line_1: string
  address_line_2: string
  city: string
  postcode: string
}

// Phone and address only — name, email and rate stay with admins.
export async function updateMyProfile(input: MyProfileInput): Promise<FieldEngineer> {
  return unwrap<FieldEngineer>(
    await supabase.rpc('update_my_profile', {
      p_phone: input.phone,
      p_address_line_1: input.address_line_1,
      p_address_line_2: input.address_line_2,
      p_city: input.city,
      p_postcode: input.postcode,
    }),
  )
}

function safeFileName(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_')
}

// ── Profile photo ──────────────────────────────────────────────────────────

const PHOTO_BUCKET = 'profile-photos'
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024 // matches the bucket's limit in 0036

export async function uploadProfilePhoto(engineer: FieldEngineer, file: File): Promise<FieldEngineer> {
  const path = `${engineer.id}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  const updated = await setProfileFile(engineer.id, 'photo', path, file.name)
  if (engineer.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([engineer.photo_path])
  return updated
}

export async function removeProfilePhoto(engineer: FieldEngineer): Promise<FieldEngineer> {
  const updated = await setProfileFile(engineer.id, 'photo', null, null)
  if (engineer.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([engineer.photo_path])
  return updated
}

// A link to show the photo for the next hour (the bucket is private).
export async function getProfilePhotoUrl(engineer: FieldEngineer): Promise<string | null> {
  if (!engineer.photo_path) return null
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(engineer.photo_path, 3600)
  if (error) return null
  return data.signedUrl
}

// ── Identity documents (driving licence, passport) ─────────────────────────

const ID_BUCKET = 'identity-documents'
export const ID_DOCUMENT_ACCEPT = '.pdf,image/jpeg,image/png,image/webp'
export const ID_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

export async function listPersonDocuments(fieldEngineerId: string): Promise<PersonDocument[]> {
  return unwrap(await supabase.from('person_documents').select('*').eq('field_engineer_id', fieldEngineerId))
}

// Uploads a new copy, replaces the record for that document type, then removes the old file.
export async function uploadPersonDocument(
  fieldEngineerId: string,
  docType: PersonDocumentType,
  file: File,
  expiresOn: string | null,
  previous: PersonDocument | undefined,
): Promise<PersonDocument> {
  const path = `${fieldEngineerId}/${docType}/${Date.now()}-${safeFileName(file.name)}`
  const { error } = await supabase.storage.from(ID_BUCKET).upload(path, file, { contentType: file.type || undefined })
  if (error) throw new Error(error.message)
  const saved = unwrap<PersonDocument>(
    await supabase
      .from('person_documents')
      .upsert(
        {
          field_engineer_id: fieldEngineerId,
          doc_type: docType,
          path,
          file_name: file.name,
          expires_on: expiresOn,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'field_engineer_id,doc_type' },
      )
      .select()
      .single(),
  )
  if (previous) await supabase.storage.from(ID_BUCKET).remove([previous.path])
  return saved
}

export async function updatePersonDocumentExpiry(id: string, expiresOn: string | null): Promise<PersonDocument> {
  return unwrap(await supabase.from('person_documents').update({ expires_on: expiresOn }).eq('id', id).select().single())
}

export async function removePersonDocument(doc: PersonDocument): Promise<void> {
  const { error } = await supabase.from('person_documents').delete().eq('id', doc.id)
  if (error) throw new Error(error.message)
  await supabase.storage.from(ID_BUCKET).remove([doc.path])
}

export async function getPersonDocumentUrl(doc: PersonDocument): Promise<string> {
  const { data, error } = await supabase.storage.from(ID_BUCKET).createSignedUrl(doc.path, 60, { download: doc.file_name })
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ── Skill requests ─────────────────────────────────────────────────────────

export async function listMySkillRequests(fieldEngineerId: string): Promise<SkillRequest[]> {
  return unwrap(
    await supabase
      .from('skill_requests')
      .select('*')
      .eq('field_engineer_id', fieldEngineerId)
      .order('created_at', { ascending: false }),
  )
}

export async function createSkillRequest(input: {
  field_engineer_id: string
  category_id: string | null
  name: string
  details: string | null
}): Promise<SkillRequest> {
  return unwrap(await supabase.from('skill_requests').insert(input).select().single())
}

export async function withdrawSkillRequest(id: string): Promise<void> {
  const { error } = await supabase.from('skill_requests').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export type PendingSkillRequest = SkillRequest & { person: { id: string; name: string; kind: string } }

// Admin → Skills: requests waiting for a decision, oldest first.
export async function listPendingSkillRequests(): Promise<PendingSkillRequest[]> {
  return unwrap(
    await supabase
      .from('skill_requests')
      .select('*, person:field_engineers(id, name, kind)')
      .eq('status', 'pending')
      .order('created_at'),
  )
}

export async function approveSkillRequest(
  requestId: string,
  input: { category_id: string; name: string; description: string; response: string },
): Promise<string> {
  return unwrap<string>(
    await supabase.rpc('approve_skill_request', {
      p_request_id: requestId,
      p_category_id: input.category_id,
      p_name: input.name,
      p_description: input.description,
      p_response: input.response,
    }),
  )
}

export async function declineSkillRequest(requestId: string, response: string): Promise<void> {
  const { error } = await supabase.rpc('decline_skill_request', { p_request_id: requestId, p_response: response })
  if (error) throw new Error(error.message)
}

// Every identity document the current user may see (admins: everyone's), for the expiry watch list.
export async function listAllPersonDocuments(): Promise<PersonDocument[]> {
  return unwrap(await supabase.from('person_documents').select('*').not('expires_on', 'is', null))
}
