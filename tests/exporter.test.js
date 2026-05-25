const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPublicExport } = require("../lib/exporter");

test("buildPublicExport creates public records, stats, and site config", () => {
  const result = buildPublicExport(
    [
      {
        id: "one",
        call: "W1AW",
        qsoDate: "20260102",
        timeOn: "1530",
        band: "20M",
        mode: "SSB",
        grid: "FN31",
        country: "United States"
      },
      {
        id: "two",
        call: "K1ABC",
        qsoDate: "20260103",
        timeOn: "0045",
        band: "40m",
        mode: "CW",
        grid: "FN42"
      }
    ],
    {
      stationCallsign: "W1TEST",
      publicTitle: "W1TEST Logbook",
      myGrid: "FN42",
      aboutBody: "Testing from the shack."
    }
  );

  assert.equal(result.log.length, 2);
  assert.equal(result.log[0].call, "K1ABC");
  assert.equal(result.log[0].band, "40m");
  assert.equal(result.log[0].mapped, true);
  assert.deepEqual(result.stats.byBand, { "40m": 1, "20m": 1 });
  assert.deepEqual(result.stats.byMode, { CW: 1, SSB: 1 });
  assert.equal(result.config.title, "W1TEST Logbook");
  assert.equal(result.config.stationCallsign, "W1TEST");
  assert.equal(result.config.myGrid, "FN42");
  assert.equal(result.config.homeLat, 42.5);
  assert.equal(result.config.homeLon, -71);
});
