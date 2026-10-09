/* CCPG — Vues : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Page Fiches terrain (contenu rempli par fiches.js)
injecterVue("fiches", /* language=HTML */ `
<section id="tab-fiches" hidden>
  <div id="fiche-content"></div>
</section>
`);

// Fenêtre « Modifier » les colonnes d'une fiche terrain
injecterVue("fenetre-colonnes", /* language=HTML */ `
<div id="cols-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="cols-modal-title">
  <div class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4">
      <h2 id="cols-modal-title" class="text-lg font-semibold tracking-tight">Colonnes</h2>
      <button type="button" data-close-cols class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Fermer">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <ul id="cols-list" class="flex-1 divide-y divide-zinc-100 overflow-y-auto"></ul>
    <form id="col-add-form" novalidate class="flex gap-2 border-t border-zinc-100 p-4">
      <input id="col-new" autocomplete="off" maxlength="40" placeholder="Nouvelle colonne" aria-label="Nom de la nouvelle colonne" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      <button type="submit" class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter
      </button>
    </form>
    <div class="flex justify-between gap-2 border-t border-zinc-100 px-4 py-3">
      <button type="button" id="btn-cols-reset" class="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Colonnes d'origine</button>
      <button type="button" data-close-cols class="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Fermer</button>
    </div>
  </div>
</div>
`);

// Fenêtre d'impression des fiches terrain
injecterVue("fenetre-impression-fiches", /* language=HTML */ `
<div id="print-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="print-modal-title">
  <div class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4">
      <h2 id="print-modal-title" class="text-lg font-semibold tracking-tight">Imprimer / exporter des fiches</h2>
      <button type="button" data-close-print class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Fermer">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <label class="flex cursor-pointer items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-6 py-3 text-sm font-medium">
      <input type="checkbox" id="print-all" class="h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900">
      <span class="flex-1">Tout sélectionner</span>
      <span id="print-count" class="text-xs tabular-nums text-zinc-500"></span>
    </label>
    <ul id="print-list" class="flex-1 divide-y divide-zinc-100 overflow-y-auto"></ul>
    <div class="flex items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3">
      <p class="text-xs text-zinc-500">Un seul document, chaque fiche sur une nouvelle page.</p>
      <div class="flex shrink-0 gap-2">
        <button type="button" data-close-print class="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
        <button type="button" id="print-go"
          class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          <span>Imprimer / PDF</span>
        </button>
      </div>
    </div>
  </div>
</div>
`);
