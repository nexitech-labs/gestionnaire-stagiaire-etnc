/* CCPG — Stagiaires : liste, tri, recherche, fenêtre d'ajout / modification. */
"use strict";

function renderStagiairesTab(sections) {
  const has = sections.length > 0;
  $("no-section").hidden = has;
  $("section-summary").hidden = !has;
  $("stagiaires-card").hidden = !has;
  $("btn-add-stagiaire").disabled = !has;
  $("btn-print").disabled = !has;
  $("active-section").disabled = !has;
  renderSectionOptions($("active-section"), sections, state.activeSectionId);
  if (!has) {
    $("active-section").innerHTML = '<option value="">Aucune section</option>';
    return;
  }
  $("active-section").insertAdjacentHTML("beforeend", `
    <option disabled>──────────</option>
    <option value="__new">＋ Nouvelle section…</option>
    <option value="__manage">Gérer les sections…</option>`);

  const section = sections.find((s) => s.id === state.activeSectionId);
  const rows = getStagiaires(section.id);
  renderSummary(section, rows);
  renderStagiaires(rows);
}

function renderSummary(s, rows) {
  const nbF = rows.filter((r) => r.sexe === "F").length;
  const item = (label, value) => `<span><span class="text-zinc-400">${label}</span> <span class="font-medium text-zinc-800">${value}</span></span>`;
  $("section-summary").innerHTML = [
    item("Section", `${esc(s.formation)} · ${esc(s.annee_scolaire)}`),
    periodLabel(s) ? item("Période", esc(periodLabel(s))) : "",
    item("Moniteur", esc(s.moniteur)),
    item("Effectif", `${rows.length} <span class="font-normal text-zinc-400">(${rows.length - nbF} H / ${nbF} F)</span>`),
  ].join("");
}

function sortValue(row, key) {
  if (key === "grade") return GRADE_RANK.get(String(row.grade).toUpperCase()) ?? 0;
  return norm(row[key]);
}

function sortRows(rows) {
  const { key, dir } = state.sort;
  return rows.slice().sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return norm(a.nom).localeCompare(norm(b.nom)) || norm(a.prenom).localeCompare(norm(b.prenom));
  });
}

function filterRows(rows) {
  const terms = norm(state.search).split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  return rows.filter((r) => {
    const hay = norm([r.nom, r.prenom, r.grade, r.armee].join(" "));
    return terms.every((t) => hay.includes(t));
  });
}

