const assert = require("node:assert/strict");
const test = require("node:test");
const { gridToLatLon, latLonToGrid } = require("../lib/maidenhead");

test("gridToLatLon returns the center of a four-character grid", () => {
  assert.deepEqual(gridToLatLon("FN42"), { lat: 42.5, lon: -71 });
});

test("latLonToGrid converts coordinates to a Maidenhead grid", () => {
  assert.equal(latLonToGrid(42.5, -71), "FN42");
});

test("invalid grids and coordinates fail quietly", () => {
  assert.equal(gridToLatLon("NOPE"), null);
  assert.equal(latLonToGrid("wat", -71), "");
});
