import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { defaultSettings, getCachedPublicData, getSettings, logAdmin } from "@/lib/data";
import { ACTIVE, normalizeEmployeeId, normalizeEmployeeName, serialize } from "@/lib/utils";

async function adminData() {
  const adminDb = getAdminDb();
  const [employees, prizes, settings, results, praises, attendance, currentResult] = await Promise.all([
    adminDb.collection("employees").orderBy("name").get(),
    adminDb.collection("prizes").orderBy("order").get(),
    getSettings(),
    adminDb.collection("drawResults").orderBy("drawnAt", "desc").get(),
    adminDb.collection("praises").orderBy("createdAt", "desc").get(),
    adminDb.collection("attendance").get(),
    adminDb.doc("config/currentResult").get(),
  ]);
  const standings = calculateTicketCandidates(employees.docs, praises.docs, attendance.docs);
  return serialize({
    employees: employees.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        status: ["재직", "휴직", "퇴직"].includes(String(data.status)) ? data.status : ACTIVE,
      };
    }),
    prizes: prizes.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    settings,
    results: results.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    standings: standings.sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name, "ko")),
    praises: praises.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    hasPublishedResult: currentResult.exists,
    resultPublished: currentResult.exists && Boolean(settings.showResults),
  }) as Record<string, unknown>;
}

function parseEmployees(text: string) {
  const seen = new Set<string>();
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(",")))
    .map((cols) => ({
      name: normalizeEmployeeName(cols[0]),
      employeeId: normalizeEmployeeId(cols[1]),
      status: ["재직", "휴직", "퇴직"].includes(String(cols[2] || "").trim())
        ? String(cols[2]).trim()
        : ACTIVE,
    }))
    .filter((row) => {
      if (!row.employeeId || !row.name || /사번/.test(row.employeeId)) return false;
      if (seen.has(row.employeeId)) throw new Error(`사번 ${row.employeeId}이 중복되었습니다.`);
      seen.add(row.employeeId);
      return true;
    });
}

function calculateTicketCandidates(
  employeeDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  praiseDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  attendanceDocs: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  const attendance = new Map<string, number>();
  praiseDocs.forEach((doc) => {
    const row = doc.data();
    if (row.status !== "게시") return;
    sent.set(row.writerId, (sent.get(row.writerId) || 0) + 1);
    received.set(row.targetId, (received.get(row.targetId) || 0) + 1);
  });
  attendanceDocs.forEach((doc) => {
    const id = doc.data().employeeId;
    attendance.set(id, (attendance.get(id) || 0) + 1);
  });
  return employeeDocs.filter((doc) => !["휴직", "퇴직"].includes(String(doc.data().status))).map((doc) => ({
    employeeId: doc.id,
    name: doc.data().name,
    attendance: attendance.get(doc.id) || 0,
    sent: sent.get(doc.id) || 0,
    received: received.get(doc.id) || 0,
    tickets: (sent.get(doc.id) || 0) + (received.get(doc.id) || 0) + (attendance.get(doc.id) || 0),
  }));
}

async function ticketCandidates() {
  const adminDb = getAdminDb();
  const [employees, praises, attendance] = await Promise.all([
    adminDb.collection("employees").get(),
    adminDb.collection("praises").get(),
    adminDb.collection("attendance").get(),
  ]);
  return calculateTicketCandidates(employees.docs, praises.docs, attendance.docs);
}

function weightedPick<T extends { tickets: number }>(items: T[]) {
  const total = items.reduce((sum, item) => sum + Math.max(1, item.tickets), 0);
  let point = Math.random() * total;
  for (const item of items) {
    point -= Math.max(1, item.tickets);
    if (point < 0) return item;
  }
  return items[items.length - 1];
}

