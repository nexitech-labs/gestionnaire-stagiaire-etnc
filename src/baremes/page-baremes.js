/* CCPG — Page Barèmes : version affichée, consultation et modification des lignes. */
"use strict";

const SELECT_CLS = "flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20";

const CELL_INPUT = "h-8 rounded-md border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";

function options(list, selected) {
  return list.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`).join("");
}

/** Version affichée sur les pages Barèmes et Coefficients (en vigueur par défaut). */
function versionContexte() {
  const versions = getVersionsBaremes();
  const courante = versions[0];
  const version = versions.find((v) => v.id === state.baremeVersion) || courante;
  state.baremeVersion = version.id;
  const sectionsVersion = getSections().filter((x) => x.bareme_version_id === version.id).map((x) => sectionLabel(x));
  return { versions, courante, version, editable: version.id === courante.id, sectionsVersion };
}

/** Choix et nom de la version, à qui elle s'applique, suppression d'une ancienne version inutilisée. */
function versionBlocHtml({ versions, courante, version, editable, sectionsVersion }) {
  return `
      <div class="space-y-3 border-b border-zinc-100 bg-zinc-50/60 p-5">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="space-y-1.5 text-sm font-medium">Version (barème et coefficients)
            <select data-bversion class="${SELECT_CLS}">
              ${versions.map((v) => `<option value="${esc(v.id)}"${v.id === version.id ? " selected" : ""}>${esc(v.libelle)}${v.id === courante.id ? " — en vigueur" : ""} (${v.nb_sections} section${v.nb_sections > 1 ? "s" : ""})</option>`).join("")}
            </select></label>
          <label class="space-y-1.5 text-sm font-medium">Nom de la version
            <input type="text" data-bversion-libelle maxlength="80" autocomplete="off" value="${esc(version.libelle)}" class="${SELECT_CLS}"></label>
        </div>
        <p class="text-sm ${editable && sectionsVersion.length ? "text-amber-700" : "text-zinc-600"}">${editable
          ? (sectionsVersion.length
            ? `Version en vigueur, utilisée par : ${esc(sectionsVersion.join(", "))}. À la première modification du barème ou des coefficients, une <b>nouvelle version</b> est créée pour les prochaines sections ; ces sections gardent celle-ci.`
            : "Version en vigueur, utilisée par aucune section : les modifications s'appliquent directement. Les nouvelles sections utiliseront cette version.")
          : `Ancienne version (consultation seule)${sectionsVersion.length ? `, utilisée par : ${esc(sectionsVersion.join(", "))}` : ", utilisée par aucune section"}. Pour changer la version d'une section, modifiez la section.`}</p>
        ${!sectionsVersion.length && versions.length > 1 ? `<button type="button" data-delete-bversion="${esc(version.id)}"
          class="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50">Supprimer cette version</button>` : ""}
      </div>`;
}

function renderParametres() {
  if (state.tab === "coefficients") renderCoefs();
  else renderBaremes();
}

/** Changement de version affichée ou de son nom (pages Barèmes et Coefficients). Renvoie true si traité. */
function onVersionChange(el) {
  if (el.matches("[data-bversion]")) {
    state.baremeVersion = Number(el.value);
    renderParametres();
    return true;
  }
  if (!el.matches("[data-bversion-libelle]")) return false;
  const libelle = el.value.trim();
  if (libelle) {
    try {
      state.db.run("UPDATE baremes_versions SET libelle = ? WHERE id = ?", [libelle.slice(0, 80), state.baremeVersion]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return true;
    }
    persist();
  }
  renderParametres();
  return true;
}

/** Suppression d'une ancienne version inutilisée. Renvoie true si le clic est traité. */
async function onVersionDelete(event) {
  const btn = event.target.closest("[data-delete-bversion]");
  if (!btn) return false;
  const id = Number(btn.dataset.deleteBversion);
  const v = getVersionsBaremes().find((x) => x.id === id);
  const versions = getVersionsBaremes();
  if (!v || v.nb_sections || versions.length < 2) return true; // une version utilisée, ou la seule restante, est conservée
  const precedente = id === versions[0].id ? versions[1] : null;
  const ok = await confirmDialog({
    title: "Supprimer cette version ?",
    message: `La version « ${v.libelle} » (barème et coefficients) n'est utilisée par aucune section. Elle sera définitivement supprimée.`
      + (precedente ? `

« ${precedente.libelle} » redeviendra la version en vigueur pour les nouvelles sections.` : ""),
  });
  if (!ok) return true;
  try {
    state.db.run("DELETE FROM baremes WHERE version_id = ?", [id]);
    state.db.run("DELETE FROM coefficients_versions WHERE version_id = ?", [id]);
    state.db.run("DELETE FROM baremes_versions WHERE id = ?", [id]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return true;
  }
  state.baremeVersion = null;
  invalidateBaremes();
  persist();
  renderParametres();
  toast("Version supprimée");
  return true;
}

