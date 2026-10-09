/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Fenêtre Sections (ajout, modification, sélection)
injecterVue("fenetre-sections", /* language=HTML */ `
<div id="sections-modal" hidden class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
  role="dialog" aria-modal="true" aria-labelledby="sections-modal-title">
  <div class="w-full max-w-7xl overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4">
      <div>
        <h2 id="sections-modal-title" class="text-lg font-semibold tracking-tight">Sections</h2>
      </div>
      <button type="button" data-close-sections class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Fermer">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="max-h-[80vh] overflow-y-auto p-4 sm:p-6">
        <section id="tab-sections" class="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <form id="section-form" novalidate class="h-fit rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div class="border-b border-zinc-100 p-5">
              <h2 id="section-form-title" class="font-semibold tracking-tight">Nouvelle section</h2>
            </div>
            <div class="space-y-4 p-5">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <label for="sf-formation" class="text-sm font-medium">Formation <span class="text-red-600">*</span></label>
                  <select id="sf-formation" name="formation" required
                    class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
                    <option value="">—</option>
                    <option value="CT1">CT1</option>
                    <option value="CT2">CT2</option>
                  </select>
                </div>
                <div class="space-y-1.5">
                  <label for="sf-annee" class="text-sm font-medium">Année scolaire <span class="text-red-600">*</span></label>
                  <input id="sf-annee" name="annee_scolaire" required type="number" min="2000" max="2100" step="1" inputmode="numeric" autocomplete="off" placeholder="2026"
                    class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
                </div>
              </div>
              <fieldset class="space-y-1.5">
                <legend class="text-sm font-medium">Période de stage</legend>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label for="sf-debut" class="mb-1 block text-xs text-zinc-500">Début</label>
                    <input id="sf-debut" name="date_debut" type="date"
                      class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
                  </div>
                  <div>
                    <label for="sf-fin" class="mb-1 block text-xs text-zinc-500">Fin</label>
                    <input id="sf-fin" name="date_fin" type="date"
                      class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
                  </div>
                </div>
              </fieldset>
              <div class="space-y-1.5">
                <label for="sf-moniteur" class="text-sm font-medium">Moniteur (grade et nom) <span class="text-red-600">*</span></label>
                <input id="sf-moniteur" name="moniteur" required autocomplete="off" placeholder="SCH DUPONT"
                  class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
              </div>
              <div class="space-y-1.5">
                <label for="sf-bareme" class="text-sm font-medium">Barème et coefficients</label>
                <select id="sf-bareme" name="bareme"
                  class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400"></select>
                <p class="text-xs text-zinc-500">La section garde ce barème et ces coefficients même s'ils sont modifiés ensuite.</p>
              </div>
              <p id="section-form-error" hidden class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"></p>
            </div>
            <div class="flex justify-end gap-2 border-t border-zinc-100 p-5">
              <button id="section-form-cancel" type="button" hidden
                class="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
              <button id="section-form-submit" type="submit"
                class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>Ajouter la section</span>
              </button>
            </div>
          </form>

          <div class="min-w-0 rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div class="flex items-center justify-between border-b border-zinc-100 p-5">
              <div>
                <h2 class="font-semibold tracking-tight">Sections enregistrées</h2>
                <p id="sections-count" class="mt-1 text-sm text-zinc-500"></p>
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th class="px-5 py-3 font-medium">Formation</th>
                    <th class="px-3 py-3 font-medium">Année</th>
                    <th class="px-3 py-3 font-medium">Période</th>
                    <th class="px-3 py-3 font-medium">Moniteur</th>
                    <th class="px-3 py-3 text-right font-medium">Effectif</th>
                    <th class="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody id="sections-tbody"></tbody>
              </table>
            </div>
          </div>
        </section>
    </div>
  </div>
</div>
`);
