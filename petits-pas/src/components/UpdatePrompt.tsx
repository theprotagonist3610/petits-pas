import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (!offlineReady) return
    const timer = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(timer)
  }, [offlineReady, setOfflineReady])

  if (!needRefresh && !offlineReady) return null

  return (
    <div role="status" className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 mx-auto max-w-md rounded-2xl bg-ink p-4 text-white shadow-lg">
      {needRefresh ? (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-sm font-semibold">{t('update.ready')}</p>
          <button onClick={() => void updateServiceWorker(true)} className="min-h-11 rounded-xl bg-honey px-4 font-bold text-ink">
            {t('update.reload')}
          </button>
        </div>
      ) : (
        <p className="text-sm font-semibold">{t('update.offline')}</p>
      )}
    </div>
  )
}
