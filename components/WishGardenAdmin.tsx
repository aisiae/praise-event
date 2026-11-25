"use client";

import { useEffect, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import WishPublication from "./WishPublication";
import WishPrizes from "./WishPrizes";
import WishGardenOverview from "./WishGardenOverview";
import { maxOwnWater, wishScore, type WishGardenStatus } from "@/lib/wish-garden";

const path = "/wish-tree-test";

function ParticipationStatus({ mode }: { mode: "test" | "live" }) {
  const [data, setData] = useState<WishGardenStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const user = getFirebaseAuth().currentUser;
        if (!user) throw new Error("관리자로 로그인한 뒤 확인해 주세요.");
        const token = await user.getIdToken();
        const response = await fetch("/api/wish-tree-test?view=admin-status&mode=" + mode, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "현황을 불러오지 못했어요.");
        if (!controller.signal.aborted) {
          setData(result);
          setNotice("");
        }
      } catch (error) {
        if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "현황을 불러오지 못했어요.");
      } finally {
        loading = false;
      }
    }
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 10000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh, mode]);

  const planted = data?.rows.filter(row => row.tree).length ?? 0;
  const wateredToday = data?.rows.filter(row => row.wateredOwnToday || row.wateredOthersToday).length ?? 0;
  const rows = (data?.rows.filter(row => filter === "all" || (filter === "planted" ? !!row.tree : !row.tree)) ?? [])
    .sort((a, b) => (b.tree ? wishScore(b.tree) : -1) - (a.tree ? wishScore(a.tree) : -1));
  const selected = data?.rows.find(row => row.id === selectedId);

  return <section className="panel admin-section">
    <div className="section-head">
      <div><h3>이벤트 현황</h3><p>{data?.today && `${data.today} 한국시간 · `}10초마다 갱신</p></div>
      <div className="actions">
        <button type="button" className="button primary" onClick={() => setOverviewOpen(true)}>전체 현황</button>
        <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)}>새로고침</button>
      </div>
    </div>
    {overviewOpen && <WishGardenOverview mode={mode} onClose={() => setOverviewOpen(false)} />}
    {notice && <p role="alert">{notice}{data && " 마지막으로 불러온 현황을 표시하고 있어요."}</p>}
    {!data && !notice && <p role="status">참여 현황을 불러오는 중이에요.</p>}
    {data && <>
      <div className="bingo-metrics">
        <div><span>참여 직원</span><strong>{planted}<small> / {data.rows.length}명</small></strong></div>
        <div><span>참여율</span><strong>{data.rows.length ? Math.round(planted / data.rows.length * 100) : 0}<small>%</small></strong></div>
        <div><span>오늘 활동한 직원</span><strong>{wateredToday}<small>명</small></strong></div>
        <div><span>사용 중인 자리</span><strong>{data.occupied}<small> / {data.capacity}</small></strong></div>
      </div>
      <p>재직 직원 기준이에요. 이름을 누르면 자리와 작성한 소원을 확인할 수 있어요.</p>
      <p>내 나무 물주기 3점 · 동료에게 준 장식 1점 · 내 나무에 받은 장식 1점</p>
      <label>참여 상태
        <select value={filter} onChange={event => { setFilter(event.target.value); setSelectedId(null); }}>
          <option value="all">전체</option><option value="planted">심기 완료</option><option value="pending">미참여</option>
        </select>
      </label>
      {selected?.tree && <section className="bingo-share-box" aria-label="소원 상세">
        <div className="section-head">
          <h3>{selected.name}님의 소원 · {selected.tree.slot + 1}번 자리</h3>
          <button type="button" className="button secondary" onClick={() => setSelectedId(null)}>닫기</button>
        </div>
        <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{selected.tree.wish}</p>
      </section>}
      <div className="table-wrap">
        <table>
          <thead><tr><th scope="col">직원 이름</th><th scope="col">식재</th><th scope="col">크기 성장</th><th scope="col">받은 장식</th><th scope="col">준 장식</th><th scope="col">총점</th><th scope="col">오늘 내 나무</th><th scope="col">오늘 장식한 나무</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td>{row.tree ? <button type="button" className="bingo-name" onClick={() => setSelectedId(row.id)}>{row.name}</button> : row.name}</td>
            <td>{row.tree ? "심기 완료" : "미참여"}</td>
            <td>{row.tree ? `${Math.min(maxOwnWater, row.tree.ownWater ?? 0)} / ${maxOwnWater}` : "—"}</td>
            <td>{row.tree ? `${row.tree.friendWater ?? 0}개` : "—"}</td>
            <td>{row.tree ? `${row.tree.ornamentsGiven ?? 0}개` : "—"}</td>
            <td><strong>{row.tree ? `${wishScore(row.tree)}점` : "—"}</strong></td>
            <td>{row.tree ? (row.wateredOwnToday ? "완료" : "미완료") : "—"}</td>
            <td>{row.tree ? `${row.wateredOthersToday}회` : "—"}</td>
          </tr>)}</tbody>
        </table>
        {!rows.length && <p>이 조건에 해당하는 직원이 없어요.</p>}
      </div>
    </>}
  </section>;
}

