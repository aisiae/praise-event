export type Tree = { slot: number; count: number; ownWater?: number; friendWater?: number; ornamentsGiven?: number };
export type Garden = {
  signedIn: boolean;
  trees: Tree[];
  mine: { slot: number; wish: string } | null;
  targets: number[];
  watered: number[];
};

export const slots = Array.from({ length: 40 }, (_, i) => ({
  x: 82 + (i % 8) * 112 + (i % 8 >= 4 ? 86 : 0),
  y: 230 + Math.floor(i / 8) * 102,
}));
export const stages = ["작은 묘목", "자란 줄기", "풍성한 잎", "크리스마스 소나무", "장식한 크리스마스 트리"];
export const stageFor = (count: number) => Math.min(4, Math.floor(count / 3));

export function fillTargets(trees: Tree[], mine: number, previous: number[], pick: (max: number) => number) {
  const available = trees.map(tree => tree.slot).filter(slot => slot !== mine && !previous.includes(slot));
  const targets = [...previous];
  while (targets.length < 3 && available.length) {
    targets.push(available.splice(pick(available.length), 1)[0]);
  }
  return targets;
}
export type WishGardenStatus = {
  today: string;
  capacity: number;
  occupied: number;
  rows: {
    id: string;
    name: string;
    tree: (Tree & { wish: string }) | null;
    wateredOwnToday: boolean;
    wateredOthersToday: number;
  }[];
};

export const maxOwnWater = 23;
export const maxFriendWater = 39 * maxOwnWater;
export const treeSize = (tree: Tree) => 24 + Math.min(maxOwnWater, tree.ownWater ?? 0) * 2.6;

export type WishPrize = { name: string; amount: number; quantity: number };
export type WishDraw = { drawnAt: number; eligible: number; winners: { name: string; prize: string; amount: number; score?: number }[] };
export const defaultWishPrizes: WishPrize[] = [
  { name: "1등", amount: 50000, quantity: 1 },
  { name: "2등", amount: 30000, quantity: 5 },
  { name: "3등", amount: 10000, quantity: 10 },
];

export function wishScore(tree: Pick<Tree, "ownWater" | "friendWater" | "ornamentsGiven">) {
  return (tree.ownWater ?? 0) * 3 + (tree.ornamentsGiven ?? 0) + (tree.friendWater ?? 0);
}
