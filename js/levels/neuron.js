/* LEVEL 4 — A Neuron: one human cortical pyramidal (glutamatergic) neuron receives, computes, sends — and learns.
   World units are micrometres (µm). Soma, dendrites, axon initial segment and the first ~190 µm of axon are drawn TO SCALE.
   ~1 cm of axon is omitted at the "axon break"; the far terminal bouton is drawn to scale too, and both synapses are
   additionally shown in magnified insets (×25) that carry their own scale bars. Molecules and ions are enlarged glyphs. */
(function () {
'use strict';
const { U, D } = CG, TAU = U.TAU;

/* ---------- palette (consistent with level 1: ATP yellow, glucose green, nucleus violet, mitochondria orange-red, ER teal, Golgi amber) ---------- */
const C = {
  na: '#ff6b8b', k: '#a78bfa', ca: '#5ee7ff', cl: '#b6f36b', mg: '#e5e7eb', glu: '#ffa94d', gln: '#ffd9a0', gaba: '#93c5fd',
  atp: '#ffe14d', glc: '#7CFC8A', mem: '#8ccfff', cyt: '#163552', myelin: '#efe6d2', astro: '#f59ec8', oligo: '#c4b5fd',
  other: '#c9b6ff', er: '#4fd6b4', golgi: '#e0b040', nav: '#ff6b8b', camk: '#ffcf5c',
};

/* ---------- geometry (µm) ---------- */
const SOMA = [[0, -17], [10, -5], [13, 9], [-13, 9], [-10, -5]];   // pyramid-shaped soma, ~25 µm, apex pointing to the pia (up)
const NUC = { x: 0, y: 1.5, r: 5 };                                  // nucleus ~10 µm across
const AY = 20;                                                       // the axon runs horizontally at y = 20
const AIS = { x1: 16, x2: 48 };                                      // axon initial segment, 32 µm (real: ~20–60 µm)
const INTER = [[49.5, 118.5], [119.5, 176.5], [177.5, 188.5], [195.5, 206.5]];   // myelin internodes
const NODES = [119, 177, 207];
const BRK = { x1: 188.5, x2: 195.5 };
const BX = { x: 227.5, y: AY, r: .55 };                              // the terminal bouton, ~1 µm across
const HILL = [[4, 9], [6.6, 13.5], [9, 18.2], [16, AY]];
const II = { x0: -105, y0: -90, w: 66, h: 62 };                      // input-synapse inset (×25)
const IO = { x0: 235, y0: -13, w: 62, h: 66 };                       // output-synapse inset (×25)
const MAG = 25;
const SPR = { x: -19.1, y: -48 };                                    // the real input spine on an apical oblique dendrite
const SPINE_PATH = [[-19.1, -48], [-20, -46.9], [-14, -42], [0, -33], [0, -15], [0, -3]];
const PRE = { x: -72, y: -80, r: 11 };                               // upstream bouton in the input inset
const BTN = { x: 251, y: 20, r: 12 };                                // our bouton in the output inset
const POST = { x: 273.5, y: 20, r: 10 };                             // downstream spine in the output inset
const DEND = [
  { p: [[0, -15], [0, -35], [0, -62], [0, -97]], w: [3.4, 2.6, 2, 1.5], sp: 12 },
  { p: [[0, -33], [-14, -42], [-30, -55], [-36, -62]], w: [1.3, 1, .8, .6] },
  { p: [[0, -30], [11, -37], [19, -47]], w: [1.2, .9, .6] },
  { p: [[0, -62], [-12, -73], [-22, -86]], w: [1.1, .8, .6] },
  { p: [[0, -66], [11, -77], [15, -92]], w: [1.1, .8, .6] },
  { p: [[-11, 6], [-26, 18], [-44, 30], [-60, 44]], w: [2, 1.4, 1, .7], sp: 8 },
  { p: [[-3, 9], [-7, 28], [-11, 48], [-13, 66]], w: [2, 1.4, 1, .7], sp: 8 },
  { p: [[12, 4], [26, 3], [42, -4], [57, -13]], w: [1.8, 1.3, .9, .6], sp: 8 },
  { p: [[-9, -3], [-21, -10], [-33, -13]], w: [1.6, 1.1, .7], sp: 7 },
  { p: [[-26, 18], [-30, 34], [-28, 50]], w: [1, .8, .6] },
  { p: [[26, 3], [33, -9], [36, -22]], w: [1, .8, .6] },
];

let g, S, st = {};
const lv = id => g.shop.level(id);
const ordered = id => g.shop.by[id].level + g.shop.by[id].pending >= 2;
const res = id => g.res.get(id);

/* ---------- generic machine helper (same pattern as level 1) ---------- */
function proc(s, cfg) {
  s.jobs = []; s.cfg = cfg;
  s.tryStart = manual => {
    if (s.jobs.length >= cfg.cap()) { if (manual) g.floatText(s.x, s.y - s.r * 1.2, 'Busy…', '#cbd5e1'); return false; }
    const no = cfg.can();
    if (no !== true) { if (manual) { g.floatText(s.x, s.y - s.r * 1.2, no, '#ff9a9a'); CG.sfx('bad'); } return false; }
    const job = { t: 0, dur: cfg.time() }; cfg.start(job); s.jobs.push(job); return true;
  };
  s.onClick = () => s.tryStart(true);
  s.ready = () => !cfg.auto() && s.jobs.length < cfg.cap() && cfg.can() === true;
  s.update = (_, __, dt) => {
    const rate = cfg.rate ? cfg.rate() : 1;
    for (const j of s.jobs) { j.t += dt * rate; if (j.t >= j.dur) { j.done = true; cfg.finish(j); } }
    s.jobs = s.jobs.filter(j => !j.done);
    if (cfg.auto()) { s.autoT = (s.autoT || 0) - dt; if (s.autoT <= 0 && (!cfg.autoCan || cfg.autoCan())) { s.tryStart(false); s.autoT = .15; } }
    s.progress = s.jobs.length ? s.jobs[0].t / s.jobs[0].dur : null;
  };
}
function mk(o) { const s = g.addStation(o); st[o.id] = s; return s; }
/* automated terminal machines still accept a click to run a second, parallel cycle when a backlog builds (e.g. during a train) */
function boostable(s, backlog) { s.ready = () => s.jobs.length < s.cfg.cap() && s.cfg.can() === true && (!s.cfg.auto() || backlog() >= 2); }

/* ---------- small drawing helpers ---------- */
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); }
function somaPath(c) {
  const P = SOMA, n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(P[n - 1], P[0]); c.beginPath(); c.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]); c.quadraticCurveTo(P[i][0], P[i][1], m[0], m[1]); }
  c.closePath();
}
function mitoC(c, x, y, len, w, rot, hot) {
  c.save(); c.translate(x, y); c.rotate(rot || 0); c.lineCap = 'round';
  c.strokeStyle = '#ffab7a'; c.lineWidth = w; c.beginPath(); c.moveTo(-len / 2, 0); c.lineTo(len / 2, 0); c.stroke();
  c.strokeStyle = hot ? '#d4583a' : '#9a3f2a'; c.lineWidth = w * .72; c.stroke();
  c.strokeStyle = '#ffb38a'; c.lineWidth = w * .1; c.lineCap = 'butt';
  const n = Math.max(2, Math.round(len / (w * .55)));
  for (let i = 1; i < n; i++) { const xx = -len / 2 + len * i / n, sg = i % 2 ? 1 : -1; c.beginPath(); c.moveTo(xx, sg * w * .34); c.lineTo(xx, -sg * w * .05); c.stroke(); }
  c.restore();
}
function glyphRcp(c, x, y, ang, s, col, open) {   // ion channel / receptor spanning a membrane; ang = outward direction
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = g.px;
  const gap = open ? s * .16 : s * .04;
  for (const sg of [-1, 1]) { c.beginPath(); c.roundRect(-s * .45, sg > 0 ? gap : -gap - s * .32, s * 1.1, s * .32, s * .12); c.fill(); c.stroke(); }
  c.restore();
}
function kinesin(c, x, y, ph, cargo) {             // two-headed motor stepping along the microtubule, cargo on top
  const step = Math.sin(ph * 10) * .22;
  c.strokeStyle = '#9be7ff'; c.lineWidth = .14; c.beginPath(); c.moveTo(x, y + .28); c.lineTo(x, y - .25); c.stroke();
  D.circle(c, x - .16 + step, y + .36, .13, '#9be7ff'); D.circle(c, x + .16 - step, y + .36, .13, '#6fc8e8');
  cargo(c, x, y - .55);
}

/* ---------- molecules & ions ---------- */
const dotDraw = (col, r) => (c, t) => D.circle(c, t.x, t.y, r, col, 'rgba(0,0,0,.35)', g.px);
function ions(n, col, from, to, dur, r, spread, delay) {
  for (let i = 0; i < n; i++) {
    const t = g.token({ x: from.x + U.rand(-spread, spread), y: from.y + U.rand(-spread, spread), draw: dotDraw(col, r) });
    t.a = 0; t.wait((delay || 0) + i * .05).then(tt => { tt.a = 1; }).to(to.x + U.rand(-spread, spread), to.y + U.rand(-spread, spread), dur).fade(.3).die();
  }
}
function along(t, pts, speed) {
  let px = t.x, py = t.y;
  for (const p of pts) { const d = Math.hypot(p[0] - px, p[1] - py); if (d > 1e-3) t.to(p[0], p[1], Math.max(.05, d / speed), { linear: true }); px = p[0]; py = p[1]; }
  return t;
}
function pathLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function pathAt(pts, f) {
  const L = pathLen(pts) * U.clamp(f, 0, 1); let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= L) { const q = d ? (L - acc) / d : 0; return { x: U.lerp(pts[i - 1][0], pts[i][0], q), y: U.lerp(pts[i - 1][1], pts[i][1], q) }; }
    acc += d;
  }
  const e = pts[pts.length - 1]; return { x: e[0], y: e[1] };
}

/* ---------- camera & screen layout (wide desktop canvas vs ~390 px phone canvas) ---------- */
const phone = () => g.W < 560;
/* framing boxes [cx, cy, w, h] in µm: d = desktop, p = phone (tighter, so tap targets stay ≥ ~24 px apart); side = keep clear of the scope */
const VIEWS = {
  soma:   { d: [1, -2, 58, 44],    p: [1, -1, 44, 40] },
  cell:   { d: [16, 0, 92, 54],    p: [14, 7, 64, 44] },
  ais:    { d: [18, 4, 78, 46],    p: [17, 5, 74, 46] },
  input:  { d: [-72, -59, 70, 66], p: [-73, -63, 54, 54], side: 1 },
  output: { d: [266, 20, 66, 70],  p: [262, 20, 54, 54], side: 1 },
  axon:   { d: [118, 6, 252, 76],  p: [122, 16, 206, 64] },
  all:    { d: [95, -14, 410, 172], p: [95, -14, 410, 172] },
};
const NAV = [['input', 'Input', ['spine', 'astroIn', 'pre']], ['cell', 'Soma', ['glut3', 'mito', 'nak', 'ais']], ['axon', 'Axon', []], ['output', 'Output', ['bouton', 'endo', 'vglut', 'astro']], ['all', 'All', []]];
function scopeBox() {
  if (phone()) return { x: 8, y: 8, w: Math.round(U.clamp(g.W * .5, 168, 210)), h: 74, mini: true };
  return { x: 12, y: 12, w: 262, h: 128, mini: false };
}
function navBoxes() {
  const sb = scopeBox(), out = [];
  if (sb.mini) {                                   // phone: 3 + 2 chips to the right of the mini scope
    const x0 = sb.x + sb.w + 8, cw = (g.W - 8 - x0 - 8) / 3, ch = 33;
    NAV.forEach((n, i) => { const r = i < 3 ? 0 : 1, c = i < 3 ? i : i - 3; out.push({ n, x: x0 + c * (cw + 4), y: sb.y + r * (ch + 8), w: cw, h: ch }); });
  } else {                                         // desktop: one row under the ion legend
    let x = sb.x; const y = sb.y + sb.h + 36;
    NAV.forEach(n => { const w = n[1].length * 7 + 26; out.push({ n, x, y, w, h: 24 }); x += w + 5; });
  }
  return out;
}
function margins(v) {
  if (phone()) { const sb = scopeBox(); return { t: sb.y + sb.h + 10, b: 78, l: 6, r: 6 }; }
  const nb = navBoxes(), nr = nb[nb.length - 1];
  return { t: v && v.side ? nr.y + nr.h + 16 : 44, b: 86, l: 24, r: 24 };     // insets sit below the scope / view buttons
}
/* screen rects of the level's own UI (scope, legend, view buttons): world labels and badges are not drawn under them */
function uiRects() {
  const B = scopeBox(), r = [[B.x, B.y, B.w, B.h + (B.mini ? 0 : 30)]];
  for (const n of navBoxes()) r.push([n.x, n.y, n.w, n.h]);
  return r;
}
function underUI(sx, sy, hw, hh) { for (const r of uiRects()) if (sx + hw > r[0] - 4 && sx - hw < r[0] + r[2] + 4 && sy + hh > r[1] - 4 && sy - hh < r[1] + r[3] + 4) return true; return false; }
function lbl(text, x, y, o) {
  const [sx, sy] = g.w2s(x, y), size = (o && o.size) || 11, tw = text.length * size * .55, al = o && o.align;
  const cx = al === 'left' ? sx + tw / 2 : al === 'right' ? sx - tw / 2 : sx;
  if (underUI(cx, sy, tw / 2, size * .6)) return;
  g.label(text, x, y, o);
}
function frameBox(b, v, smooth) {
  const M = margins(v), base = Math.min(g.W / g.world.w, g.H / g.world.h);
  const uw = Math.max(80, g.W - M.l - M.r), uh = Math.max(80, g.H - M.t - M.b);
  const z = U.clamp(Math.min(uw / b[2], uh / b[3]) / base, .6, 30), sc = base * z;
  const cx = b[0] - ((M.l + g.W - M.r) / 2 - g.W / 2) / sc, cy = b[1] - ((M.t + g.H - M.b) / 2 - g.H / 2) / sc;
  if (smooth) g.focus(cx, cy, z); else { g.camTo = null; g.cam.x = cx; g.cam.y = cy; g.cam.z = z; }
}
function view(name, smooth) { const v = VIEWS[name]; frameBox(phone() ? v.p : v.d, v, smooth); S.view = name; }
function spikeX(sp) {
  const t = sp.t; if (t < EV[0].t) return U.lerp(AIS.x1, AIS.x2, t / EV[0].t);
  let i = 0; while (i + 1 < EV.length && t >= EV[i + 1].t) i++;
  const e = EV[i], n = EV[i + 1]; return n ? U.lerp(e.x, n.x, (t - e.t) / (n.t - e.t)) : e.x;
}
function followSpike() { const x = spikeX(S.spikes[S.spikes.length - 1]); frameBox([Math.min(x + 22, 236), AY - 2, phone() ? 96 : 150, 40], null, true); }

/* ---------- membrane potential ---------- */
const REST = -70, THR = -55, ECL = -75, TRAIN = 18;
function restV() { return REST + Math.max(0, 55 - res('grad')) * .7 + (S.exGlu || 0) * 1.6; }
function thr() { return THR + (g.t - S.lastAP < 1.0 ? 8 : 0); }
function canFire() { return !S.ap && g.t - S.lastAP > .5 && S.v >= thr() && res('grad') >= 25; }
function addGrad(n) { g.res.add('grad', n); }
function tauM() { return S.stats.ap ? 5 : 9; }

function updVm(dt) {
  if (S.ap) {
    S.ap.t += dt; const t = S.ap.t;
    if (t < .12) S.v = U.lerp(S.ap.v0, 32, Math.pow(t / .12, 1.6));
    else if (t < .46) S.v = 32 + (-77 - 32) * U.ease((t - .12) / .34);
    else { S.ap = null; S.v = -77; }
  } else {
    S.v += (restV() - S.v) * Math.min(1, dt / tauM());
    if (S.inj > 0) { const k = Math.min(S.inj, dt * 45); S.v += k; S.inj -= k; }
    if (S.injI > 0) { const k = Math.min(S.injI, dt * 2.5); S.v += (ECL - S.v) * k * dt * 6; S.injI -= k * dt * 6; if (S.injI < .01) S.injI = 0; }
    if (S.v >= THR) S.reachedThr = true;
  }
  S.histT += dt;
  while (S.histT >= .03) { S.histT -= .03; S.hist.push(S.v); if (S.hist.length > 400) S.hist.shift(); }
}

/* ---------- 1. synaptic input at the dendritic spine ---------- */
function nextInterval() {
  if (S.burst && S.burst.on) return .4;
  if (S.barrage > 0) return U.rand(.5, .8);
  if (S.tut) return U.rand(1.7, 2.5);
  return U.rand(.9, 1.5);
}
function presynArrive() {
  const fx = PRE.x + U.rand(-3, 3);
  const v = g.token({ x: fx, y: PRE.y + 5, draw: (c, t) => D.vesicle(c, t.x, t.y, .5, C.other, C.glu) });
  v.to(fx, PRE.y + PRE.r - .6, .25).fade(.2).die();
  if (S.inQ.length >= 3) { S.stats.missed++; return; }
  S.inQ.push(g.t);
}
function thetaBurst(manual) {
  if (!S.ltpOn) return;
  if (S.thN || g.t - S.thLast <= 1.4) { if (manual) g.floatText(PRE.x, PRE.y - 13, 'Burst in progress…', '#cbd5e1'); return; }
  S.thN = 4; S.thT = 0; S.stats.theta++;
  g.ring(PRE.x, PRE.y, C.other, 3, 14, .6);
  if (S.stats.theta === 1) g.floatText(PRE.x, PRE.y - 13, 'theta burst: 4 spikes in quick succession', C.other);
}
function consolidate() {
  S.nucTx = true; g.learn('n_gene');
  g.floatText(NUC.x, NUC.y - 7, 'CREB → transcription of plasticity genes', '#f0a8ff');
  frameBox([-36, -40, 110, 96], VIEWS.input, true);
  g.after(1.2, () => {
    const tk = g.token({ x: NUC.x - 1, y: NUC.y + 1, draw: (c, t) => D.mrna(c, t.x, t.y, 1.4, '#f0a8ff', t.age * 5) });
    tk.to(NUC.x - 3.2, NUC.y - 3.4, .6).to(0, -14, .7); along(tk, SPINE_PATH.slice().reverse().slice(1), 22);
    tk.then(() => {
      S.consol = true; g.ring(SPR.x, SPR.y, '#f0a8ff', .5, 6, .9); g.ring(-72, spineTop() + 10, '#f0a8ff', 2, 16, .9); CG.sfx('good');
      g.floatText(SPR.x, SPR.y - 3, 'new proteins captured by the tagged synapse', '#f0a8ff');
    }).die();
  });
}
function updTheta(dt) {
  if (!S.thN) return;
  S.thT -= dt;
  if (S.thT <= 0) { S.thT = .2; presynArrive(); if (--S.thN === 0) S.thLast = g.t; }
}
function takeInput(manual) {
  if (!S.inQ.length) { if (manual) { g.floatText(st.spine.x, st.spine.y - 10, 'No glutamate yet — wait for the presynaptic spike', '#ff9a9a'); CG.sfx('bad'); } return; }
  S.inQ.shift();
  const amp = 1.75 * res('ampa') * (S.barrage > 0 ? .6 : 1) * (S.burst && S.burst.on ? 1.5 : 1);
  S.inj += amp; S.lastIn = g.t; addGrad(-.6); S.stats.epsp++; S.marks.push({ t: g.t, k: 'e' });
  const hy = spineTop();
  ions(4, C.na, { x: -72, y: hy - 1.5 }, { x: -72, y: hy + 6 }, .55, .45, 4);
  const p = g.token({ x: SPR.x, y: SPR.y, draw: (c, t) => D.glow(c, t.x, t.y, 2.4, C.na, .8) });
  along(p, SPINE_PATH.slice(1), 55).fade(.2).die();
  if (S.stats.epsp === 1) g.floatText(st.spine.x, st.spine.y - 12, '+' + amp.toFixed(0) + ' mV EPSP', C.na);
  g.learn('n_receptors');
}
function spineR() { return 10 * (1 + .045 * (res('ampa') - 4)); }
function spineTop() { return PRE.y + PRE.r + .5; }                  // 20 nm cleft = 0.5 world units at ×25

