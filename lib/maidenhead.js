function gridToLatLon(grid) {
  const locator = String(grid || "").trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(locator)) return null;

  let lon = (locator.charCodeAt(0) - 65) * 20 - 180;
  let lat = (locator.charCodeAt(1) - 65) * 10 - 90;
  lon += Number(locator[2]) * 2;
  lat += Number(locator[3]);

  if (locator.length >= 6) {
    lon += (locator.charCodeAt(4) - 65) * (5 / 60);
    lat += (locator.charCodeAt(5) - 65) * (2.5 / 60);
    lon += 2.5 / 60;
    lat += 1.25 / 60;
  } else {
    lon += 1;
    lat += 0.5;
  }

  return { lat: round(lat), lon: round(lon) };
}

function latLonToGrid(latValue, lonValue, precision = 4) {
  let lat = Number(latValue);
  let lon = Number(lonValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return "";

  lat += 90;
  lon += 180;

  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  lon -= fieldLon * 20;
  lat -= fieldLat * 10;

  const squareLon = Math.floor(lon / 2);
  const squareLat = Math.floor(lat);
  lon -= squareLon * 2;
  lat -= squareLat;

  let grid = `${letter(fieldLon)}${letter(fieldLat)}${squareLon}${squareLat}`;
  if (precision >= 6) {
    grid += `${letter(Math.floor(lon / (5 / 60))).toLowerCase()}${letter(Math.floor(lat / (2.5 / 60))).toLowerCase()}`;
  }
  return grid.toUpperCase();
}

function letter(index) {
  return String.fromCharCode(65 + index);
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

module.exports = { gridToLatLon, latLonToGrid };