function renderStagiaires(allRows) {
  const rows = sortRows(filterRows(allRows));

  $("stagiaires-count").textContent = state.search.trim()
    ? `${rows.length} résultat${rows.length > 1 ? "s" : ""} sur ${allRows.length}`
    : `${allRows.length} stagiaire${allRows.length > 1 ? "s" : ""}`;

  document.querySelectorAll("#stagiaires-head th[data-sort]").forEach((th) => {
    const active = th.dataset.sort === state.sort.key;
    th.dataset.label ??= th.textContent.trim();
    th.textContent = th.dataset.label + (active ? (state.sort.dir > 0 ? " ↑" : " ↓") : "");
    th.classList.toggle("text-zinc-900", active);
    th.setAttribute("aria-sort", active ? (state.sort.dir > 0 ? "ascending" : "descending") : "none");
  });

  if (!rows.length) {
    $("stagiaires-tbody").innerHTML = `
      <tr><td colspan="9" class="px-4 py-10 text-center text-sm text-zinc-500">
        ${allRows.length ? "Aucun stagiaire ne correspond à la recherche." : "Aucun stagiaire dans cette section. Cliquez sur « Ajouter un stagiaire »."}
      </td></tr>`;
    return;
  }

  const dash = '<span class="text-zinc-400">—</span>';
  $("stagiaires-tbody").innerHTML = rows.map((r) => {
    const a = age(r.date_naissance);
    return `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        <td class="px-4 py-2.5"><span class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-medium">${esc(r.grade)}</span></td>
        <td class="px-3 py-2.5 font-medium uppercase">${esc(r.nom)}</td>
        <td class="px-3 py-2.5">${esc(r.prenom)}</td>
        <td class="px-3 py-2.5 text-zinc-600">${esc(r.armee) || dash}</td>
        <td class="px-3 py-2.5 text-zinc-600">${esc(r.origine_recrutement) || dash}</td>
        <td class="px-3 py-2.5">${esc(r.sexe)}</td>
        <td class="px-3 py-2.5 tabular-nums">${r.date_naissance ? `${esc(fmtDate(r.date_naissance))}${a != null ? ` <span class="text-xs text-zinc-400">(${a} ans)</span>` : ""}` : dash}</td>
        <td class="px-3 py-2.5 tabular-nums">${esc(fmtDate(r.derniere_visite_medicale)) || dash}</td>
        <td class="px-4 py-1.5">
          <div class="flex justify-end gap-1">
            <button type="button" data-action="edit-stagiaire" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Éditer" aria-label="Éditer le stagiaire">${ICON_EDIT}</button>
            <button type="button" data-action="delete-stagiaire" data-id="${esc(r.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer le stagiaire">${ICON_TRASH}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

function fillSelect(select, values, placeholder) {
  select.innerHTML = `<option value="">${esc(placeholder)}</option>` +
    values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

/** Sélectionne une valeur, en l'ajoutant si elle provient d'anciennes données hors liste. */
function setSelectValue(select, value) {
  const v = value ?? "";
  if (v && ![...select.options].some((o) => o.value === v)) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  select.value = v;
}

let lastFocus = null;

function openStagiaireModal(id) {
  const sections = getSections();
  if (!sections.length) return;
  lastFocus = document.activeElement;
  state.editingStagiaireId = id || null;

  const form = $("stagiaire-form");
  form.reset();
  fillSelect($("st-armee"), ARMEES, "— Non renseignée —");
  fillSelect($("st-origine"), ORIGINES, "— Non renseignée —");
  $("st-naissance").max = todayIso();
  $("st-vm").max = todayIso();
  $("stagiaire-form-error").hidden = true;

  let sectionId = state.activeSectionId;
  if (id) {
    const r = query("SELECT * FROM stagiaires WHERE id = ?", [id])[0];
    if (!r) return;
    sectionId = r.section_id;
    $("st-grade").value = r.grade;
    $("st-nom").value = r.nom;
    $("st-prenom").value = r.prenom;
    setSelectValue($("st-armee"), r.armee);
    setSelectValue($("st-origine"), r.origine_recrutement);
    setSelectValue($("st-sexe"), r.sexe);
    $("st-naissance").value = r.date_naissance || "";
    $("st-vm").value = r.derniere_visite_medicale || "";
    $("stagiaire-modal-title").textContent = `Modifier — ${r.grade} ${r.nom.toUpperCase()} ${r.prenom}`;
  } else {
    $("stagiaire-modal-title").textContent = "Ajouter un stagiaire";
  }
  renderSectionOptions($("st-section"), sections, sectionId);

  $("stagiaire-modal").hidden = false;
  $("st-grade").focus();
}

function closeStagiaireModal() {
  $("stagiaire-modal").hidden = true;
  state.editingStagiaireId = null;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function stagiaireError(message, field) {
  $("stagiaire-form-error").textContent = message;
  $("stagiaire-form-error").hidden = false;
  if (field) $(field).focus();
}

function onStagiaireSubmit(event) {
  event.preventDefault();
  const v = {
    section_id: Number($("st-section").value),
    grade: $("st-grade").value.trim().toUpperCase(),
    nom: $("st-nom").value.trim().toUpperCase(),
    prenom: $("st-prenom").value.trim(),
    armee: $("st-armee").value || null,
    origine: $("st-origine").value || null,
    sexe: $("st-sexe").value,
    naissance: $("st-naissance").value || null,
    vm: $("st-vm").value || null,
  };

  if (!v.section_id) return stagiaireError("Choisissez une section.", "st-section");
  if (!v.grade) return stagiaireError("Le grade est obligatoire.", "st-grade");
  if (!v.nom) return stagiaireError("Le nom est obligatoire.", "st-nom");
  if (!v.prenom) return stagiaireError("Le prénom est obligatoire.", "st-prenom");
  if (v.sexe !== "M" && v.sexe !== "F") return stagiaireError("Le sexe est obligatoire (M ou F).", "st-sexe");
  if (v.naissance && v.naissance > todayIso()) return stagiaireError("La date de naissance ne peut pas être dans le futur.", "st-naissance");
  if (v.vm && v.vm > todayIso()) return stagiaireError("La date de visite médicale ne peut pas être dans le futur.", "st-vm");

  const params = [v.section_id, v.grade, v.nom, v.prenom, v.armee, v.origine, v.sexe, v.naissance, v.vm];
  const editing = state.editingStagiaireId;
  const ok = editing
    ? mutate(`UPDATE stagiaires SET section_id = ?, grade = ?, nom = ?, prenom = ?, armee = ?, origine_recrutement = ?,
               sexe = ?, date_naissance = ?, derniere_visite_medicale = ? WHERE id = ?`, [...params, editing])
    : mutate(`INSERT INTO stagiaires (section_id, grade, nom, prenom, armee, origine_recrutement, sexe, date_naissance, derniere_visite_medicale)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, params);
  if (!ok) return;

  closeStagiaireModal();
  if (editing && recomputeAutoNotes()) {
    persist();
    refreshAll();
  }
  toast(editing ? "Stagiaire mis à jour" : "Stagiaire ajouté");
  if (v.section_id !== state.activeSectionId) {
    const target = getSection(v.section_id);
    toast(`Rattaché à la section ${target ? sectionLabel(target) : ""}`);
  }
}

async function deleteStagiaire(id) {
  const r = query("SELECT * FROM stagiaires WHERE id = ?", [id])[0];
  if (!r) return;
  const ok = await confirmDialog({
    title: "Supprimer le stagiaire ?",
    message: `${r.grade} ${r.nom.toUpperCase()} ${r.prenom} sera définitivement retiré de la section.`,
  });
  if (ok && mutate("DELETE FROM stagiaires WHERE id = ?", [id])) toast("Stagiaire supprimé");
}
