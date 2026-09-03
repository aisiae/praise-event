import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { ensureLegacyEvent, eventCollection, eventDocs, getActiveEvent, getEvent, LEGACY_EVENT_ID, listEvents, type EventType } from "@/lib/events";
import { defaultSettings, quizPrizePreset } from "@/lib/settings";
import { getCachedPublicData, logAdmin } from "@/lib/data";
import { normalizeEmployeeId, normalizeEmployeeName, serialize } from "@/lib/utils";

function praiseStandings(employeeDocs: FirebaseFirestore.QueryDocumentSnapshot[], praiseDocs: FirebaseFirestore.QueryDocumentSnapshot[], attendanceDocs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  const attendance = new Map<string, number>();
  praiseDocs.forEach((doc) => { const row = doc.data(); if (row.status === "게시") { sent.set(row.writerId, (sent.get(row.writerId) || 0) + 1); received.set(row.targetId, (received.get(row.targetId) || 0) + 1); } });
  attendanceDocs.forEach((doc) => { const id = String(doc.data().employeeId || ""); attendance.set(id, (attendance.get(id) || 0) + 1); });
  return employeeDocs.filter((doc) => !["휴직", "퇴직"].includes(String(doc.data().status))).map((doc) => ({
    employeeId: doc.id, name: doc.data().name, attendance: attendance.get(doc.id) || 0, sent: sent.get(doc.id) || 0, received: received.get(doc.id) || 0,
    tickets: (sent.get(doc.id) || 0) + (received.get(doc.id) || 0) + (attendance.get(doc.id) || 0),
  }));
}

function quizStandings(employeeDocs: FirebaseFirestore.QueryDocumentSnapshot[], responseDocs: FirebaseFirestore.QueryDocumentSnapshot[]) {
  const participation = new Map<string, number>();
  const correct = new Map<string, number>();
  responseDocs.forEach((doc) => { const row = doc.data(); const id = String(row.employeeId || ""); participation.set(id, (participation.get(id) || 0) + 1); if (row.correct) correct.set(id, (correct.get(id) || 0) + 1); });
  return employeeDocs.filter((doc) => !["휴직", "퇴직"].includes(String(doc.data().status))).map((doc) => ({ employeeId: doc.id, name: doc.data().name, attendance: participation.get(doc.id) || 0, sent: 0, received: correct.get(doc.id) || 0, tickets: participation.get(doc.id) || 0 }));
}

async function adminData(selectedId?: string) {
  await ensureLegacyEvent();
  const adminDb = getAdminDb();
  const activeEvent = await getActiveEvent();
  const selectedEvent = await getEvent(selectedId || activeEvent.id);
  const [events, employees, prizes, praises, attendance, quizzes, responses, result] = await Promise.all([
    listEvents(), adminDb.collection("employees").orderBy("name").get(), eventDocs(selectedEvent.id, "prizes"),
    selectedEvent.type === "praise" ? eventDocs(selectedEvent.id, "praises") : Promise.resolve([]), eventDocs(selectedEvent.id, "attendance"),
    selectedEvent.type === "quiz" ? eventDocs(selectedEvent.id, "quizzes") : Promise.resolve([]), selectedEvent.type === "quiz" ? eventDocs(selectedEvent.id, "responses") : Promise.resolve([]),
    eventCollection(selectedEvent.id, "meta").doc("currentResult").get(),
  ]);
  const standings = selectedEvent.type === "quiz" ? quizStandings(employees.docs, responses) : praiseStandings(employees.docs, praises, attendance);
  return serialize({
    events, activeEventId: activeEvent.id, selectedEventId: selectedEvent.id,
    employees: employees.docs.map((doc) => ({ id: doc.id, ...doc.data() })), settings: selectedEvent,
    prizes: prizes.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => Number(a.order || 999) - Number(b.order || 999)),
    praises: praises.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.()),
    quizzes: quizzes.map((doc) => ({ id: doc.id, date: doc.id, ...doc.data() })).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))),
    responses: responses.map((doc) => ({ id: doc.id, ...doc.data() })), standings: standings.sort((a, b) => b.tickets - a.tickets || b.received - a.received || a.name.localeCompare(b.name, "ko")),
    hasPublishedResult: result.exists, resultPublished: result.exists && Boolean(selectedEvent.showResults), publishedResults: result.data()?.results || [],
  }) as Record<string, unknown>;
}

