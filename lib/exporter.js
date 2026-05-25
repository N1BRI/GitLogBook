const { displayDate, displayTime } = require("./adif");
const { gridToLatLon } = require("./maidenhead");

function buildPublicExport(qsos, settings = {}) {
  const records = qsos.map(toPublicRecord).sort((a, b) => {
    const left = `${a.qsoDate || ""}${a.timeOn || ""}`;
    const right = `${b.qsoDate || ""}${b.timeOn || ""}`;
    return right.localeCompare(left);
  });

  return {
    log: records,
    stats: buildStats(records),
    config: buildSiteConfig(settings)
  };
}

function buildSiteConfig(settings) {
  const stationCallsign = clean(settings.stationCallsign);
  const myGrid = clean(settings.myGrid).toUpperCase();
  const home = gridToLatLon(myGrid);
  return {
    title: clean(settings.publicTitle) || (stationCallsign ? `Logbook de ${stationCallsign}` : "Public Logbook"),
    subtitle: clean(settings.publicSubtitle) || "Read-only amateur radio contact log",
    stationCallsign,
    myGrid,
    homeLat: home?.lat ?? null,
    homeLon: home?.lon ?? null,
    aboutTitle: clean(settings.aboutTitle) || (stationCallsign ? `About ${stationCallsign}` : "About Me"),
    aboutBody: clean(settings.aboutBody),
    profileImageUrl: clean(settings.profileImageUrl),
    qrzUrl: clean(settings.qrzUrl) || (stationCallsign ? `https://www.qrz.com/db/${stationCallsign}` : "")
  };
}

function toPublicRecord(qso) {
  const fromGrid = gridToLatLon(qso.grid);
  const lat = numberOrNull(qso.lat) ?? fromGrid?.lat ?? null;
  const lon = numberOrNull(qso.lon) ?? fromGrid?.lon ?? null;
  const locationConfidence = qso.locationConfidence || (qso.grid ? "confirmed" : "");
  const band = normalizeBand(qso.band);

  return {
    id: qso.id,
    call: qso.call || "",
    call_lc: String(qso.call || "").toLowerCase(),
    qsoDate: qso.qsoDate || "",
    date: displayDate(qso.qsoDate),
    timeOn: qso.timeOn || "",
    time: displayTime(qso.timeOn),
    band,
    freq: qso.freq || "",
    mode: qso.mode || "",
    rstSent: qso.rstSent || "",
    rstRcvd: qso.rstRcvd || "",
    country: qso.country || "",
    state: qso.state || "",
    grid: qso.grid ? String(qso.grid).slice(0, 4).toUpperCase() : "",
    lat,
    lon,
    locationSource: qso.locationSource || (qso.grid ? "grid" : ""),
    locationConfidence,
    mapped: Number.isFinite(lat) && Number.isFinite(lon)
  };
}

function normalizeBand(value) {
  const band = clean(value);
  const match = band.match(/^(\d+)(m)$/i);
  return match ? `${match[1]}m` : band;
}

function buildStats(records) {
  return records.reduce(
    (stats, qso) => {
      stats.total += 1;
      stats[qso.mapped ? "mapped" : "unmapped"] += 1;
      increment(stats.byBand, qso.band || "Unknown");
      increment(stats.byMode, qso.mode || "Unknown");
      increment(stats.byDay, qso.date || "Unknown");
      increment(stats.byHour, qso.time ? qso.time.slice(0, 2) : "Unknown");
      return stats;
    },
    { total: 0, mapped: 0, unmapped: 0, byBand: {}, byMode: {}, byDay: {}, byHour: {} }
  );
}

function increment(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return String(value || "").trim();
}

module.exports = { buildPublicExport };
