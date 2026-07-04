"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import {
  AlertTriangle,
  Bus,
  Clock3,
  Filter,
  LocateFixed,
  MapPin,
  RefreshCw,
  Route,
  TrainFront,
  TramFront
} from "lucide-react";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlertsResponse,
  FeedStatus,
  OperatorSummary,
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
};

type VehicleFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  VehicleProperties
>;

const SWEDEN_CENTER: [number, number] = [15.2, 62.0];
const VEHICLE_SOURCE_ID = "vehicles";
const VEHICLE_LAYER_ID = "vehicle-points";
const VEHICLE_REFRESH_MS = 3000;
const TRIP_UPDATE_REFRESH_MS = 20000;
const ALERT_REFRESH_MS = 60000;

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
  const operatorsInitializedRef = useRef(false);
  const [activeOperators, setActiveOperators] = useState<Set<string>>(new Set());
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
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

  const loadVehicles = useCallback(async () => {
    try {
      const response = await fetch("/api/vehicles", { cache: "no-store" });
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
  }, []);

  const loadTripUpdates = useCallback(async () => {
    try {
      const response = await fetch("/api/trip-updates", { cache: "no-store" });
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
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await fetch("/api/alerts", { cache: "no-store" });
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
  }, []);

  useEffect(() => {
    void loadVehicles();
    const interval = window.setInterval(() => void loadVehicles(), VEHICLE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadVehicles]);

  useEffect(() => {
    void loadTripUpdates();
    const interval = window.setInterval(() => void loadTripUpdates(), TRIP_UPDATE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadTripUpdates]);

  useEffect(() => {
    void loadAlerts();
    const interval = window.setInterval(() => void loadAlerts(), ALERT_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loadAlerts]);

  useEffect(() => {
    const operators = vehicleState.data?.operators ?? [];
    if (operatorsInitializedRef.current || operators.length === 0) return;
    operatorsInitializedRef.current = true;
    setActiveOperators(new Set(operators.filter((operator) => operator.supports.vehicles).map((operator) => operator.id)));
  }, [vehicleState.data?.operators]);

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

    map.on("load", () => {
      map.addSource(VEHICLE_SOURCE_ID, {
        type: "geojson",
        data: emptyFeatureCollection()
      });

      map.addLayer({
        id: VEHICLE_LAYER_ID,
        type: "circle",
        source: VEHICLE_SOURCE_ID,
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

      map.on("mouseenter", VEHICLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", VEHICLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", VEHICLE_LAYER_ID, (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature?.properties) return;
        setSelectedVehicle(feature.properties as Vehicle);
      });
    });

    mapRef.current = map;

    return () => {
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
    const source = mapRef.current?.getSource(VEHICLE_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    source.setData(toFeatureCollection(visibleVehicles, tripUpdatesByTripId));
  }, [tripUpdatesByTripId, visibleVehicles]);

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

  const selectedAlerts = selectedVehicle
    ? activeAlerts
        .filter((alert) => alertMatchesVehicle(alert, selectedVehicle))
        .slice(0, 3)
    : [];

  const hasMissingApiKey =
    vehicleState.data?.hasApiKey === false ||
    tripUpdateState.data?.hasApiKey === false ||
    alertState.data?.hasApiKey === false;

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
          <LegendItem icon={<MapPin size={15} />} label="Okänd typ" />
        </div>
      </section>

      {selectedVehicle ? (
        <VehicleDetails
          vehicle={selectedVehicle}
          tripUpdate={selectedTripUpdate}
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
  const errors = statuses?.filter((status) => status.status === "error").length ?? 0;
  const missingKey = statuses?.some((status) => status.status === "missing_key") ?? false;

  return (
    <div className="feed-health">
      <div>
        <strong>{label}</strong>
        <span>{seconds}s cache/polling</span>
      </div>
      <small>
        {loading && total === 0
          ? "Hämtar..."
          : missingKey
            ? "API-nyckel saknas"
            : `${healthy}/${total} OK${errors ? `, ${errors} fel` : ""}`}
      </small>
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
        <small>{operatorStatusText(operator)}</small>
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
  alerts,
  onClose
}: {
  vehicle: Vehicle;
  tripUpdate: TripUpdate | null;
  alerts: TrafficAlert[];
  onClose: () => void;
}) {
  return (
    <aside className="details-panel" aria-label="Fordonsdetaljer">
      <div className="details-header">
        <div>
          <p className="eyebrow">{vehicle.operatorName}</p>
          <h2>{vehicle.routeId ? `Linje ${vehicle.routeId}` : vehicleTypeLabels[vehicle.vehicleType]}</h2>
        </div>
        <button type="button" className="close-button" onClick={onClose}>
          Stäng
        </button>
      </div>

      <div className="details-grid">
        <Detail icon={<Route size={16} />} label="Resa" value={vehicle.tripId ?? "Saknas"} />
        <Detail icon={<MapPin size={16} />} label="Position" value={`${vehicle.lat.toFixed(5)}, ${vehicle.lon.toFixed(5)}`} />
        <Detail label="Hastighet" value={vehicle.speed === null ? "Saknas" : `${Math.round(vehicle.speed * 3.6)} km/h`} />
        <Detail label="Riktning" value={vehicle.bearing === null ? "Saknas" : `${Math.round(vehicle.bearing)}°`} />
        <Detail label="Försening" value={tripUpdate?.delaySeconds === null || tripUpdate?.delaySeconds === undefined ? "Saknas" : delayLabel(tripUpdate.delaySeconds)} />
        <Detail label="Nästa prognos" value={nextStopText(tripUpdate)} />
        <Detail label="Senast uppdaterad" value={formatDateTime(vehicle.timestamp)} />
        <Detail label="Källa" value="GTFS Sweden 3" />
      </div>

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

function operatorStatusText(operator: OperatorSummary) {
  if (!operator.supports.vehicles) return "Ingen fordonsfeed";
  if (operator.statuses.vehicles === "missing_key") return "Väntar på API-nyckel";
  if (operator.statuses.vehicles === "error") return "Fel vid hämtning";
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

  return `${next.stopId ?? "Okänd hållplats"}${time ? ` ${formatTime(time)}` : ""}${delay ? ` (${delayLabel(delay)})` : ""}`;
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
          color: delaySeconds !== null && delaySeconds >= 300
            ? "#dc2626"
            : operatorColors[vehicle.operator] ?? "#475569"
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

function loadAll(
  loadVehicles: () => Promise<void>,
  loadTripUpdates: () => Promise<void>,
  loadAlerts: () => Promise<void>
) {
  return Promise.all([loadVehicles(), loadTripUpdates(), loadAlerts()]);
}
