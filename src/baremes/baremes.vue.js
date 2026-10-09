/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Page Barèmes & coefficients (onglets, import / export)
injecterVue("baremes", /* language=HTML */ `
<div id="view-settings" hidden class="space-y-6">
  <div class="flex flex-wrap items-center gap-3">
    <h2 class="text-xl font-semibold tracking-tight">Barèmes &amp; coefficients</h2>
    <nav aria-label="Barèmes et coefficients" class="inline-flex items-center rounded-md bg-zinc-200/70 p-1 text-zinc-500">
      <a href="#/parametres/baremes" data-settings="baremes" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Barèmes</a>
      <a href="#/parametres/coefficients" data-settings="coefficients" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Coefficients</a>
    </nav>
    <div class="ml-auto flex flex-wrap gap-2">
      <button id="btn-param-import" type="button" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-zinc-100" title="Importer un barème et des coefficients reçus d'un autre moniteur (.json)">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>
        Importer
      </button>
      <button id="btn-param-export" type="button" class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-zinc-100" title="Exporter le barème affiché et les coefficients pour les transmettre (.json)">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>
        Exporter
      </button>
      <input id="param-import-file" type="file" accept=".json,application/json" hidden>
    </div>
  </div>
<section id="tab-baremes" hidden>
  <div id="baremes-panel"></div>
</section>
<section id="tab-coefficients" hidden>
  <div id="coefs-panel"></div>
</section>
</div>
`);
