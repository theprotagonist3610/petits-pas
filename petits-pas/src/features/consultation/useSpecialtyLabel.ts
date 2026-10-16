import { useTranslation } from 'react-i18next'
import { usePlatform } from '@petits-pas/shared/platform'
import { supabase } from '@/lib/supabase/client'

/** Libellé d'une spécialité : celui choisi par les administrateurs, sinon la traduction d'origine. */
export function useSpecialtyLabel(): (code: string) => string {
  const { t } = useTranslation()
  const { platform } = usePlatform(supabase)
  return (code) => platform?.specialties.find((s) => s.code === code)?.label ?? t(`consultation.specialties.${code}`, { defaultValue: code })
}
