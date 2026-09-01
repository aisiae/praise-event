import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { eventCollection, getActiveEvent, LEGACY_EVENT_ID } from "@/lib/events";
import { ACTIVE, isEventOpen, normalizeEmployeeId, normalizeEmployeeName, serialize, todaySeoul } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const body = await request.json();
    const employeeId = normalizeEmployeeId(body.employeeId);
    const name = normalizeEmployeeName(body.name);
    if (!employeeId || !name) throw new Error("이름과 사번을 입력해 주세요.");

    const ref = adminDb.collection("employees").doc(employeeId);
    const snap = await ref.get();
    const employee = snap.data();
    const employeeStatus = String(employee?.status || ACTIVE).normalize("NFC").trim();
    const inactive = employeeStatus === "휴직" || employeeStatus === "퇴직";
    if (!snap.exists || !employee || normalizeEmployeeName(employee.name) !== name || inactive) {
      throw new Error("이름과 사번이 일치하지 않거나 재직 대상자가 아닙니다.");
    }

    const settings = await getActiveEvent();
    const eventOpen = isEventOpen(settings);
    const date = todaySeoul();
    const attendanceRef = settings.id === LEGACY_EVENT_ID
      ? adminDb.collection("attendance").doc(`${date}_${employeeId}`)
      : eventCollection(settings.id, "attendance").doc(`${date}_${employeeId}`);
    let attendanceAwarded = false;

    if (eventOpen && settings.type === "praise") {
      await adminDb.runTransaction(async (tx) => {
        const attendance = await tx.get(attendanceRef);
        if (!attendance.exists) {
          tx.set(attendanceRef, { eventId: settings.id, date, employeeId, name: employee.name, checkedAt: FieldValue.serverTimestamp() });
          attendanceAwarded = true;
        }
      });
      if (attendanceAwarded) revalidateTag("public-event-data", { expire: 0 });
    }

    let stickerStatus = { attendance: attendanceAwarded ? 1 : 0, sent: 0, received: 0, total: attendanceAwarded ? 1 : 0 };
    let personalPraises: { received: unknown[]; sent: unknown[] } = { received: [], sent: [] };
    let quizSubmission: unknown = null;
    try {
      if (settings.type === "quiz") {
        const response = await eventCollection(settings.id, "responses").doc(`${date}_${employeeId}`).get();
        quizSubmission = response.exists ? serialize({ id: response.id, ...response.data() }) : null;
      }
      const attendanceSource = settings.id === LEGACY_EVENT_ID ? adminDb.collection("attendance") : eventCollection(settings.id, "attendance");
      const praiseSource = settings.id === LEGACY_EVENT_ID ? adminDb.collection("praises") : eventCollection(settings.id, "praises");
      if (settings.type !== "praise") throw new Error("quiz-only");
      const [attendanceSnap, sentSnap, receivedSnap] = await Promise.all([
        attendanceSource.where("employeeId", "==", employeeId).get(),
        praiseSource.where("writerId", "==", employeeId).get(),
        praiseSource.where("targetId", "==", employeeId).get(),
      ]);
      const sent = sentSnap.docs.filter((doc) => doc.data().status === "게시").length;
      const received = receivedSnap.docs.filter((doc) => doc.data().status === "게시").length;
      stickerStatus = {
        attendance: attendanceSnap.size,
        sent,
        received,
        total: attendanceSnap.size + sent + received,
      };
      personalPraises = {
        received: receivedSnap.docs.filter((doc) => doc.data().status === "게시").map((doc) => ({ id: doc.id, ...doc.data() })),
        sent: sentSnap.docs.filter((doc) => doc.data().status === "게시").map((doc) => {
          const row = doc.data();
          return { id: doc.id, targetName: row.targetName, content: row.content, createdAt: row.createdAt };
        }),
      };
    } catch (statusError) {
      if (settings.type === "praise") console.error("스티커 현황 조회 실패", statusError);
    }

    return NextResponse.json({
      employee: { employeeId, name: employee.name },
      attendanceAwarded,
      attendanceMessage: !eventOpen
        ? "현재 이벤트 참여 기간이 아닙니다."
        : settings.type === "quiz"
          ? quizSubmission ? "오늘의 퀴즈에 이미 참여했습니다." : "인증되었습니다. 오늘의 퀴즈에 참여해 주세요!"
        : attendanceAwarded
          ? "오늘의 출석 스티커 1장을 받았습니다!"
          : "오늘 출석 스티커는 이미 받았습니다.",
      stickerStatus,
      personalPraises: serialize(personalPraises),
      eventType: settings.type,
      quizSubmission,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "로그인하지 못했습니다." }, { status: 400 });
  }
}
