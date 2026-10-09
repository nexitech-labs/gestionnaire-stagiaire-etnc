/* CCPG — Coefficients CT1 / CT2 : lecture par version et page Coefficients. */
"use strict";

let coefsCache = null;

function insertCoefsDefaut(db) {
  const stmt = db.prepare("INSERT OR REPLACE INTO coefficients (formation, epreuve, coef) VALUES (?, ?, ?)");
  try {
    for (const f of FORMATIONS) for (const [ep, c] of Object.entries(COEFS_DEFAUT)) stmt.run([f, ep, c]);
  } finally {
    stmt.free();
  }
}

/** Coefficients d'une formation dans une version (par défaut celle de la section active) : { épreuve: coef }. */
function getCoefs(formation, versionId = versionDeSection(state.activeSectionId)) {
  if (!coefsCache) {
    coefsCache = {};
    for (const r of query("SELECT version_id, formation, epreuve, coef FROM coefficients_versions")) {
      ((coefsCache[r.version_id] ||= {})[r.formation] ||= {})[r.epreuve] = r.coef;
    }
  }
  return (coefsCache[versionId] || {})[formation] || {};
}

/** Coefficient d'une épreuve (1 si non défini), pour la section active sauf version précisée. */
function coefOf(epreuve, formation = state.activeFormation, versionId = undefined) {
  const c = getCoefs(formation, versionId)[epreuve];
  return c == null ? 1 : c;
}

function renderCoefs() {
  const ctx = versionContexte();
  const vid = ctx.version.id;
  const ro = ctx.editable ? "" : "disabled";
  const ligne = (ep, label, color) => `
    <tr class="border-b border-zinc-100 last:border-0">
      <td class="px-5 py-2">
        <span class="flex items-center gap-2">
          ${color ? `<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:${color}"></span>` : '<span class="h-2.5 w-2.5 shrink-0"></span>'}
          <span class="font-medium">${esc(label)}</span>
        </span>
      </td>
      ${FORMATIONS.map((f) => `
      <td class="px-3 py-1.5 text-right">
        <input type="text" inputmode="decimal" autocomplete="off" ${ro} class="${CELL_INPUT} w-20 disabled:bg-zinc-50 disabled:text-zinc-500"
          data-coef-formation="${esc(f)}" data-coef-epreuve="${esc(ep)}" value="${esc(fmtNote(coefOf(ep, f, vid)))}"
          aria-label="Coefficient ${esc(f)} — ${esc(label)}">
      </td>`).join("")}
    </tr>`;
  const groupe = (titre) => `
    <tr class="bg-zinc-50"><td colspan="${FORMATIONS.length + 1}" class="px-5 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">${titre}</td></tr>`;
  const total = (fields) => FORMATIONS.map((f) => fmtNote(round2(fields.reduce((n, ep) => n + coefOf(ep, f, vid), 0))));
  const physIds = EPREUVES.map((e) => e.id);
  const pedaIds = NOTES.pedagogiques.fields.map(([f]) => f);

  $("coefs-panel").innerHTML = `
    <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 p-5">
        <div>
          <h2 class="font-semibold tracking-tight">Coefficients</h2>
        </div>
        ${ctx.editable ? `<button type="button" id="btn-reset-coefs"
          class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          Coefficients par défaut (Excel)
        </button>` : ""}
      </div>
      ${versionBlocHtml(ctx)}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th class="px-5 py-3 font-medium">Épreuve</th>
              ${FORMATIONS.map((f) => `<th class="px-3 py-3 text-right font-medium">${esc(f)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${groupe("Notes physiques (CCPG)")}
            ${EPREUVES.map((e) => ligne(e.id, e.short !== e.label ? `${e.short} — ${e.label}` : e.label, e.color)).join("")}
            ${groupe("Notes pédagogiques")}
            ${NOTES.pedagogiques.fields.map(([f, , label]) => ligne(f, label, null)).join("")}
          </tbody>
          <tfoot>
            <tr class="border-t border-zinc-200 bg-zinc-50 text-zinc-600">
              <td class="px-5 py-2.5">Total physique / pédagogique</td>
              ${FORMATIONS.map((f, i) => `<td class="px-3 py-2.5 text-right tabular-nums" data-coef-total="${esc(f)}">${esc(total(physIds)[i])} / ${esc(total(pedaIds)[i])}</td>`).join("")}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`;
}

/** Après un changement de coefficient. Les autres pages se recalculent à l'affichage. */
function afterCoefChange(full) {
  invalidateBaremes();
  persist();
  if (full) {
    renderCoefs();
    return;
  }
  // Saisie case par case : seuls les totaux changent (le focus reste sur la case suivante)
  const sum = (ids, f) => fmtNote(round2(ids.reduce((n, ep) => n + coefOf(ep, f, state.baremeVersion), 0)));
  const physIds = EPREUVES.map((e) => e.id);
  const pedaIds = NOTES.pedagogiques.fields.map(([f]) => f);
  for (const f of FORMATIONS) {
    const cell = $("coefs-panel").querySelector(`[data-coef-total="${f}"]`);
    if (cell) cell.textContent = `${sum(physIds, f)} / ${sum(pedaIds, f)}`;
  }
}

function onCoefChange(event) {
  const el = event.target;
  if (!state.db) return;
  if (onVersionChange(el)) return;
  if (!el.matches("[data-coef-formation][data-coef-epreuve]") || state.baremeVersion !== versionCourante()) return;
  const formation = el.dataset.coefFormation;
  const epreuve = el.dataset.coefEpreuve;
  if (!FORMATIONS.includes(formation) || !(epreuve in COEFS_DEFAUT)) return;
  const t = el.value.trim().replace(",", ".");
  const n = Number(t);
  if (!t || !/^\d+(\.\d+)?$/.test(t) || n > COEF_MAX) {
    setNoteInvalid(el, `Coefficient attendu entre 0 et ${COEF_MAX}.`);
    toast(`Coefficient attendu entre 0 et ${COEF_MAX}.`, "error");
    return;
  }
  setNoteInvalid(el, null);
  let copie;
  try {
    copie = versionPourModifier();
    upsert("coefficients_versions", ["version_id", "formation", "epreuve"], ["version_id", "formation", "epreuve", "coef"],
      [copie.versionId, formation, epreuve, Math.round(n * 100) / 100]);
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  el.value = fmtNote(Math.round(n * 100) / 100);
  afterCoefChange(!!copie.map); // nouvelle version : page réaffichée
}

async function onCoefClick(event) {
  if (!state.db || await onVersionDelete(event) || !event.target.closest("#btn-reset-coefs")) return;
  const ok = await confirmDialog({
    title: "Rétablir les coefficients ?",
    message: "Les coefficients CT1 et CT2 de la version en vigueur reprendront les valeurs du fichier Excel (M-CO 2, autres épreuves 1, notes pédagogiques 1). Si cette version est déjà utilisée par des sections, elles gardent leurs coefficients et une nouvelle version est créée.",
    confirmLabel: "Rétablir",
  });
  if (!ok) return;
  try {
    const { versionId } = versionPourModifier();
    for (const f of FORMATIONS) {
      for (const [ep, c] of Object.entries(COEFS_DEFAUT)) {
        state.db.run("INSERT OR REPLACE INTO coefficients_versions (version_id, formation, epreuve, coef) VALUES (?, ?, ?, ?)", [versionId, f, ep, c]);
      }
    }
  } catch (e) {
    toast(`Erreur base de données : ${errMsg(e)}`, "error");
    return;
  }
  afterCoefChange(true);
  toast("Coefficients par défaut rétablis");
}
