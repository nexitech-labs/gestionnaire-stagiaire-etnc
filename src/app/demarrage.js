/* CCPG — Démarrage de l'application (chargé en dernier). */
"use strict";

async function start() {
  bindEvents();
  fillStaticLists();
  applyRoute();

  try {
    if (typeof initSqlJs !== "function" || !window.SQL_WASM_BASE64) {
      throw new Error("fichiers vendor/sql-wasm.js ou vendor/sql-wasm-binary.js manquants");
    }
    state.SQL = await initSqlJs({ wasmBinary: base64ToBytes(window.SQL_WASM_BASE64) });
  } catch (e) {
    setStatus("error", "SQLite indisponible");
    showAlert(`Initialisation de SQLite impossible : ${errMsg(e)}`, "sql");
    return;
  }

  if (typeof window.showDirectoryPicker !== "function") {
    setStatus("error", "Navigateur non compatible");
    showAlert("Ce navigateur ne prend pas en charge l'accès aux dossiers locaux (File System Access API). Ouvrez index.html avec Google Chrome ou Microsoft Edge.", "compat");
    return;
  }

  let handle = null;
  try {
    handle = await idbGet(IDB_KEY);
  } catch (e) {
    showAlert(`Lecture du dossier mémorisé impossible (IndexedDB : ${errMsg(e)}).`, "idb");
  }

  if (!handle) {
    showAccessModal();
    return;
  }

  state.rootHandle = handle;
  let permission = "prompt";
  try {
    permission = await handle.queryPermission({ mode: "readwrite" });
  } catch (e) {
    if (e.name === "NotFoundError") {
      await forgetHandle();
      state.rootHandle = null;
      showAccessModal("Le dossier mémorisé est introuvable (déplacé ou supprimé). Sélectionnez à nouveau le dossier du projet.");
      return;
    }
  }

  if (permission === "granted") await loadProject(handle);
  else armPermissionGesture();
}

start();
