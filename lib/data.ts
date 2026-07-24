import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { ACTIVE, serialize, todaySeoul } from "@/lib/utils";

export const defaultSettings = {
  eventName: "칭찬 스티커 이벤트",
  intro: "동료에게 따뜻한 칭찬과 고마움을 전하고 행운의 주인공이 되어 보세요.",
  startDate: "",
  endDate: "",
  showResults: false,
  minChars: 20,
  detailSchedule: "이벤트 기간 동안 매일 참여할 수 있으며, 추첨 결과는 이벤트 종료 후 안내합니다.",
  detailAttendance: "이벤트 기간 중 하루 1회 로그인하면 출석 스티커 1장이 지급됩니다.\n칭찬을 작성하거나 받으면 각각 스티커 1장이 추가됩니다.",
  detailPrizes: "보유한 스티커 수를 기준으로 가중치 추첨을 진행합니다.\n등록된 상품과 수량은 이벤트 운영 상황에 따라 변경될 수 있습니다.",
  detailNotes: "동일한 동료에게는 한 번만 칭찬할 수 있으며, 본인에게는 칭찬을 작성할 수 없습니다.",
};

export async function getSettings() {
  const adminDb = getAdminDb();
  const snap = await adminDb.doc("config/settings").get();
  const settings = { ...defaultSettings, ...(snap.exists ? snap.data() : {}) };
  if (settings.intro === "동료에게 따뜻한 칭찬을 전하고 행운의 주인공이 되어 보세요.") {
    settings.intro = defaultSettings.intro;
  }
  return settings;
}

export async function getPublicData() {
  const adminDb = getAdminDb();
  const [settings, employeesSnap, praisesSnap, prizesSnap, resultsSnap, attendanceSnap] = await Promise.all([
    getSettings(),
    adminDb.collection("employees").where("status", "==", ACTIVE).get(),
    adminDb.collection("praises").where("status", "==", "게시").get(),
    adminDb.collection("prizes").where("active", "==", true).get(),
    adminDb.collection("drawResults").orderBy("drawnAt", "desc").get(),
    adminDb.collection("attendance").where("date", "==", todaySeoul()).get(),
  ]);

  const employees = employeesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const praises = praisesSnap.docs
    .map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        targetName: row.targetName,
        content: row.content,
        createdAt: row.createdAt,
      };
    })
    .sort((a: any, b: any) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.());
  const prizes = prizesSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => Number(a.order || 999) - Number(b.order || 999));
  const results = settings.showResults ? resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) : [];

  return serialize({
    settings,
    employees,
    praises,
    prizes,
    results,
    stats: { employeeCount: employees.length, praiseCount: praises.length, todayAttendance: attendanceSnap.size },
  });
}

export async function logAdmin(action: string, target = "", detail = "") {
  const adminDb = getAdminDb();
  await adminDb.collection("adminLogs").add({ action, target, detail, createdAt: FieldValue.serverTimestamp() });
}
