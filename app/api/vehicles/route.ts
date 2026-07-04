import { NextResponse } from "next/server";
import { getVehiclePositions } from "@/lib/trafiklab";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await getVehiclePositions(parseOperators(request));

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=3",
      "CDN-Cache-Control": "max-age=3, stale-while-revalidate=3",
      "Vercel-CDN-Cache-Control": "max-age=3, stale-while-revalidate=3"
    }
  });
}

function parseOperators(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.has("operators")) return undefined;
  return searchParams.get("operators")?.split(",").map((operator) => operator.trim()).filter(Boolean) ?? [];
}
