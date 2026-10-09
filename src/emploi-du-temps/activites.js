/* CCPG — Liste des activités (menus « Cours SAGAIE » et « Activité réalisée »). */
"use strict";

const AUTRE = "__autre";

function getActivites() {
  return query("SELECT id, libelle FROM activites ORDER BY libelle COLLATE NOCASE");
}

/** Menu déroulant + saisie libre : la valeur hors liste passe en « Autre ». */
function fillCombo(inputId, value, emptyLabel) {
  const select = $(`${inputId}-select`);
  const input = $(inputId);
  const list = getActivites();
  const match = value ? list.find((a) => norm(a.libelle) === norm(value)) : null;
  select.innerHTML = `<option value="">${esc(emptyLabel)}</option>` +
    list.map((a) => `<option value="${esc(a.libelle)}">${esc(a.libelle)}</option>`).join("") +
    `<option value="${AUTRE}">Autre (saisie libre)…</option>`;
  if (!value) select.value = "";
  else if (match) select.value = match.libelle;
  else select.value = AUTRE;
  input.value = value && !match ? value : "";
  input.hidden = select.value !== AUTRE;
}

function comboValue(inputId) {
  const v = $(`${inputId}-select`).value;
  if (v === AUTRE) return $(inputId).value.trim() || null;
  return v || null;
}

function onComboChange(event) {
  const select = event.target.closest("select[data-combo]");
  if (!select) return;
  const input = $(select.dataset.combo);
  input.hidden = select.value !== AUTRE;
  if (!input.hidden) input.focus();
}

function renderActivites() {
  const list = getActivites();
  $("activites-list").innerHTML = list.length
    ? list.map((a) => `
      <li class="flex items-center gap-2 px-4 py-1.5">
        <input data-activite-id="${esc(a.id)}" value="${esc(a.libelle)}" autocomplete="off" maxlength="120" aria-label="Libellé de l'activité"
          class="h-9 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
        <button type="button" data-delete-activite="${esc(a.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer l'activité">${ICON_TRASH}</button>
      </li>`).join("")
    : '<li class="px-4 py-10 text-center text-sm text-zinc-500">Aucune activité.</li>';
}

function onActiviteAdd(event) {
  event.preventDefault();
  const libelle = $("activite-new").value.trim();
  if (!libelle) return $("activite-new").focus();
  if (getActivites().some((a) => norm(a.libelle) === norm(libelle))) {
    toast("Cette activité existe déjà.", "error");
    return;
  }
  try {
    state.db.run("INSERT INTO activites (libelle) VALUES (?)", [libelle]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  persist();
  $("activite-new").value = "";
  renderActivites();
  $("activite-new").focus();
}

/** Renommage : met aussi à jour les créneaux qui utilisaient l'ancien libellé. */
function onActiviteRename(event) {
  const input = event.target.closest("input[data-activite-id]");
  if (!input || !state.db) return;
  const id = Number(input.dataset.activiteId);
  const old = (query("SELECT libelle FROM activites WHERE id = ?", [id])[0] || {}).libelle;
  const libelle = input.value.trim();
  if (!old) return;
  if (!libelle || getActivites().some((a) => a.id !== id && norm(a.libelle) === norm(libelle))) {
    toast(libelle ? "Cette activité existe déjà." : "Le libellé ne peut pas être vide.", "error");
    input.value = old;
    return;
  }
  if (libelle === old) return;
  try {
    state.db.run("UPDATE activites SET libelle = ? WHERE id = ?", [libelle, id]);
    state.db.run("UPDATE edt SET cours_sagaie = ? WHERE cours_sagaie = ? COLLATE NOCASE", [libelle, old]);
    state.db.run("UPDATE edt SET activite = ? WHERE activite = ? COLLATE NOCASE", [libelle, old]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    input.value = old;
    return;
  }
  persist();
  toast("Activité renommée");
}

async function onActiviteClick(event) {
  const btn = event.target.closest("[data-delete-activite]");
  if (!btn || !state.db) return;
  const id = Number(btn.dataset.deleteActivite);
  const a = query("SELECT libelle FROM activites WHERE id = ?", [id])[0];
  if (!a) return;
  const ok = await confirmDialog({
    title: "Supprimer l'activité ?",
    message: `« ${a.libelle} » sera retirée de la liste. Les créneaux déjà saisis gardent leur texte.`,
  });
  if (!ok) return;
  try {
    state.db.run("DELETE FROM activites WHERE id = ?", [id]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  persist();
  renderActivites();
}
