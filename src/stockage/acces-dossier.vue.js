/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Fenêtre d'accès au dossier du projet
injecterVue("fenetre-acces", /* language=HTML */ `
<div id="access-modal" hidden class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="access-title">
  <div class="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-lg">
    <div class="flex items-start gap-3">
      <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
      </div>
      <div>
        <h2 id="access-title" class="text-lg font-semibold tracking-tight">Accès au dossier du projet</h2>
        <p class="mt-1.5 text-sm text-zinc-500">L'application enregistre ses données dans <code class="rounded bg-zinc-100 px-1 py-0.5 text-xs">db/ccpg.db</code>. Sélectionnez le dossier racine du projet (celui qui contient <code class="rounded bg-zinc-100 px-1 py-0.5 text-xs">index.html</code>).</p>
      </div>
    </div>

    <p id="access-info" hidden class="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"></p>

    <div class="mt-5 space-y-1.5">
      <p class="text-sm font-medium">Chemin du dossier</p>
      <div class="flex gap-2">
        <code id="access-path" class="flex min-h-9 flex-1 items-center break-all rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-xs"></code>
        <button id="btn-copy-path" type="button"
          class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium shadow-sm hover:bg-zinc-100">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="btn-copy-label">Copier</span>
        </button>
      </div>
      <p class="text-xs text-zinc-500">Le chemin est copié automatiquement : dans la fenêtre Windows, collez-le (Ctrl+V) dans le champ « Dossier », puis validez.</p>
    </div>

    <p id="access-error" hidden class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"></p>

    <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button id="btn-access-cancel" type="button" hidden
        class="inline-flex h-10 items-center justify-center rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium shadow-sm hover:bg-zinc-100">Annuler</button>
      <button id="btn-authorize" type="button"
        class="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">Autoriser l'accès au dossier du projet</button>
    </div>
  </div>
</div>
`);
