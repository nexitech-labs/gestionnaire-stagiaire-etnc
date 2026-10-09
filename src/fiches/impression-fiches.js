/* CCPG — Fiches terrain : fenêtre d'impression groupée (choix des fiches, exemplaires). */
"use strict";

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
