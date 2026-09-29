import { NextRequest, NextResponse } from "next/server";
import { eventCollection } from "@/lib/events";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

// Serves a post photo as a real image. The URL never changes for a post, so it is cached for a year
// (browser + Vercel CDN) and Firestore is read only on the first request.
export async function GET(request: NextRequest) {
  const eventId = request.nextUrl.searchParams.get("event") || "";
  const postId = request.nextUrl.searchParams.get("id") || "";
  if (!ID_PATTERN.test(eventId) || !ID_PATTERN.test(postId)) return new NextResponse("Not found", { status: 404 });
  try {
    const snap = await eventCollection(eventId, "socialPosts").doc(postId).get();
    const match = /^data:(image\/(?:jpeg|webp));base64,(.+)$/.exec(String(snap.data()?.imageData || ""));
    if (!match) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(match[2], "base64")), {
      headers: { "Content-Type": match[1], "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
