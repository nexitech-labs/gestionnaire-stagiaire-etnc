/* CCPG — Fiche terrain « Évaluation péda » : aperçu et fiches vierges à imprimer. */
"use strict";

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
