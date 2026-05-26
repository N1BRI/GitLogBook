const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const STATIC_FILES = collectFiles(DOCS_DIR).filter((file) => /\.(html|js|json)$/.test(file));

test("public docs avoid root-relative local preview paths", () => {
  const badPatterns = [
    /href="\/site\//,
    /src="\/site\//,
    /href="\/posts\//,
    /src="\/posts\//,
    /href="\/assets\//,
    /src="\/assets\//,
    /fetch\("\/data\//
  ];

  const failures = [];
  for (const file of STATIC_FILES) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of badPatterns) {
      if (pattern.test(text)) {
        failures.push(path.relative(ROOT, file));
        break;
      }
    }
  }

  assert.deepEqual(failures, []);
});

function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}
