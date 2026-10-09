/* CCPG — Saisie des notes : cases de saisie, tableau des notes pédagogiques, enregistrement. */
"use strict";

const NOTE_INPUT = "h-8 w-16 rounded-md border border-zinc-200 bg-white px-2 text-right text-sm tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";

const IDENTITY_HEAD = `
  <th class="px-4 py-3 font-medium">Grade</th>
  <th class="px-3 py-3 font-medium">Nom</th>
  <th class="px-3 py-3 font-medium">Prénom</th>`;

function identityCells(r) {
  return `
    <td class="px-4 py-2"><span class="inline-flex rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-medium">${esc(r.grade)}</span></td>
    <td class="px-3 py-2 font-medium uppercase">${esc(r.nom)}</td>
    <td class="px-3 py-2">${esc(r.prenom)}</td>`;
}

const PERF_INPUT = "h-8 w-28 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-sm placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400";

const SEXE_CELL = (r) => `<td class="px-3 py-2 text-center">${esc(r.sexe)}</td>`;

function noteInput(kind, col, r, label) {
  return `<input type="text" inputmode="decimal" autocomplete="off" class="${NOTE_INPUT}"
    data-kind="${kind}" data-col="${col}" data-sid="${esc(r.id)}" value="${esc(fmtNote(r[col]))}"
    aria-label="${esc(label)} — ${esc(r.grade)} ${esc(r.nom)} ${esc(r.prenom)}">`;
}

/** Note calculée, affichée sans pouvoir être modifiée. */
function noteLue(col, r, title) {
  const v = r[col];
  return `<span data-note="${esc(col)}-${esc(r.id)}" title="${esc(title)}"
    class="inline-flex h-8 w-16 items-center justify-end rounded-md bg-zinc-50 px-2 font-semibold tabular-nums ${v == null ? "text-zinc-300" : "text-zinc-800"}">${v == null ? "—" : esc(fmtNote(v))}</span>`;
}

/** Tableau de saisie simple (notes pédagogiques). */
function renderNotesTab(kind, rows) {
  const cfg = NOTES[kind];
  $(`${kind}-count`).textContent = `${rows.length} stagiaire${rows.length > 1 ? "s" : ""}`;
  $(`${kind}-head`).innerHTML = `
    <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
      ${IDENTITY_HEAD}
      ${cfg.fields.map(([f, short, label]) => `<th class="px-2 py-3 text-right font-medium" title="${esc(label)} (sur ${NOTE_MAX})">${esc(short)}${coefBadge(f)}</th>`).join("")}
      <th class="px-4 py-3 text-right font-medium">Moyenne /${NOTE_MAX}</th>
    </tr>`;

  if (!rows.length) {
    $(`${kind}-tbody`).innerHTML = emptyRow(cfg.fields.length + 4);
    $(`${kind}-foot`).innerHTML = "";
    return;
  }

  $(`${kind}-tbody`).innerHTML = rows.map((r) => `
    <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
      ${identityCells(r)}
      ${cfg.fields.map(([f, , label]) => `<td class="px-2 py-1.5 text-right">${INPUT_COLUMNS[kind] && INPUT_COLUMNS[kind][f] ? noteInput(kind, f, r, label) : noteLue(f, r, `${label} : calculée depuis l'onglet Comportement`)}</td>`).join("")}
      <td class="px-4 py-2 text-right" data-avg="${kind}-${esc(r.id)}">${avgHtml(average(r, kind))}</td>
    </tr>`).join("");
  renderNotesFoot(kind, rows);
}

function renderNotesFoot(kind, rows) {
  const cfg = NOTES[kind];
  const cols = cfg.fields.map(([f]) => round2(meanOf(rows.map((r) => r[f]))));
  const avg = meanOf(rows.map((r) => average(r, kind).avg));
  $(`${kind}-foot`).innerHTML = `
    <tr class="border-t border-zinc-200 bg-zinc-50">
      <td colspan="3" class="px-4 py-3 font-medium">Moyenne de la section</td>
      ${cols.map((v) => `<td class="py-3 pl-2 pr-4 text-right tabular-nums text-zinc-600">${v == null ? "—" : esc(fmtNote(v))}</td>`).join("")}
      <td class="px-4 py-3 text-right">${avgHtml({ avg })}</td>
    </tr>`;
}

