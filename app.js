/* CCPG — Suivi des stages
 * Application 100 % locale (file://) : sql.js + File System Access API.
 */
"use strict";

(() => {
  // ---------------------------------------------------------------------------
  // Constantes
  // ---------------------------------------------------------------------------
  const IDB_NAME = "ccpg-app";
  const IDB_STORE = "handles";
  const IDB_KEY = "projectDir";
  const DB_DIR = "db";
  const DB_FILE = "ccpg.db";
  const LS_PREFIX = "ccpg.";

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

  // Coefficients par formation (valeurs du fichier Excel, identiques pour CT1 et CT2 par défaut)
  const FORMATIONS = ["CT1", "CT2"];
  const COEFS_DEFAUT = { m_co: 2, ecr: 1, cmg: 1, aisance_aquatique: 1, traction: 1, comportement: 1, test_ecrit: 1, pedagogie: 1 };
  const COEF_MAX = 10;

  // Bornes des barèmes ajoutées après la première version (intervalles min ; max ; note)
  const BAREME_ADDED_COLUMNS = ["performance_min", "performance_max", "nage_min", "nage_max", "apnee_min", "apnee_max"];

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

  // ---------------------------------------------------------------------------
  // État
  // ---------------------------------------------------------------------------
  const state = {
    SQL: null,
    db: null,
    rootHandle: null,
    fileHandle: null,
    tab: "accueil",
    activeSectionId: Number(lsGet("activeSection")) || null,
    editingSectionId: null,
    editingStagiaireId: null,
    search: "",
    sort: { key: "nom", dir: 1 },
    hasSections: false,
    physTab: PHYS_TABS.includes(lsGet("physTab")) ? lsGet("physTab") : PHYS_TABS[0],
    ficheTab: ["mco", "natation", "f2400", "peda"].includes(lsGet("ficheTab")) ? lsGet("ficheTab") : "mco",
    ficheVariante: ["initial", "final"].includes(lsGet("ficheVariante")) ? lsGet("ficheVariante") : "initial", // CT1 : test initial / final
    releveSid: null,
    releveSel: new Set(), // stagiaires cochés pour l'impression groupée des relevés
    baremeFiltre: {
      armee: ARMEES_BAREME.some(([a]) => a === lsGet("bf.armee")) ? lsGet("bf.armee") : "TERRE",
      epreuve: EPREUVES.some((e) => e.id === lsGet("bf.epreuve")) ? lsGet("bf.epreuve") : EPREUVES[0].id,
      sexe: lsGet("bf.sexe") === "F" ? "F" : "M",
    },
  };
  let baremesCache = null;
  let baremesParVersion = new Map();
  let sectionVersionCache = null; // section → version de barème
  let coefsCache = null;

  let pendingWrites = 0;
  let writeChain = Promise.resolve();

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function norm(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function age(iso, refIso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return null;
    const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refIso || "");
    const now = r ? new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3])) : new Date();
    let a = now.getFullYear() - Number(m[1]);
    if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
    return a >= 0 && a < 120 ? a : null;
  }

  function periodLabel(s) {
    if (s.date_debut && s.date_fin) return `du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}`;
    if (s.date_debut) return `à partir du ${fmtDate(s.date_debut)}`;
    if (s.date_fin) return `jusqu'au ${fmtDate(s.date_fin)}`;
    return "";
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function lsGet(key) {
    try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
  }
  function lsSet(key, value) {
    try {
      if (value == null) localStorage.removeItem(LS_PREFIX + key);
      else localStorage.setItem(LS_PREFIX + key, String(value));
    } catch { /* stockage indisponible : sans conséquence */ }
  }

  function errMsg(e) {
    return (e && (e.message || e.name)) || String(e);
  }

  /** Chemin Windows du dossier contenant index.html, déduit de l'URL file://. */
  function projectPath() {
    let p = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, "");
    if (location.protocol === "file:" && location.host) return "\\\\" + location.host + p.replace(/\//g, "\\");
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    if (/^[A-Za-z]:$/.test(p)) p += "/";
    return p.replace(/\//g, "\\");
  }

  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove();
      if (!ok) throw new Error("Copie impossible");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallback());
    }
    try { fallback(); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
  }

  // ---------------------------------------------------------------------------
  // Notifications / alertes / statut d'enregistrement
  // ---------------------------------------------------------------------------
  function toast(message, kind = "success") {
    const el = document.createElement("div");
    const tone = kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-zinc-200 bg-white text-zinc-900";
    el.className = `pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ${tone}`;
    el.textContent = message;
    $("toasts").appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; }, kind === "error" ? 6000 : 2800);
    setTimeout(() => el.remove(), kind === "error" ? 6400 : 3200);
  }

  function showAlert(message, key) {
    const box = $("alerts");
    if (key) {
      const prev = box.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (prev) prev.remove();
    }
    const el = document.createElement("div");
    el.setAttribute("role", "alert");
    if (key) el.dataset.key = key;
    el.className = "flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";
    el.innerHTML = `
      <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <p class="flex-1">${esc(message)}</p>
      <button type="button" class="-m-1 rounded p-1 text-red-700 hover:bg-red-100" aria-label="Fermer">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>`;
    el.querySelector("button").addEventListener("click", () => el.remove());
    box.appendChild(el);
  }

  function clearAlert(key) {
    const el = $("alerts").querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (el) el.remove();
  }

  function setStatus(kind, text) {
    const colors = { idle: "bg-zinc-300", loading: "bg-sky-500", saving: "bg-amber-500 animate-pulse", saved: "bg-emerald-500", error: "bg-red-500" };
    const allColors = Object.values(colors).join(" ").split(" ");
    document.querySelectorAll(".save-dot").forEach((dot) => {
      dot.classList.remove(...allColors);
      dot.classList.add(...(colors[kind] || colors.idle).split(" "));
    });
    $("save-text").textContent = text;
    $("save-text").classList.toggle("font-medium", kind === "error");
    $("save-text").classList.toggle("text-red-600", kind === "error");
    $("save-status").title = text;
  }

  // ---------------------------------------------------------------------------
  // IndexedDB : mémorisation du FileSystemDirectoryHandle
  // ---------------------------------------------------------------------------
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("Base IndexedDB bloquée par un autre onglet"));
    });
  }

  async function idbTx(mode, fn) {
    const idb = await idbOpen();
    try {
      return await new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, mode);
        const req = fn(tx.objectStore(IDB_STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error || req.error);
        tx.onabort = () => reject(tx.error || new Error("Transaction IndexedDB annulée"));
      });
    } finally {
      idb.close();
    }
  }

  const idbGet = (key) => idbTx("readonly", (s) => s.get(key));
  const idbPut = (key, value) => idbTx("readwrite", (s) => s.put(value, key));
  const idbDelete = (key) => idbTx("readwrite", (s) => s.delete(key));

  /** Enregistre le handle puis le relit aussitôt pour vérifier l'écriture. */
  async function rememberHandle(handle) {
    await idbPut(IDB_KEY, handle);
    const back = await idbGet(IDB_KEY);
    if (!back || typeof back.isSameEntry !== "function" || !(await back.isSameEntry(handle))) {
      throw new Error("le dossier relu ne correspond pas au dossier enregistré");
    }
  }

  async function forgetHandle() {
    try { await idbDelete(IDB_KEY); } catch { /* rien à oublier */ }
  }

  // ---------------------------------------------------------------------------
  // Accès au dossier : modale de première ouverture
  // ---------------------------------------------------------------------------
  function showAccessModal(info) {
    $("access-path").textContent = projectPath();
    $("access-info").hidden = !info;
    $("access-info").textContent = info || "";
    $("access-error").hidden = true;
    $("btn-access-cancel").hidden = !state.db;
    $("btn-copy-label").textContent = "Copier";
    showBanner(false);
    $("access-modal").hidden = false;
    $("btn-authorize").focus();
  }

  function hideAccessModal() {
    $("access-modal").hidden = true;
  }

  function accessError(message) {
    $("access-error").textContent = message;
    $("access-error").hidden = false;
  }

  function flashCopied() {
    $("btn-copy-label").textContent = "Copié ✓";
    setTimeout(() => { $("btn-copy-label").textContent = "Copier"; }, 2000);
  }

  async function onAuthorizeClick() {
    $("access-error").hidden = true;

    if (typeof window.showDirectoryPicker !== "function") {
      accessError("Ce navigateur ne permet pas l'accès aux dossiers locaux. Ouvrez index.html avec Google Chrome ou Microsoft Edge.");
      return;
    }

    // Copie du chemin (sans attendre : le sélecteur doit s'ouvrir dans le même geste)
    copyText(projectPath()).then(flashCopied, () => {});

    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: "projet", mode: "readwrite", startIn: "documents" });
    } catch (e) {
      if (e.name === "AbortError") return; // l'utilisateur a fermé la fenêtre
      accessError(`Impossible d'ouvrir le sélecteur de dossier : ${errMsg(e)}`);
      return;
    }

    try {
      await dir.getDirectoryHandle(DB_DIR);
    } catch (e) {
      if (e.name === "NotFoundError" || e.name === "TypeMismatchError") {
        accessError(`Le dossier « ${dir.name} » ne contient pas de sous-dossier « db ». Choisissez le dossier racine du projet, celui qui contient index.html.`);
      } else {
        accessError(`Accès au dossier « ${dir.name} » impossible : ${errMsg(e)}`);
      }
      return;
    }

    try {
      await rememberHandle(dir);
      clearAlert("idb");
    } catch (e) {
      showAlert(`Le navigateur a refusé de mémoriser le dossier (${errMsg(e)}). Les données sont accessibles pour cette session, mais il faudra resélectionner le dossier à la prochaine ouverture.`, "idb");
    }

    hideAccessModal();
    await loadProject(dir);
  }

  // ---------------------------------------------------------------------------
  // Accès au dossier : ouvertures suivantes (bandeau + premier geste)
  // ---------------------------------------------------------------------------
  function showBanner(visible, text) {
    $("perm-banner").hidden = !visible;
    if (text) $("perm-banner-text").textContent = text;
  }

  function armPermissionGesture(text) {
    showBanner(true, text || "Cliquez n'importe où pour charger les données");
    window.addEventListener("pointerdown", onPermissionGesture, true);
    window.addEventListener("keydown", onPermissionGesture, true);
  }

  function disarmPermissionGesture() {
    window.removeEventListener("pointerdown", onPermissionGesture, true);
    window.removeEventListener("keydown", onPermissionGesture, true);
  }

  function onPermissionGesture(event) {
    // Échap et touches de modification n'ouvrent pas de geste utilisateur valide
    if (event.type === "keydown" && ["Escape", "Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    disarmPermissionGesture();

    const handle = state.rootHandle;
    let request;
    try {
      // Appel synchrone dans le gestionnaire d'événement : condition du geste utilisateur
      request = handle.requestPermission({ mode: "readwrite" });
    } catch (e) {
      request = Promise.reject(e);
    }

    request.then(
      (result) => {
        if (result === "granted") {
          showBanner(false);
          loadProject(handle);
        } else {
          armPermissionGesture("Accès refusé. Cliquez n'importe où pour réessayer de charger les données");
        }
      },
      async (e) => {
        if (e.name === "NotFoundError") {
          await forgetHandle();
          state.rootHandle = null;
          showAccessModal("Le dossier mémorisé est introuvable (déplacé ou supprimé). Sélectionnez à nouveau le dossier du projet.");
          return;
        }
        armPermissionGesture(`Autorisation impossible (${errMsg(e)}). Cliquez n'importe où pour réessayer`);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Chargement de la base
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Sauvegarde : export complet sérialisé
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Accès SQL (requêtes paramétrées uniquement)
  // ---------------------------------------------------------------------------
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

  function sectionLabel(s) {
    const period = periodLabel(s);
    return `${s.formation} — ${s.annee_scolaire}${period ? ` (${period})` : ""}`;
  }

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------
  function refreshAll() {
    if (!state.db) return;
    sectionVersionCache = null;
    const sections = getSections();
    if (!sections.some((s) => s.id === state.activeSectionId)) {
      state.activeSectionId = sections.length ? sections[0].id : null;
      lsSet("activeSection", state.activeSectionId);
    }
    state.hasSections = sections.length > 0;
    const active = sections.find((x) => x.id === state.activeSectionId);
    state.activeFormation = active ? active.formation : null;
    renderTabs();
    renderHome(sections);
    renderSections(sections);
    if (state.tab === "baremes") renderBaremes();
    if (state.tab === "coefficients") renderCoefs();
    renderStagiairesTab(sections);
    if (state.hasSections) {
      const rows = sortRows(getStagiairesAvecNotes(state.activeSectionId));
      renderPhysiques(rows);
      renderNotesTab("pedagogiques", rows);
      renderBilan(rows);
      renderEdt();
    }
    if (state.tab === "activites") renderActivites();
    if (state.tab === "fiches" && state.hasSections) renderFiche();
    if (state.tab === "releve" && state.hasSections) renderReleve(getSection(state.activeSectionId));
    if (state.tab === "comportement" && state.hasSections) renderComportement(getSection(state.activeSectionId));
  }

  // ---------------------------------------------------------------------------
  // Navigation : accueil (hub) + pages, routées par l'ancre de l'URL
  //   #/accueil · #/stagiaires · #/notes/physiques/<épreuve> · #/notes/pedagogiques · #/bilan
  //   #/parametres/baremes · #/parametres/coefficients (les sections se gèrent dans une popup)
  // ---------------------------------------------------------------------------
  const SETTINGS_TABS = ["baremes", "coefficients"];
  const PAGE_TITLES = {
    edt: "Emploi du temps", activites: "Emploi du temps", fiches: "Fiches terrain",
    stagiaires: "Stagiaires", physiques: "Saisie des notes", pedagogiques: "Saisie des notes",
    bilan: "Saisie des notes", releve: "Saisie des notes", comportement: "Saisie des notes", ecrit: "Saisie des notes", baremes: "Barèmes & coefficients", coefficients: "Barèmes & coefficients",
  };

  /** Entrée de la navigation principale correspondant à une page. */
  function navKey(tab) {
    if (tab === "activites") return "edt";
    return ["physiques", "pedagogiques", "comportement", "bilan", "releve"].includes(tab) ? "notes" : tab;
  }

  function renderTabs() {
    const t = state.tab;
    const settings = SETTINGS_TABS.includes(t);
    const ready = !!state.db;
    const mark = (el, on) => (on ? el.setAttribute("aria-current", "page") : el.removeAttribute("aria-current"));
    document.querySelectorAll("[data-nav]").forEach((a) => mark(a, a.dataset.nav === navKey(t)));
    document.querySelectorAll("[data-notes]").forEach((a) => mark(a, a.dataset.notes === t));
    document.querySelectorAll("[data-settings]").forEach((a) => mark(a, a.dataset.settings === t));

    const home = t === "accueil";
    $("view-home").hidden = !home;
    $("crumb").hidden = home || !ready;
    $("crumb-title").textContent = PAGE_TITLES[t] || "";
    $("btn-home").hidden = home || !ready;
    $("section-bar").hidden = !ready || !state.hasSections;
    $("notes-switch").hidden = navKey(t) !== "notes" || !state.hasSections;

    $("view-settings").hidden = !settings;
    $("tab-baremes").hidden = t !== "baremes";
    $("tab-coefficients").hidden = t !== "coefficients";

    $("section-scope").hidden = settings || home;
    $("page-title").textContent = PAGE_TITLES[t] || "";
    $("tab-stagiaires").hidden = t !== "stagiaires" || !state.hasSections;
    $("tab-notes").hidden = navKey(t) !== "notes" || !state.hasSections;
    $("tab-physiques").hidden = t !== "physiques";
    $("tab-pedagogiques").hidden = t !== "pedagogiques";
    $("tab-bilan").hidden = t !== "bilan" || !state.hasSections;
    $("tab-releve").hidden = t !== "releve" || !state.hasSections;
    $("tab-comportement").hidden = t !== "comportement" || !state.hasSections;
    $("btn-add-stagiaire").hidden = t !== "stagiaires";
    $("tab-edt").hidden = t !== "edt" || !state.hasSections;
    $("tab-activites").hidden = t !== "activites";
    $("edt-switch").hidden = navKey(t) !== "edt";
    $("fiches-switch").hidden = t !== "fiches" || !state.hasSections;
    $("tab-fiches").hidden = t !== "fiches" || !state.hasSections;
    document.querySelectorAll("[data-fiche]").forEach((a) => mark(a, a.dataset.fiche === state.ficheTab));
    document.querySelectorAll("[data-edt-tab]").forEach((a) => mark(a, a.dataset.edtTab === t));
    $("btn-print").hidden = t === "activites" || t === "comportement"; // grille comportement : saisie à l'écran uniquement
    renderPrintButton(t);
    $("btn-add-creneau").hidden = t !== "edt";
    $("btn-add-creneau").disabled = !state.hasSections;
  }

  const ICON_IMPRIMER = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
  const ICON_EXPORTER = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>';
  const ICON_RELEVE = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/></svg>';

  /** Libellé du bouton d'impression selon la page : chaque page n'imprime pas la même chose. */
  function renderPrintButton(t) {
    const [icone, libelle, titre] =
      ["physiques", "pedagogiques", "bilan"].includes(t) ? [ICON_EXPORTER, "Exporter toutes les notes", "Toutes les notes de la section en un document : impression, PDF ou Excel"]
      : t === "releve" ? [ICON_RELEVE, "Imprimer ce relevé", "Relevé individuel du stagiaire affiché. Pour plusieurs stagiaires : cochez-les dans la liste."]
      : t === "fiches" ? [ICON_IMPRIMER, "Imprimer des fiches", "Choisir les fiches terrain à imprimer ou exporter en PDF"]
      : [ICON_IMPRIMER, "Imprimer / Exporter PDF", "Imprimer cette page ou l'exporter en PDF"];
    $("btn-print-icon").innerHTML = icone;
    $("btn-print-label").textContent = libelle;
    $("btn-print").title = titre;
  }

  function hashFor(tab, physTab = state.physTab) {
    if (tab === "physiques") return `#/notes/physiques/${physTab}`;
    if (tab === "pedagogiques") return "#/notes/pedagogiques";
    if (tab === "bilan") return "#/notes/moyenne";
    if (tab === "releve") return "#/notes/releve";
    if (tab === "comportement") return "#/notes/comportement";
    if (tab === "activites") return "#/edt/activites";
    if (tab === "fiches") return `#/fiches/${state.ficheTab}${ficheAVariantes() ? `/${state.ficheVariante}` : ""}`;
    if (SETTINGS_TABS.includes(tab)) return `#/parametres/${tab}`;
    return `#/${TABS.includes(tab) ? tab : "accueil"}`;
  }

  function parseHash() {
    const [a, b, c] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((x) => {
      try { return decodeURIComponent(x); } catch { return x; }
    });
    if (a === "edt") return { tab: b === "activites" ? "activites" : "edt" };
    if (a === "fiches") {
      if (b === "comportement") return { tab: "comportement" }; // ancienne adresse : désormais dans la saisie des notes
      return { tab: "fiches", ficheTab: FICHES[b] && !FICHES[b].base ? b : null, ficheVariante: c === "initial" || c === "final" ? c : null };
    }
    if (a === "accueil" || a === "stagiaires" || a === "bilan") return { tab: a }; // #/bilan : ancienne adresse
    if (a === "notes") {
      if (b === "pedagogiques") return { tab: "pedagogiques" };
      if (b === "moyenne") return { tab: "bilan" };
      if (b === "releve") return { tab: "releve" };
      if (b === "comportement") return { tab: "comportement" };
      if (b === "physiques") return { tab: "physiques", physTab: PHYS_TABS.includes(c) ? c : null };
      const last = lsGet("notesTab");
      return { tab: ["pedagogiques", "comportement", "bilan", "releve"].includes(last) ? last : "physiques" };
    }
    if (a === "parametres") {
      if (b === "sections") return { tab: "accueil", openSections: true };
      return { tab: b === "coefficients" ? "coefficients" : "baremes" };
    }
    return null;
  }

  function replaceHash(hash) {
    try {
      history.replaceState(null, "", hash);
    } catch {
      location.replace(hash);
    }
  }

  function applyRoute() {
    const route = parseHash() || { tab: "accueil" };
    const previous = navKey(state.tab);
    state.tab = route.tab;
    if (route.physTab) state.physTab = route.physTab;
    if (route.ficheTab) {
      state.ficheTab = route.ficheTab;
      lsSet("ficheTab", state.ficheTab);
    }
    if (route.ficheVariante) {
      state.ficheVariante = route.ficheVariante;
      lsSet("ficheVariante", state.ficheVariante);
    }
    lsSet("tab", state.tab);
    lsSet("physTab", state.physTab);
    if (navKey(state.tab) === "notes") lsSet("notesTab", state.tab);
    // Adresse incomplète ou inconnue → forme canonique (sans nouvelle entrée d'historique)
    const canonical = hashFor(state.tab);
    if (location.hash !== canonical) replaceHash(canonical);

    if (state.db) refreshAll();
    else renderTabs();
    if (previous !== navKey(state.tab)) window.scrollTo(0, 0);
    if (route.openSections) openSectionsModal(false);
  }

  /** Navigation programmatique : passe par l'URL pour garder l'historique (Précédent / Suivant). */
  function setTab(tab, physTab) {
    const hash = hashFor(TABS.includes(tab) ? tab : "accueil", physTab || state.physTab);
    if (location.hash === hash) applyRoute();
    else location.hash = hash;
  }

  // Popup Sections
  let sectionsReturnFocus = null;

  function openSectionsModal(nouvelle) {
    if (!state.db) return;
    sectionsReturnFocus = document.activeElement;
    if (nouvelle) resetSectionForm();
    else if (!state.editingSectionId) fillBaremeSelect(null);
    refreshAll();
    $("sections-modal").hidden = false;
    if (nouvelle || !state.hasSections) $("sf-formation").focus();
    else $("sections-modal").querySelector("[data-close-sections]").focus();
  }

  function closeSectionsModal() {
    if ($("sections-modal").hidden) return;
    $("sections-modal").hidden = true;
    if (state.editingSectionId) resetSectionForm();
    refreshAll();
    if (sectionsReturnFocus && sectionsReturnFocus.focus && document.contains(sectionsReturnFocus)) sectionsReturnFocus.focus();
  }

  // Accueil : rappel de la section active
  function renderHome(sections) {
    const s = sections.find((x) => x.id === state.activeSectionId);
    $("home-section").innerHTML = s
      ? `Section active : <span class="font-medium text-zinc-800">${esc(sectionLabel(s))}</span> · moniteur ${esc(s.moniteur)}`
      : "Aucune section pour le moment : créez-en une avec le bouton « Ajouter / modifier une section ».";
  }

  const ICON_EDIT = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  const ICON_TRASH = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  const BTN_ICON = "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";
  const BTN_ICON_DANGER = "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-red-50 hover:text-red-600";

  function renderSections(sections) {
    const versions = new Map(state.db ? getVersionsBaremes().map((v) => [v.id, v.libelle]) : []);
    $("sections-count").textContent = sections.length
      ? `${sections.length} section${sections.length > 1 ? "s" : ""}`
      : "Aucune section pour le moment.";

    if (!sections.length) {
      $("sections-tbody").innerHTML = `
        <tr><td colspan="6" class="px-5 py-10 text-center text-sm text-zinc-500">Utilisez le formulaire pour créer la première section.</td></tr>`;
      return;
    }

    $("sections-tbody").innerHTML = sections.map((s) => {
      const active = s.id === state.activeSectionId;
      const editing = s.id === state.editingSectionId;
      return `
        <tr class="border-b border-zinc-100 last:border-0 ${editing ? "bg-amber-50/60" : active ? "bg-zinc-50" : "hover:bg-zinc-50/60"}">
          <td class="px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="font-medium">${esc(s.formation)}</span>
              ${active ? '<span class="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">Active</span>' : ""}
            </div>
            ${versions.has(s.bareme_version_id) ? `<div class="mt-0.5 text-xs text-zinc-500">${esc(versions.get(s.bareme_version_id))}</div>` : ""}
          </td>
          <td class="px-3 py-3 tabular-nums">${esc(s.annee_scolaire)}</td>
          <td class="px-3 py-3 text-zinc-600">${esc(periodLabel(s)) || '<span class="text-zinc-400">—</span>'}</td>
          <td class="px-3 py-3">${esc(s.moniteur)}</td>
          <td class="px-3 py-3 text-right tabular-nums">${esc(s.nb)}</td>
          <td class="px-5 py-2">
            <div class="flex justify-end gap-1">
              <button type="button" data-action="select-section" data-id="${esc(s.id)}"
                class="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium shadow-sm hover:bg-zinc-100">Sélectionner</button>
              <button type="button" data-action="edit-section" data-id="${esc(s.id)}" class="${BTN_ICON}" title="Éditer" aria-label="Éditer la section">${ICON_EDIT}</button>
              <button type="button" data-action="delete-section" data-id="${esc(s.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer la section">${ICON_TRASH}</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  function renderSectionOptions(select, sections, selectedId) {
    select.innerHTML = sections
      .map((s) => `<option value="${esc(s.id)}"${s.id === selectedId ? " selected" : ""}>${esc(sectionLabel(s))}</option>`)
      .join("");
  }

  function renderStagiairesTab(sections) {
    const has = sections.length > 0;
    $("no-section").hidden = has;
    $("section-summary").hidden = !has;
    $("stagiaires-card").hidden = !has;
    $("btn-add-stagiaire").disabled = !has;
    $("btn-print").disabled = !has;
    $("active-section").disabled = !has;
    renderSectionOptions($("active-section"), sections, state.activeSectionId);
    if (!has) {
      $("active-section").innerHTML = '<option value="">Aucune section</option>';
      return;
    }
    $("active-section").insertAdjacentHTML("beforeend", `
      <option disabled>──────────</option>
      <option value="__new">＋ Nouvelle section…</option>
      <option value="__manage">Gérer les sections…</option>`);

    const section = sections.find((s) => s.id === state.activeSectionId);
    const rows = getStagiaires(section.id);
    renderSummary(section, rows);
    renderStagiaires(rows);
  }

  function renderSummary(s, rows) {
    const nbF = rows.filter((r) => r.sexe === "F").length;
    const item = (label, value) => `<span><span class="text-zinc-400">${label}</span> <span class="font-medium text-zinc-800">${value}</span></span>`;
    $("section-summary").innerHTML = [
      item("Section", `${esc(s.formation)} · ${esc(s.annee_scolaire)}`),
      periodLabel(s) ? item("Période", esc(periodLabel(s))) : "",
      item("Moniteur", esc(s.moniteur)),
      item("Effectif", `${rows.length} <span class="font-normal text-zinc-400">(${rows.length - nbF} H / ${nbF} F)</span>`),
    ].join("");
  }

  function sortValue(row, key) {
    if (key === "grade") return GRADE_RANK.get(String(row.grade).toUpperCase()) ?? 0;
    return norm(row[key]);
  }

  function sortRows(rows) {
    const { key, dir } = state.sort;
    return rows.slice().sort((a, b) => {
      const va = sortValue(a, key);
      const vb = sortValue(b, key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return norm(a.nom).localeCompare(norm(b.nom)) || norm(a.prenom).localeCompare(norm(b.prenom));
    });
  }

  function filterRows(rows) {
    const terms = norm(state.search).split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((r) => {
      const hay = norm([r.nom, r.prenom, r.grade, r.armee].join(" "));
      return terms.every((t) => hay.includes(t));
    });
  }

  function renderStagiaires(allRows) {
    const rows = sortRows(filterRows(allRows));

    $("stagiaires-count").textContent = state.search.trim()
      ? `${rows.length} résultat${rows.length > 1 ? "s" : ""} sur ${allRows.length}`
      : `${allRows.length} stagiaire${allRows.length > 1 ? "s" : ""}`;

    document.querySelectorAll("#stagiaires-head th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === state.sort.key;
      th.dataset.label ??= th.textContent.trim();
      th.textContent = th.dataset.label + (active ? (state.sort.dir > 0 ? " ↑" : " ↓") : "");
      th.classList.toggle("text-zinc-900", active);
      th.setAttribute("aria-sort", active ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
    });

    if (!rows.length) {
      $("stagiaires-tbody").innerHTML = `
        <tr><td colspan="9" class="px-4 py-10 text-center text-sm text-zinc-500">
          ${allRows.length ? "Aucun stagiaire ne correspond à la recherche." : "Aucun stagiaire dans cette section. Cliquez sur « Ajouter un stagiaire »."}
        </td></tr>`;
      return;
    }

    const dash = '<span class="text-zinc-400">—</span>';
    $("stagiaires-tbody").innerHTML = rows.map((r) => {
      const a = age(r.date_naissance);
      return `
        <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
          <td class="px-4 py-2.5"><span class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-medium">${esc(r.grade)}</span></td>
          <td class="px-3 py-2.5 font-medium uppercase">${esc(r.nom)}</td>
          <td class="px-3 py-2.5">${esc(r.prenom)}</td>
          <td class="px-3 py-2.5 text-zinc-600">${esc(r.armee) || dash}</td>
          <td class="px-3 py-2.5 text-zinc-600">${esc(r.origine_recrutement) || dash}</td>
          <td class="px-3 py-2.5">${esc(r.sexe)}</td>
          <td class="px-3 py-2.5 tabular-nums">${r.date_naissance ? `${esc(fmtDate(r.date_naissance))}${a != null ? ` <span class="text-xs text-zinc-400">(${a} ans)</span>` : ""}` : dash}</td>
          <td class="px-3 py-2.5 tabular-nums">${esc(fmtDate(r.derniere_visite_medicale)) || dash}</td>
          <td class="px-4 py-1.5">
            <div class="flex justify-end gap-1">
              <button type="button" data-action="edit-stagiaire" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Éditer" aria-label="Éditer le stagiaire">${ICON_EDIT}</button>
              <button type="button" data-action="delete-stagiaire" data-id="${esc(r.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer le stagiaire">${ICON_TRASH}</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }


  // ---------------------------------------------------------------------------
  // Notes : calculs et rendu
  // ---------------------------------------------------------------------------
  function fmtNote(v) {
    return v == null ? "" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }

  /** "12,5" → { value: 12.5 } ; "" → { value: null } ; sinon { error }. */
  function parseNote(text) {
    const t = String(text).trim().replace(",", ".");
    if (!t) return { value: null };
    if (!/^\d+(\.\d+)?$/.test(t)) return { error: "Saisissez un nombre (ex. 12,5)." };
    const n = Number(t);
    if (n < 0 || n > NOTE_MAX) return { error: `La note doit être comprise entre 0 et ${NOTE_MAX}.` };
    return { value: Math.round(n * 100) / 100 };
  }

  // ---------------------------------------------------------------------------
  // Coefficients (par formation CT1 / CT2)
  // ---------------------------------------------------------------------------
  function insertCoefsDefaut(db) {
    const stmt = db.prepare("INSERT OR REPLACE INTO coefficients (formation, epreuve, coef) VALUES (?, ?, ?)");
    try {
      for (const f of FORMATIONS) for (const [ep, c] of Object.entries(COEFS_DEFAUT)) stmt.run([f, ep, c]);
    } finally {
      stmt.free();
    }
  }

  /** Coefficients d'une formation dans une version (par défaut celle de la section active) : { épreuve: coef }. */
  function getCoefs(formation, versionId = versionDeSection(state.activeSectionId)) {
    if (!coefsCache) {
      coefsCache = {};
      for (const r of query("SELECT version_id, formation, epreuve, coef FROM coefficients_versions")) {
        ((coefsCache[r.version_id] ||= {})[r.formation] ||= {})[r.epreuve] = r.coef;
      }
    }
    return (coefsCache[versionId] || {})[formation] || {};
  }

  /** Coefficient d'une épreuve (1 si non défini), pour la section active sauf version précisée. */
  function coefOf(epreuve, formation = state.activeFormation, versionId = undefined) {
    const c = getCoefs(formation, versionId)[epreuve];
    return c == null ? 1 : c;
  }

  /** Épreuve physique dont le stagiaire est exempté. */
  const estExempte = (row, epId) => !!row[`${epId}_exempt`];

  /** Note retenue pour une épreuve : celle du test écrit (unique pour le stagiaire) s'il en est exempté. */
  function noteRetenue(row, f) {
    return EPREUVES.some((e) => e.id === f) && estExempte(row, f) ? row.ecrit_exemption ?? null : row[f] ?? null;
  }

  /** Moyenne pondérée des notes saisies (comme l'Excel : Σ note×coef / Σ coef des épreuves notées). */
  function weightedAverage(row, fields) {
    let sum = 0;
    let weight = 0;
    let n = 0;
    for (const f of fields) {
      const note = noteRetenue(row, f);
      if (note == null) continue;
      n++;
      const c = coefOf(f); // exemptée : coefficient de l'épreuve, appliqué à la note d'écrit
      sum += note * c;
      weight += c;
    }
    return { avg: weight > 0 ? sum / weight : null, n, total: fields.length };
  }

  /** Moyenne d'un type de notes : { avg, n, total } (avg = null si aucune note). */
  function average(row, kind) {
    return weightedAverage(row, NOTES[kind].fields.map(([f]) => f));
  }

  /** Moyenne E²PMS (moyenne générale) : toutes les épreuves physiques et pédagogiques, pondérées. */
  function averageGenerale(row) {
    return weightedAverage(row, [...NOTES.physiques.fields, ...NOTES.pedagogiques.fields].map(([f]) => f));
  }

  function coefBadge(epreuve) {
    return `<span class="ml-1 font-normal normal-case text-zinc-400" title="Coefficient ${esc(state.activeFormation || "")}">×${esc(fmtNote(coefOf(epreuve)))}</span>`;
  }

  function meanOf(values) {
    const vals = values.filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }

  function round2(v) {
    return v == null ? null : Math.round(v * 100) / 100;
  }

  function avgHtml({ avg, n, total }) {
    if (avg == null) return '<span class="text-zinc-400">—</span>';
    const tone = avg < 10 ? "text-red-600" : "text-emerald-700";
    const partial = total && n < total
      ? ` <span class="text-xs font-normal text-zinc-400" title="Moyenne partielle : ${n} note${n > 1 ? "s" : ""} sur ${total}">(${n}/${total})</span>`
      : "";
    return `<span class="font-semibold tabular-nums ${tone}">${esc(fmtNote(round2(avg)))}</span>${partial}`;
  }

  const NOTE_INPUT = "h-8 w-16 rounded-md border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";
  const IDENTITY_HEAD = `
    <th class="px-4 py-3 font-medium">Grade</th>
    <th class="px-3 py-3 font-medium">Nom</th>
    <th class="px-3 py-3 font-medium">Prénom</th>`;

  function identityCells(r) {
    return `
      <td class="px-4 py-2"><span class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-medium">${esc(r.grade)}</span></td>
      <td class="px-3 py-2 font-medium uppercase">${esc(r.nom)}</td>
      <td class="px-3 py-2">${esc(r.prenom)}</td>`;
  }

  const PERF_INPUT = "h-8 w-28 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-sm placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";
  const SEXE_CELL = (r) => `<td class="px-3 py-2 text-center">${esc(r.sexe)}</td>`;

  function noteInput(kind, col, r, label) {
    return `<input type="text" inputmode="decimal" autocomplete="off" class="${NOTE_INPUT}"
      data-kind="${kind}" data-col="${col}" data-sid="${esc(r.id)}" value="${esc(fmtNote(r[col]))}"
      aria-label="${esc(label)} — ${esc(r.grade)} ${esc(r.nom)} ${esc(r.prenom)}">`;
  }

  /** Note calculée, affichée sans pouvoir être modifiée. */
  function noteLue(col, r, title) {
    const v = r[col];
    return `<span data-note="${esc(col)}-${esc(r.id)}" title="${esc(title)}"
      class="inline-flex h-8 w-16 items-center justify-end rounded-md bg-zinc-50 px-2 font-semibold tabular-nums ${v == null ? "text-zinc-300" : "text-zinc-800"}">${v == null ? "—" : esc(fmtNote(v))}</span>`;
  }

  /** Tableau de saisie simple (notes pédagogiques). */
  function renderNotesTab(kind, rows) {
    const cfg = NOTES[kind];
    $(`${kind}-count`).textContent = `${rows.length} stagiaire${rows.length > 1 ? "s" : ""}`;
    $(`${kind}-head`).innerHTML = `
      <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
        ${IDENTITY_HEAD}
        ${cfg.fields.map(([f, short, label]) => `<th class="px-2 py-3 text-right font-medium" title="${esc(label)} (sur ${NOTE_MAX})">${esc(short)}${coefBadge(f)}</th>`).join("")}
        <th class="px-4 py-3 text-right font-medium">Moyenne /${NOTE_MAX}</th>
      </tr>`;

    if (!rows.length) {
      $(`${kind}-tbody`).innerHTML = emptyRow(cfg.fields.length + 4);
      $(`${kind}-foot`).innerHTML = "";
      return;
    }

    $(`${kind}-tbody`).innerHTML = rows.map((r) => `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        ${identityCells(r)}
        ${cfg.fields.map(([f, , label]) => `<td class="px-2 py-1.5 text-right">${INPUT_COLUMNS[kind] && INPUT_COLUMNS[kind][f] ? noteInput(kind, f, r, label) : noteLue(f, r, `${label} : calculée depuis l'onglet Comportement`)}</td>`).join("")}
        <td class="px-4 py-2 text-right" data-avg="${kind}-${esc(r.id)}">${avgHtml(average(r, kind))}</td>
      </tr>`).join("");
    renderNotesFoot(kind, rows);
  }

  function renderNotesFoot(kind, rows) {
    const cfg = NOTES[kind];
    const cols = cfg.fields.map(([f]) => round2(meanOf(rows.map((r) => r[f]))));
    const avg = meanOf(rows.map((r) => average(r, kind).avg));
    $(`${kind}-foot`).innerHTML = `
      <tr class="border-t border-zinc-200 bg-zinc-50">
        <td colspan="3" class="px-4 py-3 font-medium">Moyenne de la section</td>
        ${cols.map((v) => `<td class="py-3 pl-2 pr-4 text-right tabular-nums text-zinc-600">${v == null ? "—" : esc(fmtNote(v))}</td>`).join("")}
        <td class="px-4 py-3 text-right">${avgHtml({ avg })}</td>
      </tr>`;
  }

  function emptyRow(colspan) {
    return `
      <tr><td colspan="${colspan}" class="px-4 py-10 text-center text-sm text-zinc-500">
        Aucun stagiaire dans cette section. Ajoutez-en depuis l'onglet <button type="button" data-goto="stagiaires" class="font-medium text-zinc-900 underline underline-offset-4">Stagiaires</button>.
      </td></tr>`;
  }

  // ---------------------------------------------------------------------------
  // Notes physiques : une sous-page par épreuve + récapitulatif
  // ---------------------------------------------------------------------------
  function renderPhysSubtabs(dates) {
    const pill = (id, label, color, sub) => {
      const active = state.physTab === id;
      const style = active
        ? `background:${color};border-color:${color};color:#fff`
        : `border-color:#e4e4e7`;
      return `
        <button type="button" role="tab" data-phys="${id}" aria-selected="${active}" style="${style}"
          class="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium shadow-sm transition hover:opacity-90">
          ${active ? "" : `<span class="h-2.5 w-2.5 rounded-full" style="background:${color}"></span>`}
          ${esc(label)}
          ${sub ? `<span class="text-xs font-normal ${active ? "text-white/80" : "text-zinc-400"}">${esc(sub)}</span>` : ""}
        </button>`;
    };
    $("phys-subtabs").innerHTML =
      EPREUVES.map((e) => pill(e.id, e.short, e.color, dates[e.id] ? fmtDate(dates[e.id]) : "")).join("") +
      pill("recap", "Récapitulatif", "#18181b", "");
  }

  function renderPhysiques(rows) {
    const dates = getDatesEpreuves(state.activeSectionId);
    renderPhysSubtabs(dates);
    const ep = EPREUVES.find((e) => e.id === state.physTab);
    $("phys-content").innerHTML = ep ? epreuveHtml(ep, rows, dates[ep.id]) : physRecapHtml(rows);
  }

  function epreuveHtml(ep, rows, date) {
    const extras = ep.extras || [];
    const ncols = 7 + extras.length;
    const body = rows.length
      ? rows.map((r) => estExempte(r, ep.id) ? `
        <tr class="border-b border-zinc-100 bg-amber-50/40 last:border-0">
          ${identityCells(r)}
          ${SEXE_CELL(r)}
          ${exemptCell(ep, r)}
          <td colspan="${1 + extras.length}" class="px-3 py-2 text-sm text-amber-800" title="Une seule note écrite par stagiaire : elle vaut pour toutes ses épreuves exemptées">
            Exempté — note écrite (coef ${esc(fmtNote(coefOf(ep.id)))})
          </td>
          <td class="px-4 py-1.5 text-right">${noteInput("physiques", "ecrit_exemption", r, "Note écrite (exemption)")}</td>
        </tr>` : `
        <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
          ${identityCells(r)}
          ${SEXE_CELL(r)}
          ${exemptCell(ep, r)}
          <td class="px-3 py-1.5">
            <input type="text" autocomplete="off" maxlength="${PERF_MAX_LENGTH}" class="${PERF_INPUT}"
              placeholder="${uniteEpreuve(armeeKey(r.armee), ep.id) === "temps" ? "mm:ss" : "nombre"}"
              data-kind="physiques" data-col="${ep.id}_perf" data-sid="${esc(r.id)}" value="${esc(r[`${ep.id}_perf`])}"
              aria-label="Performance ${esc(ep.label)} — ${esc(r.grade)} ${esc(r.nom)} ${esc(r.prenom)}">
          </td>
          ${extras.map(([c, label]) => `<td class="px-3 py-1.5 text-right">${noteInput("physiques", c, r, label)}</td>`).join("")}
          <td class="px-4 py-1.5">
            <div class="flex items-center justify-end gap-1.5">
              <span data-ind="${esc(r.id)}">${noteIndicator(ep.id, r)}</span>
              ${noteLue(ep.id, r, "Note calculée d'après le barème")}
            </div>
          </td>
        </tr>`).join("")
      : emptyRow(ncols);

    return `
      <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-white" style="background:${ep.color}">
          <div>
            <h2 class="text-lg font-semibold tracking-tight">${esc(ep.short)}</h2>
            ${ep.short !== ep.label ? `<p class="text-sm text-white/85">${esc(ep.label)}</p>` : ""}
          </div>
          <label class="flex items-center gap-2 text-sm font-medium">
            Date de l'épreuve
            <input type="date" data-date-epreuve="${ep.id}" value="${esc(date || "")}"
              class="h-9 rounded-md border border-white/40 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
          </label>
        </div>
        <div class="flex items-center justify-end border-b border-zinc-100 px-5 py-2 text-sm text-zinc-500">
          <span>${rows.length} stagiaire${rows.length > 1 ? "s" : ""}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                ${IDENTITY_HEAD}
                <th class="px-3 py-3 text-center font-medium">Sexe</th>
                <th class="px-3 py-3 text-center font-medium" title="Exempté de l'épreuve : noté au test écrit">Exempté</th>
                <th class="px-3 py-3 font-medium">Perf</th>
                ${extras.map(([, label]) => `<th class="px-3 py-3 text-right font-medium">${esc(label)} (m)</th>`).join("")}
                <th class="px-4 py-3 text-right font-medium">Note /${NOTE_MAX}</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot id="phys-foot">${rows.length ? epreuveFootHtml(ep, rows) : ""}</tfoot>
          </table>
        </div>
      </div>`;
  }

  function epreuveFootHtml(ep, rows) {
    const extras = ep.extras || [];
    const mean = (col) => {
      const v = round2(meanOf(rows.filter((r) => !estExempte(r, ep.id)).map((r) => r[col])));
      return v == null ? "—" : esc(fmtNote(v));
    };
    return `
      <tr class="border-t border-zinc-200 bg-zinc-50">
        <td colspan="6" class="px-4 py-3 font-medium">Moyenne de la section</td>
        ${extras.map(([c]) => `<td class="py-3 pl-3 pr-4 text-right tabular-nums text-zinc-600">${mean(c)}</td>`).join("")}
        <td class="px-4 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => noteRetenue(r, ep.id))) })}</td>
      </tr>`;
  }

  function exemptCell(ep, r) {
    return `<td class="px-3 py-1.5 text-center">
      <input type="checkbox" data-exempt="${esc(ep.id)}" data-sid="${esc(r.id)}" ${estExempte(r, ep.id) ? "checked" : ""}
        class="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-amber-600" aria-label="Exempté ${esc(ep.label)} — ${esc(r.grade)} ${esc(r.nom)} ${esc(r.prenom)}">
    </td>`;
  }

  function onExemptChange(el) {
    const ep = EPREUVES.find((e) => e.id === el.dataset.exempt);
    const sid = Number(el.dataset.sid);
    if (!ep || !sid) return;
    try {
      upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", `${ep.id}_exempt`], [sid, el.checked ? 1 : 0]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    refreshAll();
    if (el.checked) {
      const r = getStagiaireAvecNotes(sid);
      toast(r && r.ecrit_exemption != null
        ? `Exempté : note écrite déjà saisie (${fmtNote(r.ecrit_exemption)}) reprise pour cette épreuve`
        : `Exempté : saisissez la note écrite sur la ligne (coefficient ${fmtNote(coefOf(ep.id))} de l'épreuve)`);
    }
  }

  // ---- Note écrite des exemptés : une seule par stagiaire, quel que soit le nombre d'épreuves exemptées
  function ecritLignes(rows) {
    return rows.map((r) => ({ r, eps: EPREUVES.filter((e) => estExempte(r, e.id)) })).filter((x) => x.eps.length);
  }

  function ecritPrintHtml(s) {
    const lignes = ecritLignes(sortRows(getStagiairesAvecNotes(s.id)));
    const body = lignes.length
      ? lignes.map(({ r, eps }, i) => `<tr><td class="ps-num">${i + 1}</td><td>${esc(r.grade)}</td><td class="ps-upper">${esc(r.nom)}</td><td>${esc(r.prenom)}</td>
          <td>${eps.map((e) => `${esc(e.label)} (×${esc(fmtNote(coefOf(e.id, s.formation)))})`).join(", ")}</td><td class="ps-r"><b>${esc(fmtNote(r.ecrit_exemption))}</b></td></tr>`).join("")
      : '<tr><td colspan="6" class="ps-empty">Aucun stagiaire exempté.</td></tr>';
    return `
      <h1>Note écrite — stagiaires exemptés</h1>
      <p class="ps-sub">${esc(s.formation)} ${esc(s.annee_scolaire)} · Moniteur : ${esc(s.moniteur)}</p>
      <table>
        <thead><tr><th class="ps-num">N°</th><th>Grade</th><th>Nom</th><th>Prénom</th><th>Épreuves exemptées (coef)</th><th class="ps-r">Note écrit /${NOTE_MAX}</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="ps-foot"><span>La note du test écrit remplace chaque épreuve exemptée, avec le coefficient de l'épreuve.</span><span>Édité le ${esc(fmtDate(todayIso()))}</span></div>`;
  }

  function physRecapHtml(rows) {
    const body = rows.length
      ? rows.map((r) => `
        <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
          ${identityCells(r)}
          ${SEXE_CELL(r)}
          ${EPREUVES.map((e) => { const n = noteRetenue(r, e.id); return `<td class="px-3 py-2.5 text-right">${estExempte(r, e.id) ? '<span class="mr-1 text-[11px] font-medium text-amber-700" title="Exempté : note du test écrit">écrit</span>' : ""}${n == null ? '<span class="text-zinc-300">—</span>' : avgHtml({ avg: n })}</td>`; }).join("")}
          <td class="px-4 py-2.5 text-right">${avgHtml(average(r, "physiques"))}</td>
        </tr>`).join("")
      : emptyRow(EPREUVES.length + 5);
    const foot = rows.length ? `
      <tr class="border-t border-zinc-200 bg-zinc-50">
        <td colspan="4" class="px-4 py-3 font-medium">Moyenne de la section</td>
        ${EPREUVES.map((e) => `<td class="px-3 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => noteRetenue(r, e.id))) })}</td>`).join("")}
        <td class="px-4 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => average(r, "physiques").avg)) })}</td>
      </tr>` : "";
    return `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4">
          <div>
            <h2 class="font-semibold tracking-tight">Récapitulatif des notes physiques</h2>
          </div>
          <p class="text-sm text-zinc-500">${rows.length} stagiaire${rows.length > 1 ? "s" : ""}</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                ${IDENTITY_HEAD}
                <th class="px-3 py-3 text-center font-medium">Sexe</th>
                ${EPREUVES.map((e) => `<th class="px-3 py-3 text-right font-medium" title="${esc(e.label)}">
                  <span class="inline-block rounded px-1.5 py-0.5 text-white" style="background:${e.color}">${esc(e.short)}</span>${coefBadge(e.id)}</th>`).join("")}
                <th class="px-4 py-3 text-right font-medium">Moyenne /${NOTE_MAX}</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
            <tfoot>${foot}</tfoot>
          </table>
        </div>
      </div>`;
  }

  /** Après une saisie : met à jour moyennes et bilan sans reconstruire les champs. */
  function refreshAverages(kind) {
    const rows = sortRows(getStagiairesAvecNotes(state.activeSectionId));
    if (kind === "physiques") {
      const ep = EPREUVES.find((e) => e.id === state.physTab);
      if (ep && $("phys-foot")) $("phys-foot").innerHTML = epreuveFootHtml(ep, rows);
    } else {
      for (const r of rows) {
        const cell = document.querySelector(`[data-avg="${kind}-${r.id}"]`);
        if (cell) cell.innerHTML = avgHtml(average(r, kind));
      }
      renderNotesFoot(kind, rows);
    }
    renderBilan(rows);
  }

  function renderBilan(rows) {
    $("bilan-count").textContent = `${rows.length} stagiaire${rows.length > 1 ? "s" : ""}`;
    if (!rows.length) {
      $("bilan-tbody").innerHTML = `
        <tr><td colspan="6" class="px-4 py-10 text-center text-sm text-zinc-500">Aucun stagiaire dans cette section.</td></tr>`;
      $("bilan-foot").innerHTML = "";
      return;
    }
    const phys = rows.map((r) => average(r, "physiques"));
    const peda = rows.map((r) => average(r, "pedagogiques"));
    const gen = rows.map((r) => averageGenerale(r));
    $("bilan-tbody").innerHTML = rows.map((r, i) => `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        ${identityCells(r)}
        <td class="px-3 py-2.5 text-right">${avgHtml(phys[i])}</td>
        <td class="px-3 py-2.5 text-right">${avgHtml(peda[i])}</td>
        <td class="px-4 py-2.5 text-right text-base">${avgHtml(gen[i])}</td>
      </tr>`).join("");
    $("bilan-foot").innerHTML = `
      <tr class="border-t border-zinc-200 bg-zinc-50">
        <td colspan="3" class="px-4 py-3 font-medium">Moyenne de la section</td>
        <td class="px-3 py-3 text-right">${avgHtml({ avg: meanOf(phys.map((a) => a.avg)) })}</td>
        <td class="px-3 py-3 text-right">${avgHtml({ avg: meanOf(peda.map((a) => a.avg)) })}</td>
        <td class="px-4 py-3 text-right">${avgHtml({ avg: meanOf(gen.map((a) => a.avg)) })}</td>
      </tr>`;
  }

  // ---------------------------------------------------------------------------
  // Notes : saisie (UPSERT immédiat + sauvegarde)
  // ---------------------------------------------------------------------------
  function setNoteInvalid(input, message) {
    input.classList.toggle("border-red-500", !!message);
    input.classList.toggle("bg-red-50", !!message);
    input.classList.toggle("border-zinc-200", !message);
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.title = message;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("title");
    }
  }

  /** Distance en mètres : nombre positif (virgule acceptée), vide = null. */
  function parseDistance(text) {
    const t = String(text).trim().replace(",", ".");
    if (!t) return { value: null };
    if (!/^\d+(\.\d+)?$/.test(t)) return { error: "Saisissez une distance en mètres (ex. 25)." };
    return { value: Math.round(Number(t) * 100) / 100 };
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


  // ---------------------------------------------------------------------------
  // Barèmes : calcul automatique des notes physiques
  // ---------------------------------------------------------------------------
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

  /** "Terre" / "Armée de Terre" → "TERRE" ; null si inconnue. */
  function armeeKey(armee) {
    const n = norm(armee);
    if (n.includes("terre")) return "TERRE";
    if (n.includes("air")) return "AIR";
    if (n.includes("mer") || n.includes("marine")) return "MER";
    return null;
  }

  /** "temps" : plus petit = meilleur (seuil maximal) ; "nombre" : plus grand = meilleur (seuil minimal). */
  function uniteEpreuve(armee, epreuve) {
    if (epreuve === "m_co" || epreuve === "aisance_aquatique") return "temps";
    if (epreuve === "ecr") return armee === "AIR" ? "nombre" : "temps"; // ECR Air noté en paliers
    return "nombre";
  }

  /** Performance saisie → { value } (secondes ou nombre), { sansNote } (inapte, absent…) ou { error }. */
  function parsePerf(text, unite) {
    const t = String(text ?? "").trim().toLowerCase();
    if (!t) return { value: null };
    if (PERF_SANS_NOTE.includes(norm(t))) return { sansNote: true };
    const nums = t.match(/\d+(?:[.,]\d+)?/g);
    if (!nums) return { error: unite === "temps" ? "Temps attendu (ex. 52:30 ou 1:02:30)." : "Nombre attendu (ex. 12)." };
    const n = nums.map((x) => Number(x.replace(",", ".")));
    if (unite === "nombre") return { value: n[0] };
    if (n.length === 2) return { value: Math.floor(n[0]) * 60 + n[1] };
    if (n.length === 3) return { value: Math.floor(n[0]) * 3600 + Math.floor(n[1]) * 60 + n[2] };
    return { error: "Temps attendu au format mm:ss ou h:mm:ss (ex. 52:30)." };
  }

  function fmtPerf(value, unite) {
    if (value == null) return "";
    if (unite !== "temps") return fmtNote(value);
    const total = Math.round(value * 100) / 100;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = Math.round((total % 60) * 100) / 100;
    const ss = (sec < 10 ? "0" : "") + String(sec).replace(".", ",");
    return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }

  /** Note d'une épreuve d'après le barème : { note, raison }. note = null si aucun calcul possible. */
  function computeNote(epId, r) {
    const perf = r[`${epId}_perf`];
    if (perf == null || String(perf).trim() === "") return { note: null, raison: null };
    const armee = armeeKey(r.armee);
    if (!armee) return { note: null, raison: "Armée du stagiaire non renseignée (fiche stagiaire)." };
    if (r.sexe !== "M" && r.sexe !== "F") return { note: null, raison: "Sexe du stagiaire non renseigné." };
    const unite = uniteEpreuve(armee, epId);
    const p = parsePerf(perf, unite);
    if (p.sansNote) return { note: null, raison: `« ${perf} » : pas de note.` };
    if (p.error) return { note: null, raison: `Performance non reconnue : ${p.error}` };

    const bareme = getBaremes(versionDeSection(r.section_id)).filter((b) => b.armee === armee && b.epreuve === epId && b.sexe === r.sexe);
    if (!bareme.length) return { note: null, raison: `Aucun barème ${armee} / ${r.sexe} pour cette épreuve.` };

    const aqua = epId === "aisance_aquatique";
    // Temps comptés à la seconde, comme dans l'Excel (34:59,6 → 34:59)
    const pv = unite === "temps" ? Math.floor(p.value) : p.value;
    // Distances non saisies = épreuve complète (plus grande distance du barème)
    const plein = (lo, hi) => Math.max(0, ...bareme.map((b) => b[hi] ?? b[lo] ?? 0));
    const nage = r.aisance_aquatique_nage ?? plein("nage_min", "nage_max");
    const apnee = r.aisance_aquatique_apnee ?? plein("apnee_min", "apnee_max");
    const dans = (v, lo, hi) => (lo == null || v >= lo) && (hi == null || v <= hi);
    const resultat = (res) => {
      const min = aqua ? plancherAisance(bareme, nage, apnee) : null;
      if (min == null || (res.note != null && res.note >= min)) return res;
      return { note: min, raison: `Distances maximales de nage et d'apnée réalisées : note minimale ${fmtNote(min)}, quel que soit le temps.` };
    };

    // 1. Intervalle « min ; max » correspondant (lecture de l'Excel)
    const exact = bareme.filter((b) => dans(pv, b.performance_min, b.performance_max)
      && (!aqua || (dans(nage, b.nage_min, b.nage_max) && dans(apnee, b.apnee_min, b.apnee_max))));
    if (exact.length) return resultat({ note: Math.max(...exact.map((b) => b.note)), raison: null });

    // 2. Entre deux intervalles ou au-delà (ex. palier 11,25) : meilleure note dont la borne est atteinte
    const atteint = (b) => (unite === "temps" ? pv <= (b.performance_max ?? b.performance) : pv >= (b.performance_min ?? b.performance))
      && (!aqua || (nage >= (b.nage_min ?? 0) && apnee >= (b.apnee_min ?? 0)));
    const notes = bareme.filter(atteint).map((b) => b.note);
    if (!notes.length) return resultat({ note: 0, raison: "Hors barème : note 0." });
    return resultat({ note: Math.max(...notes), raison: "Performance hors des intervalles du barème : note de la borne atteinte." });
  }

  /**
   * Aisance aquatique : les lignes dont la nage min = max et l'apnée min = max donnent les distances maximales
   * de l'épreuve. Les avoir toutes deux réalisées garantit, quel que soit le temps, la plus petite note
   * de ces lignes (10 en Terre et en Air). Renvoie cette note plancher, ou null si elle ne s'applique pas.
   */
  function plancherAisance(bareme, nage, apnee) {
    const pleines = bareme.filter((b) => b.nage_min != null && b.nage_min === b.nage_max && b.apnee_min != null && b.apnee_min === b.apnee_max);
    if (!pleines.length) return null;
    const nageMax = Math.max(...pleines.map((b) => b.nage_max));
    const apneeMax = Math.max(...pleines.map((b) => b.apnee_max));
    if (nage < nageMax || apnee < apneeMax) return null;
    return Math.min(...pleines.filter((b) => b.nage_max === nageMax && b.apnee_max === apneeMax).map((b) => b.note));
  }

  function noteIndicator(epId, r) {
    const calc = computeNote(epId, r);
    if (calc.raison) {
      return `<span class="cursor-help text-[11px] font-medium text-amber-600" title="${esc(calc.raison)}">⚠</span>`;
    }
    if (calc.note != null) return '<span class="text-[11px] text-zinc-400" title="Note calculée d\'après le barème">auto</span>';
    return "";
  }

  /** Recalcule la note d'une épreuve d'après le barème. Renvoie la ligne à jour. */
  function applyAutoNote(sid, epId) {
    const r = getStagiaireAvecNotes(sid);
    if (!r) return r;
    const { note } = computeNote(epId, r);
    if (note !== r[epId]) {
      upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", epId], [sid, note]);
      r[epId] = note;
    }
    return r;
  }

  /** Après un changement de barème ou de fiche stagiaire : recalcule toutes les notes automatiques. */
  function recomputeAutoNotes() {
    const rows = query(`${NOTES_SELECT} WHERE p.id IS NOT NULL`);
    let changed = 0;
    for (const r of rows) {
      for (const ep of EPREUVES) {
        if (r[`${ep.id}_perf`] == null) continue;
        const { note } = computeNote(ep.id, r);
        if (note !== r[ep.id]) {
          state.db.run(`UPDATE notes_physiques SET ${ep.id} = ? WHERE stagiaire_id = ?`, [note, r.id]);
          changed++;
        }
      }
    }
    return changed;
  }

  /** Met à jour la note affichée et son indicateur sans reconstruire le tableau (préserve le focus). */
  function updateNoteCell(sid, epId, r) {
    const zone = $("phys-content");
    const cell = zone.querySelector(`[data-note="${epId}-${sid}"]`);
    if (cell && r) cell.outerHTML = noteLue(epId, r, "Note calculée d'après le barème");
    const ind = zone.querySelector(`[data-ind="${sid}"]`);
    if (ind && r) ind.innerHTML = noteIndicator(epId, r);
  }

  /**
   * Les notes ne se modifient plus à la main : les anciennes dérogations sont supprimées
   * et les notes concernées reprennent la valeur du barème. Renvoie true si la base a changé.
   */
  function supprimerDerogations() {
    const cond = EPREUVES.map((e) => `${e.id}_manuel = 1`).join(" OR ");
    if (!query(`SELECT COUNT(*) AS n FROM notes_physiques WHERE ${cond}`)[0].n) return false;
    state.db.run(`UPDATE notes_physiques SET ${EPREUVES.map((e) => `${e.id}_manuel = 0`).join(", ")}`);
    // Sans performance, la note tapée à la main n'a pas de calcul de remplacement : elle est effacée
    for (const e of EPREUVES) state.db.run(`UPDATE notes_physiques SET ${e.id} = NULL WHERE ${e.id}_perf IS NULL OR TRIM(${e.id}_perf) = ''`);
    recomputeAutoNotes();
    return true;
  }

  function onNoteChange(event) {
    const input = event.target;
    if (!state.db) return;

    if (input.matches("input[data-date-epreuve]")) {
      const ep = EPREUVES.find((e) => e.id === input.dataset.dateEpreuve);
      if (!ep || !state.activeSectionId) return;
      try {
        upsert("dates_epreuves", ["section_id", "epreuve"], ["section_id", "epreuve", "date_epreuve"],
          [state.activeSectionId, ep.id, input.value || null]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      persist();
      renderPhysSubtabs(getDatesEpreuves(state.activeSectionId));
      return;
    }

    if (!input.matches("input[data-col]")) return;
    const kind = input.dataset.kind;
    const column = input.dataset.col;
    // Nom de colonne validé par liste blanche (jamais du texte saisi)
    const type = INPUT_COLUMNS[kind] && INPUT_COLUMNS[kind][column];
    if (!type) return;

    let value;
    if (type === "perf") {
      value = input.value.trim().slice(0, PERF_MAX_LENGTH) || null;
      input.value = value ?? "";
    } else {
      const parsed = type === "note" ? parseNote(input.value) : parseDistance(input.value);
      if (parsed.error) {
        setNoteInvalid(input, parsed.error);
        toast(parsed.error, "error");
        return;
      }
      setNoteInvalid(input, null);
      value = parsed.value;
      input.value = fmtNote(value);
    }

    const sid = Number(input.dataset.sid);
    try {
      if (kind === "physiques") {
        const ep = EPREUVES.find((e) => column === `${e.id}_perf` || (e.extras || []).some(([c]) => c === column));
        if (column === "ecrit_exemption") {
          upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
        } else {
          upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
          updateNoteCell(sid, ep.id, applyAutoNote(sid, ep.id));
        }
      } else {
        upsert(NOTES[kind].table, ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
      }
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    refreshAverages(kind);
  }

  /** Entrée / Maj+Entrée : stagiaire suivant / précédent dans la même colonne. */
  function onNoteKeydown(event) {
    const input = event.target.closest("input[data-col]");
    if (!input || event.key !== "Enter") return;
    event.preventDefault();
    const column = [...event.currentTarget.querySelectorAll(`input[data-col="${input.dataset.col}"]`)];
    const next = column[column.indexOf(input) + (event.shiftKey ? -1 : 1)];
    if (next) next.focus();
    else input.blur();
  }


  // ---------------------------------------------------------------------------
  // Onglet Barèmes : consultation et modification
  // ---------------------------------------------------------------------------
  const SELECT_CLS = "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20";
  const CELL_INPUT = "h-8 rounded-md border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";

  function options(list, selected) {
    return list.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
  }

  /** Version affichée sur les pages Barèmes et Coefficients (en vigueur par défaut). */
  function versionContexte() {
    const versions = getVersionsBaremes();
    const courante = versions[0];
    const version = versions.find((v) => v.id === state.baremeVersion) || courante;
    state.baremeVersion = version.id;
    const sectionsVersion = getSections().filter((x) => x.bareme_version_id === version.id).map((x) => sectionLabel(x));
    return { versions, courante, version, editable: version.id === courante.id, sectionsVersion };
  }

  /** Choix et nom de la version, à qui elle s'applique, suppression d'une ancienne version inutilisée. */
  function versionBlocHtml({ versions, courante, version, editable, sectionsVersion }) {
    return `
        <div class="space-y-3 border-b border-zinc-100 bg-zinc-50/60 p-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="space-y-1.5 text-sm font-medium">Version (barème et coefficients)
              <select data-bversion class="${SELECT_CLS}">
                ${versions.map((v) => `<option value="${esc(v.id)}"${v.id === version.id ? " selected" : ""}>${esc(v.libelle)}${v.id === courante.id ? " — en vigueur" : ""} (${v.nb_sections} section${v.nb_sections > 1 ? "s" : ""})</option>`).join("")}
              </select></label>
            <label class="space-y-1.5 text-sm font-medium">Nom de la version
              <input type="text" data-bversion-libelle maxlength="80" autocomplete="off" value="${esc(version.libelle)}" class="${SELECT_CLS}"></label>
          </div>
          <p class="text-sm ${editable && sectionsVersion.length ? "text-amber-700" : "text-zinc-600"}">${editable
            ? (sectionsVersion.length
              ? `Version en vigueur, utilisée par : ${esc(sectionsVersion.join(", "))}. À la première modification du barème ou des coefficients, une <b>nouvelle version</b> est créée pour les prochaines sections ; ces sections gardent celle-ci.`
              : "Version en vigueur, utilisée par aucune section : les modifications s'appliquent directement. Les nouvelles sections utiliseront cette version.")
            : `Ancienne version (consultation seule)${sectionsVersion.length ? `, utilisée par : ${esc(sectionsVersion.join(", "))}` : ", utilisée par aucune section"}. Pour changer la version d'une section, modifiez la section.`}</p>
          ${!sectionsVersion.length && versions.length > 1 ? `<button type="button" data-delete-bversion="${esc(version.id)}"
            class="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50">Supprimer cette version</button>` : ""}
        </div>`;
  }

  function renderParametres() {
    if (state.tab === "coefficients") renderCoefs();
    else renderBaremes();
  }

  /** Changement de version affichée ou de son nom (pages Barèmes et Coefficients). Renvoie true si traité. */
  function onVersionChange(el) {
    if (el.matches("[data-bversion]")) {
      state.baremeVersion = Number(el.value);
      renderParametres();
      return true;
    }
    if (!el.matches("[data-bversion-libelle]")) return false;
    const libelle = el.value.trim();
    if (libelle) {
      try {
        state.db.run("UPDATE baremes_versions SET libelle = ? WHERE id = ?", [libelle.slice(0, 80), state.baremeVersion]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return true;
      }
      persist();
    }
    renderParametres();
    return true;
  }

  /** Suppression d'une ancienne version inutilisée. Renvoie true si le clic est traité. */
  async function onVersionDelete(event) {
    const btn = event.target.closest("[data-delete-bversion]");
    if (!btn) return false;
    const id = Number(btn.dataset.deleteBversion);
    const v = getVersionsBaremes().find((x) => x.id === id);
    const versions = getVersionsBaremes();
    if (!v || v.nb_sections || versions.length < 2) return true; // une version utilisée, ou la seule restante, est conservée
    const precedente = id === versions[0].id ? versions[1] : null;
    const ok = await confirmDialog({
      title: "Supprimer cette version ?",
      message: `La version « ${v.libelle} » (barème et coefficients) n'est utilisée par aucune section. Elle sera définitivement supprimée.`
        + (precedente ? `

« ${precedente.libelle} » redeviendra la version en vigueur pour les nouvelles sections.` : ""),
    });
    if (!ok) return true;
    try {
      state.db.run("DELETE FROM baremes WHERE version_id = ?", [id]);
      state.db.run("DELETE FROM coefficients_versions WHERE version_id = ?", [id]);
      state.db.run("DELETE FROM baremes_versions WHERE id = ?", [id]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return true;
    }
    state.baremeVersion = null;
    invalidateBaremes();
    persist();
    renderParametres();
    toast("Version supprimée");
    return true;
  }

  function renderBaremes() {
    const f = state.baremeFiltre;
    const unite = uniteEpreuve(f.armee, f.epreuve);
    const aqua = f.epreuve === "aisance_aquatique";
    const ctx = versionContexte();
    const { version, editable } = ctx;
    const ro = editable ? "" : "disabled";
    const rows = getBaremes(version.id)
      .filter((b) => b.armee === f.armee && b.epreuve === f.epreuve && b.sexe === f.sexe)
      .sort((a, b) => b.note - a.note || (unite === "temps" ? a.performance - b.performance : b.performance - a.performance)
        || (b.nage_min ?? 0) - (a.nage_min ?? 0) || (b.apnee_min ?? 0) - (a.apnee_min ?? 0) || a.id - b.id);
    const cell = (b, col, value, label, w) => `
        <td class="px-1.5 py-1.5 text-right">
          <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} ${w} disabled:bg-zinc-50 disabled:text-zinc-500" data-bid="${esc(b.id)}" data-bcol="${col}"
            value="${esc(value)}" placeholder="—" aria-label="${esc(label)}">
        </td>`;

    const body = rows.length ? rows.map((b) => `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        ${cell(b, "performance_min", fmtPerf(b.performance_min, unite), "Performance minimale", "w-24")}
        ${cell(b, "performance_max", fmtPerf(b.performance_max, unite), "Performance maximale", "w-24")}
        ${aqua ? `
        ${cell(b, "nage_min", fmtNote(b.nage_min), "Distance de nage minimale", "w-16")}
        ${cell(b, "nage_max", fmtNote(b.nage_max), "Distance de nage maximale", "w-16")}
        ${cell(b, "apnee_min", fmtNote(b.apnee_min), "Distance d'apnée minimale", "w-16")}
        ${cell(b, "apnee_max", fmtNote(b.apnee_max), "Distance d'apnée maximale", "w-16")}` : ""}
        <td class="px-3 py-1.5 text-right">
          <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} w-16 disabled:bg-zinc-50 disabled:text-zinc-500" data-bid="${esc(b.id)}" data-bcol="note"
            value="${esc(fmtNote(b.note))}" aria-label="Note sur 20">
        </td>
        <td class="px-4 py-1.5 text-right">
          ${editable ? `<button type="button" data-delete-bareme="${esc(b.id)}" class="${BTN_ICON_DANGER}" title="Supprimer cette ligne" aria-label="Supprimer cette ligne">${ICON_TRASH}</button>` : ""}
        </td>
      </tr>`).join("")
      : `<tr><td colspan="${aqua ? 8 : 4}" class="px-4 py-10 text-center text-sm text-zinc-500">Aucune ligne pour cette sélection. Utilisez « Ajouter une ligne ».</td></tr>`;

    $("baremes-panel").innerHTML = `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <h2 class="font-semibold tracking-tight">Configuration des barèmes</h2>
          </div>
          ${editable ? `<button type="button" id="btn-reset-baremes"
            class="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            Réinitialiser aux barèmes par défaut (Excel)
          </button>` : ""}
        </div>
        ${versionBlocHtml(ctx)}
        <div class="grid gap-3 border-b border-zinc-100 p-5 sm:grid-cols-3">
          <label class="space-y-1.5 text-sm font-medium">Armée
            <select data-bfilter="armee" class="${SELECT_CLS}">${options(ARMEES_BAREME, f.armee)}</select></label>
          <label class="space-y-1.5 text-sm font-medium">Épreuve
            <select data-bfilter="epreuve" class="${SELECT_CLS}">${options(EPREUVES.map((e) => [e.id, `${e.short}${e.short !== e.label ? ` — ${e.label}` : ""}`]), f.epreuve)}</select></label>
          <label class="space-y-1.5 text-sm font-medium">Sexe
            <select data-bfilter="sexe" class="${SELECT_CLS}">${options([["M", "Hommes (M)"], ["F", "Femmes (F)"]], f.sexe)}</select></label>
        </div>
        <div class="flex items-center justify-end px-5 py-3 text-sm text-zinc-500">
          <span>${rows.length} ligne${rows.length > 1 ? "s" : ""}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-y border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th class="px-1.5 py-3 text-right font-medium">${unite === "temps" ? "Temps" : "Perf."} min</th>
                <th class="px-1.5 py-3 text-right font-medium">${unite === "temps" ? "Temps" : "Perf."} max</th>
                ${aqua ? `<th class="px-1.5 py-3 text-right font-medium">Nage min (m)</th><th class="px-1.5 py-3 text-right font-medium">Nage max (m)</th>
                <th class="px-1.5 py-3 text-right font-medium">Apnée min (m)</th><th class="px-1.5 py-3 text-right font-medium">Apnée max (m)</th>` : ""}
                <th class="px-3 py-3 text-right font-medium">Note /${NOTE_MAX}</th>
                <th class="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 p-4" ${editable ? "" : "hidden"}>
          <button type="button" id="btn-add-bareme"
            class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter une ligne
          </button>
        </div>
      </div>`;
  }


  // ---------------------------------------------------------------------------
  // Onglet Barèmes & coefficients : tableau des coefficients CT1 / CT2
  // ---------------------------------------------------------------------------
  function renderCoefs() {
    const ctx = versionContexte();
    const vid = ctx.version.id;
    const ro = ctx.editable ? "" : "disabled";
    const ligne = (ep, label, color) => `
      <tr class="border-b border-zinc-100 last:border-0">
        <td class="px-5 py-2">
          <span class="flex items-center gap-2">
            ${color ? `<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${color}"></span>` : '<span class="h-2.5 w-2.5 shrink-0"></span>'}
            <span class="font-medium">${esc(label)}</span>
          </span>
        </td>
        ${FORMATIONS.map((f) => `
        <td class="px-3 py-1.5 text-right">
          <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} w-20 disabled:bg-zinc-50 disabled:text-zinc-500"
            data-coef-formation="${esc(f)}" data-coef-epreuve="${esc(ep)}" value="${esc(fmtNote(coefOf(ep, f, vid)))}"
            aria-label="Coefficient ${esc(f)} — ${esc(label)}">
        </td>`).join("")}
      </tr>`;
    const groupe = (titre) => `
      <tr class="bg-zinc-50"><td colspan="${FORMATIONS.length + 1}" class="px-5 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">${titre}</td></tr>`;
    const total = (fields) => FORMATIONS.map((f) => fmtNote(round2(fields.reduce((n, ep) => n + coefOf(ep, f, vid), 0))));
    const physIds = EPREUVES.map((e) => e.id);
    const pedaIds = NOTES.pedagogiques.fields.map(([f]) => f);

    $("coefs-panel").innerHTML = `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <h2 class="font-semibold tracking-tight">Coefficients</h2>
          </div>
          ${ctx.editable ? `<button type="button" id="btn-reset-coefs"
            class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            Coefficients par défaut (Excel)
          </button>` : ""}
        </div>
        ${versionBlocHtml(ctx)}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th class="px-5 py-3 font-medium">Épreuve</th>
                ${FORMATIONS.map((f) => `<th class="px-3 py-3 text-right font-medium">${esc(f)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${groupe("Notes physiques (CCPG)")}
              ${EPREUVES.map((e) => ligne(e.id, e.short !== e.label ? `${e.short} — ${e.label}` : e.label, e.color)).join("")}
              ${groupe("Notes pédagogiques")}
              ${NOTES.pedagogiques.fields.map(([f, , label]) => ligne(f, label, null)).join("")}
            </tbody>
            <tfoot>
              <tr class="border-t border-zinc-200 bg-zinc-50 text-zinc-600">
                <td class="px-5 py-2.5">Total physique / pédagogique</td>
                ${FORMATIONS.map((f, i) => `<td class="px-3 py-2.5 text-right tabular-nums" data-coef-total="${esc(f)}">${esc(total(physIds)[i])} / ${esc(total(pedaIds)[i])}</td>`).join("")}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }

  /** Après un changement de coefficient. Les autres pages se recalculent à l'affichage. */
  function afterCoefChange(full) {
    invalidateBaremes();
    persist();
    if (full) {
      renderCoefs();
      return;
    }
    // Saisie case par case : seuls les totaux changent (le focus reste sur la case suivante)
    const sum = (ids, f) => fmtNote(round2(ids.reduce((n, ep) => n + coefOf(ep, f, state.baremeVersion), 0)));
    const physIds = EPREUVES.map((e) => e.id);
    const pedaIds = NOTES.pedagogiques.fields.map(([f]) => f);
    for (const f of FORMATIONS) {
      const cell = $("coefs-panel").querySelector(`[data-coef-total="${f}"]`);
      if (cell) cell.textContent = `${sum(physIds, f)} / ${sum(pedaIds, f)}`;
    }
  }

  function onCoefChange(event) {
    const el = event.target;
    if (!state.db) return;
    if (onVersionChange(el)) return;
    if (!el.matches("[data-coef-formation][data-coef-epreuve]") || state.baremeVersion !== versionCourante()) return;
    const formation = el.dataset.coefFormation;
    const epreuve = el.dataset.coefEpreuve;
    if (!FORMATIONS.includes(formation) || !(epreuve in COEFS_DEFAUT)) return;
    const t = el.value.trim().replace(",", ".");
    const n = Number(t);
    if (!t || !/^\d+(\.\d+)?$/.test(t) || n > COEF_MAX) {
      setNoteInvalid(el, `Coefficient attendu entre 0 et ${COEF_MAX}.`);
      toast(`Coefficient attendu entre 0 et ${COEF_MAX}.`, "error");
      return;
    }
    setNoteInvalid(el, null);
    let copie;
    try {
      copie = versionPourModifier();
      upsert("coefficients_versions", ["version_id", "formation", "epreuve"], ["version_id", "formation", "epreuve", "coef"],
        [copie.versionId, formation, epreuve, Math.round(n * 100) / 100]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    el.value = fmtNote(Math.round(n * 100) / 100);
    afterCoefChange(!!copie.map); // nouvelle version : page réaffichée
  }

  async function onCoefClick(event) {
    if (!state.db || await onVersionDelete(event) || !event.target.closest("#btn-reset-coefs")) return;
    const ok = await confirmDialog({
      title: "Rétablir les coefficients ?",
      message: "Les coefficients CT1 et CT2 de la version en vigueur reprendront les valeurs du fichier Excel (M-CO 2, autres épreuves 1, notes pédagogiques 1). Si cette version est déjà utilisée par des sections, elles gardent leurs coefficients et une nouvelle version est créée.",
      confirmLabel: "Rétablir",
    });
    if (!ok) return;
    try {
      const { versionId } = versionPourModifier();
      for (const f of FORMATIONS) {
        for (const [ep, c] of Object.entries(COEFS_DEFAUT)) {
          state.db.run("INSERT OR REPLACE INTO coefficients_versions (version_id, formation, epreuve, coef) VALUES (?, ?, ?, ?)", [versionId, f, ep, c]);
        }
      }
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    afterCoefChange(true);
    toast("Coefficients par défaut rétablis");
  }

  /** Après une modification de barème : recalcul des notes, sauvegarde, rafraîchissement. */
  function afterBaremeChange(rerender) {
    invalidateBaremes();
    recomputeAutoNotes();
    persist();
    if (rerender) renderBaremes();
  }

  function onBaremeChange(event) {
    const el = event.target;
    if (!state.db) return;

    if (onVersionChange(el)) return;
    if (el.matches("[data-bfilter]")) {
      const key = el.dataset.bfilter;
      state.baremeFiltre[key] = el.value;
      lsSet(`bf.${key}`, el.value);
      renderBaremes();
      return;
    }
    if (!el.matches("[data-bid][data-bcol]")) return;

    const id = Number(el.dataset.bid);
    const col = el.dataset.bcol;
    const f = state.baremeFiltre;
    const unite = uniteEpreuve(f.armee, f.epreuve);
    let parsed;
    if (col === "performance_min" || col === "performance_max") {
      parsed = parsePerf(el.value, unite);
      if (parsed.sansNote) parsed = { error: "Valeur numérique attendue." };
    } else if (col === "note") {
      parsed = parseNote(el.value);
      if (parsed.value == null && !parsed.error) parsed = { error: "La note est obligatoire." };
    } else if (["nage_min", "nage_max", "apnee_min", "apnee_max"].includes(col)) {
      parsed = parseDistance(el.value);
    } else {
      return;
    }
    if (parsed.error) {
      setNoteInvalid(el, parsed.error);
      toast(parsed.error, "error");
      return;
    }
    // Contrôle de l'intervalle complet (min ≤ max, au moins une borne de performance)
    const ligne = getBaremes().find((x) => x.id === id);
    if (!ligne || ligne.version_id !== versionCourante()) return; // anciens barèmes : consultation seule
    const b = { ...ligne, [col]: parsed.value };
    const paires = [["performance_min", "performance_max", "performance"], ["nage_min", "nage_max", "nage"], ["apnee_min", "apnee_max", "apnée"]];
    let erreur = null;
    if (b.performance_min == null && b.performance_max == null) erreur = "Renseignez au moins une borne de performance.";
    for (const [lo, hi, nom] of paires) if (b[lo] != null && b[hi] != null && b[lo] > b[hi]) erreur = `Le minimum de ${nom} doit être inférieur ou égal au maximum.`;
    if (erreur) {
      setNoteInvalid(el, erreur);
      toast(erreur, "error");
      return;
    }
    setNoteInvalid(el, null);

    let copie;
    try {
      copie = versionPourModifier();
      // col provient de la liste ci-dessus (jamais du texte saisi) ; colonnes de compatibilité recalculées
      state.db.run(`UPDATE baremes SET ${col} = ?, performance = ?, distance_nage = ?, distance_apnee = ? WHERE id = ?`,
        [parsed.value, seuilDeduit(b.armee, b.epreuve, b.performance_min, b.performance_max), b.nage_min, b.apnee_min, copie.map ? copie.map.get(id) : id]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    if (col === "performance_min" || col === "performance_max") el.value = fmtPerf(parsed.value, unite);
    else el.value = fmtNote(parsed.value);
    afterBaremeChange(!!copie.map); // copie : nouveaux id de lignes à réafficher
  }

  async function onBaremeClick(event) {
    if (!state.db) return;
    const f = state.baremeFiltre;

    if (event.target.closest("#btn-add-bareme")) {
      const aqua = f.epreuve === "aisance_aquatique";
      try {
        const { versionId } = versionPourModifier();
        state.db.run(`INSERT INTO baremes (version_id, armee, epreuve, sexe, tranche_age, performance_min, performance_max, note,
            nage_min, nage_max, apnee_min, apnee_max, performance, distance_nage, distance_apnee)
          VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, 0, ?, ?)`,
          [versionId, f.armee, f.epreuve, f.sexe, "Toutes", ...(aqua ? [0, 0, 0, 0, 0, 0] : [null, null, null, null, null, null])]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      const id = query("SELECT last_insert_rowid() AS id")[0].id;
      afterBaremeChange(true);
      const input = $("baremes-panel").querySelector(`input[data-bid="${id}"][data-bcol="performance_min"]`);
      if (input) { input.focus(); input.select(); }
      toast("Ligne ajoutée : renseignez l'intervalle et la note");
      return;
    }

    const del = event.target.closest("[data-delete-bareme]");
    if (del) {
      const id = Number(del.dataset.deleteBareme);
      const b = getBaremes().find((x) => x.id === id);
      if (!b || b.version_id !== versionCourante()) return;
      const ok = await confirmDialog({
        title: "Supprimer cette ligne ?",
        message: `${fmtPerf(b.performance_min, uniteEpreuve(b.armee, b.epreuve)) || "…"} ; ${fmtPerf(b.performance_max, uniteEpreuve(b.armee, b.epreuve)) || "…"} → note ${fmtNote(b.note)} (${b.armee}, ${b.sexe}). Les notes automatiques seront recalculées.`,
      });
      if (!ok) return;
      try {
        const { map } = versionPourModifier();
        state.db.run("DELETE FROM baremes WHERE id = ?", [map ? map.get(id) : id]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      afterBaremeChange(true);
      toast("Ligne supprimée");
      return;
    }

    if (event.target.closest("#btn-reset-baremes")) {
      const ok = await confirmDialog({
        title: "Réinitialiser les barèmes ?",
        message: `Le barème en vigueur (armées, épreuves, sexes) sera remplacé par les ${window.BAREMES_DEFAUT ? window.BAREMES_DEFAUT.length : ""} lignes d'origine du fichier Excel. S'il est déjà utilisé par des sections, elles gardent leur barème actuel et un nouveau barème est créé pour les prochaines sections.`,
        confirmLabel: "Réinitialiser",
      });
      if (!ok) return;
      try {
        const { versionId } = versionPourModifier();
        state.db.run("DELETE FROM baremes WHERE version_id = ?", [versionId]);
        insertBaremesDefaut(state.db, versionId);
      } catch (e) {
        toast(`Réinitialisation impossible : ${errMsg(e)}`, "error");
        return;
      }
      afterBaremeChange(true);
      toast("Barèmes par défaut rétablis");
      return;
    }

    await onVersionDelete(event);
  }

  // ---------------------------------------------------------------------------
  // Barèmes & coefficients : échange entre moniteurs (fichier .json)
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Sections : formulaire
  // ---------------------------------------------------------------------------
  function sectionFormError(message) {
    $("section-form-error").textContent = message || "";
    $("section-form-error").hidden = !message;
  }

  /** Liste des barèmes du formulaire de section (le barème en vigueur par défaut). */
  function fillBaremeSelect(selectedId) {
    if (!state.db) return;
    const versions = getVersionsBaremes();
    const cur = versions.length ? versions[0].id : null;
    $("sf-bareme").innerHTML = versions.map((v) =>
      `<option value="${esc(v.id)}"${v.id === (selectedId ?? cur) ? " selected" : ""}>${esc(v.libelle)}${v.id === cur ? " (en vigueur)" : ""}</option>`).join("");
  }

  function resetSectionForm() {
    state.editingSectionId = null;
    $("section-form").reset();
    fillBaremeSelect(null);
    sectionFormError("");
    $("section-form-title").textContent = "Nouvelle section";
    $("section-form-submit").querySelector("span").textContent = "Ajouter la section";
    $("section-form-cancel").hidden = true;
  }

  function startEditSection(id) {
    const s = getSection(id);
    if (!s) return;
    state.editingSectionId = id;
    setSelectValue($("sf-formation"), s.formation);
    $("sf-annee").value = s.annee_scolaire;
    $("sf-debut").value = s.date_debut || "";
    $("sf-fin").value = s.date_fin || "";
    $("sf-moniteur").value = s.moniteur;
    fillBaremeSelect(s.bareme_version_id);
    sectionFormError("");
    $("section-form-title").textContent = "Modifier la section";
    $("section-form-submit").querySelector("span").textContent = "Mettre à jour";
    $("section-form-cancel").hidden = false;
    refreshAll();
    $("sf-formation").focus();
  }

  function onSectionSubmit(event) {
    event.preventDefault();
    const v = {
      formation: $("sf-formation").value,
      annee: $("sf-annee").value.trim(),
      debut: $("sf-debut").value || null,
      fin: $("sf-fin").value || null,
      moniteur: $("sf-moniteur").value.trim(),
      bareme: Number($("sf-bareme").value) || versionCourante(),
    };

    if (!v.formation) return sectionFormError("La formation est obligatoire."), $("sf-formation").focus();
    if (!/^\d{4}$/.test(v.annee)) return sectionFormError("L'année scolaire doit être une année sur 4 chiffres (ex. 2026)."), $("sf-annee").focus();
    if (v.debut && v.fin && v.fin < v.debut) return sectionFormError("La date de fin doit être postérieure à la date de début."), $("sf-fin").focus();
    if (!v.moniteur) return sectionFormError("Le moniteur est obligatoire."), $("sf-moniteur").focus();

    const params = [v.formation, v.annee, v.debut, v.fin, v.moniteur, v.bareme];
    if (state.editingSectionId) {
      const avant = getSection(state.editingSectionId);
      if (mutate("UPDATE sections SET formation = ?, annee_scolaire = ?, date_debut = ?, date_fin = ?, moniteur = ?, bareme_version_id = ? WHERE id = ?",
        [...params, state.editingSectionId])) {
        // Changement de barème : notes de la section recalculées
        if (avant && avant.bareme_version_id !== v.bareme) {
          sectionVersionCache = null;
          recomputeAutoNotes();
          persist();
        }
        toast(avant && avant.bareme_version_id !== v.bareme ? "Section mise à jour : notes recalculées avec le barème choisi" : "Section mise à jour");
        resetSectionForm();
        refreshAll();
      }
    } else {
      const res = mutate("INSERT INTO sections (formation, annee_scolaire, date_debut, date_fin, moniteur, bareme_version_id) VALUES (?, ?, ?, ?, ?, ?)", params);
      if (!res) return;
      state.activeSectionId = res.id || state.activeSectionId;
      lsSet("activeSection", state.activeSectionId);
      toast("Section ajoutée");
      resetSectionForm();
      refreshAll();
    }
  }

  async function deleteSection(id) {
    const s = getSection(id);
    if (!s) return;
    const extra = s.nb > 0
      ? ` Les ${s.nb} stagiaire${s.nb > 1 ? "s" : ""} rattaché${s.nb > 1 ? "s" : ""} ${s.nb > 1 ? "seront" : "sera"} également supprimé${s.nb > 1 ? "s" : ""}.`
      : "";
    const ok = await confirmDialog({
      title: "Supprimer la section ?",
      message: `La section ${sectionLabel(s)} sera définitivement supprimée.${extra}`,
    });
    if (!ok) return;
    if (mutate("DELETE FROM sections WHERE id = ?", [id])) {
      if (state.editingSectionId === id) resetSectionForm();
      toast("Section supprimée");
    }
  }

  // ---------------------------------------------------------------------------
  // Stagiaires : modale d'ajout / édition
  // ---------------------------------------------------------------------------
  function fillSelect(select, values, placeholder) {
    select.innerHTML = `<option value="">${esc(placeholder)}</option>` +
      values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  }

  /** Sélectionne une valeur, en l'ajoutant si elle provient d'anciennes données hors liste. */
  function setSelectValue(select, value) {
    const v = value ?? "";
    if (v && ![...select.options].some((o) => o.value === v)) {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    }
    select.value = v;
  }

  let lastFocus = null;

  function openStagiaireModal(id) {
    const sections = getSections();
    if (!sections.length) return;
    lastFocus = document.activeElement;
    state.editingStagiaireId = id || null;

    const form = $("stagiaire-form");
    form.reset();
    fillSelect($("st-armee"), ARMEES, "— Non renseignée —");
    fillSelect($("st-origine"), ORIGINES, "— Non renseignée —");
    $("st-naissance").max = todayIso();
    $("st-vm").max = todayIso();
    $("stagiaire-form-error").hidden = true;

    let sectionId = state.activeSectionId;
    if (id) {
      const r = query("SELECT * FROM stagiaires WHERE id = ?", [id])[0];
      if (!r) return;
      sectionId = r.section_id;
      $("st-grade").value = r.grade;
      $("st-nom").value = r.nom;
      $("st-prenom").value = r.prenom;
      setSelectValue($("st-armee"), r.armee);
      setSelectValue($("st-origine"), r.origine_recrutement);
      setSelectValue($("st-sexe"), r.sexe);
      $("st-naissance").value = r.date_naissance || "";
      $("st-vm").value = r.derniere_visite_medicale || "";
      $("stagiaire-modal-title").textContent = `Modifier — ${r.grade} ${r.nom.toUpperCase()} ${r.prenom}`;
    } else {
      $("stagiaire-modal-title").textContent = "Ajouter un stagiaire";
    }
    renderSectionOptions($("st-section"), sections, sectionId);

    $("stagiaire-modal").hidden = false;
    $("st-grade").focus();
  }

  function closeStagiaireModal() {
    $("stagiaire-modal").hidden = true;
    state.editingStagiaireId = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function stagiaireError(message, field) {
    $("stagiaire-form-error").textContent = message;
    $("stagiaire-form-error").hidden = false;
    if (field) $(field).focus();
  }

  function onStagiaireSubmit(event) {
    event.preventDefault();
    const v = {
      section_id: Number($("st-section").value),
      grade: $("st-grade").value.trim().toUpperCase(),
      nom: $("st-nom").value.trim().toUpperCase(),
      prenom: $("st-prenom").value.trim(),
      armee: $("st-armee").value || null,
      origine: $("st-origine").value || null,
      sexe: $("st-sexe").value,
      naissance: $("st-naissance").value || null,
      vm: $("st-vm").value || null,
    };

    if (!v.section_id) return stagiaireError("Choisissez une section.", "st-section");
    if (!v.grade) return stagiaireError("Le grade est obligatoire.", "st-grade");
    if (!v.nom) return stagiaireError("Le nom est obligatoire.", "st-nom");
    if (!v.prenom) return stagiaireError("Le prénom est obligatoire.", "st-prenom");
    if (v.sexe !== "M" && v.sexe !== "F") return stagiaireError("Le sexe est obligatoire (M ou F).", "st-sexe");
    if (v.naissance && v.naissance > todayIso()) return stagiaireError("La date de naissance ne peut pas être dans le futur.", "st-naissance");
    if (v.vm && v.vm > todayIso()) return stagiaireError("La date de visite médicale ne peut pas être dans le futur.", "st-vm");

    const params = [v.section_id, v.grade, v.nom, v.prenom, v.armee, v.origine, v.sexe, v.naissance, v.vm];
    const editing = state.editingStagiaireId;
    const ok = editing
      ? mutate(`UPDATE stagiaires SET section_id = ?, grade = ?, nom = ?, prenom = ?, armee = ?, origine_recrutement = ?,
                 sexe = ?, date_naissance = ?, derniere_visite_medicale = ? WHERE id = ?`, [...params, editing])
      : mutate(`INSERT INTO stagiaires (section_id, grade, nom, prenom, armee, origine_recrutement, sexe, date_naissance, derniere_visite_medicale)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, params);
    if (!ok) return;

    closeStagiaireModal();
    if (editing && recomputeAutoNotes()) {
      persist();
      refreshAll();
    }
    toast(editing ? "Stagiaire mis à jour" : "Stagiaire ajouté");
    if (v.section_id !== state.activeSectionId) {
      const target = getSection(v.section_id);
      toast(`Rattaché à la section ${target ? sectionLabel(target) : ""}`);
    }
  }

  async function deleteStagiaire(id) {
    const r = query("SELECT * FROM stagiaires WHERE id = ?", [id])[0];
    if (!r) return;
    const ok = await confirmDialog({
      title: "Supprimer le stagiaire ?",
      message: `${r.grade} ${r.nom.toUpperCase()} ${r.prenom} sera définitivement retiré de la section.`,
    });
    if (ok && mutate("DELETE FROM stagiaires WHERE id = ?", [id])) toast("Stagiaire supprimé");
  }

  // ---------------------------------------------------------------------------
  // Modale de confirmation
  // ---------------------------------------------------------------------------
  let confirmResolve = null;

  function confirmDialog({ title, message, confirmLabel = "Supprimer" }) {
    if (confirmResolve) confirmResolve(false);
    $("confirm-title").textContent = title;
    $("confirm-message").textContent = message;
    $("confirm-ok").textContent = confirmLabel;
    const prevFocus = document.activeElement;
    $("confirm-modal").hidden = false;
    $("confirm-cancel").focus();
    return new Promise((resolve) => {
      confirmResolve = (value) => {
        confirmResolve = null;
        $("confirm-modal").hidden = true;
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
        resolve(value);
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Impression
  // ---------------------------------------------------------------------------
  /** Construit la feuille, attend ses images (logo, signature) puis ouvre l'impression. */
  async function printSheet() {
    if (!buildPrintSheet()) return;
    const imgs = [...$("print-sheet").querySelectorAll("img")].filter((img) => !img.complete);
    await Promise.all(imgs.map((img) => new Promise((resolve) => { img.onload = img.onerror = resolve; })));
    window.print();
  }

  function buildPrintSheet() {
    const sheet = $("print-sheet");
    const s = state.db && getSection(state.activeSectionId);
    if (!s) { sheet.innerHTML = ""; return false; }
    if (state.tab === "fiches") {
      sheet.innerHTML = state.printFiches ? fichesPrintHtml(s, state.printFiches, state.printExemplaires) : fichePrintHtml(s);
      return true;
    }
    if (state.tab === "edt") {
      sheet.innerHTML = edtPrintHtml(s);
      return true;
    }
    if (state.tab === "releve") {
      sheet.innerHTML = relevePrintHtml(s);
      return true;
    }
    // Saisie des notes : toutes les notes de la section en un seul document
    if (["physiques", "pedagogiques", "bilan"].includes(state.tab)) {
      sheet.innerHTML = toutesNotesPrintHtml(s);
      return true;
    }

    sheet.innerHTML = notesPrintHtml(s, "liste", null);
    return true;
  }

  /**
   * Toutes les notes : chaque épreuve physique, le récapitulatif physique, les notes pédagogiques,
   * la note écrite des exemptés et les moyennes, chacun sur une nouvelle page.
   */
  function toutesNotesPrintHtml(s) {
    const parties = [
      ...EPREUVES.map((ep) => notesPrintHtml(s, "physiques", ep)),
      notesPrintHtml(s, "physiques", null),
      notesPrintHtml(s, "pedagogiques", null),
      ecritPrintHtml(s),
      notesPrintHtml(s, "bilan", null),
    ];
    return parties.map((html, i) => `<div class="${i > 0 ? "ps-page-break" : ""}">${html}</div>`).join("");
  }

  /** Une feuille de notes : kind « liste », « physiques » (ep = épreuve, null = récapitulatif), « pedagogiques » ou « bilan ». */
  function notesPrintHtml(s, kind, ep) {
    let extraInfo = "";
    const rows = sortRows(getStagiairesAvecNotes(s.id));
    const nbF = rows.filter((r) => r.sexe === "F").length;
    const num = (v) => esc(fmtNote(round2(v)));
    const identity = (r, i) => `<td class="ps-num">${i + 1}</td><td>${esc(r.grade)}</td><td class="ps-upper">${esc(r.nom)}</td><td>${esc(r.prenom)}</td>`;
    const identityHead = '<th class="ps-num">N°</th><th>Grade</th><th>Nom</th><th>Prénom</th>';

    let subtitle, head, body, cols;
    let foot = "";
    if (kind === "liste") {
      subtitle = "Fiche de section";
      cols = 9;
      head = `${identityHead}<th>Armée</th><th>Origine de recrutement</th><th>Sexe</th><th>Date de naissance</th><th>Dernière visite médicale</th>`;
      body = rows.map((r, i) => `
        <tr>${identity(r, i)}
          <td>${esc(r.armee)}</td><td>${esc(r.origine_recrutement)}</td><td>${esc(r.sexe)}</td>
          <td>${esc(fmtDate(r.date_naissance))}</td><td>${esc(fmtDate(r.derniere_visite_medicale))}</td>
        </tr>`).join("");
    } else if (kind === "bilan") {
      subtitle = "Moyenne";
      cols = 7;
      const phys = rows.map((r) => average(r, "physiques").avg);
      const peda = rows.map((r) => average(r, "pedagogiques").avg);
      const gen = rows.map((r) => averageGenerale(r).avg);
      head = `${identityHead}<th class="ps-r">Moyenne physique /${NOTE_MAX}</th><th class="ps-r">Moyenne pédagogique /${NOTE_MAX}</th><th class="ps-r">Moyenne E²PMS /${NOTE_MAX}</th>`;
      body = rows.map((r, i) => `<tr>${identity(r, i)}<td class="ps-r">${num(phys[i])}</td><td class="ps-r">${num(peda[i])}</td><td class="ps-r"><b>${num(gen[i])}</b></td></tr>`).join("");
      foot = `<tr><td colspan="4">Moyenne de la section</td><td class="ps-r">${num(meanOf(phys))}</td><td class="ps-r">${num(meanOf(peda))}</td><td class="ps-r">${num(meanOf(gen))}</td></tr>`;
    } else if (ep) {
      const extras = ep.extras || [];
      const date = getDatesEpreuves(s.id)[ep.id];
      subtitle = `Notes physiques — ${ep.label}${ep.short !== ep.label ? ` (${ep.short})` : ""}`;
      extraInfo = `<div><dt>Date de l'épreuve</dt><dd>${esc(fmtDate(date)) || "—"}</dd></div>`;
      cols = 7 + extras.length;
      head = `${identityHead}<th class="ps-c">Sexe</th><th>Perf</th>${extras.map(([, label]) => `<th class="ps-r">${esc(label)} (m)</th>`).join("")}<th class="ps-r">Note /${NOTE_MAX}</th>`;
      body = rows.map((r, i) => estExempte(r, ep.id)
        ? `<tr>${identity(r, i)}<td class="ps-c">${esc(r.sexe)}</td><td>Exempté (test écrit)</td>${extras.map(() => "<td></td>").join("")}<td class="ps-r"><b>${num(noteRetenue(r, ep.id))}</b></td></tr>`
        : `<tr>${identity(r, i)}<td class="ps-c">${esc(r.sexe)}</td><td>${esc(r[`${ep.id}_perf`])}</td>${extras.map(([c]) => `<td class="ps-r">${num(r[c])}</td>`).join("")}<td class="ps-r"><b>${num(r[ep.id])}</b></td></tr>`).join("");
      foot = `<tr><td colspan="6">Moyenne de la section</td>${extras.map(([c]) => `<td class="ps-r">${num(meanOf(rows.filter((r) => !estExempte(r, ep.id)).map((r) => r[c])))}</td>`).join("")}<td class="ps-r">${num(meanOf(rows.map((r) => noteRetenue(r, ep.id))))}</td></tr>`;
    } else {
      const cfg = NOTES[kind];
      subtitle = kind === "physiques" ? "Notes physiques — Récapitulatif" : cfg.title;
      cols = cfg.fields.length + 5;
      head = `${identityHead}${cfg.fields.map(([, , label]) => `<th class="ps-r">${esc(label)}</th>`).join("")}<th class="ps-r">Moyenne /${NOTE_MAX}</th>`;
      body = rows.map((r, i) => `<tr>${identity(r, i)}${cfg.fields.map(([f]) => `<td class="ps-r">${estExempte(r, f) ? "<small>écrit</small> " : ""}${num(noteRetenue(r, f))}</td>`).join("")}<td class="ps-r"><b>${num(average(r, kind).avg)}</b></td></tr>`).join("");
      foot = `<tr><td colspan="4">Moyenne de la section</td>${cfg.fields.map(([f]) => `<td class="ps-r">${num(meanOf(rows.map((r) => noteRetenue(r, f))))}</td>`).join("")}<td class="ps-r">${num(meanOf(rows.map((r) => average(r, kind).avg)))}</td></tr>`;
    }
    if (!rows.length) {
      body = `<tr><td colspan="${cols}" class="ps-empty">Aucun stagiaire enregistré.</td></tr>`;
      foot = "";
    }

    return `
      <h1>Contrôle de la Condition Physique Générale</h1>
      <p class="ps-sub">${esc(subtitle)} — ${esc(s.formation)} ${esc(s.annee_scolaire)}</p>
      <dl class="ps-info${extraInfo ? " ps-6" : ""}">
        <div><dt>Formation</dt><dd>${esc(s.formation)}</dd></div>
        <div><dt>Année scolaire</dt><dd>${esc(s.annee_scolaire)}</dd></div>
        <div><dt>Période de stage</dt><dd>${esc(periodLabel(s)) || "—"}</dd></div>
        <div><dt>Moniteur</dt><dd>${esc(s.moniteur)}</dd></div>
        <div><dt>Effectif</dt><dd>${rows.length} (${rows.length - nbF} H / ${nbF} F)</dd></div>
        ${extraInfo}
      </dl>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        ${foot ? `<tfoot>${foot}</tfoot>` : ""}
      </table>
      <div class="ps-foot">
        <span>Moniteur : ${esc(s.moniteur)}</span>
        <span>Édité le ${esc(fmtDate(todayIso()))}</span>
      </div>`;
  }


  // ---------------------------------------------------------------------------
  // Emploi du temps (feuille « EDT » de l'Excel + moniteur, cours SAGAIE, activité réalisée)
  // ---------------------------------------------------------------------------
  const EDT_SECTION_FIELDS = { "edt-poste-moniteur": "poste_moniteur", "edt-chef": "chef_section", "edt-poste-chef": "poste_chef" };
  const ICON_COPY = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

  function getEdt(sectionId) {
    return query("SELECT * FROM edt WHERE section_id = ? ORDER BY date, COALESCE(heure_debut, '99:99'), id", [sectionId]);
  }

  function isoToDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function mondayOf(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  /** Semaine de stage (S1 = semaine du début de stage) ; à défaut, numéro de semaine ISO. */
  function semaineLabel(iso, section) {
    const d = isoToDate(iso);
    if (!d) return "";
    const debut = isoToDate(section.date_debut);
    if (debut) {
      const n = Math.round((mondayOf(d) - mondayOf(debut)) / (7 * 86400000)) + 1;
      return n >= 1 ? `S${n}` : "Avant stage";
    }
    const t = new Date(d);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const firstThursday = new Date(t.getFullYear(), 0, 4);
    const week = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
    return `Sem. ${week}`;
  }

  function fmtJour(iso) {
    const d = isoToDate(iso);
    return d ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  }

  function fmtHeures(r) {
    const h = (v) => (v || "").replace(":", "h");
    if (r.heure_debut && r.heure_fin) return `${h(r.heure_debut)} – ${h(r.heure_fin)}`;
    return h(r.heure_debut || r.heure_fin);
  }

  function activiteModifiee(r) {
    return !!r.activite && norm(r.activite) !== norm(r.cours_sagaie);
  }

  function renderEdt() {
    const s = getSection(state.activeSectionId);
    if (!s) return;
    $("edt-moniteur-nom").textContent = s.moniteur;
    for (const [id, col] of Object.entries(EDT_SECTION_FIELDS)) {
      if (document.activeElement !== $(id)) $(id).value = s[col] || "";
    }

    const rows = getEdt(s.id);
    if (!rows.length) {
      $("edt-tbody").innerHTML = `
        <tr><td colspan="8" class="px-4 py-10 text-center text-sm text-zinc-500">Aucun créneau. Cliquez sur « Ajouter un créneau ».</td></tr>`;
      return;
    }
    let lastWeek = null;
    let lastDate = null;
    const dash = '<span class="text-zinc-300">—</span>';
    const activites = getActivites();
    $("edt-tbody").innerHTML = rows.map((r) => {
      const week = semaineLabel(r.date, s);
      const newWeek = week !== lastWeek;
      const newDate = newWeek || r.date !== lastDate;
      lastWeek = week;
      lastDate = r.date;
      return `
        <tr class="${newWeek ? "border-t-2 border-zinc-200" : newDate ? "border-t border-zinc-200" : "border-t border-zinc-100"} align-top hover:bg-zinc-50/60" data-edt-row="${esc(r.id)}">
          <td class="px-4 py-2.5 font-semibold text-zinc-700">${newWeek ? esc(week) : ""}</td>
          <td class="whitespace-nowrap px-3 py-2.5 ${newDate ? "font-medium" : ""}">${newDate ? esc(fmtJour(r.date)) : ""}</td>
          <td class="whitespace-nowrap px-3 py-2.5 tabular-nums">${esc(fmtHeures(r)) || dash}</td>
          <td class="px-3 py-2.5">${esc(r.moniteur) || dash}</td>
          <td class="px-2 py-1.5">${inlineCombo("cours_sagaie", r, activites)}</td>
          <td class="px-2 py-1.5">${inlineCombo("activite", r, activites)}</td>
          <td class="px-2 py-1.5">
            <input data-inline="obs" data-id="${esc(r.id)}" value="${esc(r.obs)}" autocomplete="off" maxlength="200" placeholder="—"
              aria-label="Observations du ${esc(fmtJour(r.date))}"
              class="h-8 w-full min-w-[9rem] rounded-md border border-transparent bg-transparent px-2 text-sm text-zinc-700 placeholder:text-zinc-300 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
          </td>
          <td class="px-4 py-1.5">
            <div class="flex justify-end gap-1">
              <button type="button" data-edt-action="edit" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Modifier" aria-label="Modifier le créneau">${ICON_EDIT}</button>
              <button type="button" data-edt-action="duplicate" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Dupliquer" aria-label="Dupliquer le créneau">${ICON_COPY}</button>
              <button type="button" data-edt-action="delete" data-id="${esc(r.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer le créneau">${ICON_TRASH}</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }


  // ---------------------------------------------------------------------------
  // Liste des activités (menus « Cours SAGAIE » et « Activité réalisée »)
  // ---------------------------------------------------------------------------
  const AUTRE = "__autre";

  function getActivites() {
    return query("SELECT id, libelle FROM activites ORDER BY libelle COLLATE NOCASE");
  }

  /** Menu déroulant + saisie libre : la valeur hors liste passe en « Autre ». */
  function fillCombo(inputId, value, emptyLabel) {
    const select = $(`${inputId}-select`);
    const input = $(inputId);
    const list = getActivites();
    const match = value ? list.find((a) => norm(a.libelle) === norm(value)) : null;
    select.innerHTML = `<option value="">${esc(emptyLabel)}</option>` +
      list.map((a) => `<option value="${esc(a.libelle)}">${esc(a.libelle)}</option>`).join("") +
      `<option value="${AUTRE}">Autre (saisie libre)…</option>`;
    if (!value) select.value = "";
    else if (match) select.value = match.libelle;
    else select.value = AUTRE;
    input.value = value && !match ? value : "";
    input.hidden = select.value !== AUTRE;
  }

  function comboValue(inputId) {
    const v = $(`${inputId}-select`).value;
    if (v === AUTRE) return $(inputId).value.trim() || null;
    return v || null;
  }

  function onComboChange(event) {
    const select = event.target.closest("select[data-combo]");
    if (!select) return;
    const input = $(select.dataset.combo);
    input.hidden = select.value !== AUTRE;
    if (!input.hidden) input.focus();
  }

  function renderActivites() {
    const list = getActivites();
    $("activites-list").innerHTML = list.length
      ? list.map((a) => `
        <li class="flex items-center gap-2 px-4 py-1.5">
          <input data-activite-id="${esc(a.id)}" value="${esc(a.libelle)}" autocomplete="off" maxlength="120" aria-label="Libellé de l'activité"
            class="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
          <button type="button" data-delete-activite="${esc(a.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer l'activité">${ICON_TRASH}</button>
        </li>`).join("")
      : '<li class="px-4 py-10 text-center text-sm text-zinc-500">Aucune activité.</li>';
  }

  function onActiviteAdd(event) {
    event.preventDefault();
    const libelle = $("activite-new").value.trim();
    if (!libelle) return $("activite-new").focus();
    if (getActivites().some((a) => norm(a.libelle) === norm(libelle))) {
      toast("Cette activité existe déjà.", "error");
      return;
    }
    try {
      state.db.run("INSERT INTO activites (libelle) VALUES (?)", [libelle]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    $("activite-new").value = "";
    renderActivites();
    $("activite-new").focus();
  }

  /** Renommage : met aussi à jour les créneaux qui utilisaient l'ancien libellé. */
  function onActiviteRename(event) {
    const input = event.target.closest("input[data-activite-id]");
    if (!input || !state.db) return;
    const id = Number(input.dataset.activiteId);
    const old = (query("SELECT libelle FROM activites WHERE id = ?", [id])[0] || {}).libelle;
    const libelle = input.value.trim();
    if (!old) return;
    if (!libelle || getActivites().some((a) => a.id !== id && norm(a.libelle) === norm(libelle))) {
      toast(libelle ? "Cette activité existe déjà." : "Le libellé ne peut pas être vide.", "error");
      input.value = old;
      return;
    }
    if (libelle === old) return;
    try {
      state.db.run("UPDATE activites SET libelle = ? WHERE id = ?", [libelle, id]);
      state.db.run("UPDATE edt SET cours_sagaie = ? WHERE cours_sagaie = ? COLLATE NOCASE", [libelle, old]);
      state.db.run("UPDATE edt SET activite = ? WHERE activite = ? COLLATE NOCASE", [libelle, old]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      input.value = old;
      return;
    }
    persist();
    toast("Activité renommée");
  }

  async function onActiviteClick(event) {
    const btn = event.target.closest("[data-delete-activite]");
    if (!btn || !state.db) return;
    const id = Number(btn.dataset.deleteActivite);
    const a = query("SELECT libelle FROM activites WHERE id = ?", [id])[0];
    if (!a) return;
    const ok = await confirmDialog({
      title: "Supprimer l'activité ?",
      message: `« ${a.libelle} » sera retirée de la liste. Les créneaux déjà saisis gardent leur texte.`,
    });
    if (!ok) return;
    try {
      state.db.run("DELETE FROM activites WHERE id = ?", [id]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    renderActivites();
  }


  // ---------------------------------------------------------------------------
  // Emploi du temps : modification directe dans le tableau (cours, activité, obs.)
  // ---------------------------------------------------------------------------
  const INLINE_COLS = ["cours_sagaie", "activite", "obs"];
  const INLINE_SELECT = "h-8 w-full min-w-[11rem] rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

  function activiteSelectClass(r) {
    if (activiteModifiee(r)) return `${INLINE_SELECT} border-amber-300 bg-amber-50 font-medium text-amber-800`;
    return `${INLINE_SELECT} border-zinc-200 bg-white text-zinc-400`;
  }

  /** Menu déroulant de la liste d'activités, avec la valeur hors liste éventuelle et « Autre… ». */
  function inlineCombo(col, r, activites) {
    const value = r[col];
    const match = value ? activites.find((a) => norm(a.libelle) === norm(value)) : null;
    const selected = match ? match.libelle : value || "";
    const empty = col === "activite" ? "Conforme" : "—";
    const opt = (v, label) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`;
    const cls = col === "activite" ? activiteSelectClass(r) : `${INLINE_SELECT} border-zinc-200 bg-white`;
    const title = col === "activite" && activiteModifiee(r) ? ' title="Activité différente du cours SAGAIE annoncé"' : "";
    return `
      <select data-inline="${col}" data-id="${esc(r.id)}" class="${cls}"${title}
        aria-label="${col === "activite" ? "Activité réalisée" : "Cours SAGAIE"} du ${esc(fmtJour(r.date))}">
        ${opt("", empty)}
        ${activites.map((a) => opt(a.libelle, a.libelle)).join("")}
        ${value && !match ? opt(value, value) : ""}
        <option value="${AUTRE}">Autre (saisie libre)…</option>
      </select>
      <input data-inline-free="${col}" data-id="${esc(r.id)}" hidden autocomplete="off" maxlength="120" placeholder="Saisir puis Entrée"
        aria-label="Saisie libre" class="mt-1 h-8 w-full min-w-[11rem] rounded-md border border-zinc-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10">`;
  }

  /** Enregistre un champ du créneau. Renvoie la ligne enregistrée, ou null si refusé. */
  function saveEdtField(id, col, value) {
    if (!INLINE_COLS.includes(col)) return null;
    const r = query("SELECT * FROM edt WHERE id = ?", [id])[0];
    if (!r) return null;
    const next = { ...r, [col]: value };
    // Activité identique au cours annoncé : conforme
    if (next.activite && next.cours_sagaie && norm(next.activite) === norm(next.cours_sagaie)) next.activite = null;
    if (!next.cours_sagaie && !next.activite) {
      toast("Renseignez le cours SAGAIE ou l'activité réalisée.", "error");
      return null;
    }
    try {
      state.db.run("UPDATE edt SET cours_sagaie = ?, activite = ?, obs = ? WHERE id = ?",
        [next.cours_sagaie, next.activite, next.obs, id]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return null;
    }
    persist();
    return { before: r, after: next };
  }

  function onEdtInlineChange(event) {
    const el = event.target;
    const id = Number(el.dataset.id);
    if (!id || !state.db) return;

    if (el.matches("select[data-inline]")) {
      if (el.value === AUTRE) {
        const free = el.parentElement.querySelector("input[data-inline-free]");
        free.hidden = false;
        free.value = "";
        free.focus();
        return;
      }
      const res = saveEdtField(id, el.dataset.inline, el.value || null);
      if (!res) return renderEdt();
      // L'activité a été ramenée à « conforme » : on redessine la ligne
      if (res.after.activite !== (el.dataset.inline === "activite" ? (el.value || null) : res.before.activite)) return renderEdt();
      const act = $("edt-tbody").querySelector(`select[data-inline="activite"][data-id="${id}"]`);
      if (act) {
        act.className = activiteSelectClass(res.after);
        if (activiteModifiee(res.after)) act.title = "Activité différente du cours SAGAIE annoncé";
        else act.removeAttribute("title");
      }
      return;
    }

    if (el.matches("input[data-inline-free]")) {
      const v = el.value.trim();
      if (v) saveEdtField(id, el.dataset.inlineFree, v);
      renderEdt();
      return;
    }

    if (el.matches('input[data-inline="obs"]')) {
      el.value = el.value.trim();
      saveEdtField(id, "obs", el.value || null);
    }
  }

  function onEdtInlineKeydown(event) {
    const el = event.target;
    if (!el.matches("input[data-inline], input[data-inline-free]")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (el.matches("input[data-inline-free]")) {
        // Validation explicite (sans attendre la perte de focus)
        const v = el.value.trim();
        if (v) saveEdtField(Number(el.dataset.id), el.dataset.inlineFree, v);
        renderEdt();
      } else {
        el.blur();
      }
    } else if (event.key === "Escape" && el.matches("input[data-inline-free]")) {
      event.stopPropagation();
      renderEdt();
    }
  }

  let edtReturnFocus = null;

  function openEdtModal(id, duplicate) {
    const s = getSection(state.activeSectionId);
    if (!s) return;
    edtReturnFocus = document.activeElement;
    state.editingEdtId = id && !duplicate ? id : null;
    $("edt-form").reset();
    $("edt-form-error").hidden = true;

    const r = id ? query("SELECT * FROM edt WHERE id = ?", [id])[0] : null;
    fillCombo("edt-cours", r ? r.cours_sagaie : null, "— Choisir —");
    fillCombo("edt-activite", r ? r.activite : null, "Conforme au cours SAGAIE");
    if (r) {
      $("edt-date").value = r.date;
      $("edt-debut").value = r.heure_debut || "";
      $("edt-fin").value = r.heure_fin || "";
      $("edt-moniteur").value = r.moniteur || "";
      $("edt-obs").value = r.obs || "";
    } else {
      const last = getEdt(s.id).pop();
      $("edt-date").value = (last && last.date) || s.date_debut || todayIso();
      $("edt-moniteur").value = s.moniteur || "";
    }
    $("edt-modal-title").textContent = duplicate ? "Dupliquer le créneau" : r ? "Modifier le créneau" : "Ajouter un créneau";
    $("edt-modal").hidden = false;
    (r && !duplicate ? $("edt-activite-select") : $("edt-date")).focus();
  }

  function closeEdtModal() {
    if ($("edt-modal").hidden) return;
    $("edt-modal").hidden = true;
    state.editingEdtId = null;
    if (edtReturnFocus && edtReturnFocus.focus && document.contains(edtReturnFocus)) edtReturnFocus.focus();
  }

  function edtError(message, field) {
    $("edt-form-error").textContent = message;
    $("edt-form-error").hidden = false;
    if (field) $(field).focus();
  }

  function onEdtSubmit(event) {
    event.preventDefault();
    const v = {
      date: $("edt-date").value,
      debut: $("edt-debut").value || null,
      fin: $("edt-fin").value || null,
      moniteur: $("edt-moniteur").value.trim() || null,
      cours: comboValue("edt-cours"),
      activite: comboValue("edt-activite"),
      obs: $("edt-obs").value.trim() || null,
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return edtError("La date est obligatoire.", "edt-date");
    if (v.debut && v.fin && v.fin < v.debut) return edtError("L'heure de fin doit être après l'heure de début.", "edt-fin");
    if (!v.cours && !v.activite) return edtError("Renseignez le cours SAGAIE ou l'activité réalisée.", "edt-cours-select");
    // Activité identique au cours annoncé : considérée comme conforme
    if (v.activite && v.cours && norm(v.activite) === norm(v.cours)) v.activite = null;

    const params = [v.date, v.debut, v.fin, v.moniteur, v.cours, v.activite, v.obs];
    const editing = state.editingEdtId;
    const ok = editing
      ? mutate(`UPDATE edt SET date = ?, heure_debut = ?, heure_fin = ?, moniteur = ?, cours_sagaie = ?, activite = ?, obs = ?
                WHERE id = ?`, [...params, editing])
      : mutate(`INSERT INTO edt (section_id, date, heure_debut, heure_fin, moniteur, cours_sagaie, activite, obs)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [state.activeSectionId, ...params]);
    if (!ok) return;
    closeEdtModal();
    toast(editing ? "Créneau mis à jour" : "Créneau ajouté");
  }

  async function deleteEdt(id) {
    const r = query("SELECT * FROM edt WHERE id = ?", [id])[0];
    if (!r) return;
    const ok = await confirmDialog({
      title: "Supprimer le créneau ?",
      message: `${fmtJour(r.date)}${fmtHeures(r) ? ` · ${fmtHeures(r)}` : ""} — ${r.cours_sagaie || r.activite || ""}`,
    });
    if (ok && mutate("DELETE FROM edt WHERE id = ?", [id])) toast("Créneau supprimé");
  }

  /** En-tête (poste du moniteur, chef de section) : enregistré dans la section. */
  function onEdtHeaderChange(event) {
    const col = EDT_SECTION_FIELDS[event.target.id];
    if (!col || !state.db || !state.activeSectionId) return;
    try {
      state.db.run(`UPDATE sections SET ${col} = ? WHERE id = ?`, [event.target.value.trim() || null, state.activeSectionId]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
  }

  function edtPrintHtml(s) {
    const rows = getEdt(s.id);
    const effectif = getStagiaires(s.id).length;
    const withPoste = (name, poste) => `${esc(name || "—")}${poste ? ` <span style="font-weight:400">(${esc(poste)})</span>` : ""}`;
    let lastWeek = null;
    let lastDate = null;
    const body = rows.length ? rows.map((r) => {
      const week = semaineLabel(r.date, s);
      const newWeek = week !== lastWeek;
      const newDate = newWeek || r.date !== lastDate;
      lastWeek = week;
      lastDate = r.date;
      const realise = activiteModifiee(r) ? `<b>${esc(r.activite)}</b>` : r.cours_sagaie ? "Conforme" : "";
      return `<tr>
        <td>${newWeek ? esc(week) : ""}</td><td>${newDate ? esc(fmtJour(r.date)) : ""}</td><td>${esc(fmtHeures(r))}</td>
        <td>${esc(r.moniteur)}</td><td>${esc(r.cours_sagaie)}</td><td>${realise}</td><td>${esc(r.obs)}</td>
      </tr>`;
    }).join("") : '<tr><td colspan="7" class="ps-empty">Aucun créneau enregistré.</td></tr>';
    return `
      <h1>Emploi du temps</h1>
      <p class="ps-sub">${esc(s.formation)} ${esc(s.annee_scolaire)}${periodLabel(s) ? ` — ${esc(periodLabel(s))}` : ""}</p>
      <dl class="ps-info">
        <div><dt>Moniteur EPMS</dt><dd>${withPoste(s.moniteur, s.poste_moniteur)}</dd></div>
        <div><dt>Chef de section</dt><dd>${withPoste(s.chef_section, s.poste_chef)}</dd></div>
        <div><dt>Stage</dt><dd>${esc(s.formation)} ${esc(s.annee_scolaire)}</dd></div>
        <div><dt>Période</dt><dd>${esc(periodLabel(s)) || "—"}</dd></div>
        <div><dt>Effectif</dt><dd>${effectif}</dd></div>
      </dl>
      <table>
        <thead><tr><th>Semaine</th><th>Date</th><th>Heure</th><th>Moniteur</th><th>Cours SAGAIE</th><th>Activité réalisée</th><th>Obs.</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="ps-foot">
        <span>Moniteur : ${esc(s.moniteur)}</span>
        <span>Édité le ${esc(fmtDate(todayIso()))}</span>
      </div>`;
  }


  // ---------------------------------------------------------------------------
  // Fiches terrain : feuilles de relevé préremplies avec les stagiaires.
  // Les performances sont les mêmes données que la saisie des notes physiques
  // (une perf relevée sur la fiche calcule la note d'après le barème).
  // ---------------------------------------------------------------------------
  const COLS_2400 = [
    { k: "date2400", label: "Date", type: "date", w: "w-36" },
    { k: "num", label: "Dossard", w: "w-16" },
    ...[400, 800, 1200, 1600].map((m) => ({ k: `p${m}`, label: String(m), w: "w-[4.5rem]", ph: "mm:ss" })),
    { k: "perf", label: "Performance", w: "w-24" },
    { k: "datePompes", label: "Date", type: "date", w: "w-36" },
    { k: "pompes", label: "Pompes", w: "w-20" },
    { k: "dateTractions", label: "Date", type: "date", w: "w-36" },
    { k: "tractions", label: "Tractions", w: "w-20" },
  ];

  // Toutes les fiches s'impriment en A4 portrait, avec un maximum de stagiaires par page.
  const FICHES = {
    peda: { kind: "peda", titre: "Évaluation péda GRGE FS2", dates: [] },
    // Évaluation comportement : onglet de la saisie des notes (gardée ici pour son titre et sa grille)
    comportement: { kind: "comportement", titre: "Évaluation comportement FS1/FS2", dates: [] },
    mco: {
      titre: "Test Marche-Course",
      dates: [["m_co", "Date"]],
      cols: [
        { k: "num", label: "Dossard", w: "w-16" },
        ...[1, 2, 3, 4, 5, 6, 7].map((i) => ({ k: `km${i}`, label: `${i}° km`, w: "w-[4.5rem]", ph: "mm:ss" })),
        { k: "perf", label: "Performance", w: "w-24" },
      ],
    },
    natation: {
      titre: "Test Natation",
      dates: [["aisance_aquatique", "Date"]],
      cols: [
        { k: "apnee", label: "Apnée (m)", type: "distance", w: "w-20" },
        { k: "nage", label: "Distance de nage (m)", type: "distance", w: "w-20" },
        { k: "perf", label: "Performance", w: "w-24" },
      ],
    },
    f2400: {
      titre: "Test 2400 m + pompes + tractions",
      dates: [["ecr", "Date 2400 m"], ["cmg", "Date pompes"], ["traction", "Date tractions"]],
      cols: COLS_2400,
    },
  };
  // CT1 : chaque fiche physique se décline en test initial et test final (sous-onglets), avec ses propres colonnes.
  const FICHE_VARIANTES = [["initial", "Test initial"], ["final", "Test final"]];
  const FICHES_CT1 = ["mco", "natation", "f2400"];
  for (const base of FICHES_CT1) {
    for (const [v, label] of FICHE_VARIANTES) {
      FICHES[`${base}_${v}`] = { titre: `${FICHES[base].titre} — ${label}`, base, dates: [], cols: FICHES[base].cols };
    }
  }

  function ficheAVariantes() {
    return state.activeFormation === "CT1" && FICHES_CT1.includes(state.ficheTab);
  }

  /** Identifiant de la fiche affichée : la fiche choisie, ou son test initial / final pour une CT1. */
  function ficheActive() {
    return ficheAVariantes() ? `${state.ficheTab}_${state.ficheVariante}` : state.ficheTab;
  }
  /** Colonnes d'une fiche : celles d'origine + celles ajoutées, avec libellé, visibilité et ordre enregistrés. */
  function ficheCols(id) {
    const cfg = new Map(query("SELECT * FROM fiches_colonnes WHERE fiche = ?", [id]).map((c) => [c.cle, c]));
    const cols = FICHES[id].cols.map((c, i) => {
      const k = cfg.get(c.k);
      return { ...c, defaultLabel: c.label, label: k ? k.libelle : c.label, visible: k ? !!k.visible : true, ordre: k ? k.ordre : i };
    });
    for (const k of cfg.values()) {
      if (cols.some((c) => c.k === k.cle)) continue;
      cols.push({ k: k.cle, label: k.libelle, custom: true, w: "w-28", visible: !!k.visible, ordre: k.ordre });
    }
    return cols.sort((a, b) => a.ordre - b.ordre);
  }

  /** Enregistre toute la configuration (ordre = position dans le tableau). */
  function saveFicheCols(id, cols) {
    state.db.run("DELETE FROM fiches_colonnes WHERE fiche = ?", [id]);
    cols.forEach((c, i) => state.db.run(
      "INSERT INTO fiches_colonnes (fiche, cle, libelle, visible, ordre) VALUES (?, ?, ?, ?, ?)",
      [id, c.k, c.label, c.visible ? 1 : 0, i],
    ));
  }

  /** Valeurs propres aux fiches (dossards, passages, dates) : { stagiaire: { champ: valeur } }. */
  function getFicheValues(sectionId, fiche) {
    const out = {};
    for (const v of query(`SELECT f.stagiaire_id, f.champ, f.valeur FROM fiches_terrain f
        JOIN stagiaires t ON t.id = f.stagiaire_id WHERE t.section_id = ? AND f.fiche = ?`, [sectionId, fiche])) {
      (out[v.stagiaire_id] ||= {})[v.champ] = v.valeur;
    }
    return out;
  }

  function renderFiche() {
    const s = getSection(state.activeSectionId);
    if (!s) return;
    const id = ficheActive();
    const fiche = FICHES[id];
    if (fiche.kind === "peda") return renderPeda();
    // Fiches physiques : aperçu de la fiche imprimée (noms des stagiaires, cases à remplir à la main)
    const cols = ficheCols(id).filter((c) => c.visible);
    const rows = sortRows(getStagiaires(s.id));

    const body = rows.length ? rows.map((r) => `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        <td class="px-3 py-1.5"><span class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-medium">${esc(r.grade)}</span></td>
        <td class="px-2 py-1.5 font-medium uppercase">${esc(r.nom)}</td>
        <td class="px-2 py-1.5">${esc(r.prenom)}</td>
        <td class="px-2 py-1.5 text-center">${esc(r.sexe)}</td>
        <td class="px-2 py-1.5 text-zinc-600">${esc(r.armee)}</td>
        ${cols.map((c) => `<td class="px-1 py-1.5"><span class="block h-7 min-w-[3rem] rounded border border-dashed border-zinc-200 ${c.w}"></span></td>`).join("")}
      </tr>`).join("")
      : `<tr><td colspan="${cols.length + 5}" class="px-4 py-10 text-center text-sm text-zinc-500">Aucun stagiaire dans cette section.</td></tr>`;

    $("fiche-content").innerHTML = `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-end gap-4 border-b border-zinc-100 p-4">
          <h2 class="font-semibold tracking-tight">${esc(fiche.titre)}</h2>
          ${fiche.base ? `
          <nav aria-label="Test" class="inline-flex items-center rounded-md bg-zinc-200/70 p-1 text-zinc-500">
            ${FICHE_VARIANTES.map(([v, label]) => `<a href="#/fiches/${esc(fiche.base)}/${v}" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition"${v === state.ficheVariante ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
          </nav>` : ""}
          <button type="button" data-open-cols title="Modifier les colonnes de la fiche"
            class="mr-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-100">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
            Modifier
          </button>
          <p class="w-full text-sm text-zinc-500">Aperçu de la fiche imprimée : ${rows.length} stagiaire${rows.length > 1 ? "s" : ""}, cases à remplir à la main. « Modifier » pour adapter les colonnes.</p>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th class="px-3 py-3 font-medium">Grade</th>
                <th class="px-2 py-3 font-medium">Nom</th>
                <th class="px-2 py-3 font-medium">Prénom</th>
                <th class="px-2 py-3 text-center font-medium">Sexe</th>
                <th class="px-2 py-3 font-medium">Armée</th>
                ${cols.map((c) => `<th class="whitespace-nowrap px-1 py-3 font-medium">${esc(c.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  }


  // ---------------------------------------------------------------------------
  // Fiches terrain : configuration des colonnes (renommer, masquer, ordonner, ajouter)
  // ---------------------------------------------------------------------------
  const ICON_UP = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
  const ICON_DOWN = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  let colsReturnFocus = null;

  function renderColsList(focusKey, focusAction) {
    const cols = ficheCols(ficheActive());
    $("cols-modal-title").textContent = `Colonnes — ${FICHES[ficheActive()].titre}`;
    $("cols-list").innerHTML = cols.map((c, i) => `
      <li class="flex items-center gap-2 px-4 py-1.5 ${c.visible ? "" : "bg-zinc-50"}" data-col-key="${esc(c.k)}">
        <input type="checkbox" data-col-visible ${c.visible ? "checked" : ""} class="h-4 w-4 shrink-0 accent-zinc-900"
          aria-label="Afficher la colonne ${esc(c.label)}">
        <input data-col-label value="${esc(c.label)}" maxlength="40" autocomplete="off" aria-label="Nom de la colonne"
          class="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm ${c.visible ? "" : "text-zinc-400 line-through"} hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:no-underline focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
        <button type="button" data-col-move="-1" ${i === 0 ? "disabled" : ""} class="${BTN_ICON} disabled:opacity-30" title="Monter" aria-label="Monter la colonne">${ICON_UP}</button>
        <button type="button" data-col-move="1" ${i === cols.length - 1 ? "disabled" : ""} class="${BTN_ICON} disabled:opacity-30" title="Descendre" aria-label="Descendre la colonne">${ICON_DOWN}</button>
        ${c.custom
          ? `<button type="button" data-col-delete class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer la colonne">${ICON_TRASH}</button>`
          : '<span class="h-8 w-8 shrink-0"></span>'}
      </li>`).join("");
    if (focusKey) {
      const target = $("cols-list").querySelector(`[data-col-key="${CSS.escape(focusKey)}"] ${focusAction || "[data-col-label]"}`);
      if (target && !target.disabled) target.focus();
    }
  }

  function openColsModal() {
    if (!state.db) return;
    colsReturnFocus = document.activeElement;
    renderColsList();
    $("cols-modal").hidden = false;
    $("col-new").focus();
  }

  function closeColsModal() {
    if ($("cols-modal").hidden) return;
    $("cols-modal").hidden = true;
    renderFiche();
    if (colsReturnFocus && colsReturnFocus.focus && document.contains(colsReturnFocus)) colsReturnFocus.focus();
  }

  /** Applique une modification à la configuration, enregistre, puis rafraîchit. */
  function updateCols(mutateCols, focusKey, focusAction) {
    const cols = ficheCols(ficheActive());
    if (mutateCols(cols) === false) return;
    try {
      saveFicheCols(ficheActive(), cols);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    renderColsList(focusKey, focusAction);
    renderFiche();
  }

  function onColsChange(event) {
    const li = event.target.closest("[data-col-key]");
    if (!li) return;
    const key = li.dataset.colKey;
    if (event.target.matches("[data-col-visible]")) {
      updateCols((cols) => { cols.find((c) => c.k === key).visible = event.target.checked; }, key, "[data-col-visible]");
    } else if (event.target.matches("[data-col-label]")) {
      const label = event.target.value.trim();
      updateCols((cols) => {
        const c = cols.find((x) => x.k === key);
        if (!label && c.custom) {
          toast("Le nom de la colonne ne peut pas être vide.", "error");
          event.target.value = c.label;
          return false;
        }
        c.label = label || c.defaultLabel;
      });
    }
  }

  async function onColsClick(event) {
    const li = event.target.closest("[data-col-key]");
    const move = event.target.closest("[data-col-move]");
    if (li && move) {
      const key = li.dataset.colKey;
      const step = Number(move.dataset.colMove);
      updateCols((cols) => {
        const i = cols.findIndex((c) => c.k === key);
        const j = i + step;
        if (j < 0 || j >= cols.length) return false;
        [cols[i], cols[j]] = [cols[j], cols[i]];
      }, key, `[data-col-move="${step}"]`);
      return;
    }
    if (li && event.target.closest("[data-col-delete]")) {
      const key = li.dataset.colKey;
      const c = ficheCols(ficheActive()).find((x) => x.k === key);
      const ok = await confirmDialog({
        title: "Supprimer la colonne ?",
        message: `La colonne « ${c.label} » et les valeurs saisies dedans seront supprimées.`,
      });
      if (!ok) return;
      try {
        state.db.run("DELETE FROM fiches_terrain WHERE fiche = ? AND champ = ?", [ficheActive(), key]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      updateCols((cols) => { cols.splice(cols.findIndex((x) => x.k === key), 1); });
      return;
    }
    if (event.target.closest("#btn-cols-reset")) {
      const ok = await confirmDialog({
        title: "Revenir aux colonnes d'origine ?",
        message: "Les noms, l'ordre et la visibilité des colonnes seront rétablis. Les colonnes ajoutées et leurs valeurs seront supprimées.",
        confirmLabel: "Rétablir",
      });
      if (!ok) return;
      try {
        for (const c of ficheCols(ficheActive()).filter((x) => x.custom)) {
          state.db.run("DELETE FROM fiches_terrain WHERE fiche = ? AND champ = ?", [ficheActive(), c.k]);
        }
        state.db.run("DELETE FROM fiches_colonnes WHERE fiche = ?", [ficheActive()]);
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      persist();
      renderColsList();
      renderFiche();
      toast("Colonnes d'origine rétablies");
      return;
    }
    if (event.target.closest("[data-close-cols]") || event.target.id === "cols-modal") closeColsModal();
  }

  function onColAdd(event) {
    event.preventDefault();
    const label = $("col-new").value.trim();
    if (!label) return $("col-new").focus();
    const key = `x_${Date.now().toString(36)}`;
    updateCols((cols) => { cols.push({ k: key, label, custom: true, visible: true }); });
    $("col-new").value = "";
    $("col-new").focus();
  }


  // ---------------------------------------------------------------------------
  // Évaluations pédagogique et comportement
  // (« Grille évaluation péda et comportement » : feuilles « évaluation péda »,
  //  « notation » et « évaluation comportement »). Les totaux /20 alimentent
  //  les notes pédagogiques « Pédagogie » et « Comportement ».
  // ---------------------------------------------------------------------------
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

  // ---- Personnalisation des grilles : catégories, critères, points ou niveaux, tableau de notation (péda)
  let grilleEdit = null; // { type, draft } : copie modifiée, enregistrée seulement avec « Enregistrer »
  let grilleReturnFocus = null;
  const nouvelleCle = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const nombreSaisi = (v) => {
    const t = String(v ?? "").trim().replace(",", ".");
    return /^\d+(\.\d+)?$/.test(t) ? Math.round(Number(t) * 100) / 100 : null;
  };
  const deplacer = (arr, i, d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  function openGrilleModal(type) {
    if (!state.db || !GRILLES_DEFAUT[type]) return;
    grilleReturnFocus = document.activeElement;
    grilleEdit = { type, draft: JSON.parse(JSON.stringify(getGrille(type))) };
    $("grille-modal-title").textContent = `Personnaliser la grille — ${FICHES[type].titre}`;
    grilleError("");
    renderGrilleModal();
    $("grille-modal").hidden = false;
    const first = $("grille-body").querySelector("input");
    if (first) first.focus();
  }

  function closeGrilleModal() {
    if ($("grille-modal").hidden) return;
    $("grille-modal").hidden = true;
    grilleEdit = null;
    if (grilleReturnFocus && grilleReturnFocus.focus && document.contains(grilleReturnFocus)) grilleReturnFocus.focus();
  }

  function grilleError(message) {
    $("grille-error").textContent = message || "";
    $("grille-error").hidden = !message;
  }

  /** Maximum d'un critère / d'une catégorie de la copie en cours (saisies non numériques ignorées). */
  function draftItemMax(type, it) {
    return type === "peda" ? nombreSaisi(it.max) ?? 0 : Math.max(0, ...it.niveaux.map((n) => nombreSaisi(n.pts) ?? 0));
  }
  const draftGroupeMax = (type, g) => round2(g.items.reduce((a, it) => a + draftItemMax(type, it), 0));

  function renderGrilleTotals() {
    const { type, draft } = grilleEdit;
    const total = round2(draft.groupes.reduce((a, g) => a + draftGroupeMax(type, g), 0));
    $("grille-total").textContent = `Total : ${fmtNote(total)} point${total > 1 ? "s" : ""}${type === "comportement" && total !== NOTE_MAX ? ` — ramené sur ${NOTE_MAX} pour la note « Comportement »` : ""}`;
    draft.groupes.forEach((g, gi) => {
      const el = $("grille-body").querySelector(`[data-gmax="${gi}"]`);
      if (el) el.textContent = `/ ${fmtNote(draftGroupeMax(type, g))}`;
    });
  }

  function renderGrilleModal() {
    const { type, draft } = grilleEdit;
    const INP = "h-8 min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";
    const PTS = `${INP} w-20 text-right tabular-nums`;
    const icone = (act, data, label, svg, danger = false) => `<button type="button" data-grille-act="${act}" ${data} title="${label}" aria-label="${label}"
      class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${danger ? "text-zinc-400 hover:bg-red-50 hover:text-red-600" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"}">${svg}</button>`;
    const UP = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
    const DOWN = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    const ordre = (scope, data, i, n) => `${i > 0 ? icone(`up-${scope}`, data, "Monter", UP) : '<span class="w-8 shrink-0"></span>'}${i < n - 1 ? icone(`down-${scope}`, data, "Descendre", DOWN) : '<span class="w-8 shrink-0"></span>'}`;
    const ajout = (act, data, label) => `<button type="button" data-grille-act="${act}" ${data}
      class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>${label}</button>`;

    const critere = (it, gi, ii, n) => {
      const d = `data-gi="${gi}" data-ii="${ii}"`;
      const tete = `
        <div class="flex items-center gap-1">
          <input data-scope="i" data-f="label" ${d} value="${esc(it.label)}" maxlength="120" placeholder="Critère" aria-label="Nom du critère" class="${INP} flex-1">
          ${type === "peda" ? `<input data-scope="i" data-f="max" ${d} value="${esc(it.max)}" inputmode="decimal" placeholder="pts" aria-label="Points maximum" class="${PTS}"><span class="w-6 text-xs text-zinc-400">pts</span>` : ""}
          ${ordre("i", d, ii, n)}${icone("del-i", d, "Supprimer le critère", ICON_TRASH, true)}
        </div>`;
      if (type === "peda") return `<div class="px-3 py-1.5">${tete}</div>`;
      const niveaux = it.niveaux.map((nv, ni) => {
        const dn = `${d} data-ni="${ni}"`;
        return `
          <div class="flex items-center gap-1">
            <input data-scope="n" data-f="label" ${dn} value="${esc(nv.label)}" maxlength="120" placeholder="Niveau" aria-label="Libellé du niveau" class="${INP} flex-1">
            <input data-scope="n" data-f="pts" ${dn} value="${esc(nv.pts)}" inputmode="decimal" placeholder="pts" aria-label="Points du niveau" class="${PTS}"><span class="w-6 text-xs text-zinc-400">pts</span>
            ${ordre("n", dn, ni, it.niveaux.length)}${icone("del-n", dn, "Supprimer le niveau", ICON_TRASH, true)}
          </div>`;
      }).join("");
      return `
        <div class="space-y-1.5 px-3 py-2.5">
          ${tete}
          <div class="ml-4 space-y-1 border-l-2 border-zinc-100 pl-3">
            ${niveaux}
            ${ajout("add-n", d, "Ajouter un niveau")}
          </div>
        </div>`;
    };

    const categories = draft.groupes.map((g, gi) => {
      const d = `data-gi="${gi}"`;
      return `
        <section class="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div class="flex items-center gap-1 border-b border-zinc-100 bg-zinc-50/60 p-2">
            <input data-scope="g" data-f="groupe" ${d} value="${esc(g.groupe)}" maxlength="80" placeholder="Catégorie" aria-label="Nom de la catégorie" class="${INP} flex-1 font-semibold">
            <span data-gmax="${gi}" class="w-14 text-right text-xs tabular-nums text-zinc-500"></span>
            ${ordre("g", d, gi, draft.groupes.length)}${icone("del-g", d, "Supprimer la catégorie", ICON_TRASH, true)}
          </div>
          <div class="divide-y divide-zinc-100">${g.items.map((it, ii) => critere(it, gi, ii, g.items.length)).join("") || '<p class="px-3 py-3 text-sm text-zinc-400">Aucun critère.</p>'}</div>
          <div class="border-t border-zinc-100 p-1.5">${ajout("add-i", d, "Ajouter un critère")}</div>
        </section>`;
    }).join("");

    const liste = (scope, titre, items, placeholder) => `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <p class="border-b border-zinc-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">${titre}</p>
        <div class="space-y-1 p-2">
          ${items.map((x, i) => `
          <div class="flex items-center gap-1">
            <input data-scope="${scope}" data-f="label" data-${scope}i="${i}" value="${esc(x.label)}" maxlength="80" placeholder="${placeholder}" aria-label="${placeholder}" class="${INP} flex-1">
            ${ordre(scope, `data-${scope}i="${i}"`, i, items.length)}${icone(`del-${scope}`, `data-${scope}i="${i}"`, "Supprimer", ICON_TRASH, true)}
          </div>`).join("")}
          ${ajout(`add-${scope}`, "", `Ajouter ${scope === "l" ? "une ligne" : "une colonne"}`)}
        </div>
      </div>`;

    $("grille-body").innerHTML = `
      <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">Catégories et critères${type === "comportement" ? " (avec leurs niveaux)" : ""}</p>
      ${categories}
      <div>${ajout("add-g", "", "Ajouter une catégorie")}</div>
      ${type === "peda" ? `
      <p class="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Tableau « Notation de la séance »</p>
      <div class="grid gap-4 sm:grid-cols-2">
        ${liste("l", "Lignes", draft.lignes, "Ligne")}
        ${liste("c", "Colonnes", draft.cols, "Colonne")}
      </div>` : ""}`;
    renderGrilleTotals();
  }

  function onGrilleInput(event) {
    const el = event.target;
    if (!grilleEdit || !el.dataset.scope) return;
    const { draft } = grilleEdit;
    const gi = Number(el.dataset.gi);
    const ii = Number(el.dataset.ii);
    const f = el.dataset.f;
    if (el.dataset.scope === "g") draft.groupes[gi][f] = el.value;
    else if (el.dataset.scope === "i") draft.groupes[gi].items[ii][f] = el.value;
    else if (el.dataset.scope === "n") draft.groupes[gi].items[ii].niveaux[Number(el.dataset.ni)][f] = el.value;
    else if (el.dataset.scope === "l") draft.lignes[Number(el.dataset.li)].label = el.value;
    else if (el.dataset.scope === "c") draft.cols[Number(el.dataset.ci)].label = el.value;
    renderGrilleTotals();
  }

  function onGrilleClick(event) {
    if (event.target.closest("[data-close-grille]") || event.target.id === "grille-modal") return closeGrilleModal();
    const btn = event.target.closest("[data-grille-act]");
    if (!btn || !grilleEdit) return;
    const { type, draft } = grilleEdit;
    const act = btn.dataset.grilleAct;
    const gi = Number(btn.dataset.gi);
    const ii = Number(btn.dataset.ii);
    const ni = Number(btn.dataset.ni);
    const g = draft.groupes[gi];
    const items = g && g.items;
    const nouveauCritere = () => (type === "peda" ? { k: nouvelleCle(), label: "", max: 1 } : { k: nouvelleCle(), label: "", niveaux: [{ label: "", pts: 1 }, { label: "", pts: 0 }] });

    if (act === "save") return saveGrille();
    if (act === "reset") {
      grilleEdit.draft = JSON.parse(JSON.stringify(GRILLES_DEFAUT[type]));
      grilleError("");
      renderGrilleModal();
      toast("Grille d'origine rechargée : « Enregistrer » pour l'appliquer");
      return;
    }
    let focus = null;
    if (act === "add-g") { draft.groupes.push({ groupe: "", items: [nouveauCritere()] }); focus = `[data-scope="g"][data-gi="${draft.groupes.length - 1}"]`; }
    else if (act === "del-g") draft.groupes.splice(gi, 1);
    else if (act === "up-g") deplacer(draft.groupes, gi, -1);
    else if (act === "down-g") deplacer(draft.groupes, gi, 1);
    else if (act === "add-i") { items.push(nouveauCritere()); focus = `[data-scope="i"][data-gi="${gi}"][data-ii="${items.length - 1}"]`; }
    else if (act === "del-i") items.splice(ii, 1);
    else if (act === "up-i") deplacer(items, ii, -1);
    else if (act === "down-i") deplacer(items, ii, 1);
    else if (act === "add-n") { items[ii].niveaux.push({ label: "", pts: 0 }); focus = `[data-scope="n"][data-gi="${gi}"][data-ii="${ii}"][data-ni="${items[ii].niveaux.length - 1}"]`; }
    else if (act === "del-n") items[ii].niveaux.splice(ni, 1);
    else if (act === "up-n") deplacer(items[ii].niveaux, ni, -1);
    else if (act === "down-n") deplacer(items[ii].niveaux, ni, 1);
    else if (/^(add|del|up|down)-[lc]$/.test(act)) {
      const scope = act.slice(-1);
      const arr = scope === "l" ? draft.lignes : draft.cols;
      const i = Number(btn.dataset[`${scope}i`]);
      if (act.startsWith("add")) { arr.push({ k: nouvelleCle(), label: "" }); focus = `[data-scope="${scope}"][data-${scope}i="${arr.length - 1}"]`; }
      else if (act.startsWith("del")) arr.splice(i, 1);
      else deplacer(arr, i, act.startsWith("up") ? -1 : 1);
    } else return;
    grilleError("");
    renderGrilleModal();
    const el = focus && $("grille-body").querySelector(focus);
    if (el) el.focus();
  }

  /** Contrôle et normalise la copie ; renvoie la grille à enregistrer ou un message d'erreur. */
  function grilleValidee(type, draft) {
    const txt = (v) => String(v ?? "").trim();
    if (!draft.groupes.length) return { error: "Ajoutez au moins une catégorie." };
    const groupes = [];
    for (const g of draft.groupes) {
      const groupe = txt(g.groupe);
      if (!groupe) return { error: "Chaque catégorie doit avoir un nom." };
      if (!g.items.length) return { error: `La catégorie « ${groupe} » n'a aucun critère.` };
      const items = [];
      for (const it of g.items) {
        const label = txt(it.label);
        if (!label) return { error: `Un critère de « ${groupe} » n'a pas de nom.` };
        if (type === "peda") {
          const max = nombreSaisi(it.max);
          if (max == null) return { error: `Points maximum invalides pour « ${label} » (nombre attendu, ex. 1,5).` };
          items.push({ k: it.k, label, max });
        } else {
          if (!it.niveaux.length) return { error: `Le critère « ${label} » n'a aucun niveau.` };
          const niveaux = [];
          for (const nv of it.niveaux) {
            const nl = txt(nv.label);
            const pts = nombreSaisi(nv.pts);
            if (!nl) return { error: `Un niveau de « ${label} » n'a pas de libellé.` };
            if (pts == null) return { error: `Points invalides pour le niveau « ${nl} » (${label}).` };
            if (niveaux.some((x) => x.pts === pts)) return { error: `Deux niveaux de « ${label} » valent ${fmtNote(pts)} point(s) : chaque niveau doit avoir des points différents.` };
            niveaux.push({ label: nl, pts });
          }
          items.push({ k: it.k, label, niveaux });
        }
      }
      groupes.push({ groupe, items });
    }
    if (type !== "peda") return { grille: { groupes } };
    const lignes = draft.lignes.map((x) => ({ k: x.k, label: txt(x.label) }));
    const cols = draft.cols.map((x) => ({ k: x.k, label: txt(x.label) }));
    if (lignes.some((x) => !x.label) || cols.some((x) => !x.label)) return { error: "Chaque ligne et chaque colonne du tableau de notation doit avoir un nom." };
    return { grille: { groupes, lignes, cols } };
  }

  function saveGrille() {
    const { type, draft } = grilleEdit;
    const { grille, error } = grilleValidee(type, draft);
    if (error) return grilleError(error);
    let effaces = 0;
    try {
      setParametre(`grille_${type}`, JSON.stringify(grille));
      delete grillesCache[type];
      if (type === "comportement") effaces = recalculerNotesGrille(type); // la grille péda est imprimée vierge : pas de note calculée
    } catch (e) {
      grilleError(`Erreur base de données : ${errMsg(e)}`);
      return;
    }
    persist();
    closeGrilleModal();
    if (type === "comportement") refreshAll(); // onglet Comportement et notes pédagogiques
    else renderFiche();
    toast(effaces
      ? `Grille enregistrée. ${effaces} choix ne correspondai${effaces > 1 ? "ent" : "t"} plus à aucun niveau et ${effaces > 1 ? "ont" : "a"} été effacé${effaces > 1 ? "s" : ""}.`
      : "Grille enregistrée");
  }

  /**
   * Après un changement de grille : notes « Pédagogie » / « Comportement » recalculées pour tous les stagiaires évalués.
   * Comportement : un choix dont les points ne correspondent plus à un niveau est effacé. Renvoie le nombre de choix effacés.
   */
  function recalculerNotesGrille(type) {
    const colonne = type === "peda" ? "pedagogie" : "comportement";
    const items = grilleItems(type);
    const parStagiaire = new Map();
    let effaces = 0;
    for (const v of query("SELECT stagiaire_id, champ, valeur FROM fiches_terrain WHERE fiche = ?", [type])) {
      if (type === "comportement" && v.champ.startsWith("c_")) {
        const it = items.find((x) => `c_${x.k}` === v.champ);
        if (it && !it.niveaux.some((n) => n.pts === Number(v.valeur))) {
          saveFicheChamp(v.stagiaire_id, type, v.champ, null);
          effaces++;
          continue;
        }
      }
      if (!parStagiaire.has(v.stagiaire_id)) parStagiaire.set(v.stagiaire_id, {});
      parStagiaire.get(v.stagiaire_id)[v.champ] = v.valeur;
    }
    const cles = items.map((x) => x.k);
    for (const [sid, vals] of parStagiaire) {
      upsert("notes_pedagogiques", ["stagiaire_id"], ["stagiaire_id", colonne], [sid, noteSur20(type, sumPoints(vals, cles).total)]);
    }
    return effaces;
  }

  // ---- Évaluation pédagogique : une grille par stagiaire
  /** Évaluation péda : aperçu de la fiche vierge imprimée (sans stagiaire), grille personnalisable. */
  function renderPeda() {
    const grillePeda = getGrille("peda");
    const grille = grillePeda.groupes.map((g) => g.items.map(({ label, max }, i) => `
      <tr class="${i === 0 ? "border-t border-zinc-200" : ""}">
        ${i === 0 ? `<td rowspan="${g.items.length}" class="bg-zinc-50 px-3 py-2 align-top text-xs font-semibold uppercase tracking-wide text-zinc-600">${esc(g.groupe)}</td>` : ""}
        <td class="px-3 py-2">${esc(label)}</td>
        <td class="px-2 py-1.5"><span class="ml-auto block h-7 w-16 rounded border border-dashed border-zinc-200"></span></td>
        <td class="w-14 px-2 py-2 text-zinc-400 tabular-nums">/ ${esc(fmtNote(max))}</td>
      </tr>`).join("")).join("");
    const notation = grillePeda.lignes.map(({ label }) => `
      <tr class="border-t border-zinc-100">
        <td class="whitespace-nowrap px-3 py-2 font-medium">${esc(label)}</td>
        ${grillePeda.cols.map(() => '<td class="px-1 py-1.5"><span class="block h-7 min-w-[5rem] rounded border border-dashed border-zinc-200"></span></td>').join("")}
      </tr>`).join("");

    $("fiche-content").innerHTML = `
      <div class="space-y-4">
        <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div class="flex flex-wrap items-center gap-4 border-b border-zinc-100 p-4">
            <div class="mr-auto">
              <h2 class="font-semibold tracking-tight">${esc(FICHES.peda.titre)}</h2>
              <p class="mt-0.5 text-sm text-zinc-500">Aperçu de la fiche vierge. « Imprimer / Exporter PDF » pour choisir le nombre d'exemplaires.</p>
            </div>
            <button type="button" data-open-grille="peda"
              class="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-100">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Personnaliser la grille
            </button>
          </div>
          <table class="w-full text-sm">
            <tbody>${grille}</tbody>
            <tfoot>
              <tr class="border-t-2 border-zinc-200 bg-zinc-50">
                <td colspan="2" class="px-3 py-3 text-right font-semibold">Note</td>
                <td colspan="2" class="px-3 py-3 text-zinc-500 tabular-nums">/ ${esc(fmtNote(grilleMax("peda")))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div class="border-b border-zinc-100 p-4"><h3 class="font-semibold tracking-tight">Notation de la séance</h3></div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th class="px-3 py-2 font-medium"></th>
                  ${grillePeda.cols.map(({ label }) => `<th class="px-1 py-2 font-medium">${esc(label)}</th>`).join("")}
                </tr>
              </thead>
              <tbody>${notation}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  /** Évaluations péda vierges (sans nom), à remplir à la main : grille + notation, n exemplaires. */
  function pedaViergeHtml(s, n) {
    const grillePeda = getGrille("peda");
    const largeurs = { qui: "22mm", temps: "16mm", obs: "55mm" };
    const grille = grillePeda.groupes.map((g) => g.items.map(({ label, max }, i) => `
      <tr>
        ${i === 0 ? `<td rowspan="${g.items.length}" class="ps-groupe" style="width:42mm">${esc(g.groupe)}</td>` : ""}
        <td>${esc(label)}</td>
        <td class="ps-r" style="width:22mm"></td>
        <td class="ps-r" style="width:12mm">${esc(fmtNote(max))}</td>
      </tr>`).join("")).join("");
    const notation = grillePeda.lignes.map(({ label }) => `<tr><td><b>${esc(label)}</b></td>${"<td></td>".repeat(grillePeda.cols.length)}</tr>`).join("");
    const exemplaire = (idx) => `
      <div class="${idx > 0 ? "ps-page-break" : ""}">
        <h1 style="text-align:center">${esc(FICHES.peda.titre.toUpperCase())}</h1>
        <div class="ps-fiche-head">
          <div>Stagiaire(s) : ______________________________</div>
          <div>Séance : ______________________</div>
          <div>Date : ____ / ____ / ________</div>
        </div>
        <table class="ps-grille">
          <tbody>${grille}</tbody>
          <tfoot><tr><td colspan="2" style="text-align:right">NOTE :</td><td></td><td class="ps-r">/${esc(fmtNote(grilleMax("peda")))}</td></tr></tfoot>
        </table>
      </div>
      <div class="ps-page-break">
        <h1 style="text-align:center">${esc(FICHES.peda.titre.toUpperCase())} — NOTATION</h1>
        <div class="ps-fiche-head"><div>Stagiaire(s) : ______________________________</div><div>${esc(s.formation)} ${esc(s.annee_scolaire)}</div></div>
        <table class="ps-fiche">
          <thead><tr><th style="width:28mm"></th>${grillePeda.cols.map(({ k, label }) => `<th${largeurs[k] ? ` style="width:${largeurs[k]}"` : ""}>${esc(label)}</th>`).join("")}</tr></thead>
          <tbody>${notation}</tbody>
        </table>
      </div>`;
    return `<style>@page { size: A4 portrait; margin: 12mm; }</style>${Array.from({ length: Math.max(1, n) }, (_, i) => exemplaire(i)).join("")}`;
  }

  // ---- Évaluation comportement (onglet de la saisie des notes) : une ligne par stagiaire
  function renderComportement(s) {
    const rows = sortRows(getStagiaires(s.id));
    const all = getFicheValues(s.id, "comportement");
    const grilleComp = getGrille("comportement");
    const items = grilleComp.groupes.flatMap((g) => g.items);
    const keys = items.map((c) => c.k);
    const max = grilleMax("comportement");
    const select = (r, item) => {
      const v = (all[r.id] || {})[`c_${item.k}`];
      const choisi = v == null ? null : Number(v);
      return `<select data-comp="${esc(item.k)}" data-sid="${esc(r.id)}" aria-label="${esc(item.label)} — ${esc(r.grade)} ${esc(r.nom)}"
        style="${couleurNiveau(item, choisi)}"
        class="h-8 w-full min-w-[8.5rem] rounded-md border border-zinc-200 bg-white px-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/20 ${choisi == null ? "text-zinc-400" : ""}">
        <option value="" style="background:#fff;color:#a1a1aa">—</option>
        ${item.niveaux.map(({ label, pts }) => `<option value="${pts}" style="${couleurNiveau(item, pts)}"${choisi === pts ? " selected" : ""}>${esc(fmtNote(pts))} — ${esc(label)}</option>`).join("")}
      </select>`;
    };
    const body = rows.length ? rows.map((r) => `
      <tr class="border-t border-zinc-100 hover:bg-zinc-50/60">
        <td class="whitespace-nowrap px-3 py-1.5"><span class="font-mono text-xs text-zinc-500">${esc(r.grade)}</span> <span class="font-medium uppercase">${esc(r.nom)}</span> ${esc(r.prenom)}</td>
        ${items.map((item) => `<td class="px-1 py-1.5">${select(r, item)}</td>`).join("")}
        <td class="whitespace-nowrap px-3 py-1.5 text-right" data-comp-total="${esc(r.id)}">${totalHtml(sumPoints(all[r.id] || {}, keys), max)}</td>
      </tr>`).join("")
      : `<tr><td colspan="${items.length + 2}" class="px-4 py-10 text-center text-sm text-zinc-500">Aucun stagiaire dans cette section.</td></tr>`;
    $("comportement-content").innerHTML = `
      <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center gap-4 border-b border-zinc-100 p-4">
          <h2 class="font-semibold tracking-tight">${esc(FICHES.comportement.titre)}</h2>
          <p class="mr-auto flex items-center gap-2 text-xs text-zinc-500">
            <span class="h-3 w-24 rounded-full" style="background:linear-gradient(90deg,hsl(0 75% 85%),hsl(40 80% 82%),hsl(60 80% 80%),hsl(120 55% 80%))"></span>
            du moins de points au maximum du critère
          </p>
          <button type="button" data-open-grille="comportement"
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-100">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Personnaliser la grille
              </button>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th rowspan="2" class="px-3 py-2 align-bottom font-medium">Stagiaire</th>
                ${grilleComp.groupes.map((g) => `<th colspan="${g.items.length}" class="border-l border-zinc-100 px-2 pt-3 pb-1 text-center font-medium">${esc(g.groupe)} /${esc(fmtNote(groupeMax("comportement", g)))}</th>`).join("")}
                <th rowspan="2" class="px-3 py-2 text-right align-bottom font-medium">Total</th>
              </tr>
              <tr class="border-b border-zinc-100 text-left text-[11px] text-zinc-500">
                ${items.map((item) => `<th class="px-1 pb-2 font-medium">${esc(item.label)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  }

  /** Couleur d'un niveau : rouge pour le moins de points du critère, vert pour le maximum. */
  function couleurNiveau(item, pts) {
    if (pts == null) return "";
    const valeurs = item.niveaux.map((n) => n.pts);
    const min = Math.min(...valeurs);
    const max = Math.max(...valeurs);
    const teinte = Math.round((max === min ? 1 : (pts - min) / (max - min)) * 120);
    return `background-color:hsl(${teinte} 80% 91%);border-color:hsl(${teinte} 55% 60%);color:hsl(${teinte} 70% 22%)`;
  }

  function onComportementChange(el) {
    const sid = Number(el.dataset.sid);
    const item = grilleItems("comportement").find((c) => c.k === el.dataset.comp);
    if (!sid || !item) return;
    const value = el.value === "" ? null : Number(el.value);
    if (value != null && !item.niveaux.some(({ pts }) => pts === value)) return;
    try {
      saveFicheChamp(sid, "comportement", `c_${item.k}`, value);
      const vals = getFicheValues(state.activeSectionId, "comportement")[sid] || {};
      const res = sumPoints(vals, grilleCles("comportement"));
      upsert("notes_pedagogiques", ["stagiaire_id"], ["stagiaire_id", "comportement"], [sid, noteSur20("comportement", res.total)]);
      const cell = $("comportement-content").querySelector(`[data-comp-total="${sid}"]`);
      if (cell) cell.innerHTML = totalHtml(res, grilleMax("comportement"));
      el.classList.toggle("text-zinc-400", value == null);
      el.setAttribute("style", couleurNiveau(item, value));
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
  }

  // ---- Relevé individuel (d'après la feuille « Relevé individuel » de l'Excel), au format attestation :
  //      onglet de la saisie des notes, une page par stagiaire
  const RELEVE_ECOLE = "École des transmissions du numérique et du cyber (ETNC)";
  const RELEVE_TITRE = "Relevé de performances EPMS";
  const RELEVE_EPREUVES = ["ecr", "cmg", "aisance_aquatique"]; // épreuves du relevé Excel
  // Couleurs des pastilles ECR / CMG / AA (teintes de la feuille Excel, assombries pour le texte blanc)
  const RELEVE_COULEURS = { ecr: "#0f9f5a", cmg: "#c0504d", aisance_aquatique: "#2f8fae" };
  const RELEVE_LOGO = "assets/logo-ministere-armees.svg";
  const SIGNATURE_MAX_OCTETS = 1024 * 1024;

  function getParametre(cle) {
    const r = query("SELECT valeur FROM parametres WHERE cle = ?", [cle])[0];
    return r ? r.valeur : null;
  }

  function setParametre(cle, valeur) {
    if (valeur == null) state.db.run("DELETE FROM parametres WHERE cle = ?", [cle]);
    else upsert("parametres", ["cle"], ["cle", "valeur"], [cle, String(valeur)]);
  }

  /** Signature du relevé : image importée par le moniteur ; null si aucune ou désactivée. */
  function releveSignature() {
    if (getParametre("releve_signature_active") === "0") return null;
    return getParametre("releve_signature") || null;
  }

  /** Lignes du relevé : épreuve, date, performance et note (EXEMPT si inapte, dispensé…). */
  function releveLignes(r, dates) {
    return RELEVE_EPREUVES.map((id) => {
      const ep = EPREUVES.find((e) => e.id === id);
      const perf = String(r[`${id}_perf`] ?? "").trim();
      if (estExempte(r, id)) {
        return { id, ep, date: "", perf: "EXEMPT", detail: "note écrite", note: r.ecrit_exemption ?? null };
      }
      const exempt = PERF_SANS_NOTE.includes(norm(perf));
      const detail = id === "aisance_aquatique"
        ? [["nage", r.aisance_aquatique_nage], ["apnée", r.aisance_aquatique_apnee]].filter(([, v]) => v != null).map(([l, v]) => `${l} ${fmtNote(v)} m`).join(" · ")
        : "";
      return {
        id,
        ep,
        date: dates[id] ? fmtDate(dates[id]) : "",
        perf: exempt ? "EXEMPT" : perf,
        detail: exempt ? "" : detail,
        note: exempt ? null : r[id] ?? null,
      };
    });
  }

  /** Relevé au format attestation (aperçu et impression, A4 portrait). */
  function releveSheetHtml(s, r, dates, signature) {
    const sexe = r.sexe === "F" ? "Femme" : r.sexe === "M" ? "Homme" : r.sexe || "—";
    const article = r.sexe === "F" ? "la" : "le";
    const stagiaire = `${esc(r.grade)} ${esc(String(r.nom || "").toUpperCase())} ${esc(r.prenom)}`;
    const lignes = releveLignes(r, dates).map((l) => `
      <tr>
        <td class="ra-c">${esc(l.date) || "—"}</td>
        <td><span class="ra-code" style="background:${RELEVE_COULEURS[l.id]}">${esc(l.ep.short === "Aisance aquatique" ? "AA" : l.ep.short)}</span>${esc(l.ep.label)}</td>
        <td class="ra-c">${l.perf ? `<span class="${l.perf === "EXEMPT" ? "ra-exempt" : ""}">${esc(l.perf)}</span>` : "—"}${l.detail ? `<span class="ra-detail">${esc(l.detail)}</span>` : ""}</td>
        <td class="ra-c ra-note">${l.note == null ? "—" : `${esc(fmtNote(l.note))}<small> / ${NOTE_MAX}</small>`}</td>
      </tr>`).join("");
    const info = (label, value) => `<div><dt>${label}</dt><dd>${value || "—"}</dd></div>`;
    return `
      <div class="releve-att">
        <header class="ra-head">
          <img class="ra-logo" src="${esc(RELEVE_LOGO)}" alt="Ministère des Armées">
          <div class="ra-ecole">
            <strong>${esc(RELEVE_ECOLE)}</strong>
            <span>Section EPMS — ${esc(s.formation)} · Année scolaire ${esc(s.annee_scolaire)}</span>
          </div>
        </header>

        <h1 class="ra-titre">${esc(RELEVE_TITRE)}</h1>

        <p class="ra-objet"><b>OBJET :</b> relevé individuel des résultats aux épreuves physiques ECR, CMG et AA.</p>

        <dl class="ra-infos">
          ${info("Grade", esc(r.grade))}
          ${info("Nom", esc(String(r.nom || "").toUpperCase()))}
          ${info("Prénom", esc(r.prenom))}
          ${info("Sexe", esc(sexe))}
          ${info("Armée", esc(r.armee))}
          ${info("Stage", esc(s.formation))}
        </dl>

        <p class="ra-texte">Je soussigné(e) <b>${esc(s.moniteur)}</b>, moniteur EPMS, certifie que ${article} <b>${stagiaire}</b>
          a réalisé les épreuves suivantes en obtenant les résultats ci-dessous :</p>

        <table class="ra-table">
          <colgroup><col style="width:26mm"><col><col style="width:38mm"><col style="width:26mm"></colgroup>
          <thead><tr><th>Date</th><th>Épreuve</th><th>Performance</th><th>Note</th></tr></thead>
          <tbody>${lignes}</tbody>
        </table>

        <div class="ra-bas">
          <p class="ra-fait">Fait le ${esc(fmtDate(todayIso()))}</p>
          <div class="ra-signature">
            <p class="ra-fonction">Moniteur EPMS</p>
            <p class="ra-nom">${esc(s.moniteur)}</p>
            ${signature ? `<img src="${esc(signature)}" alt="Signature">` : '<div class="ra-sans-signature"></div>'}
          </div>
        </div>

        <footer class="ra-pied">
          <p class="ra-mention">En cas de perte, aucun duplicata ne sera délivré.</p>
          <p>${esc(RELEVE_ECOLE)}</p>
        </footer>
      </div>`;
  }

  function renderReleve(s) {
    const rows = sortRows(getStagiairesAvecNotes(s.id));
    if (!rows.some((r) => r.id === state.releveSid)) state.releveSid = rows.length ? rows[0].id : null;
    const r = rows.find((x) => x.id === state.releveSid);
    if (!r) {
      $("releve-content").innerHTML = '<div class="rounded-lg border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">Aucun stagiaire dans cette section.</div>';
      return;
    }
    // Sélection pour l'impression groupée : uniquement des stagiaires de la section
    const ids = new Set(rows.map((x) => x.id));
    for (const id of state.releveSel) if (!ids.has(id)) state.releveSel.delete(id);
    const nSel = state.releveSel.size;
    const check = "h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-sky-600";
    const liste = rows.map((x) => `
      <div class="flex items-center gap-1 rounded-md pl-3 ${x.id === r.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}">
        <input type="checkbox" data-releve-check="${esc(x.id)}" ${state.releveSel.has(x.id) ? "checked" : ""} class="${check}"
          aria-label="Sélectionner ${esc(x.nom)} ${esc(x.prenom)} pour l'impression">
        <button type="button" data-releve-select="${esc(x.id)}" class="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm">
          <span class="font-mono text-xs ${x.id === r.id ? "text-zinc-300" : "text-zinc-500"}">${esc(x.grade)}</span> <span class="font-medium uppercase">${esc(x.nom)}</span> ${esc(x.prenom)}
        </button>
      </div>`).join("");
    const active = getParametre("releve_signature_active") !== "0";
    const signature = getParametre("releve_signature");
    const btn = "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-zinc-100";

    $("releve-content").innerHTML = `
      <div class="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div class="h-fit space-y-4">
          <div class="rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
            <label class="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
              <input type="checkbox" data-releve-check-all ${nSel === rows.length ? "checked" : ""} class="${check}">
              <span class="flex-1">Tout sélectionner</span>
              <span class="normal-case tabular-nums">${nSel}/${rows.length}</span>
            </label>
            <div class="mt-1">${liste}</div>
            <div class="mt-2 border-t border-zinc-100 p-2">
              <button type="button" data-releve-print-sel ${nSel ? "" : "disabled"} class="${btn} disabled:pointer-events-none disabled:opacity-50">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                ${nSel ? `Imprimer les relevés cochés (${nSel})` : "Cochez des stagiaires"}
              </button>
            </div>
          </div>

          <div class="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Signature</p>
            ${signature ? `
            <label class="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" data-releve-signature-active ${active ? "checked" : ""} class="h-4 w-4 rounded border-zinc-300">
              Ajouter la signature
            </label>
            <div class="flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-2 ${active ? "" : "opacity-40"}">
              <img src="${esc(signature)}" alt="Signature" class="max-h-full max-w-full object-contain">
            </div>` : `
            <p class="text-sm text-zinc-500">Aucune signature : importez l'image de votre signature pour l'ajouter au relevé.</p>`}
            <label class="${btn} cursor-pointer">
              <input type="file" accept="image/png,image/jpeg,image/webp" data-releve-signature-file class="sr-only">
              ${signature ? "Remplacer la signature…" : "Importer une signature…"}
            </label>
            ${signature ? `<button type="button" data-releve-signature-reset class="${btn} text-red-600">Supprimer la signature</button>` : ""}
          </div>
        </div>

        <div class="min-w-0 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100 p-4 shadow-sm">
          <div class="mx-auto w-fit bg-white p-[15mm] shadow">${releveSheetHtml(s, r, getDatesEpreuves(s.id), releveSignature())}</div>
        </div>
      </div>`;
    const all = $("releve-content").querySelector("[data-releve-check-all]");
    if (all) all.indeterminate = nSel > 0 && nSel < rows.length; // sélection partielle
  }

  function onReleveCheck(el) {
    const rows = getStagiaires(state.activeSectionId);
    if (el.matches("[data-releve-check-all]")) {
      state.releveSel = new Set(el.checked ? rows.map((x) => x.id) : []);
    } else {
      const id = Number(el.dataset.releveCheck);
      if (el.checked) state.releveSel.add(id);
      else state.releveSel.delete(id);
    }
    renderReleve(getSection(state.activeSectionId));
  }

  function onReleveSignatureChange(el) {
    if (el.matches("[data-releve-signature-active]")) {
      setParametre("releve_signature_active", el.checked ? "1" : "0");
      persist();
      renderReleve(getSection(state.activeSectionId));
      return;
    }
    if (!el.matches("[data-releve-signature-file]")) return;
    const file = el.files && el.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast("Format attendu : image PNG, JPEG ou WebP.", "error");
      return;
    }
    if (file.size > SIGNATURE_MAX_OCTETS) {
      toast("Image trop lourde (1 Mo maximum).", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setParametre("releve_signature", reader.result);
        setParametre("releve_signature_active", "1");
      } catch (e) {
        toast(`Erreur base de données : ${errMsg(e)}`, "error");
        return;
      }
      persist();
      renderReleve(getSection(state.activeSectionId));
      toast("Signature enregistrée.");
    };
    reader.onerror = () => toast("Lecture de l'image impossible.", "error");
    reader.readAsDataURL(file);
  }

  function relevePrintHtml(s) {
    const rows = sortRows(getStagiairesAvecNotes(s.id));
    // Impression groupée : stagiaires cochés ; sinon le relevé affiché
    const cibles = state.printSelReleve ? rows.filter((r) => state.releveSel.has(r.id)) : rows.filter((r) => r.id === state.releveSid);
    const dates = getDatesEpreuves(s.id);
    const signature = releveSignature();
    const pages = cibles.map((r, idx) => `<div class="${idx > 0 ? "ps-page-break" : ""}">${releveSheetHtml(s, r, dates, signature)}</div>`).join("");
    return `<style>@page { size: A4 portrait; margin: 15mm; }</style>${pages || '<p class="ps-empty">Aucun stagiaire.</p>'}`;
  }


  /** Largeur imprimée souhaitée d'une colonne (mm) : assez de place pour écrire à la main. */
  function ficheColWidth(c) {
    if (c.custom || c.type === "distance") return 20;
    if (c.type === "date" || c.k === "perf") return 18;
    if (c.k === "pompes" || c.k === "tractions") return 15;
    if (c.k === "num") return 12;
    return 13;
  }

  // ---- Impression groupée des fiches terrain (fenêtre « Imprimer / Exporter PDF »)
  /** Fiches imprimables pour la section : en CT1, test initial et test final de chaque fiche physique. */
  function fichesImprimables(s) {
    return ["mco", "natation", "f2400", "peda"].flatMap((base) => {
      if (s.formation === "CT1" && FICHES_CT1.includes(base)) return FICHE_VARIANTES.map(([v]) => `${base}_${v}`);
      return [base];
    }).map((id) => [id, id === "peda" ? `${FICHES.peda.titre} (fiches vierges)` : FICHES[id].titre]);
  }

  /** Plusieurs fiches dans un seul document : une mise en page A4 portrait commune, chaque fiche sur une nouvelle page. */
  function fichesPrintHtml(s, ids, exemplaires = 1) {
    return "<style>@page { size: A4 portrait; margin: 8mm; }</style>" + ids.filter((id) => FICHES[id]).map((id, i) =>
      `<div class="${i > 0 ? "ps-page-break" : ""}">${fichePrintHtml(s, id, exemplaires).replace(/<style>@page[^<]*<\/style>/g, "")}</div>`).join("");
  }

  let printReturnFocus = null;
  const PRINT_EXEMPLAIRES_MAX = 200;

  function openPrintModal() {
    const s = state.db && getSection(state.activeSectionId);
    if (!s) return;
    printReturnFocus = document.activeElement;
    const actuelle = ficheActive();
    const effectif = getStagiaires(s.id).length;
    $("print-list").innerHTML = fichesImprimables(s).map(([id, label]) => `
      <li class="flex items-center gap-3 px-6 py-2.5 text-sm hover:bg-zinc-50">
        <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input type="checkbox" data-print-fiche="${esc(id)}" ${id === actuelle ? "checked" : ""} class="h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900">
          <span class="min-w-0 flex-1">${esc(label)}</span>
          ${id === actuelle ? '<span class="shrink-0 text-xs text-zinc-400">affichée</span>' : ""}
        </label>
        ${id === "peda" ? `<label class="flex shrink-0 items-center gap-2 text-xs text-zinc-500">Exemplaires
          <input type="number" id="print-exemplaires" min="1" max="${PRINT_EXEMPLAIRES_MAX}" step="1" value="${Math.max(1, effectif)}"
            class="h-8 w-16 rounded-md border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20"></label>` : ""}
      </li>`).join("");
    updatePrintModal();
    $("print-modal").hidden = false;
    $("print-all").focus();
  }

  function closePrintModal() {
    if ($("print-modal").hidden) return;
    $("print-modal").hidden = true;
    if (printReturnFocus && printReturnFocus.focus && document.contains(printReturnFocus)) printReturnFocus.focus();
  }

  function printModalSelection() {
    return [...$("print-list").querySelectorAll("[data-print-fiche]:checked")].map((el) => el.dataset.printFiche);
  }

  function updatePrintModal() {
    const n = printModalSelection().length;
    const total = $("print-list").querySelectorAll("[data-print-fiche]").length;
    $("print-all").checked = n === total;
    $("print-all").indeterminate = n > 0 && n < total;
    $("print-count").textContent = `${n}/${total}`;
    $("print-go").disabled = !n;
    $("print-go").querySelector("span").textContent = n ? `Imprimer / PDF (${n} fiche${n > 1 ? "s" : ""})` : "Choisissez des fiches";
  }

  function onPrintModalChange(event) {
    if (event.target.id === "print-all") {
      $("print-list").querySelectorAll("[data-print-fiche]").forEach((el) => { el.checked = event.target.checked; });
    }
    updatePrintModal();
  }

  function onPrintModalClick(event) {
    if (event.target.closest("[data-close-print]") || event.target.id === "print-modal") return closePrintModal();
    if (!event.target.closest("#print-go")) return;
    const ids = printModalSelection();
    if (!ids.length) return;
    const champ = $("print-exemplaires");
    const exemplaires = Math.min(PRINT_EXEMPLAIRES_MAX, Math.max(1, Math.floor(Number(champ && champ.value)) || 1));
    closePrintModal();
    state.printFiches = ids;
    state.printExemplaires = exemplaires;
    printSheet().finally(() => { state.printFiches = null; });
  }

  const FICHE_PAGE_W = 194; // A4 portrait moins les marges de 8 mm
  const FICHE_ID_COLS = [["N°", 6, "ps-num"], ["Grade", 10, "ps-l"], ["Nom", 23, "ps-l"], ["Prénom", 18, "ps-l"], ["Sexe", 8, ""], ["Armée", 11, "ps-l"]];

  /**
   * Fiche imprimable. Fiches physiques : noms des stagiaires et cases vides à remplir à la main.
   * Évaluation péda : fiches vierges, en autant d'exemplaires que demandé.
   */
  function fichePrintHtml(s, id = ficheActive(), exemplaires = 1) {
    const fiche = FICHES[id];
    if (fiche.kind === "peda") return pedaViergeHtml(s, exemplaires);
    const cols = ficheCols(id).filter((c) => c.visible);
    const rows = sortRows(getStagiaires(s.id));
    const dates = getDatesEpreuves(s.id);
    const blanks = 3; // lignes libres pour un stagiaire ajouté au dernier moment
    const body = rows.map((r, i) => `
      <tr>
        <td class="ps-num">${i + 1}</td><td>${esc(r.grade)}</td><td class="ps-upper">${esc(r.nom)}</td><td>${esc(r.prenom)}</td>
        <td class="ps-c">${esc(r.sexe)}</td><td>${esc(r.armee)}</td>
        ${"<td></td>".repeat(cols.length)}
      </tr>`).join("") +
      Array.from({ length: blanks }, (_, i) => `<tr><td class="ps-num">${rows.length + i + 1}</td>${"<td></td>".repeat(cols.length + 5)}</tr>`).join("");
    const dateLine = fiche.dates.map(([ep, label]) => `<span>${esc(label)} : ${dates[ep] ? esc(fmtDate(dates[ep])) : "___ / ___ / ______"}</span>`).join("");
    // Colonnes réduites proportionnellement si elles dépassent la largeur du portrait
    const idW = FICHE_ID_COLS.reduce((a, [, w]) => a + w, 0);
    const wanted = cols.map(ficheColWidth);
    const k = Math.min(1, (FICHE_PAGE_W - idW) / (wanted.reduce((a, b) => a + b, 0) || 1));
    return `
      <style>@page { size: A4 portrait; margin: 8mm; }</style>
      <h1 style="text-align:center">${esc(fiche.titre)}</h1>
      <div class="ps-fiche-head">
        <div class="ps-date">${dateLine}</div>
        <div class="ps-stage">${esc(s.formation)} ${esc(s.annee_scolaire)} · Moniteur : ${esc(s.moniteur)}</div>
      </div>
      <table class="ps-fiche">
        <thead><tr>
          ${FICHE_ID_COLS.map(([label, w, cls]) => `<th class="${cls}" style="width:${w}mm">${label}</th>`).join("")}
          ${cols.map((c, i) => `<th style="width:${(wanted[i] * k).toFixed(1)}mm">${esc(c.label)}</th>`).join("")}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="ps-foot">
        <span>Effectif : ${rows.length}</span>
        <span>Édité le ${esc(fmtDate(todayIso()))}</span>
      </div>`;
  }


  // ---------------------------------------------------------------------------
  // Export des notes : impression, PDF ou classeur Excel (.xlsx)
  // ---------------------------------------------------------------------------
  const nomExport = (s) => `Notes ${s.formation} ${s.annee_scolaire}`.replace(/[\\/:*?"<>|]/g, "-");

  /**
   * Feuille « Notes », mise en page de la feuille « Notes » du fichier Excel : bloc formation / stage / moniteur,
   * une colonne Perf / Note / Note × coef par épreuve, moyenne physique, notes pédagogiques, moyennes.
   */
  function notesFeuilleExcel(s) {
    const rows = sortRows(getStagiairesAvecNotes(s.id));
    const dates = getDatesEpreuves(s.id);
    const n = (v) => (v == null || v === "" ? null : round2(Number(v)));
    // Couleurs de la feuille Excel
    const GRIS = "C0C0C0", CALCUL = "BFBFBF", ORANGE = "FFCC99", VERT = "CCFFCC", JAUNE = "FFFF00";
    const COULEURS = { m_co: "9BBB59", ecr: "00BC55", cmg: "D99694", aisance_aquatique: "4BACC6", traction: "F79646" };
    const NOMS = { m_co: "M_CO", ecr: "ECR", cmg: "CMG", aisance_aquatique: "Aisa.Aqua", traction: "TRACTIONS" };
    const cadre = { border: true, align: "center", wrap: true };
    const titre = (v, fill, extra = {}) => ({ v, s: { ...cadre, bold: true, sz: 10, fill, ...extra } });
    const val = (v, fill, extra = {}) => ({ v, s: { ...cadre, sz: 12, fill, ...extra } });

    // Colonnes : A n°, B grade, C nom, D prénom, E (élève étranger, masquée), F armée, G origine, H sexe,
    // puis par épreuve Perf / [nage / apnée] / Note / Note × coef, Z vide, AA moyenne physique, AB vide,
    // AC comportement, AD péda, AE test écrit, AF total, AG vide, AH moyenne pédagogique, AI vide, AJ moyenne E²PMS
    const blocs = [];
    let c = 8; // index 0 de la colonne I
    for (const ep of EPREUVES) {
      const extras = ep.id === "aisance_aquatique" ? 2 : 0;
      blocs.push({ ep, perf: c, extras, note: c + 1 + extras, coef: c + 2 + extras });
      c += 3 + extras;
    }
    const COL = { vide1: c, physique: c + 1, vide2: c + 2, comp: c + 3, peda: c + 4, ecrit: c + 5, total: c + 6, vide3: c + 7, moyPeda: c + 8, vide4: c + 9, e2pms: c + 10 };
    const nbCols = COL.e2pms + 1;
    const ligne = () => Array(nbCols).fill(null);
    const coefPeda = Object.fromEntries(NOTES.pedagogiques.fields.map(([f]) => [f, coefOf(f, s.formation)]));

    const l1 = ligne();
    l1[0] = { v: "TESTS FINAUX\nGRILLE DE NOTATION EPMS", s: { bold: true, sz: 16, fill: GRIS, align: "center", wrap: true } };
    const l3 = ligne(), l4 = ligne(), l5 = ligne(), l6 = ligne(), l7 = ligne();
    l3[2] = titre("FORMATION :", ORANGE); l3[3] = titre(s.formation, CALCUL);
    l4[2] = titre("STAGE :", ORANGE); l4[3] = titre(`${s.annee_scolaire}${periodLabel(s) ? ` — ${periodLabel(s)}` : ""}`, CALCUL);
    l5[2] = titre("MONITEUR :", ORANGE); l5[3] = titre(s.moniteur, CALCUL);
    ["GRADE", "NOM", "PRENOM", null, "Armée", "origine de recrutement"].forEach((t, i) => { if (t) l7[1 + i] = titre(t); });
    l7[7] = titre("sexe", VERT);
    for (const b of blocs) {
      const e = b.ep.id;
      l5[b.perf] = { v: NOMS[e], s: { ...cadre, sz: 11, fill: COULEURS[e], color: "FFFFFF", bold: true } };
      for (let i = b.perf + 1; i <= b.note; i++) l5[i] = { v: null, s: { ...cadre, fill: COULEURS[e] } };
      l5[b.coef] = titre(coefOf(e, s.formation), VERT);
      l6[b.note - 1] = titre("Date:");
      l6[b.note] = { v: dates[e] ? fmtDate(dates[e]) : "", s: { ...cadre, sz: 8 } };
      for (let i = b.perf; i < b.note - 1; i++) l6[i] = { v: null, s: cadre };
      l6[b.coef] = { v: null, s: cadre };
      l7[b.perf] = titre("Perf");
      if (b.extras) { l7[b.perf + 1] = titre("Distance de nage"); l7[b.perf + 2] = titre("Distance d'apnée"); }
      l7[b.note] = titre("Note");
      l7[b.coef] = { v: null, s: cadre };
    }
    l5[COL.physique] = titre("Moyenne\nPhysique", VERT, { sz: 11 });
    for (const k of ["comp", "peda", "ecrit"]) l5[COL[k]] = titre(null, VERT);
    l5[COL.total] = titre(round2(Object.values(coefPeda).reduce((a, b) => a + b, 0)), VERT);
    l6[COL.comp] = titre(coefPeda.comportement, VERT);
    l6[COL.peda] = titre(coefPeda.pedagogie, VERT);
    l6[COL.ecrit] = titre(coefPeda.test_ecrit, VERT);
    l6[COL.total] = titre(null, VERT);
    l7[COL.comp] = titre("Comportement"); l7[COL.peda] = titre("Péda"); l7[COL.ecrit] = titre("Test écrit"); l7[COL.total] = titre("total");
    l5[COL.moyPeda] = titre("Moyenne\nPédagogique", VERT, { sz: 11 });
    l5[COL.e2pms] = titre("Moyenne\nE²PMS", JAUNE, { sz: 11 });

    const donnees = rows.map((r, i) => {
      const l = ligne();
      l[0] = { v: i + 1, s: { bold: true, sz: 10, align: "center" } };
      l[1] = val(r.grade, CALCUL, { bold: true, sz: 10 });
      l[2] = val(String(r.nom || "").toUpperCase(), CALCUL, { bold: true, sz: 10 });
      l[3] = val(r.prenom, CALCUL, { bold: true, sz: 10 });
      l[5] = val(r.armee, CALCUL, { bold: true, sz: 10 });
      l[6] = val(r.origine_recrutement, CALCUL, { bold: true, sz: 10 });
      l[7] = val(r.sexe === "F" ? "Femme" : r.sexe === "M" ? "Homme" : r.sexe, CALCUL, { bold: true, sz: 10 });
      for (const b of blocs) {
        const e = b.ep.id;
        const exempt = estExempte(r, e);
        const note = n(noteRetenue(r, e));
        l[b.perf] = val(exempt ? "Exempté (écrit)" : r[`${e}_perf`] || null);
        if (b.extras) { l[b.perf + 1] = val(exempt ? null : n(r.aisance_aquatique_nage), CALCUL); l[b.perf + 2] = val(exempt ? null : n(r.aisance_aquatique_apnee), CALCUL); }
        l[b.note] = val(note, CALCUL, { bold: true });
        l[b.coef] = val(note == null ? null : round2(note * coefOf(e, s.formation)), CALCUL, { bold: true });
      }
      const moyPeda = n(average(r, "pedagogiques").avg);
      l[COL.physique] = val(n(average(r, "physiques").avg), GRIS, { bold: true });
      l[COL.comp] = val(n(r.comportement));
      l[COL.peda] = val(n(r.pedagogie));
      l[COL.ecrit] = val(n(r.test_ecrit));
      l[COL.total] = val(moyPeda, CALCUL);
      l[COL.moyPeda] = val(moyPeda, GRIS, { bold: true, sz: 11 });
      l[COL.e2pms] = val(n(averageGenerale(r).avg), GRIS, { bold: true });
      return l;
    });

    const lettre = (i) => { let t = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) t = String.fromCharCode(65 + ((i - 1) % 26)) + t; return t; };
    const fusions = [`A1:${lettre(nbCols - 1)}2`, "C5:C6", "D5:D6", `${lettre(COL.physique)}5:${lettre(COL.physique)}7`,
      `${lettre(COL.comp)}5:${lettre(COL.ecrit)}5`, `${lettre(COL.moyPeda)}5:${lettre(COL.moyPeda)}7`, `${lettre(COL.e2pms)}5:${lettre(COL.e2pms)}7`,
      ...blocs.map((b) => `${lettre(b.perf)}5:${lettre(b.note)}5`)];
    const largeurs = Array(nbCols).fill(13);
    Object.assign(largeurs, { 0: 4, 1: 8.5, 2: 23.7, 3: 16.2, 4: 6, 5: 8.8, 6: 15.6, 7: 10.7 });
    for (const b of blocs) {
      largeurs[b.perf] = 11.8; largeurs[b.note] = b.extras ? 12.8 : 12.8; largeurs[b.coef] = 6.6;
      if (b.extras) { largeurs[b.perf + 1] = 20.3; largeurs[b.perf + 2] = 13; }
    }
    Object.assign(largeurs, { [COL.vide1]: 2.8, [COL.physique]: 13.4, [COL.vide2]: 1.7, [COL.comp]: 19.6, [COL.peda]: 13, [COL.ecrit]: 14.8,
      [COL.total]: 12.8, [COL.vide3]: 2, [COL.moyPeda]: 13.4, [COL.vide4]: 1.7, [COL.e2pms]: 16.8 });
    return {
      nom: "Notes",
      lignes: [l1, ligne(), l3, l4, l5, l6, l7, ...donnees],
      cols: largeurs.map((w, i) => ({ w, hidden: i === 4 })), // E : « élève étranger », masquée comme dans l'Excel
      fusions,
      hauteurs: { 1: 14.25, 2: 33, 5: 27.75, 6: 13.5, 7: 33.75, ...Object.fromEntries(donnees.map((_, i) => [8 + i, 20.1])) },
      figer: { lignes: 7, colonnes: 4 },
      paysage: true,
    };
  }

  // ---- Écriture d'un classeur .xlsx (zip non compressé de fichiers XML), sans bibliothèque externe
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Archive zip « stockée » (sans compression) : [{ nom, contenu (texte) }] → Uint8Array. */
  function zipStocke(fichiers) {
    const enc = new TextEncoder();
    const locaux = [];
    const centraux = [];
    let offset = 0;
    for (const f of fichiers) {
      const nom = enc.encode(f.nom);
      const data = enc.encode(f.contenu);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // noms en UTF-8
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nom.length, true);
      locaux.push(new Uint8Array(local.buffer), nom, data);
      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true);
      central.setUint32(24, data.length, true);
      central.setUint16(28, nom.length, true);
      central.setUint32(42, offset, true);
      centraux.push(new Uint8Array(central.buffer), nom);
      offset += 30 + nom.length + data.length;
    }
    const tailleCentral = centraux.reduce((a, b) => a + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, fichiers.length, true);
    fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true);
    fin.setUint32(16, offset, true);
    const parts = [...locaux, ...centraux, new Uint8Array(fin.buffer)];
    const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
    let p = 0;
    for (const part of parts) { out.set(part, p); p += part.length; }
    return out;
  }

  /**
   * Classeur Excel. Chaque feuille : { nom, lignes, cols?, fusions?, hauteurs?, figer?, paysage? }.
   * Une cellule est une valeur (texte / nombre) ou { v, s } avec s = { bold, sz, color, fill, align, wrap, border }.
   */
  function xlsxClasseur(feuilles) {
    const x = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    const col = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
    const noms = new Set();
    const nomFeuille = (nom) => {
      const base = String(nom).replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Feuille";
      let n = base;
      for (let i = 2; noms.has(n.toLowerCase()); i++) n = `${base.slice(0, 28)} ${i}`;
      noms.add(n.toLowerCase());
      return n;
    };

    // Styles : polices, remplissages et formats de cellule dédoublonnés
    const polices = ['<font><sz val="11"/><name val="Calibri"/></font>'];
    const remplissages = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const formats = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const index = (liste, xml) => { let i = liste.indexOf(xml); if (i < 0) { liste.push(xml); i = liste.length - 1; } return i; };
    const style = (s) => {
      if (!s) return 0;
      const font = index(polices, `<font>${s.bold ? "<b/>" : ""}<sz val="${s.sz || 11}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ""}<name val="Calibri"/></font>`);
      const fill = s.fill ? index(remplissages, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const align = s.align || s.wrap ? `<alignment${s.align ? ` horizontal="${s.align}"` : ""} vertical="center"${s.wrap ? ' wrapText="1"' : ""}/>` : "";
      return index(formats, `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`);
    };
    const cellule = (c, ref) => {
      const { v, s } = c != null && typeof c === "object" ? c : { v: c, s: null };
      const st = style(s);
      const a = st ? ` s="${st}"` : "";
      if (v == null || v === "") return st ? `<c r="${ref}"${a}/>` : "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${a}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${a}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    };

    const fichiersFeuilles = feuilles.map((f, fi) => {
      const lignes = f.lignes.map((l, li) => {
        const h = f.hauteurs && f.hauteurs[li + 1];
        return `<row r="${li + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${l.map((c, ci) => cellule(c, `${col(ci)}${li + 1}`)).join("")}</row>`;
      }).join("");
      const largeurs = f.cols || (f.lignes[0] || []).map((_, ci) => ({ w: Math.min(48, Math.max(6, ...f.lignes.map((l) => String((l[ci] && l[ci].v !== undefined ? l[ci].v : l[ci]) ?? "").length + 2))) }));
      const fig = f.figer || { lignes: 1, colonnes: 0 };
      const pane = fig.lignes || fig.colonnes
        ? `<pane${fig.colonnes ? ` xSplit="${fig.colonnes}"` : ""}${fig.lignes ? ` ySplit="${fig.lignes}"` : ""} topLeftCell="${col(fig.colonnes)}${fig.lignes + 1}" activePane="${fig.colonnes && fig.lignes ? "bottomRight" : fig.lignes ? "bottomLeft" : "topRight"}" state="frozen"/>`
        : "";
      return {
        nom: `xl/worksheets/sheet${fi + 1}.xml`,
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
${largeurs.length ? `<cols>${largeurs.map((c, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${c.w}" customWidth="1"${c.hidden ? ' hidden="1"' : ""}/>`).join("")}</cols>` : ""}
<sheetData>${lignes}</sheetData>
${f.fusions && f.fusions.length ? `<mergeCells count="${f.fusions.length}">${f.fusions.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}
<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
${f.paysage ? '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>' : ""}
</worksheet>`,
      };
    });
    const sheets = feuilles.map((f, i) => `<sheet name="${x(nomFeuille(f.nom))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
    return zipStocke([
      {
        nom: "[Content_Types].xml",
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
      },
      {
        nom: "_rels/.rels",
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      },
      {
        nom: "xl/workbook.xml",
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
      },
      {
        nom: "xl/_rels/workbook.xml.rels",
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      },
      ...fichiersFeuilles,
      {
        // Styles construits au fil des feuilles : écrits en dernier
        nom: "xl/styles.xml",
        contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${polices.length}">${polices.join("")}</fonts>
<fills count="${remplissages.length}">${remplissages.join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${formats.length}">${formats.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
      },
    ]);
  }

  function telecharger(octets, nom, type) {
    const url = URL.createObjectURL(new Blob([octets], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exporterExcelNotes() {
    const s = state.db && getSection(state.activeSectionId);
    if (!s) return;
    try {
      telecharger(xlsxClasseur([notesFeuilleExcel(s)]), `${nomExport(s)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      toast("Classeur Excel exporté");
    } catch (e) {
      toast(`Export Excel impossible : ${errMsg(e)}`, "error");
    }
  }

  /** Impression ; pour le PDF, le titre de la page donne son nom au fichier proposé par « Enregistrer au format PDF ». */
  function imprimerNotes(pdf) {
    const s = state.db && getSection(state.activeSectionId);
    if (!s) return;
    const titre = document.title;
    if (pdf) {
      document.title = nomExport(s);
      toast("Choisissez « Enregistrer au format PDF » comme imprimante");
    }
    printSheet().finally(() => { document.title = titre; });
  }

  let exportReturnFocus = null;

  function openExportModal() {
    exportReturnFocus = document.activeElement;
    $("export-modal").hidden = false;
    $("export-modal").querySelector("[data-export]").focus();
  }

  function closeExportModal() {
    if ($("export-modal").hidden) return;
    $("export-modal").hidden = true;
    if (exportReturnFocus && exportReturnFocus.focus && document.contains(exportReturnFocus)) exportReturnFocus.focus();
  }

  function onExportModalClick(event) {
    if (event.target.closest("[data-close-export]") || event.target.id === "export-modal") return closeExportModal();
    const btn = event.target.closest("[data-export]");
    if (!btn) return;
    closeExportModal();
    if (btn.dataset.export === "excel") exporterExcelNotes();
    else imprimerNotes(btn.dataset.export === "pdf");
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------
  function bindEvents() {
    $("btn-authorize").addEventListener("click", onAuthorizeClick);
    $("btn-copy-path").addEventListener("click", () => {
      copyText(projectPath()).then(flashCopied, () => toast("Copie impossible : sélectionnez le chemin manuellement.", "error"));
    });
    $("btn-access-cancel").addEventListener("click", hideAccessModal);

    // Navigation
    window.addEventListener("hashchange", applyRoute);
    document.addEventListener("click", (e) => {
      const goto = e.target.closest("[data-goto]");
      if (goto) setTab(goto.dataset.goto);
      const open = e.target.closest("[data-open-sections]");
      if (open) openSectionsModal(open.dataset.openSections === "new");
      if (e.target.closest("[data-close-sections]") || e.target.id === "sections-modal") closeSectionsModal();
    });

    // Sections
    $("section-form").addEventListener("submit", onSectionSubmit);
    $("section-form-cancel").addEventListener("click", () => { resetSectionForm(); refreshAll(); });
    $("sections-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === "select-section") {
        state.activeSectionId = id;
        lsSet("activeSection", id);
        state.search = "";
        $("search").value = "";
        closeSectionsModal();
        const s = getSection(id);
        if (s) toast(`Section active : ${sectionLabel(s)}`);
      } else if (btn.dataset.action === "edit-section") {
        startEditSection(id);
      } else if (btn.dataset.action === "delete-section") {
        deleteSection(id);
      }
    });

    // Stagiaires
    $("active-section").addEventListener("change", (e) => {
      const value = e.target.value;
      if (value === "__new" || value === "__manage") {
        e.target.value = String(state.activeSectionId);
        openSectionsModal(value === "__new");
        return;
      }
      state.activeSectionId = Number(value) || null;
      lsSet("activeSection", state.activeSectionId);
      refreshAll();
    });
    $("search").addEventListener("input", (e) => {
      state.search = e.target.value;
      if (state.db && state.activeSectionId) renderStagiaires(getStagiaires(state.activeSectionId));
    });
    $("stagiaires-head").addEventListener("click", (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      state.sort = th.dataset.sort === state.sort.key
        ? { key: state.sort.key, dir: -state.sort.dir }
        : { key: th.dataset.sort, dir: th.dataset.sort === "grade" ? -1 : 1 };
      renderStagiaires(getStagiaires(state.activeSectionId));
    });
    $("stagiaires-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === "edit-stagiaire") openStagiaireModal(id);
      else if (btn.dataset.action === "delete-stagiaire") deleteStagiaire(id);
    });
    $("btn-add-stagiaire").addEventListener("click", () => openStagiaireModal(null));

    // Emploi du temps
    $("btn-add-creneau").addEventListener("click", () => openEdtModal(null));
    $("edt-form").addEventListener("submit", onEdtSubmit);

    // Fiches terrain
    $("comportement-content").addEventListener("change", (e) => { if (state.db && e.target.matches("[data-comp]")) onComportementChange(e.target); });
    $("comportement-content").addEventListener("click", (e) => { if (e.target.closest("[data-open-grille]")) openGrilleModal("comportement"); });
    $("fiche-content").addEventListener("click", (e) => {
      if (e.target.closest("[data-open-cols]")) openColsModal();
      const grille = e.target.closest("[data-open-grille]");
      if (grille) openGrilleModal(grille.dataset.openGrille);
    });
    $("releve-content").addEventListener("change", (e) => {
      if (e.target.matches("[data-releve-check], [data-releve-check-all]")) onReleveCheck(e.target);
      else onReleveSignatureChange(e.target);
    });
    $("releve-content").addEventListener("click", (e) => {
      const pick = e.target.closest("[data-releve-select]");
      if (pick) {
        state.releveSid = Number(pick.dataset.releveSelect);
        renderReleve(getSection(state.activeSectionId));
      }
      if (e.target.closest("[data-releve-signature-reset]")) {
        setParametre("releve_signature", null);
        persist();
        renderReleve(getSection(state.activeSectionId));
      }
      if (e.target.closest("[data-releve-print-sel]") && state.releveSel.size) {
        state.printSelReleve = true;
        printSheet().finally(() => { state.printSelReleve = false; });
      }
    });
    window.addEventListener("afterprint", () => { state.printSelReleve = false; });
    $("cols-modal").addEventListener("change", onColsChange);
    $("cols-modal").addEventListener("click", onColsClick);
    $("cols-list").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("[data-col-label]")) e.target.blur();
    });
    $("col-add-form").addEventListener("submit", onColAdd);
    $("fiche-content").addEventListener("keydown", onNoteKeydown);
    $("fiche-content").addEventListener("focusin", (e) => { if (e.target.matches('input[data-col]:not([type="date"])')) e.target.select(); });
    $("edt-form").addEventListener("change", onComboChange);
    $("activite-add-form").addEventListener("submit", onActiviteAdd);
    $("activites-list").addEventListener("change", onActiviteRename);
    $("activites-list").addEventListener("click", onActiviteClick);
    $("activites-list").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input[data-activite-id]")) e.target.blur();
    });
    $("tab-edt").addEventListener("change", onEdtHeaderChange);
    $("tab-edt").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && EDT_SECTION_FIELDS[e.target.id]) e.target.blur();
    });
    $("edt-tbody").addEventListener("change", onEdtInlineChange);
    $("edt-tbody").addEventListener("keydown", onEdtInlineKeydown);
    $("edt-tbody").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-edt-action]");
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.edtAction === "edit") openEdtModal(id, false);
      else if (btn.dataset.edtAction === "duplicate") openEdtModal(id, true);
      else if (btn.dataset.edtAction === "delete") deleteEdt(id);
    });
    $("edt-modal").addEventListener("click", (e) => {
      if (e.target.id === "edt-modal" || e.target.closest("[data-close-edt]")) closeEdtModal();
    });
    $("phys-content").addEventListener("change", (e) => { if (e.target.matches("[data-exempt]")) onExemptChange(e.target); });
    for (const zone of [$("phys-content"), $("pedagogiques-tbody")]) {
      zone.addEventListener("change", onNoteChange);
      zone.addEventListener("keydown", onNoteKeydown);
      zone.addEventListener("focusin", (e) => { if (e.target.matches("input[data-col]")) e.target.select(); });
    }
    $("baremes-panel").addEventListener("change", onBaremeChange);
    $("coefs-panel").addEventListener("change", onCoefChange);
    $("btn-param-export").addEventListener("click", exporterParametres);
    $("btn-param-import").addEventListener("click", () => $("param-import-file").click());
    $("param-import-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ""; // permet de réimporter le même fichier
      importerParametres(file);
    });
    $("coefs-panel").addEventListener("click", onCoefClick);
    $("coefs-panel").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input[data-coef-epreuve]")) e.target.blur();
    });
    $("baremes-panel").addEventListener("click", onBaremeClick);
    $("baremes-panel").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches("input[data-bid]")) e.target.blur();
    });
    $("phys-subtabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-phys]");
      if (btn && PHYS_TABS.includes(btn.dataset.phys)) setTab("physiques", btn.dataset.phys);
    });
    $("stagiaire-form").addEventListener("submit", onStagiaireSubmit);
    $("stagiaire-modal").addEventListener("click", (e) => {
      if (e.target.id === "stagiaire-modal" || e.target.closest("[data-close-modal]")) closeStagiaireModal();
    });

    // Confirmation
    $("confirm-ok").addEventListener("click", () => confirmResolve && confirmResolve(true));
    $("confirm-cancel").addEventListener("click", () => confirmResolve && confirmResolve(false));
    $("confirm-modal").addEventListener("click", (e) => {
      if (e.target.id === "confirm-modal" && confirmResolve) confirmResolve(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("confirm-modal").hidden && confirmResolve) confirmResolve(false);
      else if (!$("stagiaire-modal").hidden) closeStagiaireModal();
      else if (!$("sections-modal").hidden) closeSectionsModal();
      else if (!$("edt-modal").hidden) closeEdtModal();
      else if (!$("cols-modal").hidden) closeColsModal();
      else if (!$("print-modal").hidden) closePrintModal();
      else if (!$("export-modal").hidden) closeExportModal();
      else if (!$("grille-modal").hidden) closeGrilleModal();
      else if (!$("access-modal").hidden && state.db) hideAccessModal();
    });

    // Impression
    // Fiches terrain : choix des fiches à imprimer ; ailleurs, impression directe
    $("btn-print").addEventListener("click", () => {
      if (state.tab === "fiches") openPrintModal();
      else if (["physiques", "pedagogiques", "bilan"].includes(state.tab)) openExportModal(); // saisie des notes
      else printSheet();
    });
    $("export-modal").addEventListener("click", onExportModalClick);
    $("print-modal").addEventListener("change", onPrintModalChange);
    $("grille-modal").addEventListener("input", onGrilleInput);
    $("grille-modal").addEventListener("click", onGrilleClick);
    $("print-modal").addEventListener("click", onPrintModalClick);
    // Logo du relevé en cache : disponible aussi pour Ctrl+P
    new Image().src = RELEVE_LOGO;
    window.addEventListener("beforeprint", buildPrintSheet);
  }

  function fillStaticLists() {
    $("dl-grades").innerHTML = GRADES.map(([g, label]) => `<option value="${esc(g)}" label="${esc(label)}"></option>`).join("");
    $("sf-annee").placeholder = String(new Date().getFullYear());
  }

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------
  async function start() {
    bindEvents();
    fillStaticLists();
    applyRoute();

    try {
      if (typeof initSqlJs !== "function" || !window.SQL_WASM_BASE64) {
        throw new Error("fichiers vendor/sql-wasm.js ou vendor/sql-wasm-binary.js manquants");
      }
      state.SQL = await initSqlJs({ wasmBinary: base64ToBytes(window.SQL_WASM_BASE64) });
    } catch (e) {
      setStatus("error", "SQLite indisponible");
      showAlert(`Initialisation de SQLite impossible : ${errMsg(e)}`, "sql");
      return;
    }

    if (typeof window.showDirectoryPicker !== "function") {
      setStatus("error", "Navigateur non compatible");
      showAlert("Ce navigateur ne prend pas en charge l'accès aux dossiers locaux (File System Access API). Ouvrez index.html avec Google Chrome ou Microsoft Edge.", "compat");
      return;
    }

    let handle = null;
    try {
      handle = await idbGet(IDB_KEY);
    } catch (e) {
      showAlert(`Lecture du dossier mémorisé impossible (IndexedDB : ${errMsg(e)}).`, "idb");
    }

    if (!handle) {
      showAccessModal();
      return;
    }

    state.rootHandle = handle;
    let permission = "prompt";
    try {
      permission = await handle.queryPermission({ mode: "readwrite" });
    } catch (e) {
      if (e.name === "NotFoundError") {
        await forgetHandle();
        state.rootHandle = null;
        showAccessModal("Le dossier mémorisé est introuvable (déplacé ou supprimé). Sélectionnez à nouveau le dossier du projet.");
        return;
      }
    }

    if (permission === "granted") await loadProject(handle);
    else armPermissionGesture();
  }

  start();
})();
