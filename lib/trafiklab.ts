import { transit_realtime } from "gtfs-realtime-bindings";
import { getStaticMetadata, type StaticMetadata, type StaticRoute, type StaticTrip } from "@/lib/gtfs-static";

export type FeedKind = "vehicles" | "tripUpdates" | "alerts";

export type OperatorId =
  | "blekinge"
  | "dintur"
  | "dt"
  | "gotland"
  | "halland"
  | "jlt"
  | "klt"
  | "krono"
  | "orebro"
  | "otraf"
  | "skane"
  | "sl"
  | "ul"
  | "varm"
  | "vastmanland"
  | "xt";

export type FeedStatusValue = "ok" | "not_modified" | "error" | "missing_key" | "unavailable";

export type FeedStatus = {
  operatorId: OperatorId;
  operatorName: string;
  feed: FeedKind;
  status: FeedStatusValue;
  itemCount: number;
  updatedAt: string | null;
  message?: string;
  httpStatus?: number;
};

export type StaticDataSummary = {
  available: boolean;
  generatedAt: string | null;
  source: string;
  counts: StaticMetadata["counts"];
};

export type Vehicle = {
  id: string;
  operator: OperatorId;
  operatorName: string;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  routeId: string | null;
  tripId: string | null;
  startDate: string | null;
  timestamp: string | null;
  source: "gtfs-sweden-3";
  vehicleType: "train" | "bus" | "tram" | "ferry" | "unknown";
  routeShortName: string | null;
  routeLongName: string | null;
  routeColor: string | null;
  routeTextColor: string | null;
  agencyName: string | null;
  tripHeadsign: string | null;
  staticTripId: string | null;
  directionId: number | null;
};

export type StopTimePrediction = {
  stopId: string | null;
  stopName: string | null;
  platformCode: string | null;
  stopLat: number | null;
  stopLon: number | null;
  stopSequence: number | null;
  arrivalDelaySeconds: number | null;
  departureDelaySeconds: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
  scheduleRelationship: string | null;
};

export type TripUpdate = {
  id: string;
  operator: OperatorId;
  operatorName: string;
  tripId: string | null;
  startDate: string | null;
  routeId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeColor: string | null;
  routeTextColor: string | null;
  agencyName: string | null;
  tripHeadsign: string | null;
  staticTripId: string | null;
  directionId: number | null;
  vehicleId: string | null;
  timestamp: string | null;
  delaySeconds: number | null;
  scheduleRelationship: string | null;
  stopTimeUpdates: StopTimePrediction[];
  source: "gtfs-sweden-3";
};

export type TrafficAlert = {
  id: string;
  operator: OperatorId;
  operatorName: string;
  cause: string | null;
  effect: string | null;
  severity: string | null;
  header: string;
  description: string | null;
  activePeriods: Array<{ start: string | null; end: string | null }>;
  informedEntities: Array<{
    agencyId: string | null;
    routeId: string | null;
    stopId: string | null;
    tripId: string | null;
  }>;
  source: "gtfs-sweden-3";
};

export type OperatorSummary = {
  id: OperatorId;
  name: string;
  supports: Record<FeedKind, boolean>;
  vehicleCount: number;
  tripUpdateCount: number;
  alertCount: number;
  statuses: Record<FeedKind, FeedStatusValue>;
};

export type VehiclesResponse = {
  generatedAt: string;
  hasApiKey: boolean;
  keySource: string | null;
  total: number;
  vehicles: Vehicle[];
  operators: OperatorSummary[];
  statuses: FeedStatus[];
  staticData: StaticDataSummary;
  coverageNote: string;
};

export type TripUpdatesResponse = {
  generatedAt: string;
  hasApiKey: boolean;
  keySource: string | null;
  total: number;
  tripUpdates: TripUpdate[];
  statuses: FeedStatus[];
  staticData: StaticDataSummary;
  coverageNote: string;
};

export type AlertsResponse = {
  generatedAt: string;
  hasApiKey: boolean;
  keySource: string | null;
  total: number;
  alerts: TrafficAlert[];
  statuses: FeedStatus[];
  coverageNote: string;
};

type OperatorConfig = {
  id: OperatorId;
  name: string;
  supports: Record<FeedKind, boolean>;
};

type FeedCache<T> = {
  etag?: string;
  lastModified?: string;
  items: T[];
  updatedAt: string | null;
};

type FeedResult<T> = {
  operator: OperatorConfig;
  items: T[];
  status: FeedStatus;
};

