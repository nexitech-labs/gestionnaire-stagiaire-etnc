# gestionnaire-stagiaire-etnc

Suivi des stages CCPG / EPMS de l'ETNC : stagiaires, saisie des notes, barèmes, fiches terrain,
emploi du temps, relevés individuels.

Application 100 % locale : on ouvre **`index.html`** dans Google Chrome ou Microsoft Edge, puis on choisit
le dossier du projet. Les données sont dans `db/ccpg.db` (SQLite, via sql.js). Aucun serveur, aucune installation.

## Organisation du code

`index.html` est la page principale : en-tête, emplacements des pages et fenêtres, liste des scripts.
Le reste est rangé par fonctionnalité dans `src/` :

| Dossier | Contenu |
|---|---|
| `src/noyau/` | constantes, utilitaires, état de l'interface, notifications, confirmation, injection des vues |
| `src/stockage/` | schéma SQLite, accès au dossier du projet, chargement et sauvegarde de la base |
| `src/navigation/` | onglets, adresses `#/…`, en-tête des pages d'une section |
| `src/accueil/` | page d'accueil |
| `src/sections/` | fenêtre Sections (ajout, modification, sélection) |
| `src/stagiaires/` | liste des stagiaires, fenêtre d'ajout / modification |
| `src/baremes/` | barèmes d'origine, versions (barème + coefficients), pages Barèmes et Coefficients, import / export |
| `src/notes/` | calcul des notes, saisie, épreuves physiques, exemption, moyennes, export des notes |
| `src/comportement/` | onglet Comportement de la saisie des notes |
| `src/releve/` | relevé individuel (attestation) |
| `src/fiches/` | fiches terrain, colonnes, évaluation péda, impression des fiches |
| `src/grilles/` | grilles d'évaluation péda / comportement et leur personnalisation |
| `src/emploi-du-temps/` | emploi du temps et liste des activités |
| `src/impression/` | feuille imprimée selon la page affichée |
| `src/export/` | écriture des fichiers Excel (.xlsx) |
| `src/app/` | branchement des événements et démarrage |

Dans chaque dossier :

- `*.js` : le code de la fonctionnalité ;
- `*.vue.js` : son HTML (pages, fenêtres), injecté au chargement à la place d'un emplacement
  `<div data-vue="…">` de `index.html` ;
- `*.css` : ses styles, quand elle en a.

### Points d'attention

- Les scripts sont des **scripts classiques**, pas des modules : c'est ce qui permet d'ouvrir `index.html`
  directement (`file://`). Ils partagent donc le même espace de noms global : un nom de fonction ou de
  constante ne doit être déclaré qu'une fois dans tout `src/`.
- **L'ordre des `<script>` dans `index.html` compte** : un fichier peut utiliser au chargement ce que
  déclarent les fichiers placés avant lui (les fonctions, elles, sont appelées une fois tout chargé).
  Les vues sont chargées avant le code, et `src/app/demarrage.js` en dernier.
- Nouveau fichier : l'ajouter dans `index.html`, à la place qui correspond à sa fonctionnalité.

## Dossiers

- `assets/` : logo du ministère pour le relevé individuel.
- `vendor/` : bibliothèques embarquées (Tailwind, sql.js), pour fonctionner hors ligne.
- `db/` : base de données `ccpg.db`.
