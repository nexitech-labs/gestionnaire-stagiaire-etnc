/* CCPG — Utilitaires : DOM, échappement, dates, nombres, stockage local du navigateur. */
"use strict";

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function norm(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || "";
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function age(iso, refIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return null;
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refIso || "");
  const now = r ? new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3])) : new Date();
  let a = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
  return a >= 0 && a < 120 ? a : null;
}

function periodLabel(s) {
  if (s.date_debut && s.date_fin) return `du ${fmtDate(s.date_debut)} au ${fmtDate(s.date_fin)}`;
  if (s.date_debut) return `à partir du ${fmtDate(s.date_debut)}`;
  if (s.date_fin) return `jusqu'au ${fmtDate(s.date_fin)}`;
  return "";
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function lsGet(key) {
  try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
}

function lsSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(LS_PREFIX + key);
    else localStorage.setItem(LS_PREFIX + key, String(value));
  } catch { /* stockage indisponible : sans conséquence */ }
}

function errMsg(e) {
  return (e && (e.message || e.name)) || String(e);
}

/** Chemin Windows du dossier contenant index.html, déduit de l'URL file://. */
function projectPath() {
  let p = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, "");
  if (location.protocol === "file:" && location.host) return "\\\\" + location.host + p.replace(/\//g, "\\");
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  if (/^[A-Za-z]:$/.test(p)) p += "/";
  return p.replace(/\//g, "\\");
}

function copyText(text) {
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    if (!ok) throw new Error("Copie impossible");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallback());
  }
  try { fallback(); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
}

function fmtNote(v) {
  return v == null ? "" : Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

/** "12,5" → { value: 12.5 } ; "" → { value: null } ; sinon { error }. */
function parseNote(text) {
  const t = String(text).trim().replace(",", ".");
  if (!t) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(t)) return { error: "Saisissez un nombre (ex. 12,5)." };
  const n = Number(t);
  if (n < 0 || n > NOTE_MAX) return { error: `La note doit être comprise entre 0 et ${NOTE_MAX}.` };
  return { value: Math.round(n * 100) / 100 };
}

function meanOf(values) {
  const vals = values.filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function round2(v) {
  return v == null ? null : Math.round(v * 100) / 100;
}
