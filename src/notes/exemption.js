/* CCPG — Exemption d'une épreuve : case « Exempté » et note écrite unique. */
"use strict";

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
