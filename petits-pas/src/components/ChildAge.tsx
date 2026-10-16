import { useTranslation } from 'react-i18next'
import type { Child } from '@/data/types'
import { chronologicalAge, correctedAge } from '@/lib/age'
import { formatAge } from '@/lib/formatAge'

export function useChildAge(child: Child) {
  const { t } = useTranslation()
  const corrected = correctedAge(child.birthDate, child.gestationWeeks)
  return {
    age: formatAge(t, chronologicalAge(child.birthDate)),
    corrected: corrected ? t('age.corrected', { age: formatAge(t, corrected) }) : undefined,
  }
}
