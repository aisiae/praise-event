import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { eventCollection, getActiveEvent } from "@/lib/events";
import { isEventOpen, normalizeEmployeeId, normalizeEmployeeName } from "@/lib/utils";

async function verifyEmployee(employeeIdValue: unknown, nameValue: unknown) {
  const employeeId = normalizeEmployeeId(employeeIdValue);
  const name = normalizeEmployeeName(nameValue);
  const snap = await getAdminDb().collection("employees").doc(employeeId).get();
  const row = snap.data();
  if (!snap.exists || !row || normalizeEmployeeName(row.name) !== name || ["휴직", "퇴직"].includes(String(row.status))) throw new Error("직원 인증 정보가 올바르지 않습니다.");
  return { employeeId, name: String(row.name) };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const employee = await verifyEmployee(body.employeeId, body.name);
    const event = await getActiveEvent();
    if (event.type !== "instagram" || !isEventOpen(event)) throw new Error("현재 나도 인스타 이벤트 참여 기간이 아닙니다.");
    const posts = eventCollection(event.id, "socialPosts");
    const comments = eventCollection(event.id, "socialComments");
    const likes = eventCollection(event.id, "socialLikes");
    const action = String(body.action || "post");

    if (action === "post") {
      const caption = String(body.caption || "").trim();
      const imageData = String(body.imageData || "");
      const capturedAt = String(body.capturedAt || "");
      if (caption.length < 5 || caption.length > 300) throw new Error("게시글은 5자 이상 300자 이하로 작성해 주세요.");
      if (!/^data:image\/(jpeg|webp);base64,/.test(imageData) || imageData.length > 750000) throw new Error("사진 형식 또는 용량을 확인해 주세요.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(capturedAt)) throw new Error("사진 촬영 일시를 입력해 주세요.");
      await posts.add({ ...employee, authorName: employee.name, caption, imageData, capturedAt, createdAt: FieldValue.serverTimestamp() });
    } else if (action === "comment") {
      const postId = String(body.postId || "");
      const content = String(body.content || "").trim();
      if (!(await posts.doc(postId).get()).exists) throw new Error("게시글을 찾을 수 없습니다.");
      if (content.length < 1 || content.length > 150) throw new Error("댓글은 150자 이하로 작성해 주세요.");
      await comments.add({ postId, ...employee, authorName: employee.name, content, createdAt: FieldValue.serverTimestamp() });
    } else if (action === "like") {
      const postId = String(body.postId || "");
      if (!(await posts.doc(postId).get()).exists) throw new Error("게시글을 찾을 수 없습니다.");
      const ref = likes.doc(`${postId}_${employee.employeeId}`);
      const snap = await ref.get();
      if (snap.exists) await ref.delete();
      else await ref.set({ postId, ...employee, createdAt: FieldValue.serverTimestamp() });
    } else {
      throw new Error("지원하지 않는 작업입니다.");
    }
    revalidateTag("public-event-data", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }, { status: 400 });
  }
}
