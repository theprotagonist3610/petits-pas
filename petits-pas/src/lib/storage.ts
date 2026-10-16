/** Demande au navigateur de ne pas effacer les données locales. Renvoie l'état obtenu. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
