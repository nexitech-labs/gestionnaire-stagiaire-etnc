/* CCPG — Onglet « Comportement » de la saisie des notes : grille par stagiaire, couleurs des niveaux. */
"use strict";

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
