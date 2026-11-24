import { createHash, randomBytes, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeEmployeeId, normalizeEmployeeName, todaySeoul } from "@/lib/utils";
import { fillTargets, slots, type Garden, type Tree, type WishGardenStatus } from "@/lib/wish-garden";

const cookie = "wish-tree-test-session";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const event = () => getAdminDb().collection("wishGardens").doc("christmas-2026-test");
const sessions = () => event().collection("sessions");

type Plot = Tree & { owner: string; wish: string };
type Visit = { date: string; targets: number[]; watered: number[] };

async function employeeId(request: NextRequest) {
  const token = request.cookies.get(cookie)?.value;
  if (!token) return null;
  const session = (await sessions().doc(hash(token)).get()).data();
  if (!session || session.expiresAt <= Date.now()) return null;
  const person = await getAdminDb().collection("employees").doc(session.employeeId).get();
  return person.data()?.status === "재직" ? person.id : null;
}

async function garden(id: string, action?: "plant" | "water", slot?: number, wish?: string): Promise<Garden> {
  const root = event();
  const visitRef = root.collection("visits").doc(id);
  return getAdminDb().runTransaction(async tx => {
    const [board, visitDoc] = await Promise.all([tx.get(root), tx.get(visitRef)]);
    const plots = (board.data()?.plots ?? []) as Plot[];
    let own = plots.find(plot => plot.owner === id);
    const date = todaySeoul();
    const old = visitDoc.data() as Visit | undefined;
    const visit: Visit = old?.date === date ? old : { date, targets: [], watered: [] };

    if (action === "plant") {
      if (own) throw new Error("이미 내 소원나무를 심었어요.");
      if (plots.some(plot => plot.slot === slot)) throw new Error("다른 직원이 먼저 심은 자리예요. 새로고침 후 다른 자리를 골라 주세요.");
      own = { slot: slot!, count: 0, owner: id, wish: wish! };
      plots.push(own);
    }
    if (own) visit.targets = fillTargets(plots, own.slot, visit.targets, randomInt);
    if (action === "water") {
      const plot = plots.find(item => item.slot === slot);
      if (!own || !plot || (slot !== own.slot && !visit.targets.includes(slot!))) throw new Error("오늘 물줄 수 있는 나무를 확인해 주세요.");
      if (visit.watered.includes(plot.slot)) throw new Error("오늘 이 나무에 이미 물을 주었어요.");
      plot.count += 1;
      visit.watered.push(plot.slot);
    }
    if (action) tx.set(root, { plots }, { merge: true });
    if (own && (action || JSON.stringify(old) !== JSON.stringify(visit))) tx.set(visitRef, visit);
    return {
      signedIn: true,
      trees: plots.map(({ slot, count }) => ({ slot, count })),
      mine: own ? { slot: own.slot, wish: own.wish } : null,
      targets: visit.targets,
      watered: visit.watered,
    };
  });
}

async function adminStatus(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    await requireAdmin(request);
  } catch {
    return NextResponse.json({ error: "관리자로 로그인한 뒤 확인해 주세요." }, { status: 403, headers });
  }
  try {
    const db = getAdminDb();
    const today = todaySeoul();
    const root = event();
    const data = await db.runTransaction(async tx => {
      const [board, employees, visits] = await Promise.all([
        tx.get(root),
        tx.get(db.collection("employees").where("status", "==", "재직")),
        tx.get(root.collection("visits").where("date", "==", today)),
      ]);
      const plots = (board.data()?.plots ?? []) as Plot[];
      const byOwner = new Map(plots.map(plot => [plot.owner, plot]));
      const watered = new Map(visits.docs.map(visit => [visit.id, (visit.data() as Visit).watered]));
      const rows = employees.docs.map(employee => {
        const plot = byOwner.get(employee.id);
        const todaySlots = watered.get(employee.id) ?? [];
        return {
          id: employee.id,
          name: String(employee.data().name ?? ""),
          tree: plot ? { slot: plot.slot, count: plot.count, wish: plot.wish } : null,
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
  if (request.nextUrl.searchParams.get("view") === "admin-status") return adminStatus(request);
  try {
    const id = await employeeId(request);
    return NextResponse.json(id ? await garden(id) : { signedIn: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "공동 마당을 불러오지 못했어요." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("테스트 페이지에서 다시 시도해 주세요.");
    const body = await request.json();
    if (body.action === "login") {
      const id = normalizeEmployeeId(body.employeeId);
      const name = normalizeEmployeeName(body.name);
      if (!id || id.length > 100 || id.includes("/") || id === "." || id === ".." || !name || name.length > 100) throw new Error("이름과 사번을 확인해 주세요.");
      const person = (await getAdminDb().collection("employees").doc(id).get()).data();
      if (person?.status !== "재직" || normalizeEmployeeName(person.name) !== name) throw new Error("이름과 사번을 확인해 주세요.");
      const token = randomBytes(32).toString("hex");
      const data = await garden(id);
      await sessions().doc(hash(token)).set({ employeeId: id, expiresAt: Date.now() + 86400000 });
      const response = NextResponse.json(data);
      response.cookies.set(cookie, token, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 86400 });
      return response;
    }
    if (body.action === "logout") {
      const token = request.cookies.get(cookie)?.value;
      if (token) await sessions().doc(hash(token)).delete();
      const response = NextResponse.json({ signedIn: false });
      response.cookies.delete(cookie);
      return response;
    }
    const id = await employeeId(request);
    if (!id) throw new Error("직원 로그인이 필요합니다.");
    const { action, slot } = body;
    const wish = typeof body.wish === "string" ? body.wish.trim() : "";
    if ((action !== "plant" && action !== "water") || !Number.isInteger(slot) || slot < 0 || slot >= slots.length) throw new Error("나무 자리를 확인해 주세요.");
    if (action === "plant" && (!wish || wish.length > 150)) throw new Error("소원을 1~150자로 입력해 주세요.");
    return NextResponse.json(await garden(id, action, slot, wish));
  } catch (error) {
    const message = error instanceof Error && /[가-힣]/.test(error.message) ? error.message : "마당을 저장하지 못했어요. 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
