const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { parseAdif, writeAdif, normalizeQso } = require("./lib/adif");
const { buildPublicExport } = require("./lib/exporter");
const { importAdifFile } = require("./lib/importer");
const { latLonToGrid } = require("./lib/maidenhead");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const APP_DIR = path.join(ROOT, "app");
const APP_SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
const APP_LOCAL_SETTINGS_PATH = path.join(DATA_DIR, "app-settings.local.json");
const CACHE_PATH = path.join(DATA_DIR, "callsign-cache.json");
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === "/site") {
      res.writeHead(302, { Location: "/site/" });
      res.end();
      return;
    }

    if (url.pathname.startsWith("/site/")) {
      const pathname = url.pathname === "/site" ? "/index.html" : url.pathname.replace(/^\/site/, "");
      await serveStatic(res, docsDir(await getLogbookRoot()), pathname);
      return;
    }

    if (url.pathname === "/posts") {
      res.writeHead(302, { Location: "/posts/" });
      res.end();
      return;
    }

    if (url.pathname.startsWith("/posts/") || url.pathname.startsWith("/assets/") || url.pathname.startsWith("/data/")) {
      await serveStatic(res, docsDir(await getLogbookRoot()), url.pathname);
      return;
    }

    await serveStatic(res, APP_DIR, url.pathname === "/" ? "/index.html" : url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, async () => {
  await ensureExport();
  console.log(`GitLogBook local app: http://${HOST}:${PORT}`);
  console.log(`Read-only site preview: http://${HOST}:${PORT}/site`);
});

