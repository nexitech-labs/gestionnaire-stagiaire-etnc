/* CCPG — Fenêtre « Personnaliser la grille » : catégories, critères, points, niveaux, tableau de notation. */
"use strict";

// ---- Personnalisation des grilles : catégories, critères, points ou niveaux, tableau de notation (péda)
let grilleEdit = null; // { type, draft } : copie modifiée, enregistrée seulement avec « Enregistrer »

let grilleReturnFocus = null;

const nouvelleCle = () => `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const nombreSaisi = (v) => {
  const t = String(v ?? "").trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Math.round(Number(t) * 100) / 100 : null;
};

const deplacer = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
};

function openGrilleModal(type) {
  if (!state.db || !GRILLES_DEFAUT[type]) return;
  grilleReturnFocus = document.activeElement;
  grilleEdit = { type, draft: JSON.parse(JSON.stringify(getGrille(type))) };
  $("grille-modal-title").textContent = `Personnaliser la grille — ${FICHES[type].titre}`;
  grilleError("");
  renderGrilleModal();
  $("grille-modal").hidden = false;
  const first = $("grille-body").querySelector("input");
  if (first) first.focus();
}

function closeGrilleModal() {
  if ($("grille-modal").hidden) return;
  $("grille-modal").hidden = true;
  grilleEdit = null;
  if (grilleReturnFocus && grilleReturnFocus.focus && document.contains(grilleReturnFocus)) grilleReturnFocus.focus();
}

function grilleError(message) {
  $("grille-error").textContent = message || "";
  $("grille-error").hidden = !message;
}

/** Maximum d'un critère / d'une catégorie de la copie en cours (saisies non numériques ignorées). */
function draftItemMax(type, it) {
  return type === "peda" ? nombreSaisi(it.max) ?? 0 : Math.max(0, ...it.niveaux.map((n) => nombreSaisi(n.pts) ?? 0));
}

const draftGroupeMax = (type, g) => round2(g.items.reduce((a, it) => a + draftItemMax(type, it), 0));

function renderGrilleTotals() {
  const { type, draft } = grilleEdit;
  const total = round2(draft.groupes.reduce((a, g) => a + draftGroupeMax(type, g), 0));
  $("grille-total").textContent = `Total : ${fmtNote(total)} point${total > 1 ? "s" : ""}${type === "comportement" && total !== NOTE_MAX ? ` — ramené sur ${NOTE_MAX} pour la note « Comportement »` : ""}`;
  draft.groupes.forEach((g, gi) => {
    const el = $("grille-body").querySelector(`[data-gmax="${gi}"]`);
    if (el) el.textContent = `/ ${fmtNote(draftGroupeMax(type, g))}`;
  });
}

function renderGrilleModal() {
  const { type, draft } = grilleEdit;
  const INP = "h-8 min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";
  const PTS = `${INP} w-20 text-right tabular-nums`;
  const icone = (act, data, label, svg, danger = false) => `<button type="button" data-grille-act="${act}" ${data} title="${label}" aria-label="${label}"
    class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${danger ? "text-zinc-400 hover:bg-red-50 hover:text-red-600" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"}">${svg}</button>`;
  const UP = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';
  const DOWN = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const ordre = (scope, data, i, n) => `${i > 0 ? icone(`up-${scope}`, data, "Monter", UP) : '<span class="w-8 shrink-0"></span>'}${i < n - 1 ? icone(`down-${scope}`, data, "Descendre", DOWN) : '<span class="w-8 shrink-0"></span>'}`;
  const ajout = (act, data, label) => `<button type="button" data-grille-act="${act}" ${data}
    class="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>${label}</button>`;

  const critere = (it, gi, ii, n) => {
    const d = `data-gi="${gi}" data-ii="${ii}"`;
    const tete = `
      <div class="flex items-center gap-1">
        <input data-scope="i" data-f="label" ${d} value="${esc(it.label)}" maxlength="120" placeholder="Critère" aria-label="Nom du critère" class="${INP} flex-1">
        ${type === "peda" ? `<input data-scope="i" data-f="max" ${d} value="${esc(it.max)}" inputmode="decimal" placeholder="pts" aria-label="Points maximum" class="${PTS}"><span class="w-6 text-xs text-zinc-400">pts</span>` : ""}
        ${ordre("i", d, ii, n)}${icone("del-i", d, "Supprimer le critère", ICON_TRASH, true)}
      </div>`;
    if (type === "peda") return `<div class="px-3 py-1.5">${tete}</div>`;
    const niveaux = it.niveaux.map((nv, ni) => {
      const dn = `${d} data-ni="${ni}"`;
      return `
        <div class="flex items-center gap-1">
          <input data-scope="n" data-f="label" ${dn} value="${esc(nv.label)}" maxlength="120" placeholder="Niveau" aria-label="Libellé du niveau" class="${INP} flex-1">
          <input data-scope="n" data-f="pts" ${dn} value="${esc(nv.pts)}" inputmode="decimal" placeholder="pts" aria-label="Points du niveau" class="${PTS}"><span class="w-6 text-xs text-zinc-400">pts</span>
          ${ordre("n", dn, ni, it.niveaux.length)}${icone("del-n", dn, "Supprimer le niveau", ICON_TRASH, true)}
        </div>`;
    }).join("");
    return `
      <div class="space-y-1.5 px-3 py-2.5">
        ${tete}
        <div class="ml-4 space-y-1 border-l-2 border-zinc-100 pl-3">
          ${niveaux}
          ${ajout("add-n", d, "Ajouter un niveau")}
        </div>
      </div>`;
  };

  const categories = draft.groupes.map((g, gi) => {
    const d = `data-gi="${gi}"`;
    return `
      <section class="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div class="flex items-center gap-1 border-b border-zinc-100 bg-zinc-50/60 p-2">
          <input data-scope="g" data-f="groupe" ${d} value="${esc(g.groupe)}" maxlength="80" placeholder="Catégorie" aria-label="Nom de la catégorie" class="${INP} flex-1 font-semibold">
          <span data-gmax="${gi}" class="w-14 text-right text-xs tabular-nums text-zinc-500"></span>
          ${ordre("g", d, gi, draft.groupes.length)}${icone("del-g", d, "Supprimer la catégorie", ICON_TRASH, true)}
        </div>
        <div class="divide-y divide-zinc-100">${g.items.map((it, ii) => critere(it, gi, ii, g.items.length)).join("") || '<p class="px-3 py-3 text-sm text-zinc-400">Aucun critère.</p>'}</div>
        <div class="border-t border-zinc-100 p-1.5">${ajout("add-i", d, "Ajouter un critère")}</div>
      </section>`;
  }).join("");

  const liste = (scope, titre, items, placeholder) => `
    <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <p class="border-b border-zinc-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">${titre}</p>
      <div class="space-y-1 p-2">
        ${items.map((x, i) => `
        <div class="flex items-center gap-1">
          <input data-scope="${scope}" data-f="label" data-${scope}i="${i}" value="${esc(x.label)}" maxlength="80" placeholder="${placeholder}" aria-label="${placeholder}" class="${INP} flex-1">
          ${ordre(scope, `data-${scope}i="${i}"`, i, items.length)}${icone(`del-${scope}`, `data-${scope}i="${i}"`, "Supprimer", ICON_TRASH, true)}
        </div>`).join("")}
        ${ajout(`add-${scope}`, "", `Ajouter ${scope === "l" ? "une ligne" : "une colonne"}`)}
      </div>
    </div>`;

  $("grille-body").innerHTML = `
    <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">Catégories et critères${type === "comportement" ? " (avec leurs niveaux)" : ""}</p>
    ${categories}
    <div>${ajout("add-g", "", "Ajouter une catégorie")}</div>
    ${type === "peda" ? `
    <p class="pt-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Tableau « Notation de la séance »</p>
    <div class="grid gap-4 sm:grid-cols-2">
      ${liste("l", "Lignes", draft.lignes, "Ligne")}
      ${liste("c", "Colonnes", draft.cols, "Colonne")}
    </div>` : ""}`;
  renderGrilleTotals();
}

