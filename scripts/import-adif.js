const path = require("node:path");
const { importAdifFile } = require("../lib/importer");

async function main() {
  const importPath = process.argv[2];
  if (!importPath) {
    console.error("Usage: node scripts/import-adif.js /path/to/log.adi");
    process.exit(1);
  }

  const result = await importAdifFile({ importPath, root: path.join(__dirname, "..") });
  console.log(`Imported ${result.imported} QSOs from ${result.incoming} records.`);
  console.log(`Skipped ${result.skipped} likely duplicates.`);
  console.log(`Logbook now has ${result.total} QSOs.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
