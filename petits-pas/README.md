# Petits Pas

PWA mobile-first et local-first de suivi du développement de l'enfant (0–5 ans) — Bénin, Togo, Niger.
Référentiels : OMS (croissance, fenêtres motrices) et CDC (étapes de développement).

## Commandes

```bash
npm install
npm run dev       # développement
npm test          # tests unitaires (Vitest)
npm run build     # build de production + service worker
npm run preview   # servir le build
npm run icons     # régénérer les icônes PWA depuis public/logo.png
```

## Configuration

Copier `.env.example` en `.env.local` et renseigner `VITE_CONSULTATION_URL` (portail de téléconsultation partenaire).

## Architecture

- `src/data/` — modèle de données et **interfaces de dépôt** (`repositories.ts`). L'implémentation actuelle est Dexie/IndexedDB (`dexie/`) ; elle pourra être remplacée par SQLite sous Capacitor sans toucher aux écrans. Les hooks réactifs (`hooks.ts`) sont le seul point couplé à Dexie côté UI.
- `src/lib/` — utilitaires purs (âge et âge corrigé, compression photo, stockage persistant).
- `src/reference/` — données de référence statiques : pays, tables LMS de l'OMS (`who/`, générées par `npm run who:tables` depuis `scripts/who-data/`) ; à venir : étapes CDC, calendriers PEV par pays.
- `src/lib/milestones.ts` — étapes CDC (`src/reference/milestones/cdc.json`, générées par `npm run cdc:milestones` depuis `scripts/cdc-data/`) et fenêtres motrices OMS (`who-motor.ts`), 1000 premiers jours (`thousandDays.ts`). Fichier de relecture pour le professionnel de santé : `docs/validation-etapes-cdc.csv`.
- `src/lib/growth/` — calculs de croissance OMS (méthode LMS, z-scores, percentiles, messages aux parents). Les seuils des messages sont regroupés dans `ALERT_RULES` (`assess.ts`) et doivent être validés par le professionnel de santé.
- `src/features/` — un dossier par module (onboarding, enfants, accueil, étapes, croissance, souvenirs, consultation, réglages…). Les modules lourds sont chargés à la demande (`lazy` dans `App.tsx`).
- `src/lib/memories.ts` — règles des souvenirs (histoire de 200 mots au plus, souvenirs de grossesse jusqu'à 300 jours avant la naissance).
- `src/i18n/` — textes de l'interface (français ; prêt pour d'autres langues).

## Ajouter un calendrier vaccinal

Les calendriers sont des fichiers de données dans `src/reference/vaccines/` (un par pays, ex. `bj.ts` pour le Bénin) :

1. Copier `bj.ts` vers `tg.ts` (ou `ne.ts`) et reprendre les visites du calendrier officiel du pays.
   Les identifiants des interventions doivent être préfixés par le pays (`tg-penta-1`…) et ne jamais changer une fois publiés,
   car ils servent à retrouver les doses déjà notées par les parents.
2. L'enregistrer dans `SCHEDULES` (`src/reference/vaccines/index.ts`).
3. Lancer `npm test` : les règles de calcul (dates prévues, visites à rattraper) sont communes à tous les pays.

Les dates prévues suivent toujours l'âge réel de l'enfant, même s'il est né prématuré.

## Sauvegarde

Format `.zip` (voir `src/lib/backup.ts`) : `donnees.json` (toutes les tables, version du format), `photos/` (photos et vignettes,
stockées sans recompression) et `LISEZMOI.txt` pour le parent. La restauration (`repos.backup.restore`) se fait en une seule
transaction, en mode « remplacer » ou « fusionner ». Si la structure des données change, incrémenter `BACKUP_VERSION` et
garder la lecture des anciennes versions : une sauvegarde plus récente que l'application est refusée.
