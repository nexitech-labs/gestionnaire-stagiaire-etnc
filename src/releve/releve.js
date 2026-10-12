/* CCPG — Relevé individuel (attestation) : aperçu, signature, impression d'un ou plusieurs relevés. */
"use strict";

// ---- Relevé individuel (d'après la feuille « Relevé individuel » de l'Excel), au format attestation :
//      onglet de la saisie des notes, une page par stagiaire
const RELEVE_ECOLE = "École des transmissions du numérique et du cyber (ETNC)";

const RELEVE_TITRE = "Relevé de performances EPMS";

const RELEVE_EPREUVES = ["ecr", "cmg", "aisance_aquatique"]; // épreuves du relevé Excel

// Couleurs des pastilles ECR / CMG / AA (teintes de la feuille Excel, assombries pour le texte blanc)
const RELEVE_COULEURS = { ecr: "#0f9f5a", cmg: "#c0504d", aisance_aquatique: "#2f8fae" };

const RELEVE_LOGO = "assets/logo-ministere-armees.svg";

const RELEVE_LOGO_ECOLE = "assets/ETNC.png"; // logo de l'école par défaut (en haut à droite)

const RELEVE_SANS_LOGO = "aucun"; // valeur de « releve_logo » quand le moniteur a retiré le logo

const SIGNATURE_MAX_OCTETS = 1024 * 1024;

/** Nom de l'école en en-tête et en pied du relevé : texte saisi par le moniteur, sinon celui par défaut. */
function releveEcole() {
  return getParametre("releve_ecole") || RELEVE_ECOLE;
}

/** Logo de l'école en haut à droite du relevé : image importée, sinon logo ETNC ; null si retiré. */
function releveLogoEcole() {
  const logo = getParametre("releve_logo");
  if (logo === RELEVE_SANS_LOGO) return null;
  return logo || RELEVE_LOGO_ECOLE;
}

/** Signature du relevé : image importée par le moniteur ; null si aucune ou désactivée. */
function releveSignature() {
  if (getParametre("releve_signature_active") === "0") return null;
  return getParametre("releve_signature") || null;
}

/** Lignes du relevé : épreuve, date, performance et note (EXEMPT si inapte, dispensé…). */
function releveLignes(r, dates) {
  return RELEVE_EPREUVES.map((id) => {
    const ep = EPREUVES.find((e) => e.id === id);
    const perf = String(r[`${id}_perf`] ?? "").trim();
    if (estExempte(r, id)) {
      return { id, ep, date: "", perf: "EXEMPT", detail: "note écrite", note: r.ecrit_exemption ?? null };
    }
    const exempt = PERF_SANS_NOTE.includes(norm(perf));
    const detail = id === "aisance_aquatique"
      ? [["nage", r.aisance_aquatique_nage], ["apnée", r.aisance_aquatique_apnee]].filter(([, v]) => v != null).map(([l, v]) => `${l} ${fmtNote(v)} m`).join(" · ")
      : "";
    return {
      id,
      ep,
      date: dates[id] ? fmtDate(dates[id]) : "",
      perf: exempt ? "EXEMPT" : perf,
      detail: exempt ? "" : detail,
      note: exempt ? null : r[id] ?? null,
    };
  });
}

/** Relevé au format attestation (aperçu et impression, A4 portrait). */
function releveSheetHtml(s, r, dates, signature) {
  const sexe = r.sexe === "F" ? "Femme" : r.sexe === "M" ? "Homme" : r.sexe || "—";
  const article = r.sexe === "F" ? "la" : "le";
  const stagiaire = `${esc(r.grade)} ${esc(String(r.nom || "").toUpperCase())} ${esc(r.prenom)}`;
  const lignes = releveLignes(r, dates).map((l) => `
    <tr>
      <td class="ra-c">${esc(l.date) || "—"}</td>
      <td><span class="ra-code" style="background:${RELEVE_COULEURS[l.id]}">${esc(l.ep.short === "Aisance aquatique" ? "AA" : l.ep.short)}</span>${esc(l.ep.label)}</td>
      <td class="ra-c">${l.perf ? `<span class="${l.perf === "EXEMPT" ? "ra-exempt" : ""}">${esc(l.perf)}</span>` : "—"}${l.detail ? `<span class="ra-detail">${esc(l.detail)}</span>` : ""}</td>
      <td class="ra-c ra-note">${l.note == null ? "—" : `${esc(fmtNote(l.note))}<small> / ${NOTE_MAX}</small>`}</td>
    </tr>`).join("");
  const info = (label, value) => `<div><dt>${label}</dt><dd>${value || "—"}</dd></div>`;
  const ecole = releveEcole();
  const logo = releveLogoEcole();
  return `
    <div class="releve-att">
      <header class="ra-head">
        <img class="ra-logo" src="${esc(RELEVE_LOGO)}" alt="Ministère des Armées">
        ${logo ? `<img class="ra-logo-ecole" src="${esc(logo)}" alt="Logo de l'école">` : `
        <div class="ra-ecole">
          <strong>${esc(ecole)}</strong>
          <span>Section EPMS — ${esc(s.formation)} · Année scolaire ${esc(s.annee_scolaire)}</span>
        </div>`}
      </header>

      <h1 class="ra-titre">${esc(RELEVE_TITRE)}</h1>

      <p class="ra-objet"><b>OBJET :</b> relevé individuel des résultats aux épreuves physiques ECR, CMG et AA.</p>

      <dl class="ra-infos">
        ${info("Grade", esc(r.grade))}
        ${info("Nom", esc(String(r.nom || "").toUpperCase()))}
        ${info("Prénom", esc(r.prenom))}
        ${info("Sexe", esc(sexe))}
        ${info("Armée", esc(r.armee))}
        ${info("Stage", esc(s.formation))}
      </dl>

      <p class="ra-texte">Je soussigné(e) <b>${esc(s.moniteur)}</b>, moniteur EPMS, certifie que ${article} <b>${stagiaire}</b>
        a réalisé les épreuves suivantes en obtenant les résultats ci-dessous :</p>

      <table class="ra-table">
        <colgroup><col style="width:26mm"><col><col style="width:38mm"><col style="width:26mm"></colgroup>
        <thead><tr><th>Date</th><th>Épreuve</th><th>Performance</th><th>Note</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>

      <div class="ra-bas">
        <p class="ra-fait">Fait le ${esc(fmtDate(todayIso()))}</p>
        <div class="ra-signature">
          <p class="ra-fonction">Moniteur EPMS</p>
          <p class="ra-nom">${esc(s.moniteur)}</p>
          ${signature ? `<img src="${esc(signature)}" alt="Signature">` : '<div class="ra-sans-signature"></div>'}
        </div>
      </div>

      <footer class="ra-pied">
        <p class="ra-mention">En cas de perte, aucun duplicata ne sera délivré.</p>
        <p>${esc(ecole)}</p>
      </footer>
    </div>`;
}

