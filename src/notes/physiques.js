/* CCPG — Notes physiques : une page par épreuve et récapitulatif. */
"use strict";

function renderPhysSubtabs(dates) {
  const pill = (id, label, color, sub) => {
    const active = state.physTab === id;
    const style = active
      ? `background:${color};border-color:${color};color:#fff`
      : `border-color:#e4e4e7`;
    return `
      <button type="button" role="tab" data-phys="${id}" aria-selected="${active}" style="${style}"
        class="inline-flex h-9 items-center gap-2 rounded-md border bg-white px-3 text-sm font-medium shadow-sm transition hover:opacity-90">
        ${active ? "" : `<span class="h-2.5 w-2.5 rounded-full" style="background:${color}"></span>`}
        ${esc(label)}
        ${sub ? `<span class="text-xs font-normal ${active ? "text-white/80" : "text-zinc-400"}">${esc(sub)}</span>` : ""}
      </button>`;
  };
  $("phys-subtabs").innerHTML =
    EPREUVES.map((e) => pill(e.id, e.short, e.color, dates[e.id] ? fmtDate(dates[e.id]) : "")).join("") +
    pill("recap", "Récapitulatif", "#18181b", "");
}

function renderPhysiques(rows) {
  const dates = getDatesEpreuves(state.activeSectionId);
  renderPhysSubtabs(dates);
  const ep = EPREUVES.find((e) => e.id === state.physTab);
  $("phys-content").innerHTML = ep ? epreuveHtml(ep, rows, dates[ep.id]) : physRecapHtml(rows);
}

function epreuveHtml(ep, rows, date) {
  const extras = ep.extras || [];
  const ncols = 7 + extras.length;
  const body = rows.length
    ? rows.map((r) => estExempte(r, ep.id) ? `
      <tr class="border-b border-zinc-100 bg-amber-50/40 last:border-0">
        ${identityCells(r)}
        ${SEXE_CELL(r)}
        ${exemptCell(ep, r)}
        <td colspan="${1 + extras.length}" class="px-3 py-2 text-sm text-amber-800" title="Une seule note écrite par stagiaire : elle vaut pour toutes ses épreuves exemptées">
          Exempté — note écrite (coef ${esc(fmtNote(coefOf(ep.id)))})
        </td>
        <td class="px-4 py-1.5 text-right">${noteInput("physiques", "ecrit_exemption", r, "Note écrite (exemption)")}</td>
      </tr>` : `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        ${identityCells(r)}
        ${SEXE_CELL(r)}
        ${exemptCell(ep, r)}
        <td class="px-3 py-1.5">
          <input type="text" autocomplete="off" maxlength="${PERF_MAX_LENGTH}" class="${PERF_INPUT}"
            placeholder="${uniteEpreuve(armeeKey(r.armee), ep.id) === "temps" ? "mm:ss" : "nombre"}"
            data-kind="physiques" data-col="${ep.id}_perf" data-sid="${esc(r.id)}" value="${esc(r[`${ep.id}_perf`])}"
            aria-label="Performance ${esc(ep.label)} — ${esc(r.grade)} ${esc(r.nom)} ${esc(r.prenom)}">
        </td>
        ${extras.map(([c, label]) => `<td class="px-3 py-1.5 text-right">${noteInput("physiques", c, r, label)}</td>`).join("")}
        <td class="px-4 py-1.5">
          <div class="flex items-center justify-end gap-1.5">
            <span data-ind="${esc(r.id)}">${noteIndicator(ep.id, r)}</span>
            ${noteLue(ep.id, r, "Note calculée d'après le barème")}
          </div>
        </td>
      </tr>`).join("")
    : emptyRow(ncols);

  return `
    <div class="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-white" style="background:${ep.color}">
        <div>
          <h2 class="text-lg font-semibold tracking-tight">${esc(ep.short)}</h2>
          ${ep.short !== ep.label ? `<p class="text-sm text-white/85">${esc(ep.label)}</p>` : ""}
        </div>
        <label class="flex items-center gap-2 text-sm font-medium">
          Date de l'épreuve
          <input type="date" data-date-epreuve="${ep.id}" value="${esc(date || "")}"
            class="h-9 rounded-md border border-white/40 bg-white px-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
        </label>
      </div>
      <div class="flex items-center justify-end border-b border-zinc-100 px-5 py-2 text-sm text-zinc-500">
        <span>${rows.length} stagiaire${rows.length > 1 ? "s" : ""}</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              ${IDENTITY_HEAD}
              <th class="px-3 py-3 text-center font-medium">Sexe</th>
              <th class="px-3 py-3 text-center font-medium" title="Exempté de l'épreuve : noté au test écrit">Exempté</th>
              <th class="px-3 py-3 font-medium">Perf</th>
              ${extras.map(([, label]) => `<th class="px-3 py-3 text-right font-medium">${esc(label)} (m)</th>`).join("")}
              <th class="px-4 py-3 text-right font-medium">Note /${NOTE_MAX}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot id="phys-foot">${rows.length ? epreuveFootHtml(ep, rows) : ""}</tfoot>
        </table>
      </div>
    </div>`;
}