/* ---------- 2. the action potential ---------- */
const EV = [{ t: .35, x: 49 }, { t: .55, x: 119 }, { t: .75, x: 177 }, { t: .85, x: 188, hide: 1 }, { t: 1.45, x: 207 }, { t: 1.75, x: BX.x, end: 1 }];
function fire(manual) {
  if (!canFire()) {
    if (manual) {
      const why = res('grad') < 25 ? 'Depolarisation block: the Na⁺/K⁺ gradient has run down' : S.ap || g.t - S.lastAP <= .5 ? 'Refractory: Nav channels are still inactivated' : 'Below threshold (' + Math.round(thr()) + ' mV) — sum more inputs';
      g.floatText(st.ais.x, st.ais.y - 6, why, '#ff9a9a'); CG.sfx('bad');
    }
    return;
  }
  S.ap = { t: 0, v0: S.v }; S.lastAP = g.t; S.inj = 0; S.injI = 0; S.stats.ap++; addGrad(-2);
  S.spikes.push({ t: 0, ev: 0 }); S.bapT = 0;
  if (S.barrage > 0) S.barAP++;
  for (let i = 0; i < 6; i++) { const x = U.rand(AIS.x1, AIS.x2); ions(1, C.na, { x, y: AY - 2.6 }, { x, y: AY }, .25, .32, .3, i * .02); }
  for (let i = 0; i < 5; i++) { const x = U.rand(AIS.x1, AIS.x2); ions(1, C.k, { x, y: AY }, { x, y: AY + 2.8 }, .35, .32, .3, .15 + i * .03); }
  if (g.t - S.lastIn < 4) nmdaCoincidence();
  if (S.ltpOn && res('ampa') >= 8 && !S.nucTx) {
    S.nucSig = Math.min(100, S.nucSig + 5);
    const t = g.token({ x: SPR.x, y: SPR.y, draw: (c, t) => D.glow(c, t.x, t.y, 1.6, C.ca, .9) });
    along(t, SPINE_PATH.slice(1).concat([[NUC.x, NUC.y - 4]]), 60).fade(.2).die();
    if (S.nucSig >= 100) consolidate();
  }
  g.learn('n_ap');
}
function updSpikes(dt) {
  for (const sp of S.spikes) {
    sp.t += dt * (S.tut ? .5 : 1);
    while (sp.ev < EV.length && sp.t >= EV[sp.ev].t) {
      const e = EV[sp.ev++];
      if (e.end) { sp.done = true; apArrives(); break; }
      if (!e.hide) { g.ring(e.x, AY, C.na, .3, 2.2, .45); ions(2, C.na, { x: e.x, y: AY - 2 }, { x: e.x, y: AY }, .2, .3, .2); }
    }
  }
  S.spikes = S.spikes.filter(s => !s.done);
  if (S.bapT != null) { S.bapT += dt; if (S.bapT > .7) S.bapT = null; }
}

/* ---------- 3. NMDA receptors, CaMKII and LTP ---------- */
function nmdaCoincidence() {
  S.spCa += 30; S.stats.coinc++; S.mgOut = g.t;
  const hy = spineTop();
  for (const dx of [-1.6, 1.6]) { const t = g.token({ x: -72 + dx, y: hy + .3, draw: dotDraw(C.mg, .4) }); t.to(-72 + dx * 2.5, hy - 4, .5).fade(.3).die(); }
  ions(4, C.ca, { x: -72, y: hy - 1 }, { x: -73, y: hy + 9 }, .6, .4, 1.8, .1);
  if (S.stats.coinc === 1) {
    g.floatText(-72, hy - 6, 'pre + post coincide: Mg²⁺ expelled, Ca²⁺ in', C.ca);
    g.learn('n_ltp');
  }
}
function updPlasticity(dt) {
  S.spCa = Math.max(0, S.spCa - S.spCa * dt / 3);
  if (!S.nucTx) S.nucSig = Math.max(0, S.nucSig - dt * 1.2);
  if (S.spCa > 35) S.camk = Math.min(12, S.camk + dt * (.9 + .9 * lv('CAMK2A')));
  else S.camk = Math.max(0, S.camk - dt * (S.ltpOn ? .7 : .25));
  S.insT -= dt;
  if (S.ltpOn && S.camk >= 8 && S.reserve >= 1 && S.insT <= 0 && res('ampa') < g.res.cap('ampa')) {
    S.insT = 20; S.reserve--; S.camk -= 5;
    const t = g.token({ x: -69, y: spineTop() + 2 * spineR() - 6, draw: (c, t) => glyphRcp(c, t.x, t.y, -Math.PI / 2, 1.5, '#ffd166', false) });
    t.to(-72 + U.rand(-4, 4), spineTop() + 1, .8).then(() => {
      g.res.add('ampa', 1); S.stats.ltp++; g.ring(-72, spineTop() + 2, '#ffd166', .5, 9, .7); CG.sfx('good');
      g.floatText(-72, spineTop() - 4, 'AMPA receptors inserted: synapse stronger', '#ffd166');
      if (S.stats.ltp === 1) { g.banner({ title: 'Long-term potentiation!', text: 'CaMKII, switched on by NMDA-receptor Ca²⁺, has pulled spare AMPA receptors into the synapse. The same input now gives a bigger EPSP.', kind: 'good', dur: 7 }); g.learn('n_ltp'); }
    }).die();
  }
  /* anti-softlock: once GRIA1 is fully expressed, constitutive synthesis keeps a trickle of reserve receptors coming */
  if (lv('GRIA1') >= 1 && S.ltpOn && S.reserve < 1 && res('ampa') < 8) { S.resT = (S.resT || 0) + dt; if (S.resT > 15) { S.resT = 0; S.reserve++; } }
}

/* ---------- 4. the terminal ---------- */
function apArrives() {
  S.stats.arrive++; g.learn('n_myelin');
  g.ring(BX.x, BX.y, C.na, .3, 3, .5);
  if (S.apWait.length < 3) S.apWait.push(g.t);
  if (lv('CACNA1A') >= 2) g.after(.05, () => release(false));
}
function release(manual) {
  if (!S.apWait.length) { if (manual) { g.floatText(st.bouton.x, st.bouton.y - 5, 'No spike here yet — the terminal is at rest', '#ff9a9a'); CG.sfx('bad'); } return; }
  S.apWait.shift();
  ions(4, C.ca, { x: BTN.x + BTN.r + 1.5, y: BTN.y }, { x: BTN.x + BTN.r - 2.5, y: BTN.y }, .3, .35, 3);
  S.caT++;
  if (res('rrp') < 1) {
    S.stats.fail++; g.floatText(st.bouton.x, st.bouton.y - 6, 'Release failure: no primed vesicle (synaptic depression)', '#ff9a9a');
    if (!S.depSeen) { S.depSeen = true; g.toast('The readily releasable pool is empty — <b>synaptic depression</b>. Recycle and refill vesicles faster.', 'bad'); }
    return;
  }
  g.res.add('rrp', -1); S.spent++;
  const slot = Math.round(res('rrp'));
  const vy = BTN.y + (slot - 2.5) * 1.25, vx = BTN.x + BTN.r - .55;
  const v = g.token({ x: vx, y: vy, draw: (c, t) => D.vesicle(c, t.x, t.y, .5 * Math.max(.2, t.a), '#f2d58a', C.glu) });
  v.wait(.12).to(vx + .45, vy, .12).fade(.25).die();
  g.after(.22, () => {
    for (let i = 0; i < 6; i++) { const t = g.token({ x: BTN.x + BTN.r + .1, y: vy + U.rand(-.4, .4), draw: dotDraw(C.glu, .28) }); t.to(BTN.x + BTN.r + .45, BTN.y + U.rand(-4, 4), .3).wait(.6).fade(.4).die(); }
    if (S.cleft >= 6) { g.floatText(POST.x, POST.y - 12, 'Spill-over: receptors desensitised — signal lost', '#ff9a9a'); S.stats.lost++; }
    else { S.stats.rel++; S.postFlash = g.t; g.ring(POST.x, POST.y, C.na, 1, 11, .6); if (S.burst && S.burst.on) S.burst.n++; }
    S.cleft = Math.min(8, S.cleft + 1);
  });
  if (S.stats.rel === 0) g.floatText(st.bouton.x, st.bouton.y - 6, 'Ca²⁺ → synaptotagmin-1 → SNAREs zip → fusion', C.ca);
  g.learn('n_synapse');
}
function updTerminal(dt) {
  const prod = (.3 * S.tMito * (S.isch ? .1 : 1) + .08) * dt;
  g.res.add('atpT', prod - .04 * dt);
  /* AP waiting at the terminal: a real terminal stays depolarised for only ~1 ms; here it waits (forever in the tutorial) */
  if (!S.tut) while (S.apWait.length && g.t - S.apWait[0] > 5) { S.apWait.shift(); S.stats.fail++; g.floatText(st.bouton.x, st.bouton.y - 6, 'Spike arrived, no release (failure)', '#ff9a9a'); }
  /* Ca²⁺ extrusion by PMCA (1 ATP per Ca²⁺) and NCX */
  S.caTT += dt;
  if (S.caT > 0 && S.caTT > .8 && res('atpT') >= .5) { S.caTT = 0; S.caT--; g.res.add('atpT', -.5); ions(1, C.ca, { x: BTN.x, y: BTN.y + BTN.r - 2 }, { x: BTN.x, y: BTN.y + BTN.r + 3 }, .5, .35, 1.5); }
  /* glutamate pool anti-softlock: neurons can make a little glutamate from α-ketoglutarate by transamination */
  if (res('glu') < 1 && S.cleft === 0 && !S.glnFly) { S.gluT = (S.gluT || 0) + dt; if (S.gluT > 20) { S.gluT = 0; g.res.add('glu', 1); } }
}

/* ---------- 5. gene expression & logistics ---------- */
function express(_, it) { S.txQ.push(it); g.learn('n_gene'); }
const MEMBRANE = { soma: 1, ais: 1, spine: 1, fast: 1 };
function updExpression(dt) {
  if (!S.tx && S.txQ.length) S.tx = { it: S.txQ.shift(), t: 0, dur: 1.6 };
  if (S.tx) {
    S.tx.t += dt;
    if (S.tx.t >= S.tx.dur) {
      const it = S.tx.it; S.tx = null;
      const tk = g.token({ x: NUC.x - 1, y: NUC.y + 1, draw: (c, t) => D.mrna(c, t.x, t.y, 1.4, '#f0a8ff', t.age * 5) });
      tk.to(NUC.x - 3.2, NUC.y - 3.4, .5);
      if (it.kind === 'local') {     // CaMKIIα mRNA travels into the dendrite in an RNA granule and is translated in the spine
        tk.to(0, -14, .6); along(tk, SPINE_PATH.slice().reverse().slice(1), 30);
        tk.then(() => { S.tl.push({ it, t: 0, dur: 1.8, x: SPR.x, y: SPR.y }); g.floatText(SPR.x, SPR.y - 2, 'local translation in the spine', '#f0a8ff'); }).die();
      } else {
        const at = MEMBRANE[it.kind] ? st.er : st.ribo;
        tk.to(at.x, at.y, .6).then(() => S.tl.push({ it, t: 0, dur: 2.2, x: at.x, y: at.y })).die();
      }
    }
  }
  for (const j of S.tl) { j.t += dt; if (j.t >= j.dur) { j.done = true; afterTranslation(j.it, j); } }
  S.tl = S.tl.filter(j => !j.done);
  st.er.progress = (() => { const j = S.tl.find(j => j.x === st.er.x); return j ? j.t / j.dur : null; })();
}
function grant(it, x, y) {
  g.shop.grant(it.id); S.stats.genes++;
  g.burst(x, y, it.col || '#7ee787', 12); g.ring(x, y, it.col || '#7ee787', .5, 4, .6); g.floatText(x, y - 2, it.gene + ' in place', it.col || '#7ee787'); CG.sfx('good');
}
function afterTranslation(it, from) {
  const col = it.col || '#7ee787';
  const ves = (c, t) => D.vesicle(c, t.x, t.y, .7, '#f2d58a', col);
  const prot = (c, t) => D.protein(c, t.x, t.y, .55, col, t.seed);
  const gol = st.golgi;
  const tk = g.token({ x: from.x, y: from.y, seed: U.rand(9), draw: MEMBRANE[it.kind] ? ves : prot });
  switch (it.kind) {
    case 'soma': { const d = st[it.dest]; tk.to(gol.x, gol.y, .7).wait(.4).to(d.x, d.y, .9).then(() => grant(it, d.x, d.y)).die(); break; }
    case 'ais': tk.to(gol.x, gol.y, .7).wait(.4); along(tk, HILL.concat([[32, AY]]), 30).then(() => grant(it, 32, AY)).die(); break;
    case 'spine': tk.to(gol.x, gol.y, .7).wait(.4).to(0, -15, .5); along(tk, SPINE_PATH.slice().reverse().slice(2), 30).then(() => { grant(it, SPR.x, SPR.y); g.ring(-72, spineTop() + 8, col, 2, 14, .8); }).die(); break;
    case 'nuc': tk.to(NUC.x + 1, NUC.y, .8).then(() => grant(it, NUC.x, NUC.y)).die(); break;
    case 'motor': along(tk, HILL.slice(0, 3), 12).then(() => grant(it, HILL[2][0], HILL[2][1])).die(); break;
    case 'fast': tk.to(gol.x, gol.y, .7).wait(.4); along(tk, HILL.slice(0, 3), 12).then(() => ship(it, 'fast')).die(); break;
    case 'slow': along(tk, HILL.slice(0, 3), 12).then(() => ship(it, 'slow')).die(); break;
    case 'local': grant(it, SPR.x, SPR.y); tk.die(); break;
  }
}
function shipMito(_, it) {
  const m = st.mito, tk = g.token({ x: m.x, y: m.y, draw: (c, t) => mitoC(c, t.x, t.y, 1.8, .5, .4) });
  along(tk, HILL.slice(0, 3), 8).then(() => ship(it, 'mito')).die();
  g.learn('n_transport');
}
const SHIP_DUR = { fast: 30, mito: 38, slow: 60 };
const SHIP_A = [[6.6, 13.5], [9, 18.2], [16, AY], [BRK.x1 - .5, AY]];
function ship(it, kind) { S.ship.push({ it, kind, p: 0, dur: SHIP_DUR[kind], active: false, ph: U.rand(9) }); g.learn('n_transport'); }
function shipPos(s) {
  if (s.p < .16) { const q = pathAt(SHIP_A, s.p / .16); return { x: q.x, y: q.y }; }
  if (s.p < .86) return null;
  const q = (s.p - .86) / .14, end = s.kind === 'mito' ? mitoSlot(S.tMito) : BX.x - .4;
  return { x: U.lerp(BRK.x2 + .5, end, q), y: AY };
}
function mitoSlot(i) { return 224.5 - 3.2 * Math.max(0, i - 1); }
function updShip(dt) {
  const slots = 1 + lv('KIF5A');
  let act = S.ship.filter(s => s.active && s.kind !== 'slow').length;
  for (const s of S.ship) {
    if (!s.active) { if (s.kind === 'slow' || act < slots) { s.active = true; if (s.kind !== 'slow') act++; } else continue; }
    s.p += dt / s.dur; s.ph += dt;
    if (s.p >= 1) {
      s.done = true;
      if (s.kind === 'mito') {
        const x = mitoSlot(S.tMito); S.tMito++; S.stats.mitoShip++; g.shop.grant(s.it.id);
        g.ring(x, AY, '#ff9d5c', .3, 3, .6); g.floatText(x, AY - 2.5, 'mitochondrion docked (syntaphilin)', '#ff9d5c'); CG.sfx('good');
        g.ring(BTN.x - 3, BTN.y + 7, '#ff9d5c', 1, 10, .7);
      } else { S.stats.cargo++; grant(s.it, BX.x, BX.y); g.ring(BTN.x, BTN.y, s.it.col, 2, 16, .8); }
    }
  }
  S.ship = S.ship.filter(s => !s.done);
  /* dynein: retrograde traffic (old organelles, signalling endosomes) back to the soma */
  S.dynT -= dt;
  if (S.dynT <= 0) {
    S.dynT = U.rand(9, 14);
    const t = g.token({ x: BX.x - 2, y: AY, ph: 0, draw: (c, t) => { t.ph += .016; if (t.a > .05) kinesin(c, t.x, t.y + .1, t.ph, (cc, x, y) => D.circle(cc, x, y, .45, '#b9a7ff', '#5b4a9a', g.px)); } });
    t.to(BRK.x2 + .5, AY, 5, { linear: true }).then(tt => { tt.a = 0; }).to(BRK.x1 - .5, AY, 16, { linear: true }).then(tt => { tt.a = 1; }).to(16, AY, 14, { linear: true });
    along(t, HILL.slice(0, 3).reverse(), 6).fade(.4).die();
  }
}

/* ---------- 6. events ---------- */
function startBarrage() {
  if (S.barDone) return;
  if (S.isch || (S.burst && S.burst.on)) { g.after(6, startBarrage); return; }
  S.barDone = true; S.barrage = 28; S.barAP = 0;
  g.banner({ title: 'Inhibitory barrage', text: 'A parvalbumin basket cell fires at high rate onto the soma while excitatory input also rises. GABA-A receptors open, Cl⁻ flows in, and the membrane is clamped near E<sub>Cl</sub> ≈ −75 mV. EPSPs are also shunted (smaller).', kind: 'stress', dur: 8 });
  g.learn('n_inhib');
  g.obj.addSide({ id: 'bar', text: 'Fire 2 spikes through the inhibition', hint: 'Excitation must out-vote inhibition. Sum inputs quickly — or accept that inhibition has done its job.', progress: () => [Math.min(2, S.barAP), 2], check: () => S.barAP >= 2,
    onDone: () => g.toast('Excitation won this round. In the cortex, excitation and inhibition are kept closely balanced.', 'good') });
}
function startIschemia() {
  if (S.ischDone) return;
  if (S.barrage > 0 || g.t - S.barEnd < 10 || (S.burst && S.burst.on)) { g.after(5, startIschemia); return; }
  S.ischDone = true; S.isch = true; S.ischT = 0;
  g.banner({ title: 'Transient ischemia', text: 'Blood flow through the capillary drops: little oxygen, less glucose. Mitochondria stall; glycolysis alone yields only 2 ATP per glucose. Pumps fall behind.', kind: 'stress', dur: 9 });
  g.learn('n_ischemia'); g.learn('n_energy');
  g.obj.addSide({ id: 'isch', text: 'Ride out the ischemia (keep ATP for the pump)', hint: 'Each glucose now gives 2 ATP (→ lactate). Keep the Na⁺/K⁺ pump going; below 25 % gradient the neuron is stuck depolarised.', progress: () => [Math.min(40, S.ischT), 40], check: () => !S.isch });
  g.after(9, () => {
    S.exc = true; S.excCleared = 0;
    g.banner({ title: 'Excitotoxicity threat', text: 'Energy-starved astrocytes cannot clear glutamate (their transporters slow or even reverse). Glutamate pools around the spine, NMDA receptors stay open and Ca²⁺ floods in.', kind: 'stress', dur: 8 });
    g.obj.addSide({ id: 'exc', text: 'Clear glutamate at the input spine', hint: 'Click the pink <b>astrocyte process (EAAT2)</b> next to the input spine (view button <b>Input</b>).', progress: () => [Math.min(6, S.excCleared), 6], check: () => S.excCleared >= 6,
      onDone: () => { S.exc = false; g.toast('Glutamate cleared — the spine\'s Ca²⁺ returns to normal.', 'good'); } });
  });
  g.after(40, () => { S.isch = false; g.banner({ title: 'Blood flow restored', text: 'Oxygen is back: each glucose again yields ~30 ATP. The pumps catch up and the gradient recovers.', kind: 'good', dur: 6 }); });
}
function startBurst() {
  S.burst = { on: true, n: 0, t: 0, fails: S.stats.fail };
  g.banner({ title: 'High-frequency train', text: 'Upstream neurons fire a fast burst. Each spike costs vesicles and ATP: watch the readily releasable pool drain (short-term depression).', kind: 'stress', dur: 7 });
}
function updEvents(dt) {
  if (S.barrage > 0) {
    S.barrage -= dt; S.ipT -= dt;
    if (S.ipT <= 0) { S.ipT = 1.4; ipsp(.32); }
    if (S.barrage <= 0) { S.barrage = 0; S.barEnd = g.t; if (g.obj.side.find(s => s.id === 'bar')) { g.obj.removeSide('bar'); g.toast('The basket cell fell silent. Inhibition won that round — that is its job: it decides <i>when</i> pyramidal cells may fire.', ''); } }
  } else if (S.tutDone) { S.ipT -= dt; if (S.ipT <= 0) { S.ipT = U.rand(6, 11); ipsp(); } }
  if (S.isch) S.ischT += dt;
  if (S.exc) {
    if (S.isch) { S.exGT += dt; if (S.exGT > 1.5) { S.exGT = 0; S.exGlu = Math.min(8, S.exGlu + 1); } }
    S.caLoad += dt * S.exGlu * 2.4;
    if (S.caLoad >= 100) {
      S.caLoad = 55; S.stats.excHits++;
      if (res('ampa') > 4) g.res.add('ampa', -1);
      g.banner({ title: 'Ca²⁺ overload in the spine', text: 'Calpains and nNOS are activated; the spine loses AMPA receptors and the dendrite swells into beads. Clear the glutamate!', kind: 'stress', dur: 6 });
    }
  }
  if (!S.exc || S.exGlu === 0) S.caLoad = Math.max(0, S.caLoad - dt * 6);
  if (S.burst && S.burst.on) {
    S.burst.t += dt;
    if (S.burst.n >= TRAIN) { S.burst.on = false; S.trainDone = true; g.banner({ title: 'Train relayed', text: 'All ' + TRAIN + ' spikes crossed the synapse. Recycling, refilling and local ATP kept up with the demand.', kind: 'good' }); }
    else if (S.burst.t > 30) {          // the upstream burst pauses; depression recovers, then the train resumes where it left off
      S.burst.on = false; g.toast('The burst paused at ' + S.burst.n + '/' + TRAIN + ' while your depleted synapse recovers (a game pause). It resumes in 6 s — refill vesicles, ship mitochondria.', 'bad');
      g.after(6, () => { if (!S.trainDone) { S.burst.on = true; S.burst.t = 0; } });
    }
  }
}
function ipsp(k) {
  S.injI += k || .45; S.marks.push({ t: g.t, k: 'i' });
  const b = st.gaba;
  ions(3, C.cl, { x: b.x, y: b.y + 1.2 }, { x: b.x + .5, y: b.y - 2.5 }, .45, .3, .8);
  g.ring(b.x, b.y, C.gaba, .3, 2.5, .4);
}