function renderReleve(s) {
  const rows = sortRows(getStagiairesAvecNotes(s.id));
  if (!rows.some((r) => r.id === state.releveSid)) state.releveSid = rows.length ? rows[0].id : null;
  const r = rows.find((x) => x.id === state.releveSid);
  if (!r) {
    $("releve-content").innerHTML = '<div class="rounded-lg border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">Aucun stagiaire dans cette section.</div>';
    return;
  }
  // Sélection pour l'impression groupée : uniquement des stagiaires de la section
  const ids = new Set(rows.map((x) => x.id));
  for (const id of state.releveSel) if (!ids.has(id)) state.releveSel.delete(id);
  const nSel = state.releveSel.size;
  const check = "h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-sky-600";
  const liste = rows.map((x) => `
    <div class="flex items-center gap-1 rounded-md pl-3 ${x.id === r.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"}">
      <input type="checkbox" data-releve-check="${esc(x.id)}" ${state.releveSel.has(x.id) ? "checked" : ""} class="${check}"
        aria-label="Sélectionner ${esc(x.nom)} ${esc(x.prenom)} pour l'impression">
      <button type="button" data-releve-select="${esc(x.id)}" class="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm">
        <span class="font-mono text-xs ${x.id === r.id ? "text-zinc-300" : "text-zinc-500"}">${esc(x.grade)}</span> <span class="font-medium uppercase">${esc(x.nom)}</span> ${esc(x.prenom)}
      </button>
    </div>`).join("");
  const active = getParametre("releve_signature_active") !== "0";
  const signature = getParametre("releve_signature");
  const logoEcole = releveLogoEcole();
  const logoParam = getParametre("releve_logo"); // null : logo ETNC par défaut
  const btn = "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-zinc-100";

  $("releve-content").innerHTML = `
    <div class="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <div class="h-fit space-y-4">
        <div class="rounded-lg border border-zinc-200 bg-white p-2 shadow-sm">
          <label class="flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 pb-2 pt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            <input type="checkbox" data-releve-check-all ${nSel === rows.length ? "checked" : ""} class="${check}">
            <span class="flex-1">Tout sélectionner</span>
            <span class="normal-case tabular-nums">${nSel}/${rows.length}</span>
          </label>
          <div class="mt-1">${liste}</div>
          <div class="mt-2 border-t border-zinc-100 p-2">
            <button type="button" data-releve-print-sel ${nSel ? "" : "disabled"} class="${btn} disabled:pointer-events-none disabled:opacity-50">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              ${nSel ? `Imprimer les relevés cochés (${nSel})` : "Cochez des stagiaires"}
            </button>
          </div>
        </div>

        <div class="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">Signature</p>
          ${signature ? `
          <label class="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" data-releve-signature-active ${active ? "checked" : ""} class="h-4 w-4 rounded border-zinc-300">
            Ajouter la signature
          </label>
          <div class="flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-2 ${active ? "" : "opacity-40"}">
            <img src="${esc(signature)}" alt="Signature" class="max-h-full max-w-full object-contain">
          </div>` : `
          <p class="text-sm text-zinc-500">Aucune signature : importez l'image de votre signature pour l'ajouter au relevé.</p>`}
          <label class="${btn} cursor-pointer">
            <input type="file" accept="image/png,image/jpeg,image/webp" data-releve-signature-file class="sr-only">
            ${signature ? "Remplacer la signature…" : "Importer une signature…"}
          </label>
          ${signature ? `<button type="button" data-releve-signature-reset class="${btn} text-red-600">Supprimer la signature</button>` : ""}
        </div>

        <div class="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-medium uppercase tracking-wide text-zinc-400">En-tête</p>
          <label class="block space-y-1 text-sm font-medium">
            <span>Nom de l'école</span>
            <textarea data-releve-ecole rows="3" placeholder="${esc(RELEVE_ECOLE)}"
              class="block w-full resize-y rounded-md border border-zinc-200 px-2 py-1.5 text-sm font-normal shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">${esc(releveEcole())}</textarea>
          </label>
          ${getParametre("releve_ecole") ? `<button type="button" data-releve-ecole-reset class="${btn}">Rétablir le texte par défaut</button>` : ""}
          ${logoEcole ? `
          <div class="flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-2">
            <img src="${esc(logoEcole)}" alt="Logo de l'école" class="max-h-full max-w-full object-contain">
          </div>` : `
          <p class="text-sm text-zinc-500">Aucun logo : le nom de l'école et la section s'affichent en haut du relevé.</p>`}
          <label class="${btn} cursor-pointer">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-releve-logo-file class="sr-only">
            ${logoEcole ? "Remplacer le logo…" : "Importer un logo…"}
          </label>
          ${logoParam ? `<button type="button" data-releve-logo-default class="${btn}">Rétablir le logo ETNC</button>` : ""}
          ${logoEcole ? `<button type="button" data-releve-logo-reset class="${btn} text-red-600">Retirer le logo</button>` : ""}
        </div>
      </div>

      <div class="min-w-0 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100 p-4 shadow-sm">
        <div class="mx-auto w-fit bg-white p-[15mm] shadow">${releveSheetHtml(s, r, getDatesEpreuves(s.id), releveSignature())}</div>
      </div>
    </div>`;
  const all = $("releve-content").querySelector("[data-releve-check-all]");
  if (all) all.indeterminate = nSel > 0 && nSel < rows.length; // sélection partielle
}

