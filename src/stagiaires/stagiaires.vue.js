/* CCPG — Vues : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Page Stagiaires (liste et recherche)
injecterVue("stagiaires", /* language=HTML */ `
<section id="tab-stagiaires" hidden>
  <div id="stagiaires-card" class="rounded-lg border border-zinc-200 bg-white shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4">
      <div class="relative w-full sm:w-96">
        <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="search" type="search" autocomplete="off" placeholder="Rechercher (nom, prénom, grade, armée)…"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <p id="stagiaires-count" class="text-sm text-zinc-500"></p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr id="stagiaires-head" class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th data-sort="grade" class="px-4 py-3 font-medium">Grade</th>
            <th data-sort="nom" class="px-3 py-3 font-medium">Nom</th>
            <th data-sort="prenom" class="px-3 py-3 font-medium">Prénom</th>
            <th data-sort="armee" class="px-3 py-3 font-medium">Armée</th>
            <th data-sort="origine_recrutement" class="px-3 py-3 font-medium">Origine</th>
            <th data-sort="sexe" class="px-3 py-3 font-medium">Sexe</th>
            <th data-sort="date_naissance" class="px-3 py-3 font-medium">Naissance</th>
            <th data-sort="derniere_visite_medicale" class="px-3 py-3 font-medium">Dernière VM</th>
            <th class="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody id="stagiaires-tbody"></tbody>
      </table>
    </div>
  </div>
</section>
`);

// Listes de suggestions du formulaire stagiaire
injecterVue("listes-stagiaires", /* language=HTML */ `
<datalist id="dl-grades"></datalist>
`);

// Fenêtre d'ajout / modification d'un stagiaire
injecterVue("fenetre-stagiaire", /* language=HTML */ `
<div id="stagiaire-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="stagiaire-modal-title">
  <form id="stagiaire-form" novalidate class="max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="p-6 pb-0">
      <h2 id="stagiaire-modal-title" class="text-lg font-semibold tracking-tight">Ajouter un stagiaire</h2>
    </div>
    <div class="grid gap-4 p-6 sm:grid-cols-6">
      <div class="space-y-1.5 sm:col-span-6">
        <label for="st-section" class="text-sm font-medium">Section <span class="text-red-600">*</span></label>
        <select id="st-section" name="section_id" required
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20"></select>
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-grade" class="text-sm font-medium">Grade <span class="text-red-600">*</span></label>
        <input id="st-grade" name="grade" required list="dl-grades" autocomplete="off" placeholder="CPL"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm uppercase shadow-sm placeholder:normal-case placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-nom" class="text-sm font-medium">Nom <span class="text-red-600">*</span></label>
        <input id="st-nom" name="nom" required autocomplete="off"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm uppercase shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-prenom" class="text-sm font-medium">Prénom <span class="text-red-600">*</span></label>
        <input id="st-prenom" name="prenom" required autocomplete="off"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <div class="space-y-1.5 sm:col-span-3">
        <label for="st-armee" class="text-sm font-medium">Armée</label>
        <select id="st-armee" name="armee"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20"></select>
      </div>
      <div class="space-y-1.5 sm:col-span-3">
        <label for="st-origine" class="text-sm font-medium">Origine de recrutement</label>
        <select id="st-origine" name="origine_recrutement"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20"></select>
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-sexe" class="text-sm font-medium">Sexe <span class="text-red-600">*</span></label>
        <select id="st-sexe" name="sexe" required
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
          <option value="">—</option>
          <option value="M">M</option>
          <option value="F">F</option>
        </select>
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-naissance" class="text-sm font-medium">Date de naissance</label>
        <input id="st-naissance" name="date_naissance" type="date"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <div class="space-y-1.5 sm:col-span-2">
        <label for="st-vm" class="text-sm font-medium">Dernière visite médicale</label>
        <input id="st-vm" name="derniere_visite_medicale" type="date"
          class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/20">
      </div>
      <p id="stagiaire-form-error" hidden class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-6"></p>
    </div>
    <div class="flex flex-col-reverse gap-2 border-t border-zinc-100 p-6 sm:flex-row sm:justify-end">
      <button type="button" data-close-modal
        class="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
      <button id="stagiaire-form-submit" type="submit"
        class="inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">Enregistrer</button>
    </div>
  </form>
</div>
`);
