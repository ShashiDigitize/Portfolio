/* GitHub storage — models live in a JSON file on GitHub, model files
   are uploaded to the same repo. The site reads everything via raw URLs */
export const DEFAULT_CONFIG = {
  version: 2,
  owner: "3DArtistZulfekar",
  repo: "Portfolio",
  branch: "main-clean",
  jsonPath: "data/models.json",
  modelsDir: "assets/models",
};

export function getConfig() {
  let cfg;
  try {
    const saved = JSON.parse(localStorage.getItem("zulf-gh-config") || "null");
    if (saved && saved.owner && saved.repo && saved.version === DEFAULT_CONFIG.version) {
      cfg = Object.assign({}, DEFAULT_CONFIG, saved);
    } else {
      cfg = Object.assign({}, DEFAULT_CONFIG);
      if (saved && saved.owner && saved.repo) {
        try {
          localStorage.setItem("zulf-gh-config", JSON.stringify(cfg));
        } catch (err) {}
      }
    }
  } catch (err) {
    cfg = Object.assign({}, DEFAULT_CONFIG);
  }
  if (cfg.modelsDir === "models") cfg.modelsDir = DEFAULT_CONFIG.modelsDir;
  return cfg;
}

export function saveConfig(cfg) {
  try {
    localStorage.setItem("zulf-gh-config", JSON.stringify(cfg));
    return true;
  } catch (err) {
    return false;
  }
}

export function rawUrl(cfg, path) {
  return (
    "https://raw.githubusercontent.com/" +
    cfg.owner + "/" + cfg.repo + "/refs/heads/" + cfg.branch + "/" +
    String(path).replace(/^\/+/, "")
  );
}

export function getToken() {
  try {
    return localStorage.getItem("zulf-gh-token");
  } catch (err) {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem("zulf-gh-token", token || "");
  } catch (err) {}
}

export function hasToken() {
  return !!getToken();
}

/* verify a GitHub token is valid, can read the repo, and has write scope.
   classic tokens expose their scopes via the X-OAuth-Scopes header */
export async function verifyToken(cfg, token) {
  if (!token) return { ok: false, reason: "No token provided." };
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: "Bearer " + token,
  };
  try {
    const userRes = await fetch("https://api.github.com/user", { headers });
    if (!userRes.ok) {
      return { ok: false, reason: "Token rejected by GitHub (HTTP " + userRes.status + ")." };
    }
    const scopes = String(userRes.headers.get("X-OAuth-Scopes") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isClassic = userRes.headers.has("X-OAuth-Scopes");

    const repoRes = await fetch(
      "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo,
      { headers }
    );
    if (!repoRes.ok) {
      return { ok: false, reason: "Token cannot read " + cfg.owner + "/" + cfg.repo + "." };
    }

    if (isClassic) {
      const canWrite = scopes.includes("repo") || scopes.includes("public_repo");
      if (!canWrite) {
        return {
          ok: false,
          reason:
            "Token is missing the 'repo' scope (needed to upload). Current scopes: " +
            (scopes.join(", ") || "none") +
            ". Create a classic token with the 'repo' scope enabled.",
        };
      }
    }

    return { ok: true, scopes };
  } catch (err) {
    return { ok: false, reason: "Could not reach GitHub: " + err.message };
  }
}const toBase64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromBase64 = (b64) => {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

async function ghFetch(url, opts) {
  opts = opts || {};
  opts.headers = Object.assign(
    { Accept: "application/vnd.github+json" },
    opts.headers || {}
  );
  const token = getToken();
  if (token) opts.headers.Authorization = "Bearer " + token;
  return fetch(url, opts);
}

/* read the models JSON from GitHub — returns {data, sha} or null if missing */
export async function getJsonFile(cfg) {
  const url =
    "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo +
    "/contents/" + cfg.jsonPath + "?ref=" + cfg.branch;
  const res = await ghFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("GitHub read failed: HTTP " + res.status);
  const meta = await res.json();
  const text = meta.encoding === "base64" ? fromBase64(meta.content) : meta.content;
  return { data: JSON.parse(text), sha: meta.sha };
}

/* write the models JSON back to GitHub (creates it if missing) */
export async function putJsonFile(cfg, obj, sha) {
  const url =
    "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo +
    "/contents/" + cfg.jsonPath;
  const body = {
    message: "Update models",
    content: toBase64(JSON.stringify(obj, null, 2)),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const hint =
      res.status === 403 || res.status === 404
        ? " — the token needs the 'repo' scope and write access to " +
          cfg.owner + "/" + cfg.repo + "."
        : "";
    throw new Error("GitHub write failed: HTTP " + res.status + hint + " — " + text.slice(0, 200));
  }
  return res.json();
}

/* upload a binary model file to the repo; returns its repo path
   (e.g. assets/models/foo.fbx) matching how models.json stores files */
export async function putFileBinary(cfg, repoPath, base64, message) {
  const url =
    "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo +
    "/contents/" + repoPath;
  const head = await ghFetch(url);
  let sha = null;
  if (head.ok) sha = (await head.json()).sha;

  const body = {
    message: message || "Add model file",
    content: base64,
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;

  const res = await ghFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const hint =
      res.status === 403 || res.status === 404
        ? " — the token needs the 'repo' scope and write access to " +
          cfg.owner + "/" + cfg.repo + "."
        : "";
    throw new Error("GitHub upload failed: HTTP " + res.status + hint + " — " + text.slice(0, 200));
  }
  return repoPath;
}

/* delete a file from the repo */
export async function deleteFile(cfg, repoPath) {
  const url =
    "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo +
    "/contents/" + repoPath;
  const head = await ghFetch(url);
  if (!head.ok) return false;
  const meta = await head.json();
  const res = await ghFetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Delete model file",
      sha: meta.sha,
      branch: cfg.branch,
    }),
  });
  return res.ok;
}

/* turn a model's raw URL back into its repo path (models/foo.fbx) */
export function repoPathFromUrl(cfg, fileUrl) {
  if (!fileUrl) return null;
  const marker = "/refs/heads/" + cfg.branch + "/";
  const idx = fileUrl.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(fileUrl.slice(idx + marker.length));
  const base = "https://raw.githubusercontent.com/" + cfg.owner + "/" + cfg.repo + "/";
  if (fileUrl.indexOf(base) === 0) {
    const rest = fileUrl.slice(base.length);
    const parts = rest.split("/");
    if (parts[0] === cfg.branch) return parts.slice(1).join("/");
  }
  return null;
}
