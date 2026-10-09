/* CCPG — Mémorisation du dossier du projet (IndexedDB) entre deux ouvertures. */
"use strict";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Base IndexedDB bloquée par un autre onglet"));
  });
}

async function idbTx(mode, fn) {
  const idb = await idbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error("Transaction IndexedDB annulée"));
    });
  } finally {
    idb.close();
  }
}

const idbGet = (key) => idbTx("readonly", (s) => s.get(key));

const idbPut = (key, value) => idbTx("readwrite", (s) => s.put(value, key));

const idbDelete = (key) => idbTx("readwrite", (s) => s.delete(key));

/** Enregistre le handle puis le relit aussitôt pour vérifier l'écriture. */
async function rememberHandle(handle) {
  await idbPut(IDB_KEY, handle);
  const back = await idbGet(IDB_KEY);
  if (!back || typeof back.isSameEntry !== "function" || !(await back.isSameEntry(handle))) {
    throw new Error("le dossier relu ne correspond pas au dossier enregistré");
  }
}

async function forgetHandle() {
  try { await idbDelete(IDB_KEY); } catch { /* rien à oublier */ }
}
