import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { defaultSettings, instagramPrizePreset } from "@/lib/settings";
import { serialize, todaySeoul } from "@/lib/utils";

export const LEGACY_EVENT_ID = "praise-legacy";
export const INSTAGRAM_EVENT_ID = "instagram-2026-10";
export type EventType = "praise" | "quiz" | "instagram";
export type EventStatus = "draft" | "active" | "closed";

export type EventRecord = typeof defaultSettings & {
  id: string;
  type: EventType;
  status: EventStatus;
  copiedFrom?: string;
  order?: number;
};

function normalizeEvent(id: string, value: FirebaseFirestore.DocumentData = {}): EventRecord {
  return {
    ...defaultSettings,
    ...value,
    id,
    type: value.type === "quiz" || value.type === "instagram" ? value.type : "praise",
    status: ["draft", "active", "closed"].includes(String(value.status)) ? value.status : "draft",
  } as EventRecord;
}

export async function ensureLegacyEvent() {
  const adminDb = getAdminDb();
  const [activeSnap, eventSnap, legacySettings, legacyResult, migratedResult] = await Promise.all([
    adminDb.doc("config/activeEvent").get(),
    adminDb.collection("events").doc(LEGACY_EVENT_ID).get(),
    adminDb.doc("config/settings").get(),
    adminDb.doc("config/currentResult").get(),
    eventCollection(LEGACY_EVENT_ID, "meta").doc("currentResult").get(),
  ]);
  const batch = adminDb.batch();
  let changed = false;
  if (!eventSnap.exists) {
    batch.set(adminDb.collection("events").doc(LEGACY_EVENT_ID), {
      ...defaultSettings,
      ...(legacySettings.exists ? legacySettings.data() : {}),
      eventName: legacySettings.data()?.eventName || "칭찬 우체국 1회차",
      type: "praise",
      status: activeSnap.exists ? "draft" : "active",
      legacyData: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    changed = true;
  }
  if (!activeSnap.exists) {
    batch.set(adminDb.doc("config/activeEvent"), { eventId: LEGACY_EVENT_ID, updatedAt: FieldValue.serverTimestamp() });
    changed = true;
  }
  if (legacyResult.exists && !migratedResult.exists) {
    batch.set(eventCollection(LEGACY_EVENT_ID, "meta").doc("currentResult"), legacyResult.data() || {});
    changed = true;
  }
  if (changed) await batch.commit();
  await ensureInstagramEvent();
}

async function ensureInstagramEvent() {
  const adminDb = getAdminDb();
  const ref = adminDb.collection("events").doc(INSTAGRAM_EVENT_ID);
  const snap = await ref.get();
  if (snap.exists) return;
  const batch = adminDb.batch();
  batch.set(ref, {
    ...defaultSettings,
    eventName: "나도 인스타!",
    intro: "타임스탬프로 포착한 특별한 일상을 사진과 함께 공유해 보세요.",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    type: "instagram",
    status: "draft",
    minChars: 5,
    detailSchedule: "2026년 10월 1일부터 10월 31일까지 특별한 일상을 공유해 주세요.",
    detailAttendance: "게시글 3점 · 댓글 2점 · 좋아요 1점으로 활동 점수를 합산합니다.",
    detailPrizes: "총 30만원 상당의 상품권을 지급합니다. 1등 1명 10만원, 2등 2명 각 5만원, 3등 2명 각 3만원, 인기 게시글 2명 각 2만원입니다.",
    detailNotes: "사진에는 촬영 일시를 확인할 수 있는 타임스탬프가 보여야 합니다. 활동 점수가 같으면 본인이 작성한 게시글이 받은 좋아요 합계가 높은 순으로 선정합니다.",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  instagramPrizePreset.forEach((prize, index) => batch.set(eventCollection(INSTAGRAM_EVENT_ID, "prizes").doc(`prize-${index + 1}`), { ...prize, active: true, order: index + 1, eventId: INSTAGRAM_EVENT_ID }));
  await batch.commit();
}

export async function getEvent(eventId: string) {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("events").doc(eventId).get();
  if (snap.exists) return normalizeEvent(snap.id, snap.data());
  if (eventId === LEGACY_EVENT_ID) {
    const legacy = await adminDb.doc("config/settings").get();
    return normalizeEvent(LEGACY_EVENT_ID, {
      ...(legacy.exists ? legacy.data() : {}),
      eventName: legacy.data()?.eventName || "칭찬 우체국 1회차",
      type: "praise",
      status: "active",
      legacyData: true,
    });
  }
  throw new Error("이벤트를 찾을 수 없습니다.");
}

export async function getActiveEvent() {
  const adminDb = getAdminDb();
  const active = await adminDb.doc("config/activeEvent").get();
  return getEvent(String(active.data()?.eventId || LEGACY_EVENT_ID));
}

export async function listEvents() {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection("events").orderBy("createdAt", "desc").get();
  const rows = snap.docs.map((doc) => normalizeEvent(doc.id, doc.data()));
  if (!rows.some((row) => row.id === LEGACY_EVENT_ID)) rows.push(await getEvent(LEGACY_EVENT_ID));
  return serialize(rows.sort((a, b) => Number(a.order ?? 9999) - Number(b.order ?? 9999))) as EventRecord[];
}

export function eventCollection(eventId: string, name: string) {
  return getAdminDb().collection("events").doc(eventId).collection(name);
}

export async function eventDocs(eventId: string, legacyCollection: string) {
  const adminDb = getAdminDb();
  if (eventId === LEGACY_EVENT_ID) {
    const snap = await adminDb.collection(legacyCollection).get();
    return snap.docs.filter((doc) => !doc.data().eventId || doc.data().eventId === LEGACY_EVENT_ID);
  }
  return (await eventCollection(eventId, legacyCollection).get()).docs;
}

export async function todayQuiz(eventId: string) {
  const snap = await eventCollection(eventId, "quizzes").doc(todaySeoul()).get();
  if (!snap.exists) return null;
  const row = snap.data() || {};
  return serialize({ id: snap.id, date: snap.id, question: row.question, options: row.options || [], subject: row.subject || "", facilitatorComment: row.facilitatorComment || row.explanation || "" });
}
