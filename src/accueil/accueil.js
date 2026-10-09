/* CCPG — Page d'accueil. */
"use strict";

// Accueil : rappel de la section active
function renderHome(sections) {
  const s = sections.find((x) => x.id === state.activeSectionId);
  $("home-section").innerHTML = s
    ? `Section active : <span class="font-medium text-zinc-800">${esc(sectionLabel(s))}</span> · moniteur ${esc(s.moniteur)}`
    : "Aucune section pour le moment : créez-en une avec le bouton « Ajouter / modifier une section ».";
}
