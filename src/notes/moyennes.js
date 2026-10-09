/* CCPG — Moyennes pondérées (physique, pédagogique, E²PMS) et page Moyenne. */
"use strict";

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

function avgHtml({ avg, n, total }) {
  if (avg == null) return '<span class="text-zinc-400">—</span>';
  const tone = avg < 10 ? "text-red-600" : "text-emerald-700";
  const partial = total && n < total
    ? ` <span class="text-xs font-normal text-zinc-400" title="Moyenne partielle : ${n} note${n > 1 ? "s" : ""} sur ${total}">(${n}/${total})</span>`
    : "";
  return `<span class="font-semibold tabular-nums ${tone}">${esc(fmtNote(round2(avg)))}</span>${partial}`;
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
