/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Fenêtre de confirmation
injecterVue("fenetre-confirmation", /* language=HTML */ `
<div id="confirm-modal" hidden class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
  <div class="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
    <h2 id="confirm-title" class="text-lg font-semibold tracking-tight"></h2>
    <p id="confirm-message" class="mt-2 whitespace-pre-line text-sm text-zinc-500"></p>
    <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button id="confirm-cancel" type="button"
        class="inline-flex h-9 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
      <button id="confirm-ok" type="button"
        class="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white shadow hover:bg-red-700">Supprimer</button>
    </div>
  </div>
</div>
`);
