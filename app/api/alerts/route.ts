import { NextResponse } from "next/server";
import { getServiceAlerts } from "@/lib/trafiklab";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await getServiceAlerts(parseOperators(request));

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      "CDN-Cache-Control": "max-age=60, stale-while-revalidate=60",
      "Vercel-CDN-Cache-Control": "max-age=60, stale-while-revalidate=60"
    }
  });
}

function parseOperators(request: Request) {
  const { searchParams } = new URL(request.url);
  if (!searchParams.has("operators")) return undefined;
  return searchParams.get("operators")?.split(",").map((operator) => operator.trim()).filter(Boolean) ?? [];
}
