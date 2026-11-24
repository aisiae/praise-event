// 소원나무 마당용 로우폴리 지오메트리 도우미: 월광 음영을 만들 때 미리 계산해 두어 프레임마다 다시 계산하지 않는다.
import { gardenBounds, pathCenter, pathX } from "@/lib/wish-garden";

export type Vec = [number, number, number];
export type Face = { vertices: Vec[]; color: string; n: Vec; c: Vec; cull: boolean };
export type Glow = { x: number; y: number; z: number; r: number; rgb: string };
export type Group = { x: number; z: number; r: number; faces: Face[] };
type RGB = [number, number, number];
type Paint = string | RGB;

const TAU = Math.PI * 2;
const parse = (c: string): RGB => { const v = parseInt(c.slice(1), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255]; };
const toRGB = (p: Paint): RGB => typeof p === "string" ? parse(p) : p;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB) => `rgb(${Math.round(Math.min(255, c[0]))},${Math.round(Math.min(255, c[1]))},${Math.round(Math.min(255, c[2]))})`;
const unit = (v: Vec): Vec => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const moon = unit([-.35, .8, .45]);
const shadowTint: RGB = [.58, .66, .86], litTint: RGB = [1, 1.03, 1.08];

export const tone = (c: string, k: number) => {
  const [r, g, b] = parse(c);
  const f = (v: number) => Math.round(Math.max(0, Math.min(255, v * k))).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
};
export const smokes: { x: number; y: number; z: number }[] = [];

export function hash(a: number, b: number, c = 0) {
  let h = Math.imul(a * 374761393 + b * 668265263 + c * 1274126177 | 0, 1103515245);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  return ((h ^ h >>> 13) >>> 0) % 1000 / 1000;
}

export function add(mesh: Face[], vertices: Vec[], paint: Paint, center?: Vec, glow = false) {
  const [a, b, d] = vertices;
  let n = unit([
    (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]),
    (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]),
    (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]),
  ]);
  const c: Vec = [0, 0, 0];
  for (const v of vertices) { c[0] += v[0] / vertices.length; c[1] += v[1] / vertices.length; c[2] += v[2] / vertices.length; }
  if (center) { if (dot(n, [c[0] - center[0], c[1] - center[1], c[2] - center[2]]) < 0) n = [-n[0], -n[1], -n[2]]; }
  else if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
  const base = toRGB(paint);
  let color = base;
  if (!glow) {
    const t = clamp(.42 + .6 * Math.max(0, dot(n, moon)) + .1 * n[1]);
    const tint = mix(shadowTint, litTint, t);
    color = [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
  }
  mesh.push({ vertices, color: rgb(color), n, c, cull: !!center });
}

export function box(mesh: Face[], x: number, z: number, width: number, depth: number, low: number, high: number, sides: Paint, top: Paint, glow = false) {
  const ring = (y: number): Vec[] => [[x - width / 2, y, z - depth / 2], [x + width / 2, y, z - depth / 2], [x + width / 2, y, z + depth / 2], [x - width / 2, y, z + depth / 2]];
  const base = ring(low), roof = ring(high), center: Vec = [x, (low + high) / 2, z];
  roof.forEach((vertex, i) => add(mesh, [base[i], base[(i + 1) % 4], roof[(i + 1) % 4], vertex], sides, center, glow));
  add(mesh, roof, top, center, glow);
}

// 원기둥·원뿔대: 위쪽 반지름 = r * taper
export function prism(mesh: Face[], x: number, z: number, r: number, low: number, high: number, sides: number, color: Paint, top: Paint = color, taper = 1, glow = false) {
  const ring = (y: number, radius: number): Vec[] => Array.from({ length: sides }, (_, i) => [x + Math.cos(i / sides * TAU) * radius, y, z + Math.sin(i / sides * TAU) * radius]);
  const base = ring(low, r), roof = ring(high, r * taper), center: Vec = [x, (low + high) / 2, z];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    add(mesh, taper < .02 ? [base[i], base[j], roof[0]] : [base[i], base[j], roof[j], roof[i]], color, center, glow);
  }
  if (taper >= .02) add(mesh, roof, top, center, glow);
}

