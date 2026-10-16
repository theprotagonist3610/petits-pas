// Préparation de la photo de profil, sans dépendance (testable sans Supabase).

/** Côté de la photo carrée envoyée (suffisant pour un avatar net sur écran haute densité). */
const AVATAR_SIZE = 512
/** Photo d'origine acceptée (avant compression). */
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024

export type AvatarProblem = 'not_image' | 'too_large'

export function checkAvatarFile(file: Pick<File, 'type' | 'size'>): AvatarProblem | undefined {
  if (!file.type.startsWith('image/')) return 'not_image'
  if (file.size > AVATAR_MAX_INPUT_BYTES) return 'too_large'
}

/** Zone carrée centrée à découper dans une image (cadrage « portrait » : on garde le haut si l'image est haute). */
export function squareCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height)
  return { sx: Math.round((width - side) / 2), sy: height > width ? Math.round((height - side) / 4) : 0, side }
}

/** Recadre en carré, redimensionne et compresse (WebP, ou JPEG si le navigateur ne sait pas l'encoder). */
export async function prepareAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height)
    const size = Math.min(AVATAR_SIZE, side)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    canvas.getContext('2d')!.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
    const webp = await toBlob('image/webp')
    if (webp?.type === 'image/webp') return webp
    const jpeg = await toBlob('image/jpeg')
    if (!jpeg) throw new Error('Compression impossible')
    return jpeg
  } finally {
    bitmap.close()
  }
}

/** Côté le plus long d'une photo du fil d'actualité. */
const FEED_IMAGE_MAX = 1280

/** Photo du fil : redimensionnée (sans recadrage) et compressée, comme dans l'application parents. */
export async function prepareFeedImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, FEED_IMAGE_MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8))
    const webp = await toBlob('image/webp')
    if (webp?.type === 'image/webp') return webp
    const jpeg = await toBlob('image/jpeg')
    if (!jpeg) throw new Error('Compression impossible')
    return jpeg
  } finally {
    bitmap.close()
  }
}
