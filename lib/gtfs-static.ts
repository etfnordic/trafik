import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export type StaticAgency = {
  name: string | null;
};

export type StaticRoute = {
  agencyId: string | null;
  agencyName: string | null;
  shortName: string | null;
  longName: string | null;
  type: number | null;
  color: string | null;
  textColor: string | null;
};

export type StaticTrip = {
  routeId: string | null;
  headsign: string | null;
  directionId: number | null;
  shapeId?: string | null;
  patternId?: string | null;
};

export type StaticStop = {
  name: string | null;
  lat: number | null;
  lon: number | null;
  platformCode: string | null;
  parentStation: string | null;
};

export type StaticMetadata = {
  generatedAt: string | null;
  source: string;
  serviceDates?: string[];
  counts: {
    agencies: number;
    routes: number;
    trips: number;
    stops: number;
    tripAliases?: number;
    patterns?: number;
    shapes?: number;
  };
  agencies: Record<string, StaticAgency>;
  routes: Record<string, StaticRoute>;
  trips: Record<string, StaticTrip>;
  stops: Record<string, StaticStop>;
  tripAliases?: Record<string, string>;
};

export type StaticTripPattern = {
  shapeId: string | null;
  stops: string[];
};

export type StaticTripDetailsIndex = {
  generatedAt: string | null;
  source: string;
  counts: {
    patterns: number;
    shapes: number;
  };
  patterns: Record<string, StaticTripPattern>;
  shapes: Record<string, string>;
};

export type StaticTripDetailStop = StaticStop & {
  id: string;
  sequence: number;
};

export type StaticTripDetails = {
  staticTripId: string;
  route: StaticRoute | null;
  trip: StaticTrip;
  patternId: string | null;
  shapeId: string | null;
  lineCoordinates: Array<[number, number]>;
  stops: StaticTripDetailStop[];
  generatedAt: string | null;
};

const EMPTY_STATIC_METADATA: StaticMetadata = {
  generatedAt: null,
  source: "GTFS Sweden 3 Static",
  counts: {
    agencies: 0,
    routes: 0,
    trips: 0,
    stops: 0,
    tripAliases: 0
  },
  agencies: {},
  routes: {},
  trips: {},
  stops: {},
  tripAliases: {}
};

const STATIC_METADATA_GZIP_FILE = path.join(
  process.cwd(),
  "data",
  "gtfs-static",
  "metadata.json.gz"
);

const STATIC_METADATA_JSON_FILE = path.join(
  process.cwd(),
  "data",
  "gtfs-static",
  "metadata.json"
);

const STATIC_TRIP_DETAILS_GZIP_FILE = path.join(
  process.cwd(),
  "data",
  "gtfs-static",
  "trip-details.json.gz"
);

const EMPTY_TRIP_DETAILS_INDEX: StaticTripDetailsIndex = {
  generatedAt: null,
  source: "GTFS Sweden 3 Static",
  counts: {
    patterns: 0,
    shapes: 0
  },
  patterns: {},
  shapes: {}
};

let cachedMetadata: StaticMetadata | null = null;
let cachedTripDetailsIndex: StaticTripDetailsIndex | null = null;

export function getStaticMetadata(): StaticMetadata {
  if (cachedMetadata) return cachedMetadata;

  try {
    cachedMetadata = JSON.parse(gunzipSync(readFileSync(STATIC_METADATA_GZIP_FILE)).toString("utf8")) as StaticMetadata;
  } catch {
    try {
      cachedMetadata = JSON.parse(readFileSync(STATIC_METADATA_JSON_FILE, "utf8")) as StaticMetadata;
    } catch {
      cachedMetadata = EMPTY_STATIC_METADATA;
    }
  }

  return cachedMetadata;
}

export function getStaticTripDetails(staticTripId: string): StaticTripDetails | null {
  const metadata = getStaticMetadata();
  const trip = metadata.trips[staticTripId];
  if (!trip) return null;

  const detailsIndex = getStaticTripDetailsIndex();
  const patternId = trip.patternId ?? null;
  const pattern = patternId ? detailsIndex.patterns[patternId] ?? null : null;
  const shapeId = pattern?.shapeId ?? trip.shapeId ?? null;
  const encodedShape = shapeId ? detailsIndex.shapes[shapeId] : null;
  const stops = (pattern?.stops ?? [])
    .map((stopId, index): StaticTripDetailStop | null => {
      const stop = metadata.stops[stopId];
      if (!stop) return null;

      return {
        id: stopId,
        sequence: index + 1,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        platformCode: stop.platformCode,
        parentStation: stop.parentStation
      };
    })
    .filter((stop): stop is StaticTripDetailStop => stop !== null);
  const lineCoordinates = encodedShape
    ? decodePolyline(encodedShape)
    : stopsToLineCoordinates(stops);

  return {
    staticTripId,
    route: trip.routeId ? metadata.routes[trip.routeId] ?? null : null,
    trip,
    patternId,
    shapeId,
    lineCoordinates,
    stops,
    generatedAt: detailsIndex.generatedAt ?? metadata.generatedAt
  };
}

export function findStaticTripMatch(
  tripId: string | null,
  startDate: string | null,
  metadata = getStaticMetadata()
): { id: string; trip: StaticTrip } | null {
  if (!tripId) return null;

  const direct = metadata.trips[tripId];
  if (direct) return { id: tripId, trip: direct };

  const aliasMap = metadata.tripAliases ?? {};
  const aliasKeys = startDate ? [`${startDate}:${tripId}`, tripId] : [tripId];

  for (const aliasKey of aliasKeys) {
    const staticTripId = aliasMap[aliasKey];
    const trip = staticTripId ? metadata.trips[staticTripId] : null;
    if (trip) return { id: staticTripId, trip };
  }

  return null;
}

function getStaticTripDetailsIndex(): StaticTripDetailsIndex {
  if (cachedTripDetailsIndex) return cachedTripDetailsIndex;

  try {
    cachedTripDetailsIndex = JSON.parse(
      gunzipSync(readFileSync(STATIC_TRIP_DETAILS_GZIP_FILE)).toString("utf8")
    ) as StaticTripDetailsIndex;
  } catch {
    cachedTripDetailsIndex = EMPTY_TRIP_DETAILS_INDEX;
  }

  return cachedTripDetailsIndex;
}

function stopsToLineCoordinates(stops: StaticTripDetailStop[]): Array<[number, number]> {
  return stops
    .filter((stop) => typeof stop.lat === "number" && typeof stop.lon === "number")
    .map((stop) => [stop.lon as number, stop.lat as number]);
}

function decodePolyline(value: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < value.length) {
    const decodedLat = decodeSignedNumber(value, index);
    index = decodedLat.nextIndex;
    lat += decodedLat.value;

    const decodedLon = decodeSignedNumber(value, index);
    index = decodedLon.nextIndex;
    lon += decodedLon.value;

    coordinates.push([lon / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function decodeSignedNumber(value: string, startIndex: number) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  let byte = 0;

  do {
    byte = value.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20 && index < value.length);

  return {
    value: result & 1 ? ~(result >> 1) : result >> 1,
    nextIndex: index
  };
}