const BASE_URL = "https://opendata.samtrafiken.se/gtfs-rt-sweden";

const FEED_FILES: Record<FeedKind, string> = {
  vehicles: "VehiclePositionsSweden.pb",
  tripUpdates: "TripUpdatesSweden.pb",
  alerts: "ServiceAlertsSweden.pb"
};

export const POLLING_SECONDS: Record<FeedKind, number> = {
  vehicles: 3,
  tripUpdates: 20,
  alerts: 60
};

export const OPERATORS: OperatorConfig[] = [
  { id: "sl", name: "SL", supports: support(true, true, true) },
  { id: "ul", name: "UL", supports: support(true, true, true) },
  { id: "otraf", name: "Östgötatrafiken", supports: support(true, true, true) },
  { id: "jlt", name: "Jönköpings Länstrafik", supports: support(true, true, true) },
  { id: "krono", name: "Kronobergs Länstrafik", supports: support(true, true, true) },
  { id: "klt", name: "Kalmar Länstrafik", supports: support(true, true, true) },
  { id: "gotland", name: "Gotland", supports: support(true, true, true) },
  { id: "blekinge", name: "Blekingetrafiken", supports: support(true, true, true) },
  { id: "skane", name: "Skånetrafiken", supports: support(true, true, true) },
  { id: "halland", name: "Hallandstrafiken", supports: support(false, true, true) },
  { id: "varm", name: "Värmlandstrafiken", supports: support(true, true, true) },
  { id: "orebro", name: "Länstrafiken Örebro", supports: support(true, true, true) },
  { id: "vastmanland", name: "Västmanlands Lokaltrafik", supports: support(true, true, true) },
  { id: "dt", name: "Dalatrafik", supports: support(true, true, true) },
  { id: "xt", name: "X-trafik", supports: support(true, true, true) },
  { id: "dintur", name: "Din Tur", supports: support(true, true, true) }
];

const caches: Record<FeedKind, Map<OperatorId, FeedCache<unknown>>> = {
  vehicles: new Map(),
  tripUpdates: new Map(),
  alerts: new Map()
};

export async function getVehiclePositions(): Promise<VehiclesResponse> {
  const keyInfo = getRealtimeApiKey();
  const staticMetadata = getStaticMetadata();
  const results = await getFeedResults("vehicles", normalizeVehicles, staticMetadata);
  const vehicles = results.flatMap((result) => result.items);

  return {
    generatedAt: new Date().toISOString(),
    hasApiKey: Boolean(keyInfo.value),
    keySource: keyInfo.source,
    total: vehicles.length,
    vehicles,
    operators: buildOperatorSummaries({ vehicles: results }),
    statuses: results.map((result) => result.status),
    staticData: buildStaticDataSummary(staticMetadata),
    coverageNote:
      "Kartan visar verkliga livepositioner från GTFS Sweden 3. Operatörer utan VehiclePositions visas inte som fordon."
  };
}

export async function getTripUpdates(): Promise<TripUpdatesResponse> {
  const keyInfo = getRealtimeApiKey();
  const staticMetadata = getStaticMetadata();
  const results = await getFeedResults("tripUpdates", normalizeTripUpdates, staticMetadata);
  const tripUpdates = results.flatMap((result) => result.items);

  return {
    generatedAt: new Date().toISOString(),
    hasApiKey: Boolean(keyInfo.value),
    keySource: keyInfo.source,
    total: tripUpdates.length,
    tripUpdates,
    statuses: results.map((result) => result.status),
    staticData: buildStaticDataSummary(staticMetadata),
    coverageNote:
      "TripUpdates innehåller prognoser, inställda turer och förseningar där operatören publicerar dem."
  };
}

export async function getServiceAlerts(): Promise<AlertsResponse> {
  const keyInfo = getRealtimeApiKey();
  const results = await getFeedResults("alerts", normalizeAlerts);
  const alerts = results.flatMap((result) => result.items);

  return {
    generatedAt: new Date().toISOString(),
    hasApiKey: Boolean(keyInfo.value),
    keySource: keyInfo.source,
    total: alerts.length,
    alerts,
    statuses: results.map((result) => result.status),
    coverageNote:
      "ServiceAlerts innehåller störningar, avvikelser och trafikmeddelanden där operatören publicerar dem."
  };
}

