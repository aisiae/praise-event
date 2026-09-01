import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { defaultSettings } from "@/lib/settings";
import { serialize, todaySeoul } from "@/lib/utils";

export const LEGACY_EVENT_ID = "praise-legacy";
export type EventType = "praise" | "quiz";
export type EventStatus = "draft" | "active" | "closed";

export type EventRecord = typeof defaultSettings & {
  id: string;
  type: EventType;
  status: EventStatus;
  copiedFrom?: string;
};

function normalizeEvent(id: string, value: FirebaseFirestore.DocumentData = {}): EventRecord {
  return {
    ...defaultSettings,
    ...value,
    id,
    type: value.type === "quiz" ? "quiz" : "praise",
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
  return serialize(rows) as EventRecord[];
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
  return serialize({ id: snap.id, date: snap.id, question: row.question, options: row.options || [], subject: row.subject || "", explanation: row.explanation || "" });
}
