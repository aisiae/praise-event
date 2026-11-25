export type Tree = { slot: number; count: number; ownWater?: number; friendWater?: number; ornamentsGiven?: number };
export type WishOverviewTree = Tree & { ownerName: string; wish: string };
export type Garden = {
  signedIn: boolean;
  name?: string;
  trees: Tree[];
  mine: { slot: number; wish: string } | null;
  targets: number[];
  watered: number[];
};

export const gardenBounds = { left: 48, right: 1432, back: 184, front: 1060 };
export const pathCenter = 740;
export const pathX = (z: number) => pathCenter + Math.sin(z / 116) * 18;

// The array index is the saved plot ID. Keep it stable when moving a plot.
export const slots = [
  [112, 265], [276, 247], [421, 291], [593, 231], [893, 239], [1031, 282], [1210, 246], [1360, 305],
  [158, 421], [318, 461], [470, 413], [604, 382], [864, 425], [1058, 438], [1173, 398], [1322, 474],
  [100, 591], [255, 567], [422, 603], [584, 539], [898, 567], [1019, 607], [1190, 558], [1381, 620],
  [181, 733], [324, 778], [465, 710], [616, 722], [873, 723], [1070, 749], [1227, 713], [1310, 797],
  [111, 918], [268, 961], [433, 870], [592, 979], [909, 951], [1034, 900], [1182, 881], [1367, 952],
].map(([x, y]) => ({ x, y }));
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
export const growthFor = (tree?: Tree) => Math.min(maxOwnWater, tree?.ownWater ?? 0);
export const treeSize = (tree: Tree) => 24 + growthFor(tree) * 2.6;

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
