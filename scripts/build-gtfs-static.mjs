import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const gzipAsync = promisify(gzip);

const [
  ,
  ,
  inputDir = ".cache/gtfs-sweden",
  outputFile = "data/gtfs-static/metadata.json.gz",
  detailsOutputFile = "data/gtfs-static/trip-details.json.gz"
] =
  process.argv;

const files = {
  agency: path.join(inputDir, "agency.txt"),
  routes: path.join(inputDir, "routes.txt"),
  trips: path.join(inputDir, "trips.txt"),
  stops: path.join(inputDir, "stops.txt"),
  stopTimes: path.join(inputDir, "stop_times.txt"),
  shapes: path.join(inputDir, "shapes.txt")
};

const serviceDates = serviceDateKeys();
const tripAliasCandidates = new Map();
const tripAliasConflicts = new Set();
const patternCandidates = new Map();
const patterns = {};
const shapeIdsToKeep = new Set();

const agencies = Object.fromEntries(
  (await readTable(files.agency)).map((row) => [
    row.agency_id || "default",
    {
      name: clean(row.agency_name)
    }
  ])
);

const routes = {};
for (const row of await readTable(files.routes)) {
  if (!row.route_id) continue;
  const agencyId = clean(row.agency_id);
  routes[row.route_id] = {
    agencyId,
    agencyName: agencyId ? agencies[agencyId]?.name ?? null : null,
    shortName: clean(row.route_short_name),
    longName: clean(row.route_long_name),
    type: numberOrNull(row.route_type),
    color: normalizeColor(row.route_color),
    textColor: normalizeColor(row.route_text_color)
  };
}

const trips = {};
for (const row of await readTable(files.trips)) {
  if (!row.trip_id) continue;
  const tripId = row.trip_id;
  const internalTripNumber = clean(row.samtrafiken_internal_trip_number);
  const tripShortName = clean(row.trip_short_name);
  trips[row.trip_id] = {
    routeId: clean(row.route_id),
    headsign: clean(row.trip_headsign),
    directionId: numberOrNull(row.direction_id),
    shapeId: clean(row.shape_id),
    patternId: null
  };
  addTripAlias(compactNumericTripId(tripId), tripId);
  addTripAlias(internalTripNumber, tripId);
  addTripAlias(tripShortName, tripId);
}

const stops = {};
for (const row of await readTable(files.stops)) {
  if (!row.stop_id) continue;
  stops[row.stop_id] = {
    name: clean(row.stop_name),
    lat: numberOrNull(row.stop_lat),
    lon: numberOrNull(row.stop_lon),
    platformCode: clean(row.platform_code),
    parentStation: clean(row.parent_station)
  };
}

await readStopPatterns(files.stopTimes);
const shapes = await readShapes(files.shapes);

const tripAliases = Object.fromEntries([...tripAliasCandidates.entries()].sort());

const metadata = {
  generatedAt: new Date().toISOString(),
  source: "GTFS Sweden 3 Static",
  serviceDates,
  counts: {
    agencies: Object.keys(agencies).length,
    routes: Object.keys(routes).length,
    trips: Object.keys(trips).length,
    stops: Object.keys(stops).length,
    tripAliases: Object.keys(tripAliases).length,
    patterns: Object.keys(patterns).length,
    shapes: Object.keys(shapes).length
  },
  agencies,
  routes,
  trips,
  stops,
  tripAliases
};

const details = {
  generatedAt: metadata.generatedAt,
  source: "GTFS Sweden 3 Static",
  counts: {
    patterns: Object.keys(patterns).length,
    shapes: Object.keys(shapes).length
  },
  patterns,
  shapes
};

await mkdir(path.dirname(outputFile), { recursive: true });
const json = `${JSON.stringify(metadata)}\n`;
const output = outputFile.endsWith(".gz") ? await gzipAsync(json, { level: 9 }) : json;
await writeFile(outputFile, output);

