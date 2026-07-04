import { NextResponse } from "next/server";
import { getVehiclePositions } from "@/lib/trafiklab";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getVehiclePositions();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3, stale-while-revalidate=3",
      "CDN-Cache-Control": "max-age=3, stale-while-revalidate=3",
      "Vercel-CDN-Cache-Control": "max-age=3, stale-while-revalidate=3"
    }
  });
}
