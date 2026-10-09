/* CCPG — Fiches terrain : définition des fiches, aperçu à l'écran et feuille imprimée. */
"use strict";

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

/** Largeur imprimée souhaitée d'une colonne (mm) : assez de place pour écrire à la main. */
function ficheColWidth(c) {
  if (c.custom || c.type === "distance") return 20;
  if (c.type === "date" || c.k === "perf") return 18;
  if (c.k === "pompes" || c.k === "tractions") return 15;
  if (c.k === "num") return 12;
  return 13;
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