function renderBaremes() {
  const f = state.baremeFiltre;
  const unite = uniteEpreuve(f.armee, f.epreuve);
  const aqua = f.epreuve === "aisance_aquatique";
  const ctx = versionContexte();
  const { version, editable } = ctx;
  const ro = editable ? "" : "disabled";
  const rows = getBaremes(version.id)
    .filter((b) => b.armee === f.armee && b.epreuve === f.epreuve && b.sexe === f.sexe)
    .sort((a, b) => b.note - a.note || (unite === "temps" ? a.performance - b.performance : b.performance - a.performance)
      || (b.nage_min ?? 0) - (a.nage_min ?? 0) || (b.apnee_min ?? 0) - (a.apnee_min ?? 0) || a.id - b.id);
  const cell = (b, col, value, label, w) => `
      <td class="px-1.5 py-1.5 text-right">
        <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} ${w} disabled:bg-zinc-50 disabled:text-zinc-500" data-bid="${esc(b.id)}" data-bcol="${col}"
          value="${esc(value)}" placeholder="—" aria-label="${esc(label)}">
      </td>`;

  const body = rows.length ? rows.map((b) => `
    <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
      ${cell(b, "performance_min", fmtPerf(b.performance_min, unite), "Performance minimale", "w-24")}
      ${cell(b, "performance_max", fmtPerf(b.performance_max, unite), "Performance maximale", "w-24")}
      ${aqua ? `
      ${cell(b, "nage_min", fmtNote(b.nage_min), "Distance de nage minimale", "w-16")}
      ${cell(b, "nage_max", fmtNote(b.nage_max), "Distance de nage maximale", "w-16")}
      ${cell(b, "apnee_min", fmtNote(b.apnee_min), "Distance d'apnée minimale", "w-16")}
      ${cell(b, "apnee_max", fmtNote(b.apnee_max), "Distance d'apnée maximale", "w-16")}` : ""}
      <td class="px-3 py-1.5 text-right">
        <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} w-16 disabled:bg-zinc-50 disabled:text-zinc-500" data-bid="${esc(b.id)}" data-bcol="note"
          value="${esc(fmtNote(b.note))}" aria-label="Note sur 20">
      </td>
      <td class="px-4 py-1.5 text-right">
        ${editable ? `<button type="button" data-delete-bareme="${esc(b.id)}" class="${BTN_ICON_DANGER}" title="Supprimer cette ligne" aria-label="Supprimer cette ligne">${ICON_TRASH}</button>` : ""}
      </td>
    </tr>`).join("")
    : `<tr><td colspan="${aqua ? 8 : 4}" class="px-4 py-10 text-center text-sm text-zinc-500">Aucune ligne pour cette sélection. Utilisez « Ajouter une ligne ».</td></tr>`;

  $("baremes-panel").innerHTML = `
    <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-5">
        <div>
          <h2 class="font-semibold tracking-tight">Configuration des barèmes</h2>
        </div>
        ${editable ? `<button type="button" id="btn-reset-baremes"
          class="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-4 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          Réinitialiser aux barèmes par défaut (Excel)
        </button>` : ""}
      </div>
      ${versionBlocHtml(ctx)}
      <div class="grid gap-3 border-b border-zinc-100 p-5 sm:grid-cols-3">
        <label class="space-y-1.5 text-sm font-medium">Armée
          <select data-bfilter="armee" class="${SELECT_CLS}">${options(ARMEES_BAREME, f.armee)}</select></label>
        <label class="space-y-1.5 text-sm font-medium">Épreuve
          <select data-bfilter="epreuve" class="${SELECT_CLS}">${options(EPREUVES.map((e) => [e.id, `${e.short}${e.short !== e.label ? ` — ${e.label}` : ""}`]), f.epreuve)}</select></label>
        <label class="space-y-1.5 text-sm font-medium">Sexe
          <select data-bfilter="sexe" class="${SELECT_CLS}">${options([["M", "Hommes (M)"], ["F", "Femmes (F)"]], f.sexe)}</select></label>
      </div>
      <div class="flex items-center justify-end px-5 py-3 text-sm text-zinc-500">
        <span>${rows.length} ligne${rows.length > 1 ? "s" : ""}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-y border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th class="px-1.5 py-3 text-right font-medium">${unite === "temps" ? "Temps" : "Perf."} min</th>
              <th class="px-1.5 py-3 text-right font-medium">${unite === "temps" ? "Temps" : "Perf."} max</th>
              ${aqua ? `<th class="px-1.5 py-3 text-right font-medium">Nage min (m)</th><th class="px-1.5 py-3 text-right font-medium">Nage max (m)</th>
              <th class="px-1.5 py-3 text-right font-medium">Apnée min (m)</th><th class="px-1.5 py-3 text-right font-medium">Apnée max (m)</th>` : ""}
              <th class="px-3 py-3 text-right font-medium">Note /${NOTE_MAX}</th>
              <th class="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
      <div class="border-t border-zinc-100 p-4" ${editable ? "" : "hidden"}>
        <button type="button" id="btn-add-bareme"
          class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          Ajouter une ligne
        </button>
      </div>
    </div>`;
}

