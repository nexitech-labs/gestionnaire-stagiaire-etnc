/* CCPG — Fiches terrain : fenêtre « Modifier » (renommer, masquer, ordonner, ajouter des colonnes). */
"use strict";

const ICON_UP = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>';

const ICON_DOWN = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

let colsReturnFocus = null;

function renderColsList(focusKey, focusAction) {
  const cols = ficheCols(ficheActive());
  $("cols-modal-title").textContent = `Colonnes — ${FICHES[ficheActive()].titre}`;
  $("cols-list").innerHTML = cols.map((c, i) => `
    <li class="flex items-center gap-2 px-4 py-1.5 ${c.visible ? "" : "bg-zinc-50"}" data-col-key="${esc(c.k)}">
      <input type="checkbox" data-col-visible ${c.visible ? "checked" : ""} class="h-4 w-4 shrink-0 accent-zinc-900"
        aria-label="Afficher la colonne ${esc(c.label)}">
      <input data-col-label value="${esc(c.label)}" maxlength="40" autocomplete="off" aria-label="Nom de la colonne"
        class="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm ${c.visible ? "" : "text-zinc-400 line-through"} hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:no-underline focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
      <button type="button" data-col-move="-1" ${i === 0 ? "disabled" : ""} class="${BTN_ICON} disabled:opacity-30" title="Monter" aria-label="Monter la colonne">${ICON_UP}</button>
      <button type="button" data-col-move="1" ${i === cols.length - 1 ? "disabled" : ""} class="${BTN_ICON} disabled:opacity-30" title="Descendre" aria-label="Descendre la colonne">${ICON_DOWN}</button>
      ${c.custom
        ? `<button type="button" data-col-delete class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer la colonne">${ICON_TRASH}</button>`
        : '<span class="h-8 w-8 shrink-0"></span>'}
    </li>`).join("");
  if (focusKey) {
    const target = $("cols-list").querySelector(`[data-col-key="${CSS.escape(focusKey)}"] ${focusAction || "[data-col-label]"}`);
    if (target && !target.disabled) target.focus();
  }
}

function openColsModal() {
  if (!state.db) return;
  colsReturnFocus = document.activeElement;
  renderColsList();
  $("cols-modal").hidden = false;
  $("col-new").focus();
}

function closeColsModal() {
  if ($("cols-modal").hidden) return;
  $("cols-modal").hidden = true;
  renderFiche();
  if (colsReturnFocus && colsReturnFocus.focus && document.contains(colsReturnFocus)) colsReturnFocus.focus();
}

/** Applique une modification à la configuration, enregistre, puis rafraîchit. */
function updateCols(mutateCols, focusKey, focusAction) {
  const cols = ficheCols(ficheActive());
  if (mutateCols(cols) === false) return;
  try {
    saveFicheCols(ficheActive(), cols);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  persist();
  renderColsList(focusKey, focusAction);
  renderFiche();
}

function onColsChange(event) {
  const li = event.target.closest("[data-col-key]");
  if (!li) return;
  const key = li.dataset.colKey;
  if (event.target.matches("[data-col-visible]")) {
    updateCols((cols) => { cols.find((c) => c.k === key).visible = event.target.checked; }, key, "[data-col-visible]");
  } else if (event.target.matches("[data-col-label]")) {
    const label = event.target.value.trim();
    updateCols((cols) => {
      const c = cols.find((x) => x.k === key);
      if (!label && c.custom) {
        toast("Le nom de la colonne ne peut pas être vide.", "error");
        event.target.value = c.label;
        return false;
      }
      c.label = label || c.defaultLabel;
    });
  }
}

async function onColsClick(event) {
  const li = event.target.closest("[data-col-key]");
  const move = event.target.closest("[data-col-move]");
  if (li && move) {
    const key = li.dataset.colKey;
    const step = Number(move.dataset.colMove);
    updateCols((cols) => {
      const i = cols.findIndex((c) => c.k === key);
      const j = i + step;
      if (j < 0 || j >= cols.length) return false;
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }, key, `[data-col-move="${step}"]`);
    return;
  }
  if (li && event.target.closest("[data-col-delete]")) {
    const key = li.dataset.colKey;
    const c = ficheCols(ficheActive()).find((x) => x.k === key);
    const ok = await confirmDialog({
      title: "Supprimer la colonne ?",
      message: `La colonne « ${c.label} » et les valeurs saisies dedans seront supprimées.`,
    });
    if (!ok) return;
    try {
      state.db.run("DELETE FROM fiches_terrain WHERE fiche = ? AND champ = ?", [ficheActive(), key]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    updateCols((cols) => { cols.splice(cols.findIndex((x) => x.k === key), 1); });
    return;
  }
  if (event.target.closest("#btn-cols-reset")) {
    const ok = await confirmDialog({
      title: "Revenir aux colonnes d'origine ?",
      message: "Les noms, l'ordre et la visibilité des colonnes seront rétablis. Les colonnes ajoutées et leurs valeurs seront supprimées.",
      confirmLabel: "Rétablir",
    });
    if (!ok) return;
    try {
      for (const c of ficheCols(ficheActive()).filter((x) => x.custom)) {
        state.db.run("DELETE FROM fiches_terrain WHERE fiche = ? AND champ = ?", [ficheActive(), c.k]);
      }
      state.db.run("DELETE FROM fiches_colonnes WHERE fiche = ?", [ficheActive()]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    renderColsList();
    renderFiche();
    toast("Colonnes d'origine rétablies");
    return;
  }
  if (event.target.closest("[data-close-cols]") || event.target.id === "cols-modal") closeColsModal();
}

function onColAdd(event) {
  event.preventDefault();
  const label = $("col-new").value.trim();
  if (!label) return $("col-new").focus();
  const key = `x_${Date.now().toString(36)}`;
  updateCols((cols) => { cols.push({ k: key, label, custom: true, visible: true }); });
  $("col-new").value = "";
  $("col-new").focus();
}
