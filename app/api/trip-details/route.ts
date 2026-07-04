import { NextResponse } from "next/server";
import { findStaticTripMatch, getStaticTripDetails } from "@/lib/gtfs-static";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedStaticTripId = clean(searchParams.get("staticTripId"));
  const tripId = clean(searchParams.get("tripId"));
  const startDate = clean(searchParams.get("startDate"));
  const match = requestedStaticTripId
    ? { id: requestedStaticTripId }
    : findStaticTripMatch(tripId, startDate);
  const details = match ? getStaticTripDetails(match.id) : null;

  if (!details) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        message: "Ingen statisk linjeinformation hittades för den valda resan.",
        staticTripId: match?.id ?? requestedStaticTripId ?? null,
        tripId,
        lineCoordinates: [],
        stops: []
      },
      {
        status: 404,
        headers: cacheHeaders()
      }
    );
  }

  const finalStop = details.stops[details.stops.length - 1];
  const headsign = details.trip.headsign ?? finalStop?.name ?? null;

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      staticGeneratedAt: details.generatedAt,
      staticTripId: details.staticTripId,
      routeId: details.trip.routeId,
      shapeId: details.shapeId,
      patternId: details.patternId,
      headsign,
      route: details.route
        ? {
            shortName: details.route.shortName,
            longName: details.route.longName,
            type: details.route.type,
            color: cssColorFromGtfsHex(details.route.color),
            textColor: cssColorFromGtfsHex(details.route.textColor),
            agencyName: details.route.agencyName
          }
        : null,
      lineCoordinates: details.lineCoordinates,
      stops: details.stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        platformCode: stop.platformCode,
        parentStation: stop.parentStation,
        sequence: stop.sequence
      }))
    },
    {
      headers: cacheHeaders()
    }
  );
}

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cssColorFromGtfsHex(value?: string | null): string | null {
  const normalized = value?.replace(/^#/, "").trim();
  return normalized && /^[0-9a-f]{6}$/i.test(normalized) ? `#${normalized}` : null;
}

function cacheHeaders() {
  return {
    "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
    "CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400",
    "Vercel-CDN-Cache-Control": "max-age=86400, stale-while-revalidate=86400"
  };
}
