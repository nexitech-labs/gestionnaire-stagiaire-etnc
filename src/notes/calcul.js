/* CCPG — Notes physiques : calcul de la note d'après le barème (performances, aisance aquatique). */
"use strict";

/** "Terre" / "Armée de Terre" → "TERRE" ; null si inconnue. */
function armeeKey(armee) {
  const n = norm(armee);
  if (n.includes("terre")) return "TERRE";
  if (n.includes("air")) return "AIR";
  if (n.includes("mer") || n.includes("marine")) return "MER";
  return null;
}

/** "temps" : plus petit = meilleur (seuil maximal) ; "nombre" : plus grand = meilleur (seuil minimal). */
function uniteEpreuve(armee, epreuve) {
  if (epreuve === "m_co" || epreuve === "aisance_aquatique") return "temps";
  if (epreuve === "ecr") return armee === "AIR" ? "nombre" : "temps"; // ECR Air noté en paliers
  return "nombre";
}

/** Performance saisie → { value } (secondes ou nombre), { sansNote } (inapte, absent…) ou { error }. */
function parsePerf(text, unite) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return { value: null };
  if (PERF_SANS_NOTE.includes(norm(t))) return { sansNote: true };
  const nums = t.match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return { error: unite === "temps" ? "Temps attendu (ex. 52:30 ou 1:02:30)." : "Nombre attendu (ex. 12)." };
  const n = nums.map((x) => Number(x.replace(",", ".")));
  if (unite === "nombre") return { value: n[0] };
  if (n.length === 2) return { value: Math.floor(n[0]) * 60 + n[1] };
  if (n.length === 3) return { value: Math.floor(n[0]) * 3600 + Math.floor(n[1]) * 60 + n[2] };
  return { error: "Temps attendu au format mm:ss ou h:mm:ss (ex. 52:30)." };
}

