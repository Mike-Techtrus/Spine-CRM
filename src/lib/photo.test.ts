import { describe, expect, it } from 'vitest'
import { fitWithin, isShrinkableImage, jpegFileName } from './photo'

describe('fitWithin', () => {
  it('scales a landscape phone photo down to the longest side', () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 })
  })
  it('scales a portrait photo by its height', () => {
    expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 })
  })
  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 })
  })
})

describe('jpegFileName', () => {
  it('swaps the extension', () => {
    expect(jpegFileName('IMG_1234.HEIC')).toBe('IMG_1234.jpg')
    expect(jpegFileName('passport.scan.png')).toBe('passport.scan.jpg')
  })
  it('adds one when there is none', () => {
    expect(jpegFileName('image')).toBe('image.jpg')
    expect(jpegFileName('.png')).toBe('photo.jpg')
  })
})

describe('isShrinkableImage', () => {
  const file = (type: string) => ({ type }) as File
  it('takes photos, leaves PDFs alone', () => {
    expect(isShrinkableImage(file('image/jpeg'))).toBe(true)
    expect(isShrinkableImage(file('image/heic'))).toBe(true)
    expect(isShrinkableImage(file('application/pdf'))).toBe(false)
    expect(isShrinkableImage(file(''))).toBe(false)
  })
})
