const state = {
  config: {},
  records: [],
  filtered: [],
  map: null,
  markers: null,
  homeMarker: null
};

const controls = {
  search: document.querySelector("#search"),
  dateFrom: document.querySelector("#dateFrom"),
  dateTo: document.querySelector("#dateTo"),
  band: document.querySelector("#bandFilter"),
  mode: document.querySelector("#modeFilter"),
  rows: document.querySelector("#rows"),
  resultCount: document.querySelector("#resultCount"),
  viewStat: document.querySelector("#viewStat"),
  topBandStat: document.querySelector("#topBandStat"),
  topBandCount: document.querySelector("#topBandCount"),
  topModeStat: document.querySelector("#topModeStat"),
  topModeCount: document.querySelector("#topModeCount"),
  profileImage: document.querySelector("#profileImage"),
  aboutTitle: document.querySelector("#aboutTitle"),
  aboutBody: document.querySelector("#aboutBody"),
  recentPosts: document.querySelector("#recentPosts"),
  bandHourHeatmap: document.querySelector("#bandHourHeatmap")
};

init();

async function init() {
  await fetchConfig();
  state.records = await fetch("./data/log.json").then((response) => response.json());
  await fetchRecentPosts();
  await fetchStats();
  setupFilters();
  setupMap();
  applyFilters();
}

async function fetchRecentPosts() {
  try {
    const posts = await fetch("/data/posts.json").then((response) => response.json());
    controls.recentPosts.innerHTML = posts.slice(0, 3).map((post) => `
      <a class="recent-post" href="${escapeHtml(post.url)}">
        <span>${escapeHtml(formatDate(post.date))}</span>
        <strong>${escapeHtml(post.title)}</strong>
      </a>
    `).join("");
  } catch {
    controls.recentPosts.innerHTML = `<p class="empty">No posts yet.</p>`;
  }
}

async function fetchConfig() {
  try {
    const config = await fetch("./data/site-config.json").then((response) => response.json());
    const title = config.title || "Public Logbook";
    const subtitle = config.subtitle || "Read-only amateur radio contact log";
    state.config = config;
    document.title = title;
    document.querySelector("#siteTitle").textContent = title;
    document.querySelector("#subtitle").textContent = subtitle;
    controls.aboutTitle.textContent = config.aboutTitle || "About Me";
    controls.aboutBody.textContent = config.aboutBody || "";
    if (config.profileImageUrl) {
      controls.profileImage.src = config.profileImageUrl;
      controls.profileImage.alt = `${config.stationCallsign || "Operator"} profile photo`;
      controls.profileImage.hidden = false;
    } else {
      controls.profileImage.hidden = true;
    }
  } catch {
    document.querySelector("#siteTitle").textContent = "Public Logbook";
  }
}

async function fetchStats() {
  const stats = await fetch("./data/stats.json").then((response) => response.json());
  document.querySelector("#totalStat").textContent = stats.total || 0;
  document.querySelector("#mappedStat").textContent = stats.mapped || 0;
  document.querySelector("#unmappedStat").textContent = stats.unmapped || 0;
}

function setupFilters() {
  fillSelect(controls.band, unique("band"));
  fillSelect(controls.mode, unique("mode"));
  Object.values(controls).forEach((control) => {
    if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
      control.addEventListener("input", applyFilters);
    }
  });
}

function setupMap() {
  if (!window.L) {
    document.querySelector("#map").style.display = "none";
    document.querySelector("#mapFallback").style.display = "block";
    return;
  }
  const worldBounds = L.latLngBounds([[-85, -180], [85, 180]]);
  state.map = L.map("map", {
    scrollWheelZoom: false,
    worldCopyJump: false,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1,
    minZoom: 2
  }).setView([25, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    bounds: worldBounds,
    maxZoom: 12,
    noWrap: true,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(state.map);
  state.markers = L.layerGroup().addTo(state.map);
}

function applyFilters() {
  const query = controls.search.value.trim().toLowerCase();
  const from = controls.dateFrom.value.replaceAll("-", "");
  const to = controls.dateTo.value.replaceAll("-", "");
  const band = controls.band.value;
  const mode = controls.mode.value;

  state.filtered = state.records.filter((qso) => {
    if (query && ![qso.call, qso.band, qso.mode, qso.grid, qso.country, qso.state].join(" ").toLowerCase().includes(query)) return false;
    if (from && qso.qsoDate < from) return false;
    if (to && qso.qsoDate > to) return false;
    if (band && qso.band !== band) return false;
    if (mode && qso.mode !== mode) return false;
    return true;
  });

  renderTable();
  renderCharts();
  renderViewStats();
  renderMap();
}

function renderTable() {
  controls.resultCount.textContent = `${state.filtered.length} shown`;
  controls.rows.innerHTML = "";
  if (!state.filtered.length) {
    controls.rows.innerHTML = `<tr><td colspan="7" class="empty">No contacts match these filters.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filtered.slice(0, 500).forEach((qso) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(qso.date)}</td>
      <td>${escapeHtml(qso.time)}</td>
      <td><strong>${escapeHtml(qso.call)}</strong></td>
      <td>${escapeHtml(qso.band)}</td>
      <td>${escapeHtml(qso.mode)}</td>
      <td>${escapeHtml(qso.grid)}</td>
      <td>${locationBadge(qso)}</td>
    `;
    fragment.appendChild(tr);
  });
  controls.rows.appendChild(fragment);
}

function renderCharts() {
  renderBars("#bandChart", countBy("band"), 12, compareBandEntries);
  renderBars("#modeChart", countBy("mode"), 8);
  renderBandHourHeatmap();
}

function renderViewStats() {
  const bandEntries = sortedEntries(countBy("band"));
  const modeEntries = sortedEntries(countBy("mode"));
  controls.viewStat.textContent = state.filtered.length;
  setTopStat(controls.topBandStat, controls.topBandCount, bandEntries);
  setTopStat(controls.topModeStat, controls.topModeCount, modeEntries);
}

function renderMap() {
  if (!state.map) return;
  state.markers.clearLayers();
  renderHomeMarker();
  const grouped = new Map();

  state.filtered.forEach((qso) => {
    if (!qso.mapped) return;
    const key = qso.grid || `${Number(qso.lat).toFixed(1)},${Number(qso.lon).toFixed(1)}`;
    const bucket = grouped.get(key) || { ...qso, count: 0, calls: new Set() };
    bucket.count += 1;
    bucket.calls.add(qso.call);
    grouped.set(key, bucket);
  });

  const bounds = [];
  grouped.forEach((point) => {
    const marker = L.circleMarker([point.lat, point.lon], {
      radius: Math.min(22, 6 + Math.sqrt(point.count) * 2),
      color: point.locationConfidence === "estimated" ? "#b7791f" : "#0f766e",
      fillColor: point.locationConfidence === "estimated" ? "#f6c453" : "#14b8a6",
      fillOpacity: 0.72,
      weight: 2
    });
    marker.bindPopup(`<strong>${escapeHtml(point.grid || point.call)}</strong><br>${point.count} QSOs<br>${[...point.calls].slice(0, 8).join(", ")}`);
    marker.addTo(state.markers);
    bounds.push([point.lat, point.lon]);
  });

  if (state.homeMarker) bounds.push(state.homeMarker.getLatLng());
  if (bounds.length) state.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 5 });
}

