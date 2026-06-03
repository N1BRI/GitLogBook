const net = require("node:net");
const https = require("node:https");
const { gridToLatLon } = require("./maidenhead");

const RBN_HOST = "telnet.reversebeacon.net";
const RBN_NODE_URL = "https://reversebeacon.net/cont_includes/status.php?t=skt";
const LIVE_LIMIT = 250;
const HISTORY_LIMIT = 2000;
const NODE_REFRESH_MS = 6 * 60 * 60 * 1000;
const RECONNECT_MS = 5000;
const STREAMS = [
  { id: "cw-rtty", label: "CW / RTTY", port: 7000 },
  { id: "ft8", label: "FT8", port: 7001 }
];

class RbnService {
  constructor(options = {}) {
    this.createConnection = options.createConnection || net.createConnection;
    this.fetchText = options.fetchText || getText;
    this.active = false;
    this.stationCallsign = "";
    this.homeGrid = "";
    this.filters = [];
    this.defaultFilterAdded = false;
    this.liveSpots = [];
    this.history = new Map();
    this.nodes = new Map();
    this.connections = new Map();
    this.nodeRefreshAt = 0;
    this.spotSequence = 0;
  }

  async start(settings = {}) {
    this.updateSettings(settings);
    if (!this.defaultFilterAdded && this.stationCallsign) {
      this.filters = [this.stationCallsign];
      this.defaultFilterAdded = true;
    }
    if (this.active) return this.snapshot();
    this.active = true;
    await this.refreshNodes();
    STREAMS.forEach((stream) => this.connect(stream));
    return this.snapshot();
  }

  stop() {
    this.active = false;
    for (const state of this.connections.values()) {
      clearTimeout(state.reconnectTimer);
      if (state.socket) state.socket.destroy();
    }
    this.connections.clear();
    return this.snapshot();
  }

  updateSettings(settings = {}) {
    this.stationCallsign = normalizeCallsign(settings.stationCallsign);
    this.homeGrid = normalizeGrid(settings.myGrid);
  }

  addFilter(callsign) {
    const call = normalizeCallsign(callsign);
    if (!call) return this.snapshot();
    if (!this.filters.includes(call)) this.filters.push(call);
    return this.snapshot();
  }

  removeFilter(callsign) {
    const call = normalizeCallsign(callsign);
    this.filters = this.filters.filter((filter) => filter !== call);
    return this.snapshot();
  }

  connect(stream) {
    if (!this.active) return;
    const state = {
      id: stream.id,
      label: stream.label,
      port: stream.port,
      status: "connecting",
      error: "",
      buffer: "",
      socket: null,
      reconnectTimer: null
    };
    this.connections.set(stream.id, state);

    const socket = this.createConnection({ host: RBN_HOST, port: stream.port });
    state.socket = socket;
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      state.status = "connected";
      state.error = "";
      socket.write(`${this.stationCallsign || "GITLOGBOOK"}\n`);
    });
    socket.on("data", (chunk) => this.readChunk(state, chunk));
    socket.on("error", (error) => {
      state.status = "error";
      state.error = error.message;
    });
    socket.on("close", () => {
      state.socket = null;
      if (!this.active) return;
      state.status = "reconnecting";
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = setTimeout(() => this.connect(stream), RECONNECT_MS);
    });
  }

  readChunk(state, chunk) {
    state.buffer += chunk;
    const lines = state.buffer.split(/\r?\n/);
    state.buffer = lines.pop() || "";
    lines.forEach((line) => this.ingestLine(line, state.id));
  }

  ingestLine(line, streamId = "cw-rtty") {
    const spot = parseSpot(line, { streamId });
    if (!spot) return null;
    spot.id = `${Date.now()}-${this.spotSequence += 1}`;
    const node = this.findNode(spot.beacon);
    if (node) Object.assign(spot, node);
    this.liveSpots.unshift(spot);
    this.liveSpots = this.liveSpots.slice(0, LIVE_LIMIT);
    if (this.filters.includes(spot.call)) {
      const history = this.history.get(spot.call) || [];
      history.unshift(spot);
      this.history.set(spot.call, history.slice(0, HISTORY_LIMIT));
    }
    return spot;
  }

  snapshot() {
    const spots = this.filters.length
      ? this.filters.flatMap((call) => this.history.get(call) || []).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      : this.liveSpots;
    return {
      active: this.active,
      stationCallsign: this.stationCallsign,
      homeGrid: this.homeGrid,
      home: gridLocation(this.homeGrid),
      filters: [...this.filters],
      connections: STREAMS.map((stream) => {
        const state = this.connections.get(stream.id);
        return {
          id: stream.id,
          label: stream.label,
          port: stream.port,
          status: state?.status || "disconnected",
          error: state?.error || ""
        };
      }),
      nodes: this.nodeList(),
      spots: spots.slice(0, this.filters.length ? HISTORY_LIMIT : LIVE_LIMIT),
      beacons: beaconSummary(spots),
      refreshSeconds: 20
    };
  }

  async refreshNodes() {
    if (Date.now() < this.nodeRefreshAt) return;
    this.nodeRefreshAt = Date.now() + NODE_REFRESH_MS;
    try {
      const html = await this.fetchText(RBN_NODE_URL);
      const nodes = parseNodes(html);
      if (nodes.length) {
        this.nodes = new Map(nodes.map((node) => [node.beacon, node]));
        this.liveSpots.forEach((spot) => {
          const node = this.findNode(spot.beacon);
          if (node) Object.assign(spot, node);
        });
      }
    } catch {
      this.nodeRefreshAt = Date.now() + 5 * 60 * 1000;
    }
  }

  findNode(beacon) {
    return this.nodes.get(beacon) || this.nodes.get(String(beacon).replace(/-\d+$/, ""));
  }

  nodeList() {
    return [...this.nodes.values()].sort((a, b) => a.beacon.localeCompare(b.beacon));
  }
}

