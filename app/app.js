const form = document.querySelector("#qsoForm");
const settingsForm = document.querySelector("#settingsForm");
const importForm = document.querySelector("#importForm");
const rows = document.querySelector("#qsoRows");
const searchInput = document.querySelector("#searchInput");
const summary = document.querySelector("#summary");
const logPager = document.querySelector("#logPager");
const logPrevButton = document.querySelector("#logPrevButton");
const logNextButton = document.querySelector("#logNextButton");
const logPageStatus = document.querySelector("#logPageStatus");
const statusEl = document.querySelector("#formStatus");
const settingsStatusEl = document.querySelector("#settingsStatus");
const importStatusEl = document.querySelector("#importStatus");
const formTitle = document.querySelector("#formTitle");
const resetButton = document.querySelector("#resetButton");
const lookupButton = document.querySelector("#lookupButton");
const exportButton = document.querySelector("#exportButton");
const publishButton = document.querySelector("#publishButton");
const rbnToggle = document.querySelector("#rbnToggle");
const rbnPanelToggle = document.querySelector("#rbnPanelToggle");
const rbnStatus = document.querySelector("#rbnStatus");
const rbnConnectionStatus = document.querySelector("#rbnConnectionStatus");
const rbnFilterForm = document.querySelector("#rbnFilterForm");
const rbnFilters = document.querySelector("#rbnFilters");
const rbnBandFilter = document.querySelector("#rbnBandFilter");
const rbnModeFilter = document.querySelector("#rbnModeFilter");
const rbnRows = document.querySelector("#rbnRows");
const rbnSpotSummary = document.querySelector("#rbnSpotSummary");
const rbnMapEmpty = document.querySelector("#rbnMapEmpty");
const rbnLegend = document.querySelector("#rbnLegend");
const beaconListToggle = document.querySelector("#beaconListToggle");
const beaconListToggleLabel = beaconListToggle.querySelector("span");
const dialog = document.querySelector("#appDialog");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogMessage = document.querySelector("#dialogMessage");
const dialogDetails = document.querySelector("#dialogDetails");
const dialogCancelButton = document.querySelector("#dialogCancelButton");
const dialogConfirmButton = document.querySelector("#dialogConfirmButton");
const dialogCloseButton = document.querySelector("#dialogCloseButton");

let qsos = [];
let rbnState = null;
let rbnPollTimer = null;
let rbnMap = null;
let rbnMapLayers = null;
let rbnBeaconsVisible = true;
let logPage = 1;
const LOG_PAGE_SIZE = 20;

const BAND_COLORS = {
  "160m": "#7c3aed",
  "80m": "#2563eb",
  "60m": "#0891b2",
  "40m": "#0f766e",
  "30m": "#65a30d",
  "20m": "#ca8a04",
  "17m": "#ea580c",
  "15m": "#dc2626",
  "12m": "#db2777",
  "10m": "#9333ea",
  "6m": "#475569",
  "2m": "#111827"
};
const BAND_ORDER = Object.keys(BAND_COLORS);

init();

async function init() {
  setDefaultDateTime();
  await loadSettings();
  await loadQsos();
  await loadRbn();
  bindEvents();
  renderIcons();
}

function bindEvents() {
  form.addEventListener("submit", saveQso);
  resetButton.addEventListener("click", resetForm);
  searchInput.addEventListener("input", () => {
    logPage = 1;
    renderRows();
  });
  logPrevButton.addEventListener("click", () => {
    logPage = Math.max(1, logPage - 1);
    renderRows();
  });
  logNextButton.addEventListener("click", () => {
    logPage += 1;
    renderRows();
  });
  form.elements.call.addEventListener("input", clearLookupFields);
  lookupButton.addEventListener("click", lookupCallsign);
  exportButton.addEventListener("click", exportPublic);
  publishButton.addEventListener("click", publish);
  settingsForm.addEventListener("submit", saveSettings);
  importForm.addEventListener("submit", importAdif);
  rbnToggle.addEventListener("click", toggleRbn);
  rbnPanelToggle.addEventListener("click", toggleRbn);
  rbnFilterForm.addEventListener("submit", addRbnFilter);
  rbnFilters.addEventListener("click", removeRbnFilter);
  rbnBandFilter.addEventListener("change", renderRbn);
  rbnModeFilter.addEventListener("change", renderRbn);
  beaconListToggle.addEventListener("click", toggleRbnBeacons);
}

