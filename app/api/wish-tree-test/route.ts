import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeEmployeeId, normalizeEmployeeName, todaySeoul } from "@/lib/utils";
import { fillTargets, growthFor, maxOwnWater, slots, type Garden, type Tree, type WishGardenStatus, type WishOverviewTree } from "@/lib/wish-garden";

import { wishGardenRoot, wishMode, type WishMode } from "@/lib/wish-garden-server";
import { wishPublication } from "@/lib/wish-publication";

const sessionCookie = (mode: WishMode) => mode === "live" ? "wish-tree-session" : "wish-tree-test-session";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const sessions = (mode: WishMode) => wishGardenRoot(mode).collection("sessions");

type Plot = Tree & { owner: string; wish: string };
type Visit = { date: string; resetVersion?: string; targets: number[]; watered: number[] };

async function employeeId(request: NextRequest, mode: WishMode) {
  const token = request.cookies.get(sessionCookie(mode))?.value;
  if (!token) return null;
  const session = (await sessions(mode).doc(hash(token)).get()).data();
  if (!session || session.expiresAt <= Date.now()) return null;
  const person = await getAdminDb().collection("employees").doc(session.employeeId).get();
  return person.data()?.status === "재직" ? { id: person.id, name: String(person.data()?.name ?? "") } : null;
}

async function garden(mode: WishMode, { id, name }: { id: string; name: string }, action?: "plant" | "water" | "decorate" | "edit-wish", slot?: number, wish?: string): Promise<Garden> {
  const root = wishGardenRoot(mode);
  const visitRef = root.collection("visits").doc(id);
  return getAdminDb().runTransaction(async tx => {
    const [board, visitDoc] = await Promise.all([tx.get(root), tx.get(visitRef)]);
    if (mode === "live" && wishPublication(board.data()?.schedule).state !== "open") {
      throw new Error("현재 소원 나무 정원 운영 기간이 아니에요.");
    }
    const plots = (board.data()?.plots ?? []) as Plot[];
    let own = plots.find(plot => plot.owner === id);
    const date = todaySeoul();
    const resetVersion = board.data()?.resetVersion ?? "";
    const old = visitDoc.data() as Visit | undefined;
    const visit: Visit = old?.date === date && (old.resetVersion ?? "") === resetVersion
      ? old : { date, resetVersion, targets: [], watered: [] };

    if (action === "plant") {
      if (own) throw new Error("이미 내 소원나무를 심었어요.");
      if (plots.some(plot => plot.slot === slot)) throw new Error("다른 직원이 먼저 심은 자리예요. 새로고침 후 다른 자리를 골라 주세요.");
      own = { slot: slot!, count: 0, owner: id, wish: wish! };
      plots.push(own);
    }
    if (action === "edit-wish") {
      if (!own || own.slot !== slot) throw new Error("내 소원나무에 적은 소원만 수정할 수 있어요.");
      own.wish = wish!;
    }
    if (own) visit.targets = fillTargets(plots, own.slot, visit.targets.filter(target => plots.some(plot => plot.slot === target && plot.slot !== own.slot)), randomInt);
    if (action === "water" || action === "decorate") {
      const plot = plots.find(item => item.slot === slot);
      if (!own || !plot) throw new Error("나무를 확인해 주세요.");
      if (visit.watered.includes(plot.slot)) throw new Error(action === "water" ? "오늘은 이미 내 나무에 물을 줬어요." : "오늘은 이 나무에 이미 장식을 달았어요.");
      if (action === "water") {
        if (plot.owner !== id) throw new Error("내 나무에만 물을 줄 수 있어요.");
        if (growthFor(plot) >= maxOwnWater) throw new Error("내 나무가 23칸 모두 자랐어요.");
        plot.ownWater = growthFor(plot) + 1;
      } else {
        if (plot.owner === id || !visit.targets.includes(plot.slot)) throw new Error("오늘 장식을 달 수 있는 동료 나무를 확인해 주세요.");
        plot.friendWater = (plot.friendWater ?? 0) + 1;
        own.ornamentsGiven = (own.ornamentsGiven ?? 0) + 1;
      }
      plot.count += 1;
      visit.watered.push(plot.slot);
    }
    if (action) tx.set(root, { plots }, { merge: true });
    if (own && (action || JSON.stringify(old) !== JSON.stringify(visit))) tx.set(visitRef, visit);
    return {
      signedIn: true,
      name,
      trees: plots.map(({ slot, count, ownWater = 0, friendWater = 0, ornamentsGiven }) => ({ slot, count, ownWater, friendWater, ...(slot === own?.slot && { ornamentsGiven: ornamentsGiven ?? 0 }) })),
      mine: own ? { slot: own.slot, wish: own.wish } : null,
      targets: visit.targets,
      watered: visit.watered,
    };
  });
}

