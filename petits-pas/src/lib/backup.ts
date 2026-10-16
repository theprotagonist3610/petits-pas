import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { DatabaseDump, Media } from '@/data/types'

/*
 * Format de sauvegarde (.zip) :
 *   donnees.json         toutes les données, sans les photos
 *   photos/<id>.<ext>    photo en taille réelle (déjà compressée : stockée sans recompression)
 *   photos/<id>-mini.<ext>  vignette
 *   LISEZMOI.txt         explication pour le parent
 */

const FORMAT = 'petits-pas-sauvegarde'
/** À incrémenter si la structure change ; une version plus récente que l'application est refusée. */
export const BACKUP_VERSION = 1
const DATA_FILE = 'donnees.json'

const README = `Sauvegarde Petits Pas

Ce fichier contient toutes les données de Petits Pas : profils des enfants, étapes, mesures,
vaccins, souvenirs et photos. Gardez-le en lieu sûr (Google Drive, ordinateur, clé USB).

Pour le restaurer : ouvrez Petits Pas, puis Plus > Sauvegarde > Restaurer
(ou « J'ai une sauvegarde » au premier lancement sur un nouveau téléphone).

Ce fichier contient des photos et des informations de santé :
ne le partagez qu'avec des personnes de confiance.
`

interface MediaEntry {
  id: string
  mime: string
  createdAt: string
  file: string
  thumbFile: string
}

interface BackupFile extends Omit<DatabaseDump, 'media'> {
  format: typeof FORMAT
  version: number
  exportedAt: string
  media: MediaEntry[]
}

export type BackupErrorCode = 'not_zip' | 'not_backup' | 'newer_version' | 'corrupt'

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code)
  }
}

const extension = (mime: string) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg')

export function backupFileName(date: Date = new Date()): string {
  return `petits-pas-sauvegarde-${date.toISOString().slice(0, 10)}.zip`
}

export async function createBackupZip(dump: DatabaseDump, now: Date = new Date()): Promise<Uint8Array> {
  const files: Zippable = {}
  const media: MediaEntry[] = []
  for (const m of dump.media) {
    const ext = extension(m.mime)
    const entry = { id: m.id, mime: m.mime, createdAt: m.createdAt, file: `photos/${m.id}.${ext}`, thumbFile: `photos/${m.id}-mini.${ext}` }
    files[entry.file] = [new Uint8Array(await m.blob.arrayBuffer()), { level: 0 }]
    files[entry.thumbFile] = [new Uint8Array(await m.thumb.arrayBuffer()), { level: 0 }]
    media.push(entry)
  }
  const data: BackupFile = { format: FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), ...dump, media }
  files[DATA_FILE] = strToU8(JSON.stringify(data))
  files['LISEZMOI.txt'] = strToU8(README)
  return zipSync(files, { level: 6, mtime: now })
}

export interface ParsedBackup {
  dump: DatabaseDump
  exportedAt: string
}

const isArray = (value: unknown): value is unknown[] => Array.isArray(value)

/** Lit et vérifie une sauvegarde. Lève une `BackupError` si le fichier n'est pas utilisable. */
export function readBackupZip(bytes: Uint8Array): ParsedBackup {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new BackupError('not_zip')
  }
  if (!files[DATA_FILE]) throw new BackupError('not_backup')

  let data: BackupFile
  try {
    data = JSON.parse(strFromU8(files[DATA_FILE]))
  } catch {
    throw new BackupError('corrupt')
  }
  if (data?.format !== FORMAT) throw new BackupError('not_backup')
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) throw new BackupError('newer_version')

  const tables = [data.children, data.measurements, data.milestones, data.memories, data.vaccines, data.media]
  if (!tables.every(isArray) || typeof data.settings !== 'object' || data.settings === null) throw new BackupError('corrupt')
  if (!data.children.every((c) => c?.id && c.firstName && c.birthDate)) throw new BackupError('corrupt')

  const media: Media[] = data.media.map((entry) => {
    const blob = files[entry.file]
    const thumb = files[entry.thumbFile]
    if (!blob || !thumb) throw new BackupError('corrupt')
    return {
      id: entry.id,
      mime: entry.mime,
      createdAt: entry.createdAt,
      blob: new Blob([blob as Uint8Array<ArrayBuffer>], { type: entry.mime }),
      thumb: new Blob([thumb as Uint8Array<ArrayBuffer>], { type: entry.mime }),
    }
  })

  const { format: _f, version: _v, exportedAt, media: _m, ...rest } = data
  return { dump: { ...rest, media }, exportedAt }
}

export interface BackupSummary {
  children: number
  memories: number
  photos: number
  measurements: number
}

export function summarize(dump: DatabaseDump): BackupSummary {
  return {
    children: dump.children.length,
    memories: dump.memories.length,
    photos: dump.media.length,
    measurements: dump.measurements.length,
  }
}