function parseSpot(line, options = {}) {
  const match = String(line || "").match(/^DX de\s+([^:]+):\s+([\d.]+)\s+(\S+)\s+(.+?)\s+(\d{4}Z)\s*$/i);
  if (!match) return null;
  const beacon = normalizeCallsign(match[1].replace(/-#$/, ""));
  const call = normalizeCallsign(match[3]);
  const details = match[4].trim();
  const frequencyKhz = Number(match[2]);
  if (!beacon || !call || !Number.isFinite(frequencyKhz)) return null;
  const mode = parseMode(details, options.streamId);
  const origin = parseOrigin(details);
  return {
    beacon,
    call,
    frequencyKhz,
    frequencyMhz: formatMhz(frequencyKhz),
    band: bandForFrequency(frequencyKhz),
    mode,
    snr: parseNumber(details, /([+-]?\d+)\s*dB/i),
    speed: parseNumber(details, /(\d+)\s*(?:WPM|BPS|BAUD)\b/i),
    time: match[5],
    details,
    ...origin,
    receivedAt: new Date().toISOString()
  };
}

function parseNodes(html) {
  const rows = String(html || "").match(/<tr[\s\S]*?<\/tr>/gi) || [];
  return rows.map((row) => {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((match) => tableCellText(match[1]));
    const gridIndex = cells.findIndex((cell) => /^[A-R]{2}\d{2}(?:[A-X]{2})?$/i.test(cell));
    const beacon = normalizeCallsign(cells[0]);
    const grid = normalizeGrid(cells[gridIndex]);
    return beacon && grid ? {
      beacon,
      bands: cells[1] || "",
      grid,
      dxcc: cells[3] || "",
      continent: cells[4] || "",
      firstSeen: cells[7] || "",
      lastSeen: cells[8] || "",
      ...gridLocation(grid)
    } : null;
  }).filter(Boolean);
}

function beaconSummary(spots) {
  const beacons = new Map();
  spots.forEach((spot) => {
    const beacon = beacons.get(spot.beacon) || {
      beacon: spot.beacon,
      grid: spot.grid || "",
      lat: spot.lat ?? "",
      lon: spot.lon ?? "",
      count: 0,
      lastSeen: spot.receivedAt
    };
    beacon.count += 1;
    if (!beacon.grid && spot.grid) beacon.grid = spot.grid;
    if (!hasCoordinates(beacon) && hasCoordinates(spot)) {
      beacon.lat = spot.lat;
      beacon.lon = spot.lon;
    }
    beacons.set(spot.beacon, beacon);
  });
  return [...beacons.values()].sort((a, b) => b.count - a.count || a.beacon.localeCompare(b.beacon));
}

function hasCoordinates(point) {
  return Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));
}

function parseMode(details, streamId) {
  const match = String(details).match(/\b(CW|RTTY|FT8|FT4)\b/i);
  if (match) return match[1].toUpperCase();
  return streamId === "ft8" ? "FT8" : "CW";
}

function bandForFrequency(frequencyKhz) {
  const ranges = [
    [135, 138, "2190m"], [472, 480, "630m"], [1800, 2000, "160m"],
    [3500, 4000, "80m"], [5330, 5410, "60m"], [7000, 7300, "40m"],
    [10100, 10150, "30m"], [14000, 14350, "20m"], [18068, 18168, "17m"],
    [21000, 21450, "15m"], [24890, 24990, "12m"], [28000, 29700, "10m"],
    [50000, 54000, "6m"], [70000, 71000, "4m"], [144000, 148000, "2m"]
  ];
  return ranges.find(([min, max]) => frequencyKhz >= min && frequencyKhz <= max)?.[2] || "";
}

function formatMhz(frequencyKhz) {
  return (frequencyKhz / 1000).toFixed(frequencyKhz % 1 ? 4 : 3);
}

function parseNumber(text, pattern) {
  const match = String(text).match(pattern);
  return match ? Number(match[1]) : "";
}

function parseOrigin(details) {
  const match = String(details).match(/\b([A-R]{2}\d{2}(?:[A-X]{2})?)\b/i);
  const location = gridLocation(match?.[1]);
  return location ? { originGrid: location.grid, originLat: location.lat, originLon: location.lon } : {};
}

function normalizeCallsign(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeGrid(value) {
  const grid = String(value || "").trim().toUpperCase();
  return /^[A-R]{2}\d{2}(?:[A-X]{2})?$/.test(grid) ? grid : "";
}

function gridLocation(grid) {
  const location = gridToLatLon(grid);
  return location ? { grid, ...location } : null;
}

function stripHtml(value) {
  return String(value).replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ");
}

function tableCellText(value) {
  return stripHtml(String(value).replace(/<b[^>]*class=["']?hide["']?[^>]*>[\s\S]*?<\/b>/gi, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function getText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    }).on("error", reject);
  });
}

module.exports = { RbnService, bandForFrequency, parseNodes, parseSpot };