async function loadQsos() {
  qsos = await api("/api/qsos");
  renderRows();
}

async function loadSettings() {
  const settings = await api("/api/settings");
  fillSettingsForm(settings);
}

async function loadRbn() {
  rbnState = await api("/api/rbn");
  renderRbn();
  scheduleRbnPoll();
}

async function toggleRbn() {
  rbnToggle.disabled = true;
  rbnPanelToggle.disabled = true;
  try {
    rbnState = await api("/api/rbn", { method: "PUT", body: { active: !rbnState?.active } });
    renderRbn();
    scheduleRbnPoll();
  } finally {
    rbnToggle.disabled = false;
    rbnPanelToggle.disabled = false;
  }
}

async function addRbnFilter(event) {
  event.preventDefault();
  const input = rbnFilterForm.elements.callsign;
  if (!input.value.trim()) return;
  rbnState = await api("/api/rbn/filters", { method: "POST", body: { callsign: input.value } });
  input.value = "";
  renderRbn();
}

async function removeRbnFilter(event) {
  const button = event.target.closest("button[data-callsign]");
  if (!button) return;
  rbnState = await api(`/api/rbn/filters/${encodeURIComponent(button.dataset.callsign)}`, { method: "DELETE" });
  renderRbn();
}

function toggleRbnBeacons() {
  rbnBeaconsVisible = !rbnBeaconsVisible;
  renderRbnBeaconToggle(rbnState?.nodes || []);
  renderRbnMap(rbnState || { active: false, spots: [], beacons: [] });
}

function scheduleRbnPoll() {
  clearTimeout(rbnPollTimer);
  if (!rbnState?.active) return;
  rbnPollTimer = setTimeout(async () => {
    try {
      await loadRbn();
    } catch {
      scheduleRbnPoll();
    }
  }, 20000);
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(settingsForm).entries());
  const settings = await api("/api/settings", { method: "PUT", body: payload });
  fillSettingsForm(settings);
  setSettingsStatus("Settings saved and public config regenerated.");
}

async function importAdif(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(importForm).entries());
  if (!payload.path.trim()) {
    setImportStatus("Enter a local ADIF file path first.", "warn");
    return;
  }

  const button = importForm.querySelector("button[type='submit']");
  button.disabled = true;
  setImportStatus("Importing ADIF...");
  try {
    const result = await api("/api/import", { method: "POST", body: payload });
    await loadQsos();
    setImportStatus(`Imported ${result.imported} of ${result.incoming} records. Skipped ${result.skipped} duplicates. ${result.total} QSOs total.`);
  } catch (error) {
    setImportStatus(error.message || "Import failed.", "error");
  } finally {
    button.disabled = false;
  }
}

async function saveQso(event) {
  event.preventDefault();
  const payload = getFormData();
  const editing = Boolean(payload.id);
  const url = editing ? `/api/qsos/${encodeURIComponent(payload.id)}` : "/api/qsos";
  try {
    await api(url, { method: editing ? "PUT" : "POST", body: payload });
    await loadQsos();
    resetForm();
    setStatus(editing ? "QSO updated." : "QSO saved.");
  } catch (error) {
    setStatus(error.message || "QSO could not be saved.", "error");
  }
}

async function lookupCallsign() {
  const call = form.elements.call.value.trim();
  if (!call) {
    setStatus("Enter a callsign first.", "warn");
    return;
  }
  setStatus("Looking up callsign...");
  lookupButton.disabled = true;
  let result;
  try {
    result = await api("/api/lookup", { method: "POST", body: { call } });
  } catch (error) {
    setStatus(error.message || "Lookup failed.", "error");
    return;
  } finally {
    lookupButton.disabled = false;
  }
  if (!result.found) {
    clearLookupFields();
    setStatus(result.error || "No lookup result found.", "warn");
    return;
  }
  setLookupValue("country", result.country);
  setLookupValue("state", result.state);
  setLookupValue("grid", result.grid);
  form.elements.lat.value = result.lat || "";
  form.elements.lon.value = result.lon || "";
  form.elements.locationSource.value = result.locationSource || "fcc_lookup";
  form.elements.locationConfidence.value = result.locationConfidence || "estimated";
  setStatus(`Estimated location added from ${result.source}.`);
}