/* ---------- static scenery (precomputed) ---------- */
function buildScenery() {
  S.spines = [];
  for (const d of DEND) {
    const P = d.p; let side;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], ay = P[i - 1][1], bx = P[i][0], by = P[i][1], L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
      const w = (d.w[i - 1] + d.w[i]) / 4;
      for (let s = U.rand(.3, 1); s < L; s += U.rand(.7, 1.5)) {
        if (d.sp && Math.hypot(ax + ux * s - P[0][0], ay + uy * s - P[0][1]) < d.sp) continue;
        const x = ax + ux * s, y = ay + uy * s;
        if (Math.hypot(x - SPR.x, y - SPR.y) < 2.2) continue;
        side = Math.random() < .5 ? 1 : -1;
        const a = Math.atan2(uy, ux) + side * (Math.PI / 2 + U.rand(-.5, .5)), nl = U.rand(.5, 1.3);
        S.spines.push({ x0: x + Math.cos(a) * w, y0: y + Math.sin(a) * w, x1: x + Math.cos(a) * (w + nl), y1: y + Math.sin(a) * (w + nl), r: U.rand(.2, .42) });
      }
    }
  }
  S.neuropil = []; for (let i = 0; i < 380; i++) S.neuropil.push({ x: U.rand(-110, 300), y: U.rand(-100, 72), r: U.rand(.15, .5), a: U.rand(.04, .13) });
  S.fibres = []; for (let i = 0; i < 26; i++) { const x = U.rand(-110, 300), y = U.rand(-100, 72), a = U.rand(TAU); S.fibres.push([x, y, x + Math.cos(a) * U.rand(20, 70), y + Math.sin(a) * U.rand(20, 70), U.rand(-15, 15)]); }
  S.pool = []; while (S.pool.length < 46) { const a = U.rand(TAU), r = Math.sqrt(Math.random()) * (BTN.r - 1.6), x = BTN.x + Math.cos(a) * r, y = BTN.y + Math.sin(a) * r; if (Math.hypot(x - (BTN.x - 3), y - (BTN.y + 7)) < 5 || x > BTN.x + 8.5) continue; S.pool.push([x, y]); }
  S.prePool = []; while (S.prePool.length < 30) { const a = U.rand(TAU), r = Math.sqrt(Math.random()) * (PRE.r - 1.4), x = PRE.x + Math.cos(a) * r, y = PRE.y + Math.sin(a) * r; if (y > PRE.y + 7) continue; S.prePool.push([x, y]); }
}

