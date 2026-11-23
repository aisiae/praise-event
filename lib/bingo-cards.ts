export const bingoCardDistribution = [
  { points: 0, count: 16 },
  { points: 1, count: 16 },
  { points: 2, count: 6 },
  { points: 3, count: 2 },
] as const;

export const bingoCardCount = bingoCardDistribution.reduce((sum, entry) => sum + entry.count, 0);

export type BingoCardGame = {
  date: string;
  taken: number[];
  draw: { index: number; points: number } | null;
  opened: { index: number; points: number }[];
};
