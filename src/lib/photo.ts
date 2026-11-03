// Shrinking phone photos before upload. A modern phone camera takes 12–50 MP
// photos (often 4–10 MB), far more than a profile photo or a readable ID copy
// needs, and big enough to fail the 5 MB photo limit. Photos are redrawn at
// most `maxSide` pixels on the long edge and saved as JPEG; anything that isn't
// a photo (PDFs) or can't be read by the browser goes up unchanged.

export interface ShrinkOptions {
  maxSide: number
  quality?: number
}

// Profile photos are shown small; ID copies need to stay readable.
export const PROFILE_PHOTO_SHRINK: ShrinkOptions = { maxSide: 1024, quality: 0.85 }
export const ID_PHOTO_SHRINK: ShrinkOptions = { maxSide: 2400, quality: 0.9 }

/** Width/height scaled down (never up) so the longer side is at most `maxSide`. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** "IMG_1234.HEIC" → "IMG_1234.jpg"; a name with no extension gets ".jpg" added. */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]*$/, '') || 'photo'
  return `${base}.jpg`
}

export function isShrinkableImage(file: File): boolean {
  return /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)
}

/** A smaller JPEG copy of a photo, or the original file when shrinking can't help. */
export async function shrinkPhoto(file: File, { maxSide, quality = 0.85 }: ShrinkOptions): Promise<File> {
  if (!isShrinkableImage(file) || typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap
  try {
    // Turns the photo the right way up (phones save sideways photos with an orientation flag).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file // e.g. HEIC on a browser that can't decode it
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxSide)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#fff' // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    // Keep the original if it was already small and the copy came out bigger.
    const resized = size.width !== bitmap.width || size.height !== bitmap.height
    if (!resized && blob.size >= file.size && /^image\/(jpeg|png|webp)$/i.test(file.type)) return file
    return new File([blob], jpegFileName(file.name), { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}

/** True on phones and tablets (touch screen as the main pointer), where a camera button makes sense. */
export function hasTouchCamera(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}
