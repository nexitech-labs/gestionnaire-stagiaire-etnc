/* CCPG — Constantes de l'application : épreuves, notes, grades, armées, formations. */
"use strict";

const IDB_NAME = "ccpg-app";

const IDB_STORE = "handles";

const IDB_KEY = "projectDir";

const DB_DIR = "db";

const DB_FILE = "ccpg.db";

const LS_PREFIX = "ccpg.";

// Épreuves physiques (CCPG) : une sous-page chacune, comme les blocs du tableau Excel
const EPREUVES = [
  { id: "m_co", short: "M-CO", label: "Marche-course", color: "#9BBB59" },
  { id: "ecr", short: "ECR", label: "Évaluation cardio-respiratoire", color: "#00B050" }, // 2400 m (barèmes Excel : « ECR : 2400m »)
  { id: "cmg", short: "CMG", label: "Contrôle musculaire général", color: "#DA9694" }, // pompes (barèmes Excel : « CMG : POMPES »)
  {
    id: "aisance_aquatique", short: "Aisance aquatique", label: "Aisance aquatique", color: "#4BACC6",
    extras: [["aisance_aquatique_nage", "Distance de nage"], ["aisance_aquatique_apnee", "Distance d'apnée"]],
  },
  { id: "traction", short: "Tractions", label: "Tractions", color: "#F79646" },
];

const PHYS_TABS = [...EPREUVES.map((e) => e.id), "recap"];

// Coefficients par formation (valeurs du fichier Excel, identiques pour CT1 et CT2 par défaut)
const FORMATIONS = ["CT1", "CT2"];

const COEFS_DEFAUT = { m_co: 2, ecr: 1, cmg: 1, aisance_aquatique: 1, traction: 1, comportement: 1, test_ecrit: 1, pedagogie: 1 };

const COEF_MAX = 10;

// Barèmes
const ARMEES_BAREME = [["TERRE", "Terre"], ["AIR", "Air"], ["MER", "Mer"]];

const PERF_SANS_NOTE = ["inapte", "absent", "absente", "dispense", "dispensé", "dispensée"];

// Épreuves notées sur 20 : [colonne, en-tête court, libellé complet]
const NOTE_MAX = 20;

const NOTES = {
  physiques: {
    table: "notes_physiques",
    title: "Notes physiques (CCPG)",
    fields: EPREUVES.map((e) => [e.id, e.short, e.label]),
  },
  pedagogiques: {
    table: "notes_pedagogiques",
    title: "Notes pédagogiques",
    fields: [
      ["comportement", "Comportement", "Comportement"],
      ["test_ecrit", "Test écrit", "Test écrit"],
      ["pedagogie", "Pédagogie", "Pédagogie"],
    ],
  },
};

const PERF_MAX_LENGTH = 30;

// Colonnes saisissables par onglet et leur type (liste blanche des noms de colonnes SQL)
const INPUT_COLUMNS = {
  // Notes physiques calculées d'après le barème : seules les performances se saisissent
  physiques: Object.fromEntries(EPREUVES.flatMap((e) => [
    [`${e.id}_perf`, "perf"],
    ...(e.extras || []).map(([c]) => [c, "distance"]),
  ]).concat([["ecrit_exemption", "note"]])),
  // « Comportement » vient de la grille de l'onglet Comportement ; « Pédagogie » se reporte depuis la fiche péda papier
  pedagogiques: { test_ecrit: "note", pedagogie: "note" },
};

const TABS = ["accueil", "stagiaires", "edt", "activites", "fiches", "physiques", "pedagogiques", "comportement", "bilan", "releve", "baremes", "coefficients"];

const SECTION_TABS = ["stagiaires", "physiques", "pedagogiques", "bilan"];

const ARMEES = ["Terre", "Air", "Mer"];

const ORIGINES = ["Direct", "Semi-direct"];

// Grades proposés (ordre hiérarchique croissant, utilisé aussi pour le tri)
const GRADES = [
  ["SDT", "Soldat"], ["MOT", "Matelot"], ["AVT", "Aviateur"], ["1CL", "Soldat de 1re classe"],
  ["QM2", "Quartier-maître de 2e classe"], ["CPL", "Caporal"], ["QM1", "Quartier-maître de 1re classe"],
  ["CCH", "Caporal-chef"], ["CC1", "Caporal-chef de 1re classe"], ["GND", "Gendarme"],
  ["SGT", "Sergent"], ["MDL", "Maréchal des logis"], ["SM", "Second maître"],
  ["SCH", "Sergent-chef"], ["MDC", "Maréchal des logis-chef"], ["MT", "Maître"],
  ["ADJ", "Adjudant"], ["PM", "Premier maître"], ["ADC", "Adjudant-chef"], ["MP", "Maître principal"],
  ["MAJ", "Major"], ["ASP", "Aspirant"], ["SLT", "Sous-lieutenant"], ["EV2", "Enseigne de vaisseau de 2e classe"],
  ["LTN", "Lieutenant"], ["EV1", "Enseigne de vaisseau de 1re classe"], ["CNE", "Capitaine"],
  ["LV", "Lieutenant de vaisseau"], ["CDT", "Commandant"], ["CC", "Capitaine de corvette"],
  ["LCL", "Lieutenant-colonel"], ["CF", "Capitaine de frégate"], ["COL", "Colonel"], ["CV", "Capitaine de vaisseau"],
];

const GRADE_RANK = new Map(GRADES.map(([g], i) => [g, i + 1]));
