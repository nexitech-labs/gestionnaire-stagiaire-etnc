/* CCPG — Vues : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Saisie des notes : onglets Physiques et Pédagogiques
injecterVue("notes", /* language=HTML */ `
<div id="tab-notes" hidden class="space-y-4">

<section id="tab-physiques" hidden class="space-y-4">
  <div id="phys-subtabs" role="tablist" aria-label="Épreuves physiques" class="flex flex-wrap gap-2"></div>
  <div id="phys-content"></div>
</section>

<section id="tab-pedagogiques" hidden>
  <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4">
      <div>
        <h2 class="font-semibold tracking-tight">Notes pédagogiques</h2>
      </div>
      <p id="pedagogiques-count" class="text-sm text-zinc-500"></p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead id="pedagogiques-head"></thead>
        <tbody id="pedagogiques-tbody"></tbody>
        <tfoot id="pedagogiques-foot"></tfoot>
      </table>
    </div>
  </div>
</section>

</div>
`);

// Fenêtre d'export des notes (impression, PDF, Excel)
injecterVue("fenetre-export-notes", /* language=HTML */ `
<div id="export-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="export-modal-title">
  <div class="w-full max-w-md overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
    <div class="flex items-center justify-between gap-4 border-b border-zinc-100 px-6 py-4">
      <div>
        <h2 id="export-modal-title" class="text-lg font-semibold tracking-tight">Exporter toutes les notes</h2>
        <p class="mt-0.5 text-sm text-zinc-500">Tableaux de la section : épreuves physiques, récapitulatif, pédagogiques, notes écrites des exemptés et moyennes. Les relevés individuels s'impriment depuis l'onglet « Relevé individuel ».</p>
      </div>
      <button type="button" data-close-export class="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Fermer">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="space-y-2 bg-zinc-50 p-4">
        <button type="button" data-export="print" class="group flex w-full items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
          <span class="min-w-0 flex-1"><span class="block font-medium">Imprimer</span><span class="block text-sm text-zinc-500">Un seul document, chaque tableau sur sa page.</span></span>
        </button>
        <button type="button" data-export="pdf" class="group flex w-full items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6M9 15l3 3 3-3"/></svg></span>
          <span class="min-w-0 flex-1"><span class="block font-medium">Exporter en PDF</span><span class="block text-sm text-zinc-500">Choisir « Enregistrer au format PDF » dans la fenêtre d'impression.</span></span>
        </button>
        <button type="button" data-export="excel" class="group flex w-full items-center gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg></span>
          <span class="min-w-0 flex-1"><span class="block font-medium">Exporter en Excel (.xlsx)</span><span class="block text-sm text-zinc-500">Feuille « Notes » au format du fichier Excel.</span></span>
        </button>
    </div>
  </div>
</div>
`);
