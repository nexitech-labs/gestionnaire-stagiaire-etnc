/* CCPG — Impression : construction de la feuille imprimée selon la page affichée. */
"use strict";

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
