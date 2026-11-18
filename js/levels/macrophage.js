/* LEVEL 3 — one human alveolar macrophage fights a bacterial lung infection.
   World units are micrometres. The macrophage's centre is (0,0); +y points down, towards the alveolar wall and its capillary.
   Time scale: 1 game-second ≈ 1 minute of infection (bacterial doubling, recruitment); single cell-biology steps are compressed further. */
(function () {
'use strict';
const { U, D } = CG, TAU = U.TAU;
const RC = 10;                                     // mean radius: human alveolar macrophages are ~15–25 µm across
const NUC = { x: 4.6, y: 1.2, rx: 3.8, ry: 2.9 };  // kidney-shaped nucleus; the indentation (hilum) faces the centrosome on its left
const CTR = { x: .4, y: .9 };                      // centrosome / microtubule-organising centre
const WALL = 12.2;                                 // surface of the alveolar epithelium (type I cell)
const WX = -27, WY = -18.5, WW = 54, WH = 36.5;
const DA = U.deg(182);                             // where the phagocytic cup forms
const ZONE = { nox: { x: -6.0, y: -1.4 }, mat: { x: -4.1, y: 1.9 }, lys: { x: -1.3, y: 3.8 } };
const SLOTS = [[0, 0], [0, -1.5], [0, 1.5], [2.3, -.75], [2.3, .75]];
const LANE = { x1: -6.4, y1: 5.2, x2: -2.6, y2: 6.9 };
const GLC_PILE = { x: -6.3, y: 6.6 }, PYR_PILE = { x: -2.0, y: 7.7 };
const FREE_RIBO = [{ x: 2.2, y: -4.8 }, { x: -2.8, y: -7.2 }, { x: 6.8, y: 4.9 }];
const MITO = [[3.5, 12.0, 6.0, 250, 285, .45], [5.5, 8.0, 1.6, 180, 300, .42], [1.0, 6.5, 1.0, 200, 330, .4], [5.0, -4.6, 2.0, 200, 300, .42], [-5.6, -6.2, 1.6, 300, 400, .4], [2.0, -6.6, 1.4, 180, 300, .4], [8.2, -.6, 1.2, 150, 230, .38]];
const GLY = ['HK2', 'GPI', 'PFKP', 'ALDOA', 'TPI1', 'GAPDH', 'PGK1', 'PGAM1', 'ENO1', 'PKM'];
const MAXP = 6, BUGCAP = 26, TL = 2.4;
let g, S, st = {}, OI = null;
const lv = id => g.shop.level(id);
const res = id => g.res.get(id);
const adiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/* ---------- geometry ---------- */
function rc(a) {                                    // gently ruffling outline (never more than ~1 µm, so stations stay put)
  const t = g ? g.t : 0;
  return RC + .38 * Math.sin(3 * a + t * .22) + .26 * Math.sin(5 * a - t * .17 + 1) + .16 * Math.sin(9 * a + t * .37 + 2) - .5 * Math.exp(-Math.pow(adiff(a, Math.PI / 2) / .5, 2));
}
const mp = (a, off) => { const r = rc(a) + (off || 0); return { x: Math.cos(a) * r, y: Math.sin(a) * r }; };
const nucK = a => 1 - .28 * Math.exp(-Math.pow(adiff(a, Math.PI) / .55, 2));
const nucPt = (a, s) => { const k = nucK(a) * (s || 1); return { x: NUC.x + Math.cos(a) * NUC.rx * k, y: NUC.y + Math.sin(a) * NUC.ry * k }; };
function inNuc(x, y, m) { const ex = (x - NUC.x) / NUC.rx, ey = (y - NUC.y) / NUC.ry; return Math.hypot(ex, ey) < nucK(Math.atan2(ey, ex)) * (1 + (m || 0)); }
function nucPath(c, s) { c.beginPath(); for (let i = 0; i <= 80; i++) { const p = nucPt(i / 80 * TAU, s); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.closePath(); }
function outsideOK(x, y) { return x > WX + 1.5 && x < WX + WW - 1.5 && y > WY + 1.5 && y < WALL - 1.2 && Math.hypot(x, y) > rc(Math.atan2(y, x)) + 1.8; }
function along(pts, f) {
  const seg = []; let L = 0;
  for (let i = 1; i < pts.length; i++) { const l = U.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y); seg.push(l); L += l; }
  let d = f * L;
  for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const q = U.clamp(d / (seg[i] || 1), 0, 1); return { x: U.lerp(pts[i].x, pts[i + 1].x, q), y: U.lerp(pts[i].y, pts[i + 1].y, q) }; } d -= seg[i]; }
  return pts[pts.length - 1];
}

