"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fillTargets, slots, stages, stageFor, type Garden } from "@/lib/wish-garden";
import WishScene from "./WishScene";
import styles from "./WishGarden.module.css";

const empty: Garden = { signedIn: false, trees: [], mine: null, targets: [], watered: [] };
const start = { x: 518, y: 744 };
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

  function sceneAction(event: React.KeyboardEvent<HTMLElement>) {
    if (event.code !== "KeyE" || event.repeat || !active || busy || plantSlot !== null ||
        (event.target instanceof HTMLElement && event.target.closest("input,textarea"))) return;
    if (!garden.mine && closeSlot >= 0 && !closeTree) setPlantSlot(closeSlot);
    else if (canWater && !alreadyWatered) water();
  }

  function nextDemoDay() {
    if (!garden.mine) return;
    setGarden({
      ...garden, watered: [],
      targets: fillTargets(garden.trees, garden.mine.slot, [], max => Math.floor(Math.random() * max)),
    });
    setNote("다음 테스트 날이에요. 다시 물을 줄 수 있어요.");
  }

  return <main className={styles.garden} onKeyDown={sceneAction}>
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
      <WishScene active={active} blocked={plantSlot !== null} garden={garden} position={position} onMove={setPosition} splash={splash} />
      {active && <>
        <div className={styles.action}>
          {!garden.mine && closeSlot >= 0 && !closeTree && <button onClick={() => setPlantSlot(closeSlot)}>여기에 소원나무 심기 <kbd>E</kbd></button>}
          {canWater && <button disabled={alreadyWatered || busy} onClick={water}>{alreadyWatered ? "오늘 물주기 완료" : <>💧 물주기 <kbd>E</kbd></>}</button>}
        </div>
      </>}
    </div>
    <p className={styles.instructions}>{active ? "PC는 마당 클릭 후 마우스로 둘러보고, 방향키나 WASD로 이동해요. E로 심기·물주기, Esc로 마우스를 해제해요. 모바일은 왼쪽 조이스틱으로 이동하고 마당을 밀어 둘러보세요." : "직원 로그인 또는 조작 체험으로 마당에 들어갈 수 있어요."}</p>
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
