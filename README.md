# Petits Pas — monorepo

| Dossier | Rôle |
|---|---|
| `petits-pas/` | Application des parents (PWA hors ligne). Le suivi des enfants reste sur le téléphone. |
| `petits-pas-pro/` | Application des professionnels de santé : demandes, agenda, administration. En ligne uniquement. |
| `packages/shared/` | Code commun : types de la base, erreurs, validation. |
| `supabase/` | Migrations SQL et fonctions serveur (Edge Functions) du projet Supabase commun. |

## Installation

```bash
npm install            # à la racine : installe les deux applications et le paquet partagé
cp petits-pas/.env.example petits-pas/.env.local           # puis renseigner les valeurs
cp petits-pas-pro/.env.example petits-pas-pro/.env.local   # même projet Supabase
npm run dev            # application parents  → http://localhost:5173
npm run dev:pro        # application pro      → http://localhost:5174
npm test               # tests des deux applications
```

## Mise en place de Petits Pas Pro dans Supabase

1. **Migrations** : appliquer dans l'ordre les fichiers de `supabase/migrations/` (SQL Editor, ou `npx supabase db push`).
2. **Premier administrateur** : créer son compte (Authentication › Users › Invite), puis dans le SQL Editor :
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'admin@exemple.org';
   ```
3. **Fonction d'invitation** :
   ```bash
   npx supabase functions deploy invite-professional --project-ref <ref>
   npx supabase secrets set PRO_APP_URL=https://pro.exemple.org --project-ref <ref>
   ```
4. **Authentication › URL Configuration › Redirect URLs** : ajouter `http://localhost:5174/**` et l'adresse de production de Petits Pas Pro suivie de `/**`.
5. **Double authentification** : Authentication › Multi-Factor › TOTP doit être activé (c'est le cas par défaut). Elle est obligatoire pour les professionnels et les administrateurs : la base refuse l'accès aux données de santé sans elle.

6. **Purge des messages** (facultatif mais recommandé) : activer l'extension `pg_cron` (Database › Extensions) *avant* d'appliquer la migration `20261019090000_messagerie_chiffree.sql`. Les messages sont alors supprimés chaque nuit 30 jours après la fermeture de leur canal. Sans pg_cron : `select public.purge_closed_conversations();` à lancer manuellement.

Les commandes `npx supabase …` se lancent **depuis la racine** du monorepo, jamais depuis `petits-pas/` ou `petits-pas-pro/`.

## Messagerie chiffrée (téléconsultations)

- Ouverte automatiquement quand le professionnel confirme une téléconsultation, pour 10 jours (fenêtre imposée par la base).
- Chiffrement de bout en bout (libsodium) : le serveur ne stocke que des données chiffrées. Chaque utilisateur protège sa clé privée par un **code secret numérique d'au moins 8 chiffres**, un seul pour toutes ses conversations (Argon2id ; suites et chiffres répétés refusés), qui lui permet de retrouver ses messages sur un autre appareil.
- Le parent choisit son code secret lors d'une demande de téléconsultation ; le professionnel, à l'ouverture de sa première conversation.
- Code oublié : nouvelles clés ; les messages déjà reçus deviennent illisibles, les conversations en cours redeviennent lisibles dès que l'autre participant ouvre la sienne.

## Parcours d'un professionnel

Invitation par un administrateur → e-mail → choix du mot de passe (`/activation`) → activation de la double authentification (QR code) → si le numéro d'ordre a été vérifié, accès aux demandes de sa spécialité et de son pays.