/* ---------- labels: queued during drawing, then placed in priority order without overlapping ---------- */
const phone = () => g.W < 560;
function lab(text, x, y, o, pr) { S.lq.push({ text, x, y, o: o || {}, pr: pr || 0 }); }
function flushLabels(c) {
  const placed = [], bot = g.H - (phone() ? 84 : 58);
  S.lq.sort((a, b) => b.pr - a.pr);
  for (const l of S.lq) {
    const o = l.o, size = o.size || 11, [sx, sy] = g.w2s(l.x, l.y);
    c.font = (o.bold ? '700 ' : (o.italic ? 'italic ' : '') + '500 ') + size + 'px system-ui';
    const w = c.measureText(l.text).width, al = o.align || 'center';
    let x0 = al === 'center' ? sx - w / 2 : al === 'right' ? sx - w : sx;
    if (l.pr < 90 && (sy > bot || sy < 8 || x0 + w < 12 || x0 > g.W - 12)) continue;    // keep clear of the hint bar and the canvas edges
    const sh = x0 < 4 ? 4 - x0 : x0 + w > g.W - 4 ? g.W - 4 - x0 - w : 0;            // slide a half-hidden label back into view
    x0 += sh;
    const r = [x0 - 3, sy - size * .6 - 1, w + 6, size * 1.2 + 2];
    if (l.pr < 90 && placed.some(q => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) continue;
    placed.push(r); g.label(l.text, l.x + sh / g.scale, l.y, o);
  }
  S.lq.length = 0;
}

/* ---------- generic machine (as in level 1) ---------- */
function proc(s, cfg) {
  s.jobs = []; s.cfg = cfg;
  s.tryStart = manual => {
    if (s.jobs.length >= cfg.cap()) { if (manual) g.floatText(s.x, s.y - 1.2, 'Busy…', '#cbd5e1'); return false; }
    const no = cfg.can();
    if (no !== true) { if (manual) { g.floatText(s.x, s.y - 1.2, no, '#ff9a9a'); CG.sfx('bad'); } return false; }
    const job = { t: 0, dur: cfg.time(), manual }; cfg.start(job); s.jobs.push(job); return true;
  };
  s.onClick = () => s.tryStart(true);
  s.ready = () => !cfg.auto() && s.jobs.length < cfg.cap() && cfg.can() === true;
  s.update = (_, __, dt) => {
    const rate = cfg.rate ? cfg.rate() : 1;
    for (const j of s.jobs) { j.t += dt * rate; if (cfg.tick) cfg.tick(j); if (j.t >= j.dur) { j.done = true; cfg.finish(j); } }
    s.jobs = s.jobs.filter(j => !j.done);
    if (cfg.auto()) { s.autoT = (s.autoT || 0) - dt; if (s.autoT <= 0 && (!cfg.autoCan || cfg.autoCan())) { s.tryStart(false); s.autoT = .15; } }
    if (!cfg.noRing) s.progress = s.jobs.length ? s.jobs[0].t / s.jobs[0].dur : null;
  };
}
/* ---------- phagosome assembly-line station: acts on the oldest phagosome waiting at its stage ---------- */
function pipe(s, cfg) {
  s.cfg = cfg; S.run[cfg.run] = cfg;
  s.pick = () => S.phs.find(P => P.stage === cfg.wait && !P.moving && !(cfg.blocked && cfg.blocked(P)));
  s.tryRun = manual => {
    const P = s.pick();
    if (!P) {
      if (manual) {
        const b = cfg.blocked && S.phs.find(q => q.stage === cfg.wait && cfg.blocked(q));
        const mv = S.phs.some(q => q.stage === cfg.wait && q.moving);
        g.floatText(s.x, s.y - 1.4, b ? cfg.blockMsg : mv ? 'Phagosome on its way…' : cfg.none, b ? '#ff9a9a' : '#cbd5e1'); if (b) CG.sfx('bad');
      }
      return false;
    }
    const no = cfg.can(P);
    if (no !== true) { if (manual) { g.floatText(s.x, s.y - 1.4, no, '#ff9a9a'); CG.sfx('bad'); } return false; }
    if (cfg.pay) cfg.pay(P, manual);
    P.stage = cfg.run; P.t = 0; P.dur = cfg.dur(P); if (cfg.start) cfg.start(P);
    return true;
  };
  s.onClick = () => s.tryRun(true);
  s.ready = () => { if (cfg.auto()) return false; const P = s.pick(); return !!P && cfg.can(P) === true; };
  s.update = (_, __, dt) => {
    if (cfg.auto()) { s.autoT = (s.autoT || 0) - dt; if (s.autoT <= 0) { s.autoT = .3; s.tryRun(false); } }
    const r = S.phs.find(P => P.stage === cfg.run);
    s.progress = r ? U.clamp(r.t / r.dur, 0, 1) : null;
  };
}
function mk(o) { const s = g.addStation(o); st[o.id] = s; return s; }
function memb(id, deg, off) { st[id].ma = U.deg(deg); st[id].moff = off || 0; }
function placeMembrane() { for (const s of g.stations) if (s.ma !== undefined) { const p = mp(s.ma, s.moff); s.x = p.x; s.y = p.y; } }

/* ---------- small molecules ---------- */
const dGlu = (c, t) => D.glucose(c, t.x, t.y, .28, t.age * 2);
const dPyr = (c, t) => D.pyruvate(c, t.x, t.y, .26, t.age * 3);
const dATP = (c, t) => D.atp(c, t.x, t.y, .22);
function fly(draw, from, to, dur, cb) { const t = g.token({ x: from.x, y: from.y, draw }); t.to(to, dur); if (cb) t.then(cb); t.die(); return t; }
function atpPop(s, n) {
  g.res.add('atp', n, { x: s.x, y: s.y - 1 }); S.stats.atp += n;
  for (let i = 0; i < Math.min(n, 4); i++) { const t = g.token({ x: s.x + U.rand(-.3, .3), y: s.y, draw: dATP }); t.to(s.x + U.rand(-1.6, 1.6), s.y + U.rand(-1.6, .4), .7).fade(.3).die(); }
}
function importGlc() {
  S.glcFly++; S.stats.imp++;
  const s = st.glut1, o = mp(s.ma, 2.4), t = g.token({ x: o.x, y: o.y, draw: dGlu });
  t.to(s, .5).to(GLC_PILE.x, GLC_PILE.y, .8).then(() => { S.glcFly--; S.glc++; }).die();
}
function lactateOut() {
  const s = st.mct4, o = mp(s.ma, 3);
  const t = g.token({ x: PYR_PILE.x, y: PYR_PILE.y, draw: (c, t) => D.circle(c, t.x, t.y, .2, '#d6a2ff', '#6b3f8a', g.px) });
  t.to(s, .8).to(o.x + U.rand(-1, 1), o.y + U.rand(-1, 1), 1.2).fade(.4).die();
}

/* ---------- bacteria ---------- */
function newBug(kind, x, y) {
  const b = { kind, x, y, born: g.t, h: U.rand(TAU), rot: U.rand(TAU), op: 0, opk: U.rand(.75, 1.5), div: U.rand(.05, .55), id: ++S.bugId, seed: U.rand(9) };
  S.bugs.push(b); return b;
}
function spawnOut(kind, near) {
  for (let i = 0; i < 60; i++) {
    const x = near ? near.x + U.rand(-3, 3) : U.rand(-22, 22), y = near ? near.y + U.rand(-3, 3) : U.rand(WY + 3, WALL - 3);
    if (outsideOK(x, y) && (near || Math.hypot(x, y) > 14)) return newBug(kind, x, y);
  }
  return newBug(kind, -20, -6);
}
const bindable = b => b.kind !== 'spn' || (b.op >= 1 && lv('FCGR') >= 1);
const neuEdible = b => b.kind === 'ecoli' || (b.kind === 'spn' && b.op >= 1);
const liveCount = () => S.bugs.length + S.phs.filter(P => P.alive && P.stage !== 'gone').length;
const spnAlive = () => S.bugs.filter(b => b.kind === 'spn').length + S.phs.filter(P => P.alive && P.kind === 'spn').length;
function drawBug(c, kind, x, y, rot, o) {
  o = o || {};
  const k = 1 - (o.dig || 0) * .85; if (k <= .06) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(k * (o.k || 1), k * (o.k || 1));
  const dead = o.dead;
  if (kind === 'ecoli') {
    const L = 2.0 * (1 + (o.div || 0) * .4), W = .72;
    if (!o.inside && !dead) {                     // peritrichous flagella (drawn short)
      c.strokeStyle = 'rgba(160,255,210,.35)'; c.lineWidth = 1.2 * g.px;
      for (let i = 0; i < 4; i++) { const sy = (i - 1.5) * .18; c.beginPath(); for (let j = 0; j <= 10; j++) { const xx = -L / 2 - j * .22, yy = sy + Math.sin(j * 1.3 + g.t * 9 + i) * .12; j ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
    }
    if (!dead && !o.inside) D.glow(c, 0, 0, L * .75, '#62e6a6', .18);
    const gr = c.createLinearGradient(0, -W / 2, 0, W / 2);              // lit from above: a rounded rod, not a flat pill
    if (dead) { gr.addColorStop(0, '#8b98a3'); gr.addColorStop(1, '#4f5b66'); }
    else { gr.addColorStop(0, '#b4f7d6'); gr.addColorStop(.35, '#69e8ab'); gr.addColorStop(1, '#249266'); }
    c.fillStyle = gr; c.strokeStyle = dead ? '#3c4650' : '#17603f'; c.lineWidth = 1.4 * g.px;
    c.beginPath(); c.roundRect(-L / 2, -W / 2, L, W, W / 2); c.fill(); c.stroke();
    D.ellipse(c, -L * .08, -W * .18, L * .3, W * .1, 0, dead ? 'rgba(255,255,255,.08)' : 'rgba(240,255,248,.55)');
    if (!dead) for (let i = 0; i < 3; i++) D.circle(c, (i - 1) * L * .22 + .1, W * .12 * (i % 2 ? -1 : 1), .07, 'rgba(20,90,60,.45)');   // nucleoid hints
    if ((o.div || 0) > .65) { c.strokeStyle = '#1f7a52'; c.beginPath(); c.moveTo(0, -W / 2); c.lineTo(0, W / 2); c.stroke(); }
  } else if (kind === 'spn') {
    if (!dead) { D.ellipse(c, 0, 0, 1.3, .85, 0, 'rgba(200,220,255,.12)', 'rgba(200,220,255,.4)', 1.2 * g.px); }
    for (const sg of [-1, 1]) {
      const gr = c.createRadialGradient(sg * .46 - .14, -.13, .04, sg * .46, 0, .52);
      if (dead) { gr.addColorStop(0, '#8b98a3'); gr.addColorStop(1, '#55616c'); } else { gr.addColorStop(0, '#d6e6ff'); gr.addColorStop(.45, '#86b6ff'); gr.addColorStop(1, '#3c64b8'); }
      D.ellipse(c, sg * .46, 0, .5, .38, 0, gr, dead ? '#3c4650' : '#24427f', 1.3 * g.px);
    }
    const n = Math.floor((o.op || 0) * 8);
    c.strokeStyle = '#ffd6f0'; c.lineWidth = 1.6 * g.px;
    for (let i = 0; i < n; i++) {                 // IgG (Y) and C3b (dot) opsonins on the capsule
      const a = i / 8 * TAU + .3, px = Math.cos(a) * 1.32, py = Math.sin(a) * .88;
      if (i % 2) D.circle(c, px, py, .1, '#ffb3c7');
      else { c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -.18); c.moveTo(0, -.18); c.lineTo(-.12, -.32); c.moveTo(0, -.18); c.lineTo(.12, -.32); c.stroke(); c.restore(); }
    }
  } else {                                         // M. tuberculosis: thin, slightly curved, waxy, beaded
    c.lineCap = 'round';
    const path = () => { c.beginPath(); c.moveTo(-1.5, 0); c.quadraticCurveTo(0, -.35, 1.5, 0); };
    path(); c.lineWidth = .5; c.strokeStyle = dead ? '#3c4650' : '#a86f45'; c.stroke();     // ~0.5 µm wide (real: 0.2–0.5 µm)
    path(); c.lineWidth = .34; c.strokeStyle = dead ? '#6f7d88' : '#ffcfa0'; c.stroke();
    if (!dead) for (let i = 0; i < 4; i++) D.circle(c, -1.05 + i * .7, -.12 - Math.sin((i + .5) / 4 * Math.PI) * .05, .08, '#c98a5a');
  }
  c.restore();
}

/* ---------- phagosomes ---------- */
function toZone(P, z) {
  P.zone = z;
  const used = S.phs.filter(q => q !== P && q.zone === z).map(q => q.slot);
  let i = 0; while (used.includes(i)) i++;
  P.slot = i;
  const o = SLOTS[i % SLOTS.length], k = i >= SLOTS.length ? .6 : 0;
  P.tx = ZONE[z].x + o[0] + k; P.ty = ZONE[z].y + o[1] + k; P.moving = true;
}
function dockFree() { return !S.phs.some(P => P.stage === 'pull' || P.stage === 'bound' || P.stage === 'cup'); }
function canBind() {
  if (OI && g.obj.i < OI('mop') && S.stats.bound >= 1) return 'First follow this bacterium down the line';
  if (!dockFree()) return 'The phagocytic cup is busy';
  if (S.phs.filter(P => P.stage !== 'gone').length >= MAXP) return 'Too many phagosomes in progress';
  if (!S.bugs.some(bindable)) return S.bugs.length ? 'The capsule hides these pneumococci — they need IgG + FcγRIIA' : 'No bacteria nearby';
  return true;
}
function bind(manual) {
  const no = canBind();
  if (no !== true) { if (manual) { g.floatText(st.recog.x, st.recog.y - 1.4, no, '#ff9a9a'); CG.sfx('bad'); } return false; }
  const bp = mp(DA, 1.15);
  let best = null, bd = 1e9;
  for (const b of S.bugs) if (bindable(b)) { const d = U.dist(b.x, b.y, bp.x, bp.y); if (d < bd) { bd = d; best = b; } }
  S.bugs.splice(S.bugs.indexOf(best), 1);
  S.phs.push({ kind: best.kind, stage: 'pull', x: best.x, y: best.y, tx: bp.x, ty: bp.y, sp: 14, t: 0, dur: 1, pH: 7.3, rab: 0, lamp: false, alive: true, fade: 1, rot: best.rot, op: best.op, zone: null, slot: -1, moving: true });
  S.stats.bound++; g.learn('m_phago');
  if (best.kind === 'spn') g.floatText(bp.x, bp.y - 1.4, 'FcγRIIA grabs IgG', '#ffb3e6');
  else if (manual) g.floatText(bp.x, bp.y - 1.4, best.kind === 'mtb' ? 'bound (CR3 · mannose receptor)' : 'bound by MARCO', '#8fd3ff');
  return true;
}
function updPhs(dt) {
  const bp = mp(DA, 1.15);
  for (const P of S.phs) {
    if (P.stage === 'pull') {                    // reel in along a filopodium, then roll along the surface to the cup
      let a = Math.atan2(P.y, P.x), r = Math.hypot(P.x, P.y);
      const da = adiff(DA, a), rr = rc(a) + 1.15;
      if (r > rr + .05) r = Math.max(rr, r - P.sp * dt);
      else { a += Math.sign(da) * Math.min(Math.abs(da), P.sp * .6 * dt / Math.max(r, 1)); r = rc(a) + 1.15; }
      P.x = Math.cos(a) * r; P.y = Math.sin(a) * r; P.tx = null; P.moving = true;
      if (Math.abs(adiff(DA, a)) < .005) { P.stage = 'bound'; P.sp = 3; P.moving = false; }
    }
    if (P.stage === 'pull' || P.stage === 'bound' || P.stage === 'cup') P.rot += adiff(DA + Math.PI / 2, P.rot) * Math.min(1, dt * 3);
    if (P.stage === 'bound' || P.stage === 'cup') { P.tx = bp.x; P.ty = bp.y; }
    if (P.tx != null) {
      const d = U.dist(P.x, P.y, P.tx, P.ty), step = P.sp * dt;
      if (d <= step) { P.x = P.tx; P.y = P.ty; P.moving = false; } else { P.x += (P.tx - P.x) / d * step; P.y += (P.ty - P.y) / d * step; P.moving = true; }
    }
    if (P.stage !== 'pull' && P.stage !== 'bound' && P.stage !== 'cup') P.rot += adiff(0, P.rot) * Math.min(1, dt * 1.5);
    const cfg = S.run[P.stage];
    if (cfg) { P.t += dt; if (cfg.tick) cfg.tick(P, U.clamp(P.t / P.dur, 0, 1)); if (P.t >= P.dur) cfg.finish(P); }
    if (P.stage === 'wmat' && P.kind === 'mtb' && !S.act && !P.stuck && !P.moving) mtbArrest(P);
    if (P.stage === 'gone') P.fade -= dt * 1.4;
  }
  S.phs = S.phs.filter(P => !(P.stage === 'gone' && P.fade <= 0));
}
function mtbArrest(P) {
  P.stuck = true; P.pH = 6.4; S.mtbStuck = true; g.learn('m_tb');
  g.banner({ title: 'Phagosome maturation arrested', text: 'M. tuberculosis keeps its phagosome at the Rab5 stage: PtpA blocks V-ATPase, SapM erases PI(3)P. pH stays ~6.4 and lysosomes never fuse. A macrophage activated by IFN-γ from a helper T cell can override the block.', kind: 'stress', dur: 10 });
}

/* ---------- neutrophils, T cell ---------- */
function spawnNeu() {
  const side = Math.random() < .5 ? -1 : 1, x = side * U.rand(13, 22);
  S.neus.push({ x, y: 15.3, stage: 'dia', age: 0, eaten: 0, seed: U.rand(9), tgt: null, h: U.rand(TAU) });
  if (!S.neuSeen) { S.neuSeen = true; g.learn('m_cytokine'); g.toast('A <b>neutrophil</b> squeezes out of the capillary (diapedesis) and follows the CXCL8 gradient.', 'good'); }
}
function updNeus(dt) {
  const any = S.bugs.some(neuEdible);
  const every = lv('CXCL8') ? (lv('TNF') ? 12 : 18) : (S.bugs.length >= 16 ? 30 : 0), maxN = lv('CXCL8') ? (lv('TNF') ? 3 : 2) : 1;
  if (every && any) { S.neuT += dt; if (S.neuT > every && S.neus.length < maxN) { S.neuT = 0; spawnNeu(); if (!lv('CXCL8') && !S.epiSeen) { S.epiSeen = true; g.toast('Alveolar epithelial cells exposed to bacteria release some CXCL8 themselves — one neutrophil arrives. Express <i>CXCL8</i> for many more.', ''); } } }
  for (const n of S.neus) {
    n.age += dt;
    if (n.stage === 'dia') { n.y -= 3 * dt; if (n.y <= WALL - 6.2) n.stage = 'hunt'; continue; }
    if (!(n.tgt && S.bugs.includes(n.tgt) && neuEdible(n.tgt))) {
      n.tgt = null; let bd = 1e9;
      for (const b of S.bugs) if (neuEdible(b)) { const d = U.dist(n.x, n.y, b.x, b.y); if (d < bd) { bd = d; n.tgt = b; } }
    }
    if (n.tgt) {
      const b = n.tgt, d = U.dist(n.x, n.y, b.x, b.y);
      if (d < 6.4) {                           // touching its edge: a pseudopod reaches out
        S.bugs.splice(S.bugs.indexOf(b), 1); n.eaten++; n.tgt = null; S.stats.neuKill++;
        g.burst(b.x, b.y, '#dfe8ff', 10, 3); g.floatText(b.x, b.y - 1, 'eaten by a neutrophil', '#dfe8ff');
      } else { n.h = Math.atan2(b.y - n.y, b.x - n.x); n.x += Math.cos(n.h) * 4 * dt; n.y += Math.sin(n.h) * 4 * dt; }
    } else { n.h += U.rand(-1, 1) * dt; n.x += Math.cos(n.h) * .8 * dt; n.y += Math.sin(n.h) * .8 * dt; }
    const a = Math.atan2(n.y, n.x), m = rc(a) + 2.6;
    if (Math.hypot(n.x, n.y) < m) { n.x = Math.cos(a) * m; n.y = Math.sin(a) * m; }
    n.x = U.clamp(n.x, WX + 4, WX + WW - 4); n.y = U.clamp(n.y, WY + 4, WALL - 6.2);
  }
  for (const n of S.neus.slice()) if (n.stage === 'hunt' && (n.eaten >= 2 || n.age > 42)) { S.neus.splice(S.neus.indexOf(n), 1); apoptose(n); }
}
function apoptose(n) {
  const t = g.token({ x: n.x, y: n.y, r: 4, clickR: 4.2, seed: n.seed, name: 'Apoptotic neutrophil', tip: 'click: eat it (efferocytosis)', draw: drawApop, onClick: effero });
  g.after(26, () => { if (!t.dead && !t.eaten) effero(t); });
  if (!S.apSeen) { S.apSeen = true; g.toast('A neutrophil has died by <b>apoptosis</b>. Click it to clear it away — eating dead neutrophils calms inflammation.', ''); }
}
function effero(t) {
  if (t.eaten) return; t.eaten = true; t.onClick = null; t.eatT = g.t;
  const a = Math.atan2(t.y, t.x), m = mp(a, -2.5);
  t.to(m.x, m.y, 1.2).to(ZONE.lys.x + U.rand(-1, 1), ZONE.lys.y + U.rand(-1, 1), 1.4).fade(.6).die();
  S.relief = Math.min(20, S.relief + 10); g.res.add('aa', 3, { x: m.x, y: m.y - 1 }); S.stats.effero++; g.learn('m_resolve');
  if (S.stats.effero === 1) g.toast('<b>Efferocytosis:</b> MerTK recognises phosphatidylserine on the dying cell (bridged by Gas6/protein S). Eating it switches the macrophage towards resolution — <i>IL10</i> can now be expressed.', 'good');
}
function tDock() { return mp(U.deg(266), 4.25); }
function startT() {
  S.tc = { x: 23, y: 15.4, stage: 'in', wp: 0, t: 0 }; st.tcell.hidden = false;
  g.banner({ title: 'A helper T cell arrives', text: 'An effector CD4⁺ Th1 cell, primed earlier in a lymph node, follows chemokines (CXCL9/10) out of the capillary and crawls over your surface, scanning your HLA-DR–peptide complexes.', kind: 'good', dur: 7 });
}
function updT(dt) {
  const tc = S.tc; if (!tc) return;
  if (tc.stage === 'in') {
    const wps = [{ x: 23, y: 8 }, { x: 16, y: -11 }, { x: 6, y: -15.4 }, tDock()], w = wps[tc.wp], d = U.dist(tc.x, tc.y, w.x, w.y), step = 5 * dt;
    if (d <= step) { tc.x = w.x; tc.y = w.y; tc.wp++; if (tc.wp >= wps.length) { tc.stage = 'syn'; tc.t = 0; } }
    else { tc.x += (w.x - tc.x) / d * step; tc.y += (w.y - tc.y) / d * step; }
  } else {
    const p = tDock(); tc.x = p.x; tc.y = p.y; tc.t += dt;
    if (tc.t > 2.5 && !tc.rel) {
      tc.rel = true; g.floatText(tc.x, tc.y + 2.8, 'TCR + CD4 recognise peptide–HLA-DR', '#9af0c8'); g.ring(st.pres.x, st.pres.y, '#9af0c8', .5, 4, .9);
      for (let i = 0; i < 4; i++) g.after(i * .45, () => {
        const t = g.token({ x: tc.x + 1.5, y: tc.y + 2, draw: (c, t) => { D.circle(c, t.x - .14, t.y, .17, '#ffe08a', '#7a5c00', g.px); D.circle(c, t.x + .14, t.y, .17, '#ffe08a', '#7a5c00', g.px); } });
        t.to(st.ifngr, 1.1).then(() => { if (i === 3 && !S.ifn) { S.ifn = true; g.toast('IFN-γ has reached its receptor. Click <b>IFNGR</b>.', 'good'); } }).fade(.3).die();
      });
    }
  }
  st.tcell.x = tc.x; st.tcell.y = tc.y;
}

/* ---------- signalling ---------- */
function cascade(start, steps, col, done, onStep) {
  const tk = g.token({ x: start.x, y: start.y, draw: (c, t) => D.kinase(c, t.x, t.y, .5, col, true) });
  steps.forEach((s, i) => {
    tk.to(s.x, s.y, .55).then(t => { g.floatText(t.x, t.y - .9, s.name, col); g.ring(t.x, t.y, col, .2, 1.4, .5); CG.sfx('pop'); if (onStep) onStep(i, t); }).wait(.4);
  });
  tk.then(done).fade(.3).die();
}

/* ---------- gene expression: transcription → export → (ER →) translation → (Golgi →) destination ---------- */
function express(_, it) { S.txQ.push(it); }
function updExpression(dt) {
  if (!S.tx && S.txQ.length) S.tx = { it: S.txQ.shift(), t: 0, dur: 2.2 };
  if (S.tx) { S.tx.t += dt; if (S.tx.t >= S.tx.dur) { const it = S.tx.it; S.tx = null; translate(it); } }
}
function translate(it) {
  const npc = nucPt(U.deg(it.er ? 245 : 200), 1.02), site = it.er ? { x: st.er.x - .2, y: st.er.y + .3 } : U.pick(FREE_RIBO), col = it.col;
  const tk = g.token({ x: NUC.x - .5, y: NUC.y + 1.1, draw: (c, t) => D.mrna(c, t.x, t.y, 1.2, '#f0a8ff', t.age * 5) });
  tk.to(npc, .7).then(t => g.floatText(t.x, t.y - .7, 'mRNA export', '#f0a8ff')).to(site, 1.0)
    .then(t => { if (it.er) S.erBusy++; t.t0 = t.age; t.draw = (c, t) => { D.ribosome(c, t.x, t.y, .42, true, U.clamp((t.age - t.t0) / TL, 0, 1)); g.label(it.gene, t.x, t.y - 1.1, { size: 9, color: '#f0a8ff', italic: true }); }; })
    .wait(TL)
    .then(t => { if (it.er) { S.erBusy--; g.floatText(t.x, t.y - .8, 'ER → Golgi', '#e0b040'); } t.draw = it.er ? (c, t) => D.vesicle(c, t.x, t.y, .38, '#f2d58a', col) : (c, t) => D.protein(c, t.x, t.y, .36, col, 3); });
  if (it.er) tk.to(st.golgi, .9).wait(.4);
  const dest = it.dest === 'secrete' ? mp(U.rand(U.deg(-50), U.deg(70)), -.3) : st[it.dest];
  tk.to(dest, 1.2).then(t => {
    g.shop.grant(it.id); S.stats.genes++; g.burst(t.x, t.y, col, 14, 3); g.ring(t.x, t.y, col, .3, 2.2, .7); CG.sfx('good');
    g.floatText(t.x, t.y - 1.1, it.dest === 'secrete' ? it.gene + ' secreted' : it.dest === 'nuc' ? it.gene + ' enters the nucleus' : it.gene + ' in place', col);
  }).die();
}

/* ---------- inflammation, damage, secretion ---------- */
function updInfl(dt) {
  const out = S.bugs.length;
  S.stim = U.approach(S.stim, Math.min(1, liveCount() / 5), dt * .05);
  let tgt = out * 1.6 + (S.nfkb ? 5 : 0) + (lv('TNF') ? 24 * (.3 + .7 * S.stim) : 0) + (lv('CXCL8') ? 5 : 0) + S.neus.length * 7;
  tgt = U.clamp(tgt * (lv('IL10') ? .45 : 1) - S.relief, 0, 100);
  S.relief = Math.max(0, S.relief - dt * .25);
  g.res.set('infl', U.approach(res('infl'), tgt, dt * (tgt > res('infl') ? 3 : 2)));
  const inf = res('infl');
  let dd = Math.max(0, inf - 50) * .025 + out * .018; if (inf < 35 && out < 4) dd -= .3;
  g.res.set('dmg', U.clamp(res('dmg') + dd * dt, 0, 100));
  S.peakInfl = Math.max(S.peakInfl, inf); S.peakDmg = Math.max(S.peakDmg, res('dmg'));
  if (S.edema > 0) S.edema -= dt;
  const hyp = res('dmg') > 60 || S.edema > 0;
  if (hyp && !S.hypoxia) g.banner({ title: 'Alveolus flooding — hypoxia', text: 'Leaky capillaries fill the air space with fluid; O₂ supply drops and HIF-1α is stabilised. Mitochondria slow down — glycolysis still works.', kind: 'stress', dur: 8 });
  S.hypoxia = hyp;
  if (res('dmg') > 55 && !g.obj.side.find(s => s.id === 'dmg')) g.obj.addSide({ id: 'dmg', text: 'Tissue damage is high', hint: 'Bacteria and over-active neutrophils damage the alveolus. Eat bacteria faster, clear apoptotic neutrophils, and once possible express <i>IL10</i>.', check: () => res('dmg') < 35 });
}
function updSecretion(dt) {
  const kinds = [['TNF', '#ff7a59'], ['CXCL8', '#ffd166'], ['IL10', '#7ee787']].filter(k => lv(k[0]));
  if (!kinds.length) return;
  S.secT += dt; if (S.secT < 1.6) return; S.secT = 0;
  const k = U.pick(kinds), a = U.rand(U.deg(-50), U.deg(70)), p = mp(a, -.3), o = mp(a, 3.5);
  const t = g.token({ x: st.golgi.x, y: st.golgi.y, draw: (c, t) => D.vesicle(c, t.x, t.y, .32, '#f2d58a', k[1]) });
  t.to(p.x, p.y, 1.6).then(() => {
    for (let i = 0; i < 3; i++) { const d = g.token({ x: p.x, y: p.y, draw: (c, t) => D.circle(c, t.x, t.y, .13, k[1]) }); d.to(o.x + U.rand(-2, 2), o.y + U.rand(-2, 2), 2.2).fade(.5).die(); }
    if (k[0] === 'TNF' && Math.random() < .25) g.floatText(p.x, p.y - 1, 'ADAM17 cleaves pro-TNF', '#ff7a59');
  }).die();
}

/* ---------- events ---------- */
function lagOver() {
  S.grow = true; S.waves = true; S.waveT = 0;
  for (let i = 0; i < 7; i++) spawnOut('ecoli');
  g.banner({ title: 'The bacteria start dividing', text: 'Their lag phase is over: E. coli now doubles roughly every 50 minutes in the lining fluid. More are being aspirated into the alveolus.', kind: 'stress', dur: 8 });
}
function wave() {                                   // a fresh droplet of aspirated bacteria lands on the far side of the alveolus
  const n = g.obj.i === OI('spn') ? 3 : 5 + (g.obj.i >= OI('help') ? 1 : 0), side = Math.random() < .5 ? -1 : 1;
  const c = { x: side * U.rand(14, 19), y: U.rand(-12, 4) };
  for (let i = 0; i < n; i++) spawnOut('ecoli', c);
  g.ring(c.x, c.y, '#62e6a6', .5, 5, 1.2);
  g.toast('A fresh droplet is aspirated: <b>+' + n + ' E. coli</b>' + (side < 0 ? ' on the left.' : ' on the right.'), 'bad');
}
function bigWave() {
  S.nk0 = S.stats.neuKill;
  for (let i = 0; i < 9; i++) spawnOut('ecoli', { x: i % 2 ? 17 : -18, y: 4.5 });     // lands low on both sides, near the capillary
  g.banner({ title: 'A large inoculum!', text: 'A big droplet of contaminated secretions has reached the alveolus. One macrophage cannot keep up alone — call neutrophils in from the blood.', kind: 'stress', dur: 8 });
}
function startSpn() {
  S.spnN = 6;
  for (let i = 0; i < S.spnN; i++) spawnOut('spn');
  S.spnOn = true; g.learn('m_opson');
  g.banner({ title: 'Encapsulated pneumococci!', text: 'Streptococcus pneumoniae hides under a thick polysaccharide capsule. Your receptors can barely grip it until it is coated with antibody and complement leaking in from inflamed capillaries.', kind: 'stress', dur: 9 });
}
function startMtb() {
  const b = spawnOut('mtb', mp(U.deg(-25), 4.5)); b.op = 0; b.born = g.t - .2; S.mtbOn = true;          // lands on the far side: watch it being reeled in
  g.banner({ title: 'A different rod appears', text: 'A thin, waxy, slow-growing bacterium — Mycobacterium tuberculosis, inhaled in a tiny droplet. It does not mind being eaten…', kind: 'stress', dur: 8 });
}

/* ---------- drawing helpers ---------- */
function outlinePath(c, k) {
  const pts = S.outline; c.beginPath();
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; i ? c.lineTo(p[0] * k, p[1] * k) : c.moveTo(p[0] * k, p[1] * k); }
  c.closePath();
}
function drawNeu(c, n) {
  const r = 6, f = n.stage === 'dia' ? U.clamp((WALL + 3 - n.y) / 4, .25, 1) : 1;      // squeezing out of the capillary: fades in
  c.save(); c.globalAlpha *= f;
  const body = c.createRadialGradient(n.x - r * .3, n.y - r * .35, r * .1, n.x, n.y, r);
  body.addColorStop(0, 'rgba(215,228,255,.26)'); body.addColorStop(.7, 'rgba(170,190,240,.13)'); body.addColorStop(1, 'rgba(150,170,230,.2)');
  c.beginPath();                                                                      // slightly ruffled, crawling outline
  for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, rr = r * (1 + .035 * Math.sin(5 * a + n.seed + g.t * .8) + .025 * Math.sin(9 * a - g.t * 1.3)); i ? c.lineTo(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr) : c.moveTo(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr); }
  c.closePath(); c.fillStyle = body; c.fill(); c.strokeStyle = 'rgba(214,228,255,.6)'; c.lineWidth = 1.4 * g.px; c.stroke();
  for (let i = 0; i < 30; i++) { const a = n.seed + i * 2.399, d = Math.sqrt((i + .5) / 30) * r * .88; D.circle(c, n.x + Math.cos(a) * d, n.y + Math.sin(a) * d, .13, i % 3 ? 'rgba(255,232,196,.42)' : 'rgba(255,190,220,.4)'); }
  const lobes = [[-1.7, -.6, 1.15], [0, .5, 1.25], [1.7, -.4, 1.1], [.6, -1.7, .9]];
  c.strokeStyle = 'rgba(123,95,214,.85)'; c.lineWidth = .32;
  c.beginPath(); lobes.forEach((l, i) => { i ? c.lineTo(n.x + l[0], n.y + l[1]) : c.moveTo(n.x + l[0], n.y + l[1]); }); c.stroke();
  for (const l of lobes) {
    const gx = n.x + l[0], gy = n.y + l[1], lg = c.createRadialGradient(gx - l[2] * .35, gy - l[2] * .4, l[2] * .1, gx, gy, l[2]);
    lg.addColorStop(0, '#a796f2'); lg.addColorStop(.55, '#6c52c6'); lg.addColorStop(1, '#3d2d84');
    D.circle(c, gx, gy, l[2], lg, 'rgba(200,190,255,.8)', g.px);
  }
  c.restore();
}
function drawRBC(c, r) {                         // biconcave disc seen at a slant: bright thick rim, darker thin centre
  c.save(); c.translate(r.x, r.y); c.scale(1, .62);
  D.glow(c, 0, 0, 4.6, '#ff4d5e', .12);
  const gr = c.createRadialGradient(-.5, -.6, .2, 0, 0, 3.6);
  gr.addColorStop(0, '#7e1c28'); gr.addColorStop(.38, '#a02a36'); gr.addColorStop(.72, '#d9505b'); gr.addColorStop(.9, '#c43a46'); gr.addColorStop(1, '#7a1a22');
  c.beginPath(); c.arc(0, 0, 3.6, 0, TAU); c.fillStyle = gr; c.fill();
  c.strokeStyle = 'rgba(255,170,170,.35)'; c.lineWidth = .16; c.beginPath(); c.arc(0, 0, 3.0, U.deg(200), U.deg(320)); c.stroke();   // rim highlight
  D.glow(c, .25, .3, 1.9, '#4a0c16', .35);                                                                                         // shadowed central dimple
  c.restore();
}
function drawApop(c, t) {
  const k = t.eaten ? Math.max(.25, 1 - (g.t - t.eatT) / 2.6) : 1, r = 4 * k;
  D.circle(c, t.x, t.y, r, 'rgba(170,170,200,.25)', 'rgba(220,220,240,.6)', 1.4 * g.px);
  for (let i = 0; i < 5; i++) { const a = t.seed + i * 1.3; D.circle(c, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, .45 * k, 'rgba(170,170,200,.35)'); }
  for (let i = 0; i < 4; i++) { const a = t.seed * 2 + i * 1.7; D.circle(c, t.x + Math.cos(a) * r * .35, t.y + Math.sin(a) * r * .35, .55 * k, '#4a3590'); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; D.circle(c, t.x + Math.cos(a) * r, t.y + Math.sin(a) * r, .14 * k, '#c8f07a'); }   // exposed phosphatidylserine
}
function drawT(c, tc) {
  D.circle(c, tc.x, tc.y, 3.6, 'rgba(150,240,200,.16)', '#9af0c8', 1.6 * g.px);
  D.circle(c, tc.x + .2, tc.y - .3, 2.6, 'rgba(75,63,143,.85)', '#b3a6f5', g.px);
  if (tc.stage === 'syn') { const p = st.pres; const a = Math.atan2(p.y - tc.y, p.x - tc.x); for (let i = -3; i <= 3; i++) { const aa = a + i * .16; D.circle(c, tc.x + Math.cos(aa) * 3.6, tc.y + Math.sin(aa) * 3.6, .16, '#9af0c8'); } }
}
function drawHLA(c, x, y, ang, s, pep) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.strokeStyle = '#ffb3e6'; c.lineWidth = s * .14;
  for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(-s * .45, sg * s * .1); c.lineTo(s * .55, sg * s * .14); c.stroke(); D.circle(c, s * .75, sg * s * .18, s * .2, '#ffb3e6', 'rgba(0,0,0,.4)', D.px); }
  if (pep) D.circle(c, s * .98, 0, s * .12, '#ff5d8f');
  c.restore();
}
function vatIcon(c, x, y, s, spin) {      // V-ATPase: V0 ring in the membrane, V1 head (A3B3) on the cytosolic side
  c.fillStyle = '#5ab8e0'; c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = D.px;
  c.beginPath(); c.roundRect(x - s * .5, y - s * .2, s, s * .4, s * .1); c.fill(); c.stroke();
  c.fillRect(x - s * .07, y + s * .2, s * .14, s * .35);
  for (let i = 0; i < 6; i++) { const a = (spin || 0) + i / 6 * TAU; D.circle(c, x + Math.cos(a) * s * .3, y + s * .85 + Math.sin(a) * s * .18, s * .17, i % 2 ? '#8fe3ff' : '#3d95c2', 'rgba(0,0,0,.4)', D.px); }
}