async function handleApi(req, res, url) {
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/qsos") {
    sendJson(res, 200, await readQsos());
    return;
  }

  if (method === "POST" && url.pathname === "/api/qsos") {
    const payload = normalizeQso(await readBody(req));
    const validationError = validateQso(payload);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }
    const qsos = await readQsos();
    qsos.unshift(payload);
    await saveQsos(qsos);
    sendJson(res, 201, payload);
    return;
  }

  const qsoMatch = url.pathname.match(/^\/api\/qsos\/([^/]+)$/);
  if (qsoMatch && method === "PUT") {
    const id = decodeURIComponent(qsoMatch[1]);
    const qsos = await readQsos();
    const index = qsos.findIndex((qso) => qso.id === id);
    if (index < 0) {
      sendJson(res, 404, { error: "QSO not found." });
      return;
    }
    const payload = normalizeQso({ ...qsos[index], ...(await readBody(req)), id });
    const validationError = validateQso(payload);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }
    qsos[index] = payload;
    await saveQsos(qsos);
    sendJson(res, 200, qsos[index]);
    return;
  }

  if (qsoMatch && method === "DELETE") {
    const id = decodeURIComponent(qsoMatch[1]);
    const qsos = await readQsos();
    const next = qsos.filter((qso) => qso.id !== id);
    if (next.length === qsos.length) {
      sendJson(res, 404, { error: "QSO not found." });
      return;
    }
    await saveQsos(next);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/export") {
    const result = await exportPublic();
    sendJson(res, 200, result.stats);
    return;
  }

  if (method === "POST" && url.pathname === "/api/import") {
    const body = await readBody(req);
    const result = await importAdifFile({ importPath: cleanString(body.path), root: await getLogbookRoot() });
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && url.pathname === "/api/publish") {
    await exportPublic();
    const result = await publish();
    sendJson(res, result.ok ? 200 : 409, result);
    return;
  }

  if (method === "GET" && url.pathname === "/api/git/status") {
    sendJson(res, 200, await gitStatus());
    return;
  }

  if (method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, await readSettings());
    return;
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const settings = mergeSettings(await readSettings(), await readBody(req));
    await saveSettings(settings);
    await exportPublic();
    sendJson(res, 200, settings);
    return;
  }

  if (method === "POST" && url.pathname === "/api/lookup") {
    sendJson(res, 200, await lookupCallsign(await readBody(req)));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function readQsos() {
  await ensureDataFiles();
  return parseAdif(await fs.readFile(logPath(await getLogbookRoot()), "utf8"));
}

async function saveQsos(qsos) {
  await fs.writeFile(logPath(await getLogbookRoot()), writeAdif(qsos), "utf8");
  await exportPublic();
}

async function exportPublic() {
  const root = await getLogbookRoot();
  await fs.mkdir(path.join(docsDir(root), "data"), { recursive: true });
  const result = buildPublicExport(await readQsos(), await readSettings());
  await fs.writeFile(path.join(docsDir(root), "data", "log.json"), JSON.stringify(result.log, null, 2), "utf8");
  await fs.writeFile(path.join(docsDir(root), "data", "stats.json"), JSON.stringify(result.stats, null, 2), "utf8");
  await fs.writeFile(path.join(docsDir(root), "data", "site-config.json"), JSON.stringify(result.config, null, 2), "utf8");
  return result;
}

async function ensureExport() {
  await ensureDataFiles();
  await exportPublic();
}

async function ensureDataFiles() {
  const root = await getLogbookRoot();
  await fs.mkdir(dataDir(root), { recursive: true });
  await fs.mkdir(path.join(docsDir(root), "data"), { recursive: true });
  try {
    await fs.access(logPath(root));
  } catch {
    await fs.writeFile(logPath(root), "GitLogBook ADIF export\n<ADIF_VER:5>3.1.4\n<PROGRAMID:10>GitLogBook\n<EOH>\n", "utf8");
  }
}

async function publish() {
  const settings = await readSettings();
  const root = await getLogbookRoot();
  const files = ["docs", "content", "data/settings.json"];
  const status = await gitStatus();
  if (!status.isRepo) return { ok: false, error: "This folder is not a usable Git repository yet.", status };

  const add = await runGit(["add", ...files], root);
  if (!add.ok) return { ok: false, error: add.error || add.stderr, step: "add" };

  const message = settings.git?.commitTemplate || "Publish log update";
  const commit = await runGit(["commit", "-m", message], root);
  if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
    return { ok: false, error: commit.error || commit.stderr, step: "commit" };
  }

  const push = await runGit(["push", settings.git?.remote || "origin", settings.git?.branch || "main"], root);
  if (!push.ok) return { ok: false, error: push.error || push.stderr, step: "push" };

  return { ok: true, commit: commit.stdout.trim(), push: push.stdout.trim() || push.stderr.trim() };
}

async function gitStatus() {
  const root = await getLogbookRoot();
  const rev = await runGit(["rev-parse", "--is-inside-work-tree"], root);
  if (!rev.ok) return { isRepo: false, message: rev.stderr.trim() || rev.error };
  const status = await runGit(["status", "--short"], root);
  const branch = await runGit(["branch", "--show-current"], root);
  return {
    isRepo: true,
    root,
    branch: branch.stdout.trim(),
    changes: status.stdout.split("\n").filter(Boolean)
  };
}

function runGit(args, cwd = ROOT) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve({ ok: false, error: error.message, stdout, stderr }));
    child.on("close", (code) => resolve({ ok: code === 0, code, stdout, stderr }));
  });
}

