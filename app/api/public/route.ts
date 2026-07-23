import { NextResponse } from "next/server";
import { getPublicData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPublicData());
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
