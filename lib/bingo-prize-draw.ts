import { createHmac, randomBytes } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";

type BingoResult = { id: string; opened: number; score: number };

async function readDrawSeed(event: DocumentReference): Promise<string> {
  const draw = event.collection("prizeDraws").doc("boardCompletion");
  const existing = (await draw.get()).get("seed");
  if (typeof existing === "string") return existing;

  return draw.firestore.runTransaction(async transaction => {
    const saved = (await transaction.get(draw)).get("seed");
    if (typeof saved === "string") return saved;

    const seed = randomBytes(32).toString("hex");
    transaction.set(draw, { seed });
    return seed;
  });
}

export async function addBingoCompletionDrawOrder<T extends BingoResult>(
  rows: T[],
  event: DocumentReference,
): Promise<(T & { completionDrawOrder?: number })[]> {
  const completed = rows.filter(row => row.opened === 36);
  if (new Set(completed.map(row => row.score)).size === completed.length) return rows;

  const seed = await readDrawSeed(event);
  const draw = completed.map(({ id }) => ({
    id,
    ticket: createHmac("sha256", seed).update(id).digest("hex"),
  })).sort((a, b) => a.ticket.localeCompare(b.ticket) || a.id.localeCompare(b.id));
  const positions = new Map(draw.map(({ id }, order) => [id, order + 1]));

  return rows.map(row => ({ ...row, completionDrawOrder: positions.get(row.id) }));
}