async function exportPublic() {
  const stats = await api("/api/export", { method: "POST", body: {} });
  setStatus(`Exported ${stats.total} QSOs to the active repo docs/data. ${stats.mapped} are mapped.`);
}

async function publish() {
  setStatus("Publishing...");
  let result;
  try {
    result = await api("/api/publish", { method: "POST", body: {} }, true);
  } catch (error) {
    setStatus(error.message || "Publish failed.", "error");
    await showMessageDialog({
      title: "Publish Failed",
      message: error.message || "The publish request could not be completed."
    });
    return;
  }
  if (!result.ok) {
    setStatus(result.error || "Publish failed.", "error");
    await showMessageDialog({
      title: "Publish Failed",
      message: result.error || "GitLogBook could not publish this update.",
      details: result.step ? `Failed step: ${result.step}` : ""
    });
    return;
  }
  const message = result.noChanges
    ? "No public changes needed to be committed. Remote is up to date."
    : "Published to GitHub remote.";
  setStatus(message);
  await showMessageDialog({
    title: "Publish Complete",
    message,
    details: formatPublishDetails(result)
  });
}

function renderRbn() {
  const state = rbnState || { active: false, filters: [], spots: [], beacons: [], connections: [] };
  const connected = state.connections.filter((connection) => connection.status === "connected").length;
  rbnToggle.setAttribute("aria-pressed", String(state.active));
  rbnToggle.title = state.active ? "Disconnect from Reverse Beacon Network" : "Connect to Reverse Beacon Network";
  rbnPanelToggle.querySelector("span").textContent = state.active ? "Disconnect RBN" : "Connect RBN";
  rbnStatus.textContent = state.active ? connected ? "Connected" : "Connecting" : "Disconnected";
  rbnStatus.dataset.active = String(state.active);
  rbnConnectionStatus.textContent = state.active
    ? `${connected} of ${state.connections.length} streams connected. ${state.filters.length ? "Showing watched-call history." : "Showing the latest 250 unfiltered spots."}`
    : "Connect to begin receiving CW, RTTY, and FT8 spots.";
  renderRbnFilters(state.filters);
  renderRbnSpotFilters(state.spots);
  const filteredSpots = filterRbnSpots(state.spots);
  renderRbnRows(filteredSpots, state.spots.length);
  renderRbnBeaconToggle(state.nodes || []);
  renderRbnMap({ ...state, spots: filteredSpots, useHomeFallback: Boolean(rbnModeFilter.value) });
  renderIcons();
}

function renderRbnFilters(filters) {
  if (!filters.length) {
    rbnFilters.innerHTML = `<span class="rbn-filter-empty">No filters. Showing all incoming spots.</span>`;
    return;
  }
  rbnFilters.innerHTML = filters.map((callsign) => `
    <span class="rbn-filter">
      ${escapeHtml(callsign)}
      <button type="button" data-callsign="${escapeHtml(callsign)}" title="Remove ${escapeHtml(callsign)} filter" aria-label="Remove ${escapeHtml(callsign)} filter">
        <i data-lucide="x"></i>
      </button>
    </span>
  `).join("");
}

function renderRbnSpotFilters(spots) {
  fillRbnSpotFilter(rbnBandFilter, uniqueRbnValues(spots, "band"), "All bands");
  fillRbnSpotFilter(rbnModeFilter, uniqueRbnValues(spots, "mode"), "All modes");
}

