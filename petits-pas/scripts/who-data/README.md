# Tables de référence OMS

Source : Normes de croissance de l'enfant de l'OMS (2006), paramètres LMS jour par jour (0 à 1826 jours),
tels que distribués dans le package officiel WHO `anthro` :
https://github.com/WorldHealthOrganization/anthro/tree/master/data-raw/growthstandards

| Fichier | Indicateur |
|---|---|
| `weianthro.txt` | Poids selon l'âge |
| `lenanthro.txt` | Taille selon l'âge (`L` couché jusqu'à 730 jours, `H` debout ensuite) |
| `hcanthro.txt` | Périmètre crânien selon l'âge |
| `acanthro.txt` | Périmètre brachial selon l'âge (à partir de 91 jours) |
| `bmianthro.txt` | IMC selon l'âge (pas encore utilisé) |
| `wflanthro.txt`, `wfhanthro.txt` | Poids selon la taille couchée / debout (pas encore utilisés) |

`sex` : 1 = garçon, 2 = fille. Régénérer les JSON de `src/reference/who/` avec `npm run who:tables`.