/* =========================================================================================== */
CG.registerLevel({
  id: 'macrophage', title: 'A Human Macrophage', organism: 'Homo sapiens — an alveolar macrophage in an infected lung', color: '#ff8fa3',
  blurb: 'Hunt bacteria in a human lung: grab, engulf, burn, acidify and digest them, sound the alarm with cytokines, and show what you ate to a T cell.',
  learn: 'Phagocytosis · phagosome maturation · respiratory burst · TLR4 → NF-κB · cytokines & inflammation · MHC class II · IFN-γ / STAT1 · tuberculosis',
  world: { x: WX, y: WY, w: WW, h: WH }, maxZoom: 6,
  scaleNote: 'cells & bacteria drawn to scale · molecules and membranes enlarged',
  shopTitle: 'Genome', shopSub: 'Upgrades are <b>human genes</b> (HGNC symbols). Each is transcribed, exported, translated — at the ER if it is a membrane or secreted protein — and delivered to its workplace.',
  intro: `<p>You are a <b>macrophage</b> — a big (~20 µm) immune cell parked in an air sac (alveolus) of a human lung. Bacteria have just been breathed in.
    Each green rod is an <i>E. coli</i>, about 2 µm long: drawn to the same scale as you. In level 1 a whole yeast cell was only 2–3 times longer than that.</p>
    <ul><li>Run the <b>phagocytosis line</b>: receptors grab a bacterium → the actin cup engulfs it → NOX2 burns it → V-ATPase acidifies the phagosome → lysosomes digest it → its peptides go onto HLA-DR.</li>
    <li><b>ATP</b> pays for engulfing and pumping, <b>NADPH</b> fuels the oxidative burst, <b>amino acids</b> recycled from your prey pay for new proteins.</li>
    <li>Express genes to automate each step. Watch <b>inflammation</b>: a little calls in help, too much floods the lung.</li>
    <li>Click anything — including bacteria and other cells — to read what it really is. The 📖 codex collects what you learn.</li></ul>
    <p style="color:#93a4bf;font-size:13px">1 second ≈ 1 minute of infection; single steps inside the cell (a few minutes each in reality) are compressed further. Bacteria swim and blood flows much more slowly than in life so you can follow them.</p>`,

  phase() {
    const p = lv('IL10') ? 'Resolving (IL-10)' : S.act ? 'Classically activated (IFN-γ)' : S.nfkb ? 'Inflammatory — NF-κB on' : 'Resting, surveying';
    return p + ' · ' + liveCount() + ' live bacteria' + (S.hypoxia ? ' · hypoxic' : '');
  },
  clock() { const m = Math.floor(g.t); return 'infection clock ≈ ' + (m / 60 | 0) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; },

  setup(game) {
    g = game; S = g.S; st = {};
    Object.assign(S, { bugs: [], phs: [], neus: [], run: {}, bugId: 0, glc: 2, glcFly: 0, pyr: 0, pep: 0, pmhc: 0, impT: 0, bindT: 0, lacT: 0, akT: 0, aaT: 0, neuT: 0, secT: 0, waveT: 0,
      grow: false, waves: false, edema: 0, nfkb: false, act: false, ifn: false, stim: 0, relief: 0, peakInfl: 0, peakDmg: 0, hypoxia: false, erBusy: 0, txQ: [], tx: null, tc: null, outline: [], lq: [],
      stats: { bound: 0, engulf: 0, burst: 0, mat: 0, digest: 0, loaded: 0, presented: 0, kills: 0, neuKill: 0, nadph: 0, atp: 0, lac: 0, glyco: 0, ppp: 0, imp: 0, genes: 0, div: 0, effero: 0 } });
    g.res.def('atp', { name: 'ATP', v: 40, cap: 150, color: '#ffe14d', desc: 'Adenosine triphosphate. A human cell holds a few mM of ATP and recycles its whole pool within about a minute or less. Here it pays for actin-driven engulfment, proton pumping and gene expression.' })
      .def('nadph', { name: 'NADPH', v: 6, cap: 24, color: '#6ec6ff', desc: 'Reduced nicotinamide adenine dinucleotide phosphate — the electron donor for biosynthesis and for NOX2, the enzyme of the oxidative burst. Made mainly by the pentose-phosphate pathway (G6PD, PGD).' })
      .def('aa', { name: 'Amino acids', short: 'aa', v: 12, cap: 40, color: '#ff8ad8', desc: 'Building blocks for new proteins. A macrophage recycles them from what it digests: one E. coli contains roughly a billion amino-acid residues in its proteins.' })
      .def('bac', { name: 'Live bacteria', short: 'bacteria', v: 5, cap: 40, color: '#62e6a6', fmt: v => String(Math.round(v)), desc: 'Bacteria still alive in the alveolus or inside your phagosomes. Untouched, they keep dividing.' })
      .def('infl', { name: 'Inflammation', short: 'inflammation', v: 4, cap: 100, color: '#ff7a59', fmt: v => Math.round(v) + ' %', desc: 'Local inflammation: leaky capillaries, plasma proteins (antibodies, complement) and neutrophils entering the alveolus. Some is needed to fight infection; too much damages the gas-exchange surface.' })
      .def('dmg', { name: 'Tissue damage', short: 'damage', v: 0, cap: 100, color: '#ff4d6d', fmt: v => Math.round(v) + ' %', desc: 'Injury to the alveolar wall from bacterial toxins and from the immune response itself (neutrophil proteases and oxidants). Above 60 % fluid floods the alveolus and the tissue becomes hypoxic.' });

    /* ---------------- plasma-membrane proteins ---------------- */
    mk({ id: 'recog', name: 'Phagocytic receptors (MARCO · SR-A · FcγR)', short: 'Receptors', r: 1.0,
      draw(c, s) {
        const n = 3 + 2 * lv('MARCO');
        for (let i = 0; i < n; i++) { const a = s.ma + U.deg((i - (n - 1) / 2) * 2.6), p = mp(a); D.receptor(c, p.x, p.y, a, .95, '#7ad7ff', false); }
        if (lv('FCGR')) for (const d of [-9, 9]) { const a = s.ma + U.deg(d), p = mp(a); D.receptor(c, p.x, p.y, a, .9, '#ffb3e6', false); }
      },
      ready: () => lv('MARCO') < 2 && canBind() === true, onClick: () => bind(true),
      info: { title: 'Phagocytic receptors', sub: 'Plasma membrane · grabbing the prey', body: 'Macrophages recognise bacteria <b>directly</b> with scavenger receptors — MARCO and SR-A (gene <i>MSR1</i>) bind conserved bacterial surface molecules — or <b>indirectly</b> through opsonins: IgG antibodies are bound by Fcγ receptors (FcγRI/CD64, FcγRIIA/CD32A) and the complement fragment iC3b by complement receptor 3 (CR3 = CD11b/CD18). Clustered receptors switch on the engulfment machinery.',
        facts: ['MARCO is especially abundant on alveolar macrophages and is a main receptor for unopsonised bacteria and particles in the lung.', 'Macrophages often catch bacteria with thin filopodia and reel them in.', '"Zipper" model: receptors must engage ligand all around the particle for the membrane to wrap it completely.', 'TLR4 is <i>not</i> a phagocytic receptor: it senses LPS and signals (top-left of the membrane).'],
        game: 'A click makes the cell reach out and pull in the nearest bacterium its receptors can bind. Encapsulated pneumococci can only be grabbed once coated with IgG <i>and</i> after you express <i>FCGR2A</i>. Really, macrophages already carry some FcγRIIA, complement receptors (CR3) grab iC3b-coated pneumococci too, and MARCO binds a few uncoated ones — just far less efficiently.',
        live: () => [['Bindable bacteria', S.bugs.filter(bindable).length + ' / ' + S.bugs.length], ['FcγRIIA', lv('FCGR') ? 'expressed' : '—'], ['Automatic', lv('MARCO') >= 2 ? 'yes' : 'no']] } });
    memb('recog', 198);

    mk({ id: 'tlr4', name: 'TLR4 · MD-2 · CD14 (LPS sensor)', short: 'TLR4', r: 1.0,
      draw(c, s) {
        const a = s.ma; c.save(); c.translate(s.x, s.y); c.rotate(a);
        const on = S.nfkb || S.tlrBusy;
        if (on) D.glow(c, .8, 0, 1.6, '#ffb86b', .45);
        for (const y0 of [-.45, .45]) {                         // TLR4 dimer: TM helix, LRR horseshoe outside, TIR domain inside
          c.strokeStyle = '#ffb86b'; c.lineWidth = .16; c.beginPath(); c.moveTo(-.55, y0); c.lineTo(.35, y0); c.stroke();
          c.lineWidth = .2; c.beginPath(); c.arc(.95, y0 * 1.3, .5, Math.PI * .75, Math.PI * 2.25); c.stroke();
          D.ellipse(c, -.7, y0, .22, .18, 0, '#ffb86b', 'rgba(0,0,0,.4)', D.px);
          D.circle(c, 1.25, y0 * .55, .17, '#ffe08a', 'rgba(0,0,0,.4)', D.px);                        // MD-2
        }
        c.strokeStyle = '#c9a0ff'; c.lineWidth = .18; c.beginPath(); c.arc(.75, -1.45, .38, Math.PI * .7, Math.PI * 2.3); c.stroke();   // CD14 (GPI-anchored)
        c.beginPath(); c.moveTo(.4, -1.45); c.lineTo(.12, -1.45); c.stroke();
        c.restore();
      },
      ready: () => S.allowTLR && !S.nfkb && !S.tlrBusy,
      onClick(s) {
        if (!S.allowTLR || S.nfkb || S.tlrBusy) { if (!S.nfkb) g.floatText(s.x, s.y - 1.3, S.allowTLR ? 'Signalling…' : 'LPS is binding — signal later', '#cbd5e1'); return; }
        S.tlrBusy = true; g.learn('m_tlr');
        const N = nucPt(U.deg(215), 1.0);
        cascade(s, [{ x: -7.0, y: -4.6, name: 'TIRAP → MyD88' }, { x: -6.0, y: -5.7, name: 'IRAK4 → IRAK1 (Myddosome)' }, { x: -4.6, y: -6.1, name: 'TRAF6 · K63-ubiquitin' }, { x: -3.4, y: -5.3, name: 'TAK1' },
          { x: -3.2, y: -3.9, name: 'IKKα/β + NEMO' }, { x: st.prot.x, y: st.prot.y, name: 'IκBα-P → proteasome' }, { x: N.x, y: N.y, name: 'NF-κB p65/p50 enters nucleus' }], '#ffb86b',
          () => {
            S.nfkb = true; S.tlrBusy = false;
            g.banner({ title: 'NF-κB is in the nucleus', text: 'Inflammatory genes switch on within minutes: TNF, IL6, CXCL8, pro-IL1B, HIF1A — and NFKBIA, the inhibitor IκBα itself (negative feedback).', kind: 'good', dur: 8 });
            g.toast('Unlocked in the Genome: <i>TNF · CXCL8 · HIF1A</i>.', 'good');
          },
          i => { if (i === 5) { st.prot.flash = 1.2; g.floatText(st.prot.x, st.prot.y + 1.2, 'IκBα destroyed', '#c9a0ff'); } });
      },
      info: { title: 'TLR4 · MD-2 · CD14 — the LPS sensor', sub: 'Plasma membrane · Toll-like receptor', body: 'Lipopolysaccharide (LPS) covers the outer membrane of Gram-negative bacteria such as <i>E. coli</i>. LPS-binding protein (LBP) from plasma hands LPS to <b>CD14</b>, a GPI-anchored protein, which loads its lipid A part into <b>MD-2</b>, bound to <b>TLR4</b>. Two TLR4–MD-2 complexes pair up, bringing their cytoplasmic TIR domains together to start signalling.',
        facts: ['An E. coli cell carries on the order of a million LPS molecules.', 'Humans are far more sensitive to LPS than mice: a few nanograms per kg body weight given intravenously cause fever.', 'Human TLR4–MD-2 responds to the six-chain (hexa-acyl) lipid A of E. coli; the four-chain precursor lipid IVa activates mouse TLR4 but blocks the human receptor.', 'After signalling from the plasma membrane through TIRAP/MyD88, TLR4 is endocytosed and signals again from endosomes through TRAM/TRIF, inducing type I interferon.'],
        game: 'You click once to relay the signal to the nucleus; in reality TLR4 starts signalling within minutes of the first LPS contact — before the first bacterium is even eaten — and keeps signalling while LPS is present. The game holds it back so you meet one pathway at a time.',
        live: () => [['NF-κB', S.nfkb ? 'nuclear (active)' : 'held in cytosol by IκBα']] } });
    memb('tlr4', 218);

    mk({ id: 'glut1', name: 'GLUT1 glucose transporter (SLC2A1)', short: 'GLUT1', r: .9,
      draw(c, s) { for (const d of [-2.5, 2.5]) { const a = s.ma + U.deg(d), p = mp(a); D.transporter(c, p.x, p.y, a, .85, '#58d68d', S.glcFly > 0); } },
      info: { title: 'GLUT1 — glucose transporter', sub: 'Plasma membrane · facilitated diffusion (gene SLC2A1)', body: 'Lets glucose slide down its concentration gradient into the cell, using no ATP. Hexokinase immediately turns incoming glucose into glucose-6-phosphate, which keeps the gradient going and traps the sugar inside.',
        facts: ['K<sub>m</sub> ≈ 1–3 mM.', 'Glucose in the alveolar lining fluid is only ~0.4 mM, more than 10× lower than in blood (~5 mM) — which also helps to starve microbes in the airways.', 'Activated macrophages put more GLUT1 on their surface; HIF-1α is one of the transcription factors that drive it.'],
        game: 'Import runs by itself (transporters never need a click); <i>HIF1A</i> makes it faster.', live: () => [['Glucose in cytosol', S.glc], ['Imported so far', S.stats.imp]] } });
    memb('glut1', 150);

    mk({ id: 'mct4', name: 'Lactate export: LDHA + MCT4', short: 'MCT4', r: .9,
      draw(c, s) { D.transporter(c, s.x, s.y, s.ma, .85, '#d6a2ff', S.pyr > 2); },
      info: { title: 'Lactate dehydrogenase A + MCT4', sub: 'Cytosol → plasma membrane (genes LDHA, SLC16A3)', body: 'When pyruvate is made faster than mitochondria can take it, lactate dehydrogenase A reduces it to lactate (regenerating NAD⁺ for glycolysis), and monocarboxylate transporters (MCT1, MCT4) export the lactate together with a proton.',
        facts: ['Human cells make lactate, not ethanol: they have no pyruvate decarboxylase.', 'MCT4 is a classic HIF-1α target gene.', 'Lactate in inflamed tissue is not just waste: it can dampen inflammatory signalling and favours a repair-type macrophage state.'],
        live: () => [['Lactate exported', S.stats.lac], ['Pyruvate waiting', S.pyr]] } });
    memb('mct4', 112);

    mk({ id: 'ifngr', name: 'IFN-γ receptor (IFNGR1/2 · JAK1/2)', short: 'IFNGR', r: .9,
      draw(c, s) {
        for (const d of [-2.2, 2.2]) { const a = s.ma + U.deg(d), p = mp(a); D.receptor(c, p.x, p.y, a, .9, '#9ad0ff', S.ifn && !S.act); const q = mp(a, -.95); D.circle(c, q.x, q.y, .22, S.act ? '#ffe14d' : '#ffd166', 'rgba(0,0,0,.4)', g.px); }
      },
      ready: () => S.ifn && !S.act && !S.ifnBusy,
      onClick(s) {
        if (!S.ifn || S.act || S.ifnBusy) { if (!S.ifn) g.floatText(s.x, s.y - 1.3, 'No IFN-γ yet — a T cell must see your HLA-DR peptides', '#cbd5e1'); return; }
        S.ifnBusy = true; const N = nucPt(U.deg(265), .9), a = mp(s.ma, -1.2);
        cascade(s, [{ x: a.x, y: a.y, name: 'IFN-γ dimer binds IFNGR1/2' }, { x: 3.6, y: -7.4, name: 'JAK1 + JAK2 activate' }, { x: 4.0, y: -6.0, name: 'STAT1 pY701' }, { x: 4.4, y: -4.3, name: 'STAT1 homodimer (GAF)' }, { x: N.x, y: N.y, name: 'GAS: CIITA · IRF1 · CYBB…' }], '#9ad0ff', () => {
          S.act = true; S.ifnBusy = false; g.learn('m_ifng');
          g.banner({ title: 'Classically activated!', text: 'STAT1 switches on CIITA (more HLA-DR), CYBB (more NOX2), IRF1, guanylate-binding proteins and autophagy. Faster killing — and blocked phagosomes can now mature.', kind: 'good', dur: 9 });
        });
      },
      info: { title: 'IFN-γ receptor → JAK1/JAK2 → STAT1', sub: 'Plasma membrane · cytokine receptor', body: 'IFN-γ is a dimer that brings together two IFNGR1 and two IFNGR2 chains. JAK1 (on IFNGR1) and JAK2 (on IFNGR2) phosphorylate each other and the receptor; STAT1 docks, is phosphorylated on tyrosine 701, forms a homodimer ("GAF") and enters the nucleus, where it binds GAS DNA elements.',
        facts: ['Targets include <i>CIITA</i> (master switch of MHC class II), <i>IRF1</i>, <i>CYBB</i> (NOX2), guanylate-binding proteins and autophagy genes.', 'People with inherited defects in IFNGR1, IFNGR2 or STAT1 get severe infections with normally harmless mycobacteria (e.g. the BCG vaccine) — "Mendelian susceptibility to mycobacterial disease".', 'In mouse macrophages IFN-γ strongly induces iNOS (NOS2) and nitric oxide; human macrophages make much less NO and rely more on other mechanisms, such as the vitamin D–cathelicidin pathway.'],
        live: () => [['IFN-γ bound', S.ifn ? 'yes' : 'no'], ['STAT1', S.act ? 'active (activated macrophage)' : 'inactive']] } });
    memb('ifngr', 292);

    mk({ id: 'pres', name: 'HLA-DR–peptide on the surface', short: 'HLA-DR', r: 1.0,
      draw(c, s) {
        const n = Math.max(2, Math.min(12, S.pmhc + 2));
        for (let i = 0; i < n; i++) { const a = s.ma + U.deg((i - (n - 1) / 2) * 2.3), p = mp(a); drawHLA(c, p.x, p.y, a, .85, i < S.pmhc); }
      },
      badge: () => S.pmhc ? S.pmhc + ' shown' : '', badgeColor: '#ffb3e6',
      info: { title: 'Peptide–HLA-DR on the cell surface', sub: 'Plasma membrane · antigen presentation', body: 'Loaded HLA-DR molecules display bacterial peptides to CD4⁺ helper T cells. A T cell whose receptor (TCR) fits the peptide–HLA combination binds, CD4 grips the HLA-DR β2 domain, and an immunological synapse forms. In tissues, macrophages mostly talk to <b>effector or memory</b> T cells that were primed earlier by dendritic cells in a lymph node.',
        facts: ['A macrophage carries tens of thousands to ~100,000 HLA class II molecules.', 'A T cell can respond to as few as ~1–10 matching peptide–MHC complexes among a sea of self-peptides.', 'Help flows back: the T cell answers with IFN-γ and CD40 ligand, which activate the macrophage.'],
        game: 'Four complexes are required here before a T cell responds. Its peptide specificity is not modelled.', live: () => [['Complexes displayed', S.pmhc], ['T cell', S.tc ? (S.tc.stage === 'syn' ? 'in synapse' : 'approaching') : 'not yet']] } });
    memb('pres', 266);

    /* ---------------- phagocytosis line inside the cell ---------------- */
    mk({ id: 'cup', name: 'Phagocytic cup: actin · Arp2/3 · WASP · PI3K', short: 'Actin cup', r: 1.0,
      draw(c, s) {
        const on = S.phs.some(P => P.stage === 'cup'), a0 = s.ma;
        c.strokeStyle = on ? 'rgba(255,120,140,.85)' : 'rgba(255,120,140,.35)'; c.lineWidth = .09;
        for (let i = 0; i < 7; i++) {
          const a = a0 + U.deg((i - 3) * 9), p = mp(a, -.25), q = mp(a, -1.5 - (i % 2) * .4);
          c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(p.x, p.y); c.stroke();
          const m = { x: U.lerp(q.x, p.x, .5), y: U.lerp(q.y, p.y, .5) }, b = a + Math.PI + (i % 2 ? 1.22 : -1.22);    // Arp2/3 branches at ~70°
          c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(m.x - Math.cos(b) * .5, m.y - Math.sin(b) * .5); c.stroke();
        }
      },
      info: { title: 'Phagocytic cup', sub: 'Cortex under the membrane · actin, Arp2/3, WASP, PI3-kinase', body: 'Receptor signalling (for FcγR: Src kinases → Syk; then PI3-kinase and the GTPases Cdc42 and Rac) activates WASP and WAVE, which switch on the <b>Arp2/3 complex</b>. Arp2/3 starts new actin filaments as ~70° branches on existing ones; the growing meshwork pushes the membrane out as pseudopods that flow around the bacterium and fuse at the far side, sealing it into a <b>phagosome</b>.',
        facts: ['Every actin subunit carries one ATP, hydrolysed after it joins a filament — protrusion runs on ATP.', 'PI3-kinase is needed to close cups around large particles: blocked with wortmannin, cups stall half-open.', 'WASP (gene <i>WAS</i>) is only made in blood cells; its loss causes Wiskott–Aldrich syndrome.', 'Closing a cup takes about one to a few minutes.'],
        game: '5 ATP per engulfment is a game value; the real cost scales with particle size.',
        live: () => [['Cup', S.phs.some(P => P.stage === 'cup') ? 'closing' : S.phs.some(P => P.stage === 'bound') ? 'bacterium bound — ready' : 'empty'], ['Automatic', lv('WAS') >= 2 ? 'yes' : 'no']] } });
    memb('cup', 182, -1.1);
    pipe(st.cup, { wait: 'bound', run: 'cup', none: 'Nothing bound yet — use the receptors', auto: () => lv('WAS') >= 2,
      can: () => res('atp') >= 5 ? true : 'Needs 5 ATP (actin polymerisation)', pay: (P, man) => { g.res.add('atp', -5); if (man) g.floatText(st.cup.x, st.cup.y - 1.4, '−5 ATP', '#ff9a9a'); },
      dur: () => lv('WAS') >= 3 ? 1.3 : 2.2,
      finish(P) { P.stage = 'early'; P.rab = 5; P.pH = 7.2; P.sp = 3.5; toZone(P, 'nox'); S.stats.engulf++; g.ring(P.x, P.y, '#8fd3ff', .5, 2.4, .6); g.floatText(P.x, P.y - 1.3, 'phagosome sealed', '#8fd3ff'); } });

    mk({ id: 'nox', name: 'NOX2 — respiratory burst', short: 'NOX2', x: ZONE.nox.x, y: ZONE.nox.y, r: 1.2,
      draw(c, s) {
        c.setLineDash([.3, .3]); D.circle(c, s.x, s.y, 1.25, null, 'rgba(255,240,160,.25)', .06); c.setLineDash([]);
        const x = s.x - 1.5, y = s.y - 1.7, on = S.phs.some(P => P.stage === 'burst');
        D.bilayer(c, cc => cc.arc(x, y + 2, 2, U.deg(240), U.deg(300)), .18, '#bfe6ff');
        D.pump(c, x, y, -Math.PI / 2, .5, '#ffd166');
        const k = on ? 0 : .5;
        D.circle(c, x - .45 - k, y + .45 + k * .6, .17, '#ff9d5c'); D.circle(c, x + .45 + k, y + .45 + k * .6, .17, '#ffb3e6'); D.circle(c, x, y + .6 + k, .13, '#7ee787');
        if (on) D.glow(c, x, y - .2, .9, '#fff6a0', .6);
      },
      info: { title: 'NOX2 — the respiratory burst', sub: 'Phagosome membrane · NADPH oxidase', body: 'The membrane part, flavocytochrome b<sub>558</sub> (gp91<sup>phox</sup> = NOX2 from <i>CYBB</i>, plus p22<sup>phox</sup>), sits in the phagosome membrane. On activation the cytosolic subunits p47<sup>phox</sup>, p67<sup>phox</sup>, p40<sup>phox</sup> and the GTPase Rac join it. Electrons from cytosolic NADPH pass through FAD and two hemes across the membrane to O₂ inside the phagosome, making <b>superoxide</b> (O₂•⁻).',
        facts: ['NADPH + 2 O₂ → NADP⁺ + 2 O₂•⁻ + H⁺.', 'Superoxide dismutates to hydrogen peroxide. Neutrophils turn H₂O₂ into hypochlorous acid (bleach) with myeloperoxidase; mature tissue macrophages have little myeloperoxidase.', 'A "respiratory burst" because O₂ uptake jumps — but it is not mitochondrial respiration and is insensitive to cyanide.', 'Chronic granulomatous disease: defective NOX2 (about two-thirds of cases are X-linked <i>CYBB</i> mutations) causes recurrent severe bacterial and fungal infections.'],
        game: 'Here the burst kills E. coli and pneumococci outright. Really, oxidants, acid, proteases and antimicrobial peptides act together.',
        live: () => [['Waiting phagosomes', S.phs.filter(P => P.stage === 'early').length], ['Superoxide made', S.stats.nadph * 2 + ' tokens'], ['Automatic', lv('CYBB') >= 2 ? 'yes' : 'no']] } });
    pipe(st.nox, { wait: 'early', run: 'burst', none: 'No fresh phagosome here', auto: () => lv('CYBB') >= 2,
      can: () => res('nadph') >= 2 ? true : 'Needs 2 NADPH — run the pentose-phosphate pathway',
      pay: () => { g.res.add('nadph', -2); S.stats.nadph += 2; },
      dur: () => S.act || lv('CYBB') >= 3 ? .9 : 1.6,
      start(P) { g.floatText(P.x, P.y - 1.3, '2 NADPH → 4 O₂•⁻', '#fff6a0'); },
      finish(P) {
        S.stats.burst++; g.learn('m_burst');
        if (P.kind !== 'mtb') { P.alive = false; S.stats.kills++; g.floatText(P.x, P.y - 1.3, 'killed by oxidants', '#fff6a0'); }
        else g.floatText(P.x, P.y - 1.3, 'Mtb survives (KatG, SodA/C)', '#ffcfa0');
        P.pH = 6.5; P.stage = 'wmat'; toZone(P, 'mat');
      } });

    mk({ id: 'vat', name: 'Maturation: Rab5 → Rab7 + V-ATPase', short: 'V-ATPase', x: ZONE.mat.x, y: ZONE.mat.y, r: 1.2,
      draw(c, s) {
        c.setLineDash([.3, .3]); D.circle(c, s.x, s.y, 1.25, null, 'rgba(140,220,255,.25)', .06); c.setLineDash([]);
        s.spin = (s.spin || 0) + (S.phs.some(P => P.stage === 'mat') ? g.dt * 10 : 0);
        vatIcon(c, s.x - 1.8, s.y - 1.4, .7, s.spin);
      },
      info: { title: 'Phagosome maturation', sub: 'Rab5 → Rab7 · V-ATPase acidification', body: 'A fresh phagosome behaves like an early endosome: it carries the GTPase <b>Rab5</b>, which recruits the lipid kinase VPS34 (making PI(3)P) and the tether EEA1. Within minutes Rab5 is replaced by <b>Rab7</b> ("Rab conversion"), the phagosome travels along microtubules towards the cell centre, and <b>V-ATPase</b> pumps protons in.',
        facts: ['V-ATPase is a rotary motor related to ATP synthase but working as a pump: ATP hydrolysis in the V1 head turns the V0 ring, moving roughly 2–4 H⁺ into the lumen per ATP.', 'pH falls from ~7 to ~6 (early phagosome) and to ~5 or below (late phagosome / phagolysosome, ~4.5–5).', 'Rab7 and its effector RILP hook the phagosome to dynein, which carries it towards the microtubule-organising centre.', '<i>M. tuberculosis</i> blocks this step: its phagosome keeps Rab5 but never gains Rab7 or much V-ATPase.'],
        game: 'Compressed into seconds; in reality ~10–30 minutes.',
        live: () => [['Waiting', S.phs.filter(P => P.stage === 'wmat' && !P.stuck).length], ['Arrested (Mtb)', S.phs.filter(P => P.stuck && P.stage === 'wmat').length], ['Automatic', lv('ATP6V1A') >= 2 ? 'yes' : 'no']] } });
    pipe(st.vat, { wait: 'wmat', run: 'mat', none: 'No phagosome waiting to mature', auto: () => lv('ATP6V1A') >= 2,
      blocked: P => P.kind === 'mtb' && !S.act, blockMsg: 'Blocked by M. tuberculosis (PtpA · SapM) — needs IFN-γ activation',
      can: () => res('atp') >= 4 ? true : 'Needs 4 ATP (proton pumping)', pay: (P, man) => { g.res.add('atp', -4); if (man) g.floatText(st.vat.x, st.vat.y - 1.4, '−4 ATP', '#ff9a9a'); },
      dur: P => P.kind === 'mtb' ? 4 : lv('ATP6V1A') >= 2 ? 2 : 3,
      start(P) { if (P.kind === 'mtb') g.floatText(P.x, P.y - 1.3, 'IFN-γ: autophagy (IRGM) overrides the block', '#9ad0ff'); },
      tick(P, p) { P.pH = U.lerp(P.stuck ? 6.4 : 6.5, 5.2, p); P.rab = p > .5 ? 7 : 5; },
      finish(P) { P.stage = 'late'; P.rab = 7; P.stuck = false; toZone(P, 'lys'); S.stats.mat++; g.learn('m_mature'); } });

    mk({ id: 'lyso', name: 'Lysosomes: fusion & digestion', short: 'Lysosomes', x: ZONE.lys.x, y: ZONE.lys.y, r: 1.3,
      draw(c, s) {
        c.setLineDash([.3, .3]); D.circle(c, s.x, s.y, 1.35, null, 'rgba(255,93,143,.3)', .06); c.setLineDash([]);
        const on = S.phs.some(P => P.stage === 'fuse');
        [[-1.9, 1.5, .4], [-1.3, 2.1, .3], [1.9, 1.7, .35], [2.6, 1.0, .28]].forEach(l => { D.glow(c, s.x + l[0], s.y + l[1], l[2] * 2.2, '#ff5d8f', on ? .5 : .3); D.circle(c, s.x + l[0], s.y + l[1], l[2], 'rgba(255,93,143,.55)', '#ff9ab8', 1.2 * g.px); });
      },
      info: { title: 'Lysosomes and the phagolysosome', sub: 'Acidic digestive organelles (pH ~4.5–5)', body: 'Lysosomes are small acidic sacs holding about 60 kinds of hydrolase. Rab7, the HOPS tethering complex and SNARE proteins fuse them with the late phagosome. <b>Cathepsins</b> (proteases such as cathepsin D, B, L and S), <b>lysozyme</b>, lipases and nucleases then take the bacterium apart; amino acids, sugars and nucleotides are exported to the cytosol and reused.',
        facts: ['A macrophage contains hundreds of lysosomes.', 'LAMP1 and LAMP2 make up a large share of lysosomal membrane protein; their dense sugar coat shields the membrane from its own enzymes.', 'Lysozyme cuts bacterial peptidoglycan; macrophages secrete lots of it (Alexander Fleming described lysozyme in 1922, before penicillin).', 'Most lysosomal enzymes are tagged with mannose-6-phosphate in the Golgi, which routes them to lysosomes.'],
        game: 'Each digested bacterium returns amino acids and one antigen peptide for MHC class II.',
        live: () => [['Waiting', S.phs.filter(P => P.stage === 'late').length], ['Digested so far', S.stats.digest], ['Automatic', lv('CTSD') >= 2 ? 'yes' : 'no']] } });
    pipe(st.lyso, { wait: 'late', run: 'fuse', none: 'No late phagosome here yet', auto: () => lv('CTSD') >= 2,
      can: () => res('atp') >= 1 ? true : 'Needs 1 ATP', pay: () => g.res.add('atp', -1),
      dur: () => lv('CTSD') >= 2 ? 2 : 3,
      start(P) {
        P.lamp = true;
        for (let i = 0; i < 3; i++) { const a = U.rand(TAU), t = g.token({ x: P.x + Math.cos(a) * 2.6, y: P.y + Math.sin(a) * 2.6, draw: (c, t) => D.circle(c, t.x, t.y, .3, 'rgba(255,93,143,.7)', '#ff9ab8', g.px) }); t.to(P, .6).fade(.2).die(); }
      },
      tick(P, p) { P.pH = U.lerp(5.2, 4.6, p); P.dig = p; },
      finish(P) {
        if (P.alive) { P.alive = false; S.stats.kills++; }
        if (P.kind === 'mtb') { S.mtbKilled = true; g.banner({ title: 'M. tuberculosis destroyed', text: 'Acid, cathepsins and antimicrobial peptides such as cathelicidin (LL-37) finished it off — possible only after IFN-γ activation.', kind: 'good', dur: 7 }); }
        g.res.add('aa', P.kind === 'ecoli' ? 5 : 3, { x: P.x, y: P.y - 1 }); S.stats.digest++;
        const pt = g.token({ x: P.x, y: P.y, draw: (c, t) => { D.vesicle(c, t.x, t.y, .32, '#ff9ab8'); D.circle(c, t.x, t.y, .1, '#ff5d8f'); } });
        pt.to(st.miic, 1.5).then(() => { S.pep++; }).die();
        P.stage = 'gone'; P.fade = 1;
      } });

    mk({ id: 'miic', name: 'MIIC: loading peptides onto HLA-DR', short: 'MIIC', x: -.6, y: -5.4, r: 1.0,
      draw(c, s) {
        D.circle(c, s.x, s.y, .85, 'rgba(255,179,230,.12)', '#ffb3e6', 2 * g.px);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .4; D.circle(c, s.x + Math.cos(a) * .45, s.y + Math.sin(a) * .45, .17, null, 'rgba(255,179,230,.7)', g.px); }
        for (let i = 0; i < Math.min(S.pep, 6); i++) D.circle(c, s.x - .5 + i * .2, s.y + 1.15, .08, '#ff5d8f');
      },
      badge: () => S.pep || '', badgeColor: '#ff5d8f',
      info: { title: 'MIIC — MHC class II compartment', sub: 'Late endosome / multivesicular body', body: 'HLA-DR α and β chains are made in the ER together with the <b>invariant chain</b> (CD74), which plugs their peptide groove and steers them to this multivesicular compartment. Cathepsins (notably cathepsin S) trim the invariant chain down to a short fragment, <b>CLIP</b>. The chaperone <b>HLA-DM</b> then swaps CLIP for a peptide from the digested bacterium, and the loaded molecule travels to the cell surface.',
        facts: ['Class II peptides are about 13–25 amino acids long and hang out of both ends of the open groove.', 'HLA-DRA barely varies between people, but HLA-DRB1 has thousands of known alleles — so each person presents a different selection of peptides.', 'Class II mostly shows peptides from material taken up from <i>outside</i>; class I mostly shows peptides from proteins made inside the cell (autophagy and cross-presentation blur the line).'],
        game: 'One digested bacterium yields one peptide token; in reality thousands of different peptides are generated.',
        live: () => [['Peptides waiting', S.pep], ['Loaded so far', S.stats.loaded]] } });
    proc(st.miic, { cap: () => 1, time: () => lv('HLA') >= 2 ? 1.2 : 1.8, auto: () => lv('HLA') >= 2,
      can: () => S.pep < 1 ? 'No peptides yet — digest a bacterium first' : true,
      start(j) { S.pep--; if (j.manual) g.floatText(st.miic.x, st.miic.y - 1.3, 'CLIP → peptide (HLA-DM)', '#ffb3e6'); },
      finish() {
        S.stats.loaded++; g.learn('m_mhc');
        const t = g.token({ x: st.miic.x, y: st.miic.y, draw: (c, t) => { D.vesicle(c, t.x, t.y, .32, '#ffb3e6'); D.circle(c, t.x, t.y, .1, '#ff5d8f'); } });
        t.to(st.pres, 1.4).then(() => { S.pmhc = Math.min(12, S.pmhc + 1); S.stats.presented++; g.ring(st.pres.x, st.pres.y, '#ffb3e6', .3, 1.8, .6); }).die();
      } });

    /* ---------------- energy ---------------- */
    mk({ id: 'glyco', name: 'Glycolysis (10 enzymes)', short: 'Glycolysis', x: (LANE.x1 + LANE.x2) / 2, y: (LANE.y1 + LANE.y2) / 2, r: 1.4, labelDy: 14,
      draw(c, s) {
        c.strokeStyle = 'rgba(124,252,138,.15)'; c.lineWidth = .6; c.beginPath(); c.moveTo(LANE.x1, LANE.y1); c.lineTo(LANE.x2, LANE.y2); c.stroke();
        for (let i = 0; i < 10; i++) {
          const p = i / 9, x = U.lerp(LANE.x1, LANE.x2, p), y = U.lerp(LANE.y1, LANE.y2, p), act = s.jobs.some(j => Math.abs(j.t / j.dur - p) < .07);
          D.ellipse(c, x, y, .17, .25, .4, act ? '#eaffea' : (i === 0 || i === 2 ? '#e59866' : i === 6 || i === 9 ? '#ffe14d' : '#58b98a'), 'rgba(0,0,0,.4)', g.px);
          if (g.cam.z > 3.2) g.label(GLY[i], x, y + (i % 2 ? .55 : -.55), { size: 9, color: '#bfe8cf' });
        }
        for (const j of s.jobs) { const p = j.t / j.dur, x = U.lerp(LANE.x1, LANE.x2, p), y = U.lerp(LANE.y1, LANE.y2, p); if (p < .38) D.glucose(c, x, y, .26, 0); else { D.pyruvate(c, x, y - .25, .22, p * 6); D.pyruvate(c, x, y + .25, .22, p * 6 + 1); } }
        for (let i = 0; i < S.glc; i++) D.glucose(c, GLC_PILE.x + (i % 3) * .5 - .5, GLC_PILE.y + (i / 3 | 0) * .5, .22, 0);
        for (let i = 0; i < Math.min(S.pyr, 8); i++) D.pyruvate(c, PYR_PILE.x + (i % 4) * .42 - .6, PYR_PILE.y + (i / 4 | 0) * .42, .2, .5);
      },
      badge: () => S.glc || '', badgeColor: '#7CFC8A',
      info: { title: 'Glycolysis', sub: 'Cytosol · 10 enzymes · glucose → 2 pyruvate', body: 'The same ten steps as in yeast, with human isoforms. Two ATP are invested (hexokinase, phosphofructokinase), the sugar is split, and four ATP are paid back. Activated macrophages lean heavily on glycolysis — it is fast and also feeds the pentose-phosphate pathway.',
        facts: ['Net: <b>+2 ATP, +2 NADH, 2 pyruvate</b> per glucose.', 'Order: ' + GLY.join(' → '), 'Activated macrophages switch on HK2, PFKFB3 and the PKM2 splice form of pyruvate kinase (gene <i>PKM</i>); PKM2 can also enter the nucleus and help HIF-1α activate genes.', 'NAD⁺ is regenerated by mitochondria or by lactate dehydrogenase (LDHA).'],
        game: 'NAD⁺ bookkeeping is left out in this level — you mastered it in yeast. Zoom in to read the enzyme names.',
        live: () => [['Glucose waiting', S.glc], ['Pyruvate waiting', S.pyr], ['Automatic', lv('HIF1A') ? 'yes (HIF-1α)' : 'no']] } });
    proc(st.glyco, { noRing: true, cap: () => lv('HIF1A') ? 2 : 1, time: () => lv('HIF1A') ? 1.0 : 1.5, auto: () => lv('HIF1A') >= 1,
      autoCan: () => S.pyr < 4 && (lv('G6PD') < 2 || res('nadph') >= 6 || S.glc >= 2),
      can: () => S.glc < 1 ? 'No glucose yet — GLUT1 is importing' : res('atp') < 2 ? 'Needs 2 ATP to prime the sugar' : true,
      start(j) { S.glc--; g.res.add('atp', -2); j.paid = 0; if (j.manual) g.floatText(st.glyco.x - 1.2, st.glyco.y - 1.2, '−2 ATP (investment)', '#ff9a9a'); g.learn('m_metab'); },
      tick(j) { if (j.t / j.dur >= .66 && !j.paid) { j.paid = 1; atpPop({ x: U.lerp(LANE.x1, LANE.x2, .66), y: U.lerp(LANE.y1, LANE.y2, .66) }, 2); } },
      finish() { atpPop({ x: LANE.x2, y: LANE.y2 }, 2); S.pyr += 2; S.stats.glyco++; } });
    { const r = st.glyco.ready; st.glyco.ready = () => (g.obj.i >= OI('fuel') || res('atp') < 10) && r(); }

    mk({ id: 'ppp', name: 'Pentose-phosphate pathway (G6PD · PGD)', short: 'PPP', x: -6.7, y: 2.9, r: .9,
      draw(c, s) {
        const pts = [[-.6, .45], [0, 0], [.6, -.45]], cols = ['#6ec6ff', '#58b98a', '#6ec6ff'];
        pts.forEach((p, i) => D.ellipse(c, s.x + p[0], s.y + p[1], .16, .23, .6, s.jobs.length ? '#dff4ff' : cols[i], 'rgba(0,0,0,.4)', g.px));
        for (const j of s.jobs) { const p = j.t / j.dur; D.glucose(c, s.x - .6 + 1.2 * p, s.y + .45 - .9 * p, .2, 0); }
        if (g.cam.z > 3.2) ['G6PD', 'PGLS', 'PGD'].forEach((n, i) => g.label(n, s.x + pts[i][0] + .55, s.y + pts[i][1] + .3, { size: 9, color: '#bfe2ff', align: 'left' }));
      },
      info: { title: 'Pentose-phosphate pathway (oxidative branch)', sub: 'Cytosol · NADPH factory', body: 'G6PD and 6-phosphogluconate dehydrogenase (PGD), with the lactonase PGLS between them, oxidise glucose-6-phosphate to ribulose-5-phosphate and CO₂, loading electrons onto NADP⁺.',
        facts: ['Glucose-6-P + 2 NADP⁺ → ribulose-5-P + CO₂ + 2 NADPH.', 'NADPH feeds NOX2 — and glutathione and thioredoxin, which protect the macrophage from its own oxidants.', 'G6PD deficiency affects roughly 400 million people (it protects against malaria); only the most severe forms weaken the respiratory burst.', 'The non-oxidative branch can return ribulose-5-phosphate carbon to glycolysis.'],
        game: 'Costs 1 glucose + 1 ATP (hexokinase) → 2 NADPH; recycled carbon is not tracked.',
        live: () => [['NADPH', Math.floor(res('nadph')) + ' / ' + g.res.cap('nadph')], ['Automatic', lv('G6PD') >= 2 ? 'yes' : 'no']] } });
    proc(st.ppp, { cap: () => 1, time: () => 1.3, auto: () => lv('G6PD') >= 2, autoCan: () => res('nadph') <= g.res.cap('nadph') - 4,
      can: () => S.glc < 1 ? 'No glucose yet — GLUT1 is importing' : res('atp') < 1 ? 'Needs 1 ATP (hexokinase)' : res('nadph') > g.res.cap('nadph') - 2 ? 'NADPH pool is full' : true,
      start() { S.glc--; g.res.add('atp', -1); },
      finish() { g.res.add('nadph', 2, { x: st.ppp.x, y: st.ppp.y - 1 }); S.stats.ppp++; g.learn('m_burst'); const t = g.token({ x: st.ppp.x, y: st.ppp.y, draw: (c, t) => D.bubble(c, t.x, t.y, .2) }); t.to(st.ppp.x - 2, st.ppp.y - 2.5, 1.8).fade(.4).die(); } });
    { const r = st.ppp.ready; st.ppp.ready = () => (g.obj.i >= OI('fuel') || res('nadph') < 2) && r(); }

    mk({ id: 'mito', name: 'Mitochondria: oxidative phosphorylation', short: 'Mitochondria', x: 4.6, y: 6.6, r: 1.3,
      draw(c, s) { if (s.jobs.length) D.glow(c, s.x, s.y, 1.8, '#ff9d5c', .35); },
      info: () => ({ title: 'Mitochondria', sub: 'Tubular network · respiration', body: 'Pyruvate enters, becomes acetyl-CoA and is burned to CO₂ in the TCA cycle. The electrons pass along Complexes I–IV to oxygen while protons are pumped out, and ATP synthase turns the proton flow back into ATP.',
        facts: ['Human cells get roughly <b>30–32 ATP per glucose</b> (2 from glycolysis + ~28 here) — about twice yeast, partly because human mitochondria have the proton-pumping Complex I.', 'In LPS-activated macrophages the TCA cycle is rewired: citrate is diverted into the antimicrobial metabolite itaconate (enzyme ACOD1/IRG1) and succinate builds up, stabilising HIF-1α. This is most pronounced in mouse macrophages.', 'Alveolar macrophages rely more on oxidative phosphorylation, and less on glycolysis, than most other macrophages.'],
        game: 'Each pyruvate → 14 ATP after ~3 s, one at a time. When tissue damage makes the alveolus hypoxic, respiration runs at less than half speed.',
        live: () => [['Respiring', st.mito.jobs.length ? 'yes' : 'idle'], ['Pyruvate waiting', S.pyr], ['O₂ supply', S.hypoxia ? 'low (hypoxia)' : 'normal']] }) });
    proc(st.mito, { cap: () => 1, time: () => 3.0, rate: () => S.hypoxia ? .45 : 1, auto: () => true,
      can: () => S.pyr < 1 ? 'No pyruvate — run glycolysis first' : true,
      start() { S.pyr--; fly(dPyr, PYR_PILE, st.mito, .8); },
      finish() { atpPop(st.mito, 14); } });
    st.mito.ready = () => false;

    /* ---------------- organelles and other machines ---------------- */
    mk({ id: 'prot', name: '26S proteasome', short: 'Proteasome', x: -4.6, y: -4.2, r: .7,
      draw(c, s) { s.flash = Math.max(0, (s.flash || 0) - g.dt); D.proteasome(c, s.x, s.y, .55, .4, s.flash > 0); },
      info: { title: '26S proteasome', sub: 'Cytosol & nucleus · protein shredder', body: 'In the NF-κB pathway, IKKβ phosphorylates IκBα on serines 32 and 36; the SCF<sup>β-TrCP</sup> ubiquitin ligase then tags it with K48-linked ubiquitin and the proteasome destroys it within minutes, freeing NF-κB (p65/p50) to enter the nucleus.',
        facts: ['The same machine as in yeast — conserved across all eukaryotes.', 'Proteasomes also produce the peptides that MHC class I presents (an IFN-γ-induced "immunoproteasome" variant specialises in this).'] } });
    mk({ id: 'er', name: 'Endoplasmic reticulum', short: 'ER', x: 6.4, y: -3.6, r: 1.0,
      draw(c, s) { D.ribosome(c, s.x, s.y, .38, S.erBusy > 0, .5); },
      info: { title: 'Endoplasmic reticulum (ER)', sub: 'Membrane and secreted proteins are made here', body: 'Ribosomes docked on the ER make the secreted cytokines (TNF, IL-6, CXCL8, IL-10), every membrane receptor, MHC class II and the lysosomal enzymes. The signal-recognition particle brings the ribosome to the Sec61 channel; the chain is threaded in, folded and glycosylated, then carried to the Golgi.',
        facts: ['TNF is made as a membrane-anchored precursor (pro-TNF, 26 kDa); at the cell surface the protease ADAM17 (TACE) releases the 17 kDa soluble form, which acts as a trimer.', 'IL-1β is the exception: it is made in the cytosol as inactive pro-IL-1β, skips the ER, and is released only after the NLRP3 inflammasome activates caspase-1 (and gasdermin D opens pores). Not modelled here.', 'Activated macrophages expand their ER to cope with the cytokine load.'] } });
    mk({ id: 'golgi', name: 'Golgi apparatus', short: 'Golgi', x: .4, y: -.8, r: .9, draw() {},
      info: { title: 'Golgi apparatus', sub: 'A ribbon of stacked cisternae around the centrosome', body: 'Unlike the scattered single cisternae of yeast, the human Golgi is a ribbon of stacks wrapped around the centrosome, here in the indentation of the nucleus. Cargo is glycosylated and sorted: secretory proteins to the plasma membrane, lysosomal enzymes (via mannose-6-phosphate receptors) to lysosomes, MHC class II (via the invariant chain) to the MIIC.',
        facts: ['A mammalian Golgi stack typically has ~4–8 cisternae.', 'Cytokines leave in small carriers within tens of minutes of synthesis; macrophages do not store TNF in granules.'] } });
    mk({ id: 'ctr', name: 'Centrosome (MTOC)', short: 'Centrosome', x: CTR.x, y: CTR.y, r: .5, noLabel: true, draw() {},
      info: { title: 'Centrosome — microtubule-organising centre', sub: 'Two centrioles + pericentriolar material', body: 'Nucleates the microtubules that radiate through the cell. Dynein motors carry maturing phagosomes and lysosomes inwards along them, which is why phagolysosomes gather near the nucleus; kinesins carry cargo outwards.',
        facts: ['Each centriole is a barrel of nine microtubule triplets, ~0.25 µm wide and ~0.5 µm long.', 'Yeast has no centrioles: its spindle pole body sits in the nuclear envelope.'] } });
    mk({ id: 'nuc', name: 'Nucleus', short: 'Nucleus', x: NUC.x, y: NUC.y, r: 3.0, noLabel: true, draw: drawNucleus,
      info: () => ({ title: 'Nucleus', sub: '46 chromosomes · ~20,000 protein-coding genes · oval, often indented', body: 'A macrophage nucleus is oval and often indented (kidney- or bean-shaped, as in its monocyte ancestors), with the centrosome and Golgi sitting in its indentation. Signals from the surface arrive as transcription factors — <b>NF-κB</b> from TLR4, <b>STAT1</b> from IFN-γ, <b>HIF-1α</b> — which enter through nuclear pores and switch on hundreds of genes.',
        facts: ['6.2 billion base pairs (diploid; 3.1 billion per chromosome set, ~250× the yeast genome); ~2 m of DNA packed into a nucleus ~8 µm long.', 'TNF mRNA appears within ~15–30 min of LPS. Many inflammatory mRNAs carry AU-rich elements that make them short-lived, so the response can stop quickly.', 'NF-κB re-induces its own inhibitor IκBα — negative feedback that makes NF-κB pulse in and out of the nucleus.'],
        live: () => [['NF-κB', S.nfkb ? 'in nucleus' : 'cytosolic'], ['STAT1', S.act ? 'in nucleus' : 'inactive'], ['Transcribing', S.tx ? S.tx.it.gene : '—'], ['Queued genes', S.txQ.length]] }) });
    mk({ id: 'tcell', name: 'CD4⁺ T helper cell (Th1)', short: 'T cell', x: 20, y: 14, r: 3.6, hidden: true, draw() {},
      info: { title: 'CD4⁺ effector T helper cell (Th1)', sub: 'Lymphocyte · ~7–10 µm', body: 'Primed earlier in a lymph node by a dendritic cell, this T cell left the blood to patrol inflamed tissue. When its T-cell receptor recognises a matching peptide on HLA-DR, it forms an immunological synapse and delivers IFN-γ and CD40 ligand directly to the macrophage.',
        facts: ['The nucleus fills most of the cell — lymphocytes have little cytoplasm.', 'Losing CD4⁺ T cells (as in untreated HIV infection) makes tuberculosis far more likely to become active disease.', 'Macrophages are poor at priming naive T cells; that is the dendritic cells\' job.'],
        game: 'In a first-ever infection, effector Th1 cells reach the lung only after about a week (about three weeks or more for tuberculosis); here assume an earlier encounter left memory cells. T cells are drawn in by chemokines, not by peptide–HLA itself — the game simply sends one once you display four complexes.' } });

    /* ---------------- station labels: placed by the level so close neighbours never collide ---------------- */
    const out = (id, off, dx) => () => { const s = st[id], p = mp(s.ma, off), k = Math.cos(s.ma); return { x: p.x + (dx || 0), y: p.y, align: k < -.35 ? 'right' : k > .35 ? 'left' : 'center' }; };
    const at = (id, dx, dy, align) => () => ({ x: st[id].x + dx, y: st[id].y + dy, align: align || 'center' });
    const LBL = { recog: [out('recog', 1.85), 80], tlr4: [out('tlr4', 2.2), 78], cup: [() => { const p = mp(U.deg(174), 1.25); return { x: p.x, y: p.y + .35, align: 'right' }; }, 79],
      glut1: [out('glut1', 1.5), 60], mct4: [out('mct4', 1.5), 58], ifngr: [out('ifngr', 1.75), 76], pres: [out('pres', 1.75, -1.6), 70],
      nox: [at('nox', -1.5, -2.75), 77], vat: [at('vat', -2.5, -1.0, 'right'), 77], lyso: [at('lyso', 3.4, 1.5, 'left'), 77], miic: [at('miic', 0, 1.45), 75],
      ppp: [at('ppp', 0, 1.0), 74], glyco: [() => ({ x: -4.3, y: 7.45, align: 'center' }), 74],
      prot: [at('prot', 0, 1.0), 40], golgi: [at('golgi', 0, -1.0), 38], er: [at('er', .8, -.1, 'left'), 36], mito: [at('mito', 0, 1.7), 42] };
    for (const id in LBL) { st[id].lab = LBL[id][0]; st[id].lp = LBL[id][1]; st[id].minor = LBL[id][1] < 50; }
    for (const s of g.stations) s.noLabel = true;

    /* ---------------- genes ---------------- */
    const cost = (a, b) => l => ({ atp: a[l], aa: b[l] });
    const auto = (first, more) => l => l === 2 ? first : more;
    const nf = () => S.nfkb ? true : 'Induced by NF-κB — relay the TLR4 signal first';
    const early = () => g.obj.i >= OI('mop') ? true : 'Finish the guided steps first';
    g.shop.add({ id: 'MARCO', gene: 'MARCO', title: 'Scavenger receptor MARCO', group: 'Phagocytosis line', max: 2, level: 1, er: true, dest: 'recog', col: '#7ad7ff', req: early, cost: cost([0, 0, 40], [0, 0, 12]),
      desc: () => 'More scavenger receptors: the macrophage grabs nearby bacteria <b>by itself</b>.', onBuy: express });
    g.shop.add({ id: 'WAS', gene: 'WAS · ACTR2/3', title: 'WASP + Arp2/3 complex', group: 'Phagocytosis line', max: 3, level: 1, dest: 'cup', col: '#ff8ca0', req: early, cost: cost([0, 0, 40, 70], [0, 0, 12, 18]),
      desc: auto('Enough actin machinery that bound bacteria are engulfed <b>automatically</b>.', 'More Arp2/3: cups close in ~1 s instead of 2.'), onBuy: express });
    g.shop.add({ id: 'CYBB', gene: 'CYBB (NOX2)', title: 'NADPH oxidase gp91phox', group: 'Phagocytosis line', max: 3, level: 1, er: true, dest: 'nox', col: '#ffd166', req: early, cost: cost([0, 0, 40, 70], [0, 0, 12, 18]),
      req: () => lv('CYBB') + g.shop.by.CYBB.pending >= 2 && !S.act ? 'Further induced by IFN-γ (STAT1)' : early(),
      desc: auto('More NOX2 in phagosome membranes: the oxidative burst fires <b>automatically</b> (2 NADPH each).', 'IFN-γ-boosted NOX2: faster bursts.'), onBuy: express });
    g.shop.add({ id: 'ATP6V1A', gene: 'ATP6V1A', title: 'V-ATPase catalytic subunit', group: 'Phagocytosis line', max: 2, level: 1, dest: 'vat', col: '#5ab8e0', req: early, cost: cost([0, 0, 40], [0, 0, 12]),
      desc: () => 'More proton pumps: phagosomes acidify and mature <b>automatically</b> (4 ATP each).', onBuy: express });
    g.shop.add({ id: 'CTSD', gene: 'CTSD · LAMP1', title: 'Lysosome genes (TFEB targets)', group: 'Phagocytosis line', max: 2, level: 1, er: true, dest: 'lyso', col: '#ff5d8f', req: early, cost: cost([0, 0, 45], [0, 0, 14]),
      desc: () => 'More lysosomes and cathepsins: late phagosomes fuse and digest <b>automatically</b>.', onBuy: express });
    g.shop.add({ id: 'HLA', gene: 'HLA-DRA · CD74', title: 'MHC class II + invariant chain', group: 'Phagocytosis line', max: 2, level: 1, er: true, dest: 'miic', col: '#ffb3e6', req: early, cost: cost([0, 0, 40], [0, 0, 12]),
      desc: () => 'More HLA-DR: peptides are loaded and presented <b>automatically</b>.', onBuy: express });
    g.shop.add({ id: 'FCGR', gene: 'FCGR2A', title: 'Fcγ receptor IIA (CD32A)', group: 'Phagocytosis line', max: 1, level: 0, er: true, dest: 'recog', col: '#ffb3e6', req: early, cost: cost([0, 40], [0, 12]),
      desc: () => 'Grabs bacteria coated with IgG antibody — your way to catch encapsulated pneumococci here (in reality complement receptors help too).', onBuy: express });
    g.shop.add({ id: 'G6PD', gene: 'G6PD', title: 'Glucose-6-phosphate dehydrogenase', group: 'Energy', max: 2, level: 1, dest: 'ppp', col: '#6ec6ff', req: early, cost: cost([0, 0, 35], [0, 0, 10]),
      desc: () => 'The pentose-phosphate pathway keeps NADPH topped up <b>automatically</b> (competes with glycolysis for glucose).', onBuy: express });
    g.shop.add({ id: 'HIF1A', gene: 'HIF1A', title: 'Glycolytic switch (HIF-1α)', group: 'Energy', max: 1, level: 0, dest: 'nuc', col: '#7CFC8A', cost: cost([0, 35], [0, 12]), req: nf,
      desc: () => 'HIF-1α induces GLUT1, HK2, PFKFB3, LDHA and MCT4: faster glucose import and <b>automatic</b> glycolysis (excess pyruvate leaves as lactate).',
      onBuy: express, onGrant: () => { g.learn('m_metab'); } });
    g.shop.add({ id: 'TNF', gene: 'TNF', title: 'Tumour necrosis factor', group: 'Cytokines (NF-κB targets)', max: 1, level: 0, er: true, dest: 'secrete', col: '#ff7a59', cost: cost([0, 40], [0, 10]), req: nf,
      desc: () => 'Activates the capillary wall: plasma (antibodies, complement) and white cells get in. Raises inflammation a lot; costs ATP to keep secreting.',
      onBuy: express, onGrant: () => g.learn('m_cytokine') });
    g.shop.add({ id: 'CXCL8', gene: 'CXCL8', title: 'Chemokine IL-8', group: 'Cytokines (NF-κB targets)', max: 1, level: 0, er: true, dest: 'secrete', col: '#ffd166', cost: cost([0, 35], [0, 10]), req: nf,
      desc: () => 'Calls neutrophils out of the blood to eat bacteria (faster with TNF). Neutrophils also add inflammation.',
      onBuy: express, onGrant: () => g.learn('m_cytokine') });
    g.shop.add({ id: 'IL10', gene: 'IL10', title: 'Interleukin-10', group: 'Cytokines (NF-κB targets)', max: 1, level: 0, er: true, dest: 'secrete', col: '#7ee787', req: early, cost: cost([0, 30], [0, 8]),
      req: () => S.stats.effero >= 1 || g.obj.i >= OI('kill') ? true : 'Induced late — e.g. by eating apoptotic neutrophils',
      desc: () => 'Anti-inflammatory brake: cuts inflammation by more than half (and with it antibody leak and neutrophil damage).', onBuy: express, onGrant: () => g.learn('m_resolve') });

    /* ---------------- objectives ---------------- */
    const n2 = () => ['MARCO', 'WAS', 'CYBB', 'ATP6V1A', 'CTSD', 'HLA', 'G6PD'].filter(id => lv(id) >= 2).length + (lv('HIF1A') ? 1 : 0);
    g.obj.set([
      { id: 'grab', text: 'Grab a bacterium', why: 'Click the blue <b>receptors</b> on the left edge of the cell.', hint: 'Bacteria are drifting in the lining fluid. Click the <b>phagocytic receptors</b> to reach out and pull one in.', target: 'recog', check: () => S.stats.bound >= 1 },
      { id: 'cup', text: 'Engulf it', why: 'Click the <b>actin cup</b>: Arp2/3 builds pseudopods around the rod (5 ATP).', hint: 'The bacterium is stuck to your receptors. Click the <b>actin cup</b> to wrap the membrane around it.', target: 'cup', check: () => S.stats.engulf >= 1 },
      { id: 'burst', text: 'Fire the respiratory burst', why: 'Click <b>NOX2</b>: 2 NADPH → 4 superoxide inside the phagosome.', hint: 'The phagosome is sealed. Click <b>NOX2</b> to pump electrons from NADPH onto oxygen inside it.', target: 'nox', check: () => S.stats.burst >= 1 },
      { id: 'mat', text: 'Acidify: mature the phagosome', why: 'Click <b>V-ATPase</b>: Rab5 is swapped for Rab7 and the pH drops (4 ATP).', hint: 'Watch the pH readout. Click <b>V-ATPase</b> to pump protons in.', target: 'vat', check: () => S.stats.mat >= 1 },
      { id: 'dig', text: 'Fuse with lysosomes and digest', why: 'Click <b>Lysosomes</b>: cathepsins and lysozyme take the bacterium apart.', hint: 'Click the <b>lysosomes</b>. The bacterium becomes amino acids — and one peptide goes to the MIIC.', target: 'lyso', check: () => S.stats.digest >= 1 },
      { id: 'load', text: 'Load a peptide onto HLA-DR', why: 'Click the <b>MIIC</b>: HLA-DM swaps CLIP for the bacterial peptide.', hint: 'A peptide has reached the MHC class II compartment. Click the <b>MIIC</b> to load it and send it to the surface.', target: 'miic', check: () => S.stats.loaded >= 1 },
      { id: 'fuel', text: 'Refuel: glycolysis and the pentose-phosphate pathway', why: 'ATP comes from glycolysis + mitochondria; NADPH from the PPP. Run each of them twice.', hint: 'Click <b>Glycolysis</b> (2 ATP in, 4 out; mitochondria burn the pyruvate for 28 more) and the <b>PPP</b> (glucose → 2 NADPH).', target: 'glyco',
        check: () => S.stats.glyco >= 2 && S.stats.ppp >= 2, progress: () => [Math.min(2, S.stats.glyco) + Math.min(2, S.stats.ppp), 4] },
      { id: 'mop', text: 'Eat the other four bacteria', why: 'Run several phagosomes down the line at once — every station works on the oldest one waiting.', hint: 'Grab, engulf, burn, acidify, digest: keep the whole line busy. Watch ATP and NADPH and refuel when they run low.', target: 'recog',
        check: () => liveCount() === 0 && S.stats.kills >= 5, progress: () => [Math.min(5, S.stats.kills), 5] },
      { id: 'tlr', text: 'Sense LPS: relay the TLR4 signal', why: 'Click <b>TLR4</b> and follow the kinase cascade to the nucleus.', hint: 'LPS shed by the E. coli is binding TLR4. Click <b>TLR4</b>: MyD88 → IRAKs → TRAF6 → TAK1 → IKK → IκBα destroyed → NF-κB into the nucleus.', target: 'tlr4',
        onStart: () => { S.allowTLR = true; lagOver(); }, check: () => S.nfkb },
      { id: 'line', text: 'Run the line: kill 13 more bacteria and automate 3 steps', why: 'Bacteria are multiplying and more keep arriving. Each digested one refunds amino acids — spend them on genes in the <b>Genome</b> panel.', hint: 'Fully expressed genes run their station by themselves. You cannot afford them all yet — pick the steps that slow you down most.',
        onStart: () => { S.k0 = S.stats.kills; }, check: () => n2() >= 3 && S.stats.kills - S.k0 >= 13, progress: () => [Math.min(3, n2()) + Math.min(13, S.stats.kills - S.k0), 16] },
      { id: 'help', text: 'Call for help: TNF + CXCL8, and let neutrophils eat 6 bacteria', why: 'A big new inoculum has arrived. CXCL8 calls neutrophils; TNF makes the capillary wall sticky and leaky, letting them and plasma through.', hint: 'Express <i>TNF</i> and <i>CXCL8</i>. Neutrophils crawl out of the capillary below and eat bacteria — but they also inflame the tissue.',
        onStart: bigWave, check: () => lv('TNF') && lv('CXCL8') && S.stats.neuKill - S.nk0 >= 6, progress: () => [lv('TNF') + lv('CXCL8') + Math.min(6, S.stats.neuKill - S.nk0), 8] },
      { id: 'hyp', text: 'Weather the hypoxia: switch on HIF1A', why: 'Inflammatory fluid is seeping into the alveolus. O₂ falls and your mitochondria slow down — but glycolysis needs no oxygen.', hint: 'Express <i>HIF1A</i> (the glycolytic switch) and keep <b>glycolysis</b> running. (Really, low O₂ mainly stops HIF-1α protein from being destroyed; here you buy the gene.) The fluid clears in about half a game-hour — real oedema takes hours to days.', target: 'glyco',
        onStart: () => { S.edema = 32; }, check: () => lv('HIF1A') && S.edema <= 0, progress: () => [lv('HIF1A') * 10 + Math.round(32 - Math.max(0, S.edema)), 42] },
      { id: 'effero', text: 'Clear away 3 dead neutrophils', why: 'Neutrophils live only a day or two in tissue. Eating them (efferocytosis) stops them spilling their toxic contents, calms inflammation and returns amino acids.', hint: 'Click the grey <b>apoptotic neutrophils</b> as they appear. This also lets you express <i>IL10</i> — but careful: some inflammation is still useful.',
        onStart: () => { S.ef0 = S.stats.effero; }, check: () => S.stats.effero - S.ef0 >= 3, progress: () => [Math.min(3, S.stats.effero - S.ef0), 3] },
      { id: 'spn', text: 'Destroy the encapsulated pneumococci', why: 'Inflammation lets IgG and complement in; once coated, FcγRIIA (or a neutrophil) can grab them.', hint: 'The blue diplococci have a slippery capsule. Wait for IgG to coat them (pink Ys) — more inflammation coats them faster — and express <i>FCGR2A</i> so your receptors can hold on.',
        onStart: startSpn, check: () => S.spnOn && spnAlive() === 0, progress: () => [Math.max(0, S.spnN - spnAlive()), S.spnN] },
      { id: 'mtb', text: 'A different rod: engulf it', why: 'A thin, waxy bacterium has landed next to you. Eat it like the others and watch what happens.', hint: 'Grab the brown rod with your <b>receptors</b> and run it through NOX2 and on towards V-ATPase.', target: 'recog',
        onStart: startMtb, check: () => S.mtbStuck },
      { id: 'pres', text: 'Present 4 new peptide–HLA-DR complexes', why: 'Only a helper T cell can break the block: it must see what you have eaten.', hint: 'Keep digesting bacteria and loading peptides at the <b>MIIC</b>.', target: 'miic',
        onStart: () => { S.pr0 = S.stats.presented; }, check: () => S.stats.presented - S.pr0 >= 4, progress: () => [Math.min(4, S.stats.presented - S.pr0), 4], onDone: startT },
      { id: 'ifn', text: 'Receive IFN-γ: click the IFN-γ receptor', why: 'The T cell recognised your peptides and answers with IFN-γ → JAK1/2 → STAT1.', hint: 'Wait for the T cell to dock and release IFN-γ, then click <b>IFNGR</b> to send STAT1 to the nucleus.', target: 'ifngr', check: () => S.act },
      { id: 'kill', text: 'Kill the M. tuberculosis and clear the infection', why: 'Activated, you can push the Mtb phagosome on to Rab7, acid and lysosomes. No new bacteria are arriving — mop up the rest.', hint: 'Click <b>V-ATPase</b> and then <b>Lysosomes</b> for the arrested phagosome, and keep eating until no live bacteria are left.', target: 'vat',
        onStart: () => { S.waves = false; S.clr0 = Math.max(1, liveCount()); }, check: () => S.mtbKilled && liveCount() === 0, progress: () => [Math.max(0, S.clr0 - liveCount()), S.clr0] },
      { id: 'res', text: 'Resolve: express IL10 and keep inflammation below 25 % for 20 s', why: 'Stopping in time protects the lung. IL-10 and eating dead neutrophils switch off the response.', hint: 'Express <i>IL10</i> and click any apoptotic neutrophils (efferocytosis). Inflammation must stay below 25 % for twenty minutes.',
        onStart: () => { S.calm = 0; }, check: () => lv('IL10') >= 1 && S.calm >= 20, progress: () => [Math.min(20, Math.floor(S.calm)), 20], onDone: () => g.after(1.5, finish) },
    ]);
    OI = id => g.obj.list.findIndex(o => o.id === id);

    /* ---------------- scenery ---------------- */
    const rng = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    S.lys = []; let guard = 0;
    while (S.lys.length < 34 && guard++ < 2000) {
      const near = S.lys.length < 16, a = rng() * TAU, d = near ? rng() * 3 : rng() * 8.4, x = near ? ZONE.lys.x + Math.cos(a) * (1.6 + d) : Math.cos(a) * d, y = near ? ZONE.lys.y + Math.sin(a) * (1.6 + d) : Math.sin(a) * d;
      if (Math.hypot(x, y) < 8.6 && !inNuc(x, y, .12)) S.lys.push([x, y, .18 + rng() * .25]);
    }
    S.er = [];
    for (let i = 0; i < 16; i++) {
      let a = i / 16 * TAU + rng() * .3; if (Math.abs(adiff(a, Math.PI)) < .5) continue;
      let p = nucPt(a, 1.12); const pts = [[p.x, p.y]]; let h = Math.atan2(p.y - NUC.y, p.x - NUC.x);
      for (let k = 0; k < 6; k++) { h += (rng() - .5) * 1.2; const nx = pts[pts.length - 1][0] + Math.cos(h) * 1.1, ny = pts[pts.length - 1][1] + Math.sin(h) * 1.1; if (Math.hypot(nx, ny) > 8.8) break; pts.push([nx, ny]); }
      S.er.push(pts);
    }
    S.mts = []; for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + rng() * .2; S.mts.push([a, 8.4 + rng() * .8, (rng() - .5) * 1.5]); }
    S.fluid = []; for (let i = 0; i < 70; i++) S.fluid.push({ x: WX + rng() * WW, y: WY + rng() * (WALL - WY), k: i % 3, a: rng() * TAU, vx: (rng() - .5) * .3, vy: (rng() - .5) * .3 });
    S.rbc = [0, 1, 2, 3].map(i => ({ x: WX + 6 + i * 14, y: 15.2 + (i % 2 ? .25 : -.2) }));
    S.dots = []; for (let i = 0; i < 110; i++) { const a = i * 2.399, r = Math.sqrt(i / 110) * 9.2; S.dots.push([Math.cos(a) * r, Math.sin(a) * r]); }

    [[-15, -3], [-17, 3], [-14, -8], [-20, -1], [-13, 6]].forEach(p => newBug('ecoli', p[0], p[1]));
    placeMembrane();
    g.learn('m_numbers');
    /* camera: on a phone the macrophage fills the narrow canvas (bottom ~80 px stay clear for the hint bar); on a desktop the whole alveolar scene shows */
    const base = Math.min(g.W / WW, g.H / WH);
    if (phone()) { const sc = Math.min(g.W / 25, (g.H - 84) / 25); g.cam.z = U.clamp(sc / base, 1, 4); g.cam.x = -1.2; g.cam.y = -1.6 + 42 / sc; }
    else { const sc = Math.min(g.W / 40, (g.H - 40) / 30); g.cam.z = U.clamp(sc / base, 1, 2); g.cam.x = -.6; g.cam.y = .6 + 10 / sc; }
  },

  update(_, dt) {
    placeMembrane();
    /* energy */
    S.impT += dt;
    if (S.impT >= (lv('HIF1A') ? 1.15 : 2.6)) { S.impT = 0; if (S.glc + S.glcFly < 6) importGlc(); }
    if (S.pyr > 2) { S.lacT += dt; if (S.lacT > .45) { S.lacT = 0; S.pyr--; S.stats.lac++; lactateOut(); } } else S.lacT = 0;
    const sec = lv('TNF') + lv('CXCL8') + lv('IL10');
    if (res('atp') > 5) g.res.add('atp', -(.35 + .12 * sec) * dt);
    if (res('atp') < 2) { S.akT += dt; if (S.akT > 2.5) { S.akT = 0; g.res.add('atp', 1); if (!S.akSeen) { S.akSeen = true; g.toast('Energy crisis! Adenylate kinase squeezes ATP out of ADP (2 ADP → ATP + AMP), and AMPK switches energy-saving mode on. Run glycolysis!', 'bad'); } } }
    S.aaT += dt; if (S.aaT > 5) { S.aaT = 0; if (res('aa') < 12) g.res.add('aa', 1); }
    /* bacteria */
    for (const b of S.bugs.slice()) {
      const sp = b.kind === 'ecoli' ? .7 : .18;
      b.h += U.rand(-1, 1) * 2.5 * dt;
      const nx = b.x + Math.cos(b.h) * sp * dt, ny = b.y + Math.sin(b.h) * sp * dt;
      if (outsideOK(nx, ny)) { b.x = nx; b.y = ny; }
      else { const a = Math.atan2(b.y, b.x), nearCell = Math.hypot(b.x, b.y) < rc(a) + 2.6; b.h = (nearCell ? a : Math.atan2(-5 - b.y, -b.x)) + U.rand(-.6, .6); }
      const a = Math.atan2(b.y, b.x), m = rc(a) + 1.8;
      if (Math.hypot(b.x, b.y) < m) { b.x = Math.cos(a) * m; b.y = Math.sin(a) * m; }
      if (b.y > WALL - 1.2) b.y = WALL - 1.2;
      b.rot = b.kind === 'ecoli' ? b.h : b.rot + dt * .15;
      if (b.kind === 'spn' && b.op < 1) {
        b.op = Math.min(1, b.op + dt * (.013 + res('infl') * .0007) * b.opk);
        if (b.op >= 1 && !S.opSeen) { S.opSeen = true; g.toast('A pneumococcus is now <b>opsonised</b> with IgG and C3b. ' + (lv('FCGR') ? 'Your FcγRIIA can grab it.' : 'Express <i>FCGR2A</i> to grab it.'), 'good'); }
      }
      if (S.grow && b.kind !== 'mtb' && S.bugs.length < BUGCAP) {
        b.div += dt / (b.kind === 'ecoli' ? 52 : 100) * Math.max(.12, 1 - S.bugs.length / 22);     // crowding: the lining fluid holds little glucose or iron
        if (b.div >= 1) {
          b.div = 0; const d = newBug(b.kind, b.x + Math.cos(b.rot) * 1.1, b.y + Math.sin(b.rot) * 1.1); d.rot = b.rot; d.h = b.h + Math.PI; d.div = 0;
          if (b.kind === 'spn') { b.op *= .85; d.op = b.op; }
          S.stats.div++;
          if (!S.divSeen) { S.divSeen = true; g.toast('A bacterium divided. E. coli can double every ~20 min in rich broth; in lung lining fluid it is slower, here ~50 min.', 'bad'); }
        }
      }
    }
    if (S.waves) { S.waveT += dt; if (S.waveT > 28) { S.waveT = S.bugs.length > 14 ? 18 : 0; if (S.bugs.length <= 14) wave(); } }
    if (g.obj.i === OI('res')) S.calm = lv('IL10') && res('infl') < 25 ? S.calm + dt : Math.max(0, S.calm - 2 * dt);
    if (lv('MARCO') >= 2) { S.bindT += dt; if (S.bindT > .6) { S.bindT = 0; bind(false); } }
    updPhs(dt); updNeus(dt); updT(dt); updInfl(dt); updSecretion(dt); updExpression(dt);
    if (g.obj.i === 6 && S.stats.glyco >= 1 && S.stats.ppp < 1 && g.hintTarget === 'glyco') g.hint('Now click the <b>pentose-phosphate pathway</b>: glucose → 2 NADPH for NOX2.', 'ppp');
    for (const r of S.rbc) { r.x += 1.6 * dt; if (r.x > WX + WW + 4) r.x -= WW + 8; }
    for (const p of S.fluid) { p.x += p.vx * dt; p.y += p.vy * dt; p.a += dt * .4; if (p.x < WX) p.x += WW; if (p.x > WX + WW) p.x -= WW; if (p.y < WY) p.y = WALL - .5; if (p.y > WALL - .4) p.y = WY + .5; }
    g.res.set('bac', liveCount());
  },

  drawBack(c) {
    const inf = res('infl');
    /* alveolar air space with lining fluid; plasma proteins leak in with inflammation */
    c.fillStyle = `rgba(255,80,60,${inf / 100 * .09})`; c.fillRect(WX, WY, WW, WALL - WY);
    const nOps = Math.round(S.fluid.length * inf / 100);
    S.fluid.forEach((p, i) => {
      if (p.k === 0) { if (i % 9 === 0) D.glucose(c, p.x, p.y, .2, p.a); return; }
      if (i >= nOps * 1.5) return;
      if (p.k === 1) { c.strokeStyle = 'rgba(255,214,240,.55)'; c.lineWidth = .07; c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.beginPath(); c.moveTo(0, .2); c.lineTo(0, 0); c.lineTo(-.15, -.18); c.moveTo(0, 0); c.lineTo(.15, -.18); c.stroke(); c.restore(); }
      else D.circle(c, p.x, p.y, .09, 'rgba(255,179,199,.5)');
    });
    /* alveolar wall: type I epithelial cell, basement membrane, capillary endothelium, blood */
    c.fillStyle = 'rgba(214,178,140,.35)'; c.fillRect(WX, WALL, WW, .35);
    c.fillStyle = 'rgba(160,140,120,.35)'; c.fillRect(WX, WALL + .35, WW, .15);
    c.fillStyle = 'rgba(214,178,140,.28)'; c.fillRect(WX, WALL + .5, WW, .3);
    c.fillStyle = 'rgba(120,20,30,.35)'; c.fillRect(WX, WALL + .8, WW, 5.2);
    c.fillStyle = 'rgba(214,178,140,.28)'; c.fillRect(WX, WALL + 6, WW, .3);
    for (const r of S.rbc) drawRBC(c, r);
    if (g.showLabels) {
      const lx = Math.max(WX + .6, g.s2w(14, 0)[0]), ty = Math.max(WY + 1.2, g.s2w(0, 18)[1]);
      lab(phone() ? 'alveolar air space' : 'alveolar air space (thin film of lining fluid)', lx, ty, { color: '#a9cdea', align: 'left', size: 10 }, 20);
      lab(phone() ? 'alveolar wall' : 'alveolar wall: type I epithelial cell + capillary endothelium', lx, WALL - .55, { color: '#dcbb98', align: 'left', size: 10 }, 22);
      lab(phone() ? 'capillary · red cells 7.5 µm' : 'capillary · red blood cells 7.5 µm', lx, WALL + 6.75, { color: '#ffa8a8', align: 'left', size: 10 }, 21);
    }
    /* other cells and the bacteria (drawn under the macrophage) */
    for (const n of S.neus) drawNeu(c, n);
    if (S.tc) drawT(c, S.tc);
    for (const b of S.bugs) {
      const f = U.clamp((g.t - b.born) / .9, 0, 1);                 // new arrivals fade and grow in instead of popping up
      c.globalAlpha = f; drawBug(c, b.kind, b.x, b.y, b.rot, { op: b.op, div: b.kind === 'ecoli' ? b.div : 0, k: .6 + .4 * f });
    }
    c.globalAlpha = 1;
    if (g.showLabels && S.neus.length) { const n = S.neus[0]; lab('neutrophil', n.x, n.y - 6.6, { color: '#d6e4ff', size: 10 }, 30); }
    if (S.tc && g.showLabels) lab('CD4⁺ T cell', S.tc.x + 4.2, S.tc.y - 2.6, { color: '#a6f3cf', size: 10, align: 'left' }, 66);

    /* ---- the macrophage ---- */
    const N = 150; S.outline.length = 0;
    for (let i = 0; i < N; i++) { const a = i / N * TAU, r = rc(a); S.outline.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const gr = c.createRadialGradient(-2, -2, 1, 0, 0, 11);
    gr.addColorStop(0, '#1f4d66'); gr.addColorStop(1, '#143349');
    outlinePath(c, 1); c.fillStyle = gr; c.fill();
    c.fillStyle = 'rgba(255,255,255,.045)'; for (const d of S.dots) { c.beginPath(); c.arc(d[0], d[1], .1, 0, TAU); c.fill(); }
    /* actin cortex (phalloidin-red), brighter at the cup */
    outlinePath(c, .975); c.strokeStyle = 'rgba(255,110,130,.22)'; c.lineWidth = .35; c.stroke();
    /* microtubules from the centrosome */
    c.strokeStyle = 'rgba(160,230,255,.11)'; c.lineWidth = .06;
    for (const m of S.mts) { const ex = Math.cos(m[0]) * m[1], ey = Math.sin(m[0]) * m[1]; c.beginPath(); c.moveTo(CTR.x, CTR.y); c.quadraticCurveTo((CTR.x + ex) / 2 + m[2], (CTR.y + ey) / 2 - m[2], ex, ey); c.stroke(); }
    /* ER: sheets hugging the nucleus + tubules (teal) */
    c.strokeStyle = 'rgba(79,214,180,.55)'; c.lineWidth = .14;
    for (const s of [1.1, 1.2]) { c.beginPath(); for (let i = 0; i <= 60; i++) { const a = U.deg(215) + i / 60 * U.deg(290), p = nucPt(a, s); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.stroke(); }
    c.strokeStyle = 'rgba(79,214,180,.38)'; c.lineWidth = .1;
    for (const pts of S.er) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
    /* mitochondria */
    const heat = st.mito.jobs.length > 0;
    for (const m of MITO) D.mitoArc(c, m[0], m[1], m[2], U.deg(m[3]), U.deg(m[4]), m[5], heat);
    /* Golgi ribbon around the centrosome */
    for (let j = 0; j < 5; j++) {
      c.strokeStyle = `rgba(224,176,64,${.9 - j * .12})`; c.lineWidth = .14;
      c.beginPath(); c.arc(CTR.x, CTR.y, 1.15 + j * .24, U.deg(-160), U.deg(-35)); c.stroke();
      c.beginPath(); c.arc(CTR.x, CTR.y, 1.15 + j * .24, U.deg(125), U.deg(190)); c.stroke();
    }
    for (let i = 0; i < 5; i++) { const a = U.deg(-160 + i * 30); D.circle(c, CTR.x + Math.cos(a) * 2.6, CTR.y + Math.sin(a) * 2.6, .12, null, '#e0b040', g.px); }
    /* centrosome: two orthogonal centrioles */
    D.glow(c, CTR.x, CTR.y, .8, '#9af7c0', .35);
    c.fillStyle = '#9af7c0'; c.fillRect(CTR.x - .25, CTR.y - .1, .5, .2); c.fillRect(CTR.x + .18, CTR.y - .3, .2, .5);
    /* lysosomes (LysoTracker-red) */
    for (const l of S.lys) { D.circle(c, l[0], l[1], l[2], 'rgba(255,93,143,.45)', 'rgba(255,154,184,.8)', 1.1 * g.px); }
    /* plasma membrane */
    D.bilayer(c, cc => outlinePath(cc, 1), .26, '#8fd3ff');
  },

  drawMid(c) {
    for (const P of S.phs) {
      const dead = !P.alive;
      if (P.stage === 'pull') {
        const a = Math.atan2(P.y, P.x), f = mp(a, 0);
        if (Math.hypot(P.x, P.y) > rc(a) + 1.4) {
          c.strokeStyle = '#8fd3ff'; c.lineWidth = .3; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(P.x, P.y); c.stroke();
          c.strokeStyle = '#1f4d66'; c.lineWidth = .12; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(P.x, P.y); c.stroke();
        }
        drawBug(c, P.kind, P.x, P.y, P.rot, { op: P.op });
        continue;
      }
      if (P.stage === 'bound' || P.stage === 'cup') {
        drawBug(c, P.kind, P.x, P.y, P.rot, { op: P.op });
        const p = P.stage === 'bound' ? .12 : .12 + .88 * U.ease(U.clamp(P.t / P.dur, 0, 1)), fa = Math.atan2(-P.y, -P.x), R1 = P.kind === 'mtb' ? 1.75 : 1.35;
        for (const sg of [-1, 1]) {
          const a1 = sg > 0 ? fa : fa - p * Math.PI, a2 = sg > 0 ? fa + p * Math.PI : fa;
          c.lineCap = 'round';
          c.beginPath(); c.arc(P.x, P.y, R1, a1, a2); c.strokeStyle = '#8fd3ff'; c.lineWidth = .8; c.stroke();
          c.beginPath(); c.arc(P.x, P.y, R1, a1, a2); c.strokeStyle = '#1d4a63'; c.lineWidth = .5; c.stroke();
          c.beginPath(); c.arc(P.x, P.y, R1, a1, a2); c.strokeStyle = 'rgba(255,110,130,.5)'; c.lineWidth = .12; c.stroke();
        }
        if (P.stage === 'cup') lab('pseudopods closing', P.x - R1 - .4, P.y, { size: 10, color: '#ffb0bf', align: 'right' }, 50);
        continue;
      }
      const rx = P.kind === 'mtb' ? 1.95 : P.kind === 'spn' ? 1.05 : 1.35, ry = P.kind === 'mtb' ? .65 : P.kind === 'spn' ? .75 : .62, sh = P.stage === 'gone' ? Math.max(.4, P.fade) : 1 - (P.dig || 0) * .25;
      c.save(); c.globalAlpha *= P.stage === 'gone' ? U.clamp(P.fade, 0, 1) : 1;
      const acid = U.clamp((7.3 - P.pH) / 2.7, 0, 1);
      if (acid > .3) D.glow(c, P.x, P.y, rx * 1.8, '#ff5d8f', acid * .45);
      D.ellipse(c, P.x, P.y, rx * sh, ry * sh, P.rot, `rgba(255,70,150,${.06 + acid * .35})`);
      drawBug(c, P.kind, P.x, P.y, P.rot, { inside: true, dead, dig: P.dig || 0 });
      const mc = P.lamp ? '#ff7aa8' : P.rab === 7 ? '#6fa8ff' : '#7ee787';
      D.ellipse(c, P.x, P.y, rx * sh, ry * sh, P.rot, null, mc, 2.2 * g.px);
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3, cs = Math.cos(P.rot), sn = Math.sin(P.rot), ex = Math.cos(a) * rx * sh, ey = Math.sin(a) * ry * sh; D.circle(c, P.x + ex * cs - ey * sn, P.y + ex * sn + ey * cs, .1, mc); }
      if (P.stage === 'burst') {
        D.glow(c, P.x, P.y, rx * 1.6, '#fff6a0', .5);
        c.strokeStyle = '#fffbd0'; c.lineWidth = 1.6 * g.px;
        for (let i = 0; i < 7; i++) { const a = U.rand(TAU), d = U.rand(.2, 1) * rx * .9, x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d * .5, s = U.rand(.08, .2); c.beginPath(); c.moveTo(x - s, y); c.lineTo(x + s, y); c.moveTo(x, y - s); c.lineTo(x, y + s); c.stroke(); }
      }
      c.restore();
      if (P.stage !== 'gone' && (P.stuck || P.slot === 0 || S.run[P.stage])) {
        const t = P.stuck ? 'Rab5 · arrested · pH ' + P.pH.toFixed(1) : 'pH ' + P.pH.toFixed(1);
        lab(t, P.x, P.y - ry - .6, { size: P.stuck ? 10 : 9, color: P.stuck ? '#ff9a9a' : acid > .5 ? '#ffaac4' : '#d3e3f7', bold: P.stuck }, P.stuck ? 72 : 45);
      }
    }
    if (g.showLabels && S.bugs.length) {
      const vis = b => { const q = g.w2s(b.x, b.y); return q[0] > 20 && q[0] < g.W - 20 && q[1] > 20 && q[1] < g.H - 20; };
      const e = S.bugs.find(b => b.kind === 'ecoli' && vis(b)); if (e) lab('E. coli 2 µm', e.x, e.y - 1.2, { size: 10, color: '#7cefb6' }, 32);
      const s = S.bugs.find(b => b.kind === 'spn' && vis(b)); if (s) lab('S. pneumoniae', s.x, s.y - 1.55, { size: 10, color: '#a9caff' }, 34);
      const m = S.bugs.find(b => b.kind === 'mtb' && vis(b)); if (m) lab('M. tuberculosis', m.x, m.y - 1.2, { size: 10, color: '#ffd3a8' }, 64);
    }
  },

  drawFront(c) {
    const ph = phone(), wy = Math.max(-RC - 3.4, g.s2w(0, 30)[1]);
    if (S.hypoxia) lab(ph ? '⚠ hypoxia — mitochondria slowed' : '⚠ alveolus flooding: hypoxia — mitochondria slowed', g.cam.x, wy, { color: '#ffa0a0', bold: true }, 92);
    else if (S.bugs.length >= BUGCAP) lab('⚠ bacteria have filled the alveolus', g.cam.x, wy, { color: '#ffa0a0', bold: true }, 92);
    /* station names */
    for (const s of g.stations) {
      if (!s.lab || s.hidden) continue;
      const hov = g.hover === s, sel = g.sel === s, tgt = g.hintTarget === s.id;
      if (!(g.showLabels || hov || sel)) continue;
      if (s.minor && ph && g.scale < 24 && !hov && !sel) continue;
      const p = s.lab();
      lab(s.short || s.name, p.x, p.y, { align: p.align, size: ph ? 10 : 11, bold: hov || sel || tgt, color: hov || sel ? '#ffffff' : tgt ? '#c4fbee' : s.minor ? '#b4c4d9' : '#e0eaf8' }, hov || sel || tgt ? 95 : s.lp);
    }
    /* bacteria beyond the edge of the view show up as small markers on the border */
    {
      const m = 7;
      for (const b of S.bugs) {
        const [sx, sy] = g.w2s(b.x, b.y); if (sx > 0 && sx < g.W && sy > 0 && sy < g.H) continue;
        const cx = U.clamp(sx, m, g.W - m), cy = U.clamp(sy, m, g.H - (sy > g.H ? (ph ? 90 : 64) : m)), w = g.s2w(cx, cy);
        D.circle(c, w[0], w[1], 3.2 * g.px, b.kind === 'spn' ? '#7fb2ff' : b.kind === 'mtb' ? '#ffcfa0' : '#62e6a6', 'rgba(0,0,0,.55)', g.px);
      }
    }
    flushLabels(c);
  },

  onClick(_, wx, wy) {
    for (const b of S.bugs) if (U.dist(wx, wy, b.x, b.y) < 1.5) { g.select({ name: BUGINFO[b.kind].title, info: BUGINFO[b.kind] }); return; }
    for (const n of S.neus) if (U.dist(wx, wy, n.x, n.y) < 6) { g.select({ name: 'Neutrophil', info: NEUINFO }); return; }
    if (wy > WALL + .8 && wy < WALL + 6) g.select({ name: 'Capillary', info: CAPINFO });
  },

  codex: [
    { id: 'm_numbers', title: 'Macrophage by the numbers — and what\'s different from yeast', html: `<p>Macrophages ("big eaters") are the resident immune cells of almost every tissue. Élie Metchnikoff discovered phagocytosis in 1882 by sticking rose thorns into starfish larvae, and shared the 1908 Nobel Prize.</p>
      <ul><li><b>Size:</b> human alveolar macrophages are ~15–25 µm across, ~4–5 pL in volume — roughly 60–100× a yeast cell and ~5,000× an <i>E. coli</i>.</li>
      <li><b>Genome:</b> 46 chromosomes, 6.2 billion base pairs (diploid), ~20,000 protein-coding genes. Yeast: 12 million bp, ~6,000 genes.</li>
      <li><b>No cell wall:</b> the plasma membrane is the only boundary, so the cell can crawl, ruffle and wrap itself around prey. A yeast cell inside its wall could never do this.</li>
      <li><b>Organelles:</b> a stacked Golgi ribbon around the centrosome (yeast: scattered cisternae); hundreds of small lysosomes instead of one big vacuole; mitochondria with Complex I (~30 ATP per glucose instead of ~16); centrioles.</li>
      <li><b>Lactate, not ethanol:</b> human cells regenerate NAD⁺ with lactate dehydrogenase.</li>
      <li><b>Lifespan:</b> alveolar macrophages can live for months to years and largely renew themselves locally rather than from blood monocytes.</li></ul>
      <p><b>What the game changes:</b> one second ≈ one minute of infection, with steps inside the cell compressed further; bacteria swim and blood flows far more slowly than in life; a token stands for very many molecules. Cell and bacterial sizes, protein names, locations, pathway order and core stoichiometry (ATP per glucose, NADPH per superoxide, V-ATPase uses ATP) are real; the ATP and amino-acid prices of engulfment, pumping and gene expression are game values.</p>` },
    { id: 'm_phago', title: 'Phagocytosis', html: `<p><b>1. Recognition.</b> Scavenger receptors (MARCO, SR-A, CD36) bind bacteria directly. Opsonic receptors bind molecules the host has stuck onto the microbe: Fcγ receptors bind IgG, complement receptor 3 (CD11b/CD18) binds iC3b. Pattern-recognition receptors such as TLR4 do not engulf — they tell the nucleus what has been caught.</p>
      <p><b>2. The cup.</b> Clustered receptors activate tyrosine kinases (Src family, Syk), PI3-kinase and the small GTPases Cdc42 and Rac. These switch on WASP and WAVE, which activate the <b>Arp2/3 complex</b> to grow a branched actin network that pushes pseudopods around the particle like a zipper.</p>
      <p><b>3. Closure.</b> The pseudopod tips fuse, PI(4,5)P₂ is consumed, the actin coat is dismantled and a free <b>phagosome</b> is released into the cytoplasm — a bubble of the outside world inside the cell.</p>
      <p>Particles from under a micrometre up to roughly the cell's own size can be eaten; a single macrophage can take up dozens of bacteria.</p>` },
    { id: 'm_burst', title: 'The respiratory burst and NADPH', html: `<p>Within seconds of closure, the <b>NADPH oxidase NOX2</b> assembles on the phagosome membrane: membrane-bound gp91<sup>phox</sup> (<i>CYBB</i>) and p22<sup>phox</sup> (<i>CYBA</i>), joined by cytosolic p47<sup>phox</sup>, p67<sup>phox</sup>, p40<sup>phox</sup> and Rac. It moves electrons from cytosolic NADPH across the membrane onto O₂:</p>
      <p style="text-align:center"><b>NADPH + 2 O₂ → NADP⁺ + 2 O₂•⁻ + H⁺</b></p>
      <p>Superoxide becomes hydrogen peroxide; in neutrophils myeloperoxidase turns that into hypochlorous acid. The NADPH comes mostly from the <b>pentose-phosphate pathway</b> (G6PD, PGD), which is why activated phagocytes pull extra glucose into it.</p>
      <p>Children with <b>chronic granulomatous disease</b> (CGD) lack a working NOX2. Their phagocytes still eat but kill poorly, and they suffer recurrent infections with <i>Staphylococcus aureus</i>, <i>Aspergillus</i> and other organisms, plus granulomas. About two-thirds of cases are X-linked <i>CYBB</i> mutations.</p>` },
    { id: 'm_mature', title: 'Phagosome maturation', html: `<p>A newly sealed phagosome is harmless. It becomes a killing chamber by a sequence of fusions with endosomes and lysosomes — <b>maturation</b>:</p>
      <ol><li><b>Early (Rab5):</b> Rab5-GTP recruits VPS34, which makes PI(3)P, and the tether EEA1. pH ≈ 6–6.5.</li>
      <li><b>Rab conversion:</b> Rab5 is replaced by <b>Rab7</b>. Rab7 and RILP connect the phagosome to dynein, which carries it along microtubules towards the centrosome.</li>
      <li><b>Acidification:</b> more <b>V-ATPase</b> arrives. Its V1 head hydrolyses ATP and spins the V0 ring, pumping protons in; pH falls to ~5.</li>
      <li><b>Phagolysosome:</b> fusion with lysosomes (HOPS tether, SNAREs) delivers cathepsins, lysozyme, lipases and nucleases; LAMP1/2 line the membrane. pH ~4.5–5.</li></ol>
      <p>The whole sequence takes tens of minutes to about an hour. Digestion products are exported to the cytosol and recycled — and some peptides are diverted to MHC class II.</p>` },
    { id: 'm_tlr', title: 'TLR4 → NF-κB', html: `<p>Toll-like receptors were found through the <i>Toll</i> gene of fruit flies (Nobel Prize 2011 for Hoffmann and Beutler, with Steinman). TLR4 detects LPS from Gram-negative bacteria with the help of LBP, CD14 and MD-2.</p>
      <p><b>The cascade:</b> TLR4 TIR domains → adaptors TIRAP (Mal) and MyD88 → kinases IRAK4 and IRAK1 (the "Myddosome") → ubiquitin ligase TRAF6, which builds K63-linked ubiquitin chains → kinase TAK1 → <b>IKK complex</b> (IKKα, IKKβ, NEMO) → IKKβ phosphorylates <b>IκBα</b> → IκBα is ubiquitinated and destroyed by the proteasome → <b>NF-κB</b> (p65/p50) enters the nucleus.</p>
      <p>Targets include <i>TNF</i>, <i>IL6</i>, <i>CXCL8</i>, pro-<i>IL1B</i>, <i>HIF1A</i> and <i>NFKBIA</i> (IκBα itself, which switches NF-κB off again). A second branch from endosomes (TRAM/TRIF → IRF3) makes interferon-β.</p>
      <p><b>Human vs mouse:</b> humans are vastly more sensitive to LPS than mice, and the two species' TLR4–MD-2 complexes read lipid A structures differently.</p>` },
    { id: 'm_cytokine', title: 'Cytokines, neutrophils and inflammation', html: `<ul><li><b>TNF</b> — made as a membrane protein and cut free by ADAM17. It makes nearby capillary endothelium display E-selectin, ICAM-1 and VCAM-1 and become leaky, so white cells and plasma proteins (antibodies, complement) enter the tissue. In the bloodstream, too much TNF causes shock.</li>
      <li><b>IL-6</b> — fever and the liver's acute-phase response (C-reactive protein).</li>
      <li><b>CXCL8 (IL-8)</b> — a chemokine that binds CXCR1/2 on neutrophils and guides them out of the blood. Mice have no <i>CXCL8</i> gene; they use CXCL1 and CXCL2 instead.</li>
      <li><b>IL-1β</b> — made as inactive pro-IL-1β in the cytosol and released only after a second signal activates the NLRP3 inflammasome and caspase-1.</li></ul>
      <p><b>Neutrophils</b> (12–15 µm, multi-lobed nucleus) are the most numerous white blood cells. They roll on activated endothelium, stop, squeeze between endothelial cells (diapedesis) and follow the chemokine gradient. They kill efficiently but also release proteases and oxidants that damage the tissue — in the lung this can flood the air spaces (as in acute respiratory distress syndrome). Within a day or two in tissue they die by apoptosis.</p>` },
    { id: 'm_opson', title: 'Capsules and opsonisation', html: `<p>Many dangerous bacteria — <i>Streptococcus pneumoniae</i>, <i>Haemophilus influenzae</i> type b, <i>Neisseria meningitidis</i>, <i>Klebsiella</i> — wrap themselves in a thick, slippery polysaccharide <b>capsule</b>. It hides surface molecules from scavenger receptors and hinders complement deposition.</p>
      <p>The answer is <b>opsonisation</b> ("making tasty"): antibodies (IgG) against the capsule, and complement fragments C3b/iC3b, coat the bacterium. Phagocytes grab the coat with Fcγ receptors (e.g. FcγRIIA/CD32A) and complement receptors (CR1, CR3).</p>
      <p>Pneumococcus comes in about 100 capsule types; vaccines contain capsule polysaccharides of the most dangerous ones to raise exactly these antibodies. People without a spleen are especially vulnerable to encapsulated bacteria.</p>
      <p>In the healthy lung, the lining fluid contains far less IgG and complement than plasma; during inflammation, plasma leaks in — one of the useful effects of inflammation. Capsule-specific IgG exists only if the person has met that serotype before or been vaccinated; otherwise complement (helped by natural IgM and C-reactive protein) does most of the early coating.</p>` },
    { id: 'm_mhc', title: 'MHC class II: showing what you ate', html: `<p>The human MHC is called <b>HLA</b>. Class II molecules (HLA-DR, -DQ, -DP) are made by antigen-presenting cells: dendritic cells, B cells and macrophages.</p>
      <ol><li>In the ER, α and β chains assemble with the <b>invariant chain</b> (CD74), which blocks the groove and carries the complex to late endosomes (the MIIC).</li>
      <li>Cathepsins cut the invariant chain down to <b>CLIP</b>, which still sits in the groove.</li>
      <li><b>HLA-DM</b> catalyses exchange of CLIP for a peptide from digested proteins (13–25 amino acids).</li>
      <li>The peptide–HLA-DR complex goes to the surface, where a CD4⁺ T cell with a matching receptor can recognise it.</li></ol>
      <p>Class II genes are switched on by the master regulator <b>CIITA</b>, which IFN-γ strongly induces. HLA genes are the most polymorphic in the human genome — the reason organ donors must be matched.</p>` },
    { id: 'm_ifng', title: 'IFN-γ and classical activation', html: `<p><b>IFN-γ</b>, made by Th1 cells and natural killer cells, is the key macrophage-activating cytokine. Through IFNGR1/2, JAK1/JAK2 and STAT1 it induces CIITA and MHC class II, more NOX2, IRF1, guanylate-binding proteins, the immunoproteasome and autophagy — a state called <b>classical activation</b> (sometimes "M1").</p>
      <p>CD40 ligand on the T cell adds a second activating signal through CD40 on the macrophage.</p>
      <p><b>Human vs mouse:</b> activated mouse macrophages make large amounts of nitric oxide with iNOS (NOS2), and much of the textbook is built on this. Human macrophages make little NO in culture; their antimycobacterial programme leans more on autophagy and on a <b>vitamin D</b> loop: TLR2/1 signalling induces CYP27B1 (making active vitamin D) and the vitamin D receptor, which induces the antimicrobial peptide <b>cathelicidin (LL-37)</b>. IFN-γ supports this pathway.</p>
      <p>Inherited defects in the IFN-γ–IL-12 axis cause severe mycobacterial disease, showing how essential it is.</p>` },
    { id: 'm_tb', title: 'Mycobacterium tuberculosis', html: `<p>A slow-growing (doubling ~18–24 h), non-motile, acid-fast rod with a waxy, mycolic-acid-rich wall. It spreads in tiny droplets that reach the alveoli, where alveolar macrophages eat it — exactly what it wants.</p>
      <p><b>How it survives inside:</b> it stops phagosome maturation at the Rab5 stage. The phosphatase PtpA binds the V-ATPase (subunit H) and keeps it away; SapM removes PI(3)P; the cell-wall glycolipid ManLAM blocks the calcium signal needed to recruit VPS34. The phagosome stays at pH ~6.2–6.4 and never fuses with lysosomes. Catalase-peroxidase KatG (which also activates the drug isoniazid) and superoxide dismutases blunt the oxidative burst.</p>
      <p><b>How it is controlled:</b> IFN-γ from Th1 cells activates the macrophage, inducing autophagy (IRGM in humans), V-ATPase delivery and the vitamin D–cathelicidin pathway. Without CD4⁺ T cells (e.g. untreated HIV), latent TB often reactivates. Organised clusters of infected macrophages and lymphocytes form <b>granulomas</b>.</p>
      <p>About a quarter of humanity is estimated to have been infected; TB causes over 10 million illnesses and well over a million deaths each year.</p>` },
    { id: 'm_metab', title: 'Immunometabolism', html: `<p>Resting macrophages make most of their ATP by oxidative phosphorylation (~30–32 ATP per glucose). Activated by LPS, many macrophages shift towards <b>aerobic glycolysis</b> even with oxygen present: GLUT1, hexokinase 2, PFKFB3 and lactate dehydrogenase A go up, and lactate is exported through MCT4.</p>
      <ul><li><b>Why?</b> Glycolysis makes ATP fast, feeds the pentose-phosphate pathway (NADPH for NOX2), and keeps working when inflamed tissue runs low on oxygen.</li>
      <li><b>HIF-1α</b> drives this programme. NF-κB increases <i>HIF1A</i> transcription, and succinate that accumulates in activated macrophages stabilises the protein.</li>
      <li>The TCA cycle is partly re-purposed: citrate feeds itaconate (ACOD1), which inhibits bacterial enzymes and succinate dehydrogenase.</li></ul>
      <p>Most of the detailed data come from mouse macrophages; human macrophages, and alveolar macrophages in particular, show a milder version. It is the same logic as yeast's Crabtree effect and the Warburg effect in cancer: speed over efficiency.</p>` },
    { id: 'm_resolve', title: 'Resolution: IL-10 and efferocytosis', html: `<p>Inflammation must stop once the microbes are gone, or the tissue is destroyed. Resolution is an active process:</p>
      <ul><li><b>Efferocytosis</b> — macrophages eat apoptotic neutrophils, recognising phosphatidylserine on their outer surface through receptors such as MerTK (bridged by Gas6 or protein S) and TIM-4. Eating dead cells makes macrophages release anti-inflammatory signals such as IL-10, TGF-β and pro-resolving lipids.</li>
      <li><b>IL-10</b> acts through IL-10R1/R2, JAK1/TYK2 and STAT3 to suppress TNF, IL-6, IL-1β and MHC class II. Mice and people lacking IL-10 signalling develop severe intestinal inflammation.</li>
      <li>Macrophages then switch to repair: clearing debris and supporting the epithelium to restore the gas-exchange surface.</li></ul>
      <p>Balancing enough inflammation to clear infection against too much — which floods the alveoli — is what decides the outcome of pneumonia.</p>` },
  ],
});