function fmtPerf(value, unite) {
  if (value == null) return "";
  if (unite !== "temps") return fmtNote(value);
  const total = Math.round(value * 100) / 100;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = Math.round((total % 60) * 100) / 100;
  const ss = (sec < 10 ? "0" : "") + String(sec).replace(".", ",");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Note d'une épreuve d'après le barème : { note, raison }. note = null si aucun calcul possible. */
function computeNote(epId, r) {
  const perf = r[`${epId}_perf`];
  if (perf == null || String(perf).trim() === "") return { note: null, raison: null };
  const armee = armeeKey(r.armee);
  if (!armee) return { note: null, raison: "Armée du stagiaire non renseignée (fiche stagiaire)." };
  if (r.sexe !== "M" && r.sexe !== "F") return { note: null, raison: "Sexe du stagiaire non renseigné." };
  const unite = uniteEpreuve(armee, epId);
  const p = parsePerf(perf, unite);
  if (p.sansNote) return { note: null, raison: `« ${perf} » : pas de note.` };
  if (p.error) return { note: null, raison: `Performance non reconnue : ${p.error}` };

  const bareme = getBaremes(versionDeSection(r.section_id)).filter((b) => b.armee === armee && b.epreuve === epId && b.sexe === r.sexe);
  if (!bareme.length) return { note: null, raison: `Aucun barème ${armee} / ${r.sexe} pour cette épreuve.` };

  const aqua = epId === "aisance_aquatique";
  // Temps comptés à la seconde, comme dans l'Excel (34:59,6 → 34:59)
  const pv = unite === "temps" ? Math.floor(p.value) : p.value;
  // Distances non saisies = épreuve complète (plus grande distance du barème)
  const plein = (lo, hi) => Math.max(0, ...bareme.map((b) => b[hi] ?? b[lo] ?? 0));
  const nage = r.aisance_aquatique_nage ?? plein("nage_min", "nage_max");
  const apnee = r.aisance_aquatique_apnee ?? plein("apnee_min", "apnee_max");
  const dans = (v, lo, hi) => (lo == null || v >= lo) && (hi == null || v <= hi);
  const resultat = (res) => {
    const min = aqua ? plancherAisance(bareme, nage, apnee) : null;
    if (min == null || (res.note != null && res.note >= min)) return res;
    return { note: min, raison: `Distances maximales de nage et d'apnée réalisées : note minimale ${fmtNote(min)}, quel que soit le temps.` };
  };

  // 1. Intervalle « min ; max » correspondant (lecture de l'Excel)
  const exact = bareme.filter((b) => dans(pv, b.performance_min, b.performance_max)
    && (!aqua || (dans(nage, b.nage_min, b.nage_max) && dans(apnee, b.apnee_min, b.apnee_max))));
  if (exact.length) return resultat({ note: Math.max(...exact.map((b) => b.note)), raison: null });

  // 2. Entre deux intervalles ou au-delà (ex. palier 11,25) : meilleure note dont la borne est atteinte
  const atteint = (b) => (unite === "temps" ? pv <= (b.performance_max ?? b.performance) : pv >= (b.performance_min ?? b.performance))
    && (!aqua || (nage >= (b.nage_min ?? 0) && apnee >= (b.apnee_min ?? 0)));
  const notes = bareme.filter(atteint).map((b) => b.note);
  if (!notes.length) return resultat({ note: 0, raison: "Hors barème : note 0." });
  return resultat({ note: Math.max(...notes), raison: "Performance hors des intervalles du barème : note de la borne atteinte." });
}

/**
 * Aisance aquatique : les lignes dont la nage min = max et l'apnée min = max donnent les distances maximales
 * de l'épreuve. Les avoir toutes deux réalisées garantit, quel que soit le temps, la plus petite note
 * de ces lignes (10 en Terre et en Air). Renvoie cette note plancher, ou null si elle ne s'applique pas.
 */
function plancherAisance(bareme, nage, apnee) {
  const pleines = bareme.filter((b) => b.nage_min != null && b.nage_min === b.nage_max && b.apnee_min != null && b.apnee_min === b.apnee_max);
  if (!pleines.length) return null;
  const nageMax = Math.max(...pleines.map((b) => b.nage_max));
  const apneeMax = Math.max(...pleines.map((b) => b.apnee_max));
  if (nage < nageMax || apnee < apneeMax) return null;
  return Math.min(...pleines.filter((b) => b.nage_max === nageMax && b.apnee_max === apneeMax).map((b) => b.note));
}

/** Recalcule la note d'une épreuve d'après le barème. Renvoie la ligne à jour. */
function applyAutoNote(sid, epId) {
  const r = getStagiaireAvecNotes(sid);
  if (!r) return r;
  const { note } = computeNote(epId, r);
  if (note !== r[epId]) {
    upsert("notes_physiques", ["stagiaire_id"], ["stagiaire_id", epId], [sid, note]);
    r[epId] = note;
  }
  return r;
}

/** Après un changement de barème ou de fiche stagiaire : recalcule toutes les notes automatiques. */
function recomputeAutoNotes() {
  const rows = query(`${NOTES_SELECT} WHERE p.id IS NOT NULL`);
  let changed = 0;
  for (const r of rows) {
    for (const ep of EPREUVES) {
      if (r[`${ep.id}_perf`] == null) continue;
      const { note } = computeNote(ep.id, r);
      if (note !== r[ep.id]) {
        state.db.run(`UPDATE notes_physiques SET ${ep.id} = ? WHERE stagiaire_id = ?`, [note, r.id]);
        changed++;
      }
    }
  }
  return changed;
}

/**
 * Les notes ne se modifient plus à la main : les anciennes dérogations sont supprimées
 * et les notes concernées reprennent la valeur du barème. Renvoie true si la base a changé.
 */
function supprimerDerogations() {
  const cond = EPREUVES.map((e) => `${e.id}_manuel = 1`).join(" OR ");
  if (!query(`SELECT COUNT(*) AS n FROM notes_physiques WHERE ${cond}`)[0].n) return false;
  state.db.run(`UPDATE notes_physiques SET ${EPREUVES.map((e) => `${e.id}_manuel = 0`).join(", ")}`);
  // Sans performance, la note tapée à la main n'a pas de calcul de remplacement : elle est effacée
  for (const e of EPREUVES) state.db.run(`UPDATE notes_physiques SET ${e.id} = NULL WHERE ${e.id}_perf IS NULL OR TRIM(${e.id}_perf) = ''`);
  recomputeAutoNotes();
  return true;
}
