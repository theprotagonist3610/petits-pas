import { db } from './dexie/db'
import { createDexieRepositories } from './dexie/repositories'

export const repos = createDexieRepositories(db)
export * from './types'
