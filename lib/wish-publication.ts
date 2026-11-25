export type WishSchedule = { startsAt: string; endsAt: string };
export type WishPublication = { schedule: WishSchedule | null; state: "draft" | "scheduled" | "open" | "ended" };

function seoulTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value + ":00+09:00");
  if (!Number.isFinite(time)) return NaN;
  return new Date(time + 9 * 3600000).toISOString().slice(0, 16) === value ? time : NaN;
}

export function parseWishSchedule(startsAt: unknown, endsAt: unknown): WishSchedule | null {
  if (typeof startsAt !== "string" || typeof endsAt !== "string") return null;
  return seoulTime(startsAt) < seoulTime(endsAt) ? { startsAt, endsAt } : null;
}

export function wishPublication(schedule: WishSchedule | null | undefined, now = Date.now()): WishPublication {
  const valid = parseWishSchedule(schedule?.startsAt, schedule?.endsAt);
  if (!valid) return { schedule: null, state: "draft" };
  if (now < seoulTime(valid.startsAt)) return { schedule: valid, state: "scheduled" };
  return { schedule: valid, state: now < seoulTime(valid.endsAt) ? "open" : "ended" };
}
