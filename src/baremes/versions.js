/* CCPG — Barèmes : versions (barème + coefficients par section), barèmes d'origine, migrations. */
"use strict";

let baremesCache = null;

let baremesParVersion = new Map();

let sectionVersionCache = null; // section → version de barème

/** Seuil de compatibilité : borne « à atteindre » (temps max, nombre min). */
function seuilDeduit(armee, epreuve, min, max) {
  return uniteEpreuve(armee, epreuve) === "temps" ? max ?? min : min ?? max;
}

/** Lignes de baremes-defaut.js : armee, epreuve, sexe, tranche, perf_min, perf_max, note, nage_min, nage_max, apnee_min, apnee_max. */
function insertBaremesDefaut(db, versionId = null) {
  const rows = window.BAREMES_DEFAUT;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("barèmes par défaut introuvables (fichier baremes-defaut.js manquant)");
  }
  // version_id null à la création de la base : rattachée au « Barème initial » par migrerVersionsBaremes
  const stmt = db.prepare(`INSERT INTO baremes
    (armee, epreuve, sexe, tranche_age, performance_min, performance_max, note, nage_min, nage_max, apnee_min, apnee_max,
     performance, distance_nage, distance_apnee${versionId == null ? "" : ", version_id"})
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${versionId == null ? "" : ", ?"})`);
  try {
    db.exec("BEGIN");
    for (const r of rows) {
      const [armee, epreuve, , , pmin, pmax, , nmin, , amin] = r;
      stmt.run([...r, seuilDeduit(armee, epreuve, pmin, pmax), nmin, amin, ...(versionId == null ? [] : [versionId])]);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    stmt.free();
  }
}

/**
 * Base créée avec les barèmes « seuil seul » : retrouve les bornes min / max de l'Excel
 * pour les lignes d'origine ; une ligne modifiée garde son seuil comme borne unique.
 */
function migrerBaremesIntervalles(db) {
  const stmt = db.prepare(`UPDATE baremes SET performance_min = ?, performance_max = ?, nage_min = ?, nage_max = ?, apnee_min = ?, apnee_max = ?
    WHERE armee = ? AND epreuve = ? AND sexe = ? AND tranche_age = ? AND note = ? AND performance = ?
      AND COALESCE(distance_nage, -1) = COALESCE(?, -1) AND COALESCE(distance_apnee, -1) = COALESCE(?, -1)
      AND performance_min IS NULL AND performance_max IS NULL`);
  try {
    for (const [armee, epreuve, sexe, tranche, pmin, pmax, note, nmin, nmax, amin, amax] of window.BAREMES_DEFAUT || []) {
      stmt.run([pmin, pmax, nmin, nmax, amin, amax, armee, epreuve, sexe, tranche, note, seuilDeduit(armee, epreuve, pmin, pmax), nmin, amin]);
    }
  } finally {
    stmt.free();
  }
  const reste = db.exec("SELECT id, armee, epreuve, performance, distance_nage, distance_apnee FROM baremes WHERE performance_min IS NULL AND performance_max IS NULL");
  for (const [id, armee, epreuve, perf, nage, apnee] of reste.length ? reste[0].values : []) {
    const temps = uniteEpreuve(armee, epreuve) === "temps";
    db.run("UPDATE baremes SET performance_min = ?, performance_max = ?, nage_min = ?, apnee_min = ? WHERE id = ?",
      [temps ? null : perf, temps ? perf : null, nage, apnee, id]);
  }
}

/**
 * Bases antérieures aux versions de barème : les barèmes existants deviennent le « Barème initial »
 * et toutes les sections y sont rattachées (leurs notes ne changent pas).
 */
function migrerVersionsBaremes(db) {
  let changed = false;
  const colonnes = (table) => new Set(db.exec(`PRAGMA table_info(${table})`)[0].values.map((v) => v[1]));
  if (!colonnes("baremes").has("version_id")) {
    db.exec("ALTER TABLE baremes ADD COLUMN version_id INTEGER");
    changed = true;
  }
  if (!colonnes("sections").has("bareme_version_id")) {
    db.exec("ALTER TABLE sections ADD COLUMN bareme_version_id INTEGER");
    changed = true;
  }
  let v = db.exec("SELECT MAX(id) FROM baremes_versions")[0].values[0][0];
  if (v == null) {
    db.run("INSERT INTO baremes_versions (libelle, cree_le) VALUES (?, ?)", ["Barème initial", todayIso()]);
    v = db.exec("SELECT MAX(id) FROM baremes_versions")[0].values[0][0];
    changed = true;
  }
  if (db.exec("SELECT COUNT(*) FROM baremes WHERE version_id IS NULL")[0].values[0][0]) {
    db.run("UPDATE baremes SET version_id = ? WHERE version_id IS NULL", [v]);
    changed = true;
  }
  if (db.exec("SELECT COUNT(*) FROM sections WHERE bareme_version_id IS NULL")[0].values[0][0]) {
    db.run("UPDATE sections SET bareme_version_id = ? WHERE bareme_version_id IS NULL", [v]);
    changed = true;
  }
  // Versions sans coefficients (bases antérieures) : coefficients actuels
  const sansCoefs = db.exec(`SELECT id FROM baremes_versions v
    WHERE NOT EXISTS (SELECT 1 FROM coefficients_versions c WHERE c.version_id = v.id)`);
  for (const [id] of sansCoefs.length ? sansCoefs[0].values : []) {
    db.run("INSERT INTO coefficients_versions (version_id, formation, epreuve, coef) SELECT ?, formation, epreuve, coef FROM coefficients", [id]);
    changed = true;
  }
  return changed;
}