async function replaceSubcollection(eventId: string, name: string, rows: any[], idFor: (row: any, index: number) => string) {
  const adminDb = getAdminDb();
  const target = eventId === LEGACY_EVENT_ID && ["prizes"].includes(name) ? adminDb.collection(name) : eventCollection(eventId, name);
  const old = await target.get();
  if (old.size + rows.length > 450) throw new Error("한 번에 저장할 수 있는 항목 수를 초과했습니다.");
  const batch = adminDb.batch();
  old.docs.forEach((doc) => batch.delete(doc.ref));
  rows.forEach((row, index) => batch.set(target.doc(idFor(row, index)), { ...row, eventId }));
  await batch.commit();
}

async function deleteCollectionInChunks(collection: FirebaseFirestore.CollectionReference) {
  while (true) {
    const snap = await collection.limit(400).get();
    if (snap.empty) return;
    const batch = getAdminDb().batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    if (snap.size < 400) return;
  }
}

export async function GET(request: NextRequest) {
  try { await requireAdmin(request); return NextResponse.json(await adminData(request.nextUrl.searchParams.get("eventId") || undefined)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "권한이 없습니다." }, { status: 401 }); }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request); await ensureLegacyEvent();
    const adminDb = getAdminDb();
    const body = await request.json();
    const action = String(body.action || "");
    let selectedEventId = String(body.eventId || "");
    let refreshPublic = false;

    if (action === "loadEvent") {
      selectedEventId = String(body.eventId || "");
      return NextResponse.json(await adminData(selectedEventId));
    } else if (action === "addEmployee") {
      const employeeId = normalizeEmployeeId(body.employeeId); const name = normalizeEmployeeName(body.name); const status = String(body.status || "");
      if (!employeeId || !name || !["재직", "휴직", "퇴직"].includes(status)) throw new Error("이름, 사번, 상태를 모두 확인해 주세요.");
      const employeeRef = adminDb.collection("employees").doc(employeeId); const [existing, employees] = await Promise.all([employeeRef.get(), adminDb.collection("employees").count().get()]);
      if (existing.exists) throw new Error("이미 등록된 사번입니다. 기존 직원 행에서 수정해 주세요.");
      if (employees.data().count >= 450) throw new Error("등록 가능한 직원 수를 초과했습니다.");
      await employeeRef.set({ name, status, updatedAt: FieldValue.serverTimestamp() }); await logAdmin("직원 추가", employeeId, `${name} / ${status}`);
      refreshPublic = true;
    } else if (action === "updateEmployee") {
      const employeeId = normalizeEmployeeId(body.employeeId); const name = normalizeEmployeeName(body.name); const status = String(body.status || "");
      if (!employeeId || !name || !["재직", "휴직", "퇴직"].includes(status)) throw new Error("직원 정보를 확인해 주세요.");
      await adminDb.collection("employees").doc(employeeId).update({ name, status, updatedAt: FieldValue.serverTimestamp() }); await logAdmin("직원 정보 수정", employeeId, `${name} / ${status}`);
      refreshPublic = true;
    } else if (action === "deleteEmployee") {
      const employeeId = normalizeEmployeeId(body.employeeId); if (!employeeId) throw new Error("삭제할 직원을 확인해 주세요.");
      await adminDb.collection("employees").doc(employeeId).delete(); await logAdmin("직원 삭제", employeeId);
      refreshPublic = true;
    } else if (action === "createEvent") {
      const type: EventType = body.type === "quiz" ? "quiz" : "praise"; const ref = adminDb.collection("events").doc(); selectedEventId = ref.id;
      await ref.set({
        ...defaultSettings,
        eventName: type === "quiz" ? "새 오늘의 퀴즈" : "새 칭찬 우체국",
        intro: type === "quiz" ? "하루 한 문제, 동료를 알아가는 산뜻한 퀴즈 이벤트입니다." : defaultSettings.intro,
        detailAttendance: type === "quiz" ? "하루 한 문제씩 출제됩니다. 이름과 사번으로 인증한 뒤 오늘의 퀴즈에 참여해 주세요. 내일도 새로운 문제를 맞혀 주세요!" : "이벤트 기간 중 하루 1회 로그인하면 출석 스티커 1장이 지급됩니다.\n칭찬을 작성하거나 받으면 각각 스티커 1장이 추가됩니다.",
        detailNotes: type === "quiz" ? "한 직원은 하루에 한 번만 답을 제출할 수 있습니다." : "동일한 동료에게는 하루에 한 번만 칭찬할 수 있으며, 본인에게는 칭찬을 작성할 수 없습니다.",
        type, status: "draft", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      if (type === "quiz") {
        await replaceSubcollection(selectedEventId, "prizes", quizPrizePreset, (_row, index) => `prize-${index + 1}`);
      }
      await logAdmin("이벤트 생성", selectedEventId, type);
    } else if (action === "copyEvent") {
      const sourceId = String(body.eventId || ""); const source = await getEvent(sourceId); const ref = adminDb.collection("events").doc(); selectedEventId = ref.id;
      const { id: _id, status: _status, startDate: _start, endDate: _end, showResults: _show, ...copyable } = source;
      await ref.set({ ...copyable, eventName: `${source.eventName} 복사본`, startDate: "", endDate: "", showResults: false, status: "draft", copiedFrom: sourceId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      const [sourcePrizes, sourceQuizzes] = await Promise.all([eventDocs(sourceId, "prizes"), source.type === "quiz" ? eventDocs(sourceId, "quizzes") : Promise.resolve([])]);
      const batch = adminDb.batch(); sourcePrizes.forEach((doc) => batch.set(eventCollection(selectedEventId, "prizes").doc(), { ...doc.data(), copiedAt: FieldValue.serverTimestamp() })); sourceQuizzes.forEach((doc) => batch.set(eventCollection(selectedEventId, "quizzes").doc(doc.id), { ...doc.data(), copiedAt: FieldValue.serverTimestamp() })); await batch.commit();
      await logAdmin("이벤트 복사", selectedEventId, sourceId);
    } else if (action === "moveEvent") {
      const eventId = String(body.eventId || "");
      const direction = body.direction === "up" ? -1 : 1;
      const events = await listEvents();
      const index = events.findIndex((event) => event.id === eventId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= events.length) throw new Error("더 이상 이동할 수 없습니다.");
      [events[index], events[targetIndex]] = [events[targetIndex], events[index]];
      const batch = adminDb.batch();
      events.forEach((event, order) => batch.set(adminDb.collection("events").doc(event.id), { order, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
      await batch.commit();
      selectedEventId = eventId;
      await logAdmin("이벤트 순서 변경", eventId, direction < 0 ? "위로" : "아래로");
    } else if (action === "deleteEvent") {
      const eventId = String(body.eventId || "");
      if (!eventId || eventId === LEGACY_EVENT_ID) throw new Error("기존 첫 칭찬 이벤트는 삭제할 수 없습니다.");
      const active = await getActiveEvent();
      if (active.id === eventId) throw new Error("현재 활성 이벤트는 삭제할 수 없습니다. 다른 이벤트를 먼저 활성화해 주세요.");
      for (const name of ["prizes", "quizzes", "responses", "attendance", "praises", "meta"]) {
        await deleteCollectionInChunks(eventCollection(eventId, name));
      }
      await adminDb.collection("events").doc(eventId).delete();
      selectedEventId = active.id;
      await logAdmin("이벤트 삭제", eventId);
    } else if (action === "activateEvent") {
      const eventId = String(body.eventId || ""); const next = await getEvent(eventId); if (!next.startDate || !next.endDate) throw new Error("활성화하기 전에 시작일과 종료일을 설정해 주세요.");
      const active = await getActiveEvent(); const batch = adminDb.batch();
      if (active.id !== eventId) batch.set(adminDb.collection("events").doc(active.id), { status: "closed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.set(adminDb.collection("events").doc(eventId), { status: "active", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); batch.set(adminDb.doc("config/activeEvent"), { eventId, updatedAt: FieldValue.serverTimestamp() }); await batch.commit(); selectedEventId = eventId;
      await logAdmin("이벤트 활성화", eventId, next.eventName);
      refreshPublic = true;
    } else if (action === "saveSettings") {
      const eventId = String(body.eventId || ""); const current = await getEvent(eventId); const settings = body.settings || {};
      await adminDb.collection("events").doc(eventId).set({ eventName: String(settings.eventName || current.eventName), intro: String(settings.intro || ""), startDate: String(settings.startDate || ""), endDate: String(settings.endDate || ""), showResults: Boolean(settings.showResults), minChars: Math.max(10, Number(settings.minChars || 20)), detailSchedule: String(settings.detailSchedule || ""), detailAttendance: String(settings.detailAttendance || ""), detailPrizes: String(settings.detailPrizes || ""), detailNotes: String(settings.detailNotes || ""), type: current.type, status: current.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await logAdmin("이벤트 설정 저장", eventId);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "savePrizes") {
      const eventId = String(body.eventId || ""); const rows = (body.prizes || []).map((prize: any, index: number) => ({ name: String(prize.name || "").trim(), amount: Math.max(0, Number(prize.amount || 0)), quantity: Math.max(1, Number(prize.quantity || 1)), active: true, order: index + 1 }));
      await replaceSubcollection(eventId, "prizes", rows, (_row, index) => `prize-${index + 1}`); await logAdmin("상품 저장", eventId, `${rows.length}개`);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "saveQuizzes") {
      const eventId = String(body.eventId || "");
      const rows = (body.quizzes || []).map((quiz: any) => { const options = (quiz.options || []).map((option: unknown) => String(option).trim()).filter(Boolean); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(quiz.date || "")) || !String(quiz.question || "").trim() || options.length < 2) throw new Error("퀴즈 날짜, 문제와 선택지를 확인해 주세요."); return { date: String(quiz.date), question: String(quiz.question).trim(), options, correctIndex: Math.min(options.length - 1, Math.max(0, Number(quiz.correctIndex || 0))), subject: String(quiz.subject || ""), facilitatorComment: String(quiz.facilitatorComment ?? quiz.explanation ?? ""), updatedAt: FieldValue.serverTimestamp() }; });
      await replaceSubcollection(eventId, "quizzes", rows, (row) => row.date); await logAdmin("퀴즈 저장", eventId, `${rows.length}문제`);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "updateQuizResponse") {
      const eventId = String(body.eventId || ""); const responseId = String(body.responseId || ""); const answer = Number(body.answer);
      const responseRef = eventCollection(eventId, "responses").doc(responseId); const responseSnap = await responseRef.get();
      if (!responseSnap.exists) throw new Error("수정할 퀴즈 제출 기록을 찾을 수 없습니다.");
      const response = responseSnap.data() || {}; const quizSnap = await eventCollection(eventId, "quizzes").doc(String(response.date || "")).get(); const quiz = quizSnap.data();
      if (!quizSnap.exists || !quiz) throw new Error("해당 날짜의 퀴즈를 찾을 수 없습니다.");
      const options = Array.isArray(quiz.options) ? quiz.options : [];
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) throw new Error("수정할 답안을 확인해 주세요.");
      await responseRef.update({ answer, correct: answer === Number(quiz.correctIndex), updatedAt: FieldValue.serverTimestamp() }); await logAdmin("퀴즈 제출 답안 수정", responseId, `${answer + 1}번`);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "deleteQuizResponse") {
      const eventId = String(body.eventId || ""); const responseId = String(body.responseId || "");
      if (!responseId) throw new Error("삭제할 퀴즈 제출 기록을 확인해 주세요.");
      await eventCollection(eventId, "responses").doc(responseId).delete(); await logAdmin("퀴즈 제출 기록 삭제", responseId, eventId);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "deletePraise") {
      const eventId = String(body.eventId || ""); const source = eventId === LEGACY_EVENT_ID ? adminDb.collection("praises") : eventCollection(eventId, "praises"); await source.doc(String(body.praiseId || "")).delete(); await logAdmin("칭찬 게시글 삭제", String(body.praiseId || ""), eventId);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "publishResults") {
      const eventId = String(body.eventId || ""); const current = await adminData(eventId) as any;
      const slots = current.prizes.flatMap((prize: any) => Array.from({ length: Math.max(1, Number(prize.quantity || 1)) }, () => prize));
      const results = slots.map((prize: any, index: number) => ({ rank: index + 1, prizeName: prize.name, amount: prize.amount, employeeId: current.standings[index]?.employeeId || "", winnerName: current.standings[index]?.name || "", tickets: current.standings[index]?.tickets || 0 }));
      await Promise.all([eventCollection(eventId, "meta").doc("currentResult").set({ results, publishedAt: FieldValue.serverTimestamp() }), adminDb.collection("events").doc(eventId).set({ showResults: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true })]); await logAdmin("이벤트 결과 공개", eventId, `${results.length}개 순위`);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else if (action === "toggleResultsVisibility") {
      const eventId = String(body.eventId || ""); await adminDb.collection("events").doc(eventId).set({ showResults: Boolean(body.visible), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); await logAdmin(body.visible ? "이벤트 결과 다시 공개" : "이벤트 결과 숨김", eventId);
      refreshPublic = eventId === (await getActiveEvent()).id;
    } else throw new Error("지원하지 않는 작업입니다.");

    const nextAdminData = await adminData(selectedEventId || undefined);
    if (!refreshPublic) return NextResponse.json(nextAdminData);
    revalidateTag("public-event-data", { expire: 0 });
    return NextResponse.json({ ...nextAdminData, publicData: await getCachedPublicData() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "관리자 작업에 실패했습니다." }, { status: 400 }); }
}
