const form = document.querySelector("#qsoForm");
const settingsForm = document.querySelector("#settingsForm");
const importForm = document.querySelector("#importForm");
const rows = document.querySelector("#qsoRows");
const searchInput = document.querySelector("#searchInput");
const summary = document.querySelector("#summary");
const statusEl = document.querySelector("#formStatus");
const settingsStatusEl = document.querySelector("#settingsStatus");
const importStatusEl = document.querySelector("#importStatus");
const formTitle = document.querySelector("#formTitle");
const resetButton = document.querySelector("#resetButton");
const lookupButton = document.querySelector("#lookupButton");
const exportButton = document.querySelector("#exportButton");
const publishButton = document.querySelector("#publishButton");

let qsos = [];

init();

async function init() {
  setDefaultDateTime();
  await loadSettings();
  await loadQsos();
  bindEvents();
}

function bindEvents() {
  form.addEventListener("submit", saveQso);
  resetButton.addEventListener("click", resetForm);
  searchInput.addEventListener("input", renderRows);
  form.elements.call.addEventListener("input", clearLookupFields);
  lookupButton.addEventListener("click", lookupCallsign);
  exportButton.addEventListener("click", exportPublic);
  publishButton.addEventListener("click", publish);
  settingsForm.addEventListener("submit", saveSettings);
  importForm.addEventListener("submit", importAdif);
}

async function loadQsos() {
  qsos = await api("/api/qsos");
  renderRows();
}

async function loadSettings() {
  const settings = await api("/api/settings");
  fillSettingsForm(settings);
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
  await api(url, { method: editing ? "PUT" : "POST", body: payload });
  await loadQsos();
  resetForm();
  setStatus(editing ? "QSO updated." : "QSO saved.");
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
  setStatus(`Exported ${stats.total} QSOs to docs/data. ${stats.mapped} are mapped.`);
}

async function publish() {
  setStatus("Publishing...");
  const result = await api("/api/publish", { method: "POST", body: {} }, true);
  if (!result.ok) {
    setStatus(result.error || "Publish failed.", "error");
    return;
  }
  setStatus("Published to GitHub remote.");
}

function renderRows() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = qsos.filter((qso) => {
    const haystack = [qso.call, qso.qsoDate, qso.timeOn, qso.band, qso.mode, qso.grid, qso.country, qso.state]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  summary.textContent = `${filtered.length} of ${qsos.length} QSOs`;
  rows.innerHTML = "";

  if (!filtered.length) {
    rows.innerHTML = `<tr><td colspan="7" class="empty">No QSOs yet.</td></tr>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((qso) => {
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

async function handleRowAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const qso = qsos.find((item) => item.id === button.dataset.id);
  if (!qso) return;
  if (button.dataset.action === "edit") {
    fillForm(qso);
    return;
  }
  if (button.dataset.action === "delete" && confirm(`Delete QSO with ${qso.call}?`)) {
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
    gitRemote: settings.git?.remote || "origin",
    gitBranch: settings.git?.branch || "main",
    gitCommitTemplate: settings.git?.commitTemplate || "Publish log update"
  };
  for (const [key, value] of Object.entries(values)) {
    if (settingsForm.elements[key]) settingsForm.elements[key].value = value || "";
  }
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