function onGrilleInput(event) {
  const el = event.target;
  if (!grilleEdit || !el.dataset.scope) return;
  const { draft } = grilleEdit;
  const gi = Number(el.dataset.gi);
  const ii = Number(el.dataset.ii);
  const f = el.dataset.f;
  if (el.dataset.scope === "g") draft.groupes[gi][f] = el.value;
  else if (el.dataset.scope === "i") draft.groupes[gi].items[ii][f] = el.value;
  else if (el.dataset.scope === "n") draft.groupes[gi].items[ii].niveaux[Number(el.dataset.ni)][f] = el.value;
  else if (el.dataset.scope === "l") draft.lignes[Number(el.dataset.li)].label = el.value;
  else if (el.dataset.scope === "c") draft.cols[Number(el.dataset.ci)].label = el.value;
  renderGrilleTotals();
}

function onGrilleClick(event) {
  if (event.target.closest("[data-close-grille]") || event.target.id === "grille-modal") return closeGrilleModal();
  const btn = event.target.closest("[data-grille-act]");
  if (!btn || !grilleEdit) return;
  const { type, draft } = grilleEdit;
  const act = btn.dataset.grilleAct;
  const gi = Number(btn.dataset.gi);
  const ii = Number(btn.dataset.ii);
  const ni = Number(btn.dataset.ni);
  const g = draft.groupes[gi];
  const items = g && g.items;
  const nouveauCritere = () => (type === "peda" ? { k: nouvelleCle(), label: "", max: 1 } : { k: nouvelleCle(), label: "", niveaux: [{ label: "", pts: 1 }, { label: "", pts: 0 }] });

  if (act === "save") return saveGrille();
  if (act === "reset") {
    grilleEdit.draft = JSON.parse(JSON.stringify(GRILLES_DEFAUT[type]));
    grilleError("");
    renderGrilleModal();
    toast("Grille d'origine rechargée : « Enregistrer » pour l'appliquer");
    return;
  }
  let focus = null;
  if (act === "add-g") { draft.groupes.push({ groupe: "", items: [nouveauCritere()] }); focus = `[data-scope="g"][data-gi="${draft.groupes.length - 1}"]`; }
  else if (act === "del-g") draft.groupes.splice(gi, 1);
  else if (act === "up-g") deplacer(draft.groupes, gi, -1);
  else if (act === "down-g") deplacer(draft.groupes, gi, 1);
  else if (act === "add-i") { items.push(nouveauCritere()); focus = `[data-scope="i"][data-gi="${gi}"][data-ii="${items.length - 1}"]`; }
  else if (act === "del-i") items.splice(ii, 1);
  else if (act === "up-i") deplacer(items, ii, -1);
  else if (act === "down-i") deplacer(items, ii, 1);
  else if (act === "add-n") { items[ii].niveaux.push({ label: "", pts: 0 }); focus = `[data-scope="n"][data-gi="${gi}"][data-ii="${ii}"][data-ni="${items[ii].niveaux.length - 1}"]`; }
  else if (act === "del-n") items[ii].niveaux.splice(ni, 1);
  else if (act === "up-n") deplacer(items[ii].niveaux, ni, -1);
  else if (act === "down-n") deplacer(items[ii].niveaux, ni, 1);
  else if (/^(add|del|up|down)-[lc]$/.test(act)) {
    const scope = act.slice(-1);
    const arr = scope === "l" ? draft.lignes : draft.cols;
    const i = Number(btn.dataset[`${scope}i`]);
    if (act.startsWith("add")) { arr.push({ k: nouvelleCle(), label: "" }); focus = `[data-scope="${scope}"][data-${scope}i="${arr.length - 1}"]`; }
    else if (act.startsWith("del")) arr.splice(i, 1);
    else deplacer(arr, i, act.startsWith("up") ? -1 : 1);
  } else return;
  grilleError("");
  renderGrilleModal();
  const el = focus && $("grille-body").querySelector(focus);
  if (el) el.focus();
}

