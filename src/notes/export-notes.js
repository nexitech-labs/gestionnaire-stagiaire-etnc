/* CCPG — Export de toutes les notes : impression, PDF et feuille Excel « Notes ». */
"use strict";

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
