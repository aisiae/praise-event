import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { getSettings } from "@/lib/data";
import { ACTIVE, isEventOpen, normalizeEmployeeId, normalizeEmployeeName } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const body = await request.json();
    const writerId = normalizeEmployeeId(body.writerId);
    const writerName = normalizeEmployeeName(body.writerName);
    const targetId = normalizeEmployeeId(body.targetId);
    const content = String(body.content || "").trim();
    const settings = await getSettings();

    if (!isEventOpen(settings)) throw new Error("현재 이벤트 참여 기간이 아닙니다.");
    if (writerId === targetId) throw new Error("본인은 칭찬할 수 없습니다.");
    if (content.replace(/\s/g, "").length < Number(settings.minChars || 20)) {
      throw new Error(`칭찬 내용은 공백 제외 ${settings.minChars}자 이상 작성해 주세요.`);
    }

    const [writerSnap, targetSnap] = await Promise.all([
      adminDb.collection("employees").doc(writerId).get(),
      adminDb.collection("employees").doc(targetId).get(),
    ]);
    const writer = writerSnap.data();
    const target = targetSnap.data();
    if (!writer || writer.status !== ACTIVE || normalizeEmployeeName(writer.name) !== writerName) {
      throw new Error("작성자 정보를 다시 확인해 주세요.");
    }
    if (!target || target.status !== ACTIVE) throw new Error("칭찬 대상자를 찾을 수 없습니다.");

    const ref = adminDb.collection("praises").doc(`${writerId}_${targetId}`);
    await adminDb.runTransaction(async (tx) => {
      const duplicate = await tx.get(ref);
      if (duplicate.exists) throw new Error("이미 해당 직원을 칭찬했습니다.");
      tx.set(ref, {
        writerId,
        writerName: writer.name,
        targetId,
        targetName: target.name,
        content,
        status: "게시",
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      praise: {
        id: ref.id,
        targetId,
        targetName: target.name,
        content,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "칭찬을 등록하지 못했습니다." }, { status: 400 });
  }
}

async function requirePraiseOwner(body: Record<string, unknown>) {
  const adminDb = getAdminDb();
  const praiseId = String(body.praiseId || "");
  const writerId = normalizeEmployeeId(body.writerId);
  const writerName = normalizeEmployeeName(body.writerName);
  const [praiseSnap, employeeSnap] = await Promise.all([
    adminDb.collection("praises").doc(praiseId).get(),
    adminDb.collection("employees").doc(writerId).get(),
  ]);
  const praise = praiseSnap.data();
  const employee = employeeSnap.data();
  if (!praiseSnap.exists || !praise || praise.writerId !== writerId) throw new Error("작성한 칭찬글을 찾을 수 없습니다.");
  if (!employee || normalizeEmployeeName(employee.name) !== writerName) throw new Error("작성자 정보를 확인해 주세요.");
  return { adminDb, praiseId, praise };
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminDb, praiseId } = await requirePraiseOwner(body);
    const content = String(body.content || "").trim();
    const settings = await getSettings();
    if (content.replace(/\s/g, "").length < Number(settings.minChars || 20)) {
      throw new Error(`칭찬 내용은 공백 제외 ${settings.minChars}자 이상 작성해 주세요.`);
    }
    await adminDb.collection("praises").doc(praiseId).update({
      content,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, content });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "칭찬글을 수정하지 못했습니다." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminDb, praiseId } = await requirePraiseOwner(body);
    await adminDb.collection("praises").doc(praiseId).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "칭찬글을 삭제하지 못했습니다." }, { status: 400 });
  }
}