await mkdir(path.dirname(detailsOutputFile), { recursive: true });
const detailsJson = `${JSON.stringify(details)}\n`;
const detailsOutput = detailsOutputFile.endsWith(".gz")
  ? await gzipAsync(detailsJson, { level: 9 })
  : detailsJson;
await writeFile(detailsOutputFile, detailsOutput);

console.log(
  `Wrote ${outputFile}: ${metadata.counts.routes} routes, ${metadata.counts.trips} trips, ${metadata.counts.stops} stops, ${metadata.counts.patterns} patterns`
);
console.log(`Wrote ${detailsOutputFile}: ${details.counts.patterns} patterns, ${details.counts.shapes} shapes`);

async function readStopPatterns(file) {
  const stream = createReadStream(file, "utf8");
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let headers = null;
  let tripIdIndex = -1;
  let stopIdIndex = -1;
  let sequenceIndex = -1;
  let currentTripId = null;
  let currentStops = [];

  for await (const line of lines) {
    if (!headers) {
      headers = line.split(",");
      tripIdIndex = headers.indexOf("trip_id");
      stopIdIndex = headers.indexOf("stop_id");
      sequenceIndex = headers.indexOf("stop_sequence");
      continue;
    }

    const values = line.split(",");
    const tripId = clean(values[tripIdIndex]);
    if (!tripId || !trips[tripId]) continue;

    if (currentTripId && tripId !== currentTripId) {
      finalizeStopPattern(currentTripId, currentStops);
      currentStops = [];
    }

    currentTripId = tripId;
    currentStops.push({
      stopId: clean(values[stopIdIndex]),
      sequence: numberOrNull(values[sequenceIndex])
    });
  }

  if (currentTripId) {
    finalizeStopPattern(currentTripId, currentStops);
  }
}

function finalizeStopPattern(tripId, stopsForTrip) {
  const trip = trips[tripId];
  if (!trip) return;

  const orderedStops = stopsForTrip
    .filter((stop) => stop.stopId)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((stop) => stop.stopId);

  if (orderedStops.length === 0) return;

  const key = `${trip.shapeId ?? ""}|${orderedStops.join(",")}`;
  let patternId = patternCandidates.get(key);

  if (!patternId) {
    patternId = patternKey(patternCandidates.size);
    patternCandidates.set(key, patternId);
    patterns[patternId] = {
      shapeId: trip.shapeId,
      stops: orderedStops
    };

    if (trip.shapeId) {
      shapeIdsToKeep.add(trip.shapeId);
    }
  }

  trip.patternId = patternId;
}

async function readShapes(file) {
  const stream = createReadStream(file, "utf8");
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  const outputShapes = {};
  let headers = null;
  let shapeIdIndex = -1;
  let latIndex = -1;
  let lonIndex = -1;
  let sequenceIndex = -1;
  let currentShapeId = null;
  let currentPoints = [];

  for await (const line of lines) {
    if (!headers) {
      headers = line.split(",");
      shapeIdIndex = headers.indexOf("shape_id");
      latIndex = headers.indexOf("shape_pt_lat");
      lonIndex = headers.indexOf("shape_pt_lon");
      sequenceIndex = headers.indexOf("shape_pt_sequence");
      continue;
    }

    const values = line.split(",");
    const shapeId = clean(values[shapeIdIndex]);
    if (!shapeId) continue;

    if (currentShapeId && shapeId !== currentShapeId) {
      finalizeShape(currentShapeId, currentPoints, outputShapes);
      currentPoints = [];
    }

    currentShapeId = shapeId;

    if (shapeIdsToKeep.has(shapeId)) {
      currentPoints.push({
        lat: numberOrNull(values[latIndex]),
        lon: numberOrNull(values[lonIndex]),
        sequence: numberOrNull(values[sequenceIndex])
      });
    }
  }

  if (currentShapeId) {
    finalizeShape(currentShapeId, currentPoints, outputShapes);
  }

  return outputShapes;
}

