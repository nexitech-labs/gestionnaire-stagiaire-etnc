/* CCPG — Base SQLite : chargement, sauvegarde sur le disque, requêtes, paramètres. */
"use strict";

let pendingWrites = 0;

let writeChain = Promise.resolve();

async function loadProject(root) {
  state.rootHandle = root;
  setStatus("loading", "Chargement…");
  try {
    const dbDir = await root.getDirectoryHandle(DB_DIR);
    const fileHandle = await dbDir.getFileHandle(DB_FILE, { create: true });
    const file = await fileHandle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());

    const db = bytes.length ? new state.SQL.Database(bytes) : new state.SQL.Database();
    let needsSave = bytes.length === 0;
    try {
      const tables = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${TABLES.map((t) => `'${t}'`).join(",")})`);
      if (!tables.length || tables[0].values.length < TABLES.length) needsSave = true;
      const existing = new Set(tables.length ? tables[0].values.map((v) => v[0]) : []);
      db.exec(SCHEMA);
      if (!existing.has("activites")) {
        db.exec(`INSERT OR IGNORE INTO activites (libelle)
          SELECT DISTINCT TRIM(v) FROM (SELECT cours_sagaie AS v FROM edt UNION SELECT activite FROM edt)
          WHERE v IS NOT NULL AND TRIM(v) <> ''`);
      }
      // Bases créées avec une version antérieure : colonnes manquantes
      const cols = new Set(db.exec("PRAGMA table_info(notes_physiques)")[0].values.map((v) => v[1]));
      for (const [col, type] of PHYS_ADDED_COLUMNS) {
        if (!cols.has(col)) {
          db.exec(`ALTER TABLE notes_physiques ADD COLUMN ${col} ${type}`);
          needsSave = true;
        }
      }
      const sectionCols = new Set(db.exec("PRAGMA table_info(sections)")[0].values.map((v) => v[1]));
      for (const col of SECTION_ADDED_COLUMNS) {
        if (!sectionCols.has(col)) {
          db.exec(`ALTER TABLE sections ADD COLUMN ${col} TEXT`);
          needsSave = true;
        }
      }
      const baremeCols = new Set(db.exec("PRAGMA table_info(baremes)")[0].values.map((v) => v[1]));
      if (BAREME_ADDED_COLUMNS.some((c) => !baremeCols.has(c))) {
        for (const c of BAREME_ADDED_COLUMNS) if (!baremeCols.has(c)) db.exec(`ALTER TABLE baremes ADD COLUMN ${c} REAL`);
        migrerBaremesIntervalles(db);
        needsSave = true;
      }
      if (db.exec("SELECT COUNT(*) FROM baremes")[0].values[0][0] === 0) {
        insertBaremesDefaut(db);
        needsSave = true;
      }
      if (db.exec("SELECT COUNT(*) FROM coefficients")[0].values[0][0] === 0) {
        insertCoefsDefaut(db);
        needsSave = true;
      }
      if (migrerVersionsBaremes(db)) needsSave = true;
    } catch (e) {
      db.close();
      throw new Error(`Le fichier db/${DB_FILE} n'est pas une base SQLite valide (${errMsg(e)}). Il n'a pas été modifié.`);
    }

    if (state.db) state.db.close();
    state.db = db;
    invalidateBaremes();
    grillesCache = {};
    coefsCache = null;
    state.fileHandle = fileHandle;
    if (supprimerDerogations()) needsSave = true;
    if (recomputeAutoNotes()) needsSave = true; // notes enregistrées alignées sur les règles de calcul actuelles

    $("waiting").hidden = true;
    $("workspace").hidden = false;
    setStatus("saved", `Base chargée (${DB_FILE})`);

    if (needsSave) persist();
    refreshAll();
  } catch (e) {
    if (e.name === "NotFoundError") {
      await forgetHandle();
      state.rootHandle = null;
      setStatus("idle", "Données non chargées");
      showAccessModal("Le dossier mémorisé est introuvable (déplacé, renommé ou sans sous-dossier « db »). Sélectionnez à nouveau le dossier du projet.");
      return;
    }
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      setStatus("idle", "Données non chargées");
      armPermissionGesture();
      return;
    }
    setStatus("error", "Erreur de chargement");
    showAlert(`Chargement de la base impossible : ${errMsg(e)}`, "load");
  }
}

function persist() {
  if (!state.db || !state.fileHandle) return writeChain;
  // Instantané synchrone, juste après la modification
  const data = state.db.export();
  // sql.js ferme/rouvre la connexion lors de export() : réactiver les clés étrangères
  state.db.run("PRAGMA foreign_keys = ON;");

  const fileHandle = state.fileHandle;
  pendingWrites++;
  setStatus("saving", "Enregistrement…");

  writeChain = writeChain.then(async () => {
    let writable = null;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      writable = null;
      clearAlert("save");
      if (pendingWrites === 1) {
        setStatus("saved", `Enregistré à ${new Date().toLocaleTimeString("fr-FR")}`);
      }
    } catch (e) {
      if (writable) { try { await writable.abort(); } catch { /* ignoré */ } }
      setStatus("error", "Échec de l'enregistrement");
      showAlert(`L'enregistrement de db/${DB_FILE} a échoué : ${errMsg(e)}. Les dernières modifications ne sont pas sauvegardées sur le disque.`, "save");
    } finally {
      pendingWrites--;
    }
  });
  return writeChain;
}

