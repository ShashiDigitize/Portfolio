/* admin — sign in and manage models. Uploads set the file path
   automatically and push both the model file and models.json to GitHub. */
import {
  getConfig,
  hasToken,
  getJsonFile,
  putJsonFile,
  putFileBinary,
  deleteFile,
  repoPathFromUrl,
  rawUrl,
  setToken,
  verifyToken
} from "./github.js";
import { idbPut, saveAdminModels, clearAdminModels } from "./model-data.js";

(() => {
  "use strict";

  const ADMIN_USER = "zulfi";
  const ADMIN_PASS = "zulfi";
  const AUTH_KEY = "zulf-admin-auth";
  const GH_TOKEN_KEY = "zulf-gh-token";

  const $ = (sel) => document.querySelector(sel);

  let cfg = getConfig();
  let baseData = null;
  let baseSha = null;
  let models = [];
  let editingIndex = -1;
  let pendingFile = null;
  let uploadPromise = null;

  const isAuthed = () => {
    try {
      return sessionStorage.getItem(AUTH_KEY) === "1";
    } catch (err) {
      return false;
    }
  };

  const sanitize = (name) =>
    name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });

  function flash(message, isError) {
    const el = $("#admin-status");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("admin-note-error", !!isError);
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      el.textContent = "";
      el.classList.remove("admin-note-error");
    }, 8000);
  }

  function showPanel() {
    $("#login-card").hidden = true;
    $("#panel").hidden = false;
  }

  function renderList() {
    const list = $("#model-list");
    list.innerHTML = "";
    if (!models.length) {
      const li = document.createElement("li");
      li.className = "admin-empty";
      li.textContent = "No models yet. Upload a file above.";
      list.appendChild(li);
      return;
    }
    models.forEach((model, i) => {
      const li = document.createElement("li");
      li.className = "admin-row";
      li.innerHTML =
        '<div class="admin-row-info">' +
        "<strong>" + model.title + "</strong>" +
        '<span class="admin-row-meta">' + (model.type || "3D model") + " · " + (model.file || "uploaded file") + "</span>" +
        "</div>" +
        '<div class="admin-row-actions">' +
        '<button class="btn btn-secondary" type="button" data-edit="' + i + '">Edit</button>' +
        '<button class="btn btn-danger" type="button" data-del="' + i + '">Delete</button>' +
        "</div>";
      li.querySelector('[data-edit]').addEventListener("click", () => startEdit(i));
      li.querySelector('[data-del]').addEventListener("click", () => removeModel(i));
      list.appendChild(li);
    });
  }

  function startEdit(i) {
    editingIndex = i;
    const model = models[i];
    $("#f-title").value = model.title || "";
    $("#f-type").value = model.type || "";
    $("#f-desc").value = model.description || "";
    $("#f-upload").value = "";
    $("#f-upload").required = false;
    pendingFile = null;
    $("#file-path-note").textContent = "Current file: " + (model.file || "uploaded file");
    $("#form-submit").textContent = "Save changes";
    $("#form-cancel").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeModel(i) {
    const model = models[i];
    if (!model) return;
    if (!confirm('Delete "' + model.title + '"? The model file and its entry will be removed from GitHub.')) return;

    let repoPath = repoPathFromUrl(cfg, model.file);
    if (!repoPath && model.file && model.file.indexOf(cfg.modelsDir) === 0) {
      repoPath = model.file;
    }
    if (repoPath && hasToken()) {
      try {
        const deleted = await deleteFile(cfg, repoPath);
        if (!deleted) console.warn("Model file not deleted from GitHub (may not exist).");
      } catch (err) {
        console.warn("Model file delete failed:", err);
      }
    }

    models.splice(i, 1);
    await persist();
  }

  async function handleFile(file) {
    const name = sanitize(file.name);
    const base64 = await fileToBase64(file);

    uploadPromise = (async () => {
      if (hasToken()) {
        try {
          const repoPath = cfg.modelsDir + "/" + name;
          const path = await putFileBinary(cfg, repoPath, base64);
          pendingFile = { path };
          $("#file-path-note").textContent = "Uploaded — path: " + path;
          return;
        } catch (err) {
          console.error("GitHub upload failed:", err);
          flash("GitHub upload failed: " + err.message, true);
        }
      } else {
        $("#file-path-note").textContent =
          "GitHub upload unavailable — the model is stored in this browser only.";
      }

      const blobId = "model-" + Date.now() + "-" + name;
      await idbPut(blobId, file);
      const autoPath = rawUrl(cfg, cfg.modelsDir + "/" + name);
      pendingFile = { blobId, path: autoPath };
      $("#file-path-note").textContent =
        "GitHub upload failed — stored in this browser for now.";
    })();

    try {
      await uploadPromise;
    } finally {
      uploadPromise = null;
    }
  }

  function stripBlob(models) {
    return models.map((m) => {
      const copy = Object.assign({}, m);
      delete copy.blobId;
      return copy;
    });
  }

  async function persist() {
    const out = baseData ? JSON.parse(JSON.stringify(baseData)) : { models: [] };
    out.models = stripBlob(models);

    if (hasToken()) {
      try {
        const res = await putJsonFile(cfg, out, baseSha);
        if (res && res.content) baseSha = res.content.sha;
        clearAdminModels();
        flash("Saved to GitHub — models.json and the model files are live.");
        renderList();
        return;
      } catch (err) {
        console.error("GitHub save failed:", err);
        saveAdminModels(models);
        flash("GitHub save failed: " + err.message, true);
        renderList();
        return;
      }
    }

    saveAdminModels(models);
    flash("GitHub save failed — changes saved on this browser only.", true);
    renderList();
  }

  async function submitForm(e) {
    e.preventDefault();
    const entry = {
      title: $("#f-title").value.trim(),
      type: $("#f-type").value.trim() || "3D model",
      description: $("#f-desc").value.trim(),
    };
    if (!entry.title) return;

    if (uploadPromise) {
      const btn = $("#form-submit");
      btn.disabled = true;
      btn.textContent = "Uploading model…";
      try {
        await uploadPromise;
      } finally {
        btn.disabled = false;
        btn.textContent = editingIndex >= 0 ? "Save changes" : "Add model";
      }
      uploadPromise = null;
    }

    if (pendingFile) {
      entry.file = pendingFile.path;
      if (pendingFile.blobId) entry.blobId = pendingFile.blobId;
    } else if (editingIndex >= 0) {
      entry.file = models[editingIndex].file;
      if (models[editingIndex].blobId) entry.blobId = models[editingIndex].blobId;
    } else {
      flash("Upload a model file first.", true);
      return;
    }

    if (editingIndex >= 0) {
      models[editingIndex] = entry;
      editingIndex = -1;
      $("#form-submit").textContent = "Add model";
      $("#form-cancel").hidden = true;
      $("#f-upload").required = true;
    } else {
      models.push(entry);
    }

    $("#model-form").reset();
    pendingFile = null;
    $("#file-path-note").textContent = "Upload a file — the path is filled in automatically.";
    await persist();
  }

  function exportJson() {
    const out = baseData ? JSON.parse(JSON.stringify(baseData)) : { models: [] };
    out.models = stripBlob(models);
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = cfg.jsonPath;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(cfg.jsonPath + " downloaded.");
  }

  async function loadFromGitHub() {
    cfg = getConfig();
    baseData = null;
    baseSha = null;
    models = [];
    try {
      const got = await getJsonFile(cfg);
      if (got) {
        baseData = got.data;
        baseSha = got.sha;
        const arr = Array.isArray(got.data) ? got.data : got.data.models;
        models = Array.isArray(arr) ? arr : [];
        flash("Loaded models.json from GitHub (" + cfg.owner + "/" + cfg.repo + ").");
      } else {
        flash("models.json not found on GitHub yet — it will be created on first save.");
      }
    } catch (err) {
      console.error("GitHub load failed:", err);
      flash("Could not read models.json from GitHub: " + err.message, true);
      try {
        const res = await fetch("data/models.json");
        if (res.ok) {
          const data = await res.json();
          models = Array.isArray(data) ? data : data.models || [];
        }
      } catch (err2) {}
    }
    renderList();
  }

  function init() {
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = $("#login-user").value.trim();
      const pass = $("#login-pass").value;
      const token = $("#github-token").value.trim();

      if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
        $("#login-error").textContent = "Incorrect username or password.";
        $("#login-error").hidden = false;
        return;
      }

      const submitBtn = $("#login-form").querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying…";
      try {
        const check = await verifyToken(getConfig(), token);
        if (!check.ok) {
          $("#login-error").textContent = check.reason;
          $("#login-error").hidden = false;
          return;
        }
        try {
          sessionStorage.setItem(AUTH_KEY, "1");
        } catch (err) {}
        if (token) setToken(token);
        $("#login-error").hidden = true;
        showPanel();
        loadFromGitHub();
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign in";
      }
    });

    $("#logout-btn").addEventListener("click", () => {
      try {
        sessionStorage.removeItem(AUTH_KEY);
      } catch (err) {}
      location.reload();
    });

    $("#export-btn").addEventListener("click", exportJson);
    $("#model-form").addEventListener("submit", submitForm);

    $("#form-cancel").addEventListener("click", () => {
      editingIndex = -1;
      $("#model-form").reset();
      $("#form-submit").textContent = "Add model";
      $("#form-cancel").hidden = true;
      $("#f-upload").required = true;
      $("#file-path-note").textContent = "Upload a file — the path is filled in automatically.";
    });

    $("#f-upload").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleFile(file).catch((err) => {
          console.error("Upload failed:", err);
          flash("Upload failed: " + err.message, true);
        });
      }
    });

    if (isAuthed()) {
      showPanel();
      loadFromGitHub();
    }
  }

  init();
})();