function fillRbnSpotFilter(select, values, emptyLabel) {
  const selected = select.value;
  select.innerHTML = [`<option value="">${emptyLabel}</option>`, ...values.map((value) => (
    `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
  ))].join("");
  select.value = values.includes(selected) ? selected : "";
}

function uniqueRbnValues(spots, field) {
  return [...new Set(spots.map((spot) => spot[field]).filter(Boolean))].sort(compareNatural);
}

function compareNatural(a, b) {
  const bandA = BAND_ORDER.indexOf(a);
  const bandB = BAND_ORDER.indexOf(b);
  if (bandA >= 0 && bandB >= 0) return bandA - bandB;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function filterRbnSpots(spots) {
  const band = rbnBandFilter.value;
  const mode = rbnModeFilter.value;
  return spots.filter((spot) => (!band || spot.band === band) && (!mode || spot.mode === mode));
}

function renderRbnRows(spots, totalSpots = spots.length) {
  rbnSpotSummary.textContent = totalSpots === spots.length
    ? `${spots.length} ${spots.length === 1 ? "spot" : "spots"}`
    : `${spots.length} of ${totalSpots} spots`;
  if (!spots.length) {
    rbnRows.innerHTML = `<tr><td colspan="8" class="empty">${totalSpots ? "No RBN spots match these filters." : "No RBN spots received for this view yet."}</td></tr>`;
    return;
  }
  rbnRows.innerHTML = spots.map((spot) => `
    <tr>
      <td>${escapeHtml(spot.time || "")}</td>
      <td><strong>${escapeHtml(spot.call || "")}</strong></td>
      <td>${escapeHtml(spot.beacon || "")}</td>
      <td>${escapeHtml(spot.frequencyMhz || "")}</td>
      <td>${escapeHtml(spot.band || "")}</td>
      <td><span class="mode-cell"><i data-lucide="${modeIcon(spot.mode)}"></i>${escapeHtml(spot.mode || "")}</span></td>
      <td>${spot.snr === "" ? "" : `${escapeHtml(spot.snr)} dB`}</td>
      <td>${spot.speed === "" ? "" : `${escapeHtml(spot.speed)} WPM`}</td>
    </tr>
  `).join("");
}

function renderRbnBeaconToggle(nodes) {
  const count = nodes.filter(hasCoordinates).length;
  beaconListToggle.setAttribute("aria-pressed", String(rbnBeaconsVisible));
  beaconListToggle.title = rbnBeaconsVisible ? "Hide RBN node markers" : "Show RBN node markers";
  beaconListToggleLabel.textContent = `Nodes${count ? ` ${count}` : ""}`;
}

function renderRbnMap(state) {
  if (!window.L) {
    rbnMapEmpty.textContent = "Map library unavailable.";
    rbnMapEmpty.hidden = false;
    return;
  }
  if (!rbnMap) {
    const worldBounds = L.latLngBounds([[-85, -180], [85, 180]]);
    rbnMap = L.map("rbnMap", {
      worldCopyJump: false,
      zoomControl: true,
      maxZoom: 8
    }).setView([25, 0], 2);
    setRbnFillZoom();
    rbnMap.on("resize", setRbnFillZoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      bounds: worldBounds,
      maxZoom: 8,
      noWrap: true,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(rbnMap);
    rbnMapLayers = L.layerGroup().addTo(rbnMap);
  }
  rbnMapLayers.clearLayers();
  const bounds = [];
  const home = state.home;
  if (home) {
    L.circleMarker([home.lat, home.lon], {
      radius: 6,
      color: "#102522",
      fillColor: "#ffffff",
      fillOpacity: 1,
      weight: 3
    }).bindTooltip(`${state.stationCallsign || "Home"} · ${home.grid}`).addTo(rbnMapLayers);
    bounds.push([home.lat, home.lon]);
  }

  const paths = new Map();
  state.spots.forEach((spot) => {
    if (!hasCoordinates(spot)) return;
    const origin = signalOrigin(spot, state);
    if (!origin) return;
    paths.set(`${origin.lat}|${origin.lon}|${spot.beacon}|${spot.band}`, { origin, spot });
  });
  paths.forEach(({ origin, spot }) => {
    const color = bandColor(spot.band);
    L.polyline(arcPoints(origin, spot), {
      color,
      opacity: origin.estimated ? 0.42 : 0.68,
      weight: 2,
      dashArray: origin.estimated ? "6 7" : null
    })
      .bindTooltip(`${spot.call} · ${spot.band || "Unknown band"} · ${spot.beacon}${origin.estimated ? " · origin estimated from home grid" : ""}`)
      .addTo(rbnMapLayers);
    bounds.push([origin.lat, origin.lon]);
    bounds.push([Number(spot.lat), Number(spot.lon)]);
  });
  const nodes = (state.nodes || []).filter(hasCoordinates);
  if (rbnBeaconsVisible) {
    nodes.forEach((node) => {
      L.circleMarker([node.lat, node.lon], {
        radius: 5,
        color: "#0f766e",
        fillColor: "#14b8a6",
        fillOpacity: 0.86,
        weight: 2
      }).bindTooltip(rbnNodeTooltip(node)).addTo(rbnMapLayers);
      bounds.push([Number(node.lat), Number(node.lon)]);
    });
  }

  const activeBands = [...new Set(state.spots.map((spot) => spot.band).filter(Boolean))];
  const hasPaths = paths.size > 0;
  const hasVisibleNodes = rbnBeaconsVisible && nodes.length > 0;
  rbnLegend.innerHTML = activeBands.map((band) => `<span><i class="band-line" style="background:${bandColor(band)}"></i>${escapeHtml(band)}</span>`).join("");
  rbnLegend.hidden = !activeBands.length;
  rbnMapEmpty.textContent = !nodes.length
    ? "Loading RBN node locations."
    : !rbnBeaconsVisible
      ? "RBN node markers are hidden."
      : state.active
        ? "RBN nodes are shown. A signal grid is needed to draw each path."
        : "RBN node locations are shown. Connect RBN to display live paths.";
  rbnMapEmpty.hidden = hasPaths || hasVisibleNodes;
  if (bounds.length > 1) rbnMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 5 });
  setTimeout(() => {
    rbnMap.invalidateSize();
    setRbnFillZoom();
  }, 0);
}

function setRbnFillZoom() {
  if (!rbnMap) return;
  const size = rbnMap.getSize();
  const minZoom = Math.min(8, Math.max(1, Math.ceil(Math.log2(Math.max(size.x, size.y) / 256))));
  rbnMap.setMinZoom(minZoom);
  if (rbnMap.getZoom() < minZoom) rbnMap.setZoom(minZoom);
}

function rbnNodeTooltip(node) {
  const status = rbnNodeStatus(node.lastSeen);
  const details = [node.grid, node.bands].filter(Boolean).map(escapeHtml);
  return `
    <div class="rbn-node-tooltip">
      <strong>${escapeHtml(node.beacon)}</strong>
      <span class="rbn-node-status" data-tone="${status.tone}">
        <i></i>${escapeHtml(status.label)}
      </span>
      ${details.length ? `<span>${details.join(" · ")}</span>` : ""}
    </div>
  `;
}

function rbnNodeStatus(lastSeen) {
  const value = String(lastSeen || "").trim();
  if (!value) return { tone: "stale", label: "last seen unknown" };
  if (/^online$/i.test(value)) return { tone: "online", label: "online" };
  const seenDate = relativeLastSeenDate(value);
  return {
    tone: isWithinLastWeek(value) ? "recent" : "stale",
    label: seenDate ? `last seen on ${formatShortDate(seenDate)}` : `last seen ${value}`
  };
}

function isWithinLastWeek(value) {
  const text = String(value).toLowerCase();
  if (/\bminute|hour\b/.test(text)) return true;
  const days = text.match(/(\d+)\s+day/);
  if (days) return Number(days[1]) < 7;
  return false;
}

function relativeLastSeenDate(value) {
  const text = String(value).toLowerCase();
  const date = new Date();
  const minutes = text.match(/(\d+)\s+minute/);
  const hours = text.match(/(\d+)\s+hour/);
  const days = text.match(/(\d+)\s+day/);
  const months = text.match(/(\d+)\s+month/);
  const years = text.match(/(\d+)\s+year/);
  if (minutes) date.setMinutes(date.getMinutes() - Number(minutes[1]));
  if (hours) date.setHours(date.getHours() - Number(hours[1]));
  if (days) date.setDate(date.getDate() - Number(days[1]));
  if (months) date.setMonth(date.getMonth() - Number(months[1]));
  if (years) date.setFullYear(date.getFullYear() - Number(years[1]));
  return minutes || hours || days || months || years ? date : null;
}

function formatShortDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function signalOrigin(spot, state) {
  if (spot.call === state.stationCallsign && state.home) return state.home;
  if (Number.isFinite(Number(spot.originLat)) && Number.isFinite(Number(spot.originLon))) {
    return { lat: Number(spot.originLat), lon: Number(spot.originLon) };
  }
  if (state.useHomeFallback && state.home) return { ...state.home, estimated: true };
  return null;
}

function hasCoordinates(point) {
  return Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon));
}

function arcPoints(start, end) {
  const startLat = Number(start.lat);
  const startLon = normalizeMapLon(start.lon);
  const endLat = Number(end.lat);
  const endLon = normalizeMapLon(end.lon);
  const distance = Math.hypot(endLat - startLat, endLon - startLon);
  const bend = Math.min(24, Math.max(2.5, distance * 0.16));
  return Array.from({ length: 25 }, (_, index) => {
    const progress = index / 24;
    return [
      startLat + (endLat - startLat) * progress + Math.sin(Math.PI * progress) * bend,
      startLon + (endLon - startLon) * progress
    ];
  });
}

function normalizeMapLon(value) {
  let lon = Number(value);
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function modeIcon(mode) {
  if (mode === "CW") return "activity";
  if (mode === "RTTY") return "binary";
  return "waves";
}

function bandColor(band) {
  return BAND_COLORS[band] || "#64748b";
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderRows() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = qsos.filter((qso) => {
    const haystack = [qso.call, qso.qsoDate, qso.timeOn, qso.band, qso.mode, qso.grid, qso.country, qso.state]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_PAGE_SIZE));
  logPage = Math.min(logPage, totalPages);
  const pageStart = (logPage - 1) * LOG_PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + LOG_PAGE_SIZE);

  summary.textContent = `${filtered.length} of ${qsos.length} QSOs`;
  rows.innerHTML = "";
  renderLogPager(filtered.length, totalPages);

  if (!filtered.length) {
    rows.innerHTML = `<tr><td colspan="7" class="empty">No QSOs yet.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  pageRows.forEach((qso) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(displayDate(qso.qsoDate))}</td>
      <td>${escapeHtml(displayTime(qso.timeOn))}</td>
      <td><strong>${escapeHtml(qso.call || "")}</strong></td>
      <td>${escapeHtml(qso.band || "")}</td>
      <td>${escapeHtml(qso.mode || "")}</td>
      <td>${escapeHtml(qso.grid || "")}</td>
      <td>
        <span class="row-actions">
          <button type="button" data-action="edit" data-id="${qso.id}">Edit</button>
          <button type="button" class="delete" data-action="delete" data-id="${qso.id}">Delete</button>
        </span>
      </td>
    `;
    tr.addEventListener("click", handleRowAction);
    fragment.appendChild(tr);
  });
  rows.appendChild(fragment);
}

function renderLogPager(totalRows, totalPages) {
  logPager.hidden = totalRows <= LOG_PAGE_SIZE;
  logPrevButton.disabled = logPage <= 1;
  logNextButton.disabled = logPage >= totalPages;
  const first = totalRows ? (logPage - 1) * LOG_PAGE_SIZE + 1 : 0;
  const last = Math.min(totalRows, logPage * LOG_PAGE_SIZE);
  logPageStatus.textContent = totalRows
    ? `${first}-${last} of ${totalRows} · Page ${logPage} of ${totalPages}`
    : "Page 1 of 1";
}

async function handleRowAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const qso = qsos.find((item) => item.id === button.dataset.id);
  if (!qso) return;
  if (button.dataset.action === "edit") {
    fillForm(qso);
    return;
  }
  if (button.dataset.action === "delete" && await showConfirmDialog({
    title: "Delete QSO",
    message: `Delete QSO with ${qso.call}? This removes it from the local ADIF and regenerates the public export.`
  })) {
    await api(`/api/qsos/${encodeURIComponent(qso.id)}`, { method: "DELETE" });
    await loadQsos();
    setStatus("QSO deleted.");
  }
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function fillForm(qso) {
  for (const [key, value] of Object.entries(qso)) {
    if (!form.elements[key]) continue;
    form.elements[key].value = key === "qsoDate" ? toDateInput(value) : key === "timeOn" ? toTimeInput(value) : value || "";
  }
  formTitle.textContent = `Edit ${qso.call}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetForm() {
  form.reset();
  form.elements.id.value = "";
  form.elements.mode.value = "CW";
  formTitle.textContent = "New QSO";
  setDefaultDateTime();
}

function setDefaultDateTime() {
  const now = new Date();
  form.elements.qsoDate.value = now.toISOString().slice(0, 10);
  form.elements.timeOn.value = now.toISOString().slice(11, 16);
}

function setLookupValue(name, value) {
  if (!form.elements[name]) return;
  form.elements[name].value = value || "";
  form.elements[name].dispatchEvent(new Event("input", { bubbles: true }));
}

function clearLookupFields() {
  setLookupValue("country", "");
  setLookupValue("state", "");
  setLookupValue("grid", "");
  form.elements.lat.value = "";
  form.elements.lon.value = "";
  form.elements.locationSource.value = "";
  form.elements.locationConfidence.value = "";
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function setSettingsStatus(message, tone = "") {
  settingsStatusEl.textContent = message;
  settingsStatusEl.dataset.tone = tone;
}

function setImportStatus(message, tone = "") {
  importStatusEl.textContent = message;
  importStatusEl.dataset.tone = tone;
}

function fillSettingsForm(settings) {
  const values = {
    ...settings,
    deploymentRepoPath: settings.deploymentRepoPath || settings.activeRepoPath || "",
    gitRemote: settings.git?.remote || "origin",
    gitBranch: settings.git?.branch || "main",
    gitCommitTemplate: settings.git?.commitTemplate || "Publish log update"
  };
  for (const [key, value] of Object.entries(values)) {
    if (settingsForm.elements[key]) settingsForm.elements[key].value = value || "";
  }
}

function showMessageDialog({ title, message, details = "" }) {
  return openDialog({ title, message, details, confirmLabel: "OK", showCancel: false });
}

function showConfirmDialog({ title, message, details = "" }) {
  return openDialog({ title, message, details, confirmLabel: "Delete", cancelLabel: "Cancel", showCancel: true });
}

function openDialog({ title, message, details = "", confirmLabel = "OK", cancelLabel = "Cancel", showCancel = false }) {
  dialogTitle.textContent = title;
  dialogMessage.textContent = message;
  dialogDetails.textContent = details;
  dialogDetails.hidden = !details;
  dialogConfirmButton.textContent = confirmLabel;
  dialogCancelButton.textContent = cancelLabel;
  dialogCancelButton.hidden = !showCancel;
  dialogCloseButton.hidden = showCancel;
  dialog.returnValue = "cancel";

  return new Promise((resolve) => {
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "confirm");
    };
    dialog.addEventListener("close", onClose);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      resolve(window.confirm(message));
    }
  });
}

function formatPublishDetails(result) {
  return [
    result.remote ? `Remote: ${result.remote}` : "",
    result.branch ? `Branch: ${result.branch}` : "",
    result.commit ? `Commit: ${result.commit}` : "",
    result.push ? `Push: ${result.push}` : ""
  ].filter(Boolean).join("\n");
}

async function api(url, options = {}, allowFailure = false) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok && !allowFailure) throw new Error(payload.error || "Request failed");
  return payload;
}

function displayDate(value) {
  const text = String(value || "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}

function displayTime(value) {
  const text = String(value || "").padEnd(4, "0");
  return text.length >= 4 ? `${text.slice(0, 2)}:${text.slice(2, 4)}` : text;
}

function toDateInput(value) {
  return displayDate(value);
}

function toTimeInput(value) {
  return displayTime(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
