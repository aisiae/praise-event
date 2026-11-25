import { getAdminDb } from "@/lib/firebase-admin";
import { wishPublication } from "@/lib/wish-publication";

export type WishMode = "test" | "live";

export function wishMode(params: URLSearchParams): WishMode {
  return params.get("mode") === "live" ? "live" : "test";
}

export function wishGardenRoot(mode: WishMode) {
  return getAdminDb().collection("wishGardens").doc(mode === "live" ? "christmas-2026-live" : "christmas-2026-test");
}

export async function getWishPublication() {
  return wishPublication((await wishGardenRoot("live").get()).data()?.schedule);
}
