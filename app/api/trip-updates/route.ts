import { NextResponse } from "next/server";
import { getTripUpdates } from "@/lib/trafiklab";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getTripUpdates();

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=20, stale-while-revalidate=20",
      "CDN-Cache-Control": "max-age=20, stale-while-revalidate=20",
      "Vercel-CDN-Cache-Control": "max-age=20, stale-while-revalidate=20"
    }
  });
}
