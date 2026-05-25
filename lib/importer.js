const fs = require("node:fs/promises");
const path = require("node:path");
const { parseAdif, writeAdif } = require("./adif");
const { buildPublicExport } = require("./exporter");

async function importAdifFile({ importPath, root }) {
  if (!importPath) throw new Error("Import path is required.");

  const logPath = path.join(root, "data", "logbook.adi");
  const settingsPath = path.join(root, "data", "settings.json");
  const docsDataPath = path.join(root, "docs", "data");

  const existing = parseAdif(await readText(logPath, ""));
  const incoming = parseAdif(await fs.readFile(importPath, "utf8"));
  const seen = new Set(existing.map(dedupeKey));
  const added = [];
  const skipped = [];

  for (const qso of incoming) {
    const key = dedupeKey(qso);
    if (seen.has(key)) {
      skipped.push(qso);
      continue;
    }
    seen.add(key);
    added.push(qso);
  }

  const merged = [...existing, ...added].sort(compareQsoDesc);
  await fs.writeFile(logPath, writeAdif(merged), "utf8");
  await exportPublicFiles({ root, qsos: merged });

  return {
    imported: added.length,
    incoming: incoming.length,
    skipped: skipped.length,
    total: merged.length
  };
}

async function exportPublicFiles({ root, qsos }) {
  const settingsPath = path.join(root, "data", "settings.json");
  const docsDataPath = path.join(root, "docs", "data");
  const settings = await readJson(settingsPath, {});
  const result = buildPublicExport(qsos, settings);
  await fs.mkdir(docsDataPath, { recursive: true });
  await fs.writeFile(path.join(docsDataPath, "log.json"), JSON.stringify(result.log, null, 2), "utf8");
  await fs.writeFile(path.join(docsDataPath, "stats.json"), JSON.stringify(result.stats, null, 2), "utf8");
  await fs.writeFile(path.join(docsDataPath, "site-config.json"), JSON.stringify(result.config, null, 2), "utf8");
  return result;
}

function dedupeKey(qso) {
  return [
    qso.call,
    qso.qsoDate,
    qso.timeOn,
    qso.band,
    qso.mode,
    qso.freq
  ]
    .map((value) => String(value || "").trim().toUpperCase())
    .join("|");
}

function compareQsoDesc(a, b) {
  return `${b.qsoDate || ""}${b.timeOn || ""}`.localeCompare(`${a.qsoDate || ""}${a.timeOn || ""}`);
}

async function readText(file, fallback) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

module.exports = { importAdifFile, exportPublicFiles };
