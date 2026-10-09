/* CCPG — Vues : chaque fichier *.vue.js remplace son emplacement <div data-vue="…"> de index.html par son HTML.
 * Les vues sont chargées avant le code de l'application : toute la page existe quand celui-ci démarre. */
"use strict";

function injecterVue(nom, html) {
  const emplacement = document.querySelector(`[data-vue="${nom}"]`);
  if (!emplacement) throw new Error(`Emplacement de vue introuvable dans index.html : ${nom}`);
  emplacement.outerHTML = html.trim();
}