/** Après une modification de barème : recalcul des notes, sauvegarde, rafraîchissement. */
function afterBaremeChange(rerender) {
  invalidateBaremes();
  recomputeAutoNotes();
  persist();
  if (rerender) renderBaremes();
}

function onBaremeChange(event) {
  const el = event.target;
  if (!state.db) return;

  if (onVersionChange(el)) return;
  if (el.matches("[data-bfilter]")) {
    const key = el.dataset.bfilter;
    state.baremeFiltre[key] = el.value;
    lsSet(`bf.${key}`, el.value);
    renderBaremes();
    return;
  }
  if (!el.matches("[data-bid][data-bcol]")) return;

  const id = Number(el.dataset.bid);
  const col = el.dataset.bcol;
  const f = state.baremeFiltre;
  const unite = uniteEpreuve(f.armee, f.epreuve);
  let parsed;
  if (col === "performance_min" || col === "performance_max") {
    parsed = parsePerf(el.value, unite);
    if (parsed.sansNote) parsed = { error: "Valeur numérique attendue." };
  } else if (col === "note") {
    parsed = parseNote(el.value);
    if (parsed.value == null && !parsed.error) parsed = { error: "La note est obligatoire." };
  } else if (["nage_min", "nage_max", "apnee_min", "apnee_max"].includes(col)) {
    parsed = parseDistance(el.value);
  } else {
    return;
  }
  if (parsed.error) {
    setNoteInvalid(el, parsed.error);
    toast(parsed.error, "error");
    return;
  }
  // Contrôle de l'intervalle complet (min ≤ max, au moins une borne de performance)
  const ligne = getBaremes().find((x) => x.id === id);
  if (!ligne || ligne.version_id !== versionCourante()) return; // anciens barèmes : consultation seule
  const b = { ...ligne, [col]: parsed.value };
  const paires = [["performance_min", "performance_max", "performance"], ["nage_min", "nage_max", "nage"], ["apnee_min", "apnee_max", "apnée"]];
  let erreur = null;
  if (b.performance_min == null && b.performance_max == null) erreur = "Renseignez au moins une borne de performance.";
  for (const [lo, hi, nom] of paires) if (b[lo] != null && b[hi] != null && b[lo] > b[hi]) erreur = `Le minimum de ${nom} doit être inférieur ou égal au maximum.`;
  if (erreur) {
    setNoteInvalid(el, erreur);
    toast(erreur, "error");
    return;
  }
  setNoteInvalid(el, null);

  let copie;
  try {
    copie = versionPourModifier();
    // col provient de la liste ci-dessus (jamais du texte saisi) ; colonnes de compatibilité recalculées
    state.db.run(`UPDATE baremes SET ${col} = ?, performance = ?, distance_nage = ?, distance_apnee = ? WHERE id = ?`,
      [parsed.value, seuilDeduit(b.armee, b.epreuve, b.performance_min, b.performance_max), b.nage_min, b.apnee_min, copie.map ? copie.map.get(id) : id]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  if (col === "performance_min" || col === "performance_max") el.value = fmtPerf(parsed.value, unite);
  else el.value = fmtNote(parsed.value);
  afterBaremeChange(!!copie.map); // copie : nouveaux id de lignes à réafficher
}

async function onBaremeClick(event) {
  if (!state.db) return;
  const f = state.baremeFiltre;

  if (event.target.closest("#btn-add-bareme")) {
    const aqua = f.epreuve === "aisance_aquatique";
    try {
      const { versionId } = versionPourModifier();
      state.db.run(`INSERT INTO baremes (version_id, armee, epreuve, sexe, tranche_age, performance_min, performance_max, note,
          nage_min, nage_max, apnee_min, apnee_max, performance, distance_nage, distance_apnee)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, 0, ?, ?)`,
        [versionId, f.armee, f.epreuve, f.sexe, "Toutes", ...(aqua ? [0, 0, 0, 0, 0, 0] : [null, null, null, null, null, null])]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    const id = query("SELECT last_insert_rowid() AS id")[0].id;
    afterBaremeChange(true);
    const input = $("baremes-panel").querySelector(`input[data-bid="${id}"][data-bcol="performance_min"]`);
    if (input) { input.focus(); input.select(); }
    toast("Ligne ajoutée : renseignez l'intervalle et la note");
    return;
  }

  const del = event.target.closest("[data-delete-bareme]");
  if (del) {
    const id = Number(del.dataset.deleteBareme);
    const b = getBaremes().find((x) => x.id === id);
    if (!b || b.version_id !== versionCourante()) return;
    const ok = await confirmDialog({
      title: "Supprimer cette ligne ?",
      message: `${fmtPerf(b.performance_min, uniteEpreuve(b.armee, b.epreuve)) || "…"} ; ${fmtPerf(b.performance_max, uniteEpreuve(b.armee, b.epreuve)) || "…"} → note ${fmtNote(b.note)} (${b.armee}, ${b.sexe}). Les notes automatiques seront recalculées.`,
    });
    if (!ok) return;
    try {
      const { map } = versionPourModifier();
      state.db.run("DELETE FROM baremes WHERE id = ?", [map ? map.get(id) : id]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    afterBaremeChange(true);
    toast("Ligne supprimée");
    return;
  }

  if (event.target.closest("#btn-reset-baremes")) {
    const ok = await confirmDialog({
      title: "Réinitialiser les barèmes ?",
      message: `Le barème en vigueur (armées, épreuves, sexes) sera remplacé par les ${window.BAREMES_DEFAUT ? window.BAREMES_DEFAUT.length : ""} lignes d'origine du fichier Excel. S'il est déjà utilisé par des sections, elles gardent leur barème actuel et un nouveau barème est créé pour les prochaines sections.`,
      confirmLabel: "Réinitialiser",
    });
    if (!ok) return;
    try {
      const { versionId } = versionPourModifier();
      state.db.run("DELETE FROM baremes WHERE version_id = ?", [versionId]);
      insertBaremesDefaut(state.db, versionId);
    } catch (e) {
      toast(`Réinitialisation impossible : ${errMsg(e)}`, "error");
      return;
    }
    afterBaremeChange(true);
    toast("Barèmes par défaut rétablis");
    return;
  }

  await onVersionDelete(event);
}