/* =========================================================================================== */
CG.registerLevel({
  id: 'neuron', title: 'A Neuron', organism: 'Homo sapiens — a layer 2/3 pyramidal neuron of the cerebral cortex', color: '#8ccfff',
  blurb: 'Catch synaptic inputs, sum them to threshold, fire an action potential, release glutamate a centimetre away — and pay the ATP bill. Then make a synapse stronger.',
  learn: 'Membrane potential & action potentials · myelin & nodes of Ranvier · synaptic release (SNAREs) · AMPA/NMDA/GABA receptors · ion pumps & brain energy · axonal transport · LTP',
  world: { x: -110, y: -100, w: 410, h: 172 }, maxZoom: 30,
  scaleNote: 'neuron to scale · ~1 cm of axon omitted · insets ×25 · molecules & ions enlarged',
  shopTitle: 'Genome', shopSub: 'Upgrades are <b>genes</b>, transcribed in the nucleus and translated in the soma (some mRNAs, like <i>CAMK2A</i>, in the dendrites). Everything for the axon terminal must then be <b>carried ~1 cm down the axon</b> by motor proteins — it arrives late.',
  intro: `<p>You are one <b>pyramidal neuron</b> in the human cerebral cortex. Your cell body is about <b>20–25 µm</b> across; your axon runs on for about a <b>centimetre</b> to another cortical area.</p>
    <p>Your job is to <b>relay signals</b>: catch glutamate at your dendritic spines, add the small voltage bumps together, fire an <b>action potential</b> when you cross threshold, and release glutamate onto the next neuron. Then pay the bill: every spike costs <b>ATP</b> to pump ions back and recycle vesicles.</p>
    <ul><li><b>Click machines</b> (proteins) when they show a yellow marker. The trace at the top-left is your membrane potential, like a recording electrode in your soma.</li>
    <li><b>Two ATP pools:</b> ATP cannot diffuse a centimetre, so the far terminal lives on its own <b>local mitochondria</b>.</li>
    <li>Use <b>Genome</b> (right) to express genes. Things for the terminal must travel down the axon on kinesin motors — plan ahead.</li>
    <li>Drag to pan, scroll or pinch to zoom. The two framed boxes are <b>magnified ×25</b> views of real synapses. The <b>view buttons</b> beside the trace jump between input, soma, axon and terminal — they light up where something needs you.</li></ul>
    <p style="color:#93a4bf;font-size:13px">Time is stretched or squeezed differently for every process: a real action potential lasts ~1 ms (here ~0.5 s), real axonal transport over 1 cm takes ~½ hour (fast) to days (slow) (here ~30–60 s). Ion stoichiometries, locations and protein names are real.</p>`,

  phase() {
    const st0 = S.ap ? 'action potential!' : res('grad') < 25 ? 'depolarisation block' : S.v >= thr() ? 'above threshold' : 'integrating';
    return 'Vm ' + Math.round(S.v) + ' mV · ' + st0 + (S.isch ? ' · ⚠ ischemia' : '') + (S.barrage > 0 ? ' · inhibition' : '') + (S.burst && S.burst.on ? ' · high-frequency train' : '');
  },
  clock() { return S.stats.rel + ' spikes relayed · ' + S.stats.ap + ' fired'; },

  setup(game) {
    g = game; S = g.S; st = {};
    Object.assign(S, {
      v: REST, inj: 0, injI: 0, ap: null, lastAP: -99, lastIn: -99, reachedThr: false, hist: [], histT: 0, marks: [], spikes: [], bapT: null,
      inQ: [], inT: 1.2, inputOn: false, thN: 0, thT: 0, thLast: -99, ltpOn: false, follow: false, ischAt: 0, geneTut: false, spCa: 0, camk: 0, insT: 0, reserve: 1, mgOut: -99, postFlash: -99,
      apWait: [], spent: 0, empty: 1, cleft: 0, caT: 0, caTT: 0, tMito: 1, glnFly: 0,
      txQ: [], tx: null, tl: [], ship: [], dynT: 4,
      nucSig: 0, nucTx: false, consol: false,
      tut: true, tutDone: false, barrage: 0, barEnd: -99, barAP: 0, ipT: 8, isch: false, ischT: 0, exc: false, exGlu: 0, exGT: 0, caLoad: 0, excCleared: 0, burst: null, trainDone: false,
      rbc: 0, stats: { imp: 0, ox: 0, atp: 0, epsp: 0, ap: 0, arrive: 0, rel: 0, fail: 0, lost: 0, missed: 0, endo: 0, refill: 0, cleared: 0, pump: 0, coinc: 0, ltp: 0, theta: 0, genes: 0, cargo: 0, mitoShip: 0, excHits: 0 },
    });
    g.res.def('atp', { name: 'ATP · soma', short: 'ATP', v: 40, cap: 300, color: C.atp, desc: 'ATP in the cell body and dendrites, made by the soma\'s mitochondria. Pays for ion pumping, gene expression and shipping. A cortical neuron burns billions of ATP molecules per second.' })
      .def('atpT', { name: 'ATP · terminal', short: 'ATP (terminal)', v: 20, cap: 40, color: '#ffc04d', desc: 'ATP inside the axon terminal, ~1 cm from the soma. ATP cannot diffuse that far before it is used, so the terminal depends on its own docked mitochondria and on local glycolysis (the only source in the many boutons that lack a mitochondrion).' })
      .def('glc', { name: 'Glucose', short: 'glucose', v: 0, show: false, cap: 6, color: C.glc, desc: 'Glucose inside the soma, imported from the blood via GLUT1 (capillary wall) and then the neuronal transporter GLUT3. The adult brain burns ~120 g of glucose per day.' })
      .def('grad', { name: 'Na⁺/K⁺ gradient', short: '% gradient', v: 100, cap: 100, color: C.na, fmt: v => Math.round(v) + ' %', desc: 'How well the Na⁺ and K⁺ gradients are charged (Na⁺ ~145 mM out vs ~12 mM in; K⁺ ~4 mM out vs ~140 mM in). Every EPSP and spike lets some Na⁺ in and K⁺ out; the Na⁺/K⁺-ATPase restores them using ATP. If it runs down, the cell depolarises and cannot fire.' })
      .def('rrp', { name: 'Ready vesicles', short: 'vesicles', v: 5, show: false, cap: 6, color: '#f2d58a', desc: 'The readily releasable pool: synaptic vesicles (~40 nm, each holding a few thousand glutamate molecules) docked and primed at the active zone of the bouton. Typically ~5–10 per active zone.' })
      .def('glu', { name: 'Glutamate (terminal)', short: 'glutamate', v: 4, show: false, cap: 10, color: C.glu, desc: 'Cytosolic glutamate in the terminal, ready to be pumped into vesicles by VGLUT1. Most of it is recycled: the astrocyte takes up released glutamate, converts it to glutamine and hands it back; neuronal glutaminase turns it into glutamate again.' })
      .def('ampa', { name: 'Spine AMPA receptors', short: 'AMPAR units', v: 4, show: false, cap: 10, color: '#ffd166', desc: 'AMPA receptors in the postsynaptic density of the input spine (1 unit ≈ 5 receptors). More receptors = bigger EPSP = a stronger synapse. LTP inserts more.' });
    buildScenery();

    /* ================= soma ================= */
    mk({ id: 'glut3', name: 'GLUT3 glucose transporter', short: 'GLUT3', x: -11.6, y: 2, r: 1.6,
      draw(c, s) { const n = Math.min(3, lv('SLC2A3')); for (let i = 0; i < n; i++) D.transporter(c, s.x - .15 * i, s.y + (i - (n - 1) / 2) * 1.7, Math.PI + .21, 1.3, '#58d68d', s.jobs.length > i); },
      info: { title: 'GLUT3 (SLC2A3) — neuronal glucose transporter', sub: 'Soma & dendrite membrane · facilitated diffusion', body: 'Lets glucose slide down its concentration gradient into the neuron, no ATP needed. Glucose crosses the capillary wall first through GLUT1 in endothelial cells, then the narrow extracellular space, then GLUT3.',
        facts: ['GLUT3 has a high affinity (K<sub>m</sub> ≈ 1–3 mM) — well suited to the ~1–2 mM glucose in brain extracellular fluid, lower than in blood (~5 mM).', 'Neurons store almost no glycogen; the small brain glycogen reserve sits in astrocytes.', 'The adult brain consumes ~120 g of glucose per day.'],
        game: 'Uptake waits for your click until you express more SLC2A3.', live: () => [['Glucose in soma', Math.floor(res('glc')) + ' / ' + g.res.cap('glc')], ['Blood supply', S.isch ? 'reduced (ischemia)' : 'normal']] } });
    proc(st.glut3, { cap: () => lv('SLC2A3'), time: () => lv('SLC2A3') >= 3 ? .8 : 1.1, rate: () => S.isch ? .4 : 1, auto: () => lv('SLC2A3') >= 2,
      can: () => res('glc') + st.glut3.jobs.length >= g.res.cap('glc') ? 'Soma is full of glucose — burn some' : true,
      start() {}, finish() {
        const s = st.glut3, t = g.token({ x: s.x - 4, y: s.y + U.rand(-1, 1), draw: (c, t) => D.glucose(c, t.x, t.y, .45, t.age * 2) });
        t.to(s.x + 2.5, s.y, .45).then(() => { g.res.add('glc', 1); S.stats.imp++; }).fade(.2).die();
      } });

    mk({ id: 'mito', name: 'Mitochondria (oxidative phosphorylation)', short: 'Mitochondria', x: 8.2, y: 5.6, r: 1.8,
      draw(c, s) { const on = s.jobs.length > 0; if (on) D.glow(c, s.x, s.y, 2.6, S.isch ? '#7a6a8a' : '#ff9d5c', .5); mitoC(c, s.x, s.y, 2.2, .55, -.5, on && !S.isch); if (lv('PGC') >= 2) mitoC(c, s.x - 1.2, s.y + 1.5, 1.6, .5, .3, on && !S.isch); if (lv('PGC') >= 3) mitoC(c, s.x + .4, s.y - 1.7, 1.4, .5, 1.2, on && !S.isch); },
      badge: () => S.isch ? 'no O₂' : '',
      info: () => ({ title: 'Mitochondria — oxidative phosphorylation', sub: 'Soma · ~0.5 µm wide, 1–2 µm long (drawn to scale)', body: 'Glycolysis in the cytosol splits glucose into two pyruvate (+2 ATP). Pyruvate enters the mitochondrion, is burned in the TCA cycle, and the respiratory chain passes its electrons to <b>oxygen</b>, pumping protons; ATP synthase turns the proton flow into ATP. Neurons rely heavily on this — and so are among the first cells to fail when oxygen runs out.',
        facts: ['About <b>30 ATP per glucose</b> with oxygen (theoretical ~30–32), versus <b>2</b> without (glycolysis → lactate).', 'The brain is ~2 % of body mass but uses ~20 % of the body\'s resting oxygen and energy.', 'PGC-1α (gene <i>PPARGC1A</i>) drives the making of new mitochondria via NRF1 and TFAM.'],
        game: 'One click = one glucose fully burned (glycolysis + respiration) → +30 ATP tokens. During ischemia only 2.', live: () => [['Yield now', S.isch ? '2 ATP / glucose (no O₂)' : '30 ATP / glucose'], ['Glucose burned', S.stats.ox]] }) });
    proc(st.mito, { cap: () => lv('PGC') >= 3 ? 2 : 1, time: () => 2.6, auto: () => lv('PGC') >= 2, autoCan: () => res('atp') < g.res.cap('atp') - 30,
      can: () => res('glc') < 1 ? 'No glucose — import some at GLUT3' : true,
      start() { g.res.add('glc', -1); const a = st.glut3, m = st.mito, t = g.token({ x: a.x + 2, y: a.y, draw: (c, t) => D.glucose(c, t.x, t.y, .45, t.age * 2) }); t.to(m.x, m.y, .6).fade(.2).die(); },
      finish() {
        const m = st.mito, n = S.isch ? 2 : 30; g.res.add('atp', n, { x: m.x, y: m.y - 2 }); S.stats.ox++; S.stats.atp += n; g.learn('n_energy');
        for (let i = 0; i < (S.isch ? 1 : 4); i++) { const t = g.token({ x: m.x, y: m.y, draw: (c, t) => D.atp(c, t.x, t.y, .45) }); t.to(m.x + U.rand(-5, 2), m.y + U.rand(-6, 1), .8).fade(.3).die(); }
        if (S.isch) { const t = g.token({ x: m.x, y: m.y, draw: (c, t) => D.poly(c, t.x, t.y, .4, 3, t.age, '#ffb347', '#8a5300') }); t.to(m.x + 6, m.y + 5, 1.2).fade(.3).die(); g.floatText(m.x, m.y + 2.5, 'lactate', '#ffb347'); }
      } });

    mk({ id: 'nak', name: 'Na⁺/K⁺-ATPase', short: 'Na⁺/K⁺ pump', x: 11.6, y: 2, r: 1.6,
      draw(c, s) { const n = Math.min(3, lv('ATP1A3')); for (let i = 0; i < n; i++) D.pump(c, s.x + .1 * i, s.y + (i - (n - 1) / 2) * 1.7, Math.PI - .21, 1.2, s.jobs.length > i ? '#ffd08a' : '#ffb36b'); },
      info: { title: 'Na⁺/K⁺-ATPase (α3 = ATP1A3)', sub: 'Plasma membrane everywhere · P-type pump', body: 'For each ATP it hydrolyses, the pump throws <b>3 Na⁺ out</b> and brings <b>2 K⁺ in</b>. It recharges the gradients that every EPSP and every action potential run down. α3 is the neuron-specific catalytic subunit; it is recruited mainly when internal Na⁺ climbs during heavy activity.',
        facts: ['Restoring ion gradients after signalling is estimated to take roughly half or more of the ATP used by grey matter — making this pump the brain\'s biggest energy consumer.', 'An action potential in a cortical neuron is estimated to cost on the order of 10⁸ ATP.', 'Mutations in <i>ATP1A3</i> cause rapid-onset dystonia-parkinsonism and alternating hemiplegia of childhood.', 'The 3:2 charge imbalance makes the pump slightly electrogenic (a few mV).'],
        game: 'One click = 4 ATP → +8 % gradient. Real per-spike changes in ion concentration are tiny in the soma; the game exaggerates them so the bill is visible. Real pumps run continuously on their own; clicking them is a game device.',
        live: () => [['Gradient', Math.round(res('grad')) + ' %'], ['Resting potential now', Math.round(restV()) + ' mV']] } });
    proc(st.nak, { cap: () => lv('ATP1A3'), time: () => 1.2, auto: () => lv('ATP1A3') >= 2, autoCan: () => res('grad') < 96 && res('atp') >= 6,
      can: () => res('grad') >= 99.5 ? 'Gradient is fully charged' : res('atp') < 4 ? 'Needs 4 ATP' : true,
      start() { g.res.add('atp', -4); }, finish() {
        const s = st.nak; addGrad(8); S.stats.pump++;
        ions(3, C.na, { x: s.x - 1, y: s.y }, { x: s.x + 4, y: s.y - 1 }, .5, .35, .5); ions(2, C.k, { x: s.x + 4, y: s.y + 1 }, { x: s.x - 1.5, y: s.y + .5 }, .5, .35, .5, .2);
        if (S.stats.pump === 1) g.floatText(s.x, s.y - 2.5, '3 Na⁺ out · 2 K⁺ in · 1 ATP', '#ffd08a');
      } });

    mk({ id: 'nuc', name: 'Nucleus', short: 'Nucleus', x: NUC.x, y: NUC.y, r: NUC.r, noLabel: true, draw: drawNucleus,
      info: () => ({ title: 'Nucleus', sub: '~10 µm across · 46 chromosomes · ~20,000 protein-coding genes', body: 'The neuron\'s genome is the same as in every other cell of your body; what makes it a neuron is <b>which</b> genes it reads. Pyramidal neurons have a large, pale nucleus with a prominent nucleolus. Neurons stop dividing during development and most live as long as you do — so this one nucleus must keep the whole cell, including a centimetre of axon, supplied for decades.',
        facts: ['RNA polymerase II transcribes at roughly 1–4 kb per minute; long neuronal genes (some > 1 Mb) take hours to transcribe.', 'Activity switches on "immediate-early genes" such as <i>FOS</i> and <i>ARC</i> within minutes.'],
        live: () => [['Transcribing', S.tx ? S.tx.it.gene : '—'], ['Queue', S.txQ.length], ['Being translated', S.tl.length]] }) });
    mk({ id: 'er', name: 'Rough ER (Nissl bodies)', short: 'Nissl / ER', x: -6, y: -5, r: 1.8, draw() {},
      info: { title: 'Rough ER — Nissl bodies', sub: 'Soma & proximal dendrites · membrane-protein factory', body: 'Stacks of rough endoplasmic reticulum studded with ribosomes are so dense in neurons that they stain as dark "Nissl bodies" (Franz Nissl, 1890s). Every channel, receptor and transporter in this level — Nav1.6, AMPA receptors, VGLUT1, Cav2.1 — is threaded into the ER membrane here while it is being made.',
        facts: ['Nissl substance is absent from the axon hillock and the axon: the axon makes little protein of its own and depends on supply from the soma.', 'Proteins then go through the Golgi; in pyramidal neurons the Golgi sits at the base of the apical dendrite.'] } });
    mk({ id: 'golgi', name: 'Golgi apparatus', short: 'Golgi', x: 0, y: -10.5, r: 1.8, draw() {},
      info: { title: 'Golgi apparatus', sub: 'Base of the apical dendrite', body: 'Membrane proteins from the ER are modified (glycosylated) and sorted here into carriers bound for different destinations: the somatic membrane, dendrites and spines, the axon initial segment or — via the axon — the presynaptic terminals.',
        facts: ['In pyramidal neurons the Golgi is polarised toward the apical dendrite, and small "Golgi outposts" exist inside dendrites.', 'Sorting to axon vs dendrites depends on motor proteins and on a filter at the axon initial segment.'] } });
    mk({ id: 'ribo', name: 'Free polysomes', short: 'ribosomes', noLabel: true, x: -5, y: 7, r: 1.4, draw(c, s) { for (let i = 0; i < 5; i++) D.circle(c, s.x - 1 + i * .5, s.y + Math.sin(i * 1.7) * .3, .18, '#d9c7a3'); },
      info: { title: 'Free ribosomes (polysomes)', sub: 'Cytosol', body: 'Cytosolic proteins — kinases, motor proteins, transcription co-activators, clathrin, dynamin — are made on ribosomes floating free in the cytosol and are never inserted into a membrane.', facts: ['A ribosome adds ~5 amino acids per second in mammalian cells.'] } });
    mk({ id: 'gaba', name: 'Inhibitory synapse (GABA-A)', short: 'GABA synapse', x: -5.6, y: 10.6, r: 1.6,
      draw(c, s) { const on = g.t - (S.marks.length ? S.marks.filter(m => m.k === 'i').slice(-1)[0] || { t: -9 } : { t: -9 }).t < .4; D.circle(c, s.x, s.y + .5, 1.05, '#203a5c', C.gaba, 2 * g.px); if (on) D.glow(c, s.x, s.y, 2.2, C.gaba, .6); for (let i = 0; i < 4; i++) D.circle(c, s.x - .45 + i * .3, s.y + .5 + (i % 2) * .3, .13, '#cfe3ff'); },
      info: { title: 'Inhibitory synapse — GABA-A receptors', sub: 'From a parvalbumin basket cell onto the soma', body: 'Basket-cell interneurons wrap pyramidal cell bodies in GABA-releasing boutons. GABA opens <b>GABA-A receptors</b>, pentameric Cl⁻ channels. Because the K⁺–Cl⁻ cotransporter KCC2 keeps internal Cl⁻ low (~5–7 mM), Cl⁻ flows in, holding the membrane near E<sub>Cl</sub> ≈ −75 mV and shunting excitatory currents.',
        facts: ['About 20–30 % of cortical neurons are inhibitory interneurons.', 'Chandelier cells target the axon initial segment itself; somatostatin cells target distal dendrites.', 'Benzodiazepines, barbiturates and many anaesthetics act on GABA-A receptors.', 'In immature neurons Cl⁻ is high (NKCC1 dominates) and GABA can even be depolarising.'],
        game: 'Background IPSPs arrive every few seconds; a burst of them is an event.' } });

    /* ================= input synapse (magnified inset) ================= */
    mk({ id: 'spine', name: 'Dendritic spine: AMPA & NMDA receptors', short: 'Input spine', x: -72, y: -60, r: 8, labelDy: 14, noLabel: true,
      draw() {}, ready: () => lv('GRIA2') < 2 && S.inQ.length > 0, onClick: () => takeInput(true),
      badge: () => S.inQ.length ? S.inQ.length + ' glu' : '',
      info: () => ({ title: 'Dendritic spine — the input synapse', sub: 'Magnified ×25 · head ~0.5–1 µm · cleft ~20 nm', body: 'An axon from another pyramidal neuron ends on this spine. Glutamate released into the 20 nm cleft binds <b>AMPA receptors</b> (GluA1/GluA2 tetramers): they open within a millisecond and Na⁺ rushes in, giving an excitatory postsynaptic potential (EPSP). <b>NMDA receptors</b> (GluN1 + GluN2A/B) bind glutamate too, but their pore is plugged by Mg²⁺ — unless the membrane is already depolarised, e.g. by the neuron\'s own action potential spreading back into the dendrite. Then Ca²⁺ enters: the coincidence detector of learning.',
        facts: ['A single synapse makes an EPSP of only ~0.2–1 mV at the soma; reaching threshold (~15 mV above rest) needs many inputs arriving together (spatial and temporal summation).', 'Pyramidal neurons carry ~1–3 spines per µm of dendrite — thousands to tens of thousands in total.', 'NMDA receptors also need a co-agonist (glycine or D-serine) to open.', 'The postsynaptic density (PSD) is a ~30–50 nm thick protein mat anchoring receptors; PSD-95 is its main scaffold.'],
        game: 'One click = a volley of glutamate from ~10 synchronised inputs onto this branch (≈ ' + (1.75 * res('ampa')).toFixed(0) + ' mV at the soma). In reality receptors open by themselves within ~1 ms; you click until GRIA2 is expressed. 1 AMPA glyph ≈ 5 receptors.',
        live: () => [['Glutamate waiting', S.inQ.length], ['EPSP size', (1.75 * res('ampa') * (S.barrage > 0 ? .6 : 1)).toFixed(1) + ' mV'], ['AMPA receptors', '≈ ' + res('ampa') * 5], ['Spare receptors (endosome)', '≈ ' + S.reserve * 5]] }) });
    mk({ id: 'camk', name: 'CaMKII holoenzyme', short: 'CaMKII', x: -76, y: -55, r: 2.4, draw() {}, noLabel: true,
      info: () => ({ title: 'CaMKII — the memory kinase', sub: 'Spine head · 12-subunit holoenzyme', body: 'Ca²⁺ entering through NMDA receptors binds calmodulin, which switches on CaMKII. Neighbouring subunits of the ring phosphorylate each other on <b>Thr286</b>; once phosphorylated, a subunit stays active even after Ca²⁺ is gone — a molecular memory of the event. Active CaMKII binds GluN2B and phosphorylates AMPA-receptor auxiliary proteins (TARPs such as stargazin) and GluA1 (Ser831), trapping more AMPA receptors in the synapse.',
        facts: ['CaMKIIα is one of the most abundant proteins in the forebrain — around 1–2 % of total protein in the hippocampus.', 'Its mRNA is shipped into dendrites and translated locally, close to the synapses that need it.', 'Mice with CaMKIIα T286A (cannot autophosphorylate) have impaired LTP and spatial learning.'],
        game: 'Glowing subunits = active (phosphorylated). Activation needs Ca²⁺ above a threshold — i.e. pre- and postsynaptic activity coinciding repeatedly and quickly.',
        live: () => [['Active subunits', Math.floor(S.camk) + ' / 12'], ['Spine Ca²⁺', Math.round(S.spCa) + ' %'], ['Coincidences so far', S.stats.coinc]] }) });
    mk({ id: 'astroIn', name: 'Astrocyte process (EAAT2)', short: 'astrocyte', x: -92, y: -71, r: 4, noLabel: true,
      draw() {}, ready: () => S.exGlu > 0 && !st.astroIn.busy, badge: () => S.exGlu ? S.exGlu + ' glu' : '',
      onClick() { const s = st.astroIn; if (S.exGlu <= 0) { g.floatText(s.x, s.y - 5, 'Glutamate already cleared', '#cbd5e1'); return; } if (s.busy) return; s.busy = true; g.after(.45, () => { s.busy = false; clearExGlu(); }); },
      info: { title: 'Perisynaptic astrocyte process', sub: 'Wraps the synapse · EAAT2 (GLT-1) and EAAT1 (GLAST)', body: 'Fine astrocyte processes hug most cortical synapses ("tripartite synapse"). Their glutamate transporters pull glutamate out of the cleft within milliseconds, keeping signals sharp and preventing glutamate from spilling over and over-activating NMDA receptors.',
        facts: ['Each glutamate is co-transported with 3 Na⁺ and 1 H⁺, while 1 K⁺ goes out — the astrocyte\'s Na⁺ gradient powers uptake.', 'EAAT2 (SLC1A2) accounts for most glutamate uptake in the forebrain.'], game: 'Works automatically — only during the excitotoxicity event can you help it by clicking.' } });
    mk({ id: 'pre', name: 'Presynaptic bouton (another neuron)', short: 'pre', x: PRE.x, y: PRE.y + 2, r: 5.5, noLabel: true, draw() {},
      ready: () => S.ltpOn && !S.thN && g.t - S.thLast > 1.4, onClick: () => thetaBurst(true), badge: () => S.ltpOn ? (S.thN ? 'θ…' : 'θ') : '',
      info: { title: 'Presynaptic bouton of another neuron', sub: 'Input · drawn in lavender to show it is not your cell', body: 'One of the thousands of axons that contact your dendrites. When its own action potential arrives, it releases a vesicle of glutamate into the cleft above your spine.', facts: ['Each of your inputs is unreliable: individual cortical synapses release a vesicle on only ~10–50 % of spikes.'], game: 'Input timing is generated by the game (faster during the train). During the LTP objective you trigger theta bursts (4 inputs at ~100 Hz) here, as an experimenter would with a stimulating electrode; in real theta-burst stimulation such bursts repeat ~5 times per second, here you pace them by clicking.' } });

    /* ================= axon ================= */
    mk({ id: 'ais', name: 'Axon initial segment (Nav1.6)', short: 'AIS', x: 32, y: AY, r: 5, labelDy: 6,
      draw(c, s) { if (S.v >= thr() && !S.ap) D.glow(c, (AIS.x1 + AIS.x2) / 2, AY, 9, C.na, .3); },
      ready: () => lv('SCN8A') < 2 && canFire(), onClick: () => fire(true),
      badge: () => S.ap ? 'AP!' : '',
      info: () => ({ title: 'Axon initial segment — the trigger zone', sub: '~20–60 µm long (drawn 32 µm) · just past the axon hillock', body: 'All the dendritic inputs funnel through the soma to this short stretch of axon, which is packed with <b>Nav1.6 sodium channels</b> held in place by <b>ankyrin-G</b> and βIV-spectrin on a periodic actin–spectrin scaffold. When V<sub>m</sub> here reaches ≈ −55 mV, Nav channels open, Na⁺ floods in and drives V<sub>m</sub> to ≈ +30 mV. Within ~1 ms they <b>inactivate</b>, and voltage-gated K⁺ channels (Kv1 at the AIS, with BK and other Kv channels) repolarise the membrane; Kv7 (M-current) channels there mainly set excitability and threshold. Until Nav channels recover, the axon is refractory.',
        facts: ['Nav channel density at the AIS is estimated at ~3- to ~50-fold that of the soma (the figure is still debated).', 'Nav1.6 (<i>SCN8A</i>) activates at more negative voltages than Nav1.2 — so the spike starts here.', 'The AIS also acts as a filter that keeps dendritic proteins out of the axon.', 'An action potential lasts ~1 ms; pyramidal neurons can briefly fire at > 100 Hz.'],
        game: 'Each spike is slowed ~500× so you can see the waveform. Real Nav channels need no click; you click until SCN8A is expressed.',
        live: () => [['V<sub>m</sub>', Math.round(S.v) + ' mV'], ['Threshold now', Math.round(thr()) + ' mV' + (g.t - S.lastAP < 1 ? ' (relative refractory)' : '')], ['Spikes fired', S.stats.ap]] }) });
    mk({ id: 'hill', name: 'Axon hillock & transport gate', short: 'hillock', x: 7.4, y: 14.6, r: 1.6, noLabel: true, draw() {},
      info: { title: 'Axon hillock', sub: 'Where the axon leaves the soma', body: 'A cone of cytoplasm free of Nissl substance, where microtubules bundle into the axon. Cargo bound for the axon is loaded onto kinesin motors here; the axon initial segment just beyond acts as a selective filter.', facts: ['In the axon all microtubules point plus-end-out, so kinesins (plus-end motors) carry cargo away from the soma and dynein brings cargo back. Dendrites have mixed microtubule orientation.'] } });
    mk({ id: 'node', name: 'Node of Ranvier', short: 'node', x: NODES[0], y: AY, r: 2.2, labelDy: 8,
      draw(c, s) {}, info: nodeInfo });
    mk({ id: 'node2', name: 'Node of Ranvier', short: 'node', x: NODES[1], y: AY, r: 2.2, noLabel: true, draw() {}, info: nodeInfo });
    mk({ id: 'oligo', name: 'Oligodendrocyte (makes the myelin)', short: 'oligodendrocyte', x: 104, y: 44, r: 3.2,
      draw() {},
      info: { title: 'Oligodendrocyte', sub: 'A separate glial cell · CNS myelin', body: 'The myelin around your axon is not made by the neuron. Each oligodendrocyte extends processes that wrap up to dozens of internodes on different axons in many tight layers of membrane, rich in lipids and in proteins such as myelin basic protein (MBP) and proteolipid protein (PLP1).',
        facts: ['One oligodendrocyte can myelinate up to ~50 internodes.', 'Myelin is ~70–80 % lipid; its high resistance and low capacitance let the spike leap between nodes.', 'In the peripheral nervous system Schwann cells do this job, one internode each.', 'Loss of CNS myelin (e.g. in multiple sclerosis) slows or blocks conduction.'],
        game: 'Myelin genes are the oligodendrocyte\'s, not yours — so they are not in your Genome.' } });
    mk({ id: 'mt', name: 'Microtubule highway: kinesin & dynein', short: 'axonal transport', x: 150, y: AY, r: 2.6, noLabel: true, draw() {},
      info: () => ({ title: 'Axonal transport', sub: 'Microtubules · kinesin-1 (KIF5) & cytoplasmic dynein', body: 'The axon has no protein factory to speak of, so nearly everything it needs must be made in the soma and carried. <b>Kinesin-1</b> walks toward microtubule plus ends — out to the terminal — in 8 nm steps, hauling vesicles and mitochondria (via the adaptors TRAK1/2 and Miro1). Synaptic-vesicle precursors ride kinesin-3 (KIF1A). <b>Dynein</b> brings worn-out organelles and signalling endosomes back.',
        facts: ['<b>Fast</b> transport (membrane cargo): ~50–400 mm/day (~0.5–5 µm/s). 1 cm takes roughly half an hour to five hours.', '<b>Slow</b> transport (cytosolic proteins such as clathrin, actin, many enzymes: "slow component b"): ~2–8 mm/day — days for 1 cm.', 'Mitochondria move at ~0.3–1 µm/s in stop-and-go fashion; most are stationary, anchored by syntaphilin.', 'Mutations in <i>KIF5A</i> cause hereditary spastic paraplegia and are linked to ALS; the longest axons suffer first.'],
        game: 'Transit is compressed to ~30 s (fast), ~38 s (mitochondria) and ~60 s (slow). One motor drawn = many.',
        live: () => [['Cargo in transit', S.ship.filter(s => s.active).length], ['Waiting for a motor', S.ship.filter(s => !s.active).length], ['Fast-transport slots', 1 + lv('KIF5A')]] }) });
    mk({ id: 'brk', name: '≈ 1 cm of axon not shown', short: 'axon break', x: (BRK.x1 + BRK.x2) / 2, y: AY, r: 3.5, labelDy: 14, noLabel: true, draw() {},
      info: () => ({ title: 'The axon you cannot see', sub: '≈ 1 cm omitted — 50× longer than everything drawn', body: 'Drawn to scale, this axon would stretch ~1 cm — the width of a fingernail — to reach its target in another cortical area. At this zoom that is several metres of screen. It contains well over 100 more internodes and nodes, and the spike crosses it in a few milliseconds.',
        facts: ['Cortical pyramidal axons range from < 1 mm (local) to ~1 m (corticospinal neurons projecting to the lower spinal cord).', 'At ~5–10 m/s (thin myelinated cortical fibre) 1 cm takes ~1–2 ms; unmyelinated at ~0.5–1 m/s it would take 10–20 ms. Thick myelinated peripheral fibres reach ~100 m/s.', 'For long-projection neurons, most of the cell\'s cytoplasm is in the axon, not the soma.'],
        game: 'Spikes and cargo disappear here and re-emerge after a compressed delay.', live: () => [['Cargo inside the hidden axon', S.ship.filter(s => s.active && s.p >= .16 && s.p < .86).map(s => s.it.gene.split(' ')[0] + ' ' + Math.round(s.p * 100) + '%').join(', ') || '—']] }) });

    /* ================= terminal (real scale + magnified inset) ================= */
    mk({ id: 'bxReal', name: 'Terminal bouton (true size)', short: 'bouton', x: BX.x, y: BX.y, r: 1.4, labelDy: 6, draw() {},
      info: { title: 'Axon terminal bouton — at true size', sub: '~1 µm · magnified ×25 in the inset to the right', body: 'Cortical axons release glutamate from thousands of swellings ("boutons"), most of them en passant along the axon, some at branch ends like this one. Each holds ~100–200 synaptic vesicles and often a mitochondrion.', facts: ['Roughly a third to a half of cortical boutons contain a mitochondrion.', 'Boutons are spaced every few µm along cortical axons.'] } });
    mk({ id: 'bouton', name: 'Active zone: Cav2.1 + SNARE fusion', short: 'Active zone', x: BTN.x + BTN.r - 1.2, y: BTN.y, r: 3.2, labelDy: 18,
      draw() {}, ready: () => lv('CACNA1A') < 2 && S.apWait.length > 0, onClick: () => release(true), badge: () => S.apWait.length ? 'spike!' : '',
      info: () => ({ title: 'Active zone — where vesicles fuse', sub: 'Presynaptic membrane facing the cleft', body: 'The arriving spike opens <b>Cav2.1 (P/Q-type)</b> Ca²⁺ channels clustered right next to docked vesicles. Ca²⁺ rises to tens of µM in nanodomains and binds <b>synaptotagmin-1</b> on the vesicle. The SNARE proteins — <b>syntaxin-1</b> and <b>SNAP-25</b> on the plasma membrane, <b>VAMP2 (synaptobrevin)</b> on the vesicle — are already partly zipped (helped by Munc18-1 and Munc13-1, held by complexin). Ca²⁺-bound synaptotagmin releases the clamp: the SNAREs zip fully and the membranes fuse in well under a millisecond.',
        facts: ['A vesicle is ~40 nm wide and holds a few thousand glutamate molecules.', 'The readily releasable pool is ~5–10 vesicles per active zone; a cortical synapse releases on only a fraction of spikes.', 'Botulinum toxin A cleaves SNAP-25 and tetanus toxin cleaves VAMP2 — both block release.', 'Nobel Prize 2013 (Rothman, Schekman, Südhof) for the vesicle-fusion machinery.'],
        game: 'You click to open Cav2.1 until CACNA1A is expressed (and shipped!); real channels are opened by the spike itself. Here every spike that finds a primed vesicle releases exactly 1 — real cortical synapses release on only ~10–50 % of spikes.',
        live: () => [['Spike waiting', S.apWait.length ? 'yes' : 'no'], ['Ready vesicles', Math.floor(res('rrp'))], ['Released / failures', S.stats.rel + ' / ' + S.stats.fail]] }) });
    mk({ id: 'endo', name: 'Endocytosis: clathrin + dynamin', short: 'endocytosis', x: 256.5, y: 9.2, r: 2.4, labelDy: 6,
      draw() {}, badge: () => S.spent || '',
      info: { title: 'Vesicle recycling — endocytosis', sub: 'Periactive zone around the active zone', body: 'After fusion the vesicle membrane is part of the plasma membrane. It is retrieved by endocytosis: adaptor AP-2 and <b>clathrin</b> form a coated pit, <b>dynamin-1</b> (a GTPase) assembles a collar and pinches it off, and Hsc70 strips the clathrin coat using ATP. Faster clathrin-independent "ultrafast" endocytosis also exists.',
        facts: ['Clathrin-mediated endocytosis takes ~10–20 s; ultrafast endocytosis ~50–100 ms.', 'A terminal has only ~100–200 vesicles; without recycling it would run dry within seconds of high-frequency firing.', 'Clathrin travels down the axon by slow axonal transport — days for a centimetre.'],
        game: 'One click = one vesicle retrieved, −1 terminal ATP. DNM1·CLTC (expressed and shipped by slow transport) automates it.' } });
    proc(st.endo, { cap: () => lv('DNM1') >= 2 ? 2 : 1, time: () => 1.8, auto: () => lv('DNM1') >= 2, autoCan: () => st.endo.jobs.length < 1,
      can: () => S.spent < 1 ? 'No fused vesicle membrane to retrieve' : res('atpT') < 1 ? 'Terminal is out of ATP — ship mitochondria' : true,
      start() { S.spent--; g.res.add('atpT', -1); }, finish() { S.empty++; S.stats.endo++; } });
    boostable(st.endo, () => S.spent);
    mk({ id: 'vglut', name: 'Refill & prime: VGLUT1 + V-ATPase', short: 'refill', x: 246, y: 13.5, r: 3.2, labelDy: 4,
      draw() {}, badge: () => S.empty || '',
      info: { title: 'Refilling vesicles — VGLUT1 and the V-ATPase', sub: 'Synaptic vesicle membrane', body: 'The vesicular <b>V-ATPase</b> uses ATP to pump protons into the vesicle; <b>VGLUT1</b> (<i>SLC17A7</i>) then uses that electrochemical gradient to load glutamate. Refilled vesicles are docked and primed by Munc13-1 and Munc18-1, after NSF (an ATPase) has pulled apart the old, spent SNARE complexes.',
        facts: ['VGLUT1 is the dominant vesicular glutamate transporter of cortical and hippocampal excitatory neurons; VGLUT2 dominates in thalamus and brainstem.', 'Vesicular glutamate reaches ~100 mM or more.'],
        game: 'One click = 1 empty vesicle + 1 glutamate + 1.5 terminal ATP → 1 ready vesicle. SLC17A7 (fast transport) automates it.' } });
    proc(st.vglut, { cap: () => lv('SLC17A7') >= 2 ? 2 : 1, time: () => 2.2, auto: () => lv('SLC17A7') >= 2, autoCan: () => st.vglut.jobs.length < 1,
      can: () => S.empty < 1 ? 'No empty vesicle — retrieve membrane first' : res('rrp') >= g.res.cap('rrp') ? 'Ready pool is full' : res('glu') < 1 ? 'No glutamate — wait for glutamine from the astrocyte' : res('atpT') < 1.5 ? 'Not enough terminal ATP' : true,
      start() { S.empty--; g.res.add('glu', -1); g.res.add('atpT', -1.5); }, finish() { g.res.add('rrp', 1); S.stats.refill++; } });
    boostable(st.vglut, () => S.empty);
    mk({ id: 'tmito', name: 'Terminal mitochondria', short: 'mitochondria', x: BTN.x - 3, y: BTN.y + 7, r: 3, labelDy: 4,
      draw() {}, badge: () => '×' + S.tMito,
      info: () => ({ title: 'Mitochondria at the terminal', sub: 'Docked by syntaphilin · delivered by kinesin-1', body: 'ATP is used within milliseconds to seconds of being made and cannot diffuse a centimetre. The terminal therefore runs on <b>its own mitochondria</b>, which the soma must ship down the axon. Miro1 (<i>RHOT1</i>) — a Ca²⁺-sensing GTPase — and TRAK1 link them to kinesin-1; Ca²⁺ binding to Miro halts the kinesin motor, so mitochondria tend to stop where synapses are active.',
        facts: ['Presynaptic mitochondria also buffer Ca²⁺.', 'Terminals with a mitochondrion sustain release better during repetitive firing.', 'Glycolysis also contributes substantially: boutons without a mitochondrion depend on it, and glycolytic enzymes gather near vesicles during activity.'],
        game: 'Each mitochondrion makes 0.3 terminal-ATP/s (0.03 during ischemia), plus 0.08/s from glycolysis. Real presynaptic glycolysis matters more than this small fixed trickle suggests.',
        live: () => [['Mitochondria in terminal region', S.tMito], ['ATP production', ((.3 * S.tMito * (S.isch ? .1 : 1) + .08)).toFixed(2) + ' / s'], ['Ca²⁺ to extrude', S.caT]] }) });
    mk({ id: 'astro', name: 'Astrocyte: glutamate → glutamine', short: 'astrocyte', x: 266, y: 4.5, r: 3.4, labelDy: 2,
      draw() {}, badge: () => S.cleft || '',
      info: { title: 'Astrocyte — glutamate clearance and the glutamate–glutamine cycle', sub: 'Perisynaptic process · EAAT2 · glutamine synthetase', body: 'The astrocyte takes up released glutamate with <b>EAAT2</b> (and EAAT1), converts it to harmless <b>glutamine</b> with glutamine synthetase (using its own ATP), and releases it. The neuron imports glutamine and its mitochondrial <b>glutaminase</b> (<i>GLS</i>) turns it back into glutamate for VGLUT1.',
        facts: ['Neurons largely lack pyruvate carboxylase, so they cannot easily make new glutamate from glucose — they depend on astrocytes.', 'Glutamate in the cleft peaks near ~1 mM and is cleared within a few milliseconds.', 'Glutamine transporters of the SNAT family move glutamine between the cells (exactly which ones is still debated).'],
        game: 'The astrocyte pays its own ATP (not counted). After the tutorial it works by itself; you can still click to speed it up.' } });
    proc(st.astro, { cap: () => 1, time: () => .7, rate: () => S.isch ? .3 : 1, auto: () => !S.tut,
      can: () => S.cleft < 1 ? 'The cleft is clear' : true,
      start() { S.cleft--; const t = g.token({ x: BTN.x + BTN.r + .3, y: BTN.y + U.rand(-3, 3), draw: dotDraw(C.glu, .3) }); t.to(st.astro.x, st.astro.y + 1, .4).fade(.2).die(); },
      finish() {
        S.stats.cleared++; S.glnFly++; g.learn('n_glia');
        const t = g.token({ x: st.astro.x, y: st.astro.y, draw: dotDraw(C.gln, .34) });
        t.to(BTN.x + 4, BTN.y - 9, 1.1).then(() => { S.glnFly--; g.res.add('glu', 1); }).fade(.2).die();
      } });
    mk({ id: 'post', name: 'Next neuron\'s spine', short: 'next neuron', x: POST.x + 2, y: POST.y, r: 5, labelDy: 10,
      draw() {}, badge: () => S.stats.rel || '',
      info: () => ({ title: 'The next neuron', sub: 'A spine of a neuron in another cortical area', body: 'Your glutamate binds its AMPA receptors and makes a small EPSP — one vote among thousands. Whether it fires depends on all its other inputs, just as yours did.',
        facts: ['A cortical pyramidal neuron makes thousands of output synapses.', 'Glutamate is the transmitter of ~80 % of cortical neurons; GABA of most of the rest.'], live: () => [['Spikes relayed', S.stats.rel], ['Glutamate in cleft', S.cleft], ['Lost to spill-over', S.stats.lost]] }) });

    /* ================= blood & glia (context) ================= */
    mk({ id: 'cap', name: 'Capillary', short: 'capillary', x: -48, y: 36, r: 3.2, labelDy: 6, draw() {},
      info: { title: 'Capillary', sub: '~5–7 µm wide · red cells squeeze through single-file', body: 'Brain capillaries are lined by endothelial cells sealed by tight junctions (the blood–brain barrier). Glucose crosses via GLUT1; oxygen diffuses. No neuron is more than a few tens of µm from a capillary.',
        facts: ['Total capillary length in the human brain is several hundred kilometres.', 'Active brain regions receive more blood within seconds — the basis of the fMRI BOLD signal.'],
        game: 'During the ischemia event, flow drops.', live: () => [['Flow', S.isch ? 'reduced' : 'normal']] } });
    mk({ id: 'astroMain', name: 'Astrocyte', short: 'astrocyte', x: -34, y: 54, r: 3, labelDy: 5, draw() {},
      info: { title: 'Astrocyte', sub: 'Star-shaped glial cell · endfeet on capillaries', body: 'Astrocytes tile the cortex: each one\'s fine processes touch huge numbers of synapses, while its endfeet cover blood vessels. They clear glutamate and K⁺, recycle glutamate as glutamine, store glycogen and help regulate blood flow.',
        facts: ['A human cortical astrocyte may contact up to ~2 million synapses (rodent: ~100,000).', '<b>Hypothesis</b> (debated): the astrocyte–neuron lactate shuttle proposes that astrocytes turn glucose into lactate and pass it to neurons as fuel. How much this contributes in vivo is still argued.'] } });

    for (const s of g.stations) if (s.badge) { const b = s.badge; s.badge = (a, gg) => a.underUI ? '' : b(a, gg); }
    /* ================= camera shortcuts (screen-space chips; their stations follow the chips every frame) ================= */
    for (const n of NAV) mk({ id: 'nav_' + n[0], name: 'Jump to: ' + n[1], short: n[1], x: -999, y: -999, r: .001, noLabel: true, draw() {}, nav: n,
      onClick: () => { view(n[0], true); g.select(S.lastSel || null); } });

    /* ================= genes ================= */
    const tut = () => S.tutDone ? true : 'Learn the basic loop first (objective 11)';
    const plast = () => S.trainDone ? true : 'Plasticity comes last: relay the high-frequency train first';
    const term = () => S.termOpen ? true : 'Automate the soma first (objective 12) — then supply the far terminal';
    const cost = arr => l => ({ atp: Math.round(arr[l] * 1.55 / 5) * 5 });
    const auto = (first, more) => l => l === 2 ? first : more;
    g.shop.add({ id: 'SLC2A3', gene: 'SLC2A3', title: 'GLUT3 glucose transporter', group: 'Energy (soma)', max: 3, level: 1, kind: 'soma', dest: 'glut3', col: '#58d68d', cost: cost([0, 0, 60, 110]), req: tut,
      desc: auto('More GLUT3 in the soma membrane: glucose flows in <b>by itself</b>.', '+1 transporter: faster uptake.'), onBuy: express });
    g.shop.add({ id: 'PGC', gene: 'PPARGC1A', title: 'PGC-1α: build more mitochondria', group: 'Energy (soma)', max: 3, level: 1, kind: 'nuc', col: '#ff9d5c', cost: cost([0, 0, 80, 150]), req: tut,
      desc: auto('A transcriptional co-activator that switches on mitochondrial biogenesis (via NRF1 → TFAM): the soma\'s mitochondria burn glucose <b>automatically</b>.', 'More mitochondria: two glucose at a time.'), onBuy: express });
    g.shop.add({ id: 'ATP1A3', gene: 'ATP1A3', title: 'Na⁺/K⁺-ATPase α3', group: 'Energy (soma)', max: 3, level: 1, kind: 'soma', dest: 'nak', col: '#ffb36b', cost: cost([0, 0, 70, 130]), req: () => S.geneTut ? true : tut(),
      desc: auto('More pumps: the gradient is restored <b>automatically</b> (still 3 Na⁺ out, 2 K⁺ in per ATP).', 'Extra pumps: faster recovery after bursts.'), onBuy: express });
    g.shop.add({ id: 'SCN8A', gene: 'SCN8A', title: 'Nav1.6 sodium channels', group: 'Signalling', max: 2, level: 1, kind: 'ais', col: C.na, cost: cost([0, 0, 90]), req: tut,
      desc: () => 'More Nav1.6, anchored by ankyrin-G at the AIS: the neuron fires <b>by itself</b> whenever V<sub>m</sub> crosses threshold.', onBuy: express });
    g.shop.add({ id: 'GRIA2', gene: 'GRIA2', title: 'GluA2 AMPA receptor subunit', group: 'Signalling', max: 2, level: 1, kind: 'spine', col: '#ffa94d', cost: cost([0, 0, 80]), req: tut,
      desc: () => 'GluA2 (Q/R-edited, Ca²⁺-impermeable) assembles with GluA1 into the bulk of the spine\'s AMPA receptors: the spine responds to glutamate <b>on its own</b>.', onBuy: express });
    g.shop.add({ id: 'GRIA1', gene: 'GRIA1', title: 'GluA1 reserve receptors', group: 'Plasticity', max: 2, level: 0, kind: 'spine', col: '#ffd166', cost: cost([0, 65, 120]), req: plast,
      desc: () => '+3 units of GluA1-containing AMPA receptors waiting in the spine\'s recycling endosome — the receptors CaMKII inserts during LTP.', onBuy: express, onGrant: () => { S.reserve += 3; } });
    g.shop.add({ id: 'CAMK2A', gene: 'CAMK2A', title: 'More CaMKIIα (made in the dendrite)', group: 'Plasticity', max: 2, level: 0, kind: 'local', col: C.camk, cost: cost([0, 70, 110]), req: plast,
      desc: () => 'Its mRNA travels into the dendrite and is translated right at the spine. More holoenzymes: CaMKII switches on faster when Ca²⁺ arrives.', onBuy: express });
    g.shop.add({ id: 'KIF5A', gene: 'KIF5A', title: 'Kinesin-1 heavy chain', group: 'Logistics', max: 2, level: 0, kind: 'motor', col: '#9be7ff', cost: cost([0, 70, 120]), req: tut,
      desc: () => 'More kinesin-1 motors: +1 cargo can travel down the axon by fast transport at the same time. (Game simplification: one motor pool for all fast cargo — really, synaptic-vesicle precursors carrying VGLUT1 ride kinesin-3/KIF1A.)', onBuy: express });
    g.shop.add({ id: 'MITO', gene: 'RHOT1 · TRAK1', title: 'Ship a mitochondrion', group: 'Logistics', max: 4, level: 0, cost: cost([0, 60, 80, 100, 120]), req: term,
      desc: () => 'Miro1 + TRAK1 hook a mitochondrion onto kinesin-1. It walks ~1 cm, docks at the terminal and makes ATP there.', onBuy: shipMito });
    g.shop.add({ id: 'CACNA1A', gene: 'CACNA1A', title: 'Cav2.1 (P/Q-type) Ca²⁺ channels', group: 'Terminal — shipped down the axon', max: 2, level: 1, kind: 'fast', col: C.ca, cost: cost([0, 0, 85]), req: term,
      desc: () => 'Fast axonal transport (~1 cm). More Cav2.1 at the active zone: every arriving spike opens them <b>by itself</b> (in the game every spike then releases a vesicle if one is primed; real release is probabilistic).', onBuy: express });
    g.shop.add({ id: 'SLC17A7', gene: 'SLC17A7', title: 'VGLUT1 vesicular glutamate transporter', group: 'Terminal — shipped down the axon', max: 2, level: 1, kind: 'fast', col: C.glu, cost: cost([0, 0, 75]), req: term,
      desc: () => 'Fast transport on synaptic-vesicle precursors. Empty vesicles are refilled and primed <b>automatically</b>.', onBuy: express });
    g.shop.add({ id: 'DNM1', gene: 'DNM1 · CLTC', title: 'Dynamin-1 + clathrin', group: 'Terminal — shipped down the axon', max: 2, level: 1, kind: 'slow', col: '#c4b5fd', cost: cost([0, 0, 70]), req: term,
      desc: () => 'Cytosolic proteins: they travel by <b>slow</b> axonal transport (takes longest). Vesicle membrane is retrieved <b>automatically</b>.', onBuy: express });

    /* ================= objectives ================= */
    const mark = () => { S.mark = S.stats.rel; };
    view('all', false);
    g.obj.set([
      { text: 'Import glucose', why: 'Click the green <b>GLUT3</b> transporter on the left of the cell body — twice.', hint: 'Neurons run on glucose from the blood. Click <b>GLUT3</b> in the soma membrane to let glucose in (2×).', target: 'glut3',
        onStart: () => view('soma', true), progress: () => [Math.min(2, S.stats.imp), 2], check: () => S.stats.imp >= 2 },
      { text: 'Burn it in a mitochondrion', why: '1 glucose + O₂ → ~30 ATP (glycolysis + oxidative phosphorylation).', hint: 'Click the orange <b>mitochondria</b> on the right of the soma.', target: 'mito', check: () => S.stats.ox >= 1 },
      { text: 'Receive a synaptic input', why: 'When glutamate appears in the cleft of the magnified spine, click the spine: AMPA receptors open, Na⁺ flows in.', hint: 'This box is your input spine magnified ×25. When glutamate (orange) lands in the cleft, click the <b>spine</b>.', target: 'spine',
        onStart: () => { S.inputOn = true; S.inT = 2.2; view('input', true); }, check: () => S.stats.epsp >= 1 },
      { text: 'Sum inputs to threshold (−55 mV)', why: 'One EPSP is far too small. Let 2–3 inputs queue up, then click them in quick succession. Watch the membrane-potential trace.', hint: 'Temporal summation: EPSPs add up if they arrive before the previous ones decay. Reach <b>−55 mV</b>.', target: 'spine',
        progress: () => [Math.max(0, Math.round(Math.max(...S.hist.slice(-60), -70) + 70)), 15], check: () => S.reachedThr },
      { text: 'Fire an action potential', why: 'Click the <b>axon initial segment</b> while V<sub>m</sub> is above threshold. Nav1.6 opens → +30 mV.', hint: 'Above threshold! Click the <b>AIS</b> (the start of the axon) before V<sub>m</sub> decays. If you miss, sum a few more inputs.', target: 'ais',
        onStart: () => view('ais', true), check: () => S.stats.ap >= 1 },
      { text: 'Follow the spike down the axon', why: 'It jumps from node to node — saltatory conduction — then crosses ~1 cm you cannot see.', hint: 'Watch the spike leap between the gaps in the myelin (<b>nodes of Ranvier</b>). The camera follows it.', onStart: () => { S.follow = true; }, check: () => S.stats.arrive >= 1, onDone: () => { S.follow = false; } },
      { text: 'Release glutamate onto the next neuron', why: 'Click the <b>active zone</b>: Ca²⁺ via Cav2.1 → synaptotagmin-1 → SNAREs → fusion.', hint: 'The spike has depolarised your terminal (magnified ×25). Click the <b>active zone</b> facing the cleft.', target: 'bouton',
        onStart: () => view('output', true), check: () => S.stats.rel >= 1 },
      { text: 'Reset the synapse', why: 'Astrocyte clears the cleft · endocytosis retrieves the membrane · VGLUT1 refills a vesicle.', hint: 'Three clean-up steps, all in the magnified terminal. Follow the dashed marker.', target: 'astro',
        progress: () => [(S.stats.cleared >= 1) + (S.stats.endo >= 1) + (S.stats.refill >= 1), 3], check: () => S.stats.cleared >= 1 && S.stats.endo >= 1 && S.stats.refill >= 1 },
      { text: 'Pay the bill: recharge the gradient', why: 'Every EPSP and spike let Na⁺ in and K⁺ out. 1 ATP pumps 3 Na⁺ out and 2 K⁺ in. Bring the gradient back to 100 %.', hint: 'Click the <b>Na⁺/K⁺ pump</b> on the right edge of the soma until the gradient is full.', target: 'nak',
        onStart: () => view('soma', true), progress: () => [Math.round(res('grad')), 100], check: () => S.stats.pump >= 1 && res('grad') >= 99.5 },
      { text: 'Express your first gene: ATP1A3', why: 'Genes are read in the nucleus, translated on the ER, sorted in the Golgi. More Na⁺/K⁺ pumps run <b>by themselves</b>.', hint: 'Make ATP (glucose → mitochondria), then <b>Genome</b> → <i>ATP1A3</i>. Watch the mRNA leave the nucleus.',
        onStart: () => { S.geneTut = true; }, progress: () => [Math.min(lv('ATP1A3') >= 2 ? 90 : Math.floor(res('atp')), 90), 90], check: () => lv('ATP1A3') >= 2 },
      { text: 'Relay 5 spikes on your own', why: 'Run the whole loop: inputs → AIS → bouton → reset — and keep making ATP.', hint: 'Now it is all up to you, and the whole <b>Genome</b> is unlocked. Lit view buttons show where something is waiting.',
        onStart: () => { S.tut = false; S.tutDone = true; mark(); view(phone() ? 'cell' : 'all', true); }, progress: () => [Math.min(5, S.stats.rel - S.mark), 5], check: () => S.stats.rel - S.mark >= 5 },
      { text: 'Put the soma on autopilot', why: 'Express <i>GRIA2</i> (inputs) and <i>SCN8A</i> (firing).', hint: 'Genome → <i>GRIA2</i>, <i>SCN8A</i>. Soma genes arrive within seconds. <i>SLC2A3</i> and <i>PPARGC1A</i> automate your ATP supply.',
        onStart: () => g.after(22, startBarrage), progress: () => [(lv('GRIA2') >= 2) + (lv('SCN8A') >= 2), 2], check: () => lv('GRIA2') >= 2 && lv('SCN8A') >= 2 },
      { text: 'Ship a mitochondrion to the terminal', why: 'The terminal makes its own ATP — but only with mitochondria the soma sends.', hint: 'Genome → <i>RHOT1 · TRAK1</i>. While kinesin-1 carries it (~40 s), order the terminal genes — they must travel too.', onStart: () => { S.termOpen = true; view('axon', true); }, check: () => S.tMito >= 2 },
      { text: 'Automate the terminal', why: 'Express <i>CACNA1A</i>, <i>SLC17A7</i> and <i>DNM1·CLTC</i>. They must travel ~1 cm — clathrin & dynamin by slow transport.', hint: 'Terminal proteins arrive late: plan ahead. <i>KIF5A</i> lets more fast cargo travel at once.',
        onStart: () => { S.ischAt = g.t + 45; }, progress: () => [(lv('CACNA1A') >= 2) + (lv('SLC17A7') >= 2) + (lv('DNM1') >= 2), 3], check: () => lv('CACNA1A') >= 2 && lv('SLC17A7') >= 2 && lv('DNM1') >= 2 },
      { text: 'Relay a high-frequency train (' + TRAIN + ' spikes)', why: 'A burst drains vesicles and ATP. Keep the terminal stocked: mitochondria, recycling, refilling. Clicking <b>endocytosis</b> or <b>refill</b> runs an extra cycle.', hint: 'Short-term depression is real: if the ready pool empties, spikes fail. More terminal mitochondria help.',
        onStart: () => { view('output', true); g.after(2, startBurst); }, progress: () => [S.trainDone ? TRAIN : S.burst ? Math.min(TRAIN, S.burst.n) : 0, TRAIN], check: () => S.trainDone },
      { text: 'Stock the spine with GluA1 receptors', why: 'LTP needs spare AMPA receptors waiting near the synapse.', hint: 'Genome → <i>GRIA1</i>. (<i>CAMK2A</i> makes LTP faster.)', check: () => lv('GRIA1') >= 1 },
      { text: 'Induce LTP: double the synapse', why: 'Pair input with output again and again: NMDA Ca²⁺ → CaMKII → AMPA receptors inserted. CaMKII activity decays again (phosphatases undo Thr286) if the pairings stop.', hint: 'Click the lavender upstream <b>bouton</b> to deliver a theta burst (in brain-slice experiments a stimulating electrode does this). You fire right after its input, so Ca²⁺ enters through NMDA receptors. Keep CaMKII lit.', target: 'pre',
        onStart: () => { S.ltpOn = true; view('input', true); }, progress: () => [Math.max(0, res('ampa') - 4), 4], check: () => res('ampa') >= 8 },
      { text: 'Make it last: late-phase LTP', why: 'Early LTP fades within hours unless new proteins are made. Strong, repeated activity sends a Ca²⁺-triggered signal to the nucleus (CREB); new mRNAs are transcribed, and their proteins are captured by the potentiated, "tagged" synapse.', hint: 'Keep delivering theta bursts. Every spike you fire now feeds the <b>signal to the nucleus</b> (bar in the spine box); it fades if you pause. (Compressed: real consolidation takes an hour or more.)', target: 'pre',
        progress: () => [S.consol ? 100 : Math.floor(S.nucSig), 100], check: () => S.consol, onDone: () => g.after(2.5, finish) },
    ]);
    /* tutorial: each of the first 10 objectives stays on screen >= 7 s, time to read it */
    g.obj.list.slice(0, 10).forEach(o => {
      const ck = o.check, os = o.onStart;
      o.onStart = gg => { S.stepT = g.t; if (os) os(gg); };
      o.check = gg => g.t - S.stepT >= 7 && ck(gg);
    });
    S.stepT = 0;
    g.learn('n_numbers');
  },

  update(_, dt) {
    if (S.inputOn) {
      S.inT -= dt;
      if (S.inT <= 0) { S.inT = nextInterval(); presynArrive(); }
      while (S.inQ.length && g.t - S.inQ[0] > (S.tut ? 6 : 3.5)) { S.inQ.shift(); S.stats.missed++; }
      if (lv('GRIA2') >= 2) while (S.inQ.length && g.t - S.inQ[0] > .15) takeInput(false);
    }
    updVm(dt);
    if (lv('SCN8A') >= 2 && canFire()) fire(false);
    updTheta(dt); updSpikes(dt); updPlasticity(dt); updTerminal(dt); updExpression(dt); updShip(dt); updEvents(dt);
    /* housekeeping: resting Na⁺/K⁺ leak and basal ATP use (protein synthesis, transport, lipid turnover) */
    addGrad(-.08 * dt);
    if (res('atp') > 5) g.res.add('atp', -.25 * dt);
    /* excitotoxicity: astrocytes resume clearing once energy is back */
    if (S.exc && !S.isch && S.exGlu > 0) { S.exAutoT = (S.exAutoT || 0) + dt; if (S.exAutoT > 1) { S.exAutoT = 0; clearExGlu(); } }
    /* objective 8: move the hint marker to whichever clean-up step is still missing */
    if (g.obj.i === 7) { const tgt = S.stats.cleared < 1 ? 'astro' : S.stats.endo < 1 ? 'endo' : 'vglut'; if (g.hintTarget !== tgt) g.hintTarget = tgt; }
    S.marks = S.marks.filter(m => g.t - m.t < 12.5);
    if (g.sel && !g.sel.nav) S.lastSel = g.sel;
    S.rbc += dt * (S.isch ? 1.2 : 7);
    /* ischemia strikes while the terminal cargo is on its way (or 40 s into the objective at the latest) */
    if (S.ischAt) {
      if (ordered('CACNA1A') && ordered('SLC17A7') && ordered('DNM1') && S.ischAt > g.t + 6) S.ischAt = g.t + 6;
      if (g.t >= S.ischAt) { S.ischAt = 0; startIschemia(); }
    }
    if (S.follow && S.spikes.length) followSpike();
  },

  bg(ctx, g, W, H) { const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * .75); gr.addColorStop(0, '#0d1d2e'); gr.addColorStop(1, '#060c16'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); },

  drawBack(c) {
    declutter();
    drawNeuropil(c); drawCapillary(c); drawAstroMain(c); drawInterneuron(c); drawDendrites(c); drawAxon(c); drawSoma(c); drawOligo(c);
    drawInsetIn(c); drawInsetOut(c); drawLabels();
  },
  drawMid(c) { drawCargo(c); },
  drawFront(c) {
    drawSpikes(c);
    if (g.hover && g.hover.nav) { S.navHover = g.hover.nav[0]; g.hover = null; } else if (!g.hover) S.navHover = null;
    c.save(); c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0); drawScope(c); drawNav(c); c.restore();
  },
});

