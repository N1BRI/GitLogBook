const fs = require("node:fs/promises");
const path = require("node:path");
const { parseAdif, writeAdif } = require("../lib/adif");
const { buildPublicExport } = require("../lib/exporter");

async function main() {
  const importPath = process.argv[2];
  if (!importPath) {
    console.error("Usage: node scripts/import-adif.js /path/to/log.adi");
    process.exit(1);
  }

  const root = path.join(__dirname, "..");
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

  const settings = await readJson(settingsPath, {});
  const result = buildPublicExport(merged, settings);
  await fs.mkdir(docsDataPath, { recursive: true });
  await fs.writeFile(path.join(docsDataPath, "log.json"), JSON.stringify(result.log, null, 2), "utf8");
  await fs.writeFile(path.join(docsDataPath, "stats.json"), JSON.stringify(result.stats, null, 2), "utf8");
  await fs.writeFile(path.join(docsDataPath, "site-config.json"), JSON.stringify(result.config, null, 2), "utf8");

  console.log(`Imported ${added.length} QSOs from ${incoming.length} records.`);
  console.log(`Skipped ${skipped.length} likely duplicates.`);
  console.log(`Logbook now has ${merged.length} QSOs.`);
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
