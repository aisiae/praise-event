import { randomInt, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { defaultWishPrizes, wishScore, type Tree, type WishDraw, type WishPrize } from "@/lib/wish-garden";

const root = () => getAdminDb().collection("wishGardens").doc("christmas-2026-test");
const rules = () => root().collection("admin").doc("prizes");
const headers = { "Cache-Control": "private, no-store" };

async function authorized(request: NextRequest) {
  try {
    await requireAdmin(request);
    return true;
  } catch {
    return false;
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers });
}

export async function GET(request: NextRequest) {
  if (!await authorized(request)) return bad("관리자 로그인이 필요해요.", 403);
  try {
    const data = (await rules().get()).data();
    return NextResponse.json({ prizes: data?.prizes ?? defaultWishPrizes, result: data?.result ?? null }, { headers });
  } catch {
    return bad("상품과 결과를 불러오지 못했어요.", 503);
  }
}

function validPrizes(value: unknown): value is WishPrize[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return false;
  return value.every(item => item && typeof item.name === "string" && item.name.trim().length > 0 &&
    item.name.length <= 30 && Number.isInteger(item.amount) && item.amount > 0 && item.amount <= 1000000 &&
    Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 40) &&
    value.reduce((total, item) => total + item.quantity, 0) <= 40 &&
    new Set(value.map(item => item.name.trim())).size === value.length;
}

export async function POST(request: NextRequest) {
  if (!await authorized(request)) return bad("관리자 로그인이 필요해요.", 403);
  try {
    const body = await request.json();
    if (body.action === "reset") {
      const batch = getAdminDb().batch();
      batch.set(root(), { plots: [], resetVersion: randomUUID() }, { merge: true });
      batch.set(rules(), { result: null }, { merge: true });
      await batch.commit();
      return NextResponse.json({ reset: true }, { headers });
    }
    if (body.action === "save") {
      if (!validPrizes(body.prizes)) return bad("상품명은 서로 다르게 입력하고, 지급액과 전체 인원(최대 40명)을 확인해 주세요.");
      const prizes: WishPrize[] = body.prizes.map(({ name, amount, quantity }: WishPrize) => ({ name: name.trim(), amount, quantity }));
      await rules().set({ prizes }, { merge: true });
      return NextResponse.json({ prizes }, { headers });
    }
    if (body.action !== "draw") return bad("요청을 확인해 주세요.");
    const result = await getAdminDb().runTransaction(async tx => {
      const [settings, board, employees] = await Promise.all([
        tx.get(rules()), tx.get(root()),
        tx.get(getAdminDb().collection("employees").where("status", "==", "재직")),
      ]);
      const prizes = (settings.data()?.prizes ?? defaultWishPrizes) as WishPrize[];
      const plots = (board.data()?.plots ?? []) as (Tree & { owner: string })[];
      const byOwner = new Map(plots.map(plot => [plot.owner, plot]));
      const candidates = employees.docs.flatMap(person => {
        const plot = byOwner.get(person.id);
        return plot ? [{ name: String(person.data().name ?? ""), score: wishScore(plot) }] : [];
      });
      if (!candidates.length) return null;
      const pool = [...candidates];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      pool.sort((a, b) => b.score - a.score);
      const winners: WishDraw["winners"] = [];
      for (const prize of prizes) {
        for (let i = 0; i < prize.quantity && pool.length > 0; i++) {
          const person = pool.shift()!;
          winners.push({ ...person, prize: prize.name, amount: prize.amount });
        }
      }
      const result: WishDraw = { drawnAt: Date.now(), eligible: candidates.length, winners };
      tx.set(rules(), { result }, { merge: true });
      return result;
    });
    if (!result) return bad("먼저 직원 로그인으로 테스트 나무를 한 그루 이상 심어 주세요.");
    return NextResponse.json({ result }, { headers });
  } catch {
    return bad("요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  }
}