export function ellipsoid(mesh: Face[], x: number, y: number, z: number, rx: number, ry: number, rz: number, color: Paint, segments = 12, rings = 6, glow = false) {
  const point = (side: number, ring: number): Vec => {
    const phi = -Math.PI / 2 + ring / rings * Math.PI, angle = side / segments * TAU;
    return [x + Math.cos(phi) * Math.cos(angle) * rx, y + Math.sin(phi) * ry, z + Math.cos(phi) * Math.sin(angle) * rz];
  };
  const center: Vec = [x, y, z];
  for (let ring = 0; ring < rings; ring++) for (let side = 0; side < segments; side++) {
    const vertices = ring === 0 ? [point(side, 0), point(side + 1, 1), point(side, 1)]
      : ring === rings - 1 ? [point(side, ring), point(side + 1, ring), point(side, rings)]
      : [point(side, ring), point(side + 1, ring), point(side + 1, ring + 1), point(side, ring + 1)];
    add(mesh, vertices, color, center, glow);
  }
}
export const sphere = (mesh: Face[], x: number, y: number, z: number, r: number, color: Paint, segments = 12, rings = 6, glow = false) =>
  ellipsoid(mesh, x, y, z, r, r, r, color, segments, rings, glow);

// 눈 더미
export function drift(mesh: Face[], x: number, z: number, rx: number, rz: number, height: number, segments = 20, tone: Paint = "#d3e3f0") {
  const rings = 4;
  const point = (side: number, ring: number): Vec => {
    const phi = ring / rings * Math.PI / 2, angle = side / segments * TAU, lump = 1 + Math.sin(angle * 3 + x) * .07;
    return [x + Math.cos(angle) * rx * Math.cos(phi) * lump, Math.sin(phi) * height, z + Math.sin(angle) * rz * Math.cos(phi) * lump];
  };
  const center: Vec = [x, -height * .3, z];
  for (let ring = 0; ring < rings; ring++) for (let side = 0; side < segments; side++) {
    const vertices = ring === rings - 1 ? [point(side, ring), point(side + 1, ring), point(side, rings)]
      : [point(side, ring), point(side + 1, ring), point(side + 1, ring + 1), point(side, ring + 1)];
    add(mesh, vertices, tone, center);
  }
}

// 눈 쌓인 박공지붕 (용마루는 x축 방향)
export function gable(mesh: Face[], x: number, z: number, width: number, depth: number, wallTop: number, rise: number, over: number, roof: Paint, wall: Paint, snow: Paint = "#eef6fb") {
  const hw = width / 2 + over, zf = z + depth / 2 + over, zb = z - depth / 2 - over, top = wallTop + rise;
  const center: Vec = [x, wallTop + rise * .25, z], eave = .22;
  for (const dir of [1, -1]) {
    const edge = dir > 0 ? zf : zb, mid = z + (edge - z) * (1 - eave);
    const lift = wallTop + rise * eave;
    add(mesh, [[x - hw, wallTop, edge], [x + hw, wallTop, edge], [x + hw, lift, mid], [x - hw, lift, mid]], roof, center);
    add(mesh, [[x - hw, lift, mid], [x + hw, lift, mid], [x + hw, top, z], [x - hw, top, z]], snow, center);
  }
  for (const side of [-1, 1]) add(mesh, [[x + side * (width / 2 + .5), wallTop, zf - over], [x + side * (width / 2 + .5), wallTop, zb + over], [x + side * (width / 2 + .5), top - .5, z]], wall, center);
}

