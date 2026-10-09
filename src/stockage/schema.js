/* CCPG — Schéma SQLite et colonnes ajoutées au fil des versions (migrations). */
"use strict";

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS sections (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    formation      TEXT NOT NULL,
    annee_scolaire TEXT NOT NULL,
    date_debut     TEXT,
    date_fin       TEXT,
    moniteur       TEXT NOT NULL,
    bareme_version_id INTEGER    -- barème sous lequel la section est notée (baremes_versions)
  );
  CREATE TABLE IF NOT EXISTS stagiaires (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id               INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    grade                    TEXT NOT NULL,
    nom                      TEXT NOT NULL,
    prenom                   TEXT NOT NULL,
    armee                    TEXT,
    origine_recrutement      TEXT,
    sexe                     TEXT NOT NULL CHECK (sexe IN ('M','F')),
    date_naissance           TEXT,
    derniere_visite_medicale TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stagiaires_section ON stagiaires(section_id);
  CREATE TABLE IF NOT EXISTS notes_physiques (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    stagiaire_id      INTEGER UNIQUE NOT NULL REFERENCES stagiaires(id) ON DELETE CASCADE,
    m_co              REAL,
    ecr               REAL,
    cmg               REAL,
    aisance_aquatique REAL,
    traction          REAL,
    m_co_perf              TEXT,
    ecr_perf               TEXT,
    cmg_perf               TEXT,
    aisance_aquatique_perf TEXT,
    traction_perf          TEXT,
    aisance_aquatique_nage  REAL,
    aisance_aquatique_apnee REAL
  );
  -- Versions de barème : une section garde la version sous laquelle elle a été créée
  CREATE TABLE IF NOT EXISTS baremes_versions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle  TEXT NOT NULL,
    cree_le  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS baremes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id     INTEGER,        -- baremes_versions.id
    armee          TEXT NOT NULL,  -- 'TERRE', 'AIR', 'MER'
    epreuve        TEXT NOT NULL,  -- 'm_co', 'ecr', 'cmg', 'aisance_aquatique', 'traction'
    sexe           TEXT NOT NULL,  -- 'M', 'F'
    tranche_age    TEXT NOT NULL,  -- toujours 'Toutes' : l'Excel n'a pas de tranches d'âge (colonne conservée)
    performance    REAL NOT NULL,  -- seuil déduit des bornes : temps max / nombre min (compatibilité)
    note           REAL NOT NULL,  -- note sur 20 de l'intervalle
    distance_nage  REAL,           -- (compatibilité) = nage_min
    distance_apnee REAL,           -- (compatibilité) = apnee_min
    performance_min REAL,          -- intervalle « min ; max » de l'Excel (vide = sans limite)
    performance_max REAL,
    nage_min        REAL,          -- aisance aquatique : intervalle de distance de nage (m)
    nage_max        REAL,
    apnee_min       REAL,          -- aisance aquatique : intervalle de distance d'apnée (m)
    apnee_max       REAL
  );
  CREATE INDEX IF NOT EXISTS idx_baremes_cle ON baremes(armee, epreuve, sexe, tranche_age);
  CREATE TABLE IF NOT EXISTS fiches_colonnes (
    fiche   TEXT NOT NULL,     -- 'mco', 'natation', 'f2400'
    cle     TEXT NOT NULL,     -- colonne d'origine ('km1', 'perf'…) ou ajoutée ('x_…')
    libelle TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    ordre   INTEGER NOT NULL,
    PRIMARY KEY (fiche, cle)
  );
  CREATE TABLE IF NOT EXISTS fiches_terrain (
    stagiaire_id INTEGER NOT NULL REFERENCES stagiaires(id) ON DELETE CASCADE,
    fiche        TEXT NOT NULL,  -- 'mco', 'natation', 'f2400'
    champ        TEXT NOT NULL,  -- n° de dossard, temps de passage, dates…
    valeur       TEXT,
    PRIMARY KEY (stagiaire_id, fiche, champ)
  );
  CREATE TABLE IF NOT EXISTS activites (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle TEXT NOT NULL UNIQUE COLLATE NOCASE
  );
  CREATE TABLE IF NOT EXISTS edt (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id   INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    date         TEXT NOT NULL,  -- YYYY-MM-DD
    heure_debut  TEXT,           -- HH:MM
    heure_fin    TEXT,
    moniteur     TEXT,
    cours_sagaie TEXT,           -- activité annoncée (SAGAIE)
    activite     TEXT,           -- activité réellement effectuée (vide = conforme)
    obs          TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_edt_section ON edt(section_id, date);
  CREATE TABLE IF NOT EXISTS coefficients (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    formation TEXT NOT NULL,  -- 'CT1', 'CT2'
    epreuve   TEXT NOT NULL,  -- épreuve physique ou pédagogique
    coef      REAL NOT NULL,
    UNIQUE (formation, epreuve)
  );
  -- Coefficients de chaque version (barème et coefficients vont ensemble ; la table « coefficients » sert de modèle)
  CREATE TABLE IF NOT EXISTS coefficients_versions (
    version_id INTEGER NOT NULL,
    formation  TEXT NOT NULL,
    epreuve    TEXT NOT NULL,
    coef       REAL NOT NULL,
    PRIMARY KEY (version_id, formation, epreuve)
  );
  CREATE TABLE IF NOT EXISTS dates_epreuves (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id   INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    epreuve      TEXT NOT NULL,
    date_epreuve TEXT,
    UNIQUE (section_id, epreuve)
  );
  CREATE TABLE IF NOT EXISTS parametres (
    cle    TEXT PRIMARY KEY,   -- ex. 'releve_signature' (image en data URL), 'releve_signature_active'
    valeur TEXT
  );
  CREATE TABLE IF NOT EXISTS notes_pedagogiques (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    stagiaire_id INTEGER UNIQUE NOT NULL REFERENCES stagiaires(id) ON DELETE CASCADE,
    comportement REAL,
    test_ecrit   REAL,
    pedagogie    REAL
  );
`;

const TABLES = ["sections", "stagiaires", "notes_physiques", "notes_pedagogiques", "dates_epreuves", "baremes", "coefficients", "edt", "activites", "fiches_terrain", "fiches_colonnes", "parametres", "baremes_versions", "coefficients_versions"];

// En-tête de l'emploi du temps, ajouté aux sections existantes
const SECTION_ADDED_COLUMNS = ["poste_moniteur", "chef_section", "poste_chef"];

// Colonnes ajoutées à notes_physiques après sa première version (migration des bases existantes)
const PHYS_ADDED_COLUMNS = [
  ...EPREUVES.map((e) => [`${e.id}_perf`, "TEXT"]),
  ...EPREUVES.flatMap((e) => (e.extras || []).map(([c]) => [c, "REAL"])),
  // Ancien marqueur de note saisie à la main : plus utilisé (notes toujours calculées), colonne conservée
  ...EPREUVES.map((e) => [`${e.id}_manuel`, "INTEGER NOT NULL DEFAULT 0"]),
  // Exemption d'une épreuve : l'unique note de test écrit du stagiaire remplace chaque épreuve
  // exemptée, avec le coefficient de cette épreuve
  ...EPREUVES.map((e) => [`${e.id}_exempt`, "INTEGER NOT NULL DEFAULT 0"]),
  ["ecrit_exemption", "REAL"],
];

// Bornes des barèmes ajoutées après la première version (intervalles min ; max ; note)
const BAREME_ADDED_COLUMNS = ["performance_min", "performance_max", "nage_min", "nage_max", "apnee_min", "apnee_max"];
