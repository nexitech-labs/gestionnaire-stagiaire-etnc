/* CCPG — Vues : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Page Emploi du temps
injecterVue("emploi-du-temps", /* language=HTML */ `
<section id="tab-edt" hidden class="space-y-4">
  <div class="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2">
    <div class="space-y-1.5">
      <p class="text-xs font-medium uppercase tracking-wide text-zinc-500">Moniteur EPMS</p>
      <div class="flex gap-2">
        <span id="edt-moniteur-nom" class="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border border-zinc-100 bg-zinc-50 px-3 text-sm font-medium"></span>
        <input id="edt-poste-moniteur" data-section-col="poste_moniteur" autocomplete="off" placeholder="Poste" aria-label="Poste du moniteur"
          class="h-9 w-40 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
    </div>
    <div class="space-y-1.5">
      <label for="edt-chef" class="block text-xs font-medium uppercase tracking-wide text-zinc-500">Chef de section</label>
      <div class="flex gap-2">
        <input id="edt-chef" data-section-col="chef_section" autocomplete="off" placeholder="Grade et nom"
          class="h-9 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
        <input id="edt-poste-chef" data-section-col="poste_chef" autocomplete="off" placeholder="Poste" aria-label="Poste du chef de section"
          class="h-9 w-40 rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
    </div>
  </div>

  <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th class="px-4 py-3 font-medium">Semaine</th>
            <th class="px-3 py-3 font-medium">Date</th>
            <th class="px-3 py-3 font-medium">Heure</th>
            <th class="px-3 py-3 font-medium">Moniteur</th>
            <th class="px-3 py-3 font-medium">Cours SAGAIE</th>
            <th class="px-3 py-3 font-medium">Activité réalisée</th>
            <th class="px-3 py-3 font-medium">Obs.</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody id="edt-tbody"></tbody>
      </table>
    </div>
  </div>
</section>
`);

// Fenêtre d'un créneau d'emploi du temps
injecterVue("fenetre-creneau", /* language=HTML */ `
<div id="edt-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="edt-modal-title">
  <form id="edt-form" novalidate class="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="p-6 pb-0">
      <h2 id="edt-modal-title" class="text-lg font-semibold tracking-tight">Ajouter un créneau</h2>
    </div>
    <div class="grid gap-4 p-6 sm:grid-cols-6">
      <div class="space-y-1.5 sm:col-span-2">
        <label for="edt-date" class="text-sm font-medium">Date <span class="text-red-600">*</span></label>
        <input id="edt-date" type="date" required class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="edt-debut" class="text-sm font-medium">Début</label>
        <input id="edt-debut" type="time" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="edt-fin" class="text-sm font-medium">Fin</label>
        <input id="edt-fin" type="time" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      </div>
      <div class="space-y-1.5 sm:col-span-6">
        <label for="edt-moniteur" class="text-sm font-medium">Moniteur</label>
        <input id="edt-moniteur" autocomplete="off" placeholder="Grade et nom" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      </div>
      <div class="space-y-1.5 sm:col-span-6">
        <div class="flex items-baseline justify-between gap-2">
          <label for="edt-cours-select" class="text-sm font-medium">Cours SAGAIE <span class="font-normal text-zinc-400">(activité annoncée)</span></label>
          <a href="#/edt/activites" data-close-edt class="text-xs font-medium text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline">Modifier la liste</a>
        </div>
        <select id="edt-cours-select" data-combo="edt-cours" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400"></select>
        <input id="edt-cours" hidden autocomplete="off" maxlength="120" placeholder="Saisir l'activité" aria-label="Cours SAGAIE (saisie libre)" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400 mt-2">
      </div>
      <div class="space-y-1.5 sm:col-span-6">
        <label for="edt-activite-select" class="text-sm font-medium">Activité réalisée <span class="font-normal text-zinc-400">(si différente, en cas d'imprévu)</span></label>
        <select id="edt-activite-select" data-combo="edt-activite" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400"></select>
        <input id="edt-activite" hidden autocomplete="off" maxlength="120" placeholder="Saisir l'activité réalisée" aria-label="Activité réalisée (saisie libre)" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400 mt-2">
      </div>
      <div class="space-y-1.5 sm:col-span-6">
        <label for="edt-obs" class="text-sm font-medium">Observations</label>
        <input id="edt-obs" autocomplete="off" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      </div>
      <p id="edt-form-error" hidden class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-6"></p>
    </div>
    <div class="flex flex-col-reverse gap-2 border-t border-zinc-100 p-6 sm:flex-row sm:justify-end">
      <button type="button" data-close-edt
        class="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
      <button type="submit"
        class="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">Enregistrer</button>
    </div>
  </form>
</div>
`);