function renderHomeMarker() {
  if (state.homeMarker) {
    state.homeMarker.remove();
    state.homeMarker = null;
  }

  const { homeLat, homeLon, myGrid, stationCallsign } = state.config;
  if (!Number.isFinite(homeLat) || !Number.isFinite(homeLon)) return;

  const icon = L.divIcon({
    className: "home-station-icon",
    html: `<span class="home-house" aria-hidden="true"></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 28],
    popupAnchor: [0, -28]
  });

  state.homeMarker = L.marker([homeLat, homeLon], { icon, zIndexOffset: 1000 })
    .bindPopup(`<strong>${escapeHtml(stationCallsign || "Home station")}</strong><br>${escapeHtml(myGrid || "")}`)
    .addTo(state.map);
}

function renderBars(selector, counts, limit, sorter = sortedEntries) {
  const el = document.querySelector(selector);
  const entries = sorter(counts).slice(0, limit);
  const max = Math.max(...Object.values(counts), 1);
  el.innerHTML = entries.length
    ? entries.map(([key, count]) => `
      <div class="bar">
        <span>${escapeHtml(key)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.round((count / max) * 100)}%"></span></span>
        <strong>${count}</strong>
      </div>
    `).join("")
    : `<p class="empty">No data</p>`;
}

function renderBandHourHeatmap() {
  const bands = uniqueFromFiltered("band").sort(compareBands);
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  const counts = new Map();
  let max = 0;

  state.filtered.forEach((qso) => {
    const band = qso.band || "Unknown";
    const hour = qso.time ? qso.time.slice(0, 2) : "00";
    const key = `${band}|${hour}`;
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    max = Math.max(max, count);
  });

  if (!bands.length) {
    controls.bandHourHeatmap.innerHTML = `<p class="empty">No data</p>`;
    return;
  }

  const header = [`<span class="heat-corner">UTC</span>`, ...hours.map((hour) => `<span class="heat-hour">${hour}</span>`)].join("");
  const rows = bands.map((band) => {
    const cells = hours.map((hour) => {
      const count = counts.get(`${band}|${hour}`) || 0;
      const level = heatLevel(count, max);
      const title = `${band} at ${hour}Z: ${count} QSO${count === 1 ? "" : "s"}`;
      return `<span class="heat-cell level-${level}" title="${escapeHtml(title)}">${count || ""}</span>`;
    }).join("");
    return `<div class="heat-row"><span class="heat-band">${escapeHtml(band)}</span>${cells}</div>`;
  }).join("");

  controls.bandHourHeatmap.innerHTML = `<div class="heat-grid">${header}${rows}</div>`;
}

function heatLevel(count, max) {
  if (!count || !max) return 0;
  return Math.max(1, Math.ceil((count / max) * 5));
}

function sortedEntries(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function compareBandEntries(counts) {
  return Object.entries(counts).sort(([a], [b]) => compareBands(a, b));
}

function setTopStat(statEl, countEl, entries) {
  if (!entries.length) {
    statEl.textContent = "-";
    countEl.textContent = "No contacts yet";
    return;
  }
  const [label, count] = entries[0];
  statEl.textContent = label;
  countEl.textContent = `${count} contact${count === 1 ? "" : "s"}`;
}

function countBy(field) {
  return state.filtered.reduce((counts, qso) => {
    const key = qso[field] || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function uniqueFromFiltered(field) {
  return [...new Set(state.filtered.map((qso) => qso[field]).filter(Boolean))];
}

function compareBands(a, b) {
  return bandRank(a) - bandRank(b) || a.localeCompare(b);
}

function bandRank(band) {
  const match = String(band || "").match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function locationBadge(qso) {
  if (!qso.mapped) return `<span class="badge unmapped">Unmapped</span>`;
  if (qso.locationConfidence === "estimated") return `<span class="badge estimated">Estimated</span>`;
  return `<span class="badge">Confirmed</span>`;
}

function unique(field) {
  return [...new Set(state.records.map((qso) => qso[field]).filter(Boolean))].sort();
}

function fillSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