async function deleteDocsInChunks(docs: Array<{ ref: FirebaseFirestore.DocumentReference }>) {
  const adminDb = getAdminDb();
  for (let index = 0; index < docs.length; index += 450) {
    const batch = adminDb.batch();
    docs.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return NextResponse.json(await adminData());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "권한이 없습니다." }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
    const adminDb = getAdminDb();
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "importEmployees") {
      const rows = parseEmployees(String(body.text || ""));
      if (!rows.length) throw new Error("등록할 직원 명단이 없습니다.");
      const old = await adminDb.collection("employees").get();
      const batch = adminDb.batch();
      old.docs.forEach((doc) => batch.delete(doc.ref));
      rows.forEach((row) => batch.set(adminDb.collection("employees").doc(row.employeeId), {
        name: row.name,
        status: row.status,
        updatedAt: FieldValue.serverTimestamp(),
      }));
      await batch.commit();
      await logAdmin("직원 명단 일괄 등록", "", `${rows.length}명`);
    } else if (action === "updateEmployeeStatus") {
      const employeeId = normalizeEmployeeId(body.employeeId);
      const status = String(body.status || "");
      if (!["재직", "휴직", "퇴직"].includes(status)) throw new Error("올바른 상태가 아닙니다.");
      await adminDb.collection("employees").doc(employeeId).update({ status, updatedAt: FieldValue.serverTimestamp() });
      await logAdmin("직원 상태 변경", employeeId, status);
    } else if (action === "updateEmployee") {
      const employeeId = normalizeEmployeeId(body.employeeId);
      const name = normalizeEmployeeName(body.name);
      const status = String(body.status || "");
      if (!employeeId || !name) throw new Error("이름과 사번을 확인해 주세요.");
      if (!["재직", "휴직", "퇴직"].includes(status)) throw new Error("올바른 상태가 아닙니다.");
      await adminDb.collection("employees").doc(employeeId).update({
        name,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await logAdmin("직원 정보 수정", employeeId, `${name} / ${status}`);
    } else if (action === "deleteEmployee") {
      const employeeId = normalizeEmployeeId(body.employeeId);
      if (!employeeId) throw new Error("삭제할 직원을 확인해 주세요.");
      await adminDb.collection("employees").doc(employeeId).delete();
      await logAdmin("직원 삭제", employeeId);
    } else if (action === "deletePraise") {
      const praiseId = String(body.praiseId || "");
      if (!praiseId) throw new Error("삭제할 게시글을 확인해 주세요.");
      await adminDb.collection("praises").doc(praiseId).delete();
      await logAdmin("칭찬 게시글 삭제", praiseId);
    } else if (action === "saveSettings") {
      await adminDb.doc("config/settings").set({
        eventName: String(body.settings?.eventName || "칭찬 스티커 이벤트"),
        intro: String(body.settings?.intro || ""),
        startDate: String(body.settings?.startDate || ""),
        endDate: String(body.settings?.endDate || ""),
        showResults: Boolean(body.settings?.showResults),
        minChars: Math.max(10, Number(body.settings?.minChars || 20)),
        detailSchedule: String(body.settings?.detailSchedule || ""),
        detailAttendance: String(body.settings?.detailAttendance || ""),
        detailPrizes: String(body.settings?.detailPrizes || ""),
        detailNotes: String(body.settings?.detailNotes || ""),
      });
      await logAdmin("이벤트 설정 저장");
    } else if (action === "savePrizes") {
      const old = await adminDb.collection("prizes").get();
      const batch = adminDb.batch();
      old.docs.forEach((doc) => batch.delete(doc.ref));
      (body.prizes || []).forEach((prize: any, index: number) => {
        const ref = adminDb.collection("prizes").doc();
        batch.set(ref, {
          name: String(prize.name || "").trim(),
          amount: Math.max(0, Number(prize.amount || 0)),
          quantity: Math.max(0, Number(prize.quantity || 0)),
          active: true,
          order: index + 1,
        });
      });
      await batch.commit();
      await logAdmin("상품 저장");
    } else if (action === "publishResults") {
      const [settings, prizesSnap, standings] = await Promise.all([
        getSettings(),
        adminDb.collection("prizes").where("active", "==", true).get(),
        ticketCandidates(),
      ]);
      const prizes = prizesSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as any))
        .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
      const slots = prizes.flatMap((prize) => Array.from({ length: Math.max(1, Number(prize.quantity || 1)) }, () => prize));
      const ranked = standings.sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name, "ko"));
      const publishedResults = slots.map((prize, index) => ({
        rank: index + 1,
        prizeName: String(prize.name || ""),
        amount: Number(prize.amount || 0),
        employeeId: ranked[index]?.employeeId || "",
        winnerName: ranked[index]?.name || "",
        tickets: ranked[index]?.tickets || 0,
      }));
      const archiveRef = adminDb.collection("eventArchives").doc();
      const batch = adminDb.batch();
      batch.set(archiveRef, {
        eventName: settings.eventName,
        startDate: settings.startDate,
        endDate: settings.endDate,
        results: publishedResults,
        publishedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.doc("config/currentResult"), {
        archiveId: archiveRef.id,
        eventName: settings.eventName,
        results: publishedResults,
        publishedAt: FieldValue.serverTimestamp(),
      });
      batch.set(adminDb.doc("config/settings"), { showResults: true }, { merge: true });
      await batch.commit();
      await logAdmin("이벤트 결과 공개", archiveRef.id, `${publishedResults.length}개 순위`);
    } else if (action === "toggleResultsVisibility") {
      const visible = Boolean(body.visible);
      if (visible) {
        const currentResult = await adminDb.doc("config/currentResult").get();
        if (!currentResult.exists) throw new Error("먼저 결과 공개를 진행해 주세요.");
      }
      await adminDb.doc("config/settings").set({ showResults: visible }, { merge: true });
      await logAdmin(visible ? "이벤트 결과 다시 공개" : "이벤트 결과 숨김");
    } else if (action === "createNewEvent") {
      const [settings, prizesSnap, standings, praisesSnap, attendanceSnap, drawResultsSnap] = await Promise.all([
        getSettings(),
        adminDb.collection("prizes").get(),
        ticketCandidates(),
        adminDb.collection("praises").get(),
        adminDb.collection("attendance").get(),
        adminDb.collection("drawResults").get(),
      ]);
      const prizes = prizesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any)).sort((a, b) => Number(a.order || 999) - Number(b.order || 999));
      const slots = prizes.flatMap((prize) => Array.from({ length: Math.max(1, Number(prize.quantity || 1)) }, () => prize));
      const ranked = standings.sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name, "ko"));
      const finalSnapshot = slots.map((prize, index) => ({
        rank: index + 1,
        prizeName: String(prize.name || ""),
        amount: Number(prize.amount || 0),
        employeeId: ranked[index]?.employeeId || "",
        winnerName: ranked[index]?.name || "",
        tickets: ranked[index]?.tickets || 0,
      }));
      await adminDb.collection("eventArchives").add({
        eventName: settings.eventName,
        startDate: settings.startDate,
        endDate: settings.endDate,
        results: finalSnapshot,
        status: "closed",
        closedAt: FieldValue.serverTimestamp(),
      });
      await Promise.all([
        deleteDocsInChunks(praisesSnap.docs),
        deleteDocsInChunks(attendanceSnap.docs),
        deleteDocsInChunks(prizesSnap.docs),
        deleteDocsInChunks(drawResultsSnap.docs),
      ]);
      await adminDb.doc("config/currentResult").delete();
      await adminDb.doc("config/settings").set({
        ...defaultSettings,
        eventName: "새 칭찬 스티커 이벤트",
        showResults: false,
      });
      await logAdmin("새 이벤트 생성", "", settings.eventName);
    } else if (action === "runDraw") {
      const prizes = await adminDb.collection("prizes").where("active", "==", true).get();
      const candidates = await ticketCandidates();
      const winnerIds = new Set<string>();
      const batch = adminDb.batch();
      for (const prizeDoc of prizes.docs.sort((a, b) => Number(a.data().order) - Number(b.data().order))) {
        const prize = prizeDoc.data();
        for (let i = 0; i < Number(prize.quantity || 0); i++) {
          const pool = candidates.filter((candidate) => !winnerIds.has(candidate.employeeId));
          if (!pool.length) break;
          const winner = weightedPick(pool);
          winnerIds.add(winner.employeeId);
          batch.set(adminDb.collection("drawResults").doc(), {
            prizeId: prizeDoc.id,
            prizeName: prize.name,
            winnerId: winner.employeeId,
            winnerName: winner.name,
            tickets: winner.tickets,
            drawnAt: FieldValue.serverTimestamp(),
          });
        }
      }
      await batch.commit();
      await logAdmin("추첨 실행", "", `${winnerIds.size}명`);
    } else if (action === "resetResults") {
      const results = await adminDb.collection("drawResults").get();
      const batch = adminDb.batch();
      results.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      await logAdmin("추첨 결과 초기화");
    } else {
      throw new Error("지원하지 않는 작업입니다.");
    }

    return NextResponse.json({ ...(await adminData()), publicData: await getCachedPublicData() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "관리자 작업에 실패했습니다." },
      { status: 400 },
    );
  }
}