const trunkColor = "#5b4034", trunkTop = "#6d4f40", frost: RGB = parse("#f2f8fc");
// 통통하고 둥근 눈 덮인 전나무: 단마다 부풀어 오른 곡면 + 둥근 처마. rings는 0~.58 높이 비율.
export const bulge = (up: number) => 1 - Math.pow(Math.min(1, up / .58), 1.15);
export function pine(mesh: Face[], x: number, z: number, size: number, layers: number, segments: number, rings: number[]) {
  prism(mesh, x, z, size * .07, 0, size * .46, Math.max(8, segments >> 1), trunkColor, trunkTop, .75);
  for (let layer = 0; layer < layers; layer++) {
    const radius = size * (.5 - layer * .07), level = size * (.2 + layer * .16);
    const tier = layers > 1 ? layer / (layers - 1) : 0;
    const point = (side: number, h: number): Vec => {
      const angle = side / segments * TAU, up = Math.max(h, 0);
      const spread = radius * (h < 0 ? 1 + (-h) * 2.2 : bulge(up));
      return [x + Math.cos(angle) * spread, level + size * h, z + Math.sin(angle) * spread];
    };
    const center: Vec = [x, level + size * .1, z];
    for (let face = 0; face < segments; face++) for (let band = 0; band < rings.length - 1; band++) {
      const low = rings[band], high = rings[band + 1], apex = band === rings.length - 2;
      const mid = (low + high) / 2;
      let paint = mix(parse("#1d6347"), parse("#4fae82"), clamp(tier * .4 + mid * 1.1));
      paint = band === 0 ? mix(paint, [14, 52, 44], .35) : mix(paint, frost, clamp(.03 + (mid / .58) * .38));
      const vertices = apex ? [point(face, low), point(face + 1, low), point(face, high)] : [point(face, low), point(face + 1, low), point(face + 1, high), point(face, high)];
      add(mesh, vertices, paint, center);
    }
  }
}
export const pineDetail = {
  near: { segments: 40, rings: [-.04, 0, .08, .18, .3, .44, .58] },
  mid: { segments: 26, rings: [-.04, 0, .12, .3, .58] },
  far: { segments: 16, rings: [-.04, 0, .2, .58] },
  scenery: { segments: 16, rings: [-.04, 0, .2, .58] },
};

export function player(x: number, z: number, gait: number) {
  const mesh: Face[] = [];
  for (const side of [-1, 1]) {
    prism(mesh, x + side * 4, z + side * gait, 3.4, 0, 12, 8, "#1c2a3a", "#26384b");
    prism(mesh, x + side * 4, z + side * gait + 1, 3.8, 0, 3, 8, "#10171f", "#18222d");
  }
  for (const side of [-1, 1]) {
    prism(mesh, x + side * 9.2, z - side * gait * .8, 2.6, 14, 28, 8, "#b33048", "#c8485c", .85);
    sphere(mesh, x + side * 9.2, 13, z - side * gait * .8, 2.7, "#f4efe4", 6, 3);
  }
  prism(mesh, x, z, 7.6, 10, 29, 12, "#b33048", "#c8485c", .78);
  prism(mesh, x, z, 7.7, 17, 20, 12, "#1f2630", "#1f2630", 1);
  prism(mesh, x, z, 5.4, 27, 31, 12, "#f4efe4", "#fff7ea", 1.05);
  sphere(mesh, x, 36, z, 5.6, "#e8bf9c", 10, 5);
  for (const side of [-1, 1]) sphere(mesh, x + side * 2.2, 36.5, z + 5, .9, "#1e293b", 5, 2);
  sphere(mesh, x, 33.5, z + 3.4, 4.2, "#f5f1e8", 8, 4);
  prism(mesh, x, z, 6.6, 39, 42, 12, "#f5f1e8", "#fff7ea", 1);
  prism(mesh, x, z, 5.8, 40, 56, 12, "#c3354d", "#c3354d", .12);
  sphere(mesh, x, 56, z, 2.3, "#fffaf0", 8, 4);
  return mesh;
}

export const glows: Glow[] = [];
export const pathLamps = [230, 416, 604, 794, 994].map((z, index) => ({
  x: pathX(z) + (index % 2 ? 52 : -52), z,
}));

function group(groups: Group[], x: number, z: number, r: number, build: (mesh: Face[]) => void) {
  const faces: Face[] = [];
  build(faces);
  groups.push({ x, z, r, faces });
}