function epreuveFootHtml(ep, rows) {
  const extras = ep.extras || [];
  const mean = (col) => {
    const v = round2(meanOf(rows.filter((r) => !estExempte(r, ep.id)).map((r) => r[col])));
    return v == null ? "—" : esc(fmtNote(v));
  };
  return `
    <tr class="border-t border-zinc-200 bg-zinc-50">
      <td colspan="6" class="px-4 py-3 font-medium">Moyenne de la section</td>
      ${extras.map(([c]) => `<td class="py-3 pl-3 pr-4 text-right tabular-nums text-zinc-600">${mean(c)}</td>`).join("")}
      <td class="px-4 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => noteRetenue(r, ep.id))) })}</td>
    </tr>`;
}

function physRecapHtml(rows) {
  const body = rows.length
    ? rows.map((r) => `
      <tr class="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/60">
        ${identityCells(r)}
        ${SEXE_CELL(r)}
        ${EPREUVES.map((e) => { const n = noteRetenue(r, e.id); return `<td class="px-3 py-2.5 text-right">${estExempte(r, e.id) ? '<span class="mr-1 text-[11px] font-medium text-amber-700" title="Exempté : note du test écrit">écrit</span>' : ""}${n == null ? '<span class="text-zinc-300">—</span>' : avgHtml({ avg: n })}</td>`; }).join("")}
        <td class="px-4 py-2.5 text-right">${avgHtml(average(r, "physiques"))}</td>
      </tr>`).join("")
    : emptyRow(EPREUVES.length + 5);
  const foot = rows.length ? `
    <tr class="border-t border-zinc-200 bg-zinc-50">
      <td colspan="4" class="px-4 py-3 font-medium">Moyenne de la section</td>
      ${EPREUVES.map((e) => `<td class="px-3 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => noteRetenue(r, e.id))) })}</td>`).join("")}
      <td class="px-4 py-3 text-right">${avgHtml({ avg: meanOf(rows.map((r) => average(r, "physiques").avg)) })}</td>
    </tr>` : "";
  return `
    <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4">
        <div>
          <h2 class="font-semibold tracking-tight">Récapitulatif des notes physiques</h2>
        </div>
        <p class="text-sm text-zinc-500">${rows.length} stagiaire${rows.length > 1 ? "s" : ""}</p>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
              ${IDENTITY_HEAD}
              <th class="px-3 py-3 text-center font-medium">Sexe</th>
              ${EPREUVES.map((e) => `<th class="px-3 py-3 text-right font-medium" title="${esc(e.label)}">
                <span class="inline-block rounded px-1.5 py-0.5 text-white" style="background:${e.color}">${esc(e.short)}</span>${coefBadge(e.id)}</th>`).join("")}
              <th class="px-4 py-3 text-right font-medium">Moyenne /${NOTE_MAX}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>${foot}</tfoot>
        </table>
      </div>
    </div>`;
}

function noteIndicator(epId, r) {
  const calc = computeNote(epId, r);
  if (calc.raison) {
    return `<span class="cursor-help text-[11px] font-medium text-amber-600" title="${esc(calc.raison)}">⚠</span>`;
  }
  if (calc.note != null) return '<span class="text-[11px] text-zinc-400" title="Note calculée d\'après le barème">auto</span>';
  return "";
}
