const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { normalizeBand, normalizeQso, parseAdif, writeAdif } = require("../lib/adif");

test("parseAdif reads records and normalizes band casing", () => {
  const fixture = fs.readFileSync(path.join(__dirname, "fixtures", "sample-import.adi"), "utf8");
  const qsos = parseAdif(fixture);

  assert.equal(qsos.length, 2);
  assert.equal(qsos[0].call, "W1AW");
  assert.equal(qsos[0].band, "20m");
  assert.equal(qsos[1].band, "40m");
});

test("normalizeBand treats uppercase meter bands as the same band", () => {
  assert.equal(normalizeBand("40M"), "40m");
  assert.equal(normalizeBand("20m"), "20m");
  assert.equal(normalizeBand(" 15M "), "15m");
});

test("normalizeQso cleans common logger form fields", () => {
  const qso = normalizeQso({
    call: " n1abc ",
    qsoDate: "2026-05-25",
    timeOn: "13:45",
    band: "20M",
    mode: " cw ",
    state: " ma ",
    grid: " fn42 "
  });

  assert.equal(qso.call, "N1ABC");
  assert.equal(qso.qsoDate, "20260525");
  assert.equal(qso.timeOn, "1345");
  assert.equal(qso.band, "20m");
  assert.equal(qso.mode, "CW");
  assert.equal(qso.state, "MA");
  assert.equal(qso.grid, "FN42");
});

test("writeAdif preserves stable GitLogBook ids", () => {
  const output = writeAdif([
    {
      id: "fixed-id",
      call: "W1AW",
      qsoDate: "20260102",
      timeOn: "1530",
      band: "20m",
      mode: "SSB"
    }
  ]);

  assert.match(output, /<APP_GITLOGBOOK_ID:8>fixed-id/);
  assert.match(output, /<CALL:4>W1AW/);
});
