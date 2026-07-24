import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSettings } from "@/lib/data";
import { ACTIVE, isEventOpen, normalizeEmployeeId, normalizeEmployeeName, todaySeoul } from "@/lib/utils";

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
    if (!snap.exists || !employee || normalizeEmployeeName(employee.name) !== name || employee.status !== ACTIVE) {
      throw new Error("이름과 사번이 일치하지 않거나 재직 대상자가 아닙니다.");
    }

    const settings = await getSettings();
    const eventOpen = isEventOpen(settings);
    const date = todaySeoul();
    const attendanceRef = adminDb.collection("attendance").doc(`${date}_${employeeId}`);
    let attendanceAwarded = false;

    if (eventOpen) {
      await adminDb.runTransaction(async (tx) => {
        const attendance = await tx.get(attendanceRef);
        if (!attendance.exists) {
          tx.set(attendanceRef, { date, employeeId, name: employee.name, checkedAt: FieldValue.serverTimestamp() });
          attendanceAwarded = true;
        }
      });
    }

    const [attendanceSnap, sentSnap, receivedSnap] = await Promise.all([
      adminDb.collection("attendance").where("employeeId", "==", employeeId).get(),
      adminDb.collection("praises").where("writerId", "==", employeeId).where("status", "==", "게시").get(),
      adminDb.collection("praises").where("targetId", "==", employeeId).where("status", "==", "게시").get(),
    ]);
    const stickerStatus = {
      attendance: attendanceSnap.size,
      sent: sentSnap.size,
      received: receivedSnap.size,
      total: 1 + attendanceSnap.size + sentSnap.size + receivedSnap.size,
    };

    return NextResponse.json({
      employee: { employeeId, name: employee.name },
      attendanceAwarded,
      attendanceMessage: !eventOpen
        ? "이벤트 기간이 아니어서 출석 스티커는 지급되지 않았습니다."
        : attendanceAwarded
          ? "오늘의 출석 스티커 1장을 받았습니다!"
          : "오늘 출석 스티커는 이미 받았습니다.",
      stickerStatus,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "로그인하지 못했습니다." }, { status: 400 });
  }
}
