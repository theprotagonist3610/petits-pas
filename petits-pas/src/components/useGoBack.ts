import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Revient à l'écran précédent, ou à `fallback` si la page a été ouverte directement
 * (lien, rechargement) et qu'il n'y a pas d'historique interne à l'application.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate(fallback, { replace: true }) : navigate(-1))
}
