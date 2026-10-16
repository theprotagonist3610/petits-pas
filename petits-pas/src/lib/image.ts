const PHOTO_MAX = 1280

async function resize(source: ImageBitmap, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Certains navigateurs ignorent le WebP et renvoient du PNG : on retombe alors sur le JPEG.
  const webp = await toBlob('image/webp')
  if (webp?.type === 'image/webp') return webp
  const jpeg = await toBlob('image/jpeg')
  if (!jpeg) throw new Error('Compression impossible')
  return jpeg
}

/**
 * Compresse une photo (≈ 150–250 Ko) et génère sa miniature, pour ménager les petits téléphones.
 * `thumbMax` : 256 px suffit pour un avatar ; le collage des souvenirs utilise des vignettes plus grandes.
 */
export async function compressPhoto(file: Blob, thumbMax = 256): Promise<{ blob: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const [blob, thumb] = await Promise.all([resize(bitmap, PHOTO_MAX, 0.78), resize(bitmap, thumbMax, 0.72)])
    return { blob, thumb }
  } finally {
    bitmap.close()
  }
}