async function lookupCallsign(payload) {
  const call = String(payload.call || "").trim().toUpperCase();
  if (!call) return { found: false, error: "Callsign is required." };

  const cache = await readJson(CACHE_PATH, {});
  if (cache[call]) return { ...cache[call], cached: true };

  try {
    const data = await getJson(`https://callook.info/${encodeURIComponent(call)}/json`);
    const current = data.current || {};
    const location = data.location || {};
    const lat = Number(location.latitude || location.lat);
    const lon = Number(location.longitude || location.lon);
    const grid = location.gridsquare || location.grid || (Number.isFinite(lat) && Number.isFinite(lon) ? latLonToGrid(lat, lon) : "");
    const result = {
      found: data.status !== "INVALID",
      source: "callook",
      call,
      name: current.name || data.name || "",
      country: "United States",
      state: location.state || "",
      grid,
      lat: Number.isFinite(lat) ? lat : "",
      lon: Number.isFinite(lon) ? lon : "",
      locationSource: "fcc_lookup",
      locationConfidence: "estimated",
      fetchedAt: new Date().toISOString()
    };
    cache[call] = result;
    await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
    return result;
  } catch (error) {
    return { found: false, source: "callook", call, error: error.message };
  }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function readSettings() {
  const appSettings = await readAppSettings();
  const stationSettings = await readJson(settingsPath(await getLogbookRoot()), {});
  return {
    ...stationSettings,
    deploymentRepoPath: appSettings.deploymentRepoPath || "",
    activeRepoPath: await getLogbookRoot()
  };
}

async function saveSettings(settings) {
  const appSettings = await readAppSettings();
  const deploymentRepoPath = cleanString(settings.deploymentRepoPath || appSettings.deploymentRepoPath);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(APP_LOCAL_SETTINGS_PATH, JSON.stringify({ deploymentRepoPath }, null, 2), "utf8");

  const publicSettings = { ...settings };
  delete publicSettings.deploymentRepoPath;
  delete publicSettings.activeRepoPath;
  await fs.writeFile(settingsPath(await getLogbookRoot()), JSON.stringify(publicSettings, null, 2), "utf8");
}

async function readAppSettings() {
  return {
    ...(await readJson(APP_SETTINGS_PATH, {})),
    ...(await readJson(APP_LOCAL_SETTINGS_PATH, {}))
  };
}

function mergeSettings(current, updates) {
  const deploymentRepoPath = cleanString(updates.deploymentRepoPath) || current.deploymentRepoPath || "";
  return {
    ...current,
    deploymentRepoPath,
    stationCallsign: cleanString(updates.stationCallsign).toUpperCase(),
    publicTitle: cleanString(updates.publicTitle),
    publicSubtitle: cleanString(updates.publicSubtitle),
    aboutTitle: cleanString(updates.aboutTitle),
    aboutBody: cleanString(updates.aboutBody),
    profileImageUrl: cleanString(updates.profileImageUrl),
    myGrid: cleanString(updates.myGrid).toUpperCase(),
    git: {
      ...(current.git || {}),
      remote: cleanString(updates.gitRemote) || current.git?.remote || "origin",
      branch: cleanString(updates.gitBranch) || current.git?.branch || "main",
      commitTemplate: cleanString(updates.gitCommitTemplate) || current.git?.commitTemplate || "Publish log update"
    }
  };
}

function validateQso(qso) {
  const required = [
    ["call", "Callsign"],
    ["qsoDate", "Date"],
    ["timeOn", "Time"],
    ["band", "Band"],
    ["freq", "Frequency"],
    ["mode", "Mode"],
    ["rstSent", "RST sent"],
    ["rstRcvd", "RST received"]
  ];
  const missing = required
    .filter(([key]) => !cleanString(qso[key]))
    .map(([, label]) => label);
  return missing.length ? `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required.` : "";
}

async function getLogbookRoot() {
  const settings = await readAppSettings();
  const configured = cleanString(process.env.GITLOGBOOK_REPO || settings.deploymentRepoPath);
  return configured ? path.resolve(ROOT, configured) : ROOT;
}

function dataDir(root) {
  return path.join(root, "data");
}

function docsDir(root) {
  return path.join(root, "docs");
}

function logPath(root) {
  return path.join(dataDir(root), "logbook.adi");
}

function settingsPath(root) {
  return path.join(dataDir(root), "settings.json");
}

function cleanString(value) {
  return String(value || "").trim();
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function serveStatic(res, root, pathname) {
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(root))) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    const finalPath = stat.isDirectory() ? path.join(resolved, "index.html") : resolved;
    const ext = path.extname(finalPath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(await fs.readFile(finalPath));
  } catch {
    sendText(res, 404, "Not found");
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}
