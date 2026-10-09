/* CCPG — Vue : HTML injecté dans index.html à la place des emplacements data-vue. */
"use strict";

// Saisie des notes : onglet Moyenne
injecterVue("moyennes", /* language=HTML */ `
<section id="tab-bilan" hidden>
  <div class="rounded-lg border border-zinc-200 bg-white shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-4">
      <div>
        <h2 class="font-semibold tracking-tight">Moyennes par stagiaire</h2>
      </div>
      <p id="bilan-count" class="text-sm text-zinc-500"></p>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th class="px-4 py-3 font-medium">Grade</th>
            <th class="px-3 py-3 font-medium">Nom</th>
            <th class="px-3 py-3 font-medium">Prénom</th>
            <th class="px-3 py-3 text-right font-medium">Moyenne physique</th>
            <th class="px-3 py-3 text-right font-medium">Moyenne pédagogique</th>
            <th class="px-4 py-3 text-right font-medium">Moyenne E²PMS</th>
          </tr>
        </thead>
        <tbody id="bilan-tbody"></tbody>
        <tfoot id="bilan-foot"></tfoot>
      </table>
    </div>
  </div>
</section>
`);
