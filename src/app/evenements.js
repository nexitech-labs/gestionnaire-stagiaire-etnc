/* CCPG — Branchement des événements de toutes les pages (clics, saisies, raccourcis). */
"use strict";

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
