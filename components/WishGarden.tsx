"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type FormEvent } from "react";
import { fillTargets, slots, maxOwnWater, maxFriendWater, wishScore, type Garden } from "@/lib/wish-garden";
import WishScene from "./WishScene";
import styles from "./WishGarden.module.css";

const empty: Garden = { signedIn: false, trees: [], mine: null, targets: [], watered: [] };
const start = { x: 518, y: 744 };
const demoTrees = [2, 5, 11, 19].map((ownWater, index) => ({ slot: [34, 37, 28, 19][index], count: ownWater * 2, ownWater, friendWater: ownWater }));

export default function WishGarden() {
  const [garden, setGarden] = useState(empty);
  const [demo, setDemo] = useState(false);
  const [showMax, setShowMax] = useState(false);
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
  const isOwn = garden.mine?.slot === closeSlot;
  const canWater = !!closeTree && (garden.mine?.slot === closeSlot || garden.targets.includes(closeSlot));
  const ownTree = garden.mine ? treesBySlot.get(garden.mine.slot) : undefined;
  const previewSlot = garden.mine?.slot ?? 35;
  const visibleGarden = useMemo(() => {
    if (!showMax) return garden;
    const maximum = { slot: previewSlot, count: maxOwnWater + maxFriendWater, ownWater: maxOwnWater, friendWater: maxFriendWater };
    return { ...garden, trees: [...garden.trees.filter(tree => tree.slot !== previewSlot), maximum] };
  }, [garden, previewSlot, showMax]);

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
    if (!closeTree || !canWater || busy || showMax) return;
    void run(async () => {
      const next = demo ? {
        ...garden, watered: [...new Set([...garden.watered, closeSlot])],
        trees: garden.trees.map(tree => {
          if (tree.slot === closeSlot) return {
            ...tree, count: tree.count + 1,
            ownWater: (tree.ownWater ?? 0) + Number(isOwn),
            friendWater: (tree.friendWater ?? 0) + Number(!isOwn),
          };
          if (!isOwn && tree.slot === garden.mine?.slot) return { ...tree, ornamentsGiven: (tree.ornamentsGiven ?? 0) + 1 };
          return tree;
        }),
      } : await send({ action: isOwn ? "water" : "decorate", slot: closeSlot });
      setGarden(next);
      setSplash(closeSlot);
      if (splashTimer.current) clearTimeout(splashTimer.current);
      splashTimer.current = setTimeout(() => setSplash(null), 850);
      const tree = next.trees.find(tree => tree.slot === closeSlot)!;
      setNote(garden.mine?.slot === closeSlot
        ? `내 나무 크기 ${Math.min(maxOwnWater, tree.ownWater ?? 0)}/${maxOwnWater} · 물주기 ${tree.ownWater ?? 0}회`
        : `동료 나무에 장식을 달았어요! 누적 ${tree.friendWater ?? 0}개`);
    });
  }

  const sceneAction = useEffectEvent((event: KeyboardEvent) => {
    if ((event.code !== "KeyE" && event.key.toLowerCase() !== "e") || event.repeat || !active || busy || showMax || plantSlot !== null ||
        (event.target instanceof HTMLElement && event.target.closest("input,textarea"))) return;
    if (!garden.mine && closeSlot >= 0 && !closeTree) {
      event.preventDefault();
      setPlantSlot(closeSlot);
    } else if (canWater) {
      event.preventDefault();
      water();
    }
  });

  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => sceneAction(event);
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [active]);

  function nextDemoDay() {
    if (!garden.mine) return;
    setGarden({
      ...garden, watered: [],
      targets: fillTargets(garden.trees, garden.mine.slot, [], max => Math.floor(Math.random() * max)),
    });
    setNote("다음 테스트 날이에요. 다시 물을 줄 수 있어요.");
  }

  return <main className={styles.garden} data-playing={active}>
    <header className={styles.header}>
      <div><p>12월 이벤트 테스트</p><h1>2027 소원나무 마당</h1></div>
      {active && <button disabled={busy} onClick={() => void run(async () => {
        setGarden(demo ? empty : await send({ action: "logout" }));
        setDemo(false);
        setShowMax(false);
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
      <span>{showMax ? `최대 성장 ${maxOwnWater}회 · 장식 ${maxFriendWater}개` : `내 나무 크기 ${Math.min(maxOwnWater, ownTree?.ownWater ?? 0)}/${maxOwnWater} · 장식 ${ownTree?.friendWater ?? 0}개`}</span>
      {!showMax && ownTree && <span>내 점수 {wishScore(ownTree)}점</span>}
      <span>동료 나무 {garden.targets.filter(slot => garden.watered.includes(slot)).length}/{garden.targets.length}</span>
      {garden.mine && <button onClick={() => {
        const point = slots[garden.mine!.slot];
        setPosition({ x: point.x, y: point.y + 30 });
      }}>내 나무 찾기</button>}
      {demo && garden.mine && !showMax && <button onClick={nextDemoDay}>랜덤 대상 다시 뽑기</button>}
      <button aria-pressed={showMax} onClick={() => {
        setShowMax(value => !value);
        if (!showMax) setPosition({ x: slots[previewSlot].x, y: slots[previewSlot].y + 92 });
      }}>{showMax ? "최대 성장 미리보기 닫기" : "23일 최대 성장 미리보기"}</button>
    </div>}
    <div className={styles.scene}>
      <WishScene key={String(showMax)} active={active} blocked={plantSlot !== null} garden={visibleGarden} position={position} onMove={setPosition} splash={splash} />
      {active && !showMax && <>
        <div className={styles.action}>
          {!garden.mine && closeSlot >= 0 && !closeTree && <button onClick={() => setPlantSlot(closeSlot)}>여기에 소원나무 심기 <kbd>E</kbd></button>}
          {canWater && <button disabled={busy} onClick={water}>{isOwn ? "💧 물주기" : "✦ 장식 달아주기"} <kbd>E</kbd></button>}
        </div>
      </>}
    </div>
    <p className={styles.instructions}>{active ? "화면의 방향 버튼을 누르거나 방향키·WASD로 이동해요. 마우스 휠이나 +/−로 확대·축소하고, 나무 가까이에서 E로 물을 주거나 장식을 달아요. 모바일은 오른쪽 조이스틱으로 이동하고 화면을 밀어 시점을 돌려요." : "직원 로그인 또는 조작 체험으로 마당에 들어갈 수 있어요."}</p>
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
