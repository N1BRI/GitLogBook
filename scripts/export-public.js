const fs = require("node:fs/promises");
const path = require("node:path");
const { parseAdif } = require("../lib/adif");
const { buildPublicExport } = require("../lib/exporter");

async function main() {
  const root = path.join(__dirname, "..");
  const adif = await readText(path.join(root, "data", "logbook.adi"), await readText(path.join(root, "examples", "sample-logbook.adi"), ""));
  const settings = await readJson(path.join(root, "data", "settings.json"), {});
  const result = buildPublicExport(parseAdif(adif), settings);
  await fs.mkdir(path.join(root, "docs", "data"), { recursive: true });
  await fs.writeFile(path.join(root, "docs", "data", "log.json"), JSON.stringify(result.log, null, 2), "utf8");
  await fs.writeFile(path.join(root, "docs", "data", "stats.json"), JSON.stringify(result.stats, null, 2), "utf8");
  await fs.writeFile(path.join(root, "docs", "data", "site-config.json"), JSON.stringify(result.config, null, 2), "utf8");
  console.log(`Exported ${result.stats.total} QSOs, ${result.stats.mapped} mapped.`);
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
