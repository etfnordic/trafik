"use client";

import {
  AlertTriangle,
  Bus,
  Clock3,
  Filter,
  LocateFixed,
  MapPin,
  RefreshCw,
  Route,
  Ship,
  TrainFront,
  TramFront
} from "lucide-react";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  Popup
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlertsResponse,
  FeedStatus,
  OperatorSummary,
  StopTimePrediction,
  TrafficAlert,
  TripUpdate,
  TripUpdatesResponse,
  Vehicle,
  VehiclesResponse
} from "@/lib/trafiklab";

type ResourceState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

type VehicleProperties = Vehicle & {
  color: string;
  delaySeconds: number | null;
  hasBearing: boolean;
  label: string;
};

type VehicleFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  VehicleProperties
>;

type TripDetailsStop = {
  id: string;
  name: string | null;
  lat: number | null;
  lon: number | null;
  platformCode: string | null;
  parentStation: string | null;
  sequence: number;
};

type TripDetailsResponse = {
  ok: boolean;
  generatedAt: string;
  staticGeneratedAt?: string | null;
  message?: string;
  staticTripId: string | null;
  routeId?: string | null;
  shapeId?: string | null;
  patternId?: string | null;
  headsign?: string | null;
  route?: {
    shortName: string | null;
    longName: string | null;
    type: number | null;
    color: string | null;
    textColor: string | null;
    agencyName: string | null;
  } | null;
  lineCoordinates: Array<[number, number]>;
  stops: TripDetailsStop[];
};

type SelectedRouteProperties = {
  color: string;
};

type SelectedRouteFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.LineString,
  SelectedRouteProperties
>;

type SelectedStopProperties = TripDetailsStop & {
  color: string;
  upcoming: boolean;
  next: boolean;
  predictionTime: string | null;
  delaySeconds: number | null;
};

type SelectedStopsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  SelectedStopProperties
>;

const SWEDEN_CENTER: [number, number] = [15.2, 62.0];
const VEHICLE_SOURCE_ID = "vehicles";
const VEHICLE_DOT_LAYER_ID = "vehicle-dots";
const VEHICLE_ARROW_LAYER_ID = "vehicle-arrows";
const VEHICLE_ARROW_IMAGE_ID = "vehicle-direction-arrow";
const SELECTED_ROUTE_SOURCE_ID = "selected-route";
const SELECTED_ROUTE_HALO_LAYER_ID = "selected-route-halo";
const SELECTED_ROUTE_LAYER_ID = "selected-route-line";
const SELECTED_STOPS_SOURCE_ID = "selected-stops";
const SELECTED_STOP_LAYER_ID = "selected-stop-points";
const SELECTED_STOP_LABEL_LAYER_ID = "selected-stop-labels";
const VEHICLE_REFRESH_MS = 3000;
const TRIP_UPDATE_REFRESH_MS = 20000;
const ALERT_REFRESH_MS = 60000;
const RATE_LIMIT_BACKOFF_MS = 60000;
const DEFAULT_ACTIVE_OPERATORS = [
  "sl",
  "ul",
  "otraf",
  "jlt",
  "krono",
  "klt",
  "gotland",
  "blekinge",
  "skane",
  "halland",
  "varm",
  "orebro",
  "vastmanland",
  "dt",
  "xt",
  "dintur"
] as const;
const configuredVehicleEventMaps = new WeakSet<MapLibreMap>();

const operatorColors: Record<string, string> = {
  blekinge: "#0891b2",
  dintur: "#65a30d",
  dt: "#3b82f6",
  gotland: "#0d9488",
  halland: "#d97706",
  jlt: "#10b981",
  klt: "#7c3aed",
  krono: "#f59e0b",
  orebro: "#ef4444",
  otraf: "#06b6d4",
  skane: "#e11d48",
  sl: "#2563eb",
  ul: "#14b8a6",
  vastmanland: "#8b5cf6",
  varm: "#22c55e",
  xt: "#f97316"
};

const vehicleTypeLabels: Record<Vehicle["vehicleType"], string> = {
  train: "Tåg",
  bus: "Buss",
  tram: "Spårvagn",
  ferry: "Båt",
  unknown: "Okänd typ"
};

