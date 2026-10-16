import type { ReactNode } from 'react'
import { PageHeader } from '@/components/PageHeader'

/*
 * Politique de confidentialité (résumé lisible par les parents).
 * Texte en dur, volontairement hors i18n : il doit être relu et validé (juriste / APDP) avant publication.
 * Les mentions [à compléter] dépendent de l'organisation qui exploite l'application.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-3xl bg-surface p-4 shadow-sm">
      <h2 className="font-extrabold">{title}</h2>
      <div className="space-y-2 leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  return (
    <>
      <PageHeader title="Confidentialité" />
      <div className="space-y-4">
        <Section title="Sur votre téléphone uniquement">
          <p>
            Le suivi de vos enfants reste sur ce téléphone : prénoms, dates de naissance, étapes, mesures, vaccins, souvenirs et photos. Ces
            données ne sont envoyées à personne. Seule une sauvegarde que vous créez vous-même les contient.
          </p>
        </Section>

        <Section title="Avec un compte">
          <p>
            Pour demander une consultation, vous créez un compte. Nous enregistrons alors votre nom, votre prénom, votre sexe, votre e-mail et, si
            vous les indiquez, votre téléphone, votre pays, votre date de naissance et votre profession.
          </p>
        </Section>

        <Section title="Quand vous demandez une consultation">
          <p>Seules ces informations sont transmises, après votre accord :</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>le type de consultation et le spécialiste souhaité ;</li>
            <li>le motif que vous écrivez (c’est une information de santé) ;</li>
            <li>le moment souhaité et le téléphone pour vous joindre ;</li>
            <li>
              pour un enfant : <strong>seulement son âge en mois et son sexe</strong>. Son prénom et sa date de naissance restent sur ce téléphone.
            </li>
          </ul>
          <p>
            Un code calculé sur votre téléphone, impossible à relier au prénom de l’enfant, permet seulement d’éviter deux demandes en même temps
            pour le même enfant et le même spécialiste.
          </p>
          <p>
            Ces informations sont visibles par vous et par les professionnels de santé partenaires de la spécialité demandée, uniquement pour
            organiser la consultation.
          </p>
        </Section>

        <Section title="Hébergement et conservation">
          <p>Les données de compte et de consultation sont hébergées par Supabase, région : [à compléter].</p>
          <p>Durée de conservation des consultations : [à compléter].</p>
        </Section>

        <Section title="Vos droits">
          <p>
            Vous pouvez demander l’accès à vos données, leur correction ou leur suppression, et retirer votre accord pour les prochaines demandes.
          </p>
          <p>Responsable du traitement : [à compléter]. Contact : [à compléter].</p>
          <p>Vous pouvez aussi vous adresser à l’autorité de protection des données personnelles de votre pays.</p>
        </Section>
      </div>
    </>
  )
}
