/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Fenêtre « Personnaliser la grille » (péda / comportement)
injecterVue("fenetre-grille", /* language=HTML */ `
<div id="grille-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="grille-modal-title">
  <div class="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4">
      <div>
        <h2 id="grille-modal-title" class="text-lg font-semibold tracking-tight">Personnaliser la grille</h2>
        <p id="grille-total" class="mt-0.5 text-sm text-zinc-500"></p>
      </div>
      <button type="button" data-close-grille class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Fermer">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div id="grille-body" class="flex-1 space-y-4 overflow-y-auto bg-zinc-50 p-4"></div>
    <p id="grille-error" hidden class="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"></p>
    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 px-4 py-3">
      <button type="button" data-grille-act="reset" class="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Grille d'origine (Excel)</button>
      <div class="flex gap-2">
        <button type="button" data-close-grille class="inline-flex h-9 items-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
        <button type="button" data-grille-act="save" class="inline-flex h-9 items-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">Enregistrer</button>
      </div>
    </div>
  </div>
</div>
`);
