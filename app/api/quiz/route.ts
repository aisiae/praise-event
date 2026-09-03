import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { eventCollection, getActiveEvent } from "@/lib/events";
import { ensureSeptember2026Quizzes } from "@/lib/september-2026-quizzes";
import { ACTIVE, isEventOpen, normalizeEmployeeId, normalizeEmployeeName, todaySeoul } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const event = await getActiveEvent();
    if (event.type !== "quiz") throw new Error("현재 활성 이벤트는 퀴즈 이벤트가 아닙니다.");
    await ensureSeptember2026Quizzes(event.id);
    if (!isEventOpen(event)) throw new Error("현재 이벤트 참여 기간이 아닙니다.");

    const body = await request.json();
    const employeeId = normalizeEmployeeId(body.employeeId);
    const name = normalizeEmployeeName(body.name);
    const answer = Number(body.answer);
    const date = todaySeoul();
    const [employeeSnap, quizSnap] = await Promise.all([
      adminDb.collection("employees").doc(employeeId).get(),
      eventCollection(event.id, "quizzes").doc(date).get(),
    ]);
    const employee = employeeSnap.data();
    if (!employee || employee.status !== ACTIVE || normalizeEmployeeName(employee.name) !== name) {
      throw new Error("이름과 사번을 다시 확인해 주세요.");
    }
    const quiz = quizSnap.data();
    if (!quizSnap.exists || !quiz) throw new Error("오늘 등록된 퀴즈가 없습니다.");
    const options = Array.isArray(quiz.options) ? quiz.options : [];
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new Error("답을 선택해 주세요.");

    const responseRef = eventCollection(event.id, "responses").doc(`${date}_${employeeId}`);
    await adminDb.runTransaction(async (tx) => {
      const existing = await tx.get(responseRef);
      if (existing.exists) throw new Error("오늘의 퀴즈에는 이미 참여했습니다.");
      tx.set(responseRef, {
        eventId: event.id,
        date,
        employeeId,
        name: employee.name,
        answer,
        correct: answer === Number(quiz.correctIndex),
        submittedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      correct: answer === Number(quiz.correctIndex),
      correctIndex: Number(quiz.correctIndex),
      correctAnswer: String(options[Number(quiz.correctIndex)] || ""),
      facilitatorComment: String(quiz.facilitatorComment || quiz.explanation || ""),
      message: answer === Number(quiz.correctIndex) ? "정답입니다!" : "내일 새로운 문제에 다시 도전해 주세요!",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "퀴즈를 제출하지 못했습니다." }, { status: 400 });
  }
}