window.addEventListener("beforeunload", (event) => {
  if (pendingWrites > 0) {
    event.preventDefault();
    event.returnValue = "";
  }
});

function query(sql, params = []) {
  const stmt = state.db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

/** Exécute une modification, sauvegarde et rafraîchit l'interface.
 *  Renvoie { id } (dernier rowid inséré) ou null en cas d'erreur. */
function mutate(sql, params) {
  let id;
  try {
    state.db.run("PRAGMA foreign_keys = ON;");
    state.db.run(sql, params);
    // À lire avant persist() : export() rouvre la connexion et remet ce compteur à zéro
    id = query("SELECT last_insert_rowid() AS id")[0].id;
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return null;
  }
  persist();
  refreshAll();
  return { id };
}

function getSections() {
  return query(`
    SELECT s.*,
           (SELECT COUNT(*) FROM stagiaires t WHERE t.section_id = s.id) AS nb,
           (SELECT COUNT(*) FROM stagiaires t WHERE t.section_id = s.id AND t.sexe = 'F') AS nb_f
    FROM sections s
    ORDER BY s.annee_scolaire DESC, s.date_debut DESC, s.formation COLLATE NOCASE ASC, s.id DESC`);
}

function getSection(id) {
  return getSections().find((s) => s.id === id) || null;
}

function getStagiaires(sectionId) {
  return query("SELECT * FROM stagiaires WHERE section_id = ?", [sectionId]);
}

// p.* puis t.* : les colonnes du stagiaire (dont id) priment sur celles des notes
const NOTES_SELECT = `
    SELECT p.*, g.comportement, g.test_ecrit, g.pedagogie, t.*
    FROM stagiaires t
    LEFT JOIN notes_physiques p ON p.stagiaire_id = t.id
    LEFT JOIN notes_pedagogiques g ON g.stagiaire_id = t.id`;

function getStagiairesAvecNotes(sectionId) {
  return query(`${NOTES_SELECT} WHERE t.section_id = ?`, [sectionId]);
}

function getStagiaireAvecNotes(id) {
  return query(`${NOTES_SELECT} WHERE t.id = ?`, [id])[0] || null;
}

function getDatesEpreuves(sectionId) {
  const rows = query("SELECT epreuve, date_epreuve FROM dates_epreuves WHERE section_id = ?", [sectionId]);
  return Object.fromEntries(rows.map((r) => [r.epreuve, r.date_epreuve]));
}

function upsert(table, conflict, columns, values) {
  const placeholders = columns.map(() => "?").join(", ");
  const updates = columns.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
  state.db.run("PRAGMA foreign_keys = ON;");
  state.db.run(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})
     ON CONFLICT(${conflict.join(", ")}) DO UPDATE SET ${updates}`,
    values,
  );
}

function getParametre(cle) {
  const r = query("SELECT valeur FROM parametres WHERE cle = ?", [cle])[0];
  return r ? r.valeur : null;
}

function setParametre(cle, valeur) {
  if (valeur == null) state.db.run("DELETE FROM parametres WHERE cle = ?", [cle]);
  else upsert("parametres", ["cle"], ["cle", "valeur"], [cle, String(valeur)]);
}
