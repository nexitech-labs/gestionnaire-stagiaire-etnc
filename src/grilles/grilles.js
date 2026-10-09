/* CCPG — Grilles d'évaluation péda et comportement : grilles d'origine, grilles personnalisées, totaux. */
"use strict";

// Grilles d'origine (Excel). Personnalisables depuis les fiches : la version modifiée est
// enregistrée dans « parametres » (grille_peda, grille_comportement).
const PEDA_GRILLE_EXCEL = [
  { groupe: "Prise en main", items: [["prise_compte", "Prise en compte des personnes", 0.5], ["presentation", "Présentation de la séance", 0.5]] },
  { groupe: "Mise en train", items: [["progressif", "Progressif", 2], ["adapte", "Adapté", 1], ["varie", "Varié / spécifique", 1]] },
  {
    groupe: "Partie principale",
    items: [
      ["tache", "Présentation de la tâche / de l'objectif", 2], ["demos", "Démonstrations", 2],
      ["corrections", "Corrections individuelles / collectives", 2], ["securite", "Sécurité prise en compte", 1], ["animation", "Animation", 3],
    ],
  },
  { groupe: "Retour au calme", items: [["etirements", "Étirements", 1.5]] },
  { groupe: "Contrôle", items: [["retour", "Retour sur la séance", 0.5], ["effectifs", "Contrôle des effectifs (blessés…)", 0.5]] },
  { groupe: "Fiche de séance", items: [["proprete", "Propreté", 0.5], ["complete", "Complète", 1], ["lisible", "Facile à suivre", 0.5]] },
  { groupe: "Respect des délais", items: [["delais", "Respect des délais", 0.5]] },
];

const PEDA_NOTATION_LIGNES = ["Prise en main", "Échauffement", ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `Exercice ${i}`), "Étirement", "Contrôle"];

const PEDA_NOTATION_COLS = [["qui", "Qui"], ["temps", "Temps"], ["tache", "Présentation de la tâche"], ["demo", "Démonstration"], ["obs", "Observations"]];

const COMPORTEMENT_GRILLE_EXCEL = [
  {
    groupe: "Attitude", max: 6,
    items: [
      { k: "tenue", label: "Tenue", niveaux: [["exemplaire", 3], ["correcte", 2], ["négligée", 1]] },
      { k: "ponctualite", label: "Ponctualité", niveaux: [["toujours à l'heure / en avance", 3], ["retard(s) occasionnel(s)", 2], ["retards réguliers", 1]] },
    ],
  },
  {
    groupe: "Investissement", max: 11,
    items: [
      { k: "progres", label: "Progrès", niveaux: [["a progressé dans les disciplines évaluables", 4], ["s'est maintenu", 2], ["a régressé", 0]] },
      { k: "participation", label: "Participation", niveaux: [["très actif en cours", 4], ["fait le minimum", 2], ["passif", 0]] },
      {
        k: "absenteisme", label: "Absentéisme",
        niveaux: [["présent à toutes les séances", 3], ["absence(s) ponctuelle(s)", 2], ["absent régulièrement", 1], ["absent à plus de 50 % des séances", 0]],
      },
    ],
  },
  {
    groupe: "Valeurs morales", max: 3,
    items: [
      { k: "equipe", label: "Esprit d'équipe", niveaux: [["solidaire, entraîne le groupe", 1], ["travaille en bonne harmonie au sein du groupe", 0.5], ["individualiste", 0]] },
      { k: "discipline", label: "Esprit de discipline", niveaux: [["exemplaire", 1], ["correct", 0.5], ["mauvais esprit", 0]] },
      { k: "rusticite", label: "Rusticité", niveaux: [["fonceur", 1], ["passable", 0.5], ["précieux", 0]] },
    ],
  },
];

// Grilles au format enregistré : { groupes: [{ groupe, items }], lignes, cols }.
// Les clés (k) relient les valeurs saisies aux critères : elles ne changent jamais.
const GRILLES_DEFAUT = {
  peda: {
    groupes: PEDA_GRILLE_EXCEL.map((g) => ({ groupe: g.groupe, items: g.items.map(([k, label, max]) => ({ k, label, max })) })),
    lignes: PEDA_NOTATION_LIGNES.map((label, i) => ({ k: String(i), label })), // clés 0, 1… : saisies existantes « n_0_qui »
    cols: PEDA_NOTATION_COLS.map(([k, label]) => ({ k, label })),
  },
  comportement: {
    groupes: COMPORTEMENT_GRILLE_EXCEL.map((g) => ({
      groupe: g.groupe,
      items: g.items.map((it) => ({ k: it.k, label: it.label, niveaux: it.niveaux.map(([label, pts]) => ({ label, pts })) })),
    })),
  },
};

let grillesCache = {};

function getGrille(type) {
  if (!grillesCache[type]) {
    let g = null;
    try {
      g = JSON.parse(getParametre(`grille_${type}`) || "null");
    } catch {
      g = null;
    }
    grillesCache[type] = g && Array.isArray(g.groupes) ? g : JSON.parse(JSON.stringify(GRILLES_DEFAUT[type]));
  }
  return grillesCache[type];
}

const grilleItems = (type) => getGrille(type).groupes.flatMap((g) => g.items);

const grilleCles = (type) => grilleItems(type).map((it) => it.k);

/** Points maximum d'un critère : son barème (péda) ou son meilleur niveau (comportement). */
const itemMax = (type, it) => (type === "peda" ? Number(it.max) || 0 : Math.max(0, ...it.niveaux.map((n) => Number(n.pts) || 0)));

const groupeMax = (type, g) => round2(g.items.reduce((a, it) => a + itemMax(type, it), 0));

const grilleMax = (type) => round2(getGrille(type).groupes.reduce((a, g) => a + groupeMax(type, g), 0));

/** Total de la grille ramené sur 20 pour les notes pédagogiques (identique si la grille est sur 20). */
function noteSur20(type, total) {
  const max = grilleMax(type);
  if (total == null || !max || max === NOTE_MAX) return total;
  return round2((total * NOTE_MAX) / max);
}

function sumPoints(vals, keys) {
  const v = keys.map((k) => vals[`c_${k}`]).filter((x) => x != null && x !== "").map(Number);
  return { total: v.length ? round2(v.reduce((a, b) => a + b, 0)) : null, n: v.length, of: keys.length };
}

function saveFicheChamp(sid, fiche, champ, value) {
  if (value == null || value === "") {
    state.db.run("DELETE FROM fiches_terrain WHERE stagiaire_id = ? AND fiche = ? AND champ = ?", [sid, fiche, champ]);
  } else {
    upsert("fiches_terrain", ["stagiaire_id", "fiche", "champ"], ["stagiaire_id", "fiche", "champ", "valeur"], [sid, fiche, champ, String(value)]);
  }
}

function totalHtml({ total, n, of }, max = NOTE_MAX) {
  if (total == null) return '<span class="text-zinc-400">—</span>';
  const tone = total < max / 2 ? "text-red-600" : "text-emerald-700";
  const partial = n < of ? ` <span class="text-xs font-normal text-zinc-400" title="${n} critère${n > 1 ? "s" : ""} évalué${n > 1 ? "s" : ""} sur ${of}">(${n}/${of})</span>` : "";
  return `<span class="font-semibold tabular-nums ${tone}">${esc(fmtNote(total))}</span><span class="text-zinc-400"> /${esc(fmtNote(max))}</span>${partial}`;
}