function finalizeShape(shapeId, points, outputShapes) {
  if (!shapeIdsToKeep.has(shapeId) || points.length < 2) return;

  const coordinates = points
    .filter((point) => point.lat !== null && point.lon !== null)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((point) => [point.lat, point.lon]);

  if (coordinates.length < 2) return;

  outputShapes[shapeId] = encodePolyline(simplifyLine(coordinates, 0.00008));
}

async function readTable(file) {
  const text = await readFile(file, "utf8");
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((value) => value.length > 0));
}

function parseCsvLine(line) {
  return parseCsv(`${line}\n`)[0] ?? [];
}

function clean(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function numberOrNull(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeColor(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const hex = trimmed.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
}

function addTripAlias(alias, tripId) {
  if (!alias || !tripId || alias === tripId || tripAliasConflicts.has(alias)) return;
  const current = tripAliasCandidates.get(alias);
  if (current && current !== tripId) {
    tripAliasCandidates.delete(alias);
    tripAliasConflicts.add(alias);
    return;
  }
  tripAliasCandidates.set(alias, tripId);
}

function patternKey(index) {
  return index.toString(36);
}

function compactNumericTripId(tripId) {
  if (!/^\d{18}$/.test(tripId)) return null;
  return tripId[1] === "0" ? `${tripId[0]}${tripId.slice(2)}` : null;
}

function simplifyLine(points, tolerance) {
  if (points.length <= 2) return points;

  const sqTolerance = tolerance * tolerance;
  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (squaredDistance(point, previous) > sqTolerance) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);

  if (simplified.length <= 2) return simplified;
  return simplifyDouglasPeucker(simplified, sqTolerance);
}

function simplifyDouglasPeucker(points, sqTolerance) {
  const markers = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  markers[0] = 1;
  markers[points.length - 1] = 1;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxSqDistance = 0;
    let index = 0;

    for (let current = first + 1; current < last; current += 1) {
      const sqDistance = squaredSegmentDistance(points[current], points[first], points[last]);
      if (sqDistance > maxSqDistance) {
        index = current;
        maxSqDistance = sqDistance;
      }
    }

    if (maxSqDistance > sqTolerance) {
      markers[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => markers[index]);
}

function squaredDistance(a, b) {
  const deltaLat = a[0] - b[0];
  const deltaLon = a[1] - b[1];
  return deltaLat * deltaLat + deltaLon * deltaLon;
}

function squaredSegmentDistance(point, start, end) {
  let lat = start[0];
  let lon = start[1];
  let deltaLat = end[0] - lat;
  let deltaLon = end[1] - lon;

  if (deltaLat !== 0 || deltaLon !== 0) {
    const t = ((point[0] - lat) * deltaLat + (point[1] - lon) * deltaLon) / (deltaLat * deltaLat + deltaLon * deltaLon);

    if (t > 1) {
      lat = end[0];
      lon = end[1];
    } else if (t > 0) {
      lat += deltaLat * t;
      lon += deltaLon * t;
    }
  }

  deltaLat = point[0] - lat;
  deltaLon = point[1] - lon;
  return deltaLat * deltaLat + deltaLon * deltaLon;
}

function encodePolyline(points) {
  let previousLat = 0;
  let previousLon = 0;
  let output = "";

  for (const point of points) {
    const lat = Math.round(point[0] * 1e5);
    const lon = Math.round(point[1] * 1e5);
    output += encodeSignedNumber(lat - previousLat);
    output += encodeSignedNumber(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }

  return output;
}

function encodeSignedNumber(value) {
  let coordinate = value < 0 ? ~(value << 1) : value << 1;
  let output = "";

  while (coordinate >= 0x20) {
    output += String.fromCharCode((0x20 | (coordinate & 0x1f)) + 63);
    coordinate >>= 5;
  }

  return output + String.fromCharCode(coordinate + 63);
}

function serviceDateKeys() {
  return [-1, 0, 1, 2].map((offsetDays) => {
    const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}${values.month}${values.day}`;
  });
}