function invalidateBaremes() {
  baremesCache = null;
  coefsCache = null;
  baremesParVersion = new Map();
  sectionVersionCache = null;
}

/** Lignes de barème : toutes, ou celles d'une version. */
function getBaremes(versionId) {
  if (!baremesCache) baremesCache = query("SELECT * FROM baremes");
  if (versionId == null) return baremesCache;
  if (!baremesParVersion.has(versionId)) baremesParVersion.set(versionId, baremesCache.filter((b) => b.version_id === versionId));
  return baremesParVersion.get(versionId);
}

/** Barème en vigueur : le plus récent, attribué aux nouvelles sections et seul modifiable. */
function versionCourante() {
  return query("SELECT MAX(id) AS id FROM baremes_versions")[0].id;
}

/** Versions, de la plus récente à la plus ancienne, avec le nombre de sections qui les utilisent. */
function getVersionsBaremes() {
  return query(`SELECT v.*, (SELECT COUNT(*) FROM sections s WHERE s.bareme_version_id = v.id) AS nb_sections
    FROM baremes_versions v ORDER BY v.id DESC`);
}

function versionDeSection(sectionId) {
  if (!sectionVersionCache) sectionVersionCache = new Map(query("SELECT id, bareme_version_id FROM sections").map((x) => [x.id, x.bareme_version_id]));
  return sectionVersionCache.get(sectionId) ?? versionCourante();
}

/**
 * Avant toute modification du barème ou des coefficients en vigueur : si la version est déjà utilisée
 * par une section, elle est figée et la modification porte sur une copie (nouvelle version en vigueur).
 * Renvoie { versionId, map } où map traduit les id de lignes de l'ancienne version vers la copie.
 */
function versionPourModifier() {
  const cur = versionCourante();
  const nb = query("SELECT COUNT(*) AS n FROM sections WHERE bareme_version_id = ?", [cur])[0].n;
  if (!nb) return { versionId: cur, map: null };

  const base = `Version du ${fmtDate(todayIso())}`;
  const pris = new Set(query("SELECT libelle FROM baremes_versions").map((x) => x.libelle));
  let libelle = base;
  for (let i = 2; pris.has(libelle); i++) libelle = `${base} (${i})`;

  const cols = ["armee", "epreuve", "sexe", "tranche_age", "performance", "note", "distance_nage", "distance_apnee",
    "performance_min", "performance_max", "nage_min", "nage_max", "apnee_min", "apnee_max"];
  const map = new Map();
  state.db.exec("BEGIN");
  try {
    state.db.run("INSERT INTO baremes_versions (libelle, cree_le) VALUES (?, ?)", [libelle, todayIso()]);
    const nv = query("SELECT last_insert_rowid() AS id")[0].id;
    const stmt = state.db.prepare(`INSERT INTO baremes (version_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`);
    try {
      for (const b of query("SELECT * FROM baremes WHERE version_id = ? ORDER BY id", [cur])) {
        stmt.run([nv, ...cols.map((c) => b[c])]);
        map.set(b.id, query("SELECT last_insert_rowid() AS id")[0].id);
      }
    } finally {
      stmt.free();
    }
    state.db.run("INSERT INTO coefficients_versions (version_id, formation, epreuve, coef) SELECT ?, formation, epreuve, coef FROM coefficients_versions WHERE version_id = ?", [nv, cur]);
    state.db.exec("COMMIT");
    state.baremeVersion = nv;
    invalidateBaremes();
    toast(`Nouvelle version « ${libelle} » (barème et coefficients) : ${nb > 1 ? `les ${nb} sections existantes gardent` : "la section existante garde"} l'ancienne.`);
    return { versionId: nv, map };
  } catch (e) {
    state.db.exec("ROLLBACK");
    throw e;
  }
}