/* hide station labels that would pile up when zoomed out (thresholds in screen px per µm) */
const LABEL_MIN = { glut3: 4, mito: 4, nak: 4, er: 7, golgi: 7, gaba: 6.5, ais: 1.5, node: 1.6, oligo: 1.6, bxReal: 1.6, cap: 1.4, astroMain: 2.5,
  bouton: 4.2, endo: 4.2, vglut: 4.2, tmito: 4.2, astro: 4.2, post: 4.2 };
function declutter() {
  const sc = g.scale;
  for (const s of g.stations) {
    if (s.nav) continue;
    if (s.baseNoLabel == null) s.baseNoLabel = !!s.noLabel;
    const [sx, sy] = g.w2s(s.x, s.y), rr = Math.max(s.r * sc, 14);
    s.underUI = underUI(sx, sy, rr * .6, rr * .6);
    s.noLabel = s.baseNoLabel || (LABEL_MIN[s.id] && sc < LABEL_MIN[s.id]) || underUI(sx, sy + rr + (s.labelDy || 11), (s.short || s.name).length * 3.2, 7);
  }
}
function nodeInfo() {
  return { title: 'Node of Ranvier', sub: '~1 µm gap between myelin sheaths', body: 'Myelin insulates the axon, so the spike does not have to regenerate along every micrometre. Instead, current flows inside the axon to the next <b>node</b>, a short bare stretch packed with Nav1.6 channels (again anchored by ankyrin-G), where the spike is regenerated: <b>saltatory conduction</b>.',
    facts: ['Flanking each node: paranodes, where myelin loops are glued to the axon (Caspr/contactin with neurofascin-155), and juxtaparanodes with Kv1 channels.', 'CNS internodes are roughly 20–200 µm long; here the first ones are drawn 57–69 µm.', 'Myelination raises conduction speed several-fold to ~10-fold or more for the same diameter, and saves energy because fewer ions cross the membrane.'],
    game: 'The spike visibly pauses at each node; really it crosses an internode in ~10–20 µs.' };
}
function clearExGlu() {
  if (S.exGlu <= 0) return;
  S.exGlu--; S.excCleared++;
  const a = st.astroIn, t = g.token({ x: -74 + U.rand(-4, 4), y: spineTop() - .3, draw: dotDraw(C.glu, .35) }); t.to(a.x + 2, a.y, .4).fade(.2).die();
}

