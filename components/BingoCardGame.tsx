"use client";

import { useEffect, useRef, useState } from "react";
import { bingoCardCount, type BingoCardGame as CardGame } from "@/lib/bingo-cards";
import styles from "./BingoCardGame.module.css";

export default function BingoCardGame({ game, blocked, onRefresh }: {
  game: CardGame;
  blocked: boolean;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(!game.draw && game.taken.length < bingoCardCount);
  const [played, setPlayed] = useState<CardGame["draw"]>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState("");
  const draw = game.draw ?? played;
  const remaining = bingoCardCount - game.taken.length;

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

  async function flip(index: number) {
    if (inFlight.current || draw) return;
    inFlight.current = true;
    setPending(index);
    setError("");
    try {
      const response = await fetch("/api/bingo-test/participate?mode=test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flipCard", date: game.date, index }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPlayed(result.cardGame.draw);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "카드를 열지 못했습니다.");
    } finally {
      await onRefresh().catch(() => {});
      setPending(null);
      inFlight.current = false;
    }
  }

  return (
    <div className={styles.entry}>
      <button type="button" className="button secondary" disabled={blocked} onClick={() => setOpen(true)}>
        {draw ? "오늘의 카드 결과" : "행운의 카드 뒤집기"}
      </button>
      <span>{draw ? (draw.points ? `오늘 +${draw.points}점` : "오늘은 꽝!") : `남은 카드 ${remaining}장`}</span>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="bingo-card-title" onCancel={event => {
        event.preventDefault();
        if (!inFlight.current) setOpen(false);
      }}>
        <div className={styles.header}>
          <div>
            <h2 id="bingo-card-title" ref={title} tabIndex={-1}>행운의 카드 뒤집기</h2>
            <p>매일 한 번, 남은 카드 중 한 장을 골라 보세요.</p>
          </div>
          <button type="button" className="button secondary" disabled={pending !== null} onClick={() => setOpen(false)}>
            {draw ? "닫기" : "나중에"}
          </button>
        </div>
        <p className={styles.result} role="status">
          {draw ? (draw.points > 0 ? `${draw.index + 1}번 카드에서 +${draw.points}점!` : `${draw.index + 1}번 카드는 꽝! 내일 다시 도전해 보세요.`) :
            remaining === 0 ? "오늘의 카드가 모두 열렸어요." : `남은 카드 ${remaining} / ${bingoCardCount}장`}
        </p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.grid}>
          {Array.from({ length: bingoCardCount }, (_, index) => {
            const own = draw?.index === index;
            const taken = game.taken.includes(index);
            return (
              <button key={index} type="button" className={styles.card} data-open={own}
                disabled={!!draw || taken || pending !== null}
                aria-label={own ? `${index + 1}번 카드, ${draw.points ? `${draw.points}점` : "꽝"}` :
                  taken ? `${index + 1}번 카드, 선택 완료` : `${index + 1}번 카드 뒤집기`}
                onClick={() => void flip(index)}>
                {own ? (draw.points ? `+${draw.points}` : "꽝") : pending === index ? "…" : taken ? "✓" : index + 1}
              </button>
            );
          })}
        </div>
      </dialog>
    </div>
  );
}
