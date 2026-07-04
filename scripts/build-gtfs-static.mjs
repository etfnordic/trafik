import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [, , inputDir = ".cache/gtfs-sweden", outputFile = "data/gtfs-static/metadata.json"] =
  process.argv;

const files = {
  agency: path.join(inputDir, "agency.txt"),
  routes: path.join(inputDir, "routes.txt"),
  trips: path.join(inputDir, "trips.txt"),
  stops: path.join(inputDir, "stops.txt")
};

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
  trips[row.trip_id] = {
    routeId: clean(row.route_id),
    headsign: clean(row.trip_headsign),
    directionId: numberOrNull(row.direction_id)
  };
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

const metadata = {
  generatedAt: new Date().toISOString(),
  source: "GTFS Sweden 3 Static",
  counts: {
    agencies: Object.keys(agencies).length,
    routes: Object.keys(routes).length,
    trips: Object.keys(trips).length,
    stops: Object.keys(stops).length
  },
  agencies,
  routes,
  trips,
  stops
};

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(metadata)}\n`);

console.log(
  `Wrote ${outputFile}: ${metadata.counts.routes} routes, ${metadata.counts.trips} trips, ${metadata.counts.stops} stops`
);

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