type Cabin = { x: number; z: number; w: number; d: number; wall: number; rise: number; paint: string; roof: string };
// 석조 기초, 가로 통나무 몰딩, 흰 모서리 기둥, 현관 계단·리스, 십자 격자 창, 굴뚝과 연기, 처마 전구
function cabin(mesh: Face[], { x, z, w, d, wall, rise, paint, roof }: Cabin) {
  const trim = "#f4f7fa", log = tone(paint, .8);
  box(mesh, x, z, w + 2, d + 2, 0, 5, "#475569", "#cbd5e1");
  box(mesh, x, z, w - 2, d - 2, 5, wall, paint, paint);
  gable(mesh, x, z, w - 2, d - 2, wall, rise, 7, roof, paint);
  const front = z + (d - 2) / 2;
  for (let y = 9; y < wall - 4; y += 7) box(mesh, x, front + .8, w - 4, 2.6, y, y + 2.6, log, log);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(mesh, x + sx * (w / 2 - 1.5), z + sz * (d / 2 - 1.5), 3.4, 3.4, 5, wall + 1, trim, trim);
  const panes = Math.max(1, Math.floor(w / 46));
  for (let i = 0; i < panes; i++) {
    const wx = x + (i - (panes - 1) / 2) * (w / panes) + (panes === 1 ? w * .22 : 0), wy = wall * .42;
    box(mesh, wx, front + 1.4, 22, 2.4, wy - 3, wy + 22, trim, trim);
    box(mesh, wx, front + 2.8, 17, 1.4, wy, wy + 19, "#ffd88a", "#ffe9b4", true);
    box(mesh, wx, front + 3.6, 1.6, 1, wy, wy + 19, trim, trim);
    box(mesh, wx, front + 3.6, 17, 1, wy + 9, wy + 10.4, trim, trim);
    glows.push({ x: wx, y: wy + 10, z: front + 8, r: 36, rgb: "255,200,110" });
  }
  const dx = x - w * .28;
  box(mesh, dx, front + 1.6, 19, 3, 5, 36, trim, trim);
  box(mesh, dx, front + 3.2, 14, 2.4, 5, 33, "#4a2a18", "#6a4b42");
  box(mesh, dx, front + 7, 24, 9, 0, 3, "#451a03", "#6b4a35");
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    sphere(mesh, dx + Math.cos(a) * 3.6, 28 + Math.sin(a) * 3.6, front + 5, 1.3, "#15803d", 5, 2);
  }
  sphere(mesh, dx, 24.4, front + 5.4, 1.3, "#dc2626", 5, 2);
  box(mesh, x + w * .26, z - d * .1, 11, 11, wall, wall + rise * .75, "#7f1d1d", "#7f1d1d");
  box(mesh, x + w * .26, z - d * .1, 14, 14, wall + rise * .75, wall + rise * .75 + 4, "#334155", "#eef6fb");
  smokes.push({ x: x + w * .26, y: wall + rise * .75 + 6, z: z - d * .1 });
  for (let i = 0; i < 9; i++) {
    const lx = x - w / 2 - 4 + i * (w + 8) / 8, hue = ["#ef4444", "#fbbf24", "#34d399", "#38bdf8"][i % 4];
    box(mesh, lx, z + d / 2 + 6.5, 3.5, 3.5, wall - 5, wall - 1.5, hue, hue, true);
  }
}

function lamp(mesh: Face[], x: number, z: number) {
  prism(mesh, x, z, 3.2, 0, 4, 8, "#2b343c", "#39444d", .8);
  prism(mesh, x, z, 1.5, 4, 48, 8, "#2b343c", "#2b343c", .85);
  box(mesh, x, z, 10, 10, 48, 60, "#ffcf75", "#fff0c4", true);
  for (const dx of [-4.8, 4.8]) for (const dz of [-4.8, 4.8]) {
    box(mesh, x + dx, z + dz, 1.2, 1.2, 48, 61, "#493a36", "#493a36");
  }
  prism(mesh, x, z, 7.2, 60, 66, 4, "#2b343c", "#eef6fb", .12);
  glows.push({ x, y: 54, z, r: 63, rgb: "255,192,89" });
}

function snowman(mesh: Face[], x: number, z: number, scale: number) {
  sphere(mesh, x, 9 * scale, z, 11 * scale, "#f3f8fc", 12, 6);
  sphere(mesh, x, 25 * scale, z, 8 * scale, "#f3f8fc", 12, 6);
  sphere(mesh, x, 37 * scale, z, 6 * scale, "#f3f8fc", 10, 5);
  prism(mesh, x, z + 5.2 * scale, 1.3 * scale, 36 * scale, 36 * scale + 9 * scale, 6, "#ee7b2f", "#ee7b2f", .1);
  prism(mesh, x, z, 6.4 * scale, 42 * scale, 44 * scale, 10, "#25303d", "#25303d");
  prism(mesh, x, z, 4.2 * scale, 44 * scale, 54 * scale, 10, "#25303d", "#2d3a4a");
  prism(mesh, x, z, 8.4 * scale, 30 * scale, 33 * scale, 10, "#c93d52", "#d9566a");
}

