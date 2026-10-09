/* CCPG — État de l'interface (onglets, filtres, sélections). */
"use strict";

const state = {
  SQL: null,
  db: null,
  rootHandle: null,
  fileHandle: null,
  tab: "accueil",
  activeSectionId: Number(lsGet("activeSection")) || null,
  editingSectionId: null,
  editingStagiaireId: null,
  search: "",
  sort: { key: "nom", dir: 1 },
  hasSections: false,
  physTab: PHYS_TABS.includes(lsGet("physTab")) ? lsGet("physTab") : PHYS_TABS[0],
  ficheTab: ["mco", "natation", "f2400", "peda"].includes(lsGet("ficheTab")) ? lsGet("ficheTab") : "mco",
  ficheVariante: ["initial", "final"].includes(lsGet("ficheVariante")) ? lsGet("ficheVariante") : "initial", // CT1 : test initial / final
  releveSid: null,
  releveSel: new Set(), // stagiaires cochés pour l'impression groupée des relevés
  baremeFiltre: {
    armee: ARMEES_BAREME.some(([a]) => a === lsGet("bf.armee")) ? lsGet("bf.armee") : "TERRE",
    epreuve: EPREUVES.some((e) => e.id === lsGet("bf.epreuve")) ? lsGet("bf.epreuve") : EPREUVES[0].id,
    sexe: lsGet("bf.sexe") === "F" ? "F" : "M",
  },
};
