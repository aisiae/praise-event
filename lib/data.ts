import { FieldValue } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";
import { getAdminDb } from "@/lib/firebase-admin";
import { getActiveEvent, eventCollection, eventDocs, LEGACY_EVENT_ID, todayQuiz } from "@/lib/events";
import { defaultSettings } from "@/lib/settings";
import { ACTIVE, serialize, todaySeoul } from "@/lib/utils";

export { defaultSettings } from "@/lib/settings";

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
  const settings = await getActiveEvent();
  const praiseQuery = settings.id === LEGACY_EVENT_ID
    ? adminDb.collection("praises").orderBy("createdAt", "desc").limit(20)
    : eventCollection(settings.id, "praises").orderBy("createdAt", "desc").limit(20);
  const attendanceQuery = settings.id === LEGACY_EVENT_ID
    ? adminDb.collection("attendance").where("date", "==", todaySeoul())
    : eventCollection(settings.id, "attendance").where("date", "==", todaySeoul());
  const praiseCountQuery = settings.id === LEGACY_EVENT_ID
    ? adminDb.collection("praises").count()
    : eventCollection(settings.id, "praises").count();
  const [employeesSnap, praisesSnap, praiseCountSnap, prizeDocs, eventResultSnap, legacyResultSnap, attendanceSnap, quiz] = await Promise.all([
    settings.type === "praise" ? adminDb.collection("employees").where("status", "==", ACTIVE).get() : Promise.resolve(null),
    settings.type === "praise" ? praiseQuery.get() : Promise.resolve(null),
    settings.type === "praise" ? praiseCountQuery.get() : Promise.resolve(null),
    eventDocs(settings.id, "prizes"),
    eventCollection(settings.id, "meta").doc("currentResult").get(),
    settings.id === LEGACY_EVENT_ID ? adminDb.doc("config/currentResult").get() : Promise.resolve(null),
    attendanceQuery.get(),
    settings.type === "quiz" ? todayQuiz(settings.id) : Promise.resolve(null),
  ]);
  const currentResultSnap = eventResultSnap.exists ? eventResultSnap : legacyResultSnap;

  const employees = employeesSnap?.docs.map((doc) => ({ id: doc.id, ...doc.data() })) || [];
  const praiseDocs = praisesSnap?.docs || [];
  const praises = praiseDocs
    .filter((doc) => doc.data().status === "게시")
    .map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        targetName: row.targetName,
        content: row.content,
        createdAt: row.createdAt,
      };
    })
    .sort((a: any, b: any) => b.createdAt?.toMillis?.() - a.createdAt?.toMillis?.())
    .slice(0, 20);
  const prizes = prizeDocs
    .filter((doc) => doc.data().active !== false)
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => Number(a.order || 999) - Number(b.order || 999));
  const results = settings.showResults && currentResultSnap?.exists
    ? (currentResultSnap.data()?.results || [])
    : [];

  return serialize({
    settings,
    event: { id: settings.id, type: settings.type, status: settings.status },
    quiz,
    employees,
    praises,
    prizes,
    results,
    stats: { employeeCount: employees.length, praiseCount: praiseCountSnap?.data().count || 0, todayAttendance: attendanceSnap.size },
  });
}

// Public data contains several full-collection queries. Share the result between
// visitors for a short window so a traffic spike does not exhaust Firestore reads.
export const getCachedPublicData = unstable_cache(getPublicData, ["public-event-data"], {
  revalidate: 30,
  tags: ["public-event-data"],
});

export async function logAdmin(action: string, target = "", detail = "") {
  const adminDb = getAdminDb();
  await adminDb.collection("adminLogs").add({ action, target, detail, createdAt: FieldValue.serverTimestamp() });
}