function gift(mesh: Face[], x: number, z: number, s: number, paint: string, ribbon: string) {
  box(mesh, x, z, s, s, 0, s * .8, paint, paint);
  box(mesh, x, z, s * 1.03, s * .22, 0, s * .82, ribbon, ribbon);
  box(mesh, x, z, s * .22, s * 1.03, 0, s * .82, ribbon, ribbon);
  sphere(mesh, x, s * .95, z, s * .16, ribbon, 6, 3);
}

function fence(mesh: Face[], x: number, from: number, to: number) {
  box(mesh, x, (from + to) / 2, 3, to - from, 11, 14, "#8c6a54", "#f1f7fb");
  box(mesh, x, (from + to) / 2, 2.5, to - from, 20, 23, "#8c6a54", "#f1f7fb");
  for (let z = from; z <= to; z += 36) box(mesh, x, z, 5, 5, 0, 28, "#765545", "#f4f9fc");
}

function reindeer(mesh: Face[], x: number, z: number, facing: number) {
  const f = facing;
  ellipsoid(mesh, x, 27, z, 22, 12, 9, "#9a6b4c", 10, 5);
  ellipsoid(mesh, x + f * 14, 26, z, 9, 9, 8, "#f0e6d8", 8, 4);
  for (const [dx, dz] of [[-12, -4], [-12, 4], [12, -4], [12, 4]]) prism(mesh, x + dx, z + dz, 2.1, 0, 24, 6, "#6b4a35", "#6b4a35", .8);
  ellipsoid(mesh, x + f * 24, 42, z, 4, 11, 4, "#9a6b4c", 6, 4);
  ellipsoid(mesh, x + f * 30, 52, z, 8, 5.5, 5, "#a77652", 8, 4);
  sphere(mesh, x + f * 37, 51, z, 2.6, "#c73c3c", 6, 3, true);
  for (const side of [-1, 1]) {
    box(mesh, x + f * 28, z + side * 4, 1.6, 1.6, 55, 70, "#ded0bd", "#ded0bd");
    box(mesh, x + f * 28 + f * 4, z + side * 8, 1.6, 1.6, 62, 74, "#ded0bd", "#ded0bd");
  }
}

function sleigh(mesh: Face[], x: number, z: number) {
  for (const side of [-1, 1]) {
    box(mesh, x, z + side * 14, 70, 3, 2, 6, "#b8892e", "#e1b552");
    box(mesh, x - 32, z + side * 14, 6, 3, 6, 22, "#b8892e", "#e1b552");
    box(mesh, x + 18, z + side * 14, 3, 3, 6, 20, "#b8892e", "#e1b552");
  }
  box(mesh, x, z, 56, 30, 12, 20, "#a82a3d", "#d04158");
  box(mesh, x - 24, z, 8, 32, 20, 38, "#a82a3d", "#d04158");
  gift(mesh, x + 4, z - 5, 11, "#3f7cc4", "#ffd36b");
  gift(mesh, x + 14, z + 6, 9, "#43a56a", "#f4efe4");
}

function star(mesh: Face[], x: number, y: number, z: number, r: number) {
  sphere(mesh, x, y, z, r, "#ffe38a", 6, 3, true);
  glows.push({ x, y, z, r: 70, rgb: "255,225,130" });
}

