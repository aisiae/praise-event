import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { ensureInstagramTestEvent, eventCollection, getActiveEvent, getEvent, INSTAGRAM_TEST_EVENT_ID } from "@/lib/events";
import { instagramPrizePreset } from "@/lib/settings";
import { getSocialFeed } from "@/lib/social";
import { isEventOpen, normalizeEmployeeId, normalizeEmployeeName, serialize, todaySeoul } from "@/lib/utils";

async function verifyEmployee(employeeIdValue: unknown, nameValue: unknown) {
  const employeeId = normalizeEmployeeId(employeeIdValue);
  const name = normalizeEmployeeName(nameValue);
  const snap = await getAdminDb().collection("employees").doc(employeeId).get();
  const row = snap.data();
  if (!snap.exists || !row || normalizeEmployeeName(row.name) !== name || ["휴직", "퇴직"].includes(String(row.status))) throw new Error("직원 인증 정보가 올바르지 않습니다.");
  return { employeeId, name: String(row.name) };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const testMode = params.get("test") === "1";
    if (params.get("feed") === "1") {
      // Next page of the feed ("더 보기"). Works for the live event and the test room.
      if (testMode) await ensureInstagramTestEvent();
      const event = testMode ? await getEvent(INSTAGRAM_TEST_EVENT_ID) : await getActiveEvent();
      if (!testMode && event.type !== "instagram") throw new Error("현재 나도 인스타 이벤트가 아닙니다.");
      return NextResponse.json(serialize(await getSocialFeed(event.id, params.get("cursor") || undefined)));
    }
    if (!testMode) throw new Error("지원하지 않는 요청입니다.");
    await ensureInstagramTestEvent();
    const event = await getEvent(INSTAGRAM_TEST_EVENT_ID);
    const socialFeed = await getSocialFeed(event.id);
    return NextResponse.json(serialize({ preview: false, testMode: true, event: { id: event.id, type: event.type, status: event.status }, settings: event, employees: [], praises: [], quiz: null, ...socialFeed, prizes: instagramPrizePreset.map((prize, index) => ({ id: String(index + 1), ...prize })), results: [], stats: { employeeCount: 0, praiseCount: 0, todayAttendance: 0 } }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "테스트 데이터를 불러오지 못했습니다." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const employee = await verifyEmployee(body.employeeId, body.name);
    const testMode = body.testMode === true;
    if (testMode) await ensureInstagramTestEvent();
    const event = testMode ? await getEvent(INSTAGRAM_TEST_EVENT_ID) : await getActiveEvent();
    if (!testMode && (event.type !== "instagram" || !isEventOpen(event))) throw new Error("현재 나도 인스타 이벤트 참여 기간이 아닙니다.");
    const posts = eventCollection(event.id, "socialPosts");
    const comments = eventCollection(event.id, "socialComments");
    const likes = eventCollection(event.id, "socialLikes");
    const action = String(body.action || "post");

    if (action === "login") {
      return NextResponse.json({ employee, message: "테스트 공간에 입장했습니다. 게시글·댓글·좋아요를 자유롭게 확인해 주세요." });
    } else if (action === "post") {
      const caption = String(body.caption || "").trim();
      const imageData = String(body.imageData || "");
      const capturedAt = String(body.capturedAt || "");
      if (caption.length < 5 || caption.length > 300) throw new Error("게시글은 5자 이상 300자 이하로 작성해 주세요.");
      if (!/^data:image\/(jpeg|webp);base64,/.test(imageData) || imageData.length > 750000) throw new Error("사진 형식 또는 용량을 확인해 주세요.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(capturedAt)) throw new Error("사진 촬영 일시를 입력해 주세요.");
      const data = { ...employee, authorName: employee.name, caption, imageData, capturedAt, createdAt: FieldValue.serverTimestamp() };
      if (testMode) await posts.add(data);
      else {
        // One post per employee per day (Seoul time): the doc id is unique per day, so create() fails if it already exists (also blocks double taps).
        const dayKey = `${todaySeoul()}_${employee.employeeId}`.replace(/[^A-Za-z0-9_-]/g, "_");
        try { await posts.doc(dayKey).create(data); }
        catch (error) {
          if ((error as { code?: number }).code === 6) throw new Error("게시글은 하루에 1개만 올릴 수 있습니다. 내일 다시 올려 주세요.");
          throw error;
        }
      }
    } else if (action === "comment") {
      const postId = String(body.postId || "");
      const content = String(body.content || "").trim();
      if (!(await posts.doc(postId).get()).exists) throw new Error("게시글을 찾을 수 없습니다.");
      if (content.length < 1 || content.length > 150) throw new Error("댓글은 150자 이하로 작성해 주세요.");
      await comments.add({ postId, ...employee, authorName: employee.name, content, createdAt: FieldValue.serverTimestamp() });
    } else if (action === "like") {
      const postId = String(body.postId || "");
      const likedPost = await posts.doc(postId).get();
      if (!likedPost.exists) throw new Error("게시글을 찾을 수 없습니다.");
      if (likedPost.data()?.employeeId === employee.employeeId) throw new Error("내 게시글에는 좋아요를 누를 수 없습니다.");
      const ref = likes.doc(`${postId}_${employee.employeeId}`);
      const snap = await ref.get();
      if (snap.exists) await ref.delete();
      else await ref.set({ postId, ...employee, createdAt: FieldValue.serverTimestamp() });
    } else if (action === "myLikers") {
      const mine = await posts.where("employeeId", "==", employee.employeeId).get();
      const mineIds = new Set(mine.docs.map((doc) => doc.id));
      const likers: Record<string, string[]> = {};
      (await likes.get()).docs.forEach((doc) => {
        const row = doc.data();
        if (mineIds.has(row.postId)) (likers[row.postId] ||= []).push(String(row.name || row.employeeId));
      });
      return NextResponse.json({ likers });
    } else {
      throw new Error("지원하지 않는 작업입니다.");
    }
    revalidateTag("public-event-data", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }, { status: 400 });
  }
}