function onReleveCheck(el) {
  const rows = getStagiaires(state.activeSectionId);
  if (el.matches("[data-releve-check-all]")) {
    state.releveSel = new Set(el.checked ? rows.map((x) => x.id) : []);
  } else {
    const id = Number(el.dataset.releveCheck);
    if (el.checked) state.releveSel.add(id);
    else state.releveSel.delete(id);
  }
  renderReleve(getSection(state.activeSectionId));
}

function onReleveSignatureChange(el) {
  if (el.matches("[data-releve-signature-active]")) {
    setParametre("releve_signature_active", el.checked ? "1" : "0");
    persist();
    renderReleve(getSection(state.activeSectionId));
    return;
  }
  if (el.matches("[data-releve-ecole]")) {
    const texte = el.value.trim();
    setParametre("releve_ecole", texte && texte !== RELEVE_ECOLE ? texte : null);
    persist();
    renderReleve(getSection(state.activeSectionId));
    return;
  }
  if (el.matches("[data-releve-logo-file]")) {
    importerImageReleve(el, "releve_logo", /^image\/(png|jpeg|webp|svg\+xml)$/, "PNG, JPEG, WebP ou SVG", "Logo enregistré.");
    return;
  }
  if (!el.matches("[data-releve-signature-file]")) return;
  importerImageReleve(el, "releve_signature", /^image\/(png|jpeg|webp)$/, "PNG, JPEG ou WebP", "Signature enregistrée.",
    () => setParametre("releve_signature_active", "1"));
}

/** Lit l'image choisie dans un champ fichier et l'enregistre (data URL) dans le paramètre `cle`. */
function importerImageReleve(el, cle, types, formats, message, apres) {
  const file = el.files && el.files[0];
  if (!file) return;
  if (!types.test(file.type)) {
    toast(`Format attendu : image ${formats}.`, "error");
    return;
  }
  if (file.size > SIGNATURE_MAX_OCTETS) {
    toast("Image trop lourde (1 Mo maximum).", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setParametre(cle, reader.result);
      if (apres) apres();
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    renderReleve(getSection(state.activeSectionId));
    toast(message);
  };
  reader.onerror = () => toast("Lecture de l'image impossible.", "error");
  reader.readAsDataURL(file);
}

function relevePrintHtml(s) {
  const rows = sortRows(getStagiairesAvecNotes(s.id));
  // Impression groupée : stagiaires cochés ; sinon le relevé affiché
  const cibles = state.printSelReleve ? rows.filter((r) => state.releveSel.has(r.id)) : rows.filter((r) => r.id === state.releveSid);
  const dates = getDatesEpreuves(s.id);
  const signature = releveSignature();
  const pages = cibles.map((r, idx) => `<div class="${idx > 0 ? "ps-page-break" : ""}">${releveSheetHtml(s, r, dates, signature)}</div>`).join("");
  return `<style>@page { size: A4 portrait; margin: 15mm; }</style>${pages || '<p class="ps-empty">Aucun stagiaire.</p>'}`;
}
