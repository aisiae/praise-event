import { NextResponse } from "next/server";
import { getCachedPublicData, getPublicData } from "@/lib/data";

export async function GET(request: Request) {
  try {
    // A social action must be visible immediately to its author.  The normal
    // page load remains cached, while this explicit refresh bypasses it.
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await (fresh ? getPublicData() : getCachedPublicData()));
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