/** Contrôle et normalise la copie ; renvoie la grille à enregistrer ou un message d'erreur. */
function grilleValidee(type, draft) {
  const txt = (v) => String(v ?? "").trim();
  if (!draft.groupes.length) return { error: "Ajoutez au moins une catégorie." };
  const groupes = [];
  for (const g of draft.groupes) {
    const groupe = txt(g.groupe);
    if (!groupe) return { error: "Chaque catégorie doit avoir un nom." };
    if (!g.items.length) return { error: `La catégorie « ${groupe} » n'a aucun critère.` };
    const items = [];
    for (const it of g.items) {
      const label = txt(it.label);
      if (!label) return { error: `Un critère de « ${groupe} » n'a pas de nom.` };
      if (type === "peda") {
        const max = nombreSaisi(it.max);
        if (max == null) return { error: `Points maximum invalides pour « ${label} » (nombre attendu, ex. 1,5).` };
        items.push({ k: it.k, label, max });
      } else {
        if (!it.niveaux.length) return { error: `Le critère « ${label} » n'a aucun niveau.` };
        const niveaux = [];
        for (const nv of it.niveaux) {
          const nl = txt(nv.label);
          const pts = nombreSaisi(nv.pts);
          if (!nl) return { error: `Un niveau de « ${label} » n'a pas de libellé.` };
          if (pts == null) return { error: `Points invalides pour le niveau « ${nl} » (${label}).` };
          if (niveaux.some((x) => x.pts === pts)) return { error: `Deux niveaux de « ${label} » valent ${fmtNote(pts)} point(s) : chaque niveau doit avoir des points différents.` };
          niveaux.push({ label: nl, pts });
        }
        items.push({ k: it.k, label, niveaux });
      }
    }
    groupes.push({ groupe, items });
  }
  if (type !== "peda") return { grille: { groupes } };
  const lignes = draft.lignes.map((x) => ({ k: x.k, label: txt(x.label) }));
  const cols = draft.cols.map((x) => ({ k: x.k, label: txt(x.label) }));
  if (lignes.some((x) => !x.label) || cols.some((x) => !x.label)) return { error: "Chaque ligne et chaque colonne du tableau de notation doit avoir un nom." };
  return { grille: { groupes, lignes, cols } };
}