const BUGINFO = {
  ecoli: { title: 'Escherichia coli', sub: 'Gram-negative rod · ~2 × 0.7 µm', body: 'Normally a gut bacterium; when aspirated into the lungs (for example in hospitalised patients) it can cause pneumonia. Its outer membrane is covered with lipopolysaccharide (LPS), the molecule TLR4 detects.',
    facts: ['Volume ≈ 1 fL (1 µm³) — a macrophage is about 5,000× larger by volume.', 'Doubles every ~20 min in rich broth at 37 °C; in host tissue usually more slowly.', 'Swims at ~20–30 µm/s with several flagella — shown much slower here.', 'About 3–4 million protein molecules and ~4.6 million base pairs of DNA.'],
    game: 'Doubles about every 50 s here (≈ 50 minutes of infection time), more slowly when crowded. Not clickable — use your receptors.' },
  spn: { title: 'Streptococcus pneumoniae', sub: 'Gram-positive diplococcus · ~1 µm cells in pairs · polysaccharide capsule', body: 'The pneumococcus, a leading cause of community-acquired pneumonia. Its thick capsule hides it from scavenger receptors and limits complement deposition, so it is only eaten efficiently once coated with antibody and complement.',
    facts: ['About 100 capsule types (serotypes) are known; vaccines target the most dangerous ones.', 'Gram-positive: no LPS. It is sensed through TLR2 (lipoproteins) and cytosolic sensors instead.', 'People without a spleen are at high risk from encapsulated bacteria.'],
    game: 'Pink Ys and dots are IgG and C3b; their rate of arrival follows the inflammation meter.' },
  mtb: { title: 'Mycobacterium tuberculosis', sub: 'Acid-fast rod · 2–4 × 0.2–0.5 µm · waxy mycolic-acid wall', body: 'The cause of tuberculosis. It is happily eaten by alveolar macrophages and then stops its phagosome from maturing, living inside the cell.',
    facts: ['Divides only every ~18–24 hours, so it does not multiply visibly in this level.', 'Non-motile; often grows in "cords" held together by trehalose dimycolate.', 'About a quarter of humanity is estimated to have been infected; most never fall ill.'] },
};
const NEUINFO = { title: 'Neutrophil', sub: 'Granulocyte · 12–15 µm · multi-lobed nucleus', body: 'The most numerous white blood cell and the first to arrive at an infection, recruited by CXCL8 and by TNF-activated endothelium. Its granules hold myeloperoxidase, elastase and antimicrobial peptides; it kills with a strong oxidative burst and can throw out DNA nets (NETs).',
  facts: ['The bone marrow makes on the order of 10¹¹ neutrophils a day.', 'In tissue they die by apoptosis within a day or two and are cleared by macrophages.', 'Their proteases and oxidants also injure the alveolar wall — a cause of collateral damage in severe pneumonia.'],
  game: 'Each eats up to two unencapsulated or opsonised bacteria, then dies.' };
