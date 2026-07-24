import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { getPublicData, getSettings, logAdmin } from "@/lib/data";
import { ACTIVE, normalizeEmployeeId, normalizeEmployeeName, serialize } from "@/lib/utils";

async function adminData() {
  const adminDb = getAdminDb();
  const [employees, prizes, settings, results] = await Promise.all([
    adminDb.collection("employees").orderBy("name").get(),
    adminDb.collection("prizes").orderBy("order").get(),
    getSettings(),
    adminDb.collection("drawResults").orderBy("drawnAt", "desc").get(),
  ]);
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

async function ticketCandidates() {
  const adminDb = getAdminDb();
  const [employeesSnap, praisesSnap, attendanceSnap] = await Promise.all([
    adminDb.collection("employees").where("status", "==", ACTIVE).get(),
    adminDb.collection("praises").where("status", "==", "게시").get(),
    adminDb.collection("attendance").get(),
  ]);
  const sent = new Map<string, number>();
  const received = new Map<string, number>();
  const attendance = new Map<string, number>();
  praisesSnap.docs.forEach((doc) => {
    const row = doc.data();
    sent.set(row.writerId, (sent.get(row.writerId) || 0) + 1);
    received.set(row.targetId, (received.get(row.targetId) || 0) + 1);
  });
  attendanceSnap.docs.forEach((doc) => {
    const id = doc.data().employeeId;
    attendance.set(id, (attendance.get(id) || 0) + 1);
  });
  return employeesSnap.docs.map((doc) => ({
    employeeId: doc.id,
    name: doc.data().name,
    tickets: 1 + (sent.get(doc.id) || 0) + (received.get(doc.id) || 0) + (attendance.get(doc.id) || 0),
  }));
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
    } else if (action === "saveSettings") {
      await adminDb.doc("config/settings").set({
        eventName: String(body.settings?.eventName || "칭찬 스티커 이벤트"),
        intro: String(body.settings?.intro || ""),
        startDate: String(body.settings?.startDate || ""),
        endDate: String(body.settings?.endDate || ""),
        showResults: Boolean(body.settings?.showResults),
        minChars: Math.max(10, Number(body.settings?.minChars || 20)),
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

    return NextResponse.json({ ...(await adminData()), publicData: await getPublicData() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "관리자 작업에 실패했습니다." },
      { status: 400 },
    );
  }
}