/* =========================================================================================== drawing */
function drawNeuropil(c) {
  c.fillStyle = '#9fb7d6';
  for (const p of S.neuropil) { c.globalAlpha = p.a; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
  c.globalAlpha = .06; c.strokeStyle = '#9fb7d6'; c.lineWidth = .35;
  for (const f of S.fibres) { c.beginPath(); c.moveTo(f[0], f[1]); c.quadraticCurveTo((f[0] + f[2]) / 2 + f[4], (f[1] + f[3]) / 2 - f[4], f[2], f[3]); c.stroke(); }
  c.globalAlpha = 1;
}
function drawCapillary(c) {
  const x = -48;
  c.fillStyle = S.isch ? '#3a1f2a' : '#4a1f2c'; c.fillRect(x - 3.4, -26, 6.8, 98);
  c.strokeStyle = '#c0697a'; c.lineWidth = .7; c.beginPath(); c.moveTo(x - 3.4, -26); c.lineTo(x - 3.4, 72); c.moveTo(x + 3.4, -26); c.lineTo(x + 3.4, 72); c.stroke();
  for (let i = 0; i < 9; i++) {
    const y = -26 + ((i * 12 + S.rbc) % 98);
    D.ellipse(c, x, y, 2.6, 1.3, .15, S.isch ? '#8a3a46' : '#e0485a', 'rgba(0,0,0,.35)', g.px); D.ellipse(c, x, y, 1.2, .5, .15, 'rgba(0,0,0,.18)');
  }
  for (let i = 0; i < 7; i++) { const y = -20 + ((i * 14 + S.rbc * .6) % 90); D.glucose(c, x + 5 + (i % 3) * 2.2, y, .5, i + g.t * .3); }
}
function drawAstroMain(c) {
  const ax = -34, ay = 54; c.save(); c.globalAlpha = .45; c.strokeStyle = C.astro; c.lineCap = 'round';
  const arms = [[-11, -4, .8], [-6, -14, .7], [5, -13, .6], [12, -3, .6], [9, 10, .6], [-4, 12, .6], [-13, 8, .6], [2, -20, .4]];
  for (const a of arms) { c.lineWidth = a[2]; c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(ax + a[0] * .5 + 2, ay + a[1] * .5 - 1, ax + a[0], ay + a[1]); c.stroke(); }
  c.lineWidth = 1.3; c.beginPath(); c.moveTo(ax - 11, ay - 4); c.lineTo(-44.6, ay - 6); c.stroke();          // endfoot onto the capillary
  D.circle(c, -45, ay - 6, 1.4, C.astro); D.circle(c, ax, ay, 2.6, C.astro, '#ffd1e8', g.px);
  c.restore();
}
function drawInterneuron(c) {
  c.save(); c.strokeStyle = C.gaba; c.globalAlpha = .55; c.lineWidth = .35;
  c.beginPath(); c.moveTo(-40, 72); c.bezierCurveTo(-30, 40, -18, 26, -9, 13); c.lineTo(-5.6, 11); c.stroke();
  c.beginPath(); c.moveTo(-18, 26); c.quadraticCurveTo(-14, 16, -11.5, 9.5); c.stroke();
  D.circle(c, -11.5, 9.6, .7, '#203a5c', C.gaba, 2 * g.px); D.circle(c, -14.5, 20, .55, '#203a5c', C.gaba, 2 * g.px);
  c.restore();
}
/* how "zoomed out" we are: 1 at ≤ 1.2 px/µm (phone overview), 0 at ≥ 5 px/µm. Used to give the thin neuron a fluorescent glow. */
function lowZoom() { return U.clamp((5 - g.scale) / 3.8, 0, 1); }
function haloStroke(c, pathFn, w, lo) {
  c.save(); c.strokeStyle = C.mem; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [k, a] of [[12, .07], [6, .12], [2.8, .3]]) { c.globalAlpha = a * lo; c.lineWidth = w + k * g.px; pathFn(); c.stroke(); }
  c.restore();
}
function drawDendrites(c) {
  c.lineCap = 'round'; c.lineJoin = 'round';
  const lo = lowZoom();
  if (lo > 0) for (const d of DEND) for (let i = 1; i < d.p.length; i++) haloStroke(c, () => { c.beginPath(); c.moveTo(d.p[i - 1][0], d.p[i - 1][1]); c.lineTo(d.p[i][0], d.p[i][1]); }, (d.w[i - 1] + d.w[i]) / 2, lo);
  const inner = lo > .55 ? '#28588a' : lo > .2 ? '#1e4468' : C.cyt;
  for (const pass of [0, 1]) for (const d of DEND) {
    for (let i = 1; i < d.p.length; i++) {
      const w = (d.w[i - 1] + d.w[i]) / 2;
      c.strokeStyle = pass ? inner : C.mem; c.lineWidth = pass ? w : Math.max(w + .45, w + 1.6 * g.px);
      c.beginPath(); c.moveTo(d.p[i - 1][0], d.p[i - 1][1]); c.lineTo(d.p[i][0], d.p[i][1]); c.stroke();
    }
  }
  /* spines: neck + head, all in two batched paths */
  c.strokeStyle = C.mem; c.lineWidth = .18; c.beginPath();
  for (const s of S.spines) { c.moveTo(s.x0, s.y0); c.lineTo(s.x1, s.y1); }
  c.stroke();
  c.fillStyle = C.mem; c.beginPath();
  for (const s of S.spines) { c.moveTo(s.x1 + s.r, s.y1); c.arc(s.x1, s.y1, s.r, 0, TAU); }
  c.fill();
  /* the special input spine + upstream axon contacting it */
  const hr = .35 + .03 * (res('ampa') - 4);
  c.strokeStyle = C.mem; c.lineWidth = .2; c.beginPath(); c.moveTo(-20, -46.9); c.lineTo(SPR.x, SPR.y); c.stroke();
  D.circle(c, SPR.x, SPR.y, hr, '#ffd166', C.mem, .08);
  c.strokeStyle = C.other; c.lineWidth = .25; c.beginPath(); c.moveTo(-30, -66); c.quadraticCurveTo(-22, -56, SPR.x - .2, SPR.y - .75); c.stroke();
  D.circle(c, SPR.x - .15, SPR.y - .7, .38, '#2a2440', C.other, .08);
  const pulse = (g.t * 1.4) % 1; D.circle(c, SPR.x, SPR.y, 1 + pulse * 2.5, null, `rgba(255,209,102,${.7 * (1 - pulse)})`, 1.6 * g.px);
  /* callout lines to the inset */
  c.save(); c.setLineDash([1.2, 1.2]); c.strokeStyle = 'rgba(94,234,212,.45)'; c.lineWidth = 1.2 * g.px;
  c.beginPath(); c.moveTo(SPR.x - .4, SPR.y - .4); c.lineTo(II.x0 + II.w, II.y0); c.moveTo(SPR.x - .4, SPR.y + .4); c.lineTo(II.x0 + II.w, II.y0 + II.h); c.stroke(); c.restore();
  /* back-propagating AP glow into the dendrite */
  if (S.bapT != null) { const q = pathAt(SPINE_PATH.slice().reverse(), S.bapT / .7); D.glow(c, q.x, q.y, 4, C.na, .55 * (1 - S.bapT / .7) + .2); }
}
function drawSoma(c) {
  const lo = lowZoom();
  if (lo > 0) { D.glow(c, 0, -1, 30, C.mem, .22 * lo); haloStroke(c, () => somaPath(c), .45, lo); }
  const gr = c.createRadialGradient(-3, -4, 1, 0, 0, 18); gr.addColorStop(0, '#24507a'); gr.addColorStop(1, C.cyt);
  somaPath(c); c.fillStyle = gr; c.fill(); c.strokeStyle = C.mem; c.lineWidth = .45; c.stroke();
  /* Nissl bodies (rough ER stacks) */
  c.strokeStyle = 'rgba(79,214,180,.8)'; c.lineWidth = .32;
  for (const n of [[-6, -5, -.4], [6, -5.5, .5], [-8.3, 4.5, 1.2], [5.8, 7.4, -.2], [-3, 7.6, .1]]) {
    for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(n[0] + Math.cos(n[2]) * k * .6, n[1] + Math.sin(n[2]) * k * .6 + 3, 3 + k * .2, -Math.PI / 2 - .5 + n[2], -Math.PI / 2 + .5 + n[2]); c.stroke(); }
  }
  c.fillStyle = '#d9c7a3'; for (let i = 0; i < 26; i++) { const a = i * 2.39, r = 6.2 + (i % 5) * .9; D.circle(c, Math.cos(a) * r * .95, 1 + Math.sin(a) * r * .9, .13, '#d9c7a3'); }
  /* Golgi stacks at the base of the apical dendrite */
  c.strokeStyle = C.golgi; c.lineWidth = .38;
  for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, -6.3 + k * .62, 4.1 - k * .35, -Math.PI / 2 - .55, -Math.PI / 2 + .55); c.stroke(); }
  /* mitochondria (to scale: ~0.5 × 1–2 µm) */
  mitoC(c, -7.6, 6, 1.8, .5, .6); mitoC(c, -4.5, -10, 1.5, .45, -.3); mitoC(c, 4.6, -10.2, 1.4, .45, .5); mitoC(c, -9, -.5, 1.6, .5, 1.3); mitoC(c, 3, 8, 1.6, .5, .1);
  for (const m of [[0, -24, 1.6], [-6, 22, 1.3], [-1, -50, 1.2]]) mitoC(c, m[0], m[1], m[2], .4, Math.PI / 2);
}
function drawNucleus(c, s) {
  const gr = c.createRadialGradient(s.x - 1.5, s.y - 1.5, .5, s.x, s.y, s.r); gr.addColorStop(0, '#4b3f8f'); gr.addColorStop(1, '#2d2560');
  D.circle(c, s.x, s.y, s.r, gr); D.bilayer(c, cc => cc.arc(s.x, s.y, s.r, 0, TAU), .35, '#b3a6f5');
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + .2; D.circle(c, s.x + Math.cos(a) * s.r, s.y + Math.sin(a) * s.r, .16, '#efeaff'); }
  D.circle(c, s.x + 1.2, s.y - 1, 1.3, 'rgba(126,104,220,.95)');                // nucleolus
  c.strokeStyle = 'rgba(229,140,192,.6)'; c.lineWidth = .22;
  for (let i = 0; i < 10; i++) { const a = i * 2.4 + 1, d = s.r * (.25 + .5 * ((i * 37 % 10) / 10)); c.beginPath(); c.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, .7, a, a + 2.4); c.stroke(); }
  if (S.tx) {
    const p = S.tx.t / S.tx.dur, x1 = s.x - 3, x2 = s.x + 1.5, y = s.y + 2.2, px = U.lerp(x1, x2, p);
    c.strokeStyle = '#ffffffaa'; c.lineWidth = .12; c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
    c.strokeStyle = '#f0a8ff'; c.lineWidth = 2 * g.px; c.beginPath(); for (let i = 0; i <= 8; i++) { const q = i / 8, xx = px - q * p * 2.5, yy = y - .3 - q * p * 1.6 + Math.sin(q * 9 + g.t * 6) * .1; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
    D.ellipse(c, px, y, .45, .35, 0, '#ffb86b', '#7a4a00', g.px);
    if (g.scale > 6) lbl(S.tx.it.gene, s.x, y + 1.1, { size: 10, color: '#f0a8ff', italic: true });
  }
  if (g.scale > 5) lbl('Nucleus', s.x, s.y - s.r - .8, { color: '#d5cffb' });
}
function drawAxon(c) {
  c.lineCap = 'round';
  /* axon hillock: a cone tapering from the soma into the axon (drawn under the soma) */
  c.beginPath(); c.moveTo(1, 7.5); c.lineTo(10, 6.5); c.quadraticCurveTo(8.4, 11.5, 7.6, 14.2); c.lineTo(6, 14.2); c.quadraticCurveTo(4.5, 11, 1, 7.5); c.closePath();
  c.fillStyle = C.cyt; c.fill(); c.strokeStyle = C.mem; c.lineWidth = .45; c.stroke();
  /* bare axon (under the myelin) */
  const lo = lowZoom();
  if (lo > 0) { haloStroke(c, () => { poly(c, HILL); c.lineTo(BRK.x1, AY); }, 1.9, lo); haloStroke(c, () => { c.beginPath(); c.moveTo(BRK.x2, AY); c.lineTo(BX.x, AY); }, 1.4, lo); D.glow(c, BX.x, BX.y, 5, C.mem, .4 * lo); }
  c.strokeStyle = C.mem; c.lineWidth = 1.25; poly(c, HILL); c.lineTo(BRK.x1, AY); c.stroke();
  c.strokeStyle = C.cyt; c.lineWidth = .85; poly(c, HILL); c.lineTo(BRK.x1, AY); c.stroke();
  c.strokeStyle = C.mem; c.lineWidth = 1.25; c.beginPath(); c.moveTo(BRK.x2, AY); c.lineTo(NODES[2] + .5, AY); c.stroke();
  c.strokeStyle = C.cyt; c.lineWidth = .85; c.stroke();
  c.strokeStyle = C.mem; c.lineWidth = .62; c.beginPath(); c.moveTo(NODES[2], AY); c.lineTo(BX.x - .4, AY); c.stroke();      // thin unmyelinated pre-terminal
  c.strokeStyle = C.cyt; c.lineWidth = .3; c.stroke();
  D.circle(c, BX.x, BX.y, BX.r, C.cyt, C.mem, .16);
  /* microtubules */
  c.strokeStyle = 'rgba(155,231,255,.35)'; c.lineWidth = .07;
  for (const dy of [-.18, .18]) { c.beginPath(); c.moveTo(16, AY + dy); c.lineTo(BRK.x1, AY + dy); c.moveTo(BRK.x2, AY + dy); c.lineTo(BX.x - .5, AY + dy * .5); c.stroke(); }
  /* AIS: dense Nav1.6 */
  const ap = S.ap ? Math.max(0, 1 - S.ap.t / .4) : 0;
  for (let x = AIS.x1 + .3; x < AIS.x2; x += .55) for (const sg of [-1, 1]) D.circle(c, x, AY + sg * .55, .14, ap > 0 ? '#ffd0dc' : C.nav);
  if (ap > 0) { c.fillStyle = `rgba(255,107,139,${.35 * ap})`; c.fillRect(AIS.x1, AY - 1.3, AIS.x2 - AIS.x1, 2.6); }
  /* myelin internodes */
  for (const m of INTER) {
    c.fillStyle = 'rgba(239,230,210,.88)'; c.beginPath(); c.roundRect(m[0], AY - .95, m[1] - m[0], 1.9, .9); c.fill();
    c.strokeStyle = 'rgba(180,170,150,.55)'; c.lineWidth = .06;
    for (const dy of [-.6, -.3, .3, .6]) { c.beginPath(); c.moveTo(m[0] + .8, AY + dy); c.lineTo(m[1] - .8, AY + dy); c.stroke(); }
  }
  for (const nx of NODES) { D.circle(c, nx, AY - .5, .16, C.nav); D.circle(c, nx, AY + .5, .16, C.nav); }
  /* axon break */
  c.strokeStyle = '#cfe0f5'; c.lineWidth = .3;
  for (const bx of [BRK.x1 + 1, BRK.x2 - 1]) { c.beginPath(); c.moveTo(bx - .9, AY + 2.6); c.lineTo(bx + .9, AY - 2.6); c.stroke(); }
  c.save(); c.setLineDash([.4, .6]); c.strokeStyle = 'rgba(207,224,245,.4)'; c.lineWidth = .2; c.beginPath(); c.moveTo(BRK.x1 + 1, AY); c.lineTo(BRK.x2 - 1, AY); c.stroke(); c.restore();
  /* docked terminal mitochondria along the pre-terminal axon (the first one sits inside the bouton) */
  for (let i = 1; i < S.tMito; i++) mitoC(c, mitoSlot(i) - .2, AY, 1.3, .38, 0, !S.isch);
  /* callout from the true-size bouton to the inset */
  c.save(); c.setLineDash([1.2, 1.2]); c.strokeStyle = 'rgba(94,234,212,.45)'; c.lineWidth = 1.2 * g.px;
  c.beginPath(); c.moveTo(BX.x + .4, BX.y - .4); c.lineTo(IO.x0, IO.y0); c.moveTo(BX.x + .4, BX.y + .4); c.lineTo(IO.x0, IO.y0 + IO.h); c.stroke(); c.restore();
}
function drawOligo(c) {
  const o = st.oligo; c.save(); c.globalAlpha = .75; c.strokeStyle = C.oligo; c.lineWidth = .5;
  for (const tx of [84, 148]) { c.beginPath(); c.moveTo(o.x, o.y); c.quadraticCurveTo((o.x + tx) / 2, o.y - 6, tx, AY + .95); c.stroke(); }
  c.beginPath(); c.moveTo(o.x, o.y); c.quadraticCurveTo(o.x + 10, o.y + 6, o.x + 22, o.y + 16); c.stroke();
  c.beginPath(); c.moveTo(o.x, o.y); c.quadraticCurveTo(o.x - 8, o.y + 8, o.x - 20, o.y + 18); c.stroke();
  D.circle(c, o.x, o.y, 3, '#2c2450', C.oligo, .35); D.circle(c, o.x, o.y, 1.6, '#5a4c9a');
  c.restore();
}

