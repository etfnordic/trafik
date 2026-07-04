import { NextResponse } from "next/server";
import { getServiceAlerts } from "@/lib/trafiklab";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getServiceAlerts();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      "CDN-Cache-Control": "max-age=60, stale-while-revalidate=60",
      "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=60"
    }
  });
}
