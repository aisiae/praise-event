"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { bingoCardCount, type BingoCardGame as CardGame } from "@/lib/bingo-cards";
import styles from "./BingoCardGame.module.css";

type Draw = CardGame["opened"][number];
const suits = ["✦", "♢", "❖", "✧"];
const colors = ["#ffd460", "#ffa7cc", "#c4acff", "#83e0d0", "#8ed2ff"];

function Confetti() {
  return <div className={styles.confetti} aria-hidden="true">
    {Array.from({ length: 36 }, (_, index) => <i key={index} style={{
      "--angle": `${index * 137.5}deg`,
      "--distance": `${95 + (index % 6) * 26}px`,
      "--spin": `${170 + index * 37}deg`,
      "--color": colors[index % colors.length],
      "--delay": `${(index % 5) * 28}ms`,
    } as CSSProperties}/>)}
  </div>;
}

export default function BingoCardGame({ game, blocked, onRefresh }: {
  game: CardGame;
  blocked: boolean;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(game.taken.length < bingoCardCount);
  const [updated, setUpdated] = useState<CardGame | null>(null);
  const [revealed, setRevealed] = useState<Draw | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState("");
  const cardState = updated && updated.taken.length > game.taken.length ? updated : game;
  const remaining = bingoCardCount - cardState.taken.length;
  const hasPoints = !!revealed?.points;

  useEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    if (open && !blocked && !panel.open) {
      panel.showModal();
      title.current?.focus();
    } else if ((!open || blocked) && panel.open) {
      panel.close();
    }
  }, [open, blocked]);

  useEffect(() => {
    if (revealed) resultTitle.current?.focus({ preventScroll: true });
  }, [revealed]);

  function close() {
    if (inFlight.current) return;
    setOpen(false);
    setRevealed(null);
    setError("");
  }

  async function flip(index: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(index);
    setError("");
    try {
      const response = await fetch("/api/bingo-test/participate?mode=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flipCard", date: game.date, index }),
      });
      const result: { cardGame?: CardGame; error?: string } = await response.json();
      if (!response.ok || !result.cardGame) throw new Error(result.error || "카드를 열지 못했습니다.");
      const draw = result.cardGame.opened.find(card => card.index === index);
      if (!draw) throw new Error("선택한 카드의 결과를 확인할 수 없습니다.");
      setUpdated(result.cardGame);
      setRevealed(draw);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "카드를 열지 못했습니다.");
    } finally {
      setPending(null);
      inFlight.current = false;
      void onRefresh().catch(() => {});
    }
  }

  return (
    <div className={styles.entry}>
      <button type="button" className="button secondary" disabled={blocked} onClick={() => setOpen(true)}>
        행운의 카드 뒤집기
      </button>
      <span>남은 카드 {remaining}장</span>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="bingo-card-title" onCancel={event => {
        event.preventDefault();
        close();
      }}>
        <div className={styles.header}>
          <div>
            <h2 id="bingo-card-title" ref={title} tabIndex={-1}>행운의 카드 뒤집기</h2>
            <p>테스트에서는 카드를 여러 장 뒤집을 수 있어요.</p>
          </div>
          <button type="button" className="button secondary" disabled={pending !== null} onClick={close}>
            닫기
          </button>
        </div>
        {revealed ? <div className={styles.reveal} key={revealed.index} data-win={hasPoints}>
          {hasPoints && <Confetti/>}
          <div className={styles.cardStage} aria-hidden="true">
            <div className={styles.flipper}>
              <div className={`${styles.face} ${styles.back}`}><span>✦</span></div>
              <div className={`${styles.face} ${styles.front}`}>
                <span className={styles.corner}>✦</span>
                <strong>{hasPoints ? `+${revealed.points}` : "꽝"}</strong>
                {hasPoints && <small>보너스 점수</small>}
                <span className={styles.corner}>✦</span>
              </div>
            </div>
          </div>
          <div className={styles.message}>
            <h3 ref={resultTitle} tabIndex={-1}>{hasPoints ? `축하해요! 보너스 +${revealed.points}점` : "앗, 이번엔 꽝이에요!"}</h3>
            <p>{hasPoints ? "획득한 점수가 테스트 빙고에 더해졌어요." : "아쉽지만 내일 다시 도전해 보세요."}</p>
            {remaining > 0
              ? <button type="button" className="button primary" onClick={() => { setRevealed(null); title.current?.focus(); }}>다른 카드 뒤집기</button>
              : <button type="button" className="button primary" onClick={close}>빙고로 돌아가기</button>}
          </div>
        </div> : <>
          <p className={styles.status} role="status">
            {remaining ? `남은 카드 ${remaining} / ${bingoCardCount}장` : "오늘의 카드가 모두 열렸어요."}
          </p>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.grid}>
            {Array.from({ length: bingoCardCount }, (_, index) => {
              const own = cardState.opened.find(card => card.index === index);
              const taken = cardState.taken.includes(index);
              const face = own ? (own.points ? `+${own.points}` : "꽝") : taken ? "✓" : suits[index % suits.length];
              return (
                <button key={index} type="button" className={styles.card}
                  data-state={own ? "own" : taken ? "taken" : "closed"}
                  disabled={taken || pending !== null}
                  aria-label={own ? `${index + 1}번째 카드, ${own.points ? `보너스 ${own.points}점` : "꽝"}` :
                    taken ? `${index + 1}번째 카드, 선택 완료` : `${index + 1}번째 카드 뒤집기`}
                  onClick={() => void flip(index)}>
                  <span aria-hidden="true">{pending === index ? "…" : face}</span>
                </button>
              );
            })}
          </div>
        </>}
      </dialog>
    </div>
  );
}
