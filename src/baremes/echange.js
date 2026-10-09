/* CCPG — Barèmes et coefficients : export / import entre moniteurs (fichier .json). */
"use strict";

const ECHANGE_TYPE = "ccpg-baremes-coefficients";

const ECHANGE_VERSION = 1;

const ECHANGE_MAX_OCTETS = 5 * 1024 * 1024;

const BAREME_CHAMPS = ["performance_min", "performance_max", "nage_min", "nage_max", "apnee_min", "apnee_max"];

/** Exporte le barème affiché sur la page Barèmes (en vigueur par défaut) et les coefficients CT1 / CT2. */
function exporterParametres() {
  if (!state.db) return;
  const versions = getVersionsBaremes();
  const version = versions.find((v) => v.id === state.baremeVersion) || versions[0];
  const contenu = {
    type: ECHANGE_TYPE,
    version: ECHANGE_VERSION,
    exporte_le: todayIso(),
    bareme: {
      libelle: version.libelle,
      lignes: getBaremes(version.id).map((b) => ({
        armee: b.armee, epreuve: b.epreuve, sexe: b.sexe, note: b.note,
        ...Object.fromEntries(BAREME_CHAMPS.map((c) => [c, b[c] ?? null])),
      })),
    },
    coefficients: query("SELECT formation, epreuve, coef FROM coefficients_versions WHERE version_id = ? ORDER BY formation, epreuve", [version.id]),
  };
  const nom = `Baremes et coefficients - ${version.libelle} - ${fmtDate(todayIso()).replace(/\//g, "-")}.json`.replace(/[\\/:*?"<>|]/g, "-");
  telecharger(new TextEncoder().encode(JSON.stringify(contenu, null, 2)), nom, "application/json");
  toast(`Exporté : « ${version.libelle} » (${contenu.bareme.lignes.length} lignes) et coefficients`);
}

/** Contrôle un fichier d'échange ; renvoie { lignes, coefficients, libelle } ou { error }. */
function lireEchange(json) {
  if (!json || json.type !== ECHANGE_TYPE) return { error: "Ce fichier n'est pas un export de barèmes et coefficients." };
  if (json.version > ECHANGE_VERSION) return { error: "Ce fichier vient d'une version plus récente de l'application." };
  const nombre = (v) => (v == null || v === "" ? null : typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : NaN);
  const lignes = [];
  for (const [i, b] of ((json.bareme && json.bareme.lignes) || []).entries()) {
    const ligne = { armee: b.armee, epreuve: b.epreuve, sexe: b.sexe, note: nombre(b.note) };
    for (const c of BAREME_CHAMPS) ligne[c] = nombre(b[c]);
    const ok = ARMEES_BAREME.some(([a]) => a === b.armee) && EPREUVES.some((e) => e.id === b.epreuve) && (b.sexe === "M" || b.sexe === "F")
      && ligne.note != null && ligne.note <= NOTE_MAX && BAREME_CHAMPS.every((c) => !Number.isNaN(ligne[c]))
      && (ligne.performance_min != null || ligne.performance_max != null);
    if (!ok) return { error: `Ligne de barème n° ${i + 1} invalide (armée, épreuve, sexe, note ou bornes).` };
    lignes.push(ligne);
  }
  const coefficients = [];
  for (const c of json.coefficients || []) {
    const coef = nombre(c.coef);
    if (!FORMATIONS.includes(c.formation) || !(c.epreuve in COEFS_DEFAUT) || coef == null || Number.isNaN(coef) || coef > COEF_MAX) {
      return { error: `Coefficient invalide : ${c.formation} / ${c.epreuve}.` };
    }
    coefficients.push({ formation: c.formation, epreuve: c.epreuve, coef });
  }
  if (!lignes.length && !coefficients.length) return { error: "Le fichier ne contient ni barème ni coefficients." };
  return { lignes, coefficients, libelle: String((json.bareme && json.bareme.libelle) || "Barème importé").slice(0, 60) };
}

async function importerParametres(file) {
  if (!state.db || !file) return;
  if (file.size > ECHANGE_MAX_OCTETS) return toast("Fichier trop volumineux.", "error");
  let lu;
  try {
    lu = lireEchange(JSON.parse(await file.text()));
  } catch {
    lu = { error: "Fichier illisible : un fichier .json exporté depuis cette page est attendu." };
  }
  if (lu.error) return toast(lu.error, "error");

  const ok = await confirmDialog({
    title: "Importer les barèmes et coefficients ?",
    message: `« ${lu.libelle} » devient la version en vigueur pour les nouvelles sections : `
      + `${lu.lignes.length ? `barème importé (${lu.lignes.length} lignes)` : "barème actuel"}, `
      + `${lu.coefficients.length ? "coefficients CT1 / CT2 importés" : "coefficients actuels"}.`
      + "\n\nLes sections existantes gardent leur barème et leurs coefficients (modifiables dans chaque section).",
    confirmLabel: "Importer",
  });
  if (!ok) return;

  try {
    const cur = versionCourante();
    state.db.exec("BEGIN");
    const pris = new Set(query("SELECT libelle FROM baremes_versions").map((x) => x.libelle));
    const base = `${lu.libelle} (importé le ${fmtDate(todayIso())})`;
    let libelle = base;
    for (let i = 2; pris.has(libelle); i++) libelle = `${base} ${i}`;
    state.db.run("INSERT INTO baremes_versions (libelle, cree_le) VALUES (?, ?)", [libelle, todayIso()]);
    const vid = query("SELECT last_insert_rowid() AS id")[0].id;
    state.baremeVersion = vid;
    if (!lu.lignes.length) {
      // Coefficients seuls : la nouvelle version reprend le barème en vigueur
      const cols = "armee, epreuve, sexe, tranche_age, note, performance, distance_nage, distance_apnee, " + BAREME_CHAMPS.join(", ");
      state.db.run(`INSERT INTO baremes (version_id, ${cols}) SELECT ?, ${cols} FROM baremes WHERE version_id = ?`, [vid, cur]);
    } else {
      const stmt = state.db.prepare(`INSERT INTO baremes (version_id, armee, epreuve, sexe, tranche_age, note, ${BAREME_CHAMPS.join(", ")},
        performance, distance_nage, distance_apnee) VALUES (?, ?, ?, ?, 'Toutes', ?, ${BAREME_CHAMPS.map(() => "?").join(", ")}, ?, ?, ?)`);
      try {
        for (const b of lu.lignes) {
          stmt.run([vid, b.armee, b.epreuve, b.sexe, b.note, ...BAREME_CHAMPS.map((c) => b[c]),
            seuilDeduit(b.armee, b.epreuve, b.performance_min, b.performance_max), b.nage_min, b.apnee_min]);
        }
      } finally {
        stmt.free();
      }
    }
    // Coefficients : ceux du fichier, complétés par ceux de la version en vigueur
    state.db.run("INSERT INTO coefficients_versions (version_id, formation, epreuve, coef) SELECT ?, formation, epreuve, coef FROM coefficients_versions WHERE version_id = ?", [vid, cur]);
    for (const c of lu.coefficients) {
      state.db.run("INSERT OR REPLACE INTO coefficients_versions (version_id, formation, epreuve, coef) VALUES (?, ?, ?, ?)", [vid, c.formation, c.epreuve, c.coef]);
    }
    state.db.exec("COMMIT");
  } catch (e) {
    state.db.exec("ROLLBACK");
    return toast(`Import impossible : ${errMsg(e)}`, "error");
  }
  invalidateBaremes();
  recomputeAutoNotes();
  persist();
  refreshAll();
  if (state.tab === "baremes") renderBaremes();
  if (state.tab === "coefficients") renderCoefs();
  toast("Barèmes et coefficients importés");
}
