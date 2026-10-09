/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Page Activités (menus de l'emploi du temps)
injecterVue("activites", /* language=HTML */ `
<section id="tab-activites" hidden>
  <div class="max-w-2xl rounded-lg border border-zinc-200 bg-white shadow-sm">
    <form id="activite-add-form" novalidate class="flex gap-2 border-b border-zinc-100 p-4">
      <input id="activite-new" autocomplete="off" maxlength="120" placeholder="Nouvelle activité" aria-label="Nouvelle activité" class="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 focus:border-zinc-400">
      <button type="submit"
        class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow hover:bg-zinc-800">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter
      </button>
    </form>
    <ul id="activites-list" class="divide-y divide-zinc-100"></ul>
  </div>
</section>
`);
