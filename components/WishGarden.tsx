"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fillTargets, slots, stages, stageFor, type Garden } from "@/lib/wish-garden";
import styles from "./WishGarden.module.css";

const empty: Garden = { signedIn: false, trees: [], mine: null, targets: [], watered: [] };
const start = { x: 518, y: 744 };
const directions = [
  { key: "ArrowUp", x: 0, y: -1, symbol: "↑", label: "위" },
  { key: "ArrowLeft", x: -1, y: 0, symbol: "←", label: "왼쪽" },
  { key: "ArrowDown", x: 0, y: 1, symbol: "↓", label: "아래" },
  { key: "ArrowRight", x: 1, y: 0, symbol: "→", label: "오른쪽" },
];
const demoTrees = [{ slot: 34, count: 2 }, { slot: 37, count: 5 }, { slot: 28, count: 8 }, { slot: 19, count: 12 }];

export default function WishGarden() {
  const [garden, setGarden] = useState(empty);
  const [demo, setDemo] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [wish, setWish] = useState("");
  const [plantSlot, setPlantSlot] = useState<number | null>(null);
  const [position, setPosition] = useState(start);
  const [splash, setSplash] = useState<number | null>(null);
  const pressed = useRef(new Set<string>());
  const viewport = useRef<HTMLDivElement>(null);
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = garden.signedIn || demo;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/wish-tree-test", { signal: controller.signal })
      .then(response => response.json())
      .then(data => { if (data.signedIn) setGarden(data); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!garden.signedIn || demo || busy) return;
    const controller = new AbortController();
    const refresh = () => {
      if (document.hidden) return;
      fetch("/api/wish-tree-test", { signal: controller.signal }).then(response => response.json())
        .then(data => { if (!controller.signal.aborted && data.signedIn) setGarden(data); }).catch(() => {});
    };
    const timer = setInterval(refresh, 8000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [garden.signedIn, demo, busy]);

  useEffect(() => {
    if (!active) return;
    const held = pressed.current;
    const clearKeys = () => held.clear();
    const down = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (directions.some(direction => direction.key === event.key)) {
        event.preventDefault();
        held.add(event.key);
      }
    };
    const up = (event: KeyboardEvent) => held.delete(event.key);
    const move = () => {
      const delta = directions.filter(direction => held.has(direction.key)).reduce(
        (point, direction) => ({ x: point.x + direction.x, y: point.y + direction.y }), { x: 0, y: 0 },
      );
      if (!delta.x && !delta.y) return;
      const speed = 5 / Math.hypot(delta.x, delta.y);
      setPosition(point => ({
        x: Math.min(1010, Math.max(30, point.x + delta.x * speed)),
        y: Math.min(765, Math.max(186, point.y + delta.y * speed)),
      }));
    };
    const interval = setInterval(move, 24);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clearKeys);
    return () => {
      clearInterval(interval);
      clearKeys();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clearKeys);
    };
  }, [active]);

  useEffect(() => {
    const view = viewport.current;
    view?.scrollTo(position.x - view.clientWidth / 2, position.y - view.clientHeight / 2);
  }, [position, active]);
  useEffect(() => () => { if (splashTimer.current) clearTimeout(splashTimer.current); }, []);

  const treesBySlot = new Map(garden.trees.map(tree => [tree.slot, tree]));
  const closeSlot = slots.findIndex(point => Math.hypot(point.x - position.x, point.y + 12 - position.y) < 46);
  const closeTree = treesBySlot.get(closeSlot);
  const canWater = !!closeTree && (garden.mine?.slot === closeSlot || garden.targets.includes(closeSlot));
  const alreadyWatered = garden.watered.includes(closeSlot);

  async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/wish-tree-test", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "잠시 후 다시 시도해 주세요.");
    return data.signedIn ? data as Garden : empty;
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setNote("");
    try { await work(); }
    catch (error) { setNote(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    void run(async () => setGarden(await send({ action: "login", ...fields })));
  }

  function plant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plantSlot === null || !wish.trim()) return;
    const slot = plantSlot;
    void run(async () => {
      if (demo) setGarden({ ...garden, trees: [...garden.trees, { slot, count: 0 }], mine: { slot, wish: wish.trim() }, targets: fillTargets(garden.trees, slot, [], max => Math.floor(Math.random() * max)) });
      else setGarden(await send({ action: "plant", slot, wish }));
      setPlantSlot(null);
      setWish("");
      setNote("내 소원나무를 심었어요!");
    });
  }

  function water() {
    if (!closeTree || !canWater || alreadyWatered || busy) return;
    void run(async () => {
      const next = demo ? {
        ...garden, watered: [...garden.watered, closeSlot],
        trees: garden.trees.map(tree => tree.slot === closeSlot ? { ...tree, count: tree.count + 1 } : tree),
      } : await send({ action: "water", slot: closeSlot });
      setGarden(next);
      setSplash(closeSlot);
      if (splashTimer.current) clearTimeout(splashTimer.current);
      splashTimer.current = setTimeout(() => setSplash(null), 850);
      const count = next.trees.find(tree => tree.slot === closeSlot)!.count;
      setNote(stageFor(count) > stageFor(closeTree.count) ? `나무가 자랐어요! ${stages[stageFor(count)]} · 누적 ${count}회` : `물을 주었어요! 누적 ${count}회`);
    });
  }

  function nextDemoDay() {
    if (!garden.mine) return;
    setGarden({
      ...garden, watered: [],
      targets: fillTargets(garden.trees, garden.mine.slot, [], max => Math.floor(Math.random() * max)),
    });
    setNote("다음 테스트 날이에요. 다시 물을 줄 수 있어요.");
  }

  return <main className={styles.garden}>
    <header className={styles.header}>
      <div><p>12월 이벤트 테스트</p><h1>2027 소원나무 마당</h1></div>
      {active && <button disabled={busy} onClick={() => void run(async () => {
        setGarden(demo ? empty : await send({ action: "logout" }));
        setDemo(false);
        setPosition(start);
        setPlantSlot(null);
        setWish("");
      })}>{demo ? "체험 나가기" : "로그아웃"}</button>}
    </header>
    {!active && <section className={styles.entry}>
      <h2>눈 내린 산사에 소원나무를 심어 보세요</h2>
      <p>직원으로 로그인하면 다른 직원이 심은 익명 나무도 같은 마당에서 볼 수 있어요.</p>
      <form onSubmit={login}>
        <input required name="name" aria-label="직원 이름" placeholder="직원 이름" maxLength={100} />
        <input required name="employeeId" aria-label="사번" placeholder="사번" maxLength={100} />
        <button disabled={busy || checking}>직원 로그인</button>
      </form>
      <button disabled={busy || checking} onClick={() => { setDemo(true); setGarden({ ...empty, trees: demoTrees }); setNote(""); }}>로그인 없이 조작 체험</button>
    </section>}
    {active && <div className={styles.toolbar}>
      <span>내 나무 {garden.mine && garden.watered.includes(garden.mine.slot) ? "1" : "0"}/1</span>
      <span>동료 나무 {garden.targets.filter(slot => garden.watered.includes(slot)).length}/{garden.targets.length}</span>
      {garden.mine && <button onClick={() => {
        const point = slots[garden.mine!.slot];
        setPosition({ x: point.x, y: point.y + 30 });
      }}>내 나무 찾기</button>}
      {demo && garden.mine && <button onClick={nextDemoDay}>다음 날 체험</button>}
    </div>}
    <div className={styles.scene}>
      <div ref={viewport} className={styles.viewport} aria-label="소원나무 마당">
        <div className={styles.world}>
          <div className={styles.path} aria-hidden="true" />
          <div className={styles.temple} aria-hidden="true"><div className={styles.roof} /><div className={styles.doors}>✦</div></div>
          <div className={styles.lights} aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} />)}</div>
          <div className={styles.wreath} aria-hidden="true">✦</div>
          <div className={styles.gate} aria-hidden="true">소원나무 마당</div>
          {slots.map((point, slot) => {
            const tree = treesBySlot.get(slot);
            const mine = garden.mine?.slot === slot;
            const target = garden.targets.includes(slot) && !garden.watered.includes(slot);
            return <div key={slot} className={styles.plot} style={{ left: point.x, top: point.y, zIndex: Math.round(point.y) }}>
              {tree ? <>
                {mine ? <div className={styles.wish}>{garden.mine?.wish}</div> : target && <div className={styles.target} aria-label="오늘의 물주기 대상">💧</div>}
                <div className={styles.tree} data-stage={stageFor(tree.count)} data-splash={splash === slot} role="img" aria-label={`${mine ? "내 나무" : "익명 나무"} · ${stages[stageFor(tree.count)]} · 물주기 ${tree.count}회`}>
                  <i /><i /><i /><b>✦</b><em>● ✦ ●</em>
                </div>
                {splash === slot && <div className={styles.splash} aria-hidden="true">💧✧</div>}
              </> : <div className={styles.emptyPlot} aria-hidden="true" />}
            </div>;
          })}
          {active && <div className={styles.avatar} aria-label="내 캐릭터" style={{ left: position.x, top: position.y, zIndex: Math.round(position.y) }}>
            <i /><b /><em />
          </div>}
        </div>
      </div>
      {active && <>
        <div className={styles.pad} aria-label="터치 방향키">
          {directions.map(direction => <button key={direction.key} aria-label={direction.label}
            onPointerDown={event => {
              event.currentTarget.setPointerCapture(event.pointerId);
              pressed.current.add(direction.key);
              setPosition(point => ({ x: Math.min(1010, Math.max(30, point.x + direction.x * 5)), y: Math.min(765, Math.max(186, point.y + direction.y * 5)) }));
            }}
            onLostPointerCapture={() => pressed.current.delete(direction.key)}
            onPointerUp={() => pressed.current.delete(direction.key)}
            onPointerCancel={() => pressed.current.delete(direction.key)}
          >{direction.symbol}</button>)}
        </div>
        <div className={styles.action}>
          {!garden.mine && closeSlot >= 0 && !closeTree && <button onClick={() => setPlantSlot(closeSlot)}>여기에 소원나무 심기</button>}
          {canWater && <button disabled={alreadyWatered || busy} onClick={water}>{alreadyWatered ? "오늘 물주기 완료" : "💧 물주기"}</button>}
        </div>
      </>}
    </div>
    <p className={styles.instructions}>{active ? "방향키나 화면 버튼으로 이동하세요. 나무 가까이에서 심기와 물주기를 할 수 있어요." : "직원 로그인 또는 조작 체험으로 마당에 들어갈 수 있어요."}</p>
    <div role="status" className={styles.status}>{note}</div>
    {plantSlot !== null && <div className={styles.shade}>
      <form role="dialog" aria-modal="true" aria-labelledby="wish-title" onSubmit={plant}>
        <h2 id="wish-title">내 소원나무 심기</h2>
        <p>나무 위에는 내 소원이 표시돼요. 다른 직원에게는 나무만 보여요.</p>
        <textarea autoFocus required maxLength={150} aria-label="2027년 소원" value={wish} onChange={event => setWish(event.target.value)} placeholder="2027년에 이루고 싶은 소원을 적어 주세요." />
        <button type="button" disabled={busy} onClick={() => { setPlantSlot(null); setNote(""); }}>취소</button>
        <button disabled={busy || !wish.trim()}>나무 심기</button>
        {note && <p role="alert">{note}</p>}
      </form>
    </div>}
  </main>;
}
