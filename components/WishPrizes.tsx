"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { defaultWishPrizes, type WishDraw, type WishPrize } from "@/lib/wish-garden";

type Settings = { prizes: WishPrize[]; result: WishDraw | null };
const money = (value: number) => value.toLocaleString("ko-KR") + "원";

async function request(mode: "test" | "live", body?: object, signal?: AbortSignal) {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("관리자 로그인이 필요해요.");
  const token = await user.getIdToken();
  const response = await fetch("/api/wish-tree-test/admin?mode=" + mode, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data as Settings;
}

export default function WishPrizes({ tab, mode }: { tab: "prizes" | "results"; mode: "test" | "live" }) {
  const [prizes, setPrizes] = useState(defaultWishPrizes);
  const [result, setResult] = useState<WishDraw | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request(mode, undefined, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setPrizes(data.prizes);
      setResult(data.result);
      setReady(true);
    }).catch(error => {
      if (!controller.signal.aborted) setNotice(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [mode, reload]);

  async function submit(action: "save" | "draw") {
    setLoading(true);
    setNotice("");
    try {
      const data = await request(mode, action === "save" ? { action, prizes } : { action });
      if (action === "save") setPrizes(data.prizes);
      else setResult(data.result);
      setConfirmDraw(false);
      setNotice(action === "save" ? "테스트 상품을 저장했어요." : "테스트 시상 결과를 저장했어요.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "요청을 처리하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  function update(index: number, patch: Partial<WishPrize>) {
    setPrizes(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  return <section className="panel admin-section">
    <h3>{tab === "prizes" ? "상품 관리" : "테스트 시상 결과"}</h3>
    {loading && !ready && <p>상품과 결과를 불러오는 중이에요.</p>}
    {!ready && !loading && <button type="button" className="button secondary" onClick={() => { setLoading(true); setNotice(""); setReload(value => value + 1); }}>다시 불러오기</button>}
    {ready && (tab === "prizes" ? <form onSubmit={event => { event.preventDefault(); void submit("save"); }}>
      <p>목록의 위쪽 등수부터 배정해요. 설정은 테스트 결과 산정에 사용돼요.</p>
      <fieldset disabled={loading} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="prize-editor">{prizes.map((prize, index) => <div className="prize-row" key={index}>
          <label>상품명<input required maxLength={30} value={prize.name} onChange={event => update(index, { name: event.target.value })} /></label>
          <label>1인 지급액<input required type="number" min={1} max={1000000} value={prize.amount || ""} onChange={event => update(index, { amount: Number(event.target.value) })} /></label>
          <label>인원<input required type="number" min={1} max={40} value={prize.quantity || ""} onChange={event => update(index, { quantity: Number(event.target.value) })} /></label>
          <button type="button" className="button secondary" disabled={prizes.length < 2} onClick={() => setPrizes(rows => rows.filter((_, i) => i !== index))}>삭제</button>
        </div>)}</div>
        <p><strong>총 {prizes.reduce((sum, prize) => sum + prize.quantity, 0)}명 · {money(prizes.reduce((sum, prize) => sum + prize.amount * prize.quantity, 0))}</strong></p>
        <div className="actions">
          <button type="button" className="button secondary" disabled={prizes.length >= 10} onClick={() => setPrizes(rows => [...rows, { name: "", amount: 5000, quantity: 1 }])}>상품 추가</button>
          <button className="button primary">상품 저장</button>
        </div>
      </fieldset>
    </form> : <>
      <p>테스트 나무를 심은 재직 직원에게 총점이 높은 순서로 상품을 배정해요. 같은 점수는 무작위로 순서를 정하고, 한 사람이 한 번만 선정돼요.</p>
      {confirmDraw ? <div className="actions">
        <button type="button" className="button primary" disabled={loading} onClick={() => void submit("draw")}>새 테스트 결과 저장</button>
        <button type="button" className="button secondary" disabled={loading} onClick={() => setConfirmDraw(false)}>취소</button>
      </div> : <button type="button" className="button primary" disabled={loading} onClick={() => result ? setConfirmDraw(true) : void submit("draw")}>{result ? "테스트 결과 다시 산정" : "테스트 결과 산정"}</button>}
      {result ? <>
        <p>{new Date(result.drawnAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} · 대상 {result.eligible}명 중 {result.winners.length}명 · {money(result.winners.reduce((sum, winner) => sum + winner.amount, 0))}</p>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">상품</th><th scope="col">당첨자</th><th scope="col">총점</th><th scope="col">지급액</th></tr></thead>
          <tbody>{result.winners.map((winner, index) => <tr key={index}><td>{winner.prize}</td><td>{winner.name}</td><td>{winner.score === undefined ? "—" : `${winner.score}점`}</td><td>{money(winner.amount)}</td></tr>)}</tbody>
        </table></div>
      </> : <p>저장된 테스트 시상 결과가 없어요.</p>}
    </>)}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