function saveGrille() {
  const { type, draft } = grilleEdit;
  const { grille, error } = grilleValidee(type, draft);
  if (error) return grilleError(error);
  let effaces = 0;
  try {
    setParametre(`grille_${type}`, JSON.stringify(grille));
    delete grillesCache[type];
    if (type === "comportement") effaces = recalculerNotesGrille(type); // la grille péda est imprimée vierge : pas de note calculée
  } catch (e) {
    grilleError(`Erreur base de données : ${errMsg(e)}`);
    return;
  }
  persist();
  closeGrilleModal();
  if (type === "comportement") refreshAll(); // onglet Comportement et notes pédagogiques
  else renderFiche();
  toast(effaces
    ? `Grille enregistrée. ${effaces} choix ne correspondai${effaces > 1 ? "ent" : "t"} plus à aucun niveau et ${effaces > 1 ? "ont" : "a"} été effacé${effaces > 1 ? "s" : ""}.`
    : "Grille enregistrée");
}

/**
 * Après un changement de grille : notes « Pédagogie » / « Comportement » recalculées pour tous les stagiaires évalués.
 * Comportement : un choix dont les points ne correspondent plus à un niveau est effacé. Renvoie le nombre de choix effacés.
 */
function recalculerNotesGrille(type) {
  const colonne = type === "peda" ? "pedagogie" : "comportement";
  const items = grilleItems(type);
  const parStagiaire = new Map();
  let effaces = 0;
  for (const v of query("SELECT stagiaire_id, champ, valeur FROM fiches_terrain WHERE fiche = ?", [type])) {
    if (type === "comportement" && v.champ.startsWith("c_")) {
      const it = items.find((x) => `c_${x.k}` === v.champ);
      if (it && !it.niveaux.some((n) => n.pts === Number(v.valeur))) {
        saveFicheChamp(v.stagiaire_id, type, v.champ, null);
        effaces++;
        continue;
      }
    }
    if (!parStagiaire.has(v.stagiaire_id)) parStagiaire.set(v.stagiaire_id, {});
    parStagiaire.get(v.stagiaire_id)[v.champ] = v.valeur;
  }
  const cles = items.map((x) => x.k);
  for (const [sid, vals] of parStagiaire) {
    upsert("notes_pedagogiques", ["stagiaire_id"], ["stagiaire_id", colonne], [sid, noteSur20(type, sumPoints(vals, cles).total)]);
  }
  return effaces;
}
