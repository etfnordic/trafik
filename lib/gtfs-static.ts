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
  };
  agencies: Record<string, StaticAgency>;
  routes: Record<string, StaticRoute>;
  trips: Record<string, StaticTrip>;
  stops: Record<string, StaticStop>;
  tripAliases?: Record<string, string>;
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

let cachedMetadata: StaticMetadata | null = null;

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