export default function WishGardenAdmin({ mode }: { mode: "test" | "live" }) {
  const [tab, setTab] = useState<"settings" | "status" | "prizes" | "results">("settings");
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).href;

  async function resetTest() {
    if (resetting || !window.confirm("소원나무 테스트의 모든 소원, 나무, 참여 기록과 테스트 결과를 초기화할까요?")) return;
    setResetting(true);
    setNotice("");
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("관리자로 로그인한 뒤 다시 시도해 주세요.");
      const response = await fetch("/api/wish-tree-test/admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const result = await response.json();
      if (!response.ok || !result.reset) throw new Error(result.error || "테스트를 초기화하지 못했어요.");
      setNotice("테스트 초기화 완료. 나무 0그루부터 다시 시작할 수 있어요.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "테스트를 초기화하지 못했어요.");
    } finally {
      setResetting(false);
    }
  }

  return <section className="bingo-test embedded-bingo">
    <nav className="admin-tabs" aria-label="소원나무 관리자 메뉴">
      {([["settings", "이벤트 설정"], ["prizes", "상품 관리"], ["status", "이벤트 현황"], ["results", "결과"]] as const).map(([id, label]) => (
        <button key={id} type="button" className={tab === id ? "active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>{label}</button>
      ))}
    </nav>
    {tab === "status" ? <ParticipationStatus mode={mode} /> : tab === "prizes" || tab === "results" ? <WishPrizes key={tab} tab={tab} mode={mode} /> : <section className="panel admin-section">
      <h3>이벤트 설정</h3>
      {mode === "live" ? <WishPublication /> : <>
      <button type="button" className="button secondary" aria-expanded={mobile} onClick={() => setMobile(value => !value)}>
        {mobile ? "모바일 테스트 닫기" : "모바일 관리자 테스트"}
      </button>
      {mobile && <iframe title="2027 소원 나무 정원 모바일 관리자 테스트" src={path + "?admin-test"} style={{ display: "block", margin: "12px auto", width: "min(390px, 100%)", height: "min(780px, 80dvh)", border: "1px solid #e3d4f0", borderRadius: 18 }} />}
      <div className="bingo-share-box">
        <h3>공유 테스트 링크</h3>
        <p>직원 이름과 사번으로 로그인하면 같은 정원에 입장합니다. 관리자 테스트에서는 테스트 나무에 물을 23회 연속으로 주거나 장식을 반복해서 달 수 있습니다.</p>
        <input readOnly aria-label="공유 테스트 링크" value={url} onFocus={event => event.target.select()} />
        <div className="actions">
          <button type="button" className="button primary" onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setNotice("테스트 링크를 복사했어요.");
            } catch {
              setNotice("위 주소를 선택해서 복사해 주세요.");
            }
          }}>공유 테스트 링크 복사</button>
          <a className="button secondary" href={path} target="_blank" rel="noreferrer">직원 참여 화면 열기 ↗</a>
          <a className="button secondary" href={path + "?admin-test"} target="_blank" rel="noreferrer">관리자 테스트 열기 ↗</a>
          <button type="button" className="button secondary" disabled={resetting} onClick={resetTest}>{resetting ? "초기화 중…" : "테스트 초기화"}</button>
        </div>
        {notice && <p role="status">{notice}</p>}
      </div>
      </>}
    </section>}
  </section>;
}