export function buildVillage(): Group[] {
  const groups: Group[] = [];
  glows.length = 0;
  smokes.length = 0;
  const { left, right, front } = gardenBounds;
  // 하늘 바깥쪽을 감싸는 눈 언덕
  group(groups, pathCenter, 20, 900, mesh => {
    for (let i = 0; i < 11; i++) drift(mesh, -80 + i * 150, 6 + hash(i, 1) * 24, 130 + hash(i, 2) * 40, 52, 34 + hash(i, 3) * 26, 22, i % 2 ? "#cfe0ee" : "#dbe8f3");
  });
  for (const side of [-1, 1]) group(groups, side < 0 ? left - 98 : right + 98, 610, 570, mesh => {
    for (let i = 0; i < 7; i++) drift(mesh, side < 0 ? left - 98 - hash(i, 4) * 25 : right + 98 + hash(i, 4) * 25, 150 + i * 150, 70, 100, 24 + hash(i, 5) * 20, 20, "#cfe0ee");
  });
  // 중앙 길: 눈 쌓인 원목 판자 산책로
  for (let z = 150; z <= front + 12; z += 22) {
    const x = pathX(z);
    const warmth = Math.max(...pathLamps.map(lamp => Math.exp(-(((z - lamp.z) / 49) ** 2))));
    group(groups, x, z, 46, mesh => {
      box(mesh, x, z, 78, 19, 0, 2.5, "#68452f", mix(parse("#a67753"), parse("#efb166"), warmth * .7));
      for (const side of [-1, 1]) box(mesh, x + side * 32, z, 10 + hash(z, side) * 5, 16, 2.5, 4, "#afc7db", mix(parse("#e4edf7"), parse("#ffda9b"), warmth * .62));
    });
  }
  // 산타 공방
  group(groups, pathCenter, 80, 150, mesh => {
    cabin(mesh, { x: pathCenter, z: 82, w: 160, d: 92, wall: 74, rise: 52, paint: "#a63a36", roof: "#33445c" });
    box(mesh, pathCenter + 42, 62, 20, 20, 74, 128, "#7b5a52", "#7b5a52");
    box(mesh, pathCenter + 42, 62, 25, 25, 128, 135, "#eef6fb", "#ffffff");
    for (const side of [-1, 1]) {
      box(mesh, pathCenter + side * 26, 130, 13, 3, 6, 46, "#4a3430", "#6a4b42");
      box(mesh, pathCenter + side * 26, 129, 17, 2, 44, 47, "#f2efe6", "#ffffff");
    }
    star(mesh, pathCenter, 74 + 52 + 14, 82, 6);
    gift(mesh, pathCenter - 60, 150, 18, "#c0364a", "#ffd36b");
    gift(mesh, pathCenter - 38, 154, 13, "#3f7cc4", "#f4efe4");
    gift(mesh, pathCenter + 62, 152, 16, "#43a56a", "#ffe38a");
  });
  const cabins: Cabin[] = [
    { x: 340, z: 70, w: 86, d: 68, wall: 46, rise: 34, paint: "#2f5878", roof: "#2c3b52" },
    { x: 988, z: 74, w: 92, d: 70, wall: 48, rise: 34, paint: "#c4893e", roof: "#3a2f3f" },
    { x: 190, z: 62, w: 78, d: 62, wall: 42, rise: 30, paint: "#a63a36", roof: "#33445c" },
    { x: 1260, z: 66, w: 82, d: 64, wall: 44, rise: 32, paint: "#e6dccb", roof: "#6a3340" },
  ];
  for (const house of cabins) group(groups, house.x, house.z, 110, mesh => cabin(mesh, house));
  // 썰매와 루돌프
  group(groups, 1030, 165, 90, mesh => {
    sleigh(mesh, 1050, 168);
    reindeer(mesh, 960, 162, 1);
  });
  group(groups, 265, 165, 70, mesh => reindeer(mesh, 262, 160, -1));
  // 길가 가로등
  for (const { x, z } of pathLamps) group(groups, x, z, 70, mesh => lamp(mesh, x, z));
  // 울타리와 눈사람
  for (const x of [left - 22, right + 22]) group(groups, x, 630, 460, mesh => fence(mesh, x, 200, front + 15));
  group(groups, 651, 1037, 60, mesh => snowman(mesh, 651, 1037, 1.15));
  group(groups, 858, 1037, 60, mesh => { snowman(mesh, 858, 1037, 1); gift(mesh, 888, 1048, 14, "#c0364a", "#ffd36b"); });
  // 숲 가장자리
  for (let i = 0; i < 16; i++) {
    const x = -30 + i * 100 + hash(i, 6) * 40, size = 105 + hash(i, 7) * 40;
    group(groups, x, 12, size * .5, mesh => pine(mesh, x, 12 - hash(i, 8) * 12, size, 4, pineDetail.scenery.segments, pineDetail.scenery.rings));
  }
  for (const side of [-1, 1]) for (let i = 0; i < 15; i++) {
    const x = side < 0 ? left - 62 - hash(i, 9 + side) * 28 : right + 50 + hash(i, 9 + side) * 28, z = 150 + i * 62 + hash(i, 12) * 24, size = 78 + hash(i, 13 + side) * 40;
    group(groups, x, z, size * .5, mesh => pine(mesh, x, z, size, 3, pineDetail.scenery.segments, pineDetail.scenery.rings));
  }
  return groups;
}
