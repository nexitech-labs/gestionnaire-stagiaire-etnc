/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// En-tête des pages d'une section : titre, sous-onglets, boutons, résumé
injecterVue("entete-section", /* language=HTML */ `
<div class="flex flex-wrap items-center gap-3">
  <h2 id="page-title" class="text-xl font-semibold tracking-tight"></h2>
  <nav id="fiches-switch" hidden aria-label="Fiches terrain" class="inline-flex flex-wrap items-center rounded-md bg-zinc-200/70 p-1 text-zinc-500">
    <a href="#/fiches/mco" data-fiche="mco" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Marche-course</a>
    <a href="#/fiches/natation" data-fiche="natation" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Natation</a>
    <a href="#/fiches/f2400" data-fiche="f2400" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">2400 m + pompes + tractions</a>
    <a href="#/fiches/peda" data-fiche="peda" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Évaluation péda</a>
  </nav>
  <nav id="edt-switch" hidden aria-label="Emploi du temps" class="inline-flex items-center rounded-md bg-zinc-200/70 p-1 text-zinc-500">
    <a href="#/edt" data-edt-tab="edt" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Planning</a>
    <a href="#/edt/activites" data-edt-tab="activites" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Activités</a>
  </nav>
  <nav id="notes-switch" hidden aria-label="Type de notes" class="inline-flex items-center rounded-md bg-zinc-200/70 p-1 text-zinc-500">
    <a href="#/notes/physiques" data-notes="physiques" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Physiques (CCPG)</a>
    <a href="#/notes/pedagogiques" data-notes="pedagogiques" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Pédagogiques</a>
    <a href="#/notes/comportement" data-notes="comportement" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Comportement</a>
    <a href="#/notes/moyenne" data-notes="bilan" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Moyenne</a>
    <a href="#/notes/releve" data-notes="releve" class="seg-link inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition">Relevé individuel</a>
  </nav>
  <div class="ml-auto flex flex-wrap gap-2">
    <button id="btn-print" type="button"
      class="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-50">
      <span id="btn-print-icon" class="contents"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
      <span id="btn-print-label">Imprimer / Exporter PDF</span>
    </button>
    <button id="btn-add-stagiaire" type="button"
      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Ajouter un stagiaire
    </button>
    <button id="btn-add-creneau" type="button" hidden
      class="inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
      Ajouter un créneau
    </button>
  </div>
</div>

<div id="no-section" hidden class="rounded-lg border border-dashed border-zinc-300 bg-white p-10 text-center">
  <p class="text-sm font-medium text-zinc-700">Aucune section enregistrée</p>
  <button type="button" data-open-sections="new" class="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
    <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
    Créer une section
  </button>
</div>

<div id="section-summary" class="-mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-zinc-500"></div>
`);
