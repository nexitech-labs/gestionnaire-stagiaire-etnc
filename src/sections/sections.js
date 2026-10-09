/* CCPG — Sections : fenêtre de gestion, liste, formulaire d'ajout / modification. */
"use strict";

function sectionLabel(s) {
  const period = periodLabel(s);
  return `${s.formation} — ${s.annee_scolaire}${period ? ` (${period})` : ""}`;
}

// Popup Sections
let sectionsReturnFocus = null;

function openSectionsModal(nouvelle) {
  if (!state.db) return;
  sectionsReturnFocus = document.activeElement;
  if (nouvelle) resetSectionForm();
  else if (!state.editingSectionId) fillBaremeSelect(null);
  refreshAll();
  $("sections-modal").hidden = false;
  if (nouvelle || !state.hasSections) $("sf-formation").focus();
  else $("sections-modal").querySelector("[data-close-sections]").focus();
}

function closeSectionsModal() {
  if ($("sections-modal").hidden) return;
  $("sections-modal").hidden = true;
  if (state.editingSectionId) resetSectionForm();
  refreshAll();
  if (sectionsReturnFocus && sectionsReturnFocus.focus && document.contains(sectionsReturnFocus)) sectionsReturnFocus.focus();
}

function renderSections(sections) {
  const versions = new Map(state.db ? getVersionsBaremes().map((v) => [v.id, v.libelle]) : []);
  $("sections-count").textContent = sections.length
    ? `${sections.length} section${sections.length > 1 ? "s" : ""}`
    : "Aucune section pour le moment.";

  if (!sections.length) {
    $("sections-tbody").innerHTML = `
      <tr><td colspan="6" class="px-5 py-10 text-center text-sm text-zinc-500">Utilisez le formulaire pour créer la première section.</td></tr>`;
    return;
  }

  $("sections-tbody").innerHTML = sections.map((s) => {
    const active = s.id === state.activeSectionId;
    const editing = s.id === state.editingSectionId;
    return `
      <tr class="border-b border-zinc-100 last:border-0 ${editing ? "bg-amber-50/60" : active ? "bg-zinc-50" : "hover:bg-zinc-50/60"}">
        <td class="px-5 py-3">
          <div class="flex items-center gap-2">
            <span class="font-medium">${esc(s.formation)}</span>
            ${active ? '<span class="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">Active</span>' : ""}
          </div>
          ${versions.has(s.bareme_version_id) ? `<div class="mt-0.5 text-xs text-zinc-500">${esc(versions.get(s.bareme_version_id))}</div>` : ""}
        </td>
        <td class="px-3 py-3 tabular-nums">${esc(s.annee_scolaire)}</td>
        <td class="px-3 py-3 text-zinc-600">${esc(periodLabel(s)) || '<span class="text-zinc-400">—</span>'}</td>
        <td class="px-3 py-3">${esc(s.moniteur)}</td>
        <td class="px-3 py-3 text-right tabular-nums">${esc(s.nb)}</td>
        <td class="px-5 py-2">
          <div class="flex justify-end gap-1">
            <button type="button" data-action="select-section" data-id="${esc(s.id)}"
              class="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium shadow-sm hover:bg-zinc-100">Sélectionner</button>
            <button type="button" data-action="edit-section" data-id="${esc(s.id)}" class="${BTN_ICON}" title="Éditer" aria-label="Éditer la section">${ICON_EDIT}</button>
            <button type="button" data-action="delete-section" data-id="${esc(s.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer la section">${ICON_TRASH}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function renderSectionOptions(select, sections, selectedId) {
  select.innerHTML = sections
    .map((s) => `<option value="${esc(s.id)}"${s.id === selectedId ? " selected" : ""}>${esc(sectionLabel(s))}</option>`)
    .join("");
}

function sectionFormError(message) {
  $("section-form-error").textContent = message || "";
  $("section-form-error").hidden = !message;
}

/** Liste des barèmes du formulaire de section (le barème en vigueur par défaut). */
function fillBaremeSelect(selectedId) {
  if (!state.db) return;
  const versions = getVersionsBaremes();
  const cur = versions.length ? versions[0].id : null;
  $("sf-bareme").innerHTML = versions.map((v) =>
    `<option value="${esc(v.id)}"${v.id === (selectedId ?? cur) ? " selected" : ""}>${esc(v.libelle)}${v.id === cur ? " (en vigueur)" : ""}</option>`).join("");
}

function resetSectionForm() {
  state.editingSectionId = null;
  $("section-form").reset();
  fillBaremeSelect(null);
  sectionFormError("");
  $("section-form-title").textContent = "Nouvelle section";
  $("section-form-submit").querySelector("span").textContent = "Ajouter la section";
  $("section-form-cancel").hidden = true;
}

function startEditSection(id) {
  const s = getSection(id);
  if (!s) return;
  state.editingSectionId = id;
  setSelectValue($("sf-formation"), s.formation);
  $("sf-annee").value = s.annee_scolaire;
  $("sf-debut").value = s.date_debut || "";
  $("sf-fin").value = s.date_fin || "";
  $("sf-moniteur").value = s.moniteur;
  fillBaremeSelect(s.bareme_version_id);
  sectionFormError("");
  $("section-form-title").textContent = "Modifier la section";
  $("section-form-submit").querySelector("span").textContent = "Mettre à jour";
  $("section-form-cancel").hidden = false;
  refreshAll();
  $("sf-formation").focus();
}

function onSectionSubmit(event) {
  event.preventDefault();
  const v = {
    formation: $("sf-formation").value,
    annee: $("sf-annee").value.trim(),
    debut: $("sf-debut").value || null,
    fin: $("sf-fin").value || null,
    moniteur: $("sf-moniteur").value.trim(),
    bareme: Number($("sf-bareme").value) || versionCourante(),
  };

  if (!v.formation) return sectionFormError("La formation est obligatoire."), $("sf-formation").focus();
  if (!/^\d{4}$/.test(v.annee)) return sectionFormError("L'année scolaire doit être une année sur 4 chiffres (ex. 2026)."), $("sf-annee").focus();
  if (v.debut && v.fin && v.fin < v.debut) return sectionFormError("La date de fin doit être postérieure à la date de début."), $("sf-fin").focus();
  if (!v.moniteur) return sectionFormError("Le moniteur est obligatoire."), $("sf-moniteur").focus();

  const params = [v.formation, v.annee, v.debut, v.fin, v.moniteur, v.bareme];
  if (state.editingSectionId) {
    const avant = getSection(state.editingSectionId);
    if (mutate("UPDATE sections SET formation = ?, annee_scolaire = ?, date_debut = ?, date_fin = ?, moniteur = ?, bareme_version_id = ? WHERE id = ?",
      [...params, state.editingSectionId])) {
      // Changement de barème : notes de la section recalculées
      if (avant && avant.bareme_version_id !== v.bareme) {
        sectionVersionCache = null;
        recomputeAutoNotes();
        persist();
      }
      toast(avant && avant.bareme_version_id !== v.bareme ? "Section mise à jour : notes recalculées avec le barème choisi" : "Section mise à jour");
      resetSectionForm();
      refreshAll();
    }
  } else {
    const res = mutate("INSERT INTO sections (formation, annee_scolaire, date_debut, date_fin, moniteur, bareme_version_id) VALUES (?, ?, ?, ?, ?, ?)", params);
    if (!res) return;
    state.activeSectionId = res.id || state.activeSectionId;
    lsSet("activeSection", state.activeSectionId);
    toast("Section ajoutée");
    resetSectionForm();
    refreshAll();
  }
}

async function deleteSection(id) {
  const s = getSection(id);
  if (!s) return;
  const extra = s.nb > 0
    ? ` Les ${s.nb} stagiaire${s.nb > 1 ? "s" : ""} rattaché${s.nb > 1 ? "s" : ""} ${s.nb > 1 ? "seront" : "sera"} également supprimé${s.nb > 1 ? "s" : ""}.`
    : "";
  const ok = await confirmDialog({
    title: "Supprimer la section ?",
    message: `La section ${sectionLabel(s)} sera définitivement supprimée.${extra}`,
  });
  if (!ok) return;
  if (mutate("DELETE FROM sections WHERE id = ?", [id])) {
    if (state.editingSectionId === id) resetSectionForm();
    toast("Section supprimée");
  }
}
