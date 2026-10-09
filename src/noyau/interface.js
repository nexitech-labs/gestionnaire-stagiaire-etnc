/* CCPG — Éléments d'interface communs : notifications, alertes, statut d'enregistrement, confirmation, icônes. */
"use strict";

function toast(message, kind = "success") {
  const el = document.createElement("div");
  const tone = kind === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-zinc-200 bg-white text-zinc-900";
  el.className = `pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ${tone}`;
  el.textContent = message;
  $("toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; }, kind === "error" ? 6000 : 2800);
  setTimeout(() => el.remove(), kind === "error" ? 6400 : 3200);
}

function showAlert(message, key) {
  const box = $("alerts");
  if (key) {
    const prev = box.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (prev) prev.remove();
  }
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  if (key) el.dataset.key = key;
  el.className = "flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";
  el.innerHTML = `
    <svg class="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
    <p class="flex-1">${esc(message)}</p>
    <button type="button" class="-m-1 rounded p-1 text-red-700 hover:bg-red-100" aria-label="Fermer">
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>`;
  el.querySelector("button").addEventListener("click", () => el.remove());
  box.appendChild(el);
}

function clearAlert(key) {
  const el = $("alerts").querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (el) el.remove();
}

function setStatus(kind, text) {
  const colors = { idle: "bg-zinc-300", loading: "bg-sky-500", saving: "bg-amber-500 animate-pulse", saved: "bg-emerald-500", error: "bg-red-500" };
  const allColors = Object.values(colors).join(" ").split(" ");
  document.querySelectorAll(".save-dot").forEach((dot) => {
    dot.classList.remove(...allColors);
    dot.classList.add(...(colors[kind] || colors.idle).split(" "));
  });
  $("save-text").textContent = text;
  $("save-text").classList.toggle("font-medium", kind === "error");
  $("save-text").classList.toggle("text-red-600", kind === "error");
  $("save-status").title = text;
}

const ICON_EDIT = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

const ICON_TRASH = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

const BTN_ICON = "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900";

const BTN_ICON_DANGER = "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-red-50 hover:text-red-600";

let confirmResolve = null;

function confirmDialog({ title, message, confirmLabel = "Supprimer" }) {
  if (confirmResolve) confirmResolve(false);
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-ok").textContent = confirmLabel;
  const prevFocus = document.activeElement;
  $("confirm-modal").hidden = false;
  $("confirm-cancel").focus();
  return new Promise((resolve) => {
    confirmResolve = (value) => {
      confirmResolve = null;
      $("confirm-modal").hidden = true;
      if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
      resolve(value);
    };
  });
}