function emptyRow(colspan) {
  return `
    <tr><td colspan="${colspan}" class="px-4 py-10 text-center text-sm text-zinc-500">
      Aucun stagiaire dans cette section. Ajoutez-en depuis l'onglet <button type="button" data-goto="stagiaires" class="font-medium text-zinc-900 underline underline-offset-4">Stagiaires</button>.
    </td></tr>`;
}

function setNoteInvalid(input, message) {
  input.classList.toggle("border-red-500", !!message);
  input.classList.toggle("bg-red-50", !!message);
  input.classList.toggle("border-zinc-200", !message);
  if (message) {
    input.setAttribute("aria-invalid", "true");
    input.title = message;
  } else {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("title");
  }
}

/** Distance en mètres : nombre positif (virgule acceptée), vide = null. */
function parseDistance(text) {
  const t = String(text).trim().replace(",", ".");
  if (!t) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: "Saisissez une distance en mètres (ex. 25)." };
  return { value: Math.round(Number(t) * 100) / 100 };
}

/** Met à jour la note affichée et son indicateur sans reconstruire le tableau (préserve le focus). */
function updateNoteCell(sid, epId, r) {
  const zone = $("phys-content");
  const cell = zone.querySelector(`[data-note="${epId}-${sid}"]`);
  if (cell && r) cell.outerHTML = noteLue(epId, r, "Note calculée d'après le barème");
  const ind = zone.querySelector(`[data-ind="${sid}"]`);
  if (ind && r) ind.innerHTML = noteIndicator(epId, r);
}

function onNoteChange(event) {
  const input = event.target;
  if (!state.db) return;

  if (input.matches("input[data-date-epreuve]")) {
    const ep = EPREUVES.find((e) => e.id === input.dataset.dateEpreuve);
    if (!ep || !state.activeSectionId) return;
    try {
      upsert("dates_epreuves", ["section_id", "epreuve"], ["section_id", "epreuve", "date_epreuve"],
        [state.activeSectionId, ep.id, input.value || null]);
    } catch (e) {
      toast(`Erreur base de données : ${errMsg(e)}`, "error");
      return;
    }
    persist();
    renderPhysSubtabs(getDatesEpreuves(state.activeSectionId));
    return;
  }

  if (!input.matches("input[data-col]")) return;
  const kind = input.dataset.kind;
  const column = input.dataset.col;
  // Nom de colonne validé par liste blanche (jamais du texte saisi)
  const type = INPUT_COLUMNS[kind] && INPUT_COLUMNS[kind][column];
  if (!type) return;

  let value;
  if (type === "perf") {
    value = input.value.trim().slice(0, PERF_MAX_LENGTH) || null;
    input.value = value ?? "";
  } else {
    const parsed = type === "note" ? parseNote(input.value) : parseDistance(input.value);
    if (parsed.error) {
      setNoteInvalid(input, parsed.error);
      toast(parsed.error, "error");
      return;
    }
    setNoteInvalid(input, null);
    value = parsed.value;
    input.value = fmtNote(value);
  }

  const sid = Number(input.dataset.sid);
  try {
    if (kind === "physiques") {
      const ep = EPREUVES.find((e) => column === `${e.id}_perf` || (e.extras || []).some(([c]) => c === column));
      if (column === "ecrit_exemption") {
        upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
      } else {
        upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
        updateNoteCell(sid, ep.id, applyAutoNote(sid, ep.id));
      }
    } else {
      upsert(NOTES[kind].table, ["stagiaire_id"], ["stagiaire_id", column], [sid, value]);
    }
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  persist();
  refreshAverages(kind);
}

/** Entrée / Maj+Entrée : stagiaire suivant / précédent dans la même colonne. */
function onNoteKeydown(event) {
  const input = event.target.closest("input[data-col]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  const column = [...event.currentTarget.querySelectorAll(`input[data-col="${input.dataset.col}"]`)];
  const next = column[column.indexOf(input) + (event.shiftKey ? -1 : 1)];
  if (next) next.focus();
  else input.blur();
}