export default function LiveTrafficMap() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const hoverPopupRef = useRef<Popup | null>(null);
  const pendingVehicleDataRef = useRef<VehicleFeatureCollection>(emptyFeatureCollection());
  const pendingSelectedRouteDataRef = useRef<SelectedRouteFeatureCollection>(emptyRouteFeatureCollection());
  const pendingSelectedStopsDataRef = useRef<SelectedStopsFeatureCollection>(emptyStopsFeatureCollection());
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [activeOperators, setActiveOperators] = useState<Set<string>>(
    () => new Set(DEFAULT_ACTIVE_OPERATORS)
  );
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [tripDetailsState, setTripDetailsState] = useState<ResourceState<TripDetailsResponse>>({
    loading: false,
    error: null,
    data: null
  });
  const [vehicleState, setVehicleState] = useState<ResourceState<VehiclesResponse>>({
    loading: true,
    error: null,
    data: null
  });
  const [tripUpdateState, setTripUpdateState] = useState<ResourceState<TripUpdatesResponse>>({
    loading: true,
    error: null,
    data: null
  });
  const [alertState, setAlertState] = useState<ResourceState<AlertsResponse>>({
    loading: true,
    error: null,
    data: null
  });

  const activeOperatorQuery = useMemo(
    () => [...activeOperators].sort().join(","),
    [activeOperators]
  );
  const apiUrl = useCallback(
    (path: string) => `${path}?operators=${encodeURIComponent(activeOperatorQuery)}`,
    [activeOperatorQuery]
  );
  const vehicleRefreshMs = hasRateLimitedStatus(vehicleState.data?.statuses)
    ? RATE_LIMIT_BACKOFF_MS
    : VEHICLE_REFRESH_MS;
  const tripUpdateRefreshMs = hasRateLimitedStatus(tripUpdateState.data?.statuses)
    ? RATE_LIMIT_BACKOFF_MS
    : TRIP_UPDATE_REFRESH_MS;
  const alertRefreshMs = hasRateLimitedStatus(alertState.data?.statuses)
    ? RATE_LIMIT_BACKOFF_MS
    : ALERT_REFRESH_MS;

  const loadVehicles = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/vehicles"), { cache: "no-store" });
      if (!response.ok) throw new Error(`Kunde inte hämta fordon (${response.status}).`);
      const data = (await response.json()) as VehiclesResponse;
      setVehicleState({ loading: false, error: null, data });
    } catch (error) {
      setVehicleState((current) => ({
        loading: false,
        error: error instanceof Error ? error.message : "Ett okänt fordonsfel uppstod.",
        data: current.data
      }));
    }
  }, [apiUrl]);

  const loadTripUpdates = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/trip-updates"), { cache: "no-store" });
      if (!response.ok) throw new Error(`Kunde inte hämta prognoser (${response.status}).`);
      const data = (await response.json()) as TripUpdatesResponse;
      setTripUpdateState({ loading: false, error: null, data });
    } catch (error) {
      setTripUpdateState((current) => ({
        loading: false,
        error: error instanceof Error ? error.message : "Ett okänt prognosfel uppstod.",
        data: current.data
      }));
    }
  }, [apiUrl]);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/alerts"), { cache: "no-store" });
      if (!response.ok) throw new Error(`Kunde inte hämta störningar (${response.status}).`);
      const data = (await response.json()) as AlertsResponse;
      setAlertState({ loading: false, error: null, data });
    } catch (error) {
      setAlertState((current) => ({
        loading: false,
        error: error instanceof Error ? error.message : "Ett okänt störningsfel uppstod.",
        data: current.data
      }));
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadVehicles();
    const interval = window.setInterval(() => void loadVehicles(), vehicleRefreshMs);
    return () => window.clearInterval(interval);
  }, [loadVehicles, vehicleRefreshMs]);

  useEffect(() => {
    void loadTripUpdates();
    const interval = window.setInterval(() => void loadTripUpdates(), tripUpdateRefreshMs);
    return () => window.clearInterval(interval);
  }, [loadTripUpdates, tripUpdateRefreshMs]);

  useEffect(() => {
    void loadAlerts();
    const interval = window.setInterval(() => void loadAlerts(), alertRefreshMs);
    return () => window.clearInterval(interval);
  }, [alertRefreshMs, loadAlerts]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapNodeRef.current,
      center: SWEDEN_CENTER,
      zoom: 4.4,
      minZoom: 3.4,
      maxZoom: 17,
      attributionControl: false,
      style: "https://tiles.openfreemap.org/styles/liberty"
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "Data från Trafiklab.se"
      }),
      "bottom-right"
    );

    const markMapReady = () => {
      ensureSelectedTripLayers(
        map,
        pendingSelectedRouteDataRef.current,
        pendingSelectedStopsDataRef.current
      );
      ensureVehicleLayer(map, pendingVehicleDataRef.current, setSelectedVehicle, hoverPopupRef);
      map.resize();
      setMapReady(true);
      setMapError(null);
    };

    map.once("style.load", markMapReady);
    map.once("load", markMapReady);

    const fallbackReadyTimer = window.setTimeout(() => {
      if (map.isStyleLoaded()) {
        markMapReady();
      }
    }, 2500);

    map.on("error", (event) => {
      const message = event.error?.message ?? "Kartan kunde inte laddas.";
      setMapError(message);
    });

    mapRef.current = map;

    return () => {
      window.clearTimeout(fallbackReadyTimer);
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const tripUpdatesByTripId = useMemo(() => {
    const map = new Map<string, TripUpdate>();
    for (const tripUpdate of tripUpdateState.data?.tripUpdates ?? []) {
      if (tripUpdate.tripId && !map.has(tripUpdate.tripId)) {
        map.set(tripUpdate.tripId, tripUpdate);
      }
    }
    return map;
  }, [tripUpdateState.data?.tripUpdates]);

  const visibleVehicles = useMemo(() => {
    const vehicles = vehicleState.data?.vehicles ?? [];
    if (activeOperators.size === 0) return [];
    return vehicles.filter((vehicle) => activeOperators.has(vehicle.operator));
  }, [activeOperators, vehicleState.data?.vehicles]);

  useEffect(() => {
    const featureCollection = toFeatureCollection(visibleVehicles, tripUpdatesByTripId);
    pendingVehicleDataRef.current = featureCollection;
    setVehicleSourceData(mapRef.current, featureCollection);
  }, [mapReady, tripUpdatesByTripId, visibleVehicles]);

  const activeAlerts = useMemo(
    () => (alertState.data?.alerts ?? []).filter(isAlertActive),
    [alertState.data?.alerts]
  );

  const delayedTrips = useMemo(
    () =>
      (tripUpdateState.data?.tripUpdates ?? [])
        .filter((tripUpdate) => (tripUpdate.delaySeconds ?? 0) >= 60)
        .sort((a, b) => (b.delaySeconds ?? 0) - (a.delaySeconds ?? 0)),
    [tripUpdateState.data?.tripUpdates]
  );

  const selectedTripUpdate = selectedVehicle?.tripId
    ? tripUpdatesByTripId.get(selectedVehicle.tripId) ?? null
    : null;
  const selectedTripDetails = tripDetailsState.data?.ok ? tripDetailsState.data : null;

  const selectedAlerts = selectedVehicle
    ? activeAlerts
        .filter((alert) => alertMatchesVehicle(alert, selectedVehicle))
        .slice(0, 3)
    : [];

  const hasMissingApiKey =
    vehicleState.data?.hasApiKey === false ||
    tripUpdateState.data?.hasApiKey === false ||
    alertState.data?.hasApiKey === false;

  useEffect(() => {
    if (!selectedVehicle) {
      setTripDetailsState({ loading: false, error: null, data: null });
      pendingSelectedRouteDataRef.current = emptyRouteFeatureCollection();
      pendingSelectedStopsDataRef.current = emptyStopsFeatureCollection();
      setSelectedTripSourceData(
        mapRef.current,
        pendingSelectedRouteDataRef.current,
        pendingSelectedStopsDataRef.current
      );
      return;
    }

    const params = new URLSearchParams();
    if (selectedVehicle.staticTripId) params.set("staticTripId", selectedVehicle.staticTripId);
    if (selectedVehicle.tripId) params.set("tripId", selectedVehicle.tripId);
    if (selectedVehicle.startDate) params.set("startDate", selectedVehicle.startDate);

    if (!params.toString()) {
      setTripDetailsState({
        loading: false,
        error: "Fordonet saknar tripId, så statisk linjedata kan inte kopplas.",
        data: null
      });
      return;
    }

    const controller = new AbortController();
    pendingSelectedRouteDataRef.current = emptyRouteFeatureCollection();
    pendingSelectedStopsDataRef.current = emptyStopsFeatureCollection();
    setSelectedTripSourceData(
      mapRef.current,
      pendingSelectedRouteDataRef.current,
      pendingSelectedStopsDataRef.current
    );
    setTripDetailsState({ loading: true, error: null, data: null });

    fetch(`/api/trip-details?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        const data = (await response.json()) as TripDetailsResponse;
        if (!response.ok || !data.ok) {
          throw new Error(data.message ?? `Kunde inte hämta linjedata (${response.status}).`);
        }
        setTripDetailsState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setTripDetailsState({
          loading: false,
          error: error instanceof Error ? error.message : "Ett okänt linjedatafel uppstod.",
          data: null
        });
      });

    return () => controller.abort();
  }, [selectedVehicle]);

  useEffect(() => {
    const routeData = toSelectedRouteFeatureCollection(selectedTripDetails, selectedVehicle);
    const stopData = toSelectedStopsFeatureCollection(
      selectedTripDetails,
      selectedTripUpdate,
      selectedVehicle
    );
    pendingSelectedRouteDataRef.current = routeData;
    pendingSelectedStopsDataRef.current = stopData;
    setSelectedTripSourceData(mapRef.current, routeData, stopData);
  }, [selectedTripDetails, selectedTripUpdate, selectedVehicle]);

  const toggleOperator = (operator: OperatorSummary) => {
    if (!operator.supports.vehicles) return;

    setActiveOperators((current) => {
      const next = new Set(current);
      if (next.has(operator.id)) {
        next.delete(operator.id);
      } else {
        next.add(operator.id);
      }
      return next;
    });
  };

  const focusSweden = () => {
    mapRef.current?.flyTo({
      center: SWEDEN_CENTER,
      zoom: 4.4,
      essential: true
    });
  };

  return (
    <main className="app-shell">
      <div ref={mapNodeRef} className="map-canvas" aria-label="Livekarta över kollektivtrafik" />
      {!mapReady ? (
        <div className="map-loading" role="status">
          {mapError ? `Kartfel: ${mapError}` : "Laddar karta..."}
        </div>
      ) : null}

      <section className="control-panel" aria-label="Realtidsinformation">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Sverige live</p>
            <h1>Kollektivtrafik i realtid</h1>
          </div>
          <button className="icon-button" type="button" onClick={focusSweden} aria-label="Centrera kartan">
            <LocateFixed size={19} />
          </button>
        </div>

        <div className="metric-grid">
          <Metric label="Synliga fordon" value={visibleVehicles.length.toLocaleString("sv-SE")} />
          <Metric label="Aktiva störningar" value={activeAlerts.length.toLocaleString("sv-SE")} />
          <Metric label="Försenade turer" value={delayedTrips.length.toLocaleString("sv-SE")} />
          <Metric label="Alla fordon" value={(vehicleState.data?.total ?? 0).toLocaleString("sv-SE")} />
        </div>

        <div className="status-row">
          <Clock3 size={16} />
          <span>Fordon {formatTime(vehicleState.data?.generatedAt)}</span>
          <button className="refresh-button" type="button" onClick={() => void loadAll(loadVehicles, loadTripUpdates, loadAlerts)}>
            <RefreshCw size={15} />
            Hämta nu
          </button>
        </div>

        {vehicleState.error ? <Notice tone="error" text={vehicleState.error} /> : null}
        {tripUpdateState.error ? <Notice tone="error" text={tripUpdateState.error} /> : null}
        {alertState.error ? <Notice tone="error" text={alertState.error} /> : null}

        {hasMissingApiKey ? (
          <Notice
            tone="warning"
            text="Lägg TRAFIKLAB_API_KEY i .env.local lokalt och som environment variable i Vercel för live-data."
          />
        ) : null}

        <div className="section-title">
          <Clock3 size={16} />
          <h2>Datakällor</h2>
        </div>

        <div className="feed-list">
          <FeedHealth label="Fordon" seconds={3} statuses={vehicleState.data?.statuses} loading={vehicleState.loading} />
          <FeedHealth label="Prognoser" seconds={20} statuses={tripUpdateState.data?.statuses} loading={tripUpdateState.loading} />
          <FeedHealth label="Störningar" seconds={60} statuses={alertState.data?.statuses} loading={alertState.loading} />
          <StaticDataHealth data={vehicleState.data?.staticData ?? tripUpdateState.data?.staticData} />
        </div>

        <div className="section-title">
          <AlertTriangle size={16} />
          <h2>Störningar</h2>
        </div>

        <div className="alert-list">
          {activeAlerts.slice(0, 5).map((alert) => (
            <AlertItem key={alert.id} alert={alert} />
          ))}
          {!alertState.loading && activeAlerts.length === 0 ? (
            <div className="empty-block">Inga aktiva störningar i hämtade flöden.</div>
          ) : null}
          {alertState.loading && !alertState.data ? (
            <div className="loading-block">Hämtar störningar...</div>
          ) : null}
        </div>

        <div className="section-title">
          <Filter size={16} />
          <h2>Operatörer</h2>
        </div>

        <div className="operator-list">
          {(vehicleState.data?.operators ?? []).map((operator) => (
            <OperatorToggle
              key={operator.id}
              operator={operator}
              active={activeOperators.has(operator.id)}
              onToggle={() => toggleOperator(operator)}
            />
          ))}
          {vehicleState.loading && !vehicleState.data ? (
            <div className="loading-block">Hämtar liveflöden...</div>
          ) : null}
        </div>

        <div className="legend">
          <LegendItem icon={<TrainFront size={15} />} label="Tåg" />
          <LegendItem icon={<Bus size={15} />} label="Buss" />
          <LegendItem icon={<TramFront size={15} />} label="Spårvagn" />
          <LegendItem icon={<Ship size={15} />} label="Båt" />
          <LegendItem icon={<MapPin size={15} />} label="Okänd typ" />
        </div>
      </section>

      {selectedVehicle ? (
        <VehicleDetails
          vehicle={selectedVehicle}
          tripUpdate={selectedTripUpdate}
          tripDetails={selectedTripDetails}
          tripDetailsLoading={tripDetailsState.loading}
          tripDetailsError={tripDetailsState.error}
          alerts={selectedAlerts}
          onClose={() => setSelectedVehicle(null)}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Notice({ tone, text }: { tone: "warning" | "error"; text: string }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={17} />
      <span>{text}</span>
    </div>
  );
}

function FeedHealth({
  label,
  seconds,
  statuses,
  loading
}: {
  label: string;
  seconds: number;
  statuses?: FeedStatus[];
  loading: boolean;
}) {
  const healthy = statuses?.filter((status) => status.status === "ok" || status.status === "not_modified").length ?? 0;
  const total = statuses?.length ?? 0;
  const errorStatuses = statuses?.filter((status) => status.status === "error") ?? [];
  const rateLimitedStatuses = statuses?.filter((status) => status.status === "rate_limited") ?? [];
  const unavailableStatuses = statuses?.filter((status) => status.status === "unavailable") ?? [];
  const errors = errorStatuses.length;
  const rateLimited = rateLimitedStatuses.length;
  const unavailable = unavailableStatuses.length;
  const missingKey = statuses?.some((status) => status.status === "missing_key") ?? false;
  const firstIssue = [...rateLimitedStatuses, ...errorStatuses, ...unavailableStatuses].find((status) => status.message)?.message;
  const summary = [
    `${healthy}/${total} OK`,
    rateLimited ? `${rateLimited} kvot` : null,
    unavailable ? `${unavailable} saknas` : null,
    errors ? `${errors} fel` : null
  ].filter(Boolean).join(", ");

  return (
    <div className="feed-health">
      <div>
        <strong>{label}</strong>
        <span>{firstIssue ?? `${seconds}s cache/polling`}</span>
      </div>
      <small>
        {loading && total === 0
          ? "Hämtar..."
          : missingKey
            ? "API-nyckel saknas"
            : summary}
      </small>
    </div>
  );
}

function StaticDataHealth({ data }: { data?: VehiclesResponse["staticData"] }) {
  const statusText = data?.available
    ? `Uppdaterad ${formatDateTime(data.generatedAt)}`
    : "Väntar på daily workflow";
  const countText = data?.available
    ? `${data.counts.routes.toLocaleString("sv-SE")} linjer`
    : "Ej byggd";

  return (
    <div className="feed-health">
      <div>
        <strong>Static GTFS</strong>
        <span>{statusText}</span>
      </div>
      <small>{countText}</small>
    </div>
  );
}

function OperatorToggle({
  operator,
  active,
  onToggle
}: {
  operator: OperatorSummary;
  active: boolean;
  onToggle: () => void;
}) {
  const disabled = !operator.supports.vehicles;

  return (
    <label className={`operator-toggle ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={active} disabled={disabled} onChange={onToggle} />
      <span
        className="operator-color"
        style={{ backgroundColor: operatorColors[operator.id] ?? "#64748b" }}
      />
      <span className="operator-text">
        <strong>{operator.name}</strong>
        <small>{operatorStatusText(operator, active)}</small>
      </span>
      <span className={`status-dot ${operator.statuses.vehicles}`} />
    </label>
  );
}

function AlertItem({ alert }: { alert: TrafficAlert }) {
  return (
    <article className="traffic-alert">
      <div>
        <strong>{alert.header}</strong>
        <span>{alert.operatorName}</span>
      </div>
      <small>{alert.effect ?? alert.severity ?? "Trafikmeddelande"}</small>
    </article>
  );
}

function VehicleDetails({
  vehicle,
  tripUpdate,
  tripDetails,
  tripDetailsLoading,
  tripDetailsError,
  alerts,
  onClose
}: {
  vehicle: Vehicle;
  tripUpdate: TripUpdate | null;
  tripDetails: TripDetailsResponse | null;
  tripDetailsLoading: boolean;
  tripDetailsError: string | null;
  alerts: TrafficAlert[];
  onClose: () => void;
}) {
  const lineTitle = vehicleLineTitle(vehicle);
  const destination = vehicle.tripHeadsign ?? tripUpdate?.tripHeadsign ?? null;

  return (
    <aside className="details-panel" aria-label="Fordonsdetaljer">
      <div className="details-header">
        <div className="details-heading">
          {vehicle.routeColor ? (
            <span className="line-swatch" style={{ backgroundColor: vehicle.routeColor }} />
          ) : null}
          <div>
            <p className="eyebrow">{vehicle.operatorName}</p>
            <h2>{lineTitle}</h2>
            {destination ? <span className="details-subtitle">{destination}</span> : null}
          </div>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Stäng
        </button>
      </div>

      <div className="details-grid">
        <Detail label="Linje" value={vehicleLineDescription(vehicle)} />
        <Detail label="Operatör" value={vehicle.agencyName ?? vehicle.operatorName} />
        <Detail label="Färdmedel" value={vehicleTypeLabels[vehicle.vehicleType]} />
        <Detail icon={<Route size={16} />} label="Resa" value={vehicle.tripId ?? "Saknas"} />
        <Detail icon={<MapPin size={16} />} label="Position" value={`${vehicle.lat.toFixed(5)}, ${vehicle.lon.toFixed(5)}`} />
        <Detail label="Hastighet" value={vehicle.speed === null ? "Saknas" : `${Math.round(vehicle.speed * 3.6)} km/h`} />
        <Detail label="Riktning" value={vehicle.bearing === null ? "Saknas" : `${Math.round(vehicle.bearing)}°`} />
        <Detail label="Försening" value={tripUpdate?.delaySeconds === null || tripUpdate?.delaySeconds === undefined ? "Saknas" : delayLabel(tripUpdate.delaySeconds)} />
        <Detail label="Nästa prognos" value={nextStopText(tripUpdate)} />
        <Detail label="Senast uppdaterad" value={formatDateTime(vehicle.timestamp)} />
        <Detail label="Källa" value="GTFS Sweden 3" />
      </div>

      <UpcomingStops
        tripDetails={tripDetails}
        tripUpdate={tripUpdate}
        loading={tripDetailsLoading}
        error={tripDetailsError}
      />

      {alerts.length > 0 ? (
        <div className="vehicle-alerts">
          <h3>Berörda störningar</h3>
          {alerts.map((alert) => (
            <p key={alert.id}>{alert.header}</p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function UpcomingStops({
  tripDetails,
  tripUpdate,
  loading,
  error
}: {
  tripDetails: TripDetailsResponse | null;
  tripUpdate: TripUpdate | null;
  loading: boolean;
  error: string | null;
}) {
  const rows = useMemo(
    () => upcomingStopRows(tripDetails, tripUpdate).slice(0, 8),
    [tripDetails, tripUpdate]
  );

  return (
    <div className="upcoming-stops">
      <div className="subsection-heading">
        <h3>{tripUpdate ? "Kommande stationer" : "Stationer"}</h3>
        {tripDetails?.stops.length ? <span>{tripDetails.stops.length} stopp</span> : null}
      </div>

      {loading ? <div className="inline-loading">Hämtar linje och stationer...</div> : null}
      {!loading && error ? <div className="inline-error">{error}</div> : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="inline-empty">Ingen statisk stopplista hittades för resan.</div>
      ) : null}

      {rows.length > 0 ? (
        <ol>
          {rows.map((row) => (
            <li key={`${row.stop.id}-${row.stop.sequence}`} className={row.next ? "next" : ""}>
              <span className="stop-marker" />
              <div>
                <strong>{row.stop.name ?? row.stop.id}</strong>
                <small>
                  {[
                    row.stop.platformCode ? `läge ${row.stop.platformCode}` : null,
                    row.time ? formatTime(row.time) : null,
                    row.delaySeconds !== null ? delayLabel(row.delaySeconds) : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Detail({
  icon,
  label,
  value
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="detail">
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="legend-item">
      {icon}
      {label}
    </span>
  );
}

function operatorStatusText(operator: OperatorSummary, active: boolean) {
  if (!operator.supports.vehicles) return "Ingen fordonsfeed";
  if (!active) return "Inte vald";
  if (operator.statuses.vehicles === "missing_key") return "Väntar på API-nyckel";
  if (operator.statuses.vehicles === "rate_limited") return "Kvot nådd";
  if (operator.statuses.vehicles === "unavailable") return "Ingen feed just nu";
  if (operator.statuses.vehicles === "error") return operator.messages.vehicles ?? "Fel vid hämtning";
  if (operator.statuses.vehicles === "not_modified") return `${operator.vehicleCount} fordon, oförändrat`;
  return `${operator.vehicleCount} fordon`;
}

function isAlertActive(alert: TrafficAlert) {
  if (alert.activePeriods.length === 0) return true;
  const now = Date.now();

  return alert.activePeriods.some((period) => {
    const start = period.start ? Date.parse(period.start) : Number.NEGATIVE_INFINITY;
    const end = period.end ? Date.parse(period.end) : Number.POSITIVE_INFINITY;
    return start <= now && now <= end;
  });
}

function alertMatchesVehicle(alert: TrafficAlert, vehicle: Vehicle) {
  return alert.informedEntities.some((entity) => {
    if (entity.tripId && vehicle.tripId && entity.tripId === vehicle.tripId) return true;
    if (entity.routeId && vehicle.routeId && entity.routeId === vehicle.routeId) return true;
    return false;
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "Saknas";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatTime(value?: string | null) {
  if (!value) return "inte hämtat";

  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function delayLabel(seconds: number) {
  if (seconds === 0) return "I tid";
  const sign = seconds > 0 ? "+" : "-";
  const absoluteSeconds = Math.abs(seconds);
  const minutes = Math.round(absoluteSeconds / 60);
  if (minutes < 1) return `${sign}${absoluteSeconds} sek`;
  return `${sign}${minutes} min`;
}

function vehicleLineTitle(vehicle: Vehicle) {
  if (vehicle.routeShortName) return `Linje ${vehicle.routeShortName}`;
  if (vehicle.routeLongName) return vehicle.routeLongName;
  if (vehicle.routeId) return `Linje ${vehicle.routeId}`;
  return vehicleTypeLabels[vehicle.vehicleType];
}

function vehicleLineDescription(vehicle: Vehicle) {
  if (vehicle.routeShortName && vehicle.routeLongName) {
    return `${vehicle.routeShortName} - ${vehicle.routeLongName}`;
  }
  return vehicle.routeShortName ?? vehicle.routeLongName ?? vehicle.routeId ?? "Saknas";
}

function nextStopText(tripUpdate: TripUpdate | null) {
  if (!tripUpdate || tripUpdate.stopTimeUpdates.length === 0) return "Saknas";
  const now = Date.now();
  const next =
    tripUpdate.stopTimeUpdates.find((update) => {
      const time = update.departureTime ?? update.arrivalTime;
      return time ? Date.parse(time) >= now : false;
    }) ?? tripUpdate.stopTimeUpdates[0];
  const time = next.departureTime ?? next.arrivalTime;
  const delay = next.departureDelaySeconds ?? next.arrivalDelaySeconds;
  const stop = next.stopName ?? next.stopId ?? "Okänd hållplats";
  const platform = next.platformCode ? ` läge ${next.platformCode}` : "";

  return `${stop}${platform}${time ? ` ${formatTime(time)}` : ""}${delay ? ` (${delayLabel(delay)})` : ""}`;
}

function vehicleHoverLabel(vehicle: Vehicle, tripUpdate: TripUpdate | null) {
  const operator = vehicle.operatorName;
  const line = vehicle.routeShortName ?? vehicle.routeLongName ?? vehicle.routeId;
  const destination = vehicle.tripHeadsign ?? tripUpdate?.tripHeadsign;
  const prefix = [operator, line].filter(Boolean).join(" ");

  if (prefix && destination) return `${prefix} \u2192 ${destination}`;
  return prefix || vehicleTypeLabels[vehicle.vehicleType];
}

function upcomingStopRows(details: TripDetailsResponse | null, tripUpdate: TripUpdate | null) {
  if (!details) return [];

  const updates = tripUpdate?.stopTimeUpdates ?? [];
  const updateBySequence = new Map<number, StopTimePrediction>();
  const updateByStopId = new Map<string, StopTimePrediction>();

  for (const update of updates) {
    if (typeof update.stopSequence === "number") {
      updateBySequence.set(update.stopSequence, update);
    }
    if (update.stopId) {
      updateByStopId.set(update.stopId, update);
    }
  }

  const nextSequence = nextStopSequence(updates);
  const visibleStops = nextSequence
    ? details.stops.filter((stop) => stop.sequence >= nextSequence)
    : details.stops;

  return visibleStops.map((stop) => {
    const prediction = updateBySequence.get(stop.sequence) ?? updateByStopId.get(stop.id) ?? null;

    return {
      stop,
      next: nextSequence === stop.sequence,
      time: prediction?.departureTime ?? prediction?.arrivalTime ?? null,
      delaySeconds: prediction?.departureDelaySeconds ?? prediction?.arrivalDelaySeconds ?? null
    };
  });
}

function nextStopSequence(updates: StopTimePrediction[]) {
  if (updates.length === 0) return null;

  const now = Date.now();
  const futureUpdate = updates.find((update) => {
    const time = update.departureTime ?? update.arrivalTime;
    return typeof update.stopSequence === "number" && time ? Date.parse(time) >= now : false;
  });

  return futureUpdate?.stopSequence ?? updates.find((update) => typeof update.stopSequence === "number")?.stopSequence ?? null;
}

function toFeatureCollection(
  vehicles: Vehicle[],
  tripUpdatesByTripId: Map<string, TripUpdate>
): VehicleFeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((vehicle) => {
      const delaySeconds = vehicle.tripId ? tripUpdatesByTripId.get(vehicle.tripId)?.delaySeconds ?? null : null;

      return {
        type: "Feature",
        properties: {
          ...vehicle,
          delaySeconds,
          color: vehicle.routeColor ?? operatorColors[vehicle.operator] ?? "#475569",
          hasBearing: vehicle.bearing !== null,
          label: vehicleHoverLabel(vehicle, vehicle.tripId ? tripUpdatesByTripId.get(vehicle.tripId) ?? null : null)
        },
        geometry: {
          type: "Point",
          coordinates: [vehicle.lon, vehicle.lat]
        }
      };
    })
  };
}

function emptyFeatureCollection(): VehicleFeatureCollection {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function emptyRouteFeatureCollection(): SelectedRouteFeatureCollection {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function emptyStopsFeatureCollection(): SelectedStopsFeatureCollection {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function toSelectedRouteFeatureCollection(
  details: TripDetailsResponse | null,
  vehicle: Vehicle | null
): SelectedRouteFeatureCollection {
  const coordinates = (details?.lineCoordinates ?? []).filter(isValidLineCoordinate);

  if (coordinates.length < 2) return emptyRouteFeatureCollection();

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          color: details?.route?.color ?? vehicle?.routeColor ?? (vehicle ? operatorColors[vehicle.operator] : null) ?? "#111827"
        },
        geometry: {
          type: "LineString",
          coordinates
        }
      }
    ]
  };
}

function toSelectedStopsFeatureCollection(
  details: TripDetailsResponse | null,
  tripUpdate: TripUpdate | null,
  vehicle: Vehicle | null
): SelectedStopsFeatureCollection {
  if (!details) return emptyStopsFeatureCollection();

  const updates = tripUpdate?.stopTimeUpdates ?? [];
  const updateBySequence = new Map<number, StopTimePrediction>();
  const updateByStopId = new Map<string, StopTimePrediction>();
  const nextSequence = nextStopSequence(updates);
  const color = details.route?.color ?? vehicle?.routeColor ?? (vehicle ? operatorColors[vehicle.operator] : null) ?? "#2563eb";

  for (const update of updates) {
    if (typeof update.stopSequence === "number") {
      updateBySequence.set(update.stopSequence, update);
    }
    if (update.stopId) {
      updateByStopId.set(update.stopId, update);
    }
  }

  return {
    type: "FeatureCollection",
    features: details.stops
      .filter((stop) => typeof stop.lat === "number" && typeof stop.lon === "number")
      .map((stop) => {
        const prediction = updateBySequence.get(stop.sequence) ?? updateByStopId.get(stop.id) ?? null;

        return {
          type: "Feature",
          properties: {
            ...stop,
            color,
            upcoming: nextSequence ? stop.sequence >= nextSequence : false,
            next: nextSequence === stop.sequence,
            predictionTime: prediction?.departureTime ?? prediction?.arrivalTime ?? null,
            delaySeconds: prediction?.departureDelaySeconds ?? prediction?.arrivalDelaySeconds ?? null
          },
          geometry: {
            type: "Point",
            coordinates: [stop.lon as number, stop.lat as number]
          }
        };
      })
  };
}

function ensureVehicleLayer(
  map: MapLibreMap,
  data: VehicleFeatureCollection,
  setSelectedVehicle: (vehicle: Vehicle) => void,
  hoverPopupRef: React.MutableRefObject<Popup | null>
) {
  ensureVehicleArrowImage(map);

  if (!map.getSource(VEHICLE_SOURCE_ID)) {
    map.addSource(VEHICLE_SOURCE_ID, {
      type: "geojson",
      data
    });
  }

  if (!map.getLayer(VEHICLE_DOT_LAYER_ID)) {
    map.addLayer({
      id: VEHICLE_DOT_LAYER_ID,
      type: "circle",
      source: VEHICLE_SOURCE_ID,
      filter: ["==", ["get", "hasBearing"], false],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          4,
          8,
          6,
          12,
          9
        ],
        "circle-color": ["get", "color"],
        "circle-stroke-width": [
          "case",
          [">", ["coalesce", ["get", "delaySeconds"], 0], 300],
          4,
          2
        ],
        "circle-stroke-color": [
          "case",
          [">", ["coalesce", ["get", "delaySeconds"], 0], 300],
          "#b91c1c",
          "#ffffff"
        ],
        "circle-opacity": 0.94
      }
    });
  }

  if (!map.getLayer(VEHICLE_ARROW_LAYER_ID)) {
    map.addLayer({
      id: VEHICLE_ARROW_LAYER_ID,
      type: "symbol",
      source: VEHICLE_SOURCE_ID,
      filter: ["==", ["get", "hasBearing"], true],
      layout: {
        "icon-image": VEHICLE_ARROW_IMAGE_ID,
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.38,
          8,
          0.52,
          12,
          0.72
        ],
        "icon-rotate": ["-", ["coalesce", ["get", "bearing"], 90], 90],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true
      },
      paint: {
        "icon-opacity": 0.96
      }
    });
  }

  if (!configuredVehicleEventMaps.has(map)) {
    for (const layerId of [VEHICLE_DOT_LAYER_ID, VEHICLE_ARROW_LAYER_ID]) {
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mousemove", layerId, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const label = feature?.properties?.label;
        if (!label) return;

        if (!hoverPopupRef.current) {
          hoverPopupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 16,
            className: "vehicle-hover-popup"
          });
        }

        hoverPopupRef.current
          .setLngLat(event.lngLat)
          .setHTML(`<span>${escapeHtml(String(label))}</span>`)
          .addTo(map);
      });

      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
        hoverPopupRef.current?.remove();
      });

      map.on("click", layerId, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        setSelectedVehicle(feature.properties as Vehicle);
      });
    }

    configuredVehicleEventMaps.add(map);
  }

  setVehicleSourceData(map, data);
}

function ensureSelectedTripLayers(
  map: MapLibreMap,
  routeData: SelectedRouteFeatureCollection,
  stopData: SelectedStopsFeatureCollection
) {
  if (!map.getSource(SELECTED_ROUTE_SOURCE_ID)) {
    map.addSource(SELECTED_ROUTE_SOURCE_ID, {
      type: "geojson",
      data: routeData
    });
  }

  if (!map.getSource(SELECTED_STOPS_SOURCE_ID)) {
    map.addSource(SELECTED_STOPS_SOURCE_ID, {
      type: "geojson",
      data: stopData
    });
  }

  if (!map.getLayer(SELECTED_ROUTE_HALO_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_ROUTE_HALO_LAYER_ID,
      type: "line",
      source: SELECTED_ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          5,
          10,
          9,
          14,
          13
        ],
        "line-opacity": 0.78
      }
    });
  }

  if (!map.getLayer(SELECTED_ROUTE_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_ROUTE_LAYER_ID,
      type: "line",
      source: SELECTED_ROUTE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          2.4,
          10,
          4.8,
          14,
          7
        ],
        "line-opacity": 0.82
      }
    });
  }

  if (!map.getLayer(SELECTED_STOP_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_STOP_LAYER_ID,
      type: "circle",
      source: SELECTED_STOPS_SOURCE_ID,
      paint: {
        "circle-radius": [
          "case",
          ["get", "next"],
          7,
          ["get", "upcoming"],
          5,
          3.5
        ],
        "circle-color": [
          "case",
          ["get", "next"],
          "#111827",
          ["get", "upcoming"],
          ["get", "color"],
          "#ffffff"
        ],
        "circle-stroke-color": ["get", "color"],
        "circle-stroke-width": [
          "case",
          ["get", "next"],
          3,
          2
        ],
        "circle-opacity": 0.96
      }
    });
  }

  if (!map.getLayer(SELECTED_STOP_LABEL_LAYER_ID)) {
    map.addLayer({
      id: SELECTED_STOP_LABEL_LAYER_ID,
      type: "symbol",
      source: SELECTED_STOPS_SOURCE_ID,
      minzoom: 9,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "id"]],
        "text-size": 11,
        "text-offset": [0, 1.05],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false
      },
      paint: {
        "text-color": "#111827",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.4
      }
    });
  }

  setSelectedTripSourceData(map, routeData, stopData);
}