async function getFeedResults<T>(
  feed: FeedKind,
  normalize: (
    feedMessage: transit_realtime.IFeedMessage,
    operator: OperatorConfig,
    staticMetadata: StaticMetadata
  ) => T[],
  staticMetadata = getStaticMetadata()
): Promise<Array<FeedResult<T>>> {
  const { value: apiKey } = getRealtimeApiKey();
  const operators = OPERATORS.filter((operator) => operator.supports[feed]);

  if (!apiKey) {
    return operators.map((operator) => ({
      operator,
      items: [],
      status: {
        operatorId: operator.id,
        operatorName: operator.name,
        feed,
        status: "missing_key",
        itemCount: 0,
        updatedAt: null,
        message: "TRAFIKLAB_API_KEY saknas."
      }
    }));
  }

  return Promise.all(
    operators.map((operator) => fetchOperatorFeed(operator, feed, apiKey, normalize, staticMetadata))
  );
}

async function fetchOperatorFeed<T>(
  operator: OperatorConfig,
  feed: FeedKind,
  apiKey: string,
  normalize: (
    feedMessage: transit_realtime.IFeedMessage,
    operator: OperatorConfig,
    staticMetadata: StaticMetadata
  ) => T[],
  staticMetadata: StaticMetadata
): Promise<FeedResult<T>> {
  const cache = caches[feed].get(operator.id) as FeedCache<T> | undefined;
  const headers: HeadersInit = {};

  if (cache?.etag) headers["If-None-Match"] = cache.etag;
  if (cache?.lastModified) headers["If-Modified-Since"] = cache.lastModified;

  try {
    const url = `${BASE_URL}/${operator.id}/${FEED_FILES[feed]}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      next: { revalidate: 0 }
    });

    if (response.status === 304 && cache) {
      return {
        operator,
        items: cache.items,
        status: buildStatus(operator, feed, "not_modified", cache.items.length, cache.updatedAt, {
          httpStatus: response.status
        })
      };
    }

    if (!response.ok) {
      return {
        operator,
        items: cache?.items ?? [],
        status: buildStatus(
          operator,
          feed,
          "error",
          cache?.items.length ?? 0,
          cache?.updatedAt ?? null,
          {
            httpStatus: response.status,
            message: await safeErrorMessage(response)
          }
        )
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoded = transit_realtime.FeedMessage.decode(new Uint8Array(arrayBuffer));
    const normalizedFeed = transit_realtime.FeedMessage.toObject(decoded, {
      longs: Number,
      enums: String
    }) as transit_realtime.IFeedMessage;
    const items = normalize(normalizedFeed, operator, staticMetadata);
    const updatedAt = new Date().toISOString();

    caches[feed].set(operator.id, {
      etag: response.headers.get("etag") ?? undefined,
      lastModified: response.headers.get("last-modified") ?? undefined,
      items,
      updatedAt
    } as FeedCache<unknown>);

    return {
      operator,
      items,
      status: buildStatus(operator, feed, "ok", items.length, updatedAt, {
        httpStatus: response.status
      })
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Okänt fel vid hämtning.";

    return {
      operator,
      items: cache?.items ?? [],
      status: buildStatus(operator, feed, "error", cache?.items.length ?? 0, cache?.updatedAt ?? null, {
        message
      })
    };
  }
}

function normalizeVehicles(
  feed: transit_realtime.IFeedMessage,
  operator: OperatorConfig,
  staticMetadata: StaticMetadata
): Vehicle[] {
  return (feed.entity ?? [])
    .map((entity): Vehicle | null => {
      const vehicle = entity.vehicle;
      const position = vehicle?.position;

      if (!vehicle || !position || !isValidCoordinate(position.latitude, position.longitude)) {
        return null;
      }

      const timestamp = numberOrNull(vehicle.timestamp);
      const routeId = vehicle.trip?.routeId ?? null;
      const tripId = vehicle.trip?.tripId ?? null;
      const startDate = stringOrNull(vehicle.trip?.startDate);
      const tripMatch = lookupTripMatch(staticMetadata, tripId, startDate);
      const trip = tripMatch?.trip ?? null;
      const route = lookupRoute(staticMetadata, routeId ?? trip?.routeId ?? null);
      const resolvedRouteId = routeId ?? trip?.routeId ?? null;
      const routeDetails = routeDetailsFrom(route);
      const vehicleId = vehicle.vehicle?.id ?? vehicle.vehicle?.label ?? entity.id ?? tripId;
      const id = `${operator.id}:${vehicleId ?? `${position.latitude},${position.longitude}`}`;

      return {
        id,
        operator: operator.id,
        operatorName: operator.name,
        lat: position.latitude,
        lon: position.longitude,
        bearing: numberOrNull(position.bearing),
        speed: numberOrNull(position.speed),
        routeId: resolvedRouteId,
        tripId,
        startDate,
        timestamp: timestamp ? epochSecondsToIso(timestamp) : null,
        source: "gtfs-sweden-3",
        vehicleType: inferVehicleType(resolvedRouteId, route?.type ?? null),
        routeShortName: routeDetails.routeShortName,
        routeLongName: routeDetails.routeLongName,
        routeColor: routeDetails.routeColor,
        routeTextColor: routeDetails.routeTextColor,
        agencyName: routeDetails.agencyName,
        tripHeadsign: trip?.headsign ?? null,
        staticTripId: tripMatch?.id ?? null,
        directionId: trip?.directionId ?? null
      };
    })
    .filter((vehicle): vehicle is Vehicle => vehicle !== null);
}

function normalizeTripUpdates(
  feed: transit_realtime.IFeedMessage,
  operator: OperatorConfig,
  staticMetadata: StaticMetadata
): TripUpdate[] {
  return (feed.entity ?? [])
    .map((entity): TripUpdate | null => {
      const tripUpdate = entity.tripUpdate;
      if (!tripUpdate) return null;

      const stopTimeUpdates = (tripUpdate.stopTimeUpdate ?? []).map((stopTimeUpdate) => {
        const stopId = stopTimeUpdate.stopId ?? null;
        const stop = stopId ? staticMetadata.stops[stopId] ?? null : null;
        const arrivalDelaySeconds = numberOrNull(stopTimeUpdate.arrival?.delay);
        const departureDelaySeconds = numberOrNull(stopTimeUpdate.departure?.delay);
        const arrivalTime = numberOrNull(stopTimeUpdate.arrival?.time);
        const departureTime = numberOrNull(stopTimeUpdate.departure?.time);

        return {
          stopId,
          stopName: stop?.name ?? null,
          platformCode: stop?.platformCode ?? null,
          stopLat: stop?.lat ?? null,
          stopLon: stop?.lon ?? null,
          stopSequence: numberOrNull(stopTimeUpdate.stopSequence),
          arrivalDelaySeconds,
          departureDelaySeconds,
          arrivalTime: arrivalTime ? epochSecondsToIso(arrivalTime) : null,
          departureTime: departureTime ? epochSecondsToIso(departureTime) : null,
          scheduleRelationship: stringOrNull(stopTimeUpdate.scheduleRelationship)
        };
      });

      const timestamp = numberOrNull(tripUpdate.timestamp);
      const delaySeconds = firstNumber(
        stopTimeUpdates.map((update) => update.departureDelaySeconds ?? update.arrivalDelaySeconds)
      );
      const tripId = tripUpdate.trip?.tripId ?? null;
      const startDate = stringOrNull(tripUpdate.trip?.startDate);
      const routeId = tripUpdate.trip?.routeId ?? null;
      const tripMatch = lookupTripMatch(staticMetadata, tripId, startDate);
      const trip = tripMatch?.trip ?? null;
      const resolvedRouteId = routeId ?? trip?.routeId ?? null;
      const route = lookupRoute(staticMetadata, resolvedRouteId);
      const routeDetails = routeDetailsFrom(route);
      const vehicleId = tripUpdate.vehicle?.id ?? tripUpdate.vehicle?.label ?? null;

      return {
        id: `${operator.id}:${entity.id ?? tripId ?? routeId ?? "trip-update"}`,
        operator: operator.id,
        operatorName: operator.name,
        tripId,
        startDate,
        routeId: resolvedRouteId,
        routeShortName: routeDetails.routeShortName,
        routeLongName: routeDetails.routeLongName,
        routeColor: routeDetails.routeColor,
        routeTextColor: routeDetails.routeTextColor,
        agencyName: routeDetails.agencyName,
        tripHeadsign: trip?.headsign ?? null,
        staticTripId: tripMatch?.id ?? null,
        directionId: trip?.directionId ?? null,
        vehicleId,
        timestamp: timestamp ? epochSecondsToIso(timestamp) : null,
        delaySeconds,
        scheduleRelationship: stringOrNull(tripUpdate.trip?.scheduleRelationship),
        stopTimeUpdates,
        source: "gtfs-sweden-3"
      };
    })
    .filter((tripUpdate): tripUpdate is TripUpdate => tripUpdate !== null);
}

function normalizeAlerts(
  feed: transit_realtime.IFeedMessage,
  operator: OperatorConfig
): TrafficAlert[] {
  return (feed.entity ?? [])
    .map((entity): TrafficAlert | null => {
      const alert = entity.alert;
      if (!alert) return null;

      const header = translatedText(alert.headerText) ?? "Trafikmeddelande";

      return {
        id: `${operator.id}:${entity.id ?? header}`,
        operator: operator.id,
        operatorName: operator.name,
        cause: stringOrNull(alert.cause),
        effect: stringOrNull(alert.effect),
        severity: stringOrNull(alert.severityLevel),
        header,
        description: translatedText(alert.descriptionText),
        activePeriods: (alert.activePeriod ?? []).map((period) => ({
          start: numberOrNull(period.start) ? epochSecondsToIso(numberOrNull(period.start) as number) : null,
          end: numberOrNull(period.end) ? epochSecondsToIso(numberOrNull(period.end) as number) : null
        })),
        informedEntities: (alert.informedEntity ?? []).map((entitySelector) => ({
          agencyId: entitySelector.agencyId ?? null,
          routeId: entitySelector.routeId ?? null,
          stopId: entitySelector.stopId ?? null,
          tripId: entitySelector.trip?.tripId ?? null
        })),
        source: "gtfs-sweden-3"
      };
    })
    .filter((alert): alert is TrafficAlert => alert !== null);
}

function buildStaticDataSummary(staticMetadata: StaticMetadata): StaticDataSummary {
  return {
    available: Boolean(staticMetadata.generatedAt && staticMetadata.counts.routes > 0),
    generatedAt: staticMetadata.generatedAt,
    source: staticMetadata.source,
    counts: staticMetadata.counts
  };
}

function lookupTripMatch(
  staticMetadata: StaticMetadata,
  tripId: string | null,
  startDate: string | null
): { id: string; trip: StaticTrip } | null {
  if (!tripId) return null;

  const direct = staticMetadata.trips[tripId];
  if (direct) return { id: tripId, trip: direct };

  const aliasMap = staticMetadata.tripAliases ?? {};
  const aliasKeys = startDate ? [`${startDate}:${tripId}`, tripId] : [tripId];

  for (const aliasKey of aliasKeys) {
    const staticTripId = aliasMap[aliasKey];
    const trip = staticTripId ? staticMetadata.trips[staticTripId] : null;
    if (trip) return { id: staticTripId, trip };
  }

  return null;
}

function lookupRoute(staticMetadata: StaticMetadata, routeId: string | null): StaticRoute | null {
  if (!routeId) return null;
  return staticMetadata.routes[routeId] ?? null;
}

function routeDetailsFrom(route: StaticRoute | null) {
  return {
    routeShortName: route?.shortName ?? null,
    routeLongName: route?.longName ?? null,
    routeColor: cssColorFromGtfsHex(route?.color),
    routeTextColor: cssColorFromGtfsHex(route?.textColor),
    agencyName: route?.agencyName ?? null
  };
}

function buildOperatorSummaries(results: {
  vehicles?: Array<FeedResult<Vehicle>>;
  tripUpdates?: Array<FeedResult<TripUpdate>>;
  alerts?: Array<FeedResult<TrafficAlert>>;
}): OperatorSummary[] {
  return OPERATORS.map((operator) => {
    const vehicleResult = results.vehicles?.find((result) => result.operator.id === operator.id);
    const tripUpdateResult = results.tripUpdates?.find((result) => result.operator.id === operator.id);
    const alertResult = results.alerts?.find((result) => result.operator.id === operator.id);

    return {
      id: operator.id,
      name: operator.name,
      supports: operator.supports,
      vehicleCount: vehicleResult?.items.length ?? 0,
      tripUpdateCount: tripUpdateResult?.items.length ?? 0,
      alertCount: alertResult?.items.length ?? 0,
      statuses: {
        vehicles: operator.supports.vehicles
          ? vehicleResult?.status.status ?? "error"
          : "unavailable",
        tripUpdates: operator.supports.tripUpdates
          ? tripUpdateResult?.status.status ?? "unavailable"
          : "unavailable",
        alerts: operator.supports.alerts
          ? alertResult?.status.status ?? "unavailable"
          : "unavailable"
      }
    };
  });
}

function buildStatus(
  operator: OperatorConfig,
  feed: FeedKind,
  status: FeedStatusValue,
  itemCount: number,
  updatedAt: string | null,
  options: { message?: string; httpStatus?: number } = {}
): FeedStatus {
  return {
    operatorId: operator.id,
    operatorName: operator.name,
    feed,
    status,
    itemCount,
    updatedAt,
    message: options.message,
    httpStatus: options.httpStatus
  };
}

function support(
  vehicles: boolean,
  tripUpdates: boolean,
  alerts: boolean
): Record<FeedKind, boolean> {
  return { vehicles, tripUpdates, alerts };
}

function translatedText(
  text: transit_realtime.ITranslatedString | null | undefined
): string | null {
  const translations = text?.translation ?? [];
  const swedish = translations.find((translation) =>
    translation.language?.toLowerCase().startsWith("sv")
  );
  const english = translations.find((translation) =>
    translation.language?.toLowerCase().startsWith("en")
  );
  return swedish?.text ?? english?.text ?? translations[0]?.text ?? null;
}

function inferVehicleType(routeId: string | null, routeType: number | null): Vehicle["vehicleType"] {
  const typeFromStatic = vehicleTypeFromRouteType(routeType);
  if (typeFromStatic) return typeFromStatic;
  if (!routeId) return "unknown";
  const lowerRouteId = routeId.toLowerCase();

  if (
    lowerRouteId.includes("train") ||
    lowerRouteId.includes("rail") ||
    lowerRouteId.includes("tag") ||
    lowerRouteId.includes("metro") ||
    lowerRouteId.includes("tunnelbana")
  ) {
    return "train";
  }

  if (lowerRouteId.includes("tram") || lowerRouteId.includes("sparvagn")) {
    return "tram";
  }

  if (lowerRouteId.includes("boat") || lowerRouteId.includes("ship") || lowerRouteId.includes("ferry")) {
    return "ferry";
  }

  if (lowerRouteId.includes("bus")) {
    return "bus";
  }

  return "unknown";
}

function vehicleTypeFromRouteType(routeType: number | null): Vehicle["vehicleType"] | null {
  if (routeType === null) return null;
  if (routeType === 0 || (routeType >= 900 && routeType < 1000)) return "tram";
  if (
    routeType === 1 ||
    routeType === 2 ||
    (routeType >= 100 && routeType < 200) ||
    (routeType >= 400 && routeType < 500)
  ) {
    return "train";
  }
  if (routeType === 3 || routeType === 11 || (routeType >= 200 && routeType < 300) || (routeType >= 700 && routeType < 800)) {
    return "bus";
  }
  if (routeType === 4 || (routeType >= 1000 && routeType < 1100)) return "ferry";
  return null;
}

function isValidCoordinate(lat?: number | null, lon?: number | null) {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 55 &&
    lat <= 70 &&
    lon >= 10 &&
    lon <= 25
  );
}

function numberOrNull(value?: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  if (typeof value === "object" && "toString" in value) {
    const numeric = Number(value.toString());
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function stringOrNull(value?: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function cssColorFromGtfsHex(value?: string | null): string | null {
  const normalized = value?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized) ? `#${normalized}` : null;
}

function firstNumber(values: Array<number | null | undefined>): number | null {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null;
}

function epochSecondsToIso(seconds: number) {
  return new Date(seconds * 1000).toISOString();
}

async function safeErrorMessage(response: Response) {
  try {
    const text = await response.text();
    if (!text) return response.statusText;
    return redactSecrets(text).slice(0, 240);
  } catch {
    return response.statusText;
  }
}

function getRealtimeApiKey(): { value: string | undefined; source: string | null } {
  const candidates = [
    ["TRAFIKLAB_REALTIME_API_KEY", process.env.TRAFIKLAB_REALTIME_API_KEY],
    ["TRAFIKLAB_API_KEY", process.env.TRAFIKLAB_API_KEY]
  ] as const;
  const match = candidates.find(([, value]) => Boolean(value?.trim()));

  return {
    value: match?.[1]?.trim(),
    source: match?.[0] ?? null
  };
}

function redactSecrets(text: string) {
  const knownSecrets = [
    process.env.TRAFIKLAB_REALTIME_API_KEY,
    process.env.TRAFIKLAB_STATIC_API_KEY,
    process.env.TRAFIKLAB_API_KEY
  ].filter((value): value is string => Boolean(value));

  return knownSecrets
    .reduce((sanitized, secret) => sanitized.replaceAll(secret, "[redacted]"), text)
    .replace(/Key '[^']+'/gi, "Key '[redacted]'")
    .replace(/[a-f0-9]{24,}/gi, "[redacted]");
}