const CAPINFO = { title: 'Alveolar capillary', sub: '~5–8 µm wide · separated from air by ~0.2–0.6 µm of tissue', body: 'Red blood cells (7.5 µm discs) squeeze through in single file while O₂ and CO₂ diffuse across the extremely thin wall. Inflammation makes the endothelium sticky and leaky, letting neutrophils, T cells and plasma proteins into the air space.',
  facts: ['The human lungs have roughly 300–500 million alveoli with ~100 m² of gas-exchange surface (estimates range ~70–140 m²).', 'A red blood cell spends well under a second in an alveolar capillary.'],
  game: 'Blood flow is shown far slower than in life.' };

/* ---------- nucleus drawing ---------- */
function drawNucleus(c) {
  const gr = c.createRadialGradient(NUC.x + .8, NUC.y - .8, .3, NUC.x, NUC.y, NUC.rx);
  gr.addColorStop(0, '#4b3f8f'); gr.addColorStop(1, '#2d2560');
  nucPath(c, 1); c.fillStyle = gr; c.fill();
  c.save(); nucPath(c, 1); c.clip();
  nucPath(c, .95); c.strokeStyle = 'rgba(229,140,192,.3)'; c.lineWidth = .45; c.stroke();         // peripheral heterochromatin
  c.strokeStyle = '#e58cc0'; c.lineWidth = .12;
  for (let i = 0; i < 14; i++) { const a = i * 2.4 + 1, d = .3 + .5 * ((i * 37 % 10) / 10); const x = NUC.x + Math.cos(a) * NUC.rx * d * .8, y = NUC.y + Math.sin(a) * NUC.ry * d * .8; c.beginPath(); c.arc(x, y, .35, a, a + 2.4); c.stroke(); }
  D.circle(c, NUC.x + 1.3, NUC.y - .6, .75, 'rgba(126,104,220,.9)'); D.circle(c, NUC.x - .2, NUC.y + 1.1, .45, 'rgba(126,104,220,.8)');   // nucleoli
  if (S.nfkb) for (let i = 0; i < 6; i++) { const a = i * 1.1 + g.t * .2, x = NUC.x + Math.cos(a) * 1.9, y = NUC.y + Math.sin(a * 1.3) * 1.3; D.circle(c, x - .13, y, .16, '#ff9d5c'); D.circle(c, x + .13, y, .14, '#ffcf9c'); }
  if (S.act) for (let i = 0; i < 5; i++) { const a = i * 1.4 + 2 - g.t * .2, x = NUC.x + Math.cos(a) * 1.4, y = NUC.y + Math.sin(a) * 1.6; D.circle(c, x - .12, y, .14, '#9ad0ff'); D.circle(c, x + .12, y, .14, '#9ad0ff'); }
  c.restore();
  D.bilayer(c, cc => nucPath(cc, 1), .2, '#b3a6f5');
  for (let i = 0; i < 18; i++) { const p = nucPt(i / 18 * TAU + .1); D.circle(c, p.x, p.y, .13, '#efeaff'); }   // nuclear pores
  if (S.tx) {
    const p = S.tx.t / S.tx.dur, x1 = NUC.x - 1.6, x2 = NUC.x + 1.6, y = NUC.y + 1.6;
    c.strokeStyle = '#ffffffaa'; c.lineWidth = .1; c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
    const px = U.lerp(x1, x2, p);
    c.strokeStyle = '#f0a8ff'; c.lineWidth = 2 * g.px; c.beginPath();
    for (let i = 0; i <= 8; i++) { const q = i / 8, xx = px - q * p * 1.8, yy = y - .2 - q * p * 1.1 + Math.sin(q * 9 + g.t * 6) * .07; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
    c.stroke();
    D.ellipse(c, px, y, .3, .22, 0, '#ffb86b', '#7a4a00', g.px);
    g.label(S.tx.it.gene, (x1 + x2) / 2, y + .6, { size: 9, color: '#f0a8ff', italic: true });
    g.label('RNA Pol II', px, y - 1.5, { size: 9, color: '#ffb86b', alpha: .9 });
  }
  if (g.showLabels || g.hover === st.nuc || g.sel === st.nuc) lab('Nucleus', NUC.x + .4, NUC.y - NUC.ry - .55, { color: '#ddd7ff', size: phone() ? 10 : 11, bold: g.hover === st.nuc || g.sel === st.nuc }, 50);
}

function finish() {
  g.hint(null);
  const s = S.stats;
  g.win({ title: 'Infection cleared — lung saved', html: `<p>Your macrophage recognised, engulfed, burned, acidified and digested its prey; called in neutrophils with TNF and CXCL8; used antibody-coated handles to catch encapsulated pneumococci;
    showed bacterial peptides on HLA-DR to a helper T cell, and used its IFN-γ to break the hiding place of <i>M. tuberculosis</i>. Then it switched itself off with IL-10.</p>
    <p>In a real lung this would take a day or two, and thousands of macrophages and neutrophils would share the work.</p>`,
    stats: [[s.kills, 'bacteria killed by you'], [s.neuKill, 'eaten by neutrophils'], [s.nadph * 2, 'superoxide made (tokens)'], [s.presented, 'peptides shown on HLA-DR'], [Math.round(s.atp), 'ATP made'], [s.lac, 'lactate exported'],
      [Math.round(S.peakInfl) + ' %', 'peak inflammation'], [Math.round(S.peakDmg) + ' %', 'peak tissue damage'], [s.genes, 'genes expressed'], [U.mmss(g.t), 'play time']] });
}
})();
