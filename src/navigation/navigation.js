/* CCPG — Navigation : onglets, adresses (#/…), rafraîchissement des pages, bouton d'impression. */
"use strict";

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
