const crypto = require("node:crypto");

const FIELD_MAP = {
  id: "APP_GITLOGBOOK_ID",
  call: "CALL",
  qsoDate: "QSO_DATE",
  timeOn: "TIME_ON",
  band: "BAND",
  freq: "FREQ",
  mode: "MODE",
  rstSent: "RST_SENT",
  rstRcvd: "RST_RCVD",
  country: "COUNTRY",
  state: "STATE",
  grid: "GRIDSQUARE",
  comment: "COMMENT",
  locationSource: "APP_GITLOGBOOK_LOCATION_SOURCE",
  locationConfidence: "APP_GITLOGBOOK_LOCATION_CONFIDENCE",
  lat: "APP_GITLOGBOOK_LAT",
  lon: "APP_GITLOGBOOK_LON"
};

const ADIF_TO_KEY = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([key, field]) => [field, key])
);

function parseAdif(input) {
  const body = stripHeader(input || "");
  return body
    .split(/<eor>/i)
    .map(parseRecord)
    .filter(Boolean)
    .map((qso) => ({ ...qso, id: qso.id || crypto.randomUUID() }));
}

function stripHeader(input) {
  const marker = input.search(/<eoh>/i);
  return marker >= 0 ? input.slice(marker + 5) : input;
}

function parseRecord(record) {
  const qso = {};
  const pattern = /<([^:>\s]+)(?::(\d+))?(?::[^>]*)?>([^<]*)/gi;
  let match;

  while ((match = pattern.exec(record))) {
    const field = match[1].toUpperCase();
    const len = Number.parseInt(match[2] || "", 10);
    const rawValue = match[3] || "";
    const value = Number.isFinite(len) ? rawValue.slice(0, len) : rawValue.trim();
    const key = ADIF_TO_KEY[field] || field.toLowerCase();
    qso[key] = value.trim();
  }

  return Object.keys(qso).length ? qso : null;
}

function writeAdif(qsos) {
  const header = [
    "GitLogBook ADIF export",
    "<ADIF_VER:5>3.1.4",
    "<PROGRAMID:10>GitLogBook",
    "<EOH>",
    ""
  ];

  const records = qsos.map((qso) => `${writeRecord(qso)}<EOR>`).join("\n\n");
  return `${header.join("\n")}${records}${records ? "\n" : ""}`;
}

function writeRecord(qso) {
  const orderedKeys = [
    "id",
    "call",
    "qsoDate",
    "timeOn",
    "band",
    "freq",
    "mode",
    "rstSent",
    "rstRcvd",
    "country",
    "state",
    "grid",
    "lat",
    "lon",
    "locationSource",
    "locationConfidence",
    "comment"
  ];

  return orderedKeys
    .filter((key) => qso[key] !== undefined && qso[key] !== null && String(qso[key]).trim() !== "")
    .map((key) => formatField(FIELD_MAP[key] || key.toUpperCase(), String(qso[key]).trim()))
    .join("");
}

function formatField(field, value) {
  return `<${field}:${Buffer.byteLength(value, "utf8")}>${value}`;
}

function normalizeQso(input) {
  return {
    id: input.id || crypto.randomUUID(),
    call: cleanUpper(input.call),
    qsoDate: cleanDate(input.qsoDate),
    timeOn: cleanTime(input.timeOn),
    band: clean(input.band),
    freq: clean(input.freq),
    mode: cleanUpper(input.mode),
    rstSent: clean(input.rstSent),
    rstRcvd: clean(input.rstRcvd),
    country: clean(input.country),
    state: cleanUpper(input.state),
    grid: cleanUpper(input.grid),
    lat: clean(input.lat),
    lon: clean(input.lon),
    locationSource: clean(input.locationSource),
    locationConfidence: clean(input.locationConfidence),
    comment: clean(input.comment)
  };
}

function clean(value) {
  return String(value || "").trim();
}

function cleanUpper(value) {
  return clean(value).toUpperCase();
}

function cleanDate(value) {
  return clean(value).replaceAll("-", "");
}

function cleanTime(value) {
  return clean(value).replaceAll(":", "").slice(0, 6);
}

function displayDate(value) {
  const text = clean(value);
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}` : text;
}

function displayTime(value) {
  const text = clean(value).padEnd(4, "0");
  return text.length >= 4 ? `${text.slice(0, 2)}:${text.slice(2, 4)}` : text;
}

module.exports = {
  FIELD_MAP,
  parseAdif,
  writeAdif,
  normalizeQso,
  displayDate,
  displayTime
};
