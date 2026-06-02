const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { RbnService, bandForFrequency, parseNodes, parseSpot } = require("../lib/rbn");

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
      <tr><td>W3LPL</td><td>160m,80m,40m</td><td>FM18</td><td>K</td></tr>
      <tr><td>K1TTT</td><td>20m</td><td>FN32kp</td><td>K</td></tr>
    </table>
  `);

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].beacon, "W3LPL");
  assert.equal(nodes[0].grid, "FM18");
  assert.equal(nodes[1].grid, "FN32KP");
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
