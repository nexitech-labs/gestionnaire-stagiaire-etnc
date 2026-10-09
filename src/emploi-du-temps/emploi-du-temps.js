/* CCPG — Emploi du temps : planning, modification directe, fenêtre de créneau, impression. */
"use strict";

const EDT_SECTION_FIELDS = { "edt-poste-moniteur": "poste_moniteur", "edt-chef": "chef_section", "edt-poste-chef": "poste_chef" };

const ICON_COPY = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

function getEdt(sectionId) {
  return query("SELECT * FROM edt WHERE section_id = ? ORDER BY date, COALESCE(heure_debut, '99:99'), id", [sectionId]);
}

function isoToDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function mondayOf(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Semaine de stage (S1 = semaine du début de stage) ; à défaut, numéro de semaine ISO. */
function semaineLabel(iso, section) {
  const d = isoToDate(iso);
  if (!d) return "";
  const debut = isoToDate(section.date_debut);
  if (debut) {
    const n = Math.round((mondayOf(d) - mondayOf(debut)) / (7 * 86400000)) + 1;
    return n >= 1 ? `S${n}` : "Avant stage";
  }
  const t = new Date(d);
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const week = 1 + Math.round(((t - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `Sem. ${week}`;
}

function fmtJour(iso) {
  const d = isoToDate(iso);
  return d ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
}

function fmtHeures(r) {
  const h = (v) => (v || "").replace(":", "h");
  if (r.heure_debut && r.heure_fin) return `${h(r.heure_debut)} – ${h(r.heure_fin)}`;
  return h(r.heure_debut || r.heure_fin);
}

function activiteModifiee(r) {
  return !!r.activite && norm(r.activite) !== norm(r.cours_sagaie);
}

function renderEdt() {
  const s = getSection(state.activeSectionId);
  if (!s) return;
  $("edt-moniteur-nom").textContent = s.moniteur;
  for (const [id, col] of Object.entries(EDT_SECTION_FIELDS)) {
    if (document.activeElement !== $(id)) $(id).value = s[col] || "";
  }

  const rows = getEdt(s.id);
  if (!rows.length) {
    $("edt-tbody").innerHTML = `
      <tr><td colspan="8" class="px-4 py-10 text-center text-sm text-zinc-500">Aucun créneau. Cliquez sur « Ajouter un créneau ».</td></tr>`;
    return;
  }
  let lastWeek = null;
  let lastDate = null;
  const dash = '<span class="text-zinc-300">—</span>';
  const activites = getActivites();
  $("edt-tbody").innerHTML = rows.map((r) => {
    const week = semaineLabel(r.date, s);
    const newWeek = week !== lastWeek;
    const newDate = newWeek || r.date !== lastDate;
    lastWeek = week;
    lastDate = r.date;
    return `
      <tr class="${newWeek ? "border-t-2 border-zinc-200" : newDate ? "border-t border-zinc-200" : "border-t border-zinc-100"} align-top hover:bg-zinc-50/60" data-edt-row="${esc(r.id)}">
        <td class="px-4 py-2.5 font-semibold text-zinc-700">${newWeek ? esc(week) : ""}</td>
        <td class="whitespace-nowrap px-3 py-2.5 ${newDate ? "font-medium" : ""}">${newDate ? esc(fmtJour(r.date)) : ""}</td>
        <td class="whitespace-nowrap px-3 py-2.5 tabular-nums">${esc(fmtHeures(r)) || dash}</td>
        <td class="px-3 py-2.5">${esc(r.moniteur) || dash}</td>
        <td class="px-2 py-1.5">${inlineCombo("cours_sagaie", r, activites)}</td>
        <td class="px-2 py-1.5">${inlineCombo("activite", r, activites)}</td>
        <td class="px-2 py-1.5">
          <input data-inline="obs" data-id="${esc(r.id)}" value="${esc(r.obs)}" autocomplete="off" maxlength="200" placeholder="—"
            aria-label="Observations du ${esc(fmtJour(r.date))}"
            class="h-8 w-full min-w-[9rem] rounded-md border border-transparent bg-transparent px-2 text-sm text-zinc-700 placeholder:text-zinc-300 hover:border-zinc-200 focus:border-zinc-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10">
        </td>
        <td class="px-4 py-1.5">
          <div class="flex justify-end gap-1">
            <button type="button" data-edt-action="edit" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Modifier" aria-label="Modifier le créneau">${ICON_EDIT}</button>
            <button type="button" data-edt-action="duplicate" data-id="${esc(r.id)}" class="${BTN_ICON}" title="Dupliquer" aria-label="Dupliquer le créneau">${ICON_COPY}</button>
            <button type="button" data-edt-action="delete" data-id="${esc(r.id)}" class="${BTN_ICON_DANGER}" title="Supprimer" aria-label="Supprimer le créneau">${ICON_TRASH}</button>
          </div>
        </td>
      </tr>`;
  }).join("");
}

const INLINE_COLS = ["cours_sagaie", "activite", "obs"];

const INLINE_SELECT = "h-8 w-full min-w-[11rem] rounded-md border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10";

function activiteSelectClass(r) {
  if (activiteModifiee(r)) return `${INLINE_SELECT} border-amber-300 bg-amber-50 font-medium text-amber-800`;
  return `${INLINE_SELECT} border-zinc-200 bg-white text-zinc-400`;
}

/** Menu déroulant de la liste d'activités, avec la valeur hors liste éventuelle et « Autre… ». */
function inlineCombo(col, r, activites) {
  const value = r[col];
  const match = value ? activites.find((a) => norm(a.libelle) === norm(value)) : null;
  const selected = match ? match.libelle : value || "";
  const empty = col === "activite" ? "Conforme" : "—";
  const opt = (v, label) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(label)}</option>`;
  const cls = col === "activite" ? activiteSelectClass(r) : `${INLINE_SELECT} border-zinc-200 bg-white`;
  const title = col === "activite" && activiteModifiee(r) ? ' title="Activité différente du cours SAGAIE annoncé"' : "";
  return `
    <select data-inline="${col}" data-id="${esc(r.id)}" class="${cls}"${title}
      aria-label="${col === "activite" ? "Activité réalisée" : "Cours SAGAIE"} du ${esc(fmtJour(r.date))}">
      ${opt("", empty)}
      ${activites.map((a) => opt(a.libelle, a.libelle)).join("")}
      ${value && !match ? opt(value, value) : ""}
      <option value="${AUTRE}">Autre (saisie libre)…</option>
    </select>
    <input data-inline-free="${col}" data-id="${esc(r.id)}" hidden autocomplete="off" maxlength="120" placeholder="Saisir puis Entrée"
      aria-label="Saisie libre" class="mt-1 h-8 w-full min-w-[11rem] rounded-md border border-zinc-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10">`;
}

/** Enregistre un champ du créneau. Renvoie la ligne enregistrée, ou null si refusé. */
function saveEdtField(id, col, value) {
  if (!INLINE_COLS.includes(col)) return null;
  const r = query("SELECT * FROM edt WHERE id = ?", [id])[0];
  if (!r) return null;
  const next = { ...r, [col]: value };
  // Activité identique au cours annoncé : conforme
  if (next.activite && next.cours_sagaie && norm(next.activite) === norm(next.cours_sagaie)) next.activite = null;
  if (!next.cours_sagaie && !next.activite) {
    toast("Renseignez le cours SAGAIE ou l'activité réalisée.", "error");
    return null;
  }
  try {
    state.db.run("UPDATE edt SET cours_sagaie = ?, activite = ?, obs = ? WHERE id = ?",
      [next.cours_sagaie, next.activite, next.obs, id]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return null;
  }
  persist();
  return { before: r, after: next };
}

function onEdtInlineChange(event) {
  const el = event.target;
  const id = Number(el.dataset.id);
  if (!id || !state.db) return;

  if (el.matches("select[data-inline]")) {
    if (el.value === AUTRE) {
      const free = el.parentElement.querySelector("input[data-inline-free]");
      free.hidden = false;
      free.value = "";
      free.focus();
      return;
    }
    const res = saveEdtField(id, el.dataset.inline, el.value || null);
    if (!res) return renderEdt();
    // L'activité a été ramenée à « conforme » : on redessine la ligne
    if (res.after.activite !== (el.dataset.inline === "activite" ? (el.value || null) : res.before.activite)) return renderEdt();
    const act = $("edt-tbody").querySelector(`select[data-inline="activite"][data-id="${id}"]`);
    if (act) {
      act.className = activiteSelectClass(res.after);
      if (activiteModifiee(res.after)) act.title = "Activité différente du cours SAGAIE annoncé";
      else act.removeAttribute("title");
    }
    return;
  }

  if (el.matches("input[data-inline-free]")) {
    const v = el.value.trim();
    if (v) saveEdtField(id, el.dataset.inlineFree, v);
    renderEdt();
    return;
  }

  if (el.matches('input[data-inline="obs"]')) {
    el.value = el.value.trim();
    saveEdtField(id, "obs", el.value || null);
  }
}

function onEdtInlineKeydown(event) {
  const el = event.target;
  if (!el.matches("input[data-inline], input[data-inline-free]")) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (el.matches("input[data-inline-free]")) {
      // Validation explicite (sans attendre la perte de focus)
      const v = el.value.trim();
      if (v) saveEdtField(Number(el.dataset.id), el.dataset.inlineFree, v);
      renderEdt();
    } else {
      el.blur();
    }
  } else if (event.key === "Escape" && el.matches("input[data-inline-free]")) {
    event.stopPropagation();
    renderEdt();
  }
}

let edtReturnFocus = null;

function openEdtModal(id, duplicate) {
  const s = getSection(state.activeSectionId);
  if (!s) return;
  edtReturnFocus = document.activeElement;
  state.editingEdtId = id && !duplicate ? id : null;
  $("edt-form").reset();
  $("edt-form-error").hidden = true;

  const r = id ? query("SELECT * FROM edt WHERE id = ?", [id])[0] : null;
  fillCombo("edt-cours", r ? r.cours_sagaie : null, "— Choisir —");
  fillCombo("edt-activite", r ? r.activite : null, "Conforme au cours SAGAIE");
  if (r) {
    $("edt-date").value = r.date;
    $("edt-debut").value = r.heure_debut || "";
    $("edt-fin").value = r.heure_fin || "";
    $("edt-moniteur").value = r.moniteur || "";
    $("edt-obs").value = r.obs || "";
  } else {
    const last = getEdt(s.id).pop();
    $("edt-date").value = (last && last.date) || s.date_debut || todayIso();
    $("edt-moniteur").value = s.moniteur || "";
  }
  $("edt-modal-title").textContent = duplicate ? "Dupliquer le créneau" : r ? "Modifier le créneau" : "Ajouter un créneau";
  $("edt-modal").hidden = false;
  (r && !duplicate ? $("edt-activite-select") : $("edt-date")).focus();
}

function closeEdtModal() {
  if ($("edt-modal").hidden) return;
  $("edt-modal").hidden = true;
  state.editingEdtId = null;
  if (edtReturnFocus && edtReturnFocus.focus && document.contains(edtReturnFocus)) edtReturnFocus.focus();
}

function edtError(message, field) {
  $("edt-form-error").textContent = message;
  $("edt-form-error").hidden = false;
  if (field) $(field).focus();
}

function onEdtSubmit(event) {
  event.preventDefault();
  const v = {
    date: $("edt-date").value,
    debut: $("edt-debut").value || null,
    fin: $("edt-fin").value || null,
    moniteur: $("edt-moniteur").value.trim() || null,
    cours: comboValue("edt-cours"),
    activite: comboValue("edt-activite"),
    obs: $("edt-obs").value.trim() || null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return edtError("La date est obligatoire.", "edt-date");
  if (v.debut && v.fin && v.fin < v.debut) return edtError("L'heure de fin doit être après l'heure de début.", "edt-fin");
  if (!v.cours && !v.activite) return edtError("Renseignez le cours SAGAIE ou l'activité réalisée.", "edt-cours-select");
  // Activité identique au cours annoncé : considérée comme conforme
  if (v.activite && v.cours && norm(v.activite) === norm(v.cours)) v.activite = null;

  const params = [v.date, v.debut, v.fin, v.moniteur, v.cours, v.activite, v.obs];
  const editing = state.editingEdtId;
  const ok = editing
    ? mutate(`UPDATE edt SET date = ?, heure_debut = ?, heure_fin = ?, moniteur = ?, cours_sagaie = ?, activite = ?, obs = ?
              WHERE id = ?`, [...params, editing])
    : mutate(`INSERT INTO edt (section_id, date, heure_debut, heure_fin, moniteur, cours_sagaie, activite, obs)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [state.activeSectionId, ...params]);
  if (!ok) return;
  closeEdtModal();
  toast(editing ? "Créneau mis à jour" : "Créneau ajouté");
}

async function deleteEdt(id) {
  const r = query("SELECT * FROM edt WHERE id = ?", [id])[0];
  if (!r) return;
  const ok = await confirmDialog({
    title: "Supprimer le créneau ?",
    message: `${fmtJour(r.date)}${fmtHeures(r) ? ` · ${fmtHeures(r)}` : ""} — ${r.cours_sagaie || r.activite || ""}`,
  });
  if (ok && mutate("DELETE FROM edt WHERE id = ?", [id])) toast("Créneau supprimé");
}

/** En-tête (poste du moniteur, chef de section) : enregistré dans la section. */
function onEdtHeaderChange(event) {
  const col = EDT_SECTION_FIELDS[event.target.id];
  if (!col || !state.db || !state.activeSectionId) return;
  try {
    state.db.run(`UPDATE sections SET ${col} = ? WHERE id = ?`, [event.target.value.trim() || null, state.activeSectionId]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  persist();
}

function edtPrintHtml(s) {
  const rows = getEdt(s.id);
  const effectif = getStagiaires(s.id).length;
  const withPoste = (name, poste) => `${esc(name || "—")}${poste ? ` <span style="font-weight:400">(${esc(poste)})</span>` : ""}`;
  let lastWeek = null;
  let lastDate = null;
  const body = rows.length ? rows.map((r) => {
    const week = semaineLabel(r.date, s);
    const newWeek = week !== lastWeek;
    const newDate = newWeek || r.date !== lastDate;
    lastWeek = week;
    lastDate = r.date;
    const realise = activiteModifiee(r) ? `<b>${esc(r.activite)}</b>` : r.cours_sagaie ? "Conforme" : "";
    return `<tr>
      <td>${newWeek ? esc(week) : ""}</td><td>${newDate ? esc(fmtJour(r.date)) : ""}</td><td>${esc(fmtHeures(r))}</td>
      <td>${esc(r.moniteur)}</td><td>${esc(r.cours_sagaie)}</td><td>${realise}</td><td>${esc(r.obs)}</td>
    </tr>`;
  }).join("") : '<tr><td colspan="7" class="ps-empty">Aucun créneau enregistré.</td></tr>';
  return `
    <h1>Emploi du temps</h1>
    <p class="ps-sub">${esc(s.formation)} ${esc(s.annee_scolaire)}${periodLabel(s) ? ` — ${esc(periodLabel(s))}` : ""}</p>
    <dl class="ps-info">
      <div><dt>Moniteur EPMS</dt><dd>${withPoste(s.moniteur, s.poste_moniteur)}</dd></div>
      <div><dt>Chef de section</dt><dd>${withPoste(s.chef_section, s.poste_chef)}</dd></div>
      <div><dt>Stage</dt><dd>${esc(s.formation)} ${esc(s.annee_scolaire)}</dd></div>
      <div><dt>Période</dt><dd>${esc(periodLabel(s)) || "—"}</dd></div>
      <div><dt>Effectif</dt><dd>${effectif}</dd></div>
    </dl>
    <table>
      <thead><tr><th>Semaine</th><th>Date</th><th>Heure</th><th>Moniteur</th><th>Cours SAGAIE</th><th>Activité réalisée</th><th>Obs.</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <div class="ps-foot">
      <span>Moniteur : ${esc(s.moniteur)}</span>
      <span>Édité le ${esc(fmtDate(todayIso()))}</span>
    </div>`;
}