/* ---------- inset frames ---------- */
function insetFrame(c, I, title, inner) {
  c.save();
  c.fillStyle = 'rgba(4,10,19,.94)'; c.strokeStyle = 'rgba(94,234,212,.7)'; c.lineWidth = 1.6 * g.px;
  c.beginPath(); c.roundRect(I.x0, I.y0, I.w, I.h, 1.5); c.fill(); c.stroke();
  c.beginPath(); c.roundRect(I.x0, I.y0, I.w, I.h, 1.5); c.clip();
  inner();
  c.restore();
  insetTitle(I, title);
  const sx = I.x0 + 3, sy = I.y0 + I.h - 3, L = .2 * MAG;   // 200 nm inside the inset
  c.strokeStyle = '#ffffffcc'; c.lineWidth = 2 * g.px; c.beginPath(); c.moveTo(sx, sy - 1); c.lineTo(sx, sy); c.lineTo(sx + L, sy); c.lineTo(sx + L, sy - 1); c.stroke();
  lbl('200 nm (inset)', sx + L + 1, sy - .4, { align: 'left', size: 10, color: '#ffffffcc' });
}
/* inset caption: above the frame, but pushed inside it (and kept on screen) when the frame's top is hidden under the scope / top edge */
function insetTitle(I, title) {
  const [x0, y0] = g.w2s(I.x0, I.y0), [x1, y1] = g.w2s(I.x0 + I.w, I.y0 + I.h), M = margins();
  if (x1 < 0 || x0 > g.W || y1 < M.t + 20 || y0 > g.H) return;
  if (x1 - x0 < 110) return;                       // too small to caption (zoomed-out map)
  const tw = title.length * 6.6, sy = Math.min(Math.max(y0 - 8, M.t + 6), y1 - 20), sx = Math.max(8, Math.min(x0 + 4, g.W - 8 - tw));
  const w = g.s2w(sx, sy); g.label(title, w[0], w[1], { align: 'left', size: 11.5, color: '#5eead4', bold: true });
}
function drawInsetIn(c) {
  insetFrame(c, II, phone() ? 'Input synapse (spine) · ×25' : 'Input synapse on a dendritic spine · ×25', () => {
    const top = spineTop(), r = spineR(), cy = top + r, x = -72;
    /* dendritic shaft (bottom) */
    c.fillStyle = C.cyt; c.fillRect(II.x0, -33, II.w, 6); c.strokeStyle = C.mem; c.lineWidth = .45; c.beginPath(); c.moveTo(II.x0, -33); c.lineTo(II.x0 + II.w, -33); c.stroke();
    /* astrocyte process with EAAT2 */
    D.ellipse(c, -93, -71, 14, 5.5, .32, 'rgba(245,158,200,.42)', C.astro, .3);
    for (let i = 0; i < 5; i++) D.circle(c, -86.5 + i * 1.1, -68.6 + i * .25, .3, '#ffd1e8');
    D.ellipse(c, -51, -71, 10, 4.5, -.3, 'rgba(245,158,200,.3)', C.astro, .25);
    /* upstream (presynaptic) bouton */
    c.strokeStyle = C.other; c.lineWidth = 5; c.beginPath(); c.moveTo(-80, II.y0 - 2); c.quadraticCurveTo(-77, -88, PRE.x - 3, PRE.y - 6); c.stroke();
    D.circle(c, PRE.x, PRE.y, PRE.r, '#2a2440', C.other, .45);
    for (const p of S.prePool) D.vesicle(c, p[0], p[1], .5, 'rgba(201,182,255,.8)', C.glu);
    for (let i = 0; i < 3; i++) D.vesicle(c, x - 2 + i * 2, PRE.y + PRE.r - .6, .5, C.other, C.glu);
    /* glutamate in the cleft */
    const n = S.inQ.length * 5 + S.exGlu * 4;
    for (let i = 0; i < n; i++) D.circle(c, x + Math.sin(i * 7.3 + g.t * 2) * (5 + (i > S.inQ.length * 5 ? 6 : 0)), top - .25 + Math.sin(i * 3.1 + g.t * 3) * .2, .28, C.glu);
    /* spine neck + head */
    c.fillStyle = C.cyt; c.strokeStyle = C.mem; c.lineWidth = .45;
    c.fillRect(x - 1.8, cy, 3.6, -33 - cy + .3); c.beginPath(); c.moveTo(x - 1.8, cy + r * .8); c.lineTo(x - 1.8, -33); c.moveTo(x + 1.8, cy + r * .8); c.lineTo(x + 1.8, -33); c.stroke();
    D.circle(c, x, cy, r, C.cyt, C.mem, .45);
    if (S.spCa > 3) D.glow(c, x, cy, r * .95, C.ca, Math.min(.6, S.spCa / 90));
    if (S.caLoad > 3) D.glow(c, x, cy, r, '#ff5050', Math.min(.7, S.caLoad / 110));
    /* PSD band */
    c.strokeStyle = '#3d6894'; c.lineWidth = .9; c.beginPath(); c.arc(x, cy, r - .5, -Math.PI / 2 - .55, -Math.PI / 2 + .55); c.stroke();
    /* receptors: AMPA (amber) around 2 NMDA (blue, with Mg²⁺ plug) */
    const na = Math.round(res('ampa')), tot = na + 2, span = 1.05, open = g.t - S.lastIn < .5, mgOff = g.t - S.mgOut < 1.2;
    for (let i = 0; i < tot; i++) {
      const a = -Math.PI / 2 - span + (i + .5) / tot * span * 2, rx = x + Math.cos(a) * r, ry = cy + Math.sin(a) * r;
      const mid = Math.floor(tot / 2), isN = i === mid - 1 || i === mid;
      glyphRcp(c, rx, ry, a, 1.6, isN ? '#7aa7ff' : '#ffb347', isN ? mgOff : open);
      if (isN && !mgOff) D.circle(c, rx + Math.cos(a) * .25, ry + Math.sin(a) * .25, .3, C.mg);
    }
    /* CaMKII dodecamer: two stacked hexameric rings (top view) */
    const kx = st.camk.x, ky = st.camk.y, act = Math.floor(S.camk);
    D.circle(c, kx, ky, .7, '#5a4c2a');
    for (let i = 0; i < 12; i++) {
      const ring = i < 6 ? 0 : 1, a = (i % 6) / 6 * TAU + ring * TAU / 12 + g.t * .2, rr = ring ? 1.55 : 1.75, on = i < act;
      D.circle(c, kx + Math.cos(a) * rr, ky + Math.sin(a) * rr, .42, on ? C.camk : '#6b5e8f', 'rgba(0,0,0,.4)', g.px);
      if (on) D.circle(c, kx + Math.cos(a) * (rr + .45), ky + Math.sin(a) * (rr + .45), .14, '#fff3a0');
    }
    /* late LTP: Ca²⁺-driven signal to the nucleus */
    if (S.ltpOn && res('ampa') >= 8 && !S.consol) {
      const bx = -99, by = -49, bw = 16, f = S.nucTx ? 1 : S.nucSig / 100;
      c.fillStyle = 'rgba(240,168,255,.15)'; c.beginPath(); c.roundRect(bx, by, bw, 1.4, .7); c.fill();
      c.fillStyle = '#f0a8ff'; c.beginPath(); c.roundRect(bx, by, Math.max(.2, bw * f), 1.4, .7); c.fill();
    }
    /* recycling endosome with reserve receptors */
    const ex = -68.6, ey = cy + r * .55;
    D.circle(c, ex, ey, 2, 'rgba(255,209,102,.12)', '#ffd166', .2);
    for (let i = 0; i < Math.min(8, S.reserve); i++) { const a = i / Math.max(1, Math.min(8, S.reserve)) * TAU; D.circle(c, ex + Math.cos(a) * 1.3, ey + Math.sin(a) * 1.3, .32, '#ffd166'); }
    if (g.scale > 4.2) {
      lbl('PSD: AMPA · NMDA', x + r + 1, top + 2.5, { size: 10, color: '#ffcf8a', align: 'left' });
      lbl('CaMKII', kx - 2.5, ky + .4, { size: 10, color: C.camk, align: 'right' });
      lbl('reserve AMPARs', ex + 2.6, ey + .4, { size: 10, color: '#ffd166', align: 'left' });
      lbl('astrocyte (EAAT2)', -96, -75.5, { size: 10, color: '#ffc6e2' });
      if (!phone()) lbl('(another neuron)', PRE.x + 12, PRE.y - 7 + 13 / g.scale, { size: 9.5, color: C.other, align: 'left' });
      lbl('presynaptic bouton', PRE.x + 12, PRE.y - (phone() ? 2 : 7), { size: 10, color: C.other, align: 'left' });
      lbl('dendrite', II.x0 + II.w - 2, -29.5, { size: 10, color: C.mem, align: 'right' });
      lbl('spine', x + 3, cy + r + 4, { size: 10, color: C.mem, align: 'left' });
      if (S.ltpOn && res('ampa') >= 8 && !S.consol) lbl('signal → nucleus (CREB)', -99, -50.2, { size: 10.5, color: '#f0a8ff', align: 'left', bold: true });
      if (S.exc) lbl('Ca²⁺ load ' + Math.round(S.caLoad) + ' %', x, cy + 2, { size: 11, color: '#ff8f8f', bold: true });
    }
  });
}
function drawInsetOut(c) {
  insetFrame(c, IO, phone() ? 'Output synapse · ×25' : 'Output synapse: your bouton → next neuron · ×25', () => {
    /* pre-terminal axon entering from the left */
    c.fillStyle = C.cyt; c.fillRect(IO.x0 - 1, BTN.y - 3, BTN.x - IO.x0, 6); c.strokeStyle = C.mem; c.lineWidth = .45;
    c.beginPath(); c.moveTo(IO.x0, BTN.y - 3); c.lineTo(BTN.x - 8, BTN.y - 3); c.moveTo(IO.x0, BTN.y + 3); c.lineTo(BTN.x - 8, BTN.y + 3); c.stroke();
    D.circle(c, BTN.x, BTN.y, BTN.r, C.cyt, C.mem, .45);
    if (S.apWait.length) D.glow(c, BTN.x, BTN.y, BTN.r, C.na, .3);
    /* mitochondrion inside the bouton */
    mitoC(c, BTN.x - 3, BTN.y + 7, 7, 3.4, .1, !S.isch);
    /* reserve pool */
    for (const p of S.pool) D.vesicle(c, p[0], p[1], .5, 'rgba(242,213,138,.75)', C.glu);
    /* empty vesicles waiting for VGLUT1 */
    for (let i = 0; i < Math.min(6, S.empty); i++) D.vesicle(c, 244 + i * 1.3, 11 + (i % 2) * 1.1, .5, '#9fb7d6');
    /* clathrin-coated pits (spent membrane) at the periactive zone */
    for (let i = 0; i < Math.min(3, S.spent); i++) {
      const a = -Math.PI / 2 + .35 + i * .28, px = BTN.x + Math.cos(a) * BTN.r, py = BTN.y + Math.sin(a) * BTN.r;
      D.circle(c, px - Math.cos(a) * .6, py - Math.sin(a) * .6, .65, null, '#c4b5fd', .22);
    }
    if (st.endo.jobs.length) { const a = -Math.PI / 2 + .35, px = BTN.x + Math.cos(a) * (BTN.r - 1.4), py = BTN.y + Math.sin(a) * (BTN.r - 1.4); D.circle(c, px, py, .55, 'rgba(196,181,253,.25)', '#c4b5fd', .2); c.strokeStyle = '#ff9d5c'; c.lineWidth = .2; c.beginPath(); c.moveTo(px - .4, py - .7); c.lineTo(px + .4, py - .9); c.stroke(); }
    /* active zone: dense projection, Cav2.1, docked RRP */
    c.fillStyle = 'rgba(160,190,230,.25)'; c.fillRect(BTN.x + BTN.r - 1.2, BTN.y - 4.2, .9, 8.4);
    const rrp = Math.floor(res('rrp'));
    for (let i = 0; i < 6; i++) {
      const vy = BTN.y + (i - 2.5) * 1.25;
      if (i < rrp) D.vesicle(c, BTN.x + BTN.r - .55, vy, .5, '#f2d58a', C.glu);
      glyphRcp(c, BTN.x + BTN.r - .05, vy + .62, 0, .9, C.ca, S.apWait.length > 0);
    }
    /* cleft glutamate */
    for (let i = 0; i < S.cleft * 4; i++) D.circle(c, BTN.x + BTN.r + .25 + Math.sin(i * 5.1 + g.t * 3) * .15, BTN.y + Math.sin(i * 2.3 + g.t * 1.3) * (4 + S.cleft * .5), .25, C.glu);
    /* astrocyte processes */
    D.ellipse(c, st.astro.x, st.astro.y, 7, 4.2, .1, 'rgba(245,158,200,.42)', C.astro, .3);
    D.ellipse(c, 267, 36.5, 6.5, 4, -.1, 'rgba(245,158,200,.32)', C.astro, .25);
    /* downstream spine */
    c.fillStyle = '#1e2a4a'; c.fillRect(POST.x + 7, POST.y - 1.8, 30, 3.6);
    D.circle(c, POST.x, POST.y, POST.r, '#1e2a4a', C.other, .45);
    c.fillStyle = '#1e2a4a'; c.fillRect(291, IO.y0, 8, IO.h); c.strokeStyle = C.other; c.beginPath(); c.moveTo(291, IO.y0); c.lineTo(291, IO.y0 + IO.h); c.stroke();
    c.strokeStyle = '#3d6894'; c.lineWidth = .9; c.beginPath(); c.arc(POST.x, POST.y, POST.r - .5, Math.PI - .5, Math.PI + .5); c.stroke();
    const fl = g.t - S.postFlash < .5;
    for (let i = 0; i < 6; i++) { const a = Math.PI - .45 + i * .18; glyphRcp(c, POST.x + Math.cos(a) * POST.r, POST.y + Math.sin(a) * POST.r, a, 1.4, '#ffb347', fl); }
    if (fl) D.glow(c, POST.x, POST.y, POST.r, C.na, .4);
    if (g.scale > 4.2) {
      lbl('your bouton · ' + Math.floor(res('rrp')) + '/' + g.res.cap('rrp') + ' vesicles ready', BTN.x + 3, BTN.y - BTN.r - 1.2, { size: 10.5, color: '#cfe6ff', bold: true, align: 'right' });
      lbl('cleft 20 nm', BTN.x + BTN.r + .3, BTN.y + 10.5, { size: 10, color: C.glu });
      lbl('astrocyte', 267, 41.8, { size: 10, color: '#ffc6e2' });
    }
  });
}
function drawLabels() {
  if (!g.showLabels) return;
  const sc = g.scale, P = phone(), L = (t, x, y, o) => lbl(t, x, y, o);
  L('Soma ~25 µm', 0, -20.5, { color: '#cfe8ff', size: 11, bold: true, alpha: sc < 5 ? 1 : .6 });
  if (sc > 1.5) {
    if (P) { L('apical dendrite ↑', 2, -98.5, { align: 'left', size: 10, color: '#9fc3e6' }); L('(continues ~0.3 mm toward the brain surface)', 2, -98.5 + 14 / sc, { align: 'left', size: 9.5, color: '#9fc3e6aa' }); }
    else L('apical dendrite → continues ~0.3 mm toward the brain surface', 2, -98.5, { align: 'left', size: 10, color: '#9fc3e6' });
    if (sc > 2.5) L('basal dendrites (drawn shortened)', -14, 70, { align: 'center', size: 10, color: '#9fc3e6' });
  }
  L('myelin', 84, AY - 2.4, { size: 10, color: '#efe6d2', alpha: sc > 2.6 ? 1 : .75 });
  L('≈ 1 cm of axon not shown', (BRK.x1 + BRK.x2) / 2, AY - 2.6 - (sc > 2.6 ? 20 : 9) / sc, { size: 10.5, color: '#ffffffd8', bold: true });
  if (sc > 2.6) L('(>100 more internodes)', (BRK.x1 + BRK.x2) / 2, AY - 2.6 - 7 / sc, { size: 9.5, color: '#cfe0f5b0' });
  const hid = S.ship.filter(s => s.active && s.p >= .16 && s.p < .86);
  hid.forEach((s, i) => L('⇢ ' + (s.kind === 'mito' ? 'mitochondrion' : s.it.gene.split(' ')[0]) + ' ' + Math.round(s.p * 100) + ' %' + (s.kind === 'slow' ? ' (slow)' : ''), (BRK.x1 + BRK.x2) / 2, AY + 2.6 + (12 + 13 * i) / sc, { size: 10, color: s.kind === 'mito' ? '#ff9d5c' : (s.it.col || '#fff') }));
  const wait = S.ship.filter(s => !s.active).length;
  if (wait) L(wait + ' cargo waiting for a kinesin', 12, 25, { size: 10, color: '#9be7ff', align: 'left' });
  if (sc > 2.6) L('microtubules: kinesin → terminal · dynein → soma', 150, AY + 3.4, { size: 10, color: '#9be7ff', alpha: .9 });
  if (sc > 2.5) L('basket-cell axon (GABA)', -30, 66, { size: 10, color: C.gaba, alpha: .9 });
  if (S.isch) L('⚠ low O₂ / glucose', -43.4, 4 + 15 / sc, { size: 11, color: '#ff8f8f', bold: true, align: 'left' });
  if (sc > 3.2) L('input spine (real size)', SPR.x + 1.5, SPR.y - 1.5, { size: 10, color: '#ffd166', align: 'left' });
}

