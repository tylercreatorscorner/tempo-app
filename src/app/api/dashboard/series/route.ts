import { NextRequest, NextResponse } from "next/server";
import { getDashboardSeries } from "@/lib/data/dashboard-series";
export const maxDuration = 30;
export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start") ?? "";
  const end = request.nextUrl.searchParams.get("end") ?? "";
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  if (
    !valid(start) ||
    !valid(end) ||
    end < start ||
    (Date.parse(end) - Date.parse(start)) / 86400000 > 400
  )
    return NextResponse.json(
      { error: "Choose a range of up to 400 days" },
      { status: 400 },
    );
  try {
    const data = await getDashboardSeries(
      start,
      end,
      request.nextUrl.searchParams.get("brand") ?? undefined,
    );
    return data
      ? NextResponse.json(data, {
          headers: { "Cache-Control": "private, no-store" },
        })
      : NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  } catch {
    return NextResponse.json(
      { error: "Chart data could not be loaded" },
      { status: 503 },
    );
  }
}