async function adminStatus(request: NextRequest, mode: WishMode) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    await requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "관리자로 로그인한 뒤 확인해 주세요." }, { status: 403, headers });
  }
  try {
    const db = getAdminDb();
    const today = todaySeoul();
    const root = wishGardenRoot(mode);
    if (request.nextUrl.searchParams.get("view") === "admin-overview") {
      const plots = ((await root.get()).data()?.plots ?? []) as Plot[];
      const ownerIds = [...new Set(plots.map(plot => plot.owner))];
      const people = ownerIds.length ? await db.getAll(...ownerIds.map(id => db.collection("employees").doc(id))) : [];
      const names = new Map(people.map(person => [person.id, String(person.data()?.name ?? "")]));
      const trees: WishOverviewTree[] = plots.map(({ slot, count, ownWater, friendWater, owner, wish }) => ({
        slot, count, ownWater, friendWater, wish, ownerName: names.get(owner) || "이름 확인 불가",
      }));
      return NextResponse.json({ trees }, { headers });
    }
    const data = await db.runTransaction(async tx => {
      const [board, employees, visits] = await Promise.all([
        tx.get(root),
        tx.get(db.collection("employees").where("status", "==", "재직")),
        tx.get(root.collection("visits").where("date", "==", today)),
      ]);
      const plots = (board.data()?.plots ?? []) as Plot[];
      const byOwner = new Map(plots.map(plot => [plot.owner, plot]));
      const resetVersion = board.data()?.resetVersion ?? "";
      const watered = new Map(visits.docs.flatMap(doc => {
        const visit = doc.data() as Visit;
        return (visit.resetVersion ?? "") === resetVersion ? [[doc.id, visit.watered] as const] : [];
      }));
      const rows = employees.docs.map(employee => {
        const plot = byOwner.get(employee.id);
        const todaySlots = watered.get(employee.id) ?? [];
        return {
          id: employee.id,
          name: String(employee.data().name ?? ""),
          tree: plot ? { slot: plot.slot, count: plot.count, ownWater: plot.ownWater ?? 0, friendWater: plot.friendWater ?? 0, ornamentsGiven: plot.ornamentsGiven ?? 0, wish: plot.wish } : null,
          wateredOwnToday: !!plot && todaySlots.includes(plot.slot),
          wateredOthersToday: todaySlots.filter(slot => slot !== plot?.slot).length,
        };
      }).sort((a, b) => Number(!!b.tree) - Number(!!a.tree) || a.name.localeCompare(b.name, "ko"));
      return { today, capacity: slots.length, occupied: plots.length, rows };
    }, { readOnly: true });
    return NextResponse.json(data satisfies WishGardenStatus, { headers });
  } catch {
    return NextResponse.json({ error: "참여 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503, headers });
  }
}

export async function GET(request: NextRequest) {
  const mode = wishMode(request.nextUrl.searchParams);
  const view = request.nextUrl.searchParams.get("view");
  if (view === "admin-status" || view === "admin-overview") return adminStatus(request, mode);
  try {
    if (mode === "live" && wishPublication((await wishGardenRoot(mode).get()).data()?.schedule).state !== "open") {
      return NextResponse.json({ error: "현재 소원 나무 정원 운영 기간이 아니에요." }, { status: 403 });
    }
    const id = await employeeId(request, mode);
    return NextResponse.json(id ? await garden(mode, id) : { signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "공동 마당을 불러오지 못했어요." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const mode = wishMode(request.nextUrl.searchParams);
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("정원 페이지에서 다시 시도해 주세요.");
    const body = await request.json();
    if (body.action === "login") {
      const id = normalizeEmployeeId(body.employeeId);
      const name = normalizeEmployeeName(body.name);
      if (!id || id.length > 100 || id.includes("/") || id === "." || id === ".." || !name || name.length > 100) throw new Error("이름과 사번을 확인해 주세요.");
      const person = (await getAdminDb().collection("employees").doc(id).get()).data();
      if (person?.status !== "재직" || normalizeEmployeeName(person.name) !== name) throw new Error("이름과 사번을 확인해 주세요.");
      const token = randomBytes(32).toString("hex");
      const data = await garden(mode, { id, name: String(person.name) });
      await sessions(mode).doc(hash(token)).set({ employeeId: id, expiresAt: Date.now() + 86400000 });
      const response = NextResponse.json(data);
      response.cookies.set(sessionCookie(mode), token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 86400 });
      return response;
    }
    if (body.action === "logout") {
      const token = request.cookies.get(sessionCookie(mode))?.value;
      if (token) await sessions(mode).doc(hash(token)).delete();
      const response = NextResponse.json({ signedIn: false });
      response.cookies.delete(sessionCookie(mode));
      return response;
    }
    const id = await employeeId(request, mode);
    if (!id) throw new Error("직원 로그인이 필요합니다.");
    const { action, slot } = body;
    const wish = typeof body.wish === "string" ? body.wish.trim() : "";
    if ((action !== "plant" && action !== "water" && action !== "decorate" && action !== "edit-wish") || !Number.isInteger(slot) || slot < 0 || slot >= slots.length) throw new Error("나무 자리를 확인해 주세요.");
    if ((action === "plant" || action === "edit-wish") && (!wish || wish.length > 150)) throw new Error("소원을 1~150자로 입력해 주세요.");
    return NextResponse.json(await garden(mode, id, action, slot, wish));
  } catch (error) {
    const message = error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "마당을 저장하지 못했어요. 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
