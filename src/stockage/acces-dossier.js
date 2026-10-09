/* CCPG — Accès au dossier du projet : première ouverture (modale) et ouvertures suivantes (bandeau). */
"use strict";

function showAccessModal(info) {
  $("access-path").textContent = projectPath();
  $("access-info").hidden = !info;
  $("access-info").textContent = info || "";
  $("access-error").hidden = true;
  $("btn-access-cancel").hidden = !state.db;
  $("btn-copy-label").textContent = "Copier";
  showBanner(false);
  $("access-modal").hidden = false;
  $("btn-authorize").focus();
}

function hideAccessModal() {
  $("access-modal").hidden = true;
}

function accessError(message) {
  $("access-error").textContent = message;
  $("access-error").hidden = false;
}

function flashCopied() {
  $("btn-copy-label").textContent = "Copié ✓";
  setTimeout(() => { $("btn-copy-label").textContent = "Copier"; }, 2000);
}

async function onAuthorizeClick() {
  $("access-error").hidden = true;

  if (typeof window.showDirectoryPicker !== "function") {
    accessError("Ce navigateur ne permet pas l'accès aux dossiers locaux. Ouvrez index.html avec Google Chrome ou Microsoft Edge.");
    return;
  }

  // Copie du chemin (sans attendre : le sélecteur doit s'ouvrir dans le même geste)
  copyText(projectPath()).then(flashCopied, () => {});

  let dir;
  try {
    dir = await window.showDirectoryPicker({ id: "projet", mode: "readwrite", startIn: "documents" });
  } catch (e) {
    if (e.name === "AbortError") return; // l'utilisateur a fermé la fenêtre
    accessError(`Impossible d'ouvrir le sélecteur de dossier : ${errMsg(e)}`);
    return;
  }

  try {
    await dir.getDirectoryHandle(DB_DIR);
  } catch (e) {
    if (e.name === "NotFoundError" || e.name === "TypeMismatchError") {
      accessError(`Le dossier « ${dir.name} » ne contient pas de sous-dossier « db ». Choisissez le dossier racine du projet, celui qui contient index.html.`);
    } else {
      accessError(`Accès au dossier « ${dir.name} » impossible : ${errMsg(e)}`);
    }
    return;
  }

  try {
    await rememberHandle(dir);
    clearAlert("idb");
  } catch (e) {
    showAlert(`Le navigateur a refusé de mémoriser le dossier (${errMsg(e)}). Les données sont accessibles pour cette session, mais il faudra resélectionner le dossier à la prochaine ouverture.`, "idb");
  }

  hideAccessModal();
  await loadProject(dir);
}

function showBanner(visible, text) {
  $("perm-banner").hidden = !visible;
  if (text) $("perm-banner-text").textContent = text;
}

function armPermissionGesture(text) {
  showBanner(true, text || "Cliquez n'importe où pour charger les données");
  window.addEventListener("pointerdown", onPermissionGesture, true);
  window.addEventListener("keydown", onPermissionGesture, true);
}

function disarmPermissionGesture() {
  window.removeEventListener("pointerdown", onPermissionGesture, true);
  window.removeEventListener("keydown", onPermissionGesture, true);
}

function onPermissionGesture(event) {
  // Échap et touches de modification n'ouvrent pas de geste utilisateur valide
  if (event.type === "keydown" && ["Escape", "Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
  disarmPermissionGesture();

  const handle = state.rootHandle;
  let request;
  try {
    // Appel synchrone dans le gestionnaire d'événement : condition du geste utilisateur
    request = handle.requestPermission({ mode: "readwrite" });
  } catch (e) {
    request = Promise.reject(e);
  }

  request.then(
    (result) => {
      if (result === "granted") {
        showBanner(false);
        loadProject(handle);
      } else {
        armPermissionGesture("Accès refusé. Cliquez n'importe où pour réessayer de charger les données");
      }
    },
    async (e) => {
      if (e.name === "NotFoundError") {
        await forgetHandle();
        state.rootHandle = null;
        showAccessModal("Le dossier mémorisé est introuvable (déplacé ou supprimé). Sélectionnez à nouveau le dossier du projet.");
        return;
      }
      armPermissionGesture(`Autorisation impossible (${errMsg(e)}). Cliquez n'importe où pour réessayer`);
    },
  );
}