function ensureVehicleArrowImage(map: MapLibreMap) {
  if (map.hasImage(VEHICLE_ARROW_IMAGE_ID)) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.translate(size / 2, size / 2);
  context.beginPath();
  context.moveTo(25, 0);
  context.lineTo(-22, -22);
  context.lineTo(-10, 0);
  context.lineTo(-22, 22);
  context.closePath();
  context.lineJoin = "round";
  context.lineWidth = 7;
  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.stroke();
  context.fillStyle = "#050505";
  context.fill();

  map.addImage(VEHICLE_ARROW_IMAGE_ID, context.getImageData(0, 0, size, size), {
    pixelRatio: 2
  });
}

function setSelectedTripSourceData(
  map: MapLibreMap | null,
  routeData: SelectedRouteFeatureCollection,
  stopData: SelectedStopsFeatureCollection
) {
  if (!map?.isStyleLoaded()) return;
  const routeSource = map.getSource(SELECTED_ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  const stopSource = map.getSource(SELECTED_STOPS_SOURCE_ID) as GeoJSONSource | undefined;
  routeSource?.setData(routeData);
  stopSource?.setData(stopData);
}

function setVehicleSourceData(
  map: MapLibreMap | null,
  data: VehicleFeatureCollection
) {
  if (!map?.isStyleLoaded()) return;
  const source = map.getSource(VEHICLE_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(data);
}

function loadAll(
  loadVehicles: () => Promise<void>,
  loadTripUpdates: () => Promise<void>,
  loadAlerts: () => Promise<void>
) {
  return Promise.all([loadVehicles(), loadTripUpdates(), loadAlerts()]);
}

function hasRateLimitedStatus(statuses?: FeedStatus[]) {
  return statuses?.some((status) => status.status === "rate_limited") ?? false;
}

function isValidLineCoordinate(coordinate: [number, number]) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length === 2 &&
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1])
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
