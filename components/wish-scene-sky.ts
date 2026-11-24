// 북유럽 겨울 밤하늘: 별, 달, 오로라, 먼 산, 전나무 숲 능선, 눈밭. 시점(yaw)에 따라 방위별로 고정되어 보인다.
const TAU = Math.PI * 2;
let seed = 11;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const stars = Array.from({ length: 240 }, () => ({ a: rnd() * TAU, e: rnd() ** 1.5 * 2, s: rnd(), p: rnd() * TAU }));
const lights = [0.35, 0.9, 1.7, 2.45, 3.3, 4.1, 4.9, 5.7].map(a => ({ a, warm: rnd() }));
const ridge = (a: number, k: number) => .5 + .5 * (Math.sin(a * 2.3 + k) * .5 + Math.sin(a * 5.1 + k * 2) * .3 + Math.sin(a * 11.7 + k * 3) * .2);
const ribbons = [
  { rgb: "52,211,153", base: .16, rise: .36, k: 0 },
  { rgb: "45,212,191", base: .24, rise: .3, k: 2.1 },
  { rgb: "167,139,250", base: .33, rise: .26, k: 4.3 },
];
const moonAzimuth = 5.5;

export function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number, yaw: number, focal: number, time: number) {
  const bottom = Math.max(horizon, 0);
  if (bottom <= 0) return;
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, h * .45));
  sky.addColorStop(0, "#060b19"); sky.addColorStop(.4, "#0a1b3c"); sky.addColorStop(.75, "#164060"); sky.addColorStop(1, "#3d7a8e");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, bottom);
  const wrap = (d: number) => ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const toX = (a: number) => w / 2 + Math.tan(wrap(a - yaw)) * focal;
  const angleAt = (x: number) => yaw + Math.atan((x - w / 2) / focal);
  const near = (a: number) => Math.abs(wrap(a - yaw)) < 1.35;

  for (const s of stars) {
    if (!near(s.a)) continue;
    const x = toX(s.a), y = bottom - s.e * focal;
    if (y < 0 || y > bottom) continue;
    ctx.globalAlpha = (.35 + s.s * .55) * (.7 + .3 * Math.sin(time / 500 + s.p));
    ctx.fillStyle = s.s > .85 ? "#cfe4ff" : "#fff6dd";
    const size = s.s > .9 ? 2 : s.s > .5 ? 1.4 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.globalAlpha = 1;

  if (near(moonAzimuth)) {
    const x = toX(moonAzimuth), y = bottom - .42 * focal, r = focal * .045;
    if (y > -r * 4) {
      const halo = ctx.createRadialGradient(x, y, r * .6, x, y, r * 5);
      halo.addColorStop(0, "rgba(220,235,255,.38)"); halo.addColorStop(1, "rgba(220,235,255,0)");
      ctx.fillStyle = halo; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      ctx.fillStyle = "#f4f8ff"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(160,180,210,.35)";
      for (const [dx, dy, cr] of [[-.3, -.2, .22], [.25, .15, .3], [-.05, .4, .15]]) { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, cr * r, 0, TAU); ctx.fill(); }
    }
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, bottom); ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  const step = 5;
  for (const ribbon of ribbons) {
    const mid = bottom - (ribbon.base + ribbon.rise * .35) * focal;
    const fill = ctx.createLinearGradient(0, mid - ribbon.rise * focal * .8, 0, mid + ribbon.rise * focal * .5);
    fill.addColorStop(0, `rgba(${ribbon.rgb},0)`); fill.addColorStop(.45, `rgba(${ribbon.rgb},.18)`);
    fill.addColorStop(.85, `rgba(${ribbon.rgb},.62)`); fill.addColorStop(1, `rgba(${ribbon.rgb},0)`);
    ctx.fillStyle = fill;
    for (let x = 0; x < w; x += step) {
      const a = angleAt(x), k = ribbon.k;
      const wave = Math.sin(a * 1.7 + time * .00022 + k) + .6 * Math.sin(a * 3.9 - time * .0003 + k) + .3 * Math.sin(a * 8.3 + time * .0005);
      const lower = ribbon.base + .06 * wave;
      const curtain = ribbon.rise * (.7 + .3 * Math.sin(a * 2.6 + time * .00018 + k));
      const ray = .5 + .5 * Math.sin(a * 46 + k * 3 + wave * 2.4);
      ctx.globalAlpha = .28 + .5 * ray * (.6 + .4 * Math.sin(a * .9 + k));
      const yTop = bottom - (lower + curtain) * focal, yBottom = bottom - lower * focal;
      ctx.fillRect(x, yTop, step + 1, yBottom - yTop);
    }
  }
  ctx.restore();

  // 먼 산
  const mountain = ctx.createLinearGradient(0, bottom - focal * .2, 0, bottom);
  mountain.addColorStop(0, "#f1f5f9"); mountain.addColorStop(.18, "#94b8d8"); mountain.addColorStop(.5, "#2a4a72"); mountain.addColorStop(1, "#13233c");
  ctx.fillStyle = mountain;
  ctx.beginPath(); ctx.moveTo(0, bottom + 2);
  for (let x = 0; x <= w + step; x += step) ctx.lineTo(x, bottom - (.03 + ridge(angleAt(x), 1) ** 1.4 * .17) * focal);
  ctx.lineTo(w + step, bottom + 2); ctx.closePath(); ctx.fill();
  // 전나무 숲 능선과 먼 마을 불빛
  ctx.fillStyle = "#091a2c";
  ctx.beginPath(); ctx.moveTo(0, bottom + 2);
  for (let x = 0; x <= w + 3; x += 3) {
    const a = angleAt(x), t = ((a / .028) % 1 + 1) % 1, tooth = 1 - Math.abs(t * 2 - 1), bulk = ridge(a * 2.7, 5);
    ctx.lineTo(x, bottom - (.012 + bulk * .022 + tooth * (.014 + bulk * .022)) * focal);
  }
  ctx.lineTo(w + 3, bottom + 2); ctx.closePath(); ctx.fill();
  for (const light of lights) {
    if (!near(light.a)) continue;
    const x = toX(light.a), y = bottom - .006 * focal;
    ctx.fillStyle = light.warm > .4 ? "#ffd27a" : "#ff8f6b";
    ctx.globalAlpha = .55 + .35 * Math.sin(time / 700 + light.a * 9);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, horizon: number) {
  const top = Math.max(0, horizon);
  const snow = ctx.createLinearGradient(0, top, 0, h);
  snow.addColorStop(0, "#587c9a"); snow.addColorStop(.1, "#8bacc7"); snow.addColorStop(.45, "#bcd3e5"); snow.addColorStop(1, "#e4eff8");
  ctx.fillStyle = snow; ctx.fillRect(0, top, w, h - top);
  const glow = ctx.createLinearGradient(0, top, 0, top + 170);
  glow.addColorStop(0, "rgba(100,255,200,.2)"); glow.addColorStop(1, "rgba(100,255,200,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, top, w, 170);
}
