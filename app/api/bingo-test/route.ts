import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { addBingoCompletionDrawOrder } from "@/lib/bingo-prize-draw";
import { getAdminDb } from "@/lib/firebase-admin";
import { bingoEvent as event, bingoParticipants as ref, readBingoConfig as config, submitBingoAnswer, ensureOperationalBingo } from "@/lib/bingo-test-server";
import { totals, restoreBingoAnswerCells, validateBingoConfig, type BingoCell, type BingoConfig } from "@/lib/bingo-test";
function error(e:unknown){return NextResponse.json({error:e instanceof Error?e.message:"처리하지 못했습니다."},{status:400})}
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const mode = request.nextUrl.searchParams.get("mode") === "live" ? "live" : "test";
    if (mode === "live") await ensureOperationalBingo();
    const [employees, participants, settings] = await Promise.all([
      getAdminDb().collection("employees").orderBy("name").get(), ref(mode).get(), event(mode).get(),
    ]);
    const saved = config(settings.data(), mode);
    const states = new Map(participants.docs.map(doc => [doc.id, doc.data()]));
    const rows = employees.docs.filter(doc => !["퇴직", "휴직"].includes(String(doc.get("status")))).map(doc => {
      const state = states.get(doc.id);
      const participation = Number(state?.participation || 0);
      const cells = restoreBingoAnswerCells((state?.cells || []) as BingoCell[], participation).map(cell => {
        const question = cell.questionIndex === undefined ? null : saved.questions[cell.questionIndex];
        return question && !cell.answer ? { ...cell, label: `${question[1]} / ${question[2]}` } : cell;
      });
      const summary = totals(cells);
      const cardPoints = Number(state?.cardPoints ?? 0);
      return { id: doc.id, name: String(doc.get("name") || ""), participation, cells,
        ...summary, cardPoints, score: summary.score + cardPoints };
    }).sort((a, b) => b.score - a.score || b.participation - a.participation || a.name.localeCompare(b.name, "ko"));
    const rankedRows = mode === "live" ? await addBingoCompletionDrawOrder(rows, event(mode)) : rows;
    return NextResponse.json({ rows: rankedRows, config: saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request:NextRequest){try{await requireAdmin(request);const mode=request.nextUrl.searchParams.get("mode")==="live"?"live":"test";if(mode==="live")await ensureOperationalBingo();const body=await request.json(),db=getAdminDb();if(body.action==="publish"||body.action==="unpublish"){if(mode!=="live")throw new Error("운영 이벤트에서만 게시 상태를 변경할 수 있습니다.");await db.runTransaction(async tx=>{const snapshot=await tx.get(event(mode)),old=config(snapshot.data(),mode);if(body.version!==old.version)throw new Error("설정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");validateBingoConfig(old);if(body.action==="publish"&&(!old.startDate||!old.endDate))throw new Error("게시 전에 시작일과 종료일을 입력하고 저장해 주세요.");tx.update(event(mode),{status:body.action==="publish"?"active":"draft",version:old.version+1,updatedAt:Date.now()})});revalidateTag("public-event-data",{expire:0});return NextResponse.json({ok:true})}if(body.action==="savePrizes"||body.action==="saveQuestions"||body.action==="saveSettings"){await db.runTransaction(async tx=>{const snapshot=await tx.get(event(mode)),old=config(snapshot.data(),mode);if(body.version!==old.version)throw new Error("다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 저장해 주세요.");const next:BingoConfig=body.action==="savePrizes"?{...old,prizes:body.prizes,minScore:body.minScore}:body.action==="saveQuestions"?{...old,questions:body.questions}:{...old,eventName:body.eventName,intro:body.intro,startDate:body.startDate,endDate:body.endDate,detailSchedule:body.detailSchedule,detailAttendance:body.detailAttendance,detailPrizes:body.detailPrizes,detailNotes:body.detailNotes,allowRepeatTest:mode==="test"};validateBingoConfig(next);tx.set(event(mode),{...next,questions:next.questions.map(q=>({question:q[0],options:[q[1],q[2]]})),version:old.version+1,updatedAt:Date.now()});});if(mode==="live")revalidateTag("public-event-data",{expire:0});return NextResponse.json({ok:true})}
const id=String(body.employeeId||""),answer=Number(body.answer);if(!id||id.includes("/")||![0,1].includes(answer))throw new Error("직원과 답변을 확인해 주세요.");await submitBingoAnswer(id,answer,Number(body.expectedDay),mode);return NextResponse.json({ok:true})}catch(e){return error(e)}}
