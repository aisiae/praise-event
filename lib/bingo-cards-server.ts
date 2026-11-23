import { randomInt } from "node:crypto";
import { bingoCardCount, bingoCardDistribution, type BingoCardGame } from "@/lib/bingo-cards";
import { bingoEvent, bingoParticipants, readBingoConfig } from "@/lib/bingo-test-server";
import { getAdminDb } from "@/lib/firebase-admin";
import { isEventOpen, todaySeoul } from "@/lib/utils";

type Deck = {
  points: number[];
  draws: { employeeId: string; index: number }[];
};

const deckRef = (date: string) => bingoEvent("test").collection("dailyCardDecks").doc(date);

function makeDeck(): Deck {
  const points = bingoCardDistribution.flatMap(({ points, count }) => Array<number>(count).fill(points));
  for (let i = points.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [points[i], points[j]] = [points[j], points[i]];
  }
  return { points, draws: [] };
}

function publicDeck(date: string, employeeId: string, deck?: Deck): BingoCardGame {
  const draws = deck?.draws ?? [];
  const opened = deck
    ? deck.draws.filter(draw => draw.employeeId === employeeId)
        .map(({ index }) => ({ index, points: deck.points[index] }))
    : [];
  return { date, taken: draws.map(draw => draw.index), draw: opened.at(-1) ?? null, opened };
}

export async function readBingoCardGame(date: string, employeeId: string) {
  const deck = (await deckRef(date).get()).data() as Deck | undefined;
  return publicDeck(date, employeeId, deck);
}

export async function flipBingoCard(employeeId: string, date: unknown, index: unknown) {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= bingoCardCount) {
    throw new Error("고를 카드를 확인해 주세요.");
  }

  return getAdminDb().runTransaction(async tx => {
    const today = todaySeoul();
    if (date !== today) throw new Error("날짜가 바뀌었습니다. 오늘의 카드에서 다시 골라 주세요.");

    const participant = bingoParticipants("test").doc(employeeId);
    const dailyDeck = deckRef(today);
    const [deckSnap, participantSnap, settings] = await Promise.all([
      tx.get(dailyDeck), tx.get(participant), tx.get(bingoEvent("test")),
    ]);
    if (!participantSnap.exists) throw new Error("직원 로그인이 필요합니다.");
    if (!isEventOpen(readBingoConfig(settings.data(), "test"))) {
      throw new Error("현재 이벤트 참여 기간이 아닙니다.");
    }

    const deck = (deckSnap.data() as Deck | undefined) ?? makeDeck();
    const existing = deck.draws.find(draw => draw.index === index);
    if (existing) {
      if (existing.employeeId === employeeId) return publicDeck(today, employeeId, deck);
      throw new Error("다른 직원이 먼저 고른 카드예요. 다른 카드를 골라 주세요.");
    }

    deck.draws.push({ employeeId, index });
    tx.set(dailyDeck, deck);
    const total = Number(participantSnap.get("cardPoints") ?? 0) + deck.points[index];
    tx.update(participant, { cardPoints: total });
    return publicDeck(today, employeeId, deck);
  });
}
