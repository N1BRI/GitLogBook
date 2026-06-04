const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { RbnService, bandForFrequency, distanceMiles, parseNodes, parseSpot, prefixLocation } = require("../lib/rbn");

test("parseSpot reads RBN CW and FT8 telnet rows", () => {
  const cw = parseSpot("DX de W3LPL-#:  14025.1  N1BRI         CW  18 dB  24 WPM  CQ      1530Z");
  const ft8 = parseSpot("DX de K1TTT-#:  14074.0  W1AW          FT8  -9 dB  FN31      CQ 1531Z", { streamId: "ft8" });

  assert.equal(cw.beacon, "W3LPL");
  assert.equal(cw.call, "N1BRI");
  assert.equal(cw.frequencyMhz, "14.0251");
  assert.equal(cw.band, "20m");
  assert.equal(cw.mode, "CW");
  assert.equal(cw.snr, 18);
  assert.equal(cw.speed, 24);
  assert.equal(ft8.mode, "FT8");
  assert.equal(ft8.snr, -9);
  assert.equal(ft8.originGrid, "FN31");
  assert.equal(ft8.originLat, 41.5);
  assert.equal(ft8.originLon, -73);
});

test("bandForFrequency covers common RBN frequencies", () => {
  assert.equal(bandForFrequency(7030), "40m");
  assert.equal(bandForFrequency(14074), "20m");
  assert.equal(bandForFrequency(50313), "6m");
  assert.equal(bandForFrequency(99999), "");
});

test("parseNodes extracts callsign and Maidenhead location from an RBN table", () => {
  const nodes = parseNodes(`
    <table>
      <tr>
        <td><a>W3LPL</a></td><td>160m,80m,40m</td><td>FM18</td><td>K</td>
        <td>NA</td><td>8</td><td>5</td><td><b class="hide">1</b> 4 years ago</td><td><b class="hide">2</b> online</td>
      </tr>
      <tr><td>K1TTT</td><td>20m</td><td>FN32kp</td><td>K</td><td>NA</td><td></td><td></td><td></td><td>12 minutes ago</td></tr>
    </table>
  `);

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].beacon, "W3LPL");
  assert.equal(nodes[0].bands, "160m,80m,40m");
  assert.equal(nodes[0].grid, "FM18");
  assert.equal(nodes[0].lastSeen, "online");
  assert.equal(nodes[1].grid, "FN32KP");
});

test("RbnService can expose node directory without live spots", async () => {
  const service = new RbnService({
    createConnection: fakeSocket,
    fetchText: async () => `
      <tr><td>W3LPL</td><td>20m</td><td>FM18</td><td>K</td><td>NA</td><td></td><td></td><td></td><td>online</td></tr>
    `
  });

  await service.refreshNodes();

  const snapshot = service.snapshot();
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.spots.length, 0);
  assert.equal(snapshot.beacons.length, 0);
  assert.equal(snapshot.nodes.length, 1);
  assert.equal(snapshot.nodes[0].beacon, "W3LPL");
});

test("RbnService enriches CW origins through callsign lookup", async () => {
  const service = new RbnService({
    createConnection: fakeSocket,
    fetchText: async () => `
      <tr><td>W3LPL</td><td>20m</td><td>FM19LG</td><td>K</td><td>NA</td><td></td><td></td><td></td><td>online</td></tr>
    `,
    lookupCallsign: async (call) => ({ lat: 40.5, lon: -75.5, grid: "FN20", source: "test", confidence: "estimated", call })
  });

  await service.refreshNodes();
  const spot = service.ingestLine("DX de W3LPL-#:  14025.1  K1ABC         CW  18 dB  24 WPM  CQ      1530Z");
  await service.enrichSpotOrigin(spot);

  assert.equal(spot.originGrid, "FN20");
  assert.equal(spot.originLat, 40.5);
  assert.equal(spot.originLon, -75.5);
  assert.equal(spot.originSource, "test");
  assert.equal(Number.isFinite(spot.distanceMiles), true);
});

test("prefixLocation provides approximate fallback locations", () => {
  const japan = prefixLocation("JA1ABC");
  assert.equal(japan.source, "prefix:Japan");
  assert.equal(japan.confidence, "approximate");
  assert.equal(Number.isFinite(japan.lat), true);
});

test("distanceMiles calculates approximate path distance", () => {
  const miles = distanceMiles({ lat: 40.7128, lon: -74.006 }, { lat: 34.0522, lon: -118.2437 });
  assert.equal(Math.round(miles), 2446);
});

test("RbnService defaults to station filter and retains watched-call session history", async () => {
  const sockets = [];
  const service = new RbnService({
    createConnection: () => {
      const socket = fakeSocket();
      sockets.push(socket);
      return socket;
    },
    fetchText: async () => ""
  });

  await service.start({ stationCallsign: "n1bri", myGrid: "FN31" });
  sockets.forEach((socket) => socket.emit("connect"));
  assert.equal(sockets[0].lastWrite, "N1BRI\n");
  service.ingestLine("DX de W3LPL-#:  14025.1  N1BRI         CW  18 dB  24 WPM  CQ      1530Z");
  service.ingestLine("DX de W3LPL-#:   7030.0  W1AW          CW  12 dB  18 WPM  CQ      1531Z");

  assert.deepEqual(service.snapshot().filters, ["N1BRI"]);
  assert.equal(service.snapshot().spots.length, 1);
  service.removeFilter("N1BRI");
  assert.equal(service.snapshot().spots.length, 2);
  service.addFilter("N1BRI");
  assert.equal(service.snapshot().spots.length, 1);
  service.stop();
});

function fakeSocket() {
  const socket = new EventEmitter();
  socket.setEncoding = () => {};
  socket.write = (value) => {
    socket.lastWrite = value;
  };
  socket.destroy = () => {};
  return socket;
}
