import { Timestamp } from "firebase-admin/firestore";

export const ACTIVE = "재직";

export function normalizeEmployeeId(value: unknown) {
  return String(value ?? "").normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").trim();
}

export function normalizeEmployeeName(value: unknown) {
  return String(value ?? "").normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").trim();
}

export function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

export function isEventOpen(settings: Record<string, unknown>) {
  const today = todaySeoul();
  const start = String(settings.startDate || "");
  const end = String(settings.endDate || "");
  return (!start || today >= start) && (!end || today <= end);
}