/* ---------- AP propagation, transport and the oscilloscope ---------- */
function drawSpikes(c) {
  for (const sp of S.spikes) {
    const t = sp.t;
    if (t < EV[0].t) { const x = U.lerp(AIS.x1, AIS.x2 + 1, t / EV[0].t); D.glow(c, x, AY, 4.5, C.na, .85); D.circle(c, x, AY, .5, '#ffe4ec'); continue; }
    let i = 0; while (i + 1 < EV.length && t >= EV[i + 1].t) i++;
    const e = EV[i], n = EV[i + 1];
    if (e.hide) continue;
    if (e.x >= 206) { const q = (t - e.t) / (n.t - e.t); const x = U.lerp(e.x, n.x, q); D.glow(c, x, AY, 3, C.na, .8); continue; }
    const q = (t - e.t) / (n.t - e.t), fade = 1 - q;
    D.glow(c, e.x, AY, 4 + 2 * fade, C.na, .3 + .6 * fade); D.circle(c, e.x, AY, .5, '#ffe4ec');
    /* local current flowing inside the myelinated stretch to the next node */
    c.save(); c.setLineDash([.6, .6]); c.lineDashOffset = -g.t * 6; c.strokeStyle = `rgba(255,140,170,${.7 * fade + .2})`; c.lineWidth = .25;
    c.beginPath(); c.moveTo(e.x, AY); c.lineTo(U.lerp(e.x, n.hide ? BRK.x1 : n.x, Math.min(1, q * 1.6)), AY); c.stroke(); c.restore();
  }
}
function drawCargo(c) {
  for (const s of S.ship) {
    if (!s.active) continue;
    const p = shipPos(s); if (!p) continue;
    const cargo = s.kind === 'mito' ? (cc, x, y) => mitoC(cc, x, y - .2, 1.6, .5, 0, true)
      : s.kind === 'slow' ? (cc, x, y) => D.protein(cc, x, y, .45, s.it.col, 3)
      : (cc, x, y) => D.vesicle(cc, x, y, .5, '#f2d58a', s.it.col);
    kinesin(c, p.x, p.y + .1, s.ph, cargo);
  }
}
function drawScope(c) {
  const B = scopeBox(), mini = B.mini, x0 = B.x, y0 = B.y, w = B.w, h = B.h;
  const px0 = x0 + (mini ? 26 : 36), px1 = x0 + w - (mini ? 8 : 10), py0 = y0 + (mini ? 22 : 24), py1 = y0 + h - (mini ? 10 : 22);
  const vy = v => U.lerp(py1, py0, (U.clamp(v, -88, 42) + 88) / 130);
  c.fillStyle = 'rgba(4,10,19,.86)'; c.strokeStyle = 'rgba(94,234,212,.42)'; c.lineWidth = 1;
  c.beginPath(); c.roundRect(x0, y0, w, h, 10); c.fill(); c.stroke();
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillStyle = '#5eead4';
  c.font = '700 ' + (mini ? 10.5 : 11) + 'px system-ui';
  c.fillText(mini ? 'Vm (soma)' : 'Membrane potential (soma / AIS)', x0 + 10, y0 + 12);
  const hot = S.v >= thr() || S.ap;
  c.font = '800 ' + (mini ? 12 : 12.5) + 'px system-ui'; c.textAlign = 'right'; c.fillStyle = hot ? '#ff8fa8' : '#e8eef7'; c.fillText(Math.round(S.v) + ' mV', x0 + w - 10, y0 + 12);
  c.font = (mini ? 9 : 10) + 'px system-ui';
  const grid = mini ? [[30, '+30', '#93a4bf', 0], [REST, '', '#93a4bf', 0], [thr(), 'thr', '#ffcf5c', 1]] : [[30, '+30', '#93a4bf', 0], [0, '0', '#93a4bf', 0], [thr(), 'thr', '#ffcf5c', 1], [REST, '−70', '#93a4bf', 0]];
  for (const [v, lab, col, dash] of grid) {
    const y = vy(v); c.strokeStyle = dash ? 'rgba(255,207,92,.75)' : 'rgba(147,164,191,.22)'; c.setLineDash(dash ? [4, 3] : []); c.beginPath(); c.moveTo(px0, y); c.lineTo(px1, y); c.stroke();
    c.fillStyle = col; c.fillText(lab, px0 - 4, y);
  }
  c.setLineDash([]);
  /* trace with a soft glow */
  const H = S.hist, N = 400, dx = (px1 - px0) / (N - 1), off = N - H.length;
  c.save(); c.beginPath(); c.rect(px0, y0 + 2, px1 - px0, h - 4); c.clip();
  c.lineJoin = 'round'; c.beginPath();
  for (let i = 0; i < H.length; i++) { const x = px0 + (i + off) * dx, y = vy(H[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = 'rgba(94,234,212,.22)'; c.lineWidth = 5; c.stroke();
  c.strokeStyle = '#5eead4'; c.lineWidth = 1.6; c.stroke();
  c.restore();
  for (const m of S.marks) { const x = px1 - (g.t - m.t) / .03 * dx; if (x < px0) continue; c.fillStyle = m.k === 'e' ? C.glu : C.gaba; c.fillRect(x - 1, py1 + (mini ? 2 : 3), 2, mini ? 4 : 5); }
  if (!mini) {
    c.font = '10px system-ui'; c.textAlign = 'left'; c.fillStyle = '#9fb0c8';
    c.fillText('last 12 game-s · ▮ EPSP  ▮ IPSP · a real spike lasts ~1 ms', x0 + 10, y0 + h - 9);
    c.fillStyle = C.glu; c.fillRect(x0 + 92, y0 + h - 13, 3, 7); c.fillStyle = C.gaba; c.fillRect(x0 + 131, y0 + h - 13, 3, 7);
    /* ion legend */
    const ly = y0 + h + 6; c.fillStyle = 'rgba(4,10,19,.8)'; c.beginPath(); c.roundRect(x0, ly, w, 24, 8); c.fill();
    const items = [[C.na, 'Na⁺'], [C.k, 'K⁺'], [C.ca, 'Ca²⁺'], [C.cl, 'Cl⁻'], [C.glu, 'glutamate'], [C.atp, 'ATP'], [C.glc, 'glucose']];
    let lx = x0 + 10; c.font = '10.5px system-ui'; c.textBaseline = 'middle';
    for (const [col, lab] of items) { c.fillStyle = col; c.beginPath(); c.arc(lx + 4, ly + 12, 3.6, 0, TAU); c.fill(); c.fillStyle = '#d5e2f5'; c.fillText(lab, lx + 11, ly + 12.5); lx += 15 + c.measureText(lab).width + 5; }
  }
}
function drawNav(c) {
  const T = performance.now() / 1000;
  for (const b of navBoxes()) {
    const [id, lab, sts] = b.n, cur = S.view === id, st0 = st['nav_' + id];
    const wait = S.tutDone && sts.some(k => st[k] && !st[k].hidden && st[k].ready && st[k].ready(st[k], g));
    const hov = S.navHover === id;
    c.fillStyle = cur ? 'rgba(94,234,212,.2)' : hov ? 'rgba(30,50,72,.95)' : 'rgba(4,10,19,.82)';
    c.strokeStyle = wait ? `rgba(255,225,77,${.65 + .35 * Math.sin(T * 5)})` : cur ? 'rgba(94,234,212,.85)' : 'rgba(148,170,200,.35)';
    c.lineWidth = wait ? 1.6 : 1; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, b.h / 2); c.fill(); c.stroke();
    c.font = '700 ' + (b.h > 28 ? 12 : 11) + 'px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = cur ? '#5eead4' : '#dbe6f5'; c.fillText(lab, b.x + b.w / 2 + (wait ? 4 : 0), b.y + b.h / 2 + .5);
    if (wait) { c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(b.x + b.w / 2 - c.measureText(lab).width / 2 - 4, b.y + b.h / 2, 3, 0, TAU); c.fill(); }
    if (st0) { const w = g.s2w(b.x + b.w / 2, b.y + b.h / 2); st0.x = w[0]; st0.y = w[1]; }
  }
}

/* ---------- win ---------- */
function finish() {
  g.hint(null); g.learn('n_ltp');
  const s = S.stats;
  g.win({ title: 'A synapse remembers', html: `<p>You received, summed and relayed signals across a centimetre of axon, kept a far-away terminal supplied, survived an energy crisis — and, by pairing input with output, made one synapse <b>stronger</b>. That is long-term potentiation, the leading cellular model of how memories are stored.</p>
    <p>A real cortical neuron does this at thousands of synapses at once, in milliseconds, for a lifetime.</p>`,
    stats: [[s.rel, 'spikes relayed'], [s.ap, 'action potentials'], [s.epsp, 'EPSPs received'], [Math.round(s.atp), 'ATP made (soma)'], [s.pump, 'pump cycles'], [s.mitoShip, 'mitochondria shipped'], [s.cargo, 'cargoes delivered by axonal transport'], [res('ampa') * 5 + ' AMPARs', 'at the potentiated spine (from 20)'], [U.mmss(g.t), 'play time']] });
}

/* ---------- codex ---------- */
CG.levels.find(l => l.id === 'neuron').codex = [
  { id: 'n_numbers', title: 'A neuron by the numbers', html: `<p>The neuron in this level is a <b>layer 2/3 pyramidal cell</b> of the human cerebral cortex — the most common kind of excitatory neuron in the cortex.</p>
    <ul><li>The human brain has ~86 billion neurons, ~16 billion of them in the cerebral cortex. About 70–80 % of cortical neurons are excitatory (mostly pyramidal, using glutamate); the rest are inhibitory interneurons (GABA).</li>
    <li>Soma: ~20–25 µm, with a nucleus ~10 µm across. Dendrites add up to several millimetres to over a centimetre (human L2/3 cells are larger than rodent ones), carrying ~1–3 spines per µm — thousands to tens of thousands of input synapses per cell.</li>
    <li>Axon: ~1 µm thick; from under a millimetre to about a metre long (corticospinal neurons). With its branches it can make thousands of output synapses.</li>
    <li>Resting potential ≈ −70 mV, threshold ≈ −55 mV, spike peak ≈ +30 mV, spike width ~1 ms. Average firing rates in cortex are low (often below a few Hz), with brief bursts above 100 Hz.</li>
    <li>Energy: the brain is ~2 % of body mass but uses ~20 % of resting energy, ~120 g of glucose per day. Most of it goes to pumping ions back after signals.</li>
    <li>Neurons are post-mitotic: most of your cortical neurons are as old as you are, while their proteins are replaced every few days to weeks.</li></ul>
    <p><b>What the game changes:</b> one click stands for many molecules (a "volley" of synchronised inputs, a pump cohort); time runs at a different speed for each process (spikes slowed ~500×, transport sped up ~100× (fast) to ~5,000× (slow)); ion concentration changes per spike are exaggerated; the axon is cut short. Names, locations, stoichiometries (30 vs 2 ATP per glucose, 3 Na⁺ : 2 K⁺ : 1 ATP) and the order of events are real.</p>` },
  { id: 'n_ap', title: 'The action potential', html: `<p>Ion pumps keep Na⁺ high outside (~145 mM vs ~12 mM inside) and K⁺ high inside (~140 mM vs ~4 mM). Because the resting membrane is mostly permeable to K⁺, the inside sits near −70 mV (E<sub>K</sub> ≈ −90 mV, E<sub>Na</sub> ≈ +60 mV).</p>
    <ol><li><b>Threshold:</b> when summed EPSPs depolarise the axon initial segment to ≈ −55 mV, enough voltage-gated Na⁺ channels open to start a runaway loop: more Na⁺ in → more depolarisation → more channels open.</li>
    <li><b>Rising phase:</b> V<sub>m</sub> shoots toward E<sub>Na</sub>, peaking near +30 mV.</li>
    <li><b>Falling phase:</b> within ~1 ms the Na⁺ channels <i>inactivate</i> (a lid swings shut), and voltage-gated K⁺ channels open, driving V<sub>m</sub> back — briefly below rest (after-hyperpolarisation).</li>
    <li><b>Refractory period:</b> until Na⁺ channels recover, a new spike is impossible (absolute) or needs a stronger input (relative). This also keeps the spike travelling forward only.</li></ol>
    <p>The spike is <b>all-or-none</b>: information is carried by <i>when</i> and <i>how often</i> a neuron fires. Surprisingly few ions are needed — one spike changes the soma's Na⁺ concentration by well under 1 %. Hodgkin and Huxley worked this out in the squid giant axon (Nobel Prize 1963).</p>` },
  { id: 'n_myelin', title: 'Myelin and saltatory conduction', html: `<p>An unmyelinated axon must regenerate the spike continuously, and thin ones conduct at only ~0.5–2 m/s. Wrapping the axon in <b>myelin</b> — many tight layers of glial membrane — cuts current leakage and membrane capacitance, so the depolarisation spreads quickly inside the axon to the next gap, a <b>node of Ranvier</b>, where Nav channels regenerate it. The spike seems to jump: saltatory conduction ("saltare" = to leap).</p>
    <ul><li>In the brain and spinal cord, myelin is made by <b>oligodendrocytes</b>; in nerves by Schwann cells.</li><li>Conduction speeds: thin cortical myelinated axons ~1–10 m/s; the thickest peripheral fibres ~100 m/s or more.</li>
    <li>Myelin also saves energy: ions only cross the membrane at the nodes.</li><li>In multiple sclerosis, immune attack strips CNS myelin; conduction slows or fails.</li></ul>` },
  { id: 'n_synapse', title: 'Chemical synapses: how a vesicle fuses', html: `<p>When the spike invades the terminal, voltage-gated Ca²⁺ channels (Cav2.1 P/Q-type and Cav2.2 N-type in cortex) open. Ca²⁺ enters into tiny nanodomains right next to vesicles that are already <b>docked and primed</b>.</p>
    <ol><li><b>Priming:</b> Munc18-1 and Munc13-1 assemble a partially zipped SNARE complex between the vesicle protein VAMP2 (synaptobrevin) and the plasma-membrane proteins syntaxin-1 and SNAP-25. Complexin clamps it.</li>
    <li><b>Triggering:</b> Ca²⁺ binds <b>synaptotagmin-1</b> (its C2A and C2B domains bind 5 Ca²⁺ in total), which releases the clamp and pushes on the membrane.</li>
    <li><b>Fusion:</b> the SNAREs zip completely, the membranes merge and a few thousand glutamate molecules spill into the 20 nm cleft — within a fraction of a millisecond of Ca²⁺ entry.</li>
    <li><b>Recycling:</b> NSF and α-SNAP pull the spent SNAREs apart (ATP); clathrin, AP-2 and dynamin retrieve the membrane; the V-ATPase and VGLUT1 refill the vesicle.</li></ol>
    <p>A cortical bouton holds ~100–200 vesicles but only ~5–10 are immediately releasable, and each spike releases a vesicle only part of the time. During fast trains the pool runs down: <b>short-term depression</b>. Clostridial toxins (botulinum, tetanus) work by cutting SNARE proteins.</p>` },
  { id: 'n_receptors', title: 'Glutamate and GABA receptors', html: `<ul><li><b>AMPA receptors</b> (GluA1–4, tetramers): open within ~1 ms of glutamate binding, letting mainly Na⁺ in. They carry the fast EPSP. Receptors containing edited GluA2 are impermeable to Ca²⁺.</li>
    <li><b>NMDA receptors</b> (two GluN1 + two GluN2A/2B): need glutamate <i>and</i> a co-agonist (glycine or D-serine), and at rest their pore is blocked by Mg²⁺. Only when the membrane is depolarised does Mg²⁺ leave — so they open only if presynaptic release and postsynaptic depolarisation coincide. They let in Ca²⁺, the trigger for plasticity. Ketamine and memantine block them.</li>
    <li><b>GABA-A receptors</b> (pentamers, e.g. 2α 2β γ): Cl⁻ channels opened by GABA. In mature neurons the transporter KCC2 keeps Cl⁻ low, so GABA hyperpolarises or clamps the membrane near −75 mV and shunts excitation.</li></ul>
    <p>One synapse contributes only ~0.2–1 mV at the soma. A neuron fires when tens of inputs arrive close together in space (<b>spatial summation</b>) or time (<b>temporal summation</b>), outweighing inhibition.</p>` },
  { id: 'n_inhib', title: 'Inhibition and balance', html: `<p>Cortical circuits are built from excitatory pyramidal cells and a smaller, very diverse population of inhibitory interneurons:</p>
    <ul><li><b>Parvalbumin basket cells</b> wrap the soma; fast and precise, they control spike timing and drive gamma rhythms.</li><li><b>Chandelier cells</b> contact only the axon initial segment.</li>
    <li><b>Somatostatin (Martinotti) cells</b> target distal dendrites and gate inputs there; <b>VIP cells</b> inhibit other interneurons.</li></ul>
    <p>Excitation and inhibition rise and fall together, keeping activity in check. When inhibition fails, activity can run away — one mechanism behind epileptic seizures. Inhibition is not the enemy of signalling; it is what makes signals precise.</p>` },
  { id: 'n_energy', title: 'The energy bill of thinking', html: `<p>Neurons spend most of their energy on <b>restoring ion gradients</b>: Na⁺ that entered during EPSPs and action potentials must be pumped out by the Na⁺/K⁺-ATPase (3 Na⁺ out, 2 K⁺ in, 1 ATP). Estimates for grey matter attribute the majority of signalling-related ATP to synaptic currents and action potentials, with the resting potential, transmitter recycling and Ca²⁺ extrusion making up the rest.</p>
    <ul><li>Fuel: glucose crosses the blood–brain barrier via GLUT1, enters neurons via GLUT3.</li><li>Yield: ~30 ATP per glucose with oxygen (glycolysis + TCA cycle + oxidative phosphorylation) versus 2 without.</li>
    <li>Neurons depend heavily on mitochondria and have little energy reserve: within seconds of losing blood flow, consciousness fades; within minutes, ATP collapses.</li>
    <li><b>Hypothesis:</b> the astrocyte–neuron lactate shuttle (Pellerin &amp; Magistretti, 1994) proposes that astrocytes take up glucose, make lactate and pass it to neurons, especially during activity. It is supported by some experiments and disputed by others.</li>
    <li>Brain imaging (fMRI, PET) detects the extra blood flow and glucose use that follow this energy demand.</li></ul>` },
  { id: 'n_glia', title: 'Astrocytes and the glutamate–glutamine cycle', html: `<p>Glutamate is the brain's main excitatory transmitter — and toxic if it lingers. Astrocytes keep extracellular glutamate around 0.01–0.1 µM between signals using the transporters EAAT1 (GLAST) and EAAT2 (GLT-1), each glutamate co-transported with 3 Na⁺ and 1 H⁺ in exchange for 1 K⁺.</p>
    <ol><li>Astrocyte: glutamine synthetase + ATP + NH₄⁺ turns glutamate into glutamine.</li><li>Glutamine is passed to the neuron (SNAT-family transporters).</li>
    <li>Neuron: mitochondrial glutaminase (<i>GLS</i>) makes glutamate again; VGLUT1 loads it into vesicles.</li></ol>
    <p>Neurons largely lack pyruvate carboxylase, the enzyme needed to make new TCA-cycle carbon for glutamate, so they rely on this cycle. Astrocytes also mop up K⁺, store the brain's glycogen, and their endfeet cover the blood vessels. Oligodendrocytes make myelin; microglia are the brain's immune cells.</p>` },
  { id: 'n_transport', title: 'Axonal transport: the long supply line', html: `<p>A neuron's protein factories are in the soma and dendrites, yet most of its volume may be axon. Everything else must be <b>shipped</b> along microtubules, which in axons all point plus-end outward.</p>
    <ul><li><b>Kinesins</b> (plus-end motors) carry cargo outward. Kinesin-1 (KIF5A/B/C) moves mitochondria (via TRAK1/2 and Miro1) and many membrane organelles; kinesin-3 (KIF1A) carries synaptic-vesicle precursors. Each step is 8 nm and costs 1 ATP.</li>
    <li><b>Cytoplasmic dynein</b> (minus-end motor, with dynactin) carries cargo back: old mitochondria, autophagosomes and signalling endosomes reporting from the terminal.</li>
    <li><b>Fast transport:</b> ~50–400 mm/day. <b>Slow transport:</b> cytoskeletal proteins (slow component a, ~0.2–1 mm/day) and cytosolic proteins such as clathrin and many enzymes (slow component b, ~2–8 mm/day). For a 1-metre motor axon, slow cargo needs months (slow component b) to years (slow component a).</li></ul>
    <p>Because the supply line is so long, transport defects hit the longest neurons first: <i>KIF5A</i> mutations cause hereditary spastic paraplegia and are linked to ALS; dynein (<i>DYNC1H1</i>) mutations cause motor neuropathies.</p>` },
  { id: 'n_gene', title: 'Making proteins in a neuron', html: `<p>Neurons are among the most active protein makers in the body. Their rough ER is so abundant that it stains as <b>Nissl bodies</b>; the Golgi sits at the base of the apical dendrite, with small outposts further out.</p>
    <ul><li>Membrane proteins (channels, receptors, transporters) are made into the ER, glycosylated in the Golgi and sorted to dendrites, the axon initial segment or the axon.</li>
    <li>Some mRNAs — including <i>CAMK2A</i>, <i>ARC</i> and many others — are carried into dendrites in RNA granules and translated <b>locally</b>, near the synapses that need them, on demand.</li>
    <li>Activity triggers transcription: Ca²⁺ signals reach the nucleus and switch on immediate-early genes (<i>FOS</i>, <i>ARC</i>, <i>NPAS4</i>) within minutes; long-lasting forms of plasticity require this new protein synthesis.</li></ul>` },
  { id: 'n_ltp', title: 'LTP: how a synapse learns', html: `<p>In 1949 Donald Hebb proposed that when one cell repeatedly helps fire another, the connection between them strengthens. In 1973 Tim Bliss and Terje Lømo found exactly that in the rabbit hippocampus: brief high-frequency stimulation made synaptic responses larger for hours — <b>long-term potentiation</b>.</p>
    <ol><li><b>Coincidence detection:</b> NMDA receptors pass Ca²⁺ only when glutamate is bound <i>and</i> the spine is depolarised (Mg²⁺ expelled) — for instance by a back-propagating action potential. Timing matters: input shortly before output (within tens of ms) potentiates, the reverse order tends to depress (spike-timing-dependent plasticity).</li>
    <li><b>Switch:</b> Ca²⁺/calmodulin activates <b>CaMKII</b>, which autophosphorylates (Thr286) and stays active; it binds GluN2B at the synapse.</li>
    <li><b>Expression:</b> AMPA receptors (GluA1-containing) are inserted from recycling endosomes and trapped at the PSD (via TARPs such as stargazin and PSD-95). The spine head enlarges.</li>
    <li><b>Consolidation:</b> later phases need new transcription and translation.</li></ol>
    <p>LTP and its counterpart LTD are the leading cellular models of learning and memory; how exactly they add up to a stored memory is still being worked out.</p>` },
  { id: 'n_ischemia', title: 'Ischemia and excitotoxicity', html: `<p>When a blood vessel is blocked (ischemic stroke), neurons lose oxygen and glucose. Glycolysis alone gives 2 ATP per glucose instead of ~30, so ATP falls within minutes. The Na⁺/K⁺ pumps fail, gradients run down and neurons depolarise (anoxic depolarisation).</p>
    <p>Depolarised terminals release glutamate, and energy-starved transporters can even run backwards and export it. Glutamate keeps NMDA receptors open and Ca²⁺ floods in, activating proteases (calpains), nitric-oxide synthase and mitochondrial damage — <b>excitotoxicity</b> (a term coined by John Olney in 1969). Dendrites swell into beads and spines are lost.</p>
    <p>Around the dead core lies a "penumbra" that can still be saved if flow is restored quickly. In an untreated large-vessel stroke, roughly 1.9 million neurons are estimated to be lost each minute — hence "time is brain".</p>` },
];
})();
