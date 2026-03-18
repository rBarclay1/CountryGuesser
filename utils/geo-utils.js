// Normalizes numeric country codes (e.g. 4 -> "004") for stable matching.
export function normalizeNumericCode(value) {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(3, '0');
}

// Maps country metadata region/subregion into quiz continent buckets.
export function classifyContinent(region, subregion) {
  if (region === 'Europe') return 'Europe';
  if (region === 'Africa') return 'Africa';
  if (region === 'Asia') return 'Asia';
  if (region === 'Oceania') return 'Oceania';
  if (region === 'Antarctic' || region === 'Antarctica') return 'Antarctica';

  if (region === 'Americas') {
    return subregion === 'South America' ? 'South America' : 'North America';
  }

  return null;
}

// Builds a numeric-country-code -> continent lookup map from country metadata.
export function buildContinentMap(countryMeta) {
  const byNumericId = new Map();

  for (const item of countryMeta) {
    const numeric = normalizeNumericCode(item.ccn3);
    if (!numeric) continue;

    const continent = classifyContinent(item.region, item.subregion);
    if (!continent) continue;

    byNumericId.set(numeric, continent);
  }

  return byNumericId;
}

// Recursively flattens nested polygon/multipolygon coordinate arrays into [lng, lat] points.
function collectLngLatPoints(coords, out) {
  if (!Array.isArray(coords) || !coords.length) return;
  if (typeof coords[0] === 'number') {
    out.push(coords);
    return;
  }
  for (const child of coords) collectLngLatPoints(child, out);
}

// Computes an approximate centroid for a feature to use as camera fly-to target.
export function getFeatureCentroid(feature) {
  const points = [];
  collectLngLatPoints(feature.geometry && feature.geometry.coordinates, points);
  if (!points.length) return { lat: 0, lng: 0 };

  let latSum = 0;
  let x = 0;
  let y = 0;

  for (const point of points) {
    const lng = Number(point[0]) || 0;
    const lat = Number(point[1]) || 0;
    latSum += lat;
    const rad = (lng * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
  }

  return {
    lat: latSum / points.length,
    lng: (Math.atan2(y, x) * 180) / Math.PI
  };
}
