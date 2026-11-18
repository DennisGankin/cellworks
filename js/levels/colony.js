/* LEVEL 2 — A yeast colony: haploid Saccharomyces cerevisiae on a glucose (YPD) agar plate.
   World units are micrometres, colony centred at (0,0). g.world is resized every frame to ~1.9× the colony
   diameter, so the camera zooms out on its own from ~30 µm to ~2 mm (watch the scale bar).
   Two simulation modes:
     'cells'  — up to 64 individually simulated cells with real budding geometry (axial pattern, bud scars)
     'colony' — population model: cell number N, growth law λ = min(κt(φR−φ0), κn·φE), a carbon budget
                (glucose → ethanol → nothing), drawn as a dome of procedurally generated cells. */
(function () {
'use strict';
const { U, D } = CG, TAU = U.TAU, LN2 = Math.LN2;
const MIN_PER_S = 10;                                   // biological minutes per game second
const G0 = 110, YG = G0 / 3.5e5, KS = 5, ETH_PER_GLC = 1.5;
const KT = 1.85, PHI0 = .05, KN_GLC = 2.2, KN_ETH = .55, PHI_SUM = .55, E_MIN = .10, R_MIN = .10;
const SL = { low: .05, mid: .10, high: .25 }, SL_NEXT = { mid: 'low', low: 'high', high: 'mid' }, SL_NAME = { low: 'low', mid: 'medium', high: 'high' };
const IND_MAX = 64, DRY_T = 18, HEAT_T = 36, HEAT2_T = 30;
const ST = {
  grow:   { wall: '#f2d58a', a: '#3fa0b4', b: '#1f5a6b', name: 'growing, fermenting glucose' },
  starve: { wall: '#a89a74', a: '#2f5a70', b: '#1e3a4a', name: 'short of glucose, slowing down' },
  shift:  { wall: '#e8b86a', a: '#7a6234', b: '#4a3a20', name: 'switching to respiration' },
  resp:   { wall: '#d8b8ff', a: '#7a5ab0', b: '#45306e', name: 'respiring ethanol' },
  quies:  { wall: '#e6f4ff', a: '#a8d4f5', b: '#5f93c4', name: 'quiescent (G0)' },
  dead:   { wall: '#5d6470', a: '#3a3f4a', b: '#252a33', name: 'dead' },
};
const PIE = { R: '#d9c7a3', E: '#58b98a', S: '#ffd166', Q: '#5b6b85' };
const PH = { lag: { col: '#94a3b8', short: 'lag', name: 'Lag phase' }, log: { col: '#7ee787', short: 'log', name: 'Exponential (log) phase' },
  diauxic: { col: '#ffb347', short: 'shift', name: 'Diauxic shift' }, post: { col: '#c9a0ff', short: 'post-diauxic', name: 'Post-diauxic growth' },
  stat: { col: '#7fb8e8', short: 'stationary', name: 'Stationary phase' } };
let g, S, st = {};

/* ---------------- helpers ---------------- */
const lv = id => g.shop.level(id);
const res = id => g.res.get(id);
const bioH = () => g.t * MIN_PER_S / 60;
const mm = (c, k) => c / (c + k);
const r2 = v => Math.round(v * 100) / 100;
function fmtN(v) {
  v = Math.max(0, v || 0);
  if (v < 1000) return String(Math.floor(v));
  for (const [d, s] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]) if (v >= d) { const x = v / d; return (x < 9.95 ? x.toFixed(1) : Math.round(x)) + s; }
  return String(v);
}
const fmtLen = um => um < 1000 ? Math.round(um) + ' µm' : (um / 1000).toFixed(2) + ' mm';
const nice = v => { v = Math.max(1, v); if (v < 100) return Math.ceil(v); const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.ceil(v / p) * p; };
function hm(h) { if (!isFinite(h) || h > 999) return '—'; const m = Math.round(h * 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
const lobe = a => 1 + .022 * Math.sin(7 * a + S.l1) + .013 * Math.sin(13 * a + S.l2) + .007 * Math.sin(29 * a);
function colonyDiam(n) { n = Math.max(1, n); return n <= 256 ? 5.6 * Math.sqrt(n) : 89.6 * Math.pow(n / 256, .3); }
function bacDiam(n) { return n < 300 ? 1.6 * Math.sqrt(n) : 27.7 * Math.pow(n / 300, .3); }
/* Framing: S.E µm must fit the free part of the canvas (layout().view, i.e. not under the panels or the hint bar).
   The world box is the whole canvas at zoom 1, and its centre (S.home) is chosen so that (0,0) sits in the middle of the view. */
function aspF() { const V = layout().view, w = V.x1 - V.x0, h = V.y1 - V.y0, m = Math.min(w, h); return [w / m, h / m]; }   // how far the view reaches beyond E, per axis
function setWorld() {
  const V = layout().view, s = Math.min(V.x1 - V.x0, V.y1 - V.y0) / S.E;
  const hx = (g.W / 2 - (V.x0 + V.x1) / 2) / s, hy = (g.H / 2 - (V.y0 + V.y1) / 2) / s;
  g.world.w = g.W / s; g.world.h = g.H / s; g.world.x = hx - g.world.w / 2; g.world.y = hy - g.world.h / 2; S.home = [hx, hy];
}
/* the agar station sits below the colony, but its label must stay above the panels */
function placeAgar() {
  const L = layout(), s0 = g.scale / g.cam.z, lim = S.home[1] + (L.agarMax - g.H / 2) / s0, Rc = S.Rc;
  st.agar.x = 0; st.agar.y = Math.max(Rc + 4 / s0, Math.min(Rc + (L.phone ? .16 : .14) * S.E, lim)); st.agar.r = Math.min(.04 * S.E, 18 / s0);
}
/* keep the camera on its home spot (so the view zooms out with the colony) until the player pans or zooms; the view button brings it back */
function followCam() {
  const c = g.cam, [hx, hy] = S.home;
  if (S.camAuto) { if (g.camTo || Math.abs(c.z - 1) > 1e-3 || Math.abs(c.x - S.camLast[0]) + Math.abs(c.y - S.camLast[1]) > 1e-6) S.camAuto = false; }
  else if (!g.camTo && Math.abs(c.z - 1) < .01 && Math.hypot(c.x - hx, c.y - hy) < .03 * g.world.w) S.camAuto = true;
  if (S.camAuto) { c.x = hx; c.y = hy; S.camLast = [hx, hy]; }
}
/* a world-anchored label that is kept inside the free part of the screen */
function lab(t, wx, wy, o) {
  const V = layout().view, [sx, sy] = g.w2s(wx, wy), w = t.length * (o.size || 11) * .56, al = o.align || 'center';
  const lo = al === 'left' ? V.x0 + 6 : V.x0 + 6 + w / 2, hi = al === 'left' ? V.x1 - 6 - w : V.x1 - 6 - w / 2;
  const p = g.s2w(U.clamp(sx, lo, Math.max(lo, hi)), U.clamp(sy, V.y0 + 14, V.y1 - 10)); g.label(t, p[0], p[1], o);
}
function mk(o) { const s = g.addStation(o); st[o.id] = s; return s; }
function setPhase(p) { if (S.phase === p) return; S.phase = p; S.bands.push({ h: bioH(), ph: p }); }

/* ---------------- growth law / proteome ---------------- */
function alloc(R, lvl) {
  R = R == null ? S.R : R; const s = SL[lvl || S.sLvl];
  let E = PHI_SUM - R - s;
  if (E < E_MIN - 1e-9) { R = PHI_SUM - s - E_MIN; E = E_MIN; }
  return { R, E, S: s, Q: 1 - PHI_SUM };
}
function carbon() {
  if (S.phase === 'post') return KN_ETH * mm(res('eth'), KS);
  if (S.phase === 'stat') return 0;
  return KN_GLC * (1 + .15 * lv('HXT')) * mm(res('glc'), KS);
}
function limits(a) { a = a || alloc(); return { tl: KT * Math.max(0, a.R - PHI0), nl: carbon() * a.E }; }
function lamPot(a) { const l = limits(a); return Math.min(l.tl, l.nl); }
function lam() { let v = lamPot(); if (S.phase === 'lag') v *= S.woken ? .1 : .35; if (S.heat) v *= .15; return v; }
const dGame = () => Math.min(3000, LN2 / Math.max(1e-3, lam()) * 60 / MIN_PER_S);     // cell doubling, game seconds
const rMax = () => lv('SFP') ? .40 : .25;
function growFrac() {
  if (S.phase === 'lag' || S.phase === 'log') return U.clamp(.35 + .65 * (res('glc') / G0) / .75, .35, 1);
  if (S.phase === 'diauxic') return .35;
  if (S.phase === 'post') return .6;
  return 0;
}
function best(levels) {
  let b = null;
  for (const l of levels) for (let R = R_MIN; R <= rMax() + 1e-9; R += .05) {
    const rr = r2(R), a = alloc(rr, l); if (Math.abs(a.R - rr) > 1e-6) continue;
    const v = lamPot(a); if (!b || v > b.v + 1e-6) b = { l, R: rr, v };
  }
  return b;
}
function advice() {
  const b = best(['low', 'mid', 'high']); if (!b) return null;
  if (b.l !== S.sLvl) return 'pS';
  const R = alloc().R; if (R < b.R - 1e-6) return 'pR'; if (R > b.R + 1e-6) return 'pE'; return null;
}
function adviceNow() {
  const i = g.obj.i;
  if (S.heat || i === 14) return S.sLvl !== 'high' ? 'pS' : null;
  if (i === 4) { const a = alloc(); return a.R + .05 <= rMax() + 1e-9 && a.E - .05 >= E_MIN - 1e-9 && lamPot(alloc(r2(a.R + .05))) > lamPot(a) + 1e-6 ? 'pR' : null; }
  if (i === 15) return S.sLvl !== 'high' ? 'pS' : null;
  if (i < 6 || S.phase === 'diauxic' || S.phase === 'stat') return null;
  if ((i === 6 || i === 12) && S.objT <= 10) return null;            // tutorial steps: let the player read the bars first
  return S.nkT >= 10 || i === 6 || i === 12 || i === 17 ? S.nk : null;              // elsewhere the marker appears once the chance has lasted 10 s
}
/* the next click towards the fastest split, if that is ≥ 3 % faster — conditions keep changing, so this keeps coming back */
function nudge() {
  const b = best(['low', 'mid', 'high']);
  return b && b.v > lamPot() * 1.03 + 1e-4 ? advice() : null;
}
function say(s, txt) { g.floatText(s.x, s.y - 18 * g.px, txt, '#ff9a9a'); CG.sfx('bad'); }
function afterAlloc() { S.stats.allocClicks++; const l = lam(); g.floatText(st.pS.x, st.pS.y - 26 * g.px, l > .005 ? 'doubling ' + hm(LN2 / l) : 'no growth', '#ffe9a8'); }
function clickR() {
  const a = alloc();
  if (a.R + .05 > rMax() + 1e-9) return say(st.pR, lv('SFP') ? 'Ribosomes at their maximum (40 %)' : 'Max 25 % — express SFP1 · IFH1 for more');
  if (a.E - .05 < E_MIN - 1e-9) return say(st.pR, 'Enzymes already at the minimum (10 %)');
  S.R = r2(a.R + .05); afterAlloc();
}
function clickE() {
  const a = alloc();
  if (a.R - .05 < R_MIN - 1e-9) return say(st.pE, 'Ribosomes already at the minimum (10 %)');
  S.R = r2(a.R - .05); afterAlloc();
}
function clickS() { S.sLvl = SL_NEXT[S.sLvl]; S.R = r2(alloc().R); afterAlloc(); }

/* ---------------- carbon budget ---------------- */
function carbonUse(dN, dt) {
  if (S.phase === 'post' || S.phase === 'stat') g.res.set('eth', res('eth') - (S.ye || YG) * dN - (S.phase === 'post' ? (S.heat ? .1 : .35) * dt : 0));
  else { const used = Math.min(res('glc'), YG * dN); g.res.set('glc', res('glc') - used); g.res.set('eth', res('eth') + ETH_PER_GLC * used); S.stats.glcUsed += used; }
  S.stats.peakEth = Math.max(S.stats.peakEth, res('eth'));
}

/* ---------------- individual cells ---------------- */
function budGeom(c) { const r = U.lerp(.4, 1.78, U.ease(U.clamp(c.bp, 0, 1))), d = c.r + r - .3; return { x: c.x + Math.cos(c.budA) * d, y: c.y + Math.sin(c.budA) * d, r }; }
function newCell(o) {
  const c = Object.assign({ id: S.nextId++, x: 0, y: 0, r: 1.78, r0: 1.78, rS: 2.2, scars: [], birth: null, st: 'G1', p: 0, g1: .5, budA: 0, bp: 0, founder: false }, o);
  S.cells.push(c);
  c.station = g.addStation({ id: 'cell' + c.id, isCell: true, name: 'Cell', x: c.x, y: c.y, r: c.r, noLabel: true,
    ready: () => c.st === 'ready' || (c.founder && ((g.obj.i === 0 && !S.inspected) || (S.seek && !S.found && S.objT > 7))),
    onClick: () => { if (c.founder) { S.inspected = true; if (S.seek && !S.found) { S.found = true; g.ring(c.x, c.y, '#f2d58a', c.r, c.r * 3, .8); } } if (c.st === 'ready') startBud(c, true); },
    info: () => cellInfo(c) });
  return c;
}
function startBud(c, manual) {
  const n = c.scars.length;
  if (n >= 2) { let d = c.scars[n - 1] - c.scars[n - 2]; d = Math.atan2(Math.sin(d), Math.cos(d)); c.budA = c.scars[n - 1] + (d >= 0 ? 1 : -1) * U.rand(.42, .62); }
  else if (n === 1) c.budA = c.scars[0] + (Math.random() < .5 ? -1 : 1) * U.rand(.42, .62);
  else c.budA = c.birth != null ? c.birth + U.rand(-.3, .3) : U.rand(TAU);
  c.st = 'bud'; c.bp = 0; S.stats.starts++;
  if (manual) { S.stats.manual++; g.ring(c.x, c.y, '#ffe14d', c.r * .6, c.r * 1.7, .5); g.floatText(c.x, c.y - c.r - .5, 'START → bud', '#ffe14d'); }
  g.learn('c_budding');
}
function divide(c) {
  const b = budGeom(c);
  c.scars.push(c.budA); c.st = 'G1'; c.p = 0; c.g1 = .2 * U.rand(.8, 1.25); c.r0 = c.r; c.rS = Math.min(3, 2.25 + .07 * c.scars.length);
  newCell({ x: b.x, y: b.y, r: b.r, r0: b.r, rS: 2.2, birth: c.budA + Math.PI, g1: .5 * U.rand(.8, 1.25) });
  S.N = S.cells.length; S.stats.divs++; carbonUse(1, 0);
  g.ring(b.x, b.y, '#f2d58a', .3, 2.4, .6);
  if (c.founder) { S.fd.scars = c.scars.length; checkFounder(c); }
}
function checkFounder(c) {
  const f = S.fd;
  if (f.alive && f.scars >= Math.round(f.life * (1 + .3 * lv('SIR2')))) {
    f.alive = false; if (c) c.st = 'old';
    g.banner({ title: 'The founder has died of old age', text: `After ${f.scars} buds the mother cell from level 1 stopped dividing — replicative senescence. Her daughters were born young.`, kind: '', dur: 8 });
    g.learn('c_ageing');
  }
}
function relax(dt) {
  const B = [];
  for (const c of S.cells) { c.fx = 0; c.fy = 0; B.push({ c, x: c.x, y: c.y, r: c.r + .1 }); if (c.st === 'bud') { const b = budGeom(c); B.push({ c, x: b.x, y: b.y, r: b.r + .1 }); } }
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j]; if (a.c === b.c) continue;
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); const m = a.r + b.r; if (d >= m) continue;
    if (d < 1e-4) { dx = Math.random() - .5; dy = Math.random() - .5; d = Math.hypot(dx, dy); }
    const o = (m - d) / d * .5; a.c.fx -= dx * o; a.c.fy -= dy * o; b.c.fx += dx * o; b.c.fy += dy * o;
  }
  const k = Math.min(1, dt * 8);
  for (const c of S.cells) { c.x += c.fx * k - c.x * .015 * dt; c.y += c.fy * k - c.y * .015 * dt; }
}
function updCells(dt) {
  const Dg = dGame();
  for (const c of S.cells.slice()) {
    if (c.st === 'G1') {
      c.p = Math.min(1, c.p + dt / (c.g1 * Dg)); c.r = U.lerp(c.r0, c.rS, c.p);
      if (c.p >= 1) { if (lv('CLN3')) startBud(c, false); else c.st = 'ready'; }
    } else if (c.st === 'bud') { c.bp += dt / (.65 * Dg); if (c.bp >= 1) divide(c); }
  }
  relax(dt);
  let mx = 4;
  for (const c of S.cells) {
    const s = c.station; s.x = c.x; s.y = c.y; s.r = c.r;
    s.name = c.founder ? 'Founder cell' : c.scars.length ? 'Mother cell' : 'Daughter cell';
    s.tip = c.st === 'ready' ? 'at START — click to bud' : c.st === 'bud' ? 'budding' : c.st === 'old' ? 'senescent' : 'G1 — growing';
    mx = Math.max(mx, Math.hypot(c.x, c.y) + c.r + (c.st === 'bud' ? 2 * budGeom(c).r : 0));
  }
  S.Rc = mx;
  if (S.cells.length >= IND_MAX) switchToColony();
}
function switchToColony() {
  let n = 0; for (const c of S.cells) n += 1 + (c.st === 'bud' ? c.bp * .9 : 0);
  S.N = n;
  const f = S.cells.find(c => c.founder); if (f) { S.fd.scars = f.scars.length; S.fd.p = f.st === 'bud' ? .6 : f.p * .25; }
  for (const c of S.cells) delete g.stById[c.station.id];
  g.stations = g.stations.filter(s => !s.isCell);
  if (g.sel && g.sel.isCell) g.select(null);
  S.cells = []; S.mode = 'colony';
  g.banner({ title: 'A microcolony', text: '64 cells — too many to follow one by one. From now on you steer the whole population. Keep an eye on the scale bar.', kind: 'good', dur: 8 });
}

/* ---------------- population model ---------------- */
function updColony(dt, dtH) {
  const fg = growFrac(), dN = S.N * lam() * fg * dtH;
  S.N += dN; carbonUse(dN, dt);
  const f = S.fd;                                   // founder: buried in the centre, divides only while the centre is fed
  if (f.alive && S.phase === 'log' && fg > .8 && !S.heat) {
    f.p += dt / (.85 * dGame() * (1 + Math.max(0, f.scars - 15) * .07));
    if (f.p >= 1) { f.p = 0; f.scars++; checkFounder(null); }
  }
  S.Rc = colonyDiam(S.N + S.dead) / 2;
}

/* ---------------- events ---------------- */
function startHeat2() {
  S.heat2Done = true; S.heat = true; S.heatT = 0; S.heatLen = HEAT2_T; S.heatN = S.stats.heatDead;
  g.banner({ title: 'Heat shock again: 40 °C', text: 'The thermostat fails a second time. Survivors of the first shock still carry extra chaperones (acquired thermotolerance), and slow-growing respiring cells are hardier anyway — but growth stops again.', kind: 'stress', dur: 8 });
  g.obj.addSide({ id: 'heat2', text: 'Second heat shock: protect the colony', hint: 'Click the yellow <b>stress</b> slice until it reads <b>high</b>. Lower it again when the heat is over.',
    check: () => S.sLvl === 'high', progress: () => [+(S.sLvl === 'high'), 1] });
}
function startHeat() {
  S.heatDone = true; S.heat = true; S.heatT = 0; S.heatLen = HEAT_T; S.heatN = 0; S.price.HSP = nice(3 * S.N);
  g.banner({ title: 'Heat shock: 30 °C → 40 °C', text: 'The incubator thermostat has failed. Proteins unfold, growth stalls and cells begin to die. Hsf1 and Msn2/4 switch on protective genes.', kind: 'stress', dur: 8 });
  g.learn('c_heat');
  g.obj.addSide({ id: 'heat', text: 'Heat shock: protect the colony', hint: 'Click the yellow <b>stress</b> slice of the proteome pie until it reads <b>high</b>, and express <i>HSP104 · SSA4</i> in the Genome panel.',
    check: () => lv('HSP') >= 1 && S.sLvl === 'high', progress: () => [(lv('HSP') >= 1) + (S.sLvl === 'high'), 2],
    onDone: () => g.toast('Protected: chaperones refold damaged proteins and trehalose stabilises membranes. The death rate drops sharply.', 'good') });
}
function endHeat() {
  S.heat = false; g.obj.removeSide('heat'); g.obj.removeSide('heat2');
  if (S.heat2Done) {
    const d = S.stats.heatDead - S.heatN;
    g.banner({ title: 'Back to 30 °C', text: `This time ${fmtN(d)} cells (${Math.round(100 * d / (S.N + d))} %) died. Lower the stress proteins again so growth can resume on the remaining ethanol.`, kind: 'good', dur: 8 });
    return;
  }
  const pct = Math.round(100 * S.stats.heatDead / (S.N + S.stats.heatDead));
  g.banner({ title: 'Back to 30 °C', text: `${fmtN(S.stats.heatDead)} cells (${pct} %) died. Survivors keep extra chaperones for a while, so a second heat shock would hurt less (acquired thermotolerance). You may lower stress proteins again.`, kind: 'good', dur: 9 });
  g.after(4, () => g.toast('In real colonies the best heat survivors are often slow-growing cells rich in Tsl1 (trehalose synthase) — natural <b>bet hedging</b> (Levy, Ziv & Siegal 2012).', 'good'));
}
function startBac() {
  S.bacDone = true; const a = U.deg(-35);
  S.bac = { n: 300, x: Math.cos(a) * 760, y: Math.sin(a) * 760, R: 14, spores: false }; S.pH = 6.3; S.price.PMA = nice(3 * S.N);
  g.banner({ title: 'Contamination!', text: 'A Bacillus spore drifted onto the plate ~0.75 mm away and germinated. Bacteria divide every ~30 min and eat the same glucose.', kind: 'stress', dur: 8 });
  g.learn('c_competition');
  g.obj.addSide({ id: 'bac', text: 'Contaminant: acidify the agar to pH 4.7', hint: 'Express <i>PMA1</i> in the Genome panel. Fermenting yeast pump out protons; most Bacillus strains stop growing in acidic agar.',
    check: () => S.pH <= 4.7, progress: () => [Math.round((6.3 - S.pH) * 10), 16],
    onDone: () => g.banner({ title: 'Bacillus stalled', text: `The agar around your colony is now pH ${S.pH.toFixed(1)}. The bacteria stop growing — but they already ate ${S.stats.stolen.toFixed(1)} mM of your glucose.`, kind: 'good' }) });
}
function updBac(dtH, dt) {
  const b = S.bac;
  if (S.phase === 'lag' || S.phase === 'log') S.pH = Math.max(4.3, S.pH - .03 * (1 + 3 * lv('PMA')) * dt);
  if (!b.spores) {
    const pf = U.clamp((S.pH - 4.7) / 1.4, 0, 1), dn = b.n * 1.5 * pf * mm(res('glc'), KS) * dtH;
    b.n += dn; const used = Math.min(res('glc'), .25 * YG * dn); g.res.set('glc', res('glc') - used); S.stats.stolen += used;
    if (res('glc') < 4) { b.spores = true; g.obj.removeSide('bac'); g.toast('Out of glucose, <i>Bacillus</i> turns into dormant <b>endospores</b>.', ''); }
  }
  b.R = bacDiam(b.n) / 2;
}
function wake() {
  S.woken = true; S.wakeN = S.N; S.lagEnd = bioH() + 2;
  g.res.set('glc', G0); setPhase('lag'); S.stats.peakEth = Math.max(S.stats.peakEth, res('eth'));
  g.ring(st.agar.x, st.agar.y, '#7CFC8A', st.agar.r, S.Rc * 1.4, 1.2);
  g.banner({ title: 'Fresh glucose', text: 'Sugar soaks through the agar to the colony. Glucose switches Ras/PKA and TORC1 back on; cells burn their trehalose and glycogen to restart and leave G0 within an hour or two.', kind: 'good', dur: 8 });
}
function startDry() {
  S.dry = true; S.dryT = 0;
  g.banner({ title: 'The plate is drying out', text: 'Weeks later (the game clock skips the wait), water evaporates from the agar. Cells lose water; membranes and proteins are stressed. Only well-prepared quiescent cells pull through.', kind: 'stress', dur: 9 });
}

/* ---------------- signalling (one representative cell, top left) ---------------- */
function sigCascade(steps, col, done) {
  const s = st.sig; S.sigBusy = true;
  steps.forEach((t, i) => g.after(.7 * i, () => { g.floatText(s.x, s.y - (30 + 14 * (i % 2)) * g.px, t, col); g.ring(s.x, s.y, col, 10 * g.px, 45 * g.px, .6); CG.sfx('pop'); }));
  g.after(.7 * steps.length, () => { S.sigBusy = false; done(); });
}
function sigClick() {
  if (S.sigBusy) return;
  if (S.phase === 'diauxic' && !S.snf1) {
    sigCascade(['Snf1-P (Thr210) — energy alarm', 'Mig1-P exported by Msn5', 'ADR1 · CAT8 · HAP4 derepressed'], '#ffcf5c', () => {
      S.snf1 = true; const n = S.N; S.price.HAP4 = nice(6 * n); S.price.ADR1 = nice(5 * n); S.price.CAT8 = nice(5 * n);
      g.learn('c_diauxic'); g.toast('Glucose repression lifted: <i>HAP4</i>, <i>ADR1</i> and <i>CAT8</i> programmes can now be expressed.', 'good');
    });
  } else if (S.phase === 'stat' && !S.rim15) {
    sigCascade(['TORC1 · PKA · Sch9 off', 'Rim15 enters the nucleus', 'Msn2/4 · Gis1 → G0 genes'], '#7ee787', () => {
      S.rim15 = true; const n = S.N; S.price.TPS = nice(5 * n); S.price.GSY = nice(3 * n);
      g.learn('c_quiescence'); g.toast('Rim15 is active: <i>TPS1 · TPS2</i> and <i>GSY2 · GLG1</i> can now be expressed.', 'good');
    });
  } else say(st.sig, S.snf1 && !S.rim15 && S.phase === 'post' ? 'Ethanol is still there — keep growing' : 'Nothing to signal right now');
}

function finish() {
  g.hint(null);
  const N = S.N, tot = N + S.dead;
  g.win({ title: 'A colony you can see',
    html: `<p>Two cells became <b>${fmtN(N)}</b> living cells — a cream-coloured dome ${fmtLen(2 * S.Rc)} across, visible to the naked eye. Along the way your population drew the whole textbook growth curve: a short lag, exponential growth on fermented glucose, the diauxic shift, slow respiratory growth on its own ethanol, and a quiet, stress-proof stationary phase.</p>
      <p>Quiescent cells like these can wait for months. Fed fresh sugar, they wake up within an hour or two — the same lag phase you saw at the start — and the curve begins again.</p>`,
    stats: [[fmtN(N), 'living cells'], [fmtLen(2 * S.Rc), 'colony diameter'], [Math.log2(tot / 2).toFixed(1), 'doublings'], [Math.round(S.stats.peakEth) + ' mM', 'peak ethanol (Crabtree)'],
      [Math.round(100 * N / tot) + ' %', 'cells alive at the end'], [S.fd.scars + (S.fd.alive ? '' : ' †'), 'bud scars on the founder'], [Math.round(bioH()) + ' h', 'biological time'], [U.mmss(g.t), 'play time']] });
}

/* ---------------- info panels ---------------- */
const CELL_STATE = { G1: 'G1 — growing to START size', ready: 'At START — waiting for your click', bud: 'Budded (S → G2 → M): bud growing', old: 'Senescent — no longer divides' };
function cellInfo(c) {
  const n = c.scars.length;
  const title = c.founder ? 'The founder cell' : n ? 'Mother cell' : 'Daughter cell (virgin)';
  const body = c.founder
    ? 'This is the cell you raised in level 1, now on a fresh agar plate next to the daughter she made there (her second: she already carried one old scar). Every bud leaves a ring of <b>chitin</b> on her wall — a <b>bud scar</b> — so her age can be read straight off her surface. She is larger than her daughters, and she will keep getting larger with every division.'
    : n ? 'A mother has already budded at least once; her bud scars sit next to each other because haploid cells bud <b>axially</b>. Mothers are already big enough, so their G1 after dividing is short and their cycles are shorter than their daughters\'.'
    : 'A daughter is born smaller than her mother and carries a faint <b>birth scar</b> where she was attached. She must grow in G1 until she is big enough to pass START, so her first cycle is longer than her mother\'s — cell-size control in action.';
  return { title, sub: 'Haploid <i>S. cerevisiae</i> · ' + (2 * c.r).toFixed(1) + ' µm across · ' + n + ' bud scar' + (n === 1 ? '' : 's'), body,
    facts: ['Haploid cells bud <b>axially</b>: each new bud forms next to the previous bud scar (a daughter\'s first bud forms next to her birth scar). This needs the landmark proteins Bud3, Bud4, Axl1 and Axl2. Diploids bud from both poles instead (bipolar pattern).',
      'The landmark is read by the GTPase Rsr1/Bud1, which recruits Cdc24 to switch on <b>Cdc42</b>; Cdc42 then polarises actin and secretion to that spot.',
      'Bud scars stain brightly with the chitin dye Calcofluor white. A new bud never forms on an old scar.',
      'A mother produces roughly 20–30 daughters before she stops dividing (replicative lifespan; ~25 on average for common lab strains).',
      'Even genetically identical cells differ: cycle times in the same colony vary by tens of percent (noise in gene expression and size at birth).'],
    game: 'Until you express <i>CLN3</i>, cells wait at START for your click; real cells decide by themselves (even cells lacking <i>CLN3</i> still pass START, just at a larger size, because Bck2 — an activator, not a cyclin — can switch on the G1/S genes instead). Time is compressed: 1 s of play ≈ 10 min.',
    live: () => [['State', CELL_STATE[c.st] || c.st], ['Cycle progress', c.st === 'G1' ? Math.round(c.p * 100) + ' % of G1' : c.st === 'bud' ? Math.round(c.bp * 100) + ' % of bud growth' : '—'], ['Diameter', (2 * c.r).toFixed(1) + ' µm'], ['Bud scars', c.scars.length]] };
}
const curveInfo = { title: 'Growth curve', sub: 'log₁₀(cells) against time — the classic textbook figure, drawn by you',
  body: 'Microbiologists plot population size on a <b>logarithmic</b> axis, so steady exponential growth becomes a straight line whose slope is the growth rate. Your curve should show a short <b>lag</b>, a long straight <b>log phase</b> on glucose, a pause at the <b>diauxic shift</b>, a slower <b>post-diauxic</b> rise on ethanol, and a flat <b>stationary phase</b>.',
  facts: ['20 doublings turn 1 cell into 2²⁰ ≈ 1 million.', 'Jacques Monod named this two-step growth <i>diauxie</i> (1941), studying bacteria on two sugars. Yeast does the same on glucose and then on its own ethanol.',
    'Green and violet lines: glucose and ethanol in the agar near the colony (mM, right axis). Glucose falls as ethanol rises (fermentation), then ethanol is eaten too.'],
  game: 'The x-axis is biological time (1 s of play ≈ 10 min).',
  live: () => [['Cells', fmtN(S.N)], ['Doublings since plating', Math.max(0, Math.log2((S.N + S.dead) / 2)).toFixed(1)], ['Phase', PH[S.phase].name]] };
const PINFO = {
  R: { title: 'Ribosomes', sub: 'Proteome sector φ<sub>R</sub> · the protein-making machinery',
    body: 'A cell can only grow as fast as its ribosomes make new protein. That gives the <b>growth law</b>: the share of the proteome invested in ribosomes rises in step with growth rate. But ribosomes are useless without building blocks — if metabolic enzymes cannot feed them, extra ribosomes just sit idle.',
    facts: ['A fast-growing yeast cell holds ~200,000 ribosomes and makes ~2,000 new ones per minute; rRNA is ~60 % of all transcription and ribosomal-protein genes take ~50 % of RNA polymerase II initiation events (Warner, 1999).', 'Ribosomal-protein share rises linearly with growth rate across nutrients — shown for <i>E. coli</i> (Scott & Hwa, 2010) and for yeast (Metzl-Raz et al., 2017).', 'Some ribosomes are always inactive, so growth hits zero before the ribosome share does.'],
    game: 'λ<sub>ribosomes</sub> = κ<sub>t</sub>·(φ<sub>R</sub> − 0.05), κ<sub>t</sub> ≈ 1.85 h⁻¹. <b>Click: +5 % ribosomes, taken from metabolic enzymes.</b> Real cells set this themselves via TORC1, PKA, Sch9 and Sfp1.' },
  E: { title: 'Metabolic enzymes', sub: 'Proteome sector φ<sub>E</sub> · transporters, glycolysis, fermentation, respiration, biosynthesis',
    body: 'These proteins import nutrients and turn them into ATP and building blocks (amino acids, nucleotides, lipids). How much each enzyme molecule can deliver depends on the food: glucose is processed fast, ethanol slowly, so on ethanol the cell needs a bigger enzyme share and fewer ribosomes.',
    facts: ['Glycolytic and fermentation enzymes are among the most abundant proteins in yeast (Tdh3, Eno2, Pdc1, Fba1, Pgk1 …).', 'On glucose, the Hxt transporters and glycolysis carry an enormous flux; on ethanol, the cell needs Adh2, Acs1, the glyoxylate cycle, gluconeogenesis and the whole respiratory chain.'],
    game: 'λ<sub>supply</sub> = κ<sub>n</sub>·φ<sub>E</sub>; κ<sub>n</sub> ≈ 2.2 h⁻¹ on glucose, 0.55 h⁻¹ on ethanol, falling as the food runs low. <b>Click: +5 % enzymes, taken from ribosomes.</b>' },
  S: { title: 'Stress-protection proteins', sub: 'Proteome sector φ<sub>S</sub> · chaperones, trehalose & glycogen enzymes, antioxidants',
    body: 'Chaperones (Hsp104, Hsp70/Ssa, Hsp26), membrane protectants such as Hsp12, trehalose synthase, catalase and friends do nothing for growth — they are insurance. The transcription factors <b>Msn2/Msn4</b> and <b>Hsf1</b> switch them on. Protein spent on protection is not available for ribosomes or enzymes, so cautious cells grow more slowly.',
    facts: ['The "environmental stress response" (Gasch et al., 2000) induces ~300 protective genes and represses ~600 growth genes — mostly ribosome biogenesis — at the same time.', 'Slow-growing yeast are more stress resistant even without warning: growth rate and stress tolerance trade off.'],
    game: '<b>Click to cycle: medium (10 %) → low (5 %) → high (25 %).</b> High protection cuts deaths from heat and drying.' },
  Q: { title: 'Housekeeping proteins', sub: 'Proteome sector φ<sub>Q</sub> · ~45 %, roughly fixed',
    body: 'Polymerases, histones, the cytoskeleton, membrane and wall machinery, proteasomes, and countless other proteins a cell needs whatever its growth rate. Growth-law models treat this as a constant block of about half the proteome.',
    facts: ['A yeast cell contains ~50 million protein molecules of ~4,000–5,000 different kinds.'], game: 'Fixed at 45 % in the game.' },
};
function protInfo(k) {
  return Object.assign({}, PINFO[k], { live: () => { const a = alloc(), l = limits(a), m = lam(); return [['Ribosomes / enzymes / stress', Math.round(a.R * 100) + ' / ' + Math.round(a.E * 100) + ' / ' + Math.round(a.S * 100) + ' %'], ['Ribosomes could support', hm(LN2 / Math.max(1e-3, l.tl)) + ' doubling'], ['Enzymes could support', hm(LN2 / Math.max(1e-3, l.nl)) + ' doubling'], ['Actual cell doubling', m > .005 ? hm(LN2 / m) : 'not growing']]; } });
}
const centreInfo = () => ({ title: 'Colony centre', sub: 'The oldest cells · the first to go hungry',
  body: 'The founder and her earliest daughters sit here, buried under their descendants. Food from the agar has to diffuse in through a dense mass of cells that are all eating it, so the centre and the top of the colony run short first: these cells slow down, switch metabolism and eventually go quiescent while the rim is still fermenting.',
  facts: ['Glucose diffuses through agar about as fast as through water (D ≈ 6–7 × 10⁻¹⁰ m²/s): ~1 mm in a quarter of an hour, ~1 cm in about a day.', 'Older yeast colonies develop distinct cell layers with different metabolism; in some studies lower cells starve and feed upper cells (Čáp et al., 2012).',
    'Old cells are rare: about half of all cells are virgin daughters, a quarter have one bud scar, an eighth two, and so on.'],
  game: 'Beyond 64 cells the colony is a population model (N, growth law, carbon budget); the cells you see are generated to match it, and the top view shows only the surface layer.',
  live: () => [['Living cells', fmtN(S.N)], ['Dead cells', fmtN(S.dead)], ['Diameter', fmtLen(2 * S.Rc)], ['Cells still growing', Math.round(growFrac() * 100) + ' %'],
    ['Founder', (S.fd.alive ? 'alive' : 'dead') + ', ' + S.fd.scars + ' bud scars'], ['Quiescent', Math.round(S.Q * 100) + ' %']] });
const rimInfo = () => ({ title: 'Growing rim', sub: 'Where the colony expands',
  body: 'Cells at the edge sit on fresh, sugar-rich agar and keep dividing at full speed — and they ferment the glucose to ethanol even though they are bathed in air (the Crabtree effect). Because only a band of cells near the edge and the agar keeps dividing fast, a big colony stops growing exponentially: its radius grows at a roughly constant speed.',
  facts: ['The rim is also where new mutants are most likely to take over: a mutation at the edge can form a visible wedge-shaped sector.', 'Colony shape depends on the strain: wild yeasts often make wrinkly "fluffy" colonies held together by the adhesin Flo11; most lab strains make smooth domes.'],
  game: 'In the game the whole colony keeps growing exponentially until the sugar within reach runs out, as in a flask; a real colony soon switches to this slower, linear widening.',
  live: () => [['Rim cells', ST[zones().rim].name], ['Local glucose', res('glc').toFixed(1) + ' mM'], ['Cell doubling', lam() > .005 ? hm(LN2 / lam()) : 'not growing'], ['Carbon source', S.phase === 'post' ? 'ethanol (respiration)' : S.phase === 'stat' ? 'none' : 'glucose (fermentation)']] });
const agarInfo = { title: 'Agar plate (YPD)', sub: '1 % yeast extract · 2 % peptone · 2 % glucose · ~2 % agar · 30 °C',
  body: 'Agar is a gel made from seaweed polysaccharides that yeast and most other microbes cannot eat. Nutrients dissolved in it diffuse to the colony; waste such as ethanol and CO₂ diffuses away. The colony empties its own neighbourhood much faster than diffusion can refill it.',
  facts: ['2 % glucose ≈ 110 mM.', 'A standard plate holds ~20–25 ml of medium — sugar for billions of cells. A single colony only drains a local zone around itself.', 'Ethanol made by the colony reaches tens of mM nearby; much of it later diffuses back and is eaten.'],
  game: 'The glucose counter is the sugar <b>within reach</b> of this colony, and it is used up as if the colony were in a small batch culture. That makes the phases happen one after another, as in a flask.',
  live: () => [['Glucose (local)', res('glc').toFixed(1) + ' mM'], ['Ethanol (local)', Math.round(res('eth')) + ' mM'], ['Temperature', S.temp.toFixed(0) + ' °C'], ['pH near colony', S.pH.toFixed(1)]] };
function sigInfo() {
  const live = () => [['Glucose', res('glc').toFixed(1) + ' mM'], ['Ethanol', Math.round(res('eth')) + ' mM'], ['Snf1', S.snf1 ? 'active' : 'off'], ['Rim15', S.rim15 ? 'active' : 'off']];
  if (!S.snf1) return { title: 'Glucose repression: Mig1 in the nucleus', sub: 'Inside every cell', live,
    body: 'While glucose is plentiful the phosphatase Reg1–Glc7 keeps the energy-sensing kinase <b>Snf1</b> off, and the repressor <b>Mig1</b> (red) sits in the nucleus on the promoters of genes for other sugars and of the activators of respiration and gluconeogenesis (<i>HAP4</i>, <i>CAT8</i>). Ethanol-use genes stay off too, because their activator Adr1 needs Snf1. That is why the colony ferments.',
    facts: ['Snf1 is the yeast version of AMPK, the energy gauge of all eukaryotes.', 'When glucose falls, Snf1 is phosphorylated on Thr210 by Sak1, Tos3 or Elm1; it phosphorylates Mig1, which is exported from the nucleus by Msn5.', 'The diauxic shift was the subject of one of the first genome-wide expression experiments (DeRisi, Iyer & Brown, 1997).'],
    game: S.phase === 'diauxic' ? '<b>Click now to activate Snf1.</b>' : 'Becomes clickable when glucose runs out.' };
  if (!S.rim15) return { title: 'Snf1 active · Mig1 exported', sub: 'Inside every cell · glucose repression lifted', live,
    body: 'Snf1 (yellow) has sent Mig1 out of the nucleus. Activators take over: <b>Adr1</b> (ethanol use, peroxisomes), <b>Cat8</b> and Sip4 (glyoxylate cycle, gluconeogenesis) and the Hap2/3/4/5 complex (respiration).',
    facts: ['Hundreds of genes change expression across the shift; ribosome-biogenesis genes are switched down at the same time.', 'Cells store glycogen and trehalose as glucose runs out, then partly burn them during the switch.'],
    game: S.phase === 'stat' ? '<b>Click now to activate Rim15.</b>' : 'Later, when ethanol is gone, this cell becomes clickable again.' };
  return { title: 'Rim15 → Msn2/4 and Gis1', sub: 'Inside every cell · entry into quiescence (G0)', live,
    body: 'With no carbon left, the growth kinases TORC1, PKA and Sch9 fall silent. They normally hold back the kinase <b>Rim15</b>; released, it enters the nucleus and activates <b>Msn2/Msn4</b> and <b>Gis1</b>, which switch on genes for trehalose, glycogen, chaperones, a thicker wall and autophagy.',
    facts: ['Rim15 belongs to the Greatwall kinase family, conserved up to humans.', 'Mutants lacking Rim15 fail to enter a proper quiescent state and lose viability quickly in stationary phase.'],
    game: 'In real cells Rim15, Msn2/4 and Gis1 already switch on at the diauxic shift, as glucose runs out (Gis1 drives the post-diauxic genes), and trehalose and glycogen start piling up then. The game saves this step for the end.' };
}
const bacInfo = () => ({ title: '<i>Bacillus subtilis</i>', sub: 'Gram-positive soil bacterium · rods ~0.7 × 2–4 µm',
  body: 'An airborne spore landed on the plate and germinated. Bacteria and yeast now compete for the same glucose, and the bacteria divide far faster. Yeast\'s defence here is chemical: fermenting yeast acidify their surroundings.',
  facts: ['<i>B. subtilis</i> divides every ~20–40 min in rich medium.', 'When starved it forms a dormant <b>endospore</b> that survives heat, drying and UV for years — which is how it travels through the air.',
    'Yeast acidify their surroundings: Pma1 pumps out H⁺, and fermentation releases CO₂ and small amounts of organic acids. Many bacteria, including most <i>Bacillus</i> strains, grow poorly below about pH 5.',
    'In sugar-rich fruit the ethanol from fermentation is a second weapon ("make–accumulate–consume"); around a single colony on agar it diffuses away too fast to matter much.'],
  game: 'Bacterial numbers and the pH change are illustrative; the competition is exaggerated.',
  live: () => [['Bacteria', fmtN(S.bac ? S.bac.n : 0)], ['State', S.bac && S.bac.spores ? 'sporulated' : S.pH <= 4.7 ? 'stalled by acid' : 'growing'], ['pH near yeast colony', S.pH.toFixed(1)], ['Glucose stolen', S.stats.stolen.toFixed(1) + ' mM']] });

/* ---------------- drawing: world ---------------- */
function zones() {
  const p = S.phase;
  if (S.woken && S.Q > .3) return { coreU: .5, core: 'quies', rim: S.Q > .55 ? 'quies' : 'grow' };
  if (p === 'lag' || p === 'log') return { coreU: Math.sqrt(Math.max(0, 1 - growFrac())), core: 'starve', rim: 'grow' };
  if (p === 'diauxic') return { coreU: .7, core: 'starve', rim: S.snf1 ? 'shift' : 'starve' };
  if (p === 'post') return { coreU: Math.sqrt(.4), core: 'starve', rim: 'resp' };
  return { coreU: .5, core: S.Q > .3 ? 'quies' : 'starve', rim: S.Q > .5 ? 'quies' : 'starve' };
}
function stateAt(u, h, h2, z) {
  if (h2 < S.dead / (S.N + S.dead)) return 'dead';
  if (S.woken && h < S.Q) return 'quies';                          // waking up: G0 cells leave one by one
  if (S.phase === 'stat') return h < S.Q ? 'quies' : 'starve';
  return u > z.coreU ? z.rim : z.core;
}
function drawAgar(c) {
  const E = S.E, Rc = S.Rc, gf = res('glc') / G0, dR = Rc * (1.25 + 1.6 * (1 - gf));
  const gr = c.createRadialGradient(0, 0, Rc * .9, 0, 0, dR); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.beginPath(); c.arc(0, 0, dR, 0, TAU); c.fill();
  const ef = res('eth') / 200;
  if (ef > .01) D.glow(c, 0, 0, Rc * (1.6 + ef), '#c9a0ff', .4 * ef);
  const nG = Math.round(S.field.length * gf), hs = 3.4 * g.px;
  for (let i = 0; i < nG; i++) {
    const f = S.field[i], x = g.world.x + (f.u + 1) / 2 * g.world.w, y = g.world.y + (f.v + 1) / 2 * g.world.h;
    if (Math.hypot(x, y) < dR * .92) continue;
    if (S.bac && Math.hypot(x - S.bac.x, y - S.bac.y) < S.bac.R * 1.5) continue;
    c.globalAlpha = .75; D.glucose(c, x, y, hs, f.a + g.t * .2);
  }
  c.globalAlpha = 1;
  const nE = Math.round(S.eField.length * Math.min(1, ef * 1.4));
  for (let i = 0; i < nE; i++) { const p = S.eField[i], r = Rc * p.rr; c.globalAlpha = U.clamp(2.4 - p.rr, 0, 1) * .8; D.circle(c, Math.cos(p.a) * r, Math.sin(p.a) * r, 2.2 * g.px, '#d9b8ff'); }
  c.globalAlpha = 1;
  if (g.showLabels) {
    const ph = layout().phone;
    if (S.mode === 'cells') { const V = layout().view, q = g.s2w(V.x0 + 14, V.y0 + 22); g.label('agar · glucose (green)', q[0], q[1], { color: '#8ff59acc', align: 'left', size: 11 }); }
    if (gf < .75 && S.mode === 'colony') { const a = ph ? 3.05 : 2.75, d = Math.min(dR * .95, Rc * 1.4); lab('glucose-depleted zone', Math.cos(a) * d, Math.sin(a) * d, { color: '#a9c4b4', size: 10.5 }); }
    if (ef > .08 && S.mode === 'colony') { const a = ph ? .62 : .35; lab('ethanol diffusing out', Math.cos(a) * Rc * 1.5, Math.sin(a) * Rc * 1.5, { color: '#dcc2ff', size: 10.5 }); }
  }
}
function cellInside(c, x, y, r, pal) { const gr = c.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); gr.addColorStop(0, pal.a); gr.addColorStop(1, pal.b); D.circle(c, x, y, r * .9, gr); }
function scar(c, cl, a, birth) {
  const x = cl.x + Math.cos(a) * cl.r * .93, y = cl.y + Math.sin(a) * cl.r * .93;
  D.ellipse(c, x, y, birth ? .55 : .42, birth ? .2 : .16, a + Math.PI / 2, null, birth ? 'rgba(255,243,196,.35)' : '#fff3c4', (birth ? 1.2 : 1.8) * g.px);
}
function drawCells(c) {
  for (const cl of S.cells) {
    const pal = cl.st === 'old' ? ST.dead : ST.grow, b = cl.st === 'bud' ? budGeom(cl) : null;
    if (cl.st === 'ready') D.glow(c, cl.x, cl.y, cl.r * 1.9, '#ffe14d', .35);
    D.circle(c, cl.x, cl.y, cl.r, pal.wall); if (b) D.circle(c, b.x, b.y, b.r, pal.wall);
    cellInside(c, cl.x, cl.y, cl.r, pal); if (b) cellInside(c, b.x, b.y, b.r, pal);
    D.circle(c, cl.x + cl.r * .22, cl.y + cl.r * .2, cl.r * .36, 'rgba(130,205,240,.4)');                    // vacuole
    D.circle(c, cl.x - cl.r * .28, cl.y - cl.r * .25, cl.r * .22, '#4b3f8f', '#b3a6f5', 1.2 * g.px);          // nucleus
    if (b) {
      if (cl.bp > .8) D.circle(c, b.x, b.y, b.r * .3, '#4b3f8f', '#b3a6f5', 1.2 * g.px);                     // daughter nucleus after anaphase
      const na = cl.budA, nx = cl.x + Math.cos(na) * (cl.r - .12), ny = cl.y + Math.sin(na) * (cl.r - .12), px = -Math.sin(na) * .5, py = Math.cos(na) * .5;
      D.circle(c, nx + px, ny + py, .13, '#b6f09c'); D.circle(c, nx - px, ny - py, .13, '#b6f09c');           // septin collar
    }
    for (const a of cl.scars) scar(c, cl, a, false);
    if (cl.birth != null) scar(c, cl, cl.birth, true);
  }
  if (!g.showLabels) return;
  const f = S.cells.find(x => x.founder);
  const few = S.cells.length <= 4;
  if (f && (g.obj.i < 5 || S.found) && S.cells.length <= 24) {
    const t = f.st === 'old' ? 'founder (senescent)' : 'founder';
    if (few) g.label(t, f.x - f.r - 6 * g.px, f.y + 4 * g.px, { color: '#f2d58a', bold: true, align: 'right' });
    else g.label(t, f.x, f.y + f.r + 12 * g.px, { color: '#f2d58a', bold: true });
  }
  if (f && few) { const a = f.scars[0], d = f.r + 14 * g.px; g.label('bud scars', f.x + Math.cos(a) * d, f.y + Math.sin(a) * d + 6 * g.px, { color: '#fff3c4', size: 10 }); }
  const d1 = S.cells.find(x => x.id === 1);
  if (d1 && few) g.label('her daughter', d1.x + d1.r + 6 * g.px, d1.y + 4 * g.px, { color: '#f2d58a', align: 'left' });
  if (S.cells.length > 4 && S.cells.length < IND_MAX) g.label(S.cells.length + ' cells', 0, -S.Rc - 18 * g.px, { color: '#e6eefb', bold: true });
}
function drawColony(c) {
  const Rc = S.Rc, z = zones(), sc = g.scale;
  const path = () => { c.beginPath(); for (let i = 0; i <= 90; i++) { const a = i / 90 * TAU, rr = Rc * lobe(a), x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); };
  const cu = U.clamp(z.coreU, 0, .9), gr = c.createRadialGradient(0, 0, 0, 0, 0, Rc);
  gr.addColorStop(0, ST[z.core].b); if (cu > .03) gr.addColorStop(cu, ST[z.core].a); gr.addColorStop(Math.min(.97, cu + .05), ST[z.rim].b); gr.addColorStop(1, ST[z.rim].a);
  path(); c.fillStyle = gr; c.fill();
  const hw = g.W / 2 / sc, hh = g.H / 2 / sc, A = 4.9, DY = A * .866;
  const vx0 = Math.max(-Rc * 1.05, g.cam.x - hw), vx1 = Math.min(Rc * 1.05, g.cam.x + hw), vy0 = Math.max(-Rc * 1.05, g.cam.y - hh), vy1 = Math.min(Rc * 1.05, g.cam.y + hh);
  const est = vx1 > vx0 && vy1 > vy0 ? (vx1 - vx0) * (vy1 - vy0) / (A * DY) : 0;
  if (2.2 * sc >= 2.2 && est > 0 && est <= 2600) {
    const lw = 1.1 * g.px, detail = 2.2 * sc > 9;
    for (let j = Math.floor(vy0 / DY); j <= Math.ceil(vy1 / DY); j++) {
      const off = (j & 1) ? A / 2 : 0;
      for (let i = Math.floor((vx0 - off) / A); i <= Math.ceil((vx1 - off) / A); i++) {
        const h = hash(i, j), x = i * A + off + (h - .5) * 1.2, y = j * DY + (hash(j + 3, i) - .5) * 1.2, d = Math.hypot(x, y);
        if (d > Rc * lobe(Math.atan2(y, x)) - 1.6) continue;
        const s = stateAt(d / Rc, hash(i + 7, j - 3), hash(i - 5, j + 11), z), pal = ST[s], r = (s === 'quies' ? 1.85 : 2.05) + h * .45;
        if ((s === 'grow' || s === 'resp') && hash(i + 3, j + 5) < .33) { const ba = hash(i, j + 9) * TAU, br = r * (.35 + .4 * hash(i + 1, j)); D.circle(c, x + Math.cos(ba) * (r + br * .6), y + Math.sin(ba) * (r + br * .6), br, pal.b, pal.wall, lw); }
        D.ellipse(c, x, y, r, r * .9, h * 3, pal.b, pal.wall, lw);
        if (detail) {
          if (s !== 'dead') D.circle(c, x + r * .25, y + r * .2, r * .33, 'rgba(130,205,240,.35)');
          if (hash(i + 13, j) < .5) { const sa = hash(i, j + 17) * TAU; D.ellipse(c, x + Math.cos(sa) * r * .9, y + Math.sin(sa) * r * .9, r * .18, r * .07, sa + Math.PI / 2, null, '#fff3c4', lw); }
        }
      }
    }
  } else {
    const rs = Math.max(2.3, 1.1 * g.px); c.globalAlpha = .5;
    for (const p of S.speck) { const rr = p.u * Rc * lobe(p.a) * .97; D.circle(c, Math.cos(p.a) * rr, Math.sin(p.a) * rr, rs, ST[stateAt(p.u, p.h, p.h2, z)].wall); }
    c.globalAlpha = 1;
  }
  { const hl = c.createRadialGradient(-Rc * .35, -Rc * .4, 0, -Rc * .2, -Rc * .25, Rc * 1.05); hl.addColorStop(0, 'rgba(255,255,255,.16)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); path(); c.fillStyle = hl; c.fill(); }   // dome highlight
  path(); c.strokeStyle = ST[z.rim].wall; c.lineWidth = 1.5 * g.px; c.stroke();
  if (S.phase === 'log' || S.phase === 'post' || S.phase === 'lag') { c.globalAlpha = .3; c.lineWidth = Math.max(4 * g.px, Rc * .03); c.strokeStyle = S.phase === 'post' ? '#c9a0ff' : '#b6f09c'; path(); c.stroke(); c.globalAlpha = 1; }
  if (S.heat) D.glow(c, 0, 0, Rc * 1.3, '#ff6a3d', .25);
  lab(fmtN(S.N) + ' cells · ⌀ ' + fmtLen(2 * Rc), 0, -Rc - 16 * g.px, { color: '#f6ecc9', bold: true, size: 12 });
}
function drawBac(c) {
  const b = S.bac, R = b.R;
  c.beginPath(); for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU, rr = R * (1 + .07 * Math.sin(5 * a + 1) + .04 * Math.sin(11 * a)), x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath();
  const gr = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, R); gr.addColorStop(0, '#efe9da'); gr.addColorStop(1, '#a89f88');
  c.globalAlpha = .9; c.fillStyle = gr; c.fill(); c.globalAlpha = 1; c.strokeStyle = '#fff8e6'; c.lineWidth = 1.2 * g.px; c.stroke();
  if (g.scale > 6) {                                       // individual rods when zoomed in
    const hw = g.W / 2 / g.scale, hh = g.H / 2 / g.scale;
    const x0 = Math.max(b.x - R, g.cam.x - hw), x1 = Math.min(b.x + R, g.cam.x + hw), y0 = Math.max(b.y - R, g.cam.y - hh), y1 = Math.min(b.y + R, g.cam.y + hh);
    if (x1 > x0 && y1 > y0 && (x1 - x0) * (y1 - y0) / 3 < 1500) {
      c.lineCap = 'round'; c.lineWidth = .75; c.strokeStyle = b.spores ? '#bdb6a2' : '#8f8672';
      for (let j = Math.floor(y0); j <= y1; j++) for (let i = Math.floor(x0 / 3); i <= x1 / 3; i++) {
        const x = i * 3 + (j & 1) * 1.5, y = j, a = hash(i, j) * .8 - .4;
        if (Math.hypot(x - b.x, y - b.y) > R - 1) continue;
        c.beginPath(); c.moveTo(x - Math.cos(a) * 1.1, y - Math.sin(a) * 1.1); c.lineTo(x + Math.cos(a) * 1.1, y + Math.sin(a) * 1.1); c.stroke();
        if (b.spores && hash(j, i) < .4) D.circle(c, x, y, .3, '#ffffff');
      }
    }
  }
  lab('Bacillus subtilis' + (b.spores ? ' (spores)' : ''), b.x, layout().phone ? b.y + R + 14 * g.px : b.y - R - 12 * g.px, { color: '#efe9da', italic: true });
}
function drawSig(c) {
  const L = layout().sig, s = st.sig; place(s, L.x, L.y, L.R);
  const R = L.R * g.px, a = Math.atan2(s.y, s.x), d = Math.hypot(s.x, s.y);
  if (d > S.Rc + R) {
    c.strokeStyle = 'rgba(94,234,212,.4)'; c.lineWidth = 1.2 * g.px; c.setLineDash([4 * g.px, 4 * g.px]);
    c.beginPath(); c.moveTo(s.x - Math.cos(a) * R, s.y - Math.sin(a) * R); c.lineTo(Math.cos(a) * S.Rc * .85, Math.sin(a) * S.Rc * .85); c.stroke(); c.setLineDash([]);
  }
  D.glow(c, s.x, s.y, R * 1.6, '#5eead4', .18);
  D.circle(c, s.x, s.y, R, 'rgba(8,16,28,.94)', '#5eead4', 1.5 * g.px);
  const cr = R * .8; D.circle(c, s.x, s.y, cr, ST.grow.wall); D.circle(c, s.x, s.y, cr * .9, '#1f5566');
  const nx = s.x + cr * .2, ny = s.y - cr * .15, nr = cr * .38; D.circle(c, nx, ny, nr, '#3a2f78', '#b3a6f5', 1.2 * g.px);
  const dot = (x, y, col) => D.circle(c, x, y, R * .07, col);
  if (!S.snf1) { for (let i = 0; i < 4; i++) dot(nx + Math.cos(i * 1.6) * nr * .5, ny + Math.sin(i * 1.6) * nr * .5, '#ff6b6b'); D.kinase(c, s.x - cr * .45, s.y + cr * .35, R * .2, '#7a8699', false); }
  else if (!S.rim15) { for (let i = 0; i < 4; i++) dot(s.x - cr * .55 + i * cr * .22, s.y + cr * .62 - (i % 2) * cr * .12, '#ff6b6b'); D.kinase(c, s.x - cr * .45, s.y + cr * .2, R * .2, '#ffcf5c', true); }
  else { for (let i = 0; i < 4; i++) dot(nx + Math.cos(i * 1.6) * nr * .5, ny + Math.sin(i * 1.6) * nr * .5, '#67e8f9'); D.kinase(c, s.x - cr * .45, s.y + cr * .3, R * .2, '#7ee787', true); }
  const q = g.s2w(L.x - L.R, L.y + L.R + 26);
  g.label(!S.snf1 ? 'one cell: Mig1 represses' : !S.rim15 ? 'one cell: Snf1 on, Mig1 out' : 'one cell: Rim15 → Msn2/4', q[0], q[1], { size: 10.5, color: '#a7f3e4', align: 'left' });
}

/* ---------------- drawing: screen-space panels (clickable via stations placed under them) ---------------- */
/* Desktop: two cards in the bottom corners. Phone (canvas < 560 px wide): two half-width cards side by side just above the
   hint bar; the colony is framed in the strip above them and the signalling cell sits in the top-left corner. */
function layout() {
  const W = g.W, H = g.H, hb = S.hb == null ? 58 : S.hb;          // hb: height of the engine's hint bar (measured, smoothed)
  if (W < 560 || H < 420) {                                          // phone, or a short (landscape) canvas: compact cards
    const h = 112, y = H - Math.max(44, hb + 16) - h, w = Math.min(240, (W - 22) / 2);
    const roomy = y - 12 > H * .4;                                     // enough room above the cards? otherwise they float over the view
    return { phone: true, curve: { x: 8, y, w, h, k: 1, phone: true }, prot: { x: W - 8 - w, y, w, h, k: 1, phone: true },
      view: { x0: 4, y0: 8, x1: W - 4, y1: roomy ? y - 4 : H - 8 }, agarMax: roomy ? y - 40 : H - 40, sig: { x: 14 + 26, y: 34 + 26, R: 26 } };
  }
  const k = U.clamp(Math.min(W / 900, H / 640), .8, 1.15), by = H - Math.max(84, hb + 30);
  const cw = 272 * k, ch = 166 * k, pw = 268 * k, ph = 166 * k;
  return { phone: false, curve: { x: 14, y: by - ch, w: cw, h: ch, k }, prot: { x: W - 14 - pw, y: by - ph, w: pw, h: ph, k },
    view: { x0: 0, y0: 0, x1: W, y1: H - 24 }, agarMax: H - hb - 64, sig: { x: 26 + 34 * k, y: 40 + 34 * k, R: 34 * k } };
}
function place(s, sx, sy, rpx) { const p = g.s2w(sx, sy); s.x = p[0]; s.y = p[1]; s.r = rpx / g.scale; }
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const font = (c, px, wt) => { c.font = `${wt || 500} ${px}px ${FONT}`; };
function panel(c, p, title) {
  const r = 12;
  c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14; c.shadowOffsetY = 3;
  c.fillStyle = 'rgba(7,14,24,.9)'; c.beginPath(); c.roundRect(p.x, p.y, p.w, p.h, r); c.fill(); c.restore();
  c.strokeStyle = 'rgba(94,234,212,.22)'; c.lineWidth = 1; c.beginPath(); c.roundRect(p.x + .5, p.y + .5, p.w - 1, p.h - 1, r); c.stroke();
  font(c, (p.phone ? 11 : 12 * p.k), 700); c.fillStyle = '#e3ecf8'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(title, p.x + (p.phone ? 9 : 11 * p.k), p.y + (p.phone ? 12 : 14 * p.k));
}
function drawCurve(c, p) {
  panel(c, p, 'Growth curve');
  const ph = p.phone, k = p.k;
  /* legend: one quiet row under the title */
  font(c, ph ? 9 : 10 * k, 600); c.textAlign = 'left';
  let lx = p.x + (ph ? 9 : 11 * k); const ly = p.y + (ph ? 26 : 30 * k);
  for (const [t, col] of [['cells (log)', '#f2d58a'], ['glucose', '#7CFC8A'], [ph ? 'ethanol' : 'ethanol (mM, right)', '#d9b8ff']]) {
    D.circle(c, lx + 3, ly, ph ? 2.6 : 3 * k, col); c.fillStyle = '#b8c6da'; c.fillText(t, lx + (ph ? 8 : 9 * k), ly); lx += c.measureText(t).width + (ph ? 16 : 20 * k);
  }
  const x0 = p.x + (ph ? 26 : 32 * k), x1 = p.x + p.w - (ph ? 10 : 30 * k), y0 = p.y + (ph ? 37 : 44 * k), y1 = p.y + p.h - (ph ? 16 : 20 * k);
  place(st.curve, (x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) / 2);
  const hNow = bioH(), hMax = Math.max(24, Math.ceil((hNow + .5) / 12) * 12);
  const X = h => x0 + (x1 - x0) * Math.min(1, h / hMax), Y = n => y1 - (y1 - y0) * n / 7, Ym = m => y1 - (y1 - y0) * U.clamp(m / 200, 0, 1);
  c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
  S.bands.forEach((b, i) => {
    const e = i + 1 < S.bands.length ? S.bands[i + 1].h : hNow, bx = X(b.h), bw = X(e) - bx;
    c.globalAlpha = .13; c.fillStyle = PH[b.ph].col; c.fillRect(bx, y0, bw, y1 - y0); c.globalAlpha = .9;
    font(c, ph ? 8.5 : 9 * k, 700); c.textAlign = 'center'; c.fillStyle = PH[b.ph].col;
    if (bw > c.measureText(PH[b.ph].short).width + 6) c.fillText(PH[b.ph].short, bx + bw / 2, y0 + (ph ? 6 : 8 * k));
    c.globalAlpha = 1;
  });
  c.restore();
  c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.09)'; font(c, ph ? 8.5 : 9.5 * k, 500); c.textBaseline = 'middle';
  for (const [n, t] of (ph ? [[0, '1'], [3, '10³'], [6, '10⁶']] : [[0, '1'], [2, '10²'], [4, '10⁴'], [6, '10⁶']])) {
    c.beginPath(); c.moveTo(x0, Y(n)); c.lineTo(x1, Y(n)); c.stroke(); c.textAlign = 'right'; c.fillStyle = '#d9c99a'; c.fillText(t, x0 - 4, Y(n));
  }
  if (!ph) { c.textAlign = 'left'; c.fillStyle = '#bba6e6'; for (const m of [0, 100, 200]) c.fillText(String(m), x1 + 4, Ym(m)); }
  c.textAlign = 'center'; c.fillStyle = '#9fb0c8'; c.textBaseline = 'top';
  const xs = ph ? hMax : hMax > 48 ? 24 : 12;
  for (let h = 0; h <= hMax; h += xs) { c.textAlign = h === 0 ? 'left' : h === hMax ? 'right' : 'center'; c.fillText(h + ' h', X(h) + (h === 0 ? -2 : 0), y1 + 3); }
  c.textBaseline = 'middle';
  const step = Math.max(1, Math.floor(S.curve.length / 300));
  const line = (fy, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (let i = 0; i < S.curve.length; i += step) { const s = S.curve[i]; i ? c.lineTo(X(s.h), fy(s)) : c.moveTo(X(s.h), fy(s)); } c.stroke(); };
  c.lineJoin = 'round';
  if (S.curve.length > 1) { line(s => Ym(s.G), 'rgba(124,252,138,.85)', 1.2); line(s => Ym(s.E), 'rgba(217,184,255,.85)', 1.2); line(s => Y(s.n), '#f2d58a', ph ? 2 : 2.2 * k); }
  const nx = X(hNow), ny = Y(Math.log10(Math.max(1, S.N)));
  D.glow(c, nx, ny, 9, '#fff3c4', .5); D.circle(c, nx, ny, 3, '#fff');
}
function drawProteome(c, p) {
  const ph = p.phone, k = p.k, a = alloc();
  panel(c, p, ph ? 'Proteome' : 'Proteome of an average cell');
  const r = ph ? 33 : 42 * k, cx = p.x + (ph ? 10 + r : 14 * k + r), cy = ph ? p.y + 22 + r + 2 : p.y + 30 * k + r + 4 * k;
  let ang = -Math.PI / 2;
  for (const key of ['R', 'E', 'S', 'Q']) {
    const f = a[key], a2 = ang + f * TAU, mid = (ang + a2) / 2, s = st['p' + key];
    const act = g.hover === s || g.sel === s, off = act ? 3 : 0, ox = Math.cos(mid) * off, oy = Math.sin(mid) * off;
    c.beginPath(); c.moveTo(cx + ox, cy + oy); c.arc(cx + ox, cy + oy, r, ang, a2); c.closePath(); c.fillStyle = PIE[key]; c.fill();
    c.strokeStyle = act ? '#ffffff' : '#08111d'; c.lineWidth = act ? 2 : 1.5; c.stroke();
    const lx = cx + Math.cos(mid) * r * .6, ly = cy + Math.sin(mid) * r * .6;
    place(s, lx, ly, ph ? 15 : 13 * k);
    if (f >= (ph ? .14 : .12)) { c.fillStyle = key === 'Q' ? '#e6edf7' : '#0b1626'; font(c, ph ? 9.5 : 10 * k, 700); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(Math.round(f * 100) + '%', lx, ly); }
    ang = a2;
  }
  const l = limits(a), lim = Math.min(l.tl, l.nl), m = lam(), riboLim = l.tl <= l.nl;
  const tx = cx + r + (ph ? 10 : 14 * k), tw = p.x + p.w - (ph ? 8 : 12 * k) - tx;
  c.textAlign = 'left'; c.textBaseline = 'middle';
  const rows = ph ? [['R', 'Ribosomes'], ['E', 'Enzymes'], ['S', 'Stress: ' + SL_NAME[S.sLvl]], ['Q', 'Housekeeping']]
    : [['R', 'Ribosomes'], ['E', 'Metabolic enzymes'], ['S', 'Stress: ' + SL_NAME[S.sLvl]], ['Q', 'Housekeeping']];
  let ty = p.y + (ph ? 30 : 36 * k); const rh = ph ? 13 : 15 * k, sq = ph ? 7 : 8 * k;
  for (const [key, t] of rows) {
    c.fillStyle = PIE[key]; c.beginPath(); c.roundRect(tx, ty - sq / 2, sq, sq, 2); c.fill();
    font(c, ph ? 9.5 : 11 * k, key === 'S' ? 700 : 500); c.fillStyle = key === 'S' ? '#ffe39a' : '#d5e1f2'; c.fillText(t, tx + sq + 5, ty); ty += rh;
  }
  if (ph) {
    font(c, 9, 600); c.fillStyle = riboLim ? PIE.R : PIE.E; c.fillText('limit: ' + (riboLim ? 'ribosomes' : 'enzymes'), tx, ty + 1);
  } else {
    ty += 3 * k;
    for (const [t, v, col, isLim] of [['ribosomes can build', l.tl, PIE.R, riboLim], ['enzymes can supply', l.nl, PIE.E, !riboLim]]) {
      c.fillStyle = 'rgba(255,255,255,.08)'; c.beginPath(); c.roundRect(tx, ty, tw, 5 * k, 2.5 * k); c.fill();
      c.globalAlpha = isLim ? 1 : .45; c.fillStyle = col; c.beginPath(); c.roundRect(tx, ty, Math.max(2, tw * Math.min(1, v / .6)), 5 * k, 2.5 * k); c.fill(); c.globalAlpha = 1;
      font(c, 9.5 * k, isLim ? 700 : 500); c.fillStyle = isLim ? '#ffffff' : '#9fb0c8'; c.fillText(t, tx, ty + 13 * k);
      if (isLim) { const w = c.measureText(t).width; font(c, 8.5 * k, 700); const tg = 'LIMITS', tgw = c.measureText(tg).width + 8 * k; if (tx + w + 6 * k + tgw <= p.x + p.w - 6 * k) { c.fillStyle = 'rgba(255,209,102,.18)'; c.beginPath(); c.roundRect(tx + w + 6 * k, ty + 13 * k - 6 * k, tgw, 12 * k, 6 * k); c.fill(); c.fillStyle = '#ffd166'; c.fillText(tg, tx + w + 10 * k, ty + 13 * k); } }
      ty += 22 * k;
    }
  }
  font(c, ph ? 10.5 : 12 * k, 700); c.fillStyle = '#ffe9a8'; c.textAlign = 'left';
  const msg = m > .005 ? (ph ? 'doubling ' : 'Cells double every ') + hm(LN2 / m) : 'Cells are not growing';
  c.fillText(msg, p.x + (ph ? 9 : 12 * k), p.y + p.h - (ph ? 10 : 13 * k));
}

/* =========================================================================================== */
CG.registerLevel({
  id: 'colony', title: 'A Yeast Colony', organism: 'Saccharomyces cerevisiae — from 2 cells to a million', color: '#c9a0ff',
  blurb: 'Two cells on a sugar plate become a visible colony. Steer the population through exponential growth, the diauxic shift and quiescence.',
  learn: 'Budding & bud scars · exponential growth · the growth curve · proteome allocation · Crabtree effect · diauxic shift · quiescence · ageing · stress',
  world: { x: -24, y: -15, w: 48, h: 30 },
  get maxZoom() { return S ? Math.max(6, S.E / 12) : 6; },
  scaleNote: 'cells to scale · molecules enlarged · panels are diagrams',
  shopTitle: 'Genome', shopSub: 'Gene <b>programmes</b> expressed across the whole colony. Making new protein in every cell costs ATP, so programmes cost more in a bigger colony.',
  intro: `<p>Your cell from level 1 has divided. You pick up the mother and her daughter and set them on a fresh <b>agar plate</b> — a jelly with 2 % glucose (~110 mM), peptone and yeast extract — at 30 °C.</p>
    <p>In about two days these two cells will become a <b>colony</b> you can see with the naked eye: close to <b>a million cells, about 1 mm across</b>. Steer the population through every stage of the classic growth curve.</p>
    <ul><li><b>Click cells waiting at START</b> (yellow marker) to make them bud. Later a gene automates this.</li>
    <li>Steer the <b>proteome</b> (bottom right): how much protein each cell puts into ribosomes, metabolic enzymes or stress protection decides how fast it grows — and how well it survives.</li>
    <li>Your <b>growth curve</b> (bottom left) records lag, exponential, diauxic and stationary phases as they happen.</li>
    <li><b>ATP</b> pays for gene programmes in the <b>Genome</b> panel. Click anything to learn what it really is.</li></ul>
    <p style="color:#93a4bf;font-size:13px">The strain is haploid, like the cell in level 1. 1 s of play ≈ 10 min of real time. Cells are drawn to scale — watch the scale bar as the colony grows.</p>`,

  phase() {
    const p = S.phase, l = lam();
    let s = PH[p].name;
    if (p === 'diauxic') s += S.snf1 ? ' — rewiring metabolism' : ' — glucose is gone';
    if ((p === 'log' || p === 'post' || p === 'lag') && l > .005) s += ' · cells double every ' + hm(LN2 / l);
    if (p === 'stat') s += ' · ' + Math.round(S.Q * 100) + ' % quiescent';
    if (S.heat) s += ' · 40 °C!';
    if (S.bac && !S.bac.spores) s += ' · agar pH ' + S.pH.toFixed(1);
    if (S.dry && !S.woken) s += ' · plate drying';
    return s;
  },
  clock() { const h = bioH(); return 't = ' + (h < 10 ? h.toFixed(1) : Math.round(h)) + ' h after plating · ' + Math.max(0, Math.log2((S.N + S.dead) / 2)).toFixed(1) + ' doublings'; },

  setup(game) {
    g = game; S = g.S; st = {};
    Object.assign(S, { E: 30, Rc: 5, mode: 'cells', phase: 'lag', N: 2, dead: 0, R: .20, sLvl: 'mid', cells: [], nextId: 0, objI: -1, objT: 0, price: {}, Q: 0, pH: 6.3, temp: 30,
      heat: false, heatDone: false, heat2Done: false, heatT: 0, heatLen: HEAT_T, heatN: 0, nk: null, nkT: 0, bac: null, bacDone: false, dry: false, dryT: 0, snf1: false, rim15: false, sigBusy: false, ye: 0, sampT: 0, curve: [], bands: [{ h: 0, ph: 'lag' }],
      camAuto: true, camLast: [0, 0], home: [0, 0], seenRim: false, seenCentre: false, inspected: false, seek: false, found: false, l1: U.rand(TAU), l2: U.rand(TAU),
      fd: { scars: 2, alive: true, life: Math.round(U.rand(21, 29)), p: 0 },
      stats: { starts: 0, manual: 0, divs: 0, glcUsed: 0, peakEth: 0, stolen: 0, heatDead: 0, atp: 0, allocClicks: 0 },
      field: [], eField: [], speck: [] });
    for (let i = 0; i < 170; i++) S.field.push({ u: U.rand(-1, 1), v: U.rand(-1, 1), a: U.rand(TAU) });
    for (let i = 0; i < 80; i++) S.eField.push({ a: U.rand(TAU), rr: U.rand(1.05, 2.4) });
    for (let i = 0; i < 420; i++) S.speck.push({ u: Math.sqrt(Math.random()), a: U.rand(TAU), h: Math.random(), h2: Math.random() });

    g.res.def('cells', { name: 'Cells', short: 'cells', v: 2, color: '#f2d58a', fmt: fmtN, desc: 'Living yeast cells in the colony. 20 doublings take 2 cells to ~2 million.' })
      .def('atp', { name: 'ATP', v: 20, color: '#ffe14d', fmt: fmtN, desc: 'Energy the colony can divert to new gene programmes. 1 unit ≈ 10¹⁰ ATP molecules; a fermenting cell makes very roughly that much every few minutes. (Real cells do not bank ATP — the pool turns over in seconds — so this is a running budget, not a store.)' })
      .def('glc', { name: 'Glucose (local)', short: 'glc', v: G0, cap: G0, color: '#7CFC8A', fmt: v => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' mM', desc: 'Glucose in the agar within reach of the colony. YPD plates contain 2 % glucose ≈ 110 mM.' })
      .def('eth', { name: 'Ethanol', short: 'EtOH', v: 0, cap: 200, color: '#d9b8ff', fmt: v => Math.round(v) + ' mM', desc: 'Ethanol made by fermentation even though oxygen is plentiful (the Crabtree effect). Once glucose is gone the colony eats it.' });

    /* ---- stations ---- */
    mk({ id: 'curve', name: 'Growth curve', noLabel: true, r: 1, info: curveInfo });
    const PN = { R: ['Ribosomes', 'click: +5 % ribosomes (from enzymes)', clickR], E: ['Metabolic enzymes', 'click: +5 % enzymes (from ribosomes)', clickE], S: ['Stress proteins', 'click: cycle medium → low → high', clickS], Q: ['Housekeeping proteins', 'fixed share', null] };
    for (const k of ['R', 'E', 'S', 'Q']) mk({ id: 'p' + k, name: PN[k][0], tip: PN[k][1], noLabel: true, hidden: true, r: 1,
      ready: () => adviceNow() === 'p' + k, onClick: PN[k][2] ? () => PN[k][2]() : null, info: () => protInfo(k) });
    mk({ id: 'centre', name: 'Colony centre', hidden: true, r: 5, ready: () => g.obj.i === 8 && !S.seenCentre, onClick: () => { S.seenCentre = true; g.learn('c_gradients'); }, info: centreInfo });
    mk({ id: 'rim', name: 'Growing rim', hidden: true, r: 2, ready: () => g.obj.i === 8 && !S.seenRim, onClick: () => { S.seenRim = true; g.learn('c_gradients'); }, info: rimInfo });
    mk({ id: 'agar', name: 'Agar plate (YPD, 2 % glucose)', short: 'agar · 2 % glucose', r: 2, info: agarInfo, ready: () => g.obj.i === 16 && !S.woken, onClick: () => { if (g.obj.i === 16 && !S.woken) wake(); } });
    mk({ id: 'sig', name: 'Nutrient signalling in a cell', tip: 'Snf1 · Mig1 · Rim15', noLabel: true, hidden: true, r: 2,
      ready: () => !S.sigBusy && ((S.phase === 'diauxic' && !S.snf1) || (S.phase === 'stat' && !S.rim15)), onClick: sigClick, info: sigInfo });
    mk({ id: 'bac', name: 'Bacillus subtilis colony', noLabel: true, hidden: true, r: 5, info: bacInfo });

    /* ---- founders ---- */
    newCell({ x: -2.1, y: 0, r: 2.4, r0: 2.4, rS: 2.45, scars: [U.deg(40), 0], founder: true, p: .5, g1: .2 });
    newCell({ x: 2.1, y: .1, r: 1.8, r0: 1.8, rS: 2.2, birth: Math.PI, p: .15, g1: .5 });

    /* ---- genome ---- */
    const add = o => g.shop.add(Object.assign({ max: 1 }, o));
    const price = id => () => ({ atp: S.price[id] || nice(4 * S.N) });
    /* the diauxic programmes need time: transcription, translation and new mitochondria take two to three hours */
    const expressLater = (_, it) => g.after(18, () => { g.shop.grant(it.id); g.toast('<i>' + it.gene + '</i> is now expressed.', 'good'); });
    add({ id: 'CLN3', gene: 'CLN3', title: 'G1 cyclin: automatic START', group: 'Cell cycle', cost: () => ({ atp: 40 }),
      req: () => g.obj.i >= 3 ? true : 'Try START by hand first (step 4)',
      desc: 'Cln3–Cdk1 phosphorylates the inhibitor Whi5 once a cell is big enough, so every cell passes START <b>on its own</b>.',
      onGrant: () => { for (const c of S.cells) if (c.st === 'ready') startBud(c, false); g.toast('Cells now commit to division by themselves. (Real <i>CLN3</i> overexpression also makes cells pass START at a smaller size.)', 'good'); } });
    add({ id: 'SFP', gene: 'SFP1 · IFH1', title: 'Ribosome-biogenesis programme', group: 'Growth', cost: () => ({ atp: 300 }),
      req: () => g.obj.i >= 5 ? true : 'Unlocks at step 6',
      desc: 'Activators of the ~140 ribosomal-protein genes and ~200 ribosome-biogenesis genes. Raises the maximum ribosome share from 25 % to <b>40 %</b>.',
      onGrant: () => g.toast('Ribosomes can now take up to 40 % of the proteome — if the enzymes can keep up.', 'good') });
    add({ id: 'HXT', gene: 'HXT1 · HXT3', title: 'Low-affinity glucose transporters', group: 'Growth', cost: () => ({ atp: 1500 }),
      req: () => g.obj.i >= 9 ? true : 'Unlocks at step 10',
      desc: 'High-capacity hexose transporters, induced when the glucose sensor Rgt2 signals the repressor Rgt1 off. Real cells on 2 % glucose already make them; here you buy extra: <b>+15 % nutrient supply</b> while glucose lasts.' });
    add({ id: 'SIR2', gene: 'SIR2', title: 'Extra sirtuin: longer replicative life', group: 'Ageing', cost: () => ({ atp: 2500 }),
      req: () => g.obj.i >= 9 ? true : 'Unlocks at step 10',
      desc: 'An extra copy of SIR2 silences the rDNA and cuts the formation of toxic rDNA circles: mothers live <b>~30 % longer</b>. Watch what that does for the colony as a whole.',
      onGrant: () => g.toast('Mothers now live longer — but since only about 1 cell in 2ᵏ has k or more bud scars, the colony barely notices.', '') });
    add({ id: 'HSP', gene: 'HSP104 · SSA4', title: 'Heat-shock chaperones', group: 'Stress', cost: price('HSP'), hidden: () => !S.heatDone,
      req: () => S.heatDone ? true : 'Induced by Hsf1 during heat shock',
      desc: 'Hsf1 targets: the disaggregase Hsp104 and the heat-inducible Hsp70 Ssa4 rescue unfolded proteins. Cuts heat deaths by ~3×.' });
    add({ id: 'PMA', gene: 'PMA1', title: 'Proton pump boost', group: 'Stress', cost: price('PMA'), hidden: () => !S.bacDone,
      req: () => S.bacDone ? true : 'Needed only when competitors appear',
      desc: 'More Pma1 H⁺-ATPase activity: fermenting cells pump protons out faster and <b>acidify the agar</b> around the colony 4× faster.' });
    add({ id: 'HAP4', onBuy: expressLater, gene: 'HAP4', title: 'Respiration programme', group: 'Diauxic shift', cost: price('HAP4'),
      req: () => S.snf1 ? true : 'Repressed by Mig1 while glucose lasts',
      desc: 'Hap4, the regulatory subunit of the Hap2/3/4/5 complex, switches on TCA-cycle and respiratory-chain genes: mitochondria multiply and burn acetyl-CoA for ATP.' });
    add({ id: 'ADR1', onBuy: expressLater, gene: 'ADR1 → ADH2 · ACS1', title: 'Ethanol utilisation', group: 'Diauxic shift', cost: price('ADR1'),
      req: () => S.snf1 ? true : 'Glucose-repressed: Adr1 needs active Snf1',
      desc: 'Adh2 runs the last step of fermentation backwards (ethanol → acetaldehyde); Ald4/6 make acetate and Acs1 turns it into acetyl-CoA.' });
    add({ id: 'CAT8', onBuy: expressLater, gene: 'CAT8 → ICL1 · MLS1 · FBP1 · PCK1', title: 'Glyoxylate cycle & gluconeogenesis', group: 'Diauxic shift', cost: price('CAT8'),
      req: () => S.snf1 ? true : 'Repressed by Mig1 while glucose lasts',
      desc: 'The glyoxylate cycle (Icl1, Mls1) turns 2-carbon units into 4-carbon ones without losing them as CO₂; gluconeogenesis (Pck1, Fbp1) builds sugars for walls and DNA.' });
    add({ id: 'TPS', gene: 'TPS1 · TPS2', title: 'Trehalose stores', group: 'Quiescence', cost: price('TPS'),
      req: () => S.rim15 ? true : 'Induced via Rim15 → Msn2/4 as carbon runs out',
      desc: 'Trehalose-6-phosphate synthase and phosphatase. Trehalose is a sugar that replaces water around membranes and proteins — key for surviving drying and heat.' });
    add({ id: 'GSY', gene: 'GSY2 · GLG1', title: 'Glycogen stores', group: 'Quiescence', cost: price('GSY'),
      req: () => S.rim15 ? true : 'Induced via Rim15 → Msn2/4 as carbon runs out',
      desc: 'Glycogen synthase and the primer glycogenin: an energy reserve that quiescent cells live on for weeks, and burn to restart growth.' });

    /* ---- objectives ---- */
    const pct = (v, t) => [Math.round(Math.min(1, v / t) * 100), 100];
    g.obj.set([
      { text: 'Meet the founder: click the mother cell', why: 'The big cell is your cell from level 1; the small one is the daughter she made there.', target: 'cell0',
        hint: 'Click the <b>founder</b> (yellow marker) and read about her in the inspector on the left. Count her bud scars.', check: () => S.inspected },
      { text: 'Pass START: click a cell with a yellow marker', why: 'A cell that has grown big enough in G1 can commit to division. Here, you make that call.',
        hint: 'When a cell is big enough it waits at <b>START</b> (yellow marker). Click it: a bud appears right next to its last bud scar.', check: () => S.stats.starts >= 1 },
      { text: 'Grow to 16 cells', why: 'Keep clicking cells at START. Mothers are ready again quickly; small daughters need longer.',
        hint: 'Click every cell with a yellow marker. Watch the <b>growth curve</b> climb in steps: 2 → 4 → 8 → 16.',
        check: () => S.N >= 16, progress: () => [Math.min(16, Math.floor(S.N)), 16], onDone: () => g.learn('c_growth') },
      { text: 'Express <i>CLN3</i>: cells pass START on their own', why: 'Genome panel (right) → <i>CLN3</i>.',
        hint: 'Open the <b>Genome</b> panel on the right and express <i>CLN3</i> (40 ATP).', check: () => lv('CLN3') >= 1 },
      { text: 'More ribosomes: get the cell doubling time ≤ 2 h', why: 'Click the tan <b>ribosome</b> slice of the proteome pie (bottom right).', target: 'pR',
        hint: 'Growth is limited by how much protein ribosomes can make. Click the <b>ribosome slice</b> of the proteome pie to give them a bigger share.',
        onStart: () => g.learn('c_growthlaw'), check: () => S.phase !== 'lag' && lam() >= LN2 / 2 - 1e-6, progress: () => pct(lam(), LN2 / 2) },
      { text: 'Grow a microcolony of 64 cells', why: 'Each doubling doubles the colony. Watch the scale bar as the view zooms out.',
        hint: 'Cells now divide by themselves — two more doublings. Meanwhile, can you find the founder among her descendants?', check: () => S.mode === 'colony', progress: () => [Math.min(64, Math.floor(S.N)), 64],
        onStart: () => { S.seek = true; g.obj.addSide({ id: 'seek', text: 'Find the founder among her descendants', hint: 'She is the <b>biggest</b> cell, with the most bud scars: mothers grow a little with every division.',
          check: () => S.found, onDone: () => g.toast('Found her: ' + S.fd.scars + ' bud scars already. Every daughter you see started with none.', 'good') }); },
        onDone: () => { g.obj.removeSide('seek'); g.learn('c_ageing'); } },
      { text: 'Express <i>SFP1 · IFH1</i> and reach a ≤ 105-min doubling', why: 'Then rebalance: fewer stress proteins, more ribosomes — but not so many that the enzymes cannot feed them.',
        hint: 'Express <i>SFP1 · IFH1</i>, then tune the pie: the bar marked <b>limits growth</b> tells you which side is the bottleneck. Lower stress to <b>low</b>, raise ribosomes until the two bars meet.',
        check: () => lv('SFP') >= 1 && lam() >= LN2 / 1.75 - 1e-6, progress: () => [(lv('SFP') >= 1) + (lam() >= LN2 / 1.75 - 1e-6), 2] },
      { text: 'Grow to 2,000 cells', why: 'The colony piles up into a dome; from above you see only its top layer.',
        hint: 'Zoom in (scroll wheel, or pinch on a touch screen) to see single cells in the colony.', check: () => S.N >= 2000, progress: () => [Math.min(2000, Math.floor(S.N)), 2000] },
      { text: 'Inspect the colony rim and its centre', why: 'Click both and compare what the cells are doing.',
        hint: 'Click the <b>growing rim</b> and the <b>colony centre</b>. Food reaches them very differently.', check: () => S.seenRim && S.seenCentre, progress: () => [S.seenRim + S.seenCentre, 2] },
      { text: 'Grow to 100,000 cells', why: 'Look at the ethanol counter: the colony ferments glucose even though air is all around it — the Crabtree effect.',
        hint: 'Exponential growth: every doubling adds as many cells as all previous doublings together. Ethanol piles up in the agar.',
        onStart: () => g.learn('c_crabtree'), check: () => S.N >= 1e5 || S.phase !== 'log', progress: () => [Math.round(Math.log2(Math.max(2000, S.N) / 2000) * 10), Math.round(Math.log2(50) * 10)] },
      { text: 'Glucose runs out: activate Snf1', why: 'Wait until the glucose is gone, then click the signalling cell (top left).', target: 'sig',
        hint: 'Growth slows as glucose runs out. When the <b>signalling cell</b> gets a yellow marker, click it to activate the energy sensor Snf1.',
        check: () => S.snf1, progress: () => [Math.round(G0 - res('glc')), G0] },
      { text: 'Rewire metabolism: express <i>HAP4</i>, <i>ADR1</i> and <i>CAT8</i>', why: 'Respiration, ethanol uptake, and making sugars from 2-carbon units. Growth on ethanol needs all three.',
        hint: 'The colony is stuck in the <b>diauxic lag</b>. Express the three programmes in the Genome panel to start eating ethanol.',
        check: () => lv('HAP4') && lv('ADR1') && lv('CAT8'), progress: () => [lv('HAP4') + lv('ADR1') + lv('CAT8'), 3] },
      { text: 'Rebalance the proteome for ethanol: doubling ≤ 5 h', why: 'Ethanol is a poor food. Too many ribosomes now just wait for building blocks.',
        hint: 'Check which bar <b>limits growth</b>. On ethanol the enzymes are the bottleneck: shift protein from ribosomes to <b>metabolic enzymes</b>.',
        check: () => S.phase === 'post' && lam() >= LN2 / 5, progress: () => pct(lam(), LN2 / 5) },
      { text: 'Ethanol is gone: activate Rim15', why: 'Slow respiratory growth uses up the ethanol. Then the cell signals for quiescence.', target: 'sig',
        hint: 'Wait for the ethanol to run out, then click the <b>signalling cell</b> again.', check: () => S.rim15, progress: () => [Math.round(Math.max(0, S.stats.peakEth - res('eth'))), Math.round(S.stats.peakEth) || 1] },
      { text: 'Prepare for quiescence (≥ 75 % in G0)', why: 'Express <i>TPS1·TPS2</i> and <i>GSY2·GLG1</i>, and set stress proteins to <b>high</b>.',
        hint: 'Stock up trehalose and glycogen and switch the proteome to protection. Cells become dense, unbudded, stress-proof G0 cells.',
        check: () => lv('TPS') && lv('GSY') && S.sLvl === 'high' && S.Q >= .75 - 1e-6, progress: () => [Math.round(S.Q * 100), 75] },
      { text: 'Survive the plate drying out', why: 'Quiescent, trehalose-loaded cells can survive drying that kills growing cells.',
        hint: 'Keep stress protection on <b>high</b> and wait it out.', onStart: startDry,
        check: () => S.dryT >= DRY_T, progress: () => [Math.floor(S.dryT), DRY_T] },
      { text: 'Wake them up: drip fresh glucose onto the agar', why: 'Quiescent cells can wait for months. Feed them and see how fast they restart.', target: 'agar',
        hint: 'Click the <b>agar</b> next to the colony to add a drop of glucose solution.', check: () => S.woken },
      { text: 'Back to growth: rebalance the proteome', why: 'Protection is no longer needed. Give the protein back to ribosomes and enzymes.',
        hint: 'Lower <b>stress</b> to low and raise <b>ribosomes</b> again. Watch the growth curve: a second lag, then a new climb.',
        check: () => S.phase === 'log' && lam() >= LN2 / 2 - 1e-6 && S.N >= S.wakeN * 1.25,
        progress: () => [(S.phase === 'log') + (lam() >= LN2 / 2 - 1e-6) + (S.N >= S.wakeN * 1.25), 3], onDone: () => g.after(1.5, finish) },
    ]);
    g.learn('c_colony');
    setWorld();
  },

  testBot() {},

  update(_, dt) {
    if (g.obj.i !== S.objI) { S.objI = g.obj.i; S.objT = 0; } else S.objT += dt;
    const dtH = dt * MIN_PER_S / 60;
    if (S.phase === 'lag' && bioH() >= (S.lagEnd || 1.3)) setPhase('log');

    /* events */
    if (!S.heatDone && g.obj.i >= 7 && S.N >= 1200 && S.phase === 'log') startHeat();
    if (S.heat) {
      S.heatT += dt;
      const k = .018 * { low: 1, mid: .55, high: .18 }[S.sLvl] * (lv('HSP') ? .35 : 1) * (S.heat2Done ? .5 : 1) * dt, d = S.N * k;
      S.N -= d; S.dead += d; S.stats.heatDead += d;
      if (S.heatT >= S.heatLen) endHeat();
    }
    { const nk = nudge(); if (nk !== S.nk) { S.nk = nk; S.nkT = 0; } else S.nkT += dt; }
    S.temp = U.approach(S.temp, S.heat ? 40 : 30, dt * 2);
    if (!S.heat2Done && g.obj.i === 13 && S.phase === 'post' && S.objT > 14 && res('eth') > 40) startHeat2();
    if (!S.bacDone && g.obj.i >= 9 && S.N >= 4e4 && !S.heat && res('glc') > 40 && S.phase === 'log') startBac();
    if (S.bac) updBac(dtH, dt);

    /* growth */
    if (S.mode === 'cells') updCells(dt); else updColony(dt, dtH);

    /* carbon-source transitions */
    if (S.phase === 'log' && res('glc') < 4 && !S.woken) {
      setPhase('diauxic');
      g.banner({ title: 'Glucose is running out', text: 'Growth stalls: the diauxic shift. Fermentation genes go down; the cells must switch on respiration and learn to eat the ethanol they made.', kind: 'stress', dur: 8 });
    }
    if (S.phase === 'diauxic' && S.snf1 && lv('HAP4') && lv('ADR1') && lv('CAT8')) {
      setPhase('post'); S.ye = res('eth') / (2 * S.N);
      g.banner({ title: 'Growing on ethanol', text: 'Mitochondria now burn the ethanol the colony made earlier — respiration gets far more ATP out of each carbon than fermentation did, but slowly. Growth resumes at a few hours per doubling.', kind: 'good', dur: 8 });
    }
    if (S.phase === 'post' && res('eth') < 2) {
      setPhase('stat');
      g.banner({ title: 'Stationary phase', text: 'No carbon left. Growth stops. To survive the coming weeks the cells must enter quiescence (G0).', kind: 'stress', dur: 8 });
    }
    if (S.phase === 'stat') {
      const tq = S.rim15 ? .35 + .25 * lv('TPS') + .15 * lv('GSY') + .1 * (S.sLvl === 'high') : .15;
      S.Q = U.approach(S.Q, tq, dt * .04);
    }
    if (S.woken) { S.Q = U.approach(S.Q, 0, dt * .12); S.dryT = Math.max(0, S.dryT - dt * 4); }
    else if (S.dry && S.dryT < DRY_T) {
      S.dryT = Math.min(DRY_T, S.dryT + dt);
      const prot = .45 * S.Q + .25 * lv('TPS') + .1 * lv('GSY') + .15 * (S.sLvl === 'high'), d = S.N * Math.max(.0015, .02 * (1 - prot)) * dt;
      S.N -= d; S.dead += d;
    }

    /* ATP budget */
    const N = S.N, Gm = mm(res('glc'), KS), Em = mm(res('eth'), KS);
    let inc;
    if (S.phase === 'lag' || S.phase === 'log') inc = N * (.3 + .7 * Gm);
    else if (S.phase === 'diauxic') inc = N * (.12 + .5 * Gm + .45 * lv('HAP4') * Em);
    else if (S.phase === 'post') inc = N * (.12 + .45 * lv('HAP4') * Em);
    else inc = N * .04;
    if (S.heat || S.dry) inc *= .5;
    g.res.set('atp', res('atp') + inc * dt); S.stats.atp += inc * dt;
    g.res.set('cells', S.N);

    /* camera: the world grows with the colony */
    const [fx, fy] = aspF();
    let tgt = S.mode === 'cells' && layout().phone ? Math.max(24, 3.4 * S.Rc) : Math.max(30, 2.1 * 2 * S.Rc);
    if (S.bac) tgt = Math.max(tgt, 2 * (Math.abs(S.bac.y) + S.bac.R + 70) / fy, 2 * (Math.abs(S.bac.x) + S.bac.R + 70) / fx);
    S.E += (tgt - S.E) * Math.min(1, dt * .7); setWorld(); followCam();

    /* stations */
    const i = g.obj.i, E = S.E, Rc = S.Rc;
    for (const k of ['R', 'E', 'S', 'Q']) st['p' + k].hidden = i < 4;
    st.centre.hidden = st.rim.hidden = S.mode !== 'colony';
    st.centre.x = 0; st.centre.y = 0; st.centre.r = Rc * .35;
    st.rim.x = Math.cos(2.5) * Rc * .86; st.rim.y = Math.sin(2.5) * Rc * .86; st.rim.r = Rc * .14;
    placeAgar();
    st.sig.hidden = !(S.mode === 'colony' && i >= 9);
    st.bac.hidden = !S.bac; if (S.bac) { st.bac.x = S.bac.x; st.bac.y = S.bac.y; st.bac.r = Math.max(S.bac.R, 1); }

    /* ambient */
    for (const p of S.eField) { p.rr += dt * .03; if (p.rr > 2.4) p.rr = 1.05; }
    S.sampT -= dt;
    if (S.sampT <= 0) { S.sampT = .4; S.curve.push({ h: bioH(), n: Math.log10(Math.max(1, S.N)), G: res('glc'), E: res('eth') }); if (S.curve.length > 4000) S.curve.splice(0, 1000); }
  },

  bg(c, _, W, H) {
    const gr = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * .75);
    gr.addColorStop(0, '#112a26'); gr.addColorStop(1, '#07120f'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    if (S.dry) { c.fillStyle = `rgba(90,62,24,${.45 * S.dryT / DRY_T})`; c.fillRect(0, 0, W, H); }
    if (S.temp > 30.5) { c.fillStyle = `rgba(255,80,40,${(S.temp - 30) / 10 * .14})`; c.fillRect(0, 0, W, H); }
  },
  drawBack(c) {
    setWorld(); followCam(); placeAgar();                  // also here, so a resize while paused re-frames at once
    drawAgar(c);
    if (S.bac) drawBac(c);
    if (S.mode === 'cells') drawCells(c); else drawColony(c);
    if (!st.sig.hidden) drawSig(c);
  },
  drawFront(c) {
    let hh = 58; try { const e = document.getElementById('hint'); if (e && typeof e.offsetHeight === 'number') hh = e.offsetHeight; } catch (err) {}
    S.hb = S.hb == null ? hh : U.approach(S.hb, hh, Math.max(1, Math.abs(hh - S.hb)) * .12);
    c.save(); c.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    const L = layout();
    drawCurve(c, L.curve);
    if (!st.pR.hidden) drawProteome(c, L.prot);
    c.restore();
  },
});

/* ---------- codex ---------- */
CG.levels.find(l => l.id === 'colony').codex = [
  { id: 'c_colony', title: 'A colony by the numbers', html: `<p>A yeast colony starts as one cell (or a few) on an agar surface. After about two days at 30 °C it is a cream-coloured dome roughly 1 mm across holding on the order of a million cells — about 20 doublings, since 2²⁰ ≈ 10⁶.</p>
    <ul><li>While small (up to ~100 cells) a microcolony is a single layer of cells lying on the agar.</li><li>Then cells pile up into a dome: from above you only see the top layer.</li>
    <li>Only cells near the edge and near the agar keep dividing fast, so a big colony widens at a roughly constant speed rather than exponentially.</li>
    <li>Older colonies develop internal structure: layers with different metabolism, stress resistance and fate.</li></ul>
    <p><b>What the game changes:</b> up to 64 cells are simulated one by one with real budding geometry. Beyond that a population model — cell number, a growth law and a carbon budget — drives the colony, and the cells you see are generated to match it. The colony is treated as if it had only the sugar within its reach, so the growth phases happen one after another as in a flask. One second of play ≈ 10 minutes.</p>` },
  { id: 'c_budding', title: 'Budding, bud scars and bud-site choice', html: `<p><i>S. cerevisiae</i> divides by <b>budding</b>: a small outgrowth appears at START, grows through S, G2 and M, receives one nucleus and pinches off. Division is asymmetric — the daughter is smaller and must grow longer in G1 before her own START.</p>
    <p>Where the bud forms is not random. <b>Haploid</b> cells (a or α) bud <b>axially</b>: the new bud appears right next to the previous one, guided by a transient landmark of Bud3, Bud4, Axl1 and Axl2 left at the old division site. <b>Diploid</b> a/α cells bud <b>bipolarly</b>, from either end, using the landmarks Bud8 and Bud9. Either way the landmark is read by the Ras-like GTPase Rsr1/Bud1, which recruits Cdc24 to activate <b>Cdc42</b>, the master of cell polarity.</p>
    <p>Each division leaves a ring of chitin on the mother: a <b>bud scar</b> (the daughter gets a fainter birth scar). Scars light up with the dye Calcofluor white, so a mother's age can be counted under a microscope. In this level the axial pattern is why buds form in chains next to each other.</p>` },
  { id: 'c_growth', title: 'Exponential growth and the growth curve', html: `<p>If every cell divides every <i>t</i><sub>d</sub> minutes, the population is N = N₀·2<sup>t/t<sub>d</sub></sup>. The growth rate λ = ln 2 / t<sub>d</sub>; for yeast on glucose at 30 °C, t<sub>d</sub> ≈ 90 min, λ ≈ 0.46 h⁻¹.</p>
    <p>Plotted on a logarithmic axis, exponential growth is a straight line. A batch culture shows the classic phases:</p>
    <ol><li><b>Lag</b> — cells adapt to the new medium (induce transporters, rebuild ribosomes). An hour or two for yeast taken from a fresh culture; longer from an old one.</li>
    <li><b>Exponential (log)</b> — steady fermentative growth on glucose.</li>
    <li><b>Diauxic shift</b> — glucose runs out; growth pauses while metabolism is rewired.</li>
    <li><b>Post-diauxic</b> — slow respiratory growth on ethanol (doubling times of several hours).</li>
    <li><b>Stationary</b> — no usable carbon left; cells stop dividing and enter quiescence.</li></ol>
    <p>Exponential growth is relentless: one bacterium dividing every 20 minutes would, if nothing stopped it, outweigh the Earth in under two days. Something always stops it — here, running out of food.</p>` },
  { id: 'c_growthlaw', title: 'Proteome allocation: the growth law', html: `<p>A cell's protein budget is finite. Roughly half is "housekeeping" that hardly changes; the rest is split between <b>ribosomes</b> (which make protein), <b>metabolic enzymes</b> (which bring in food and make building blocks and ATP) and <b>stress protection</b>.</p>
    <p>Growth needs both halves of the factory. Ribosomes can only work as fast as enzymes feed them, and enzymes are pointless without ribosomes to use their products. Hence the <b>growth law</b>, first measured precisely in <i>E. coli</i> (Scott, Hwa and colleagues, 2010) and since shown in yeast (Metzl-Raz et al., 2017): the ribosomal share of the proteome rises linearly with growth rate. On a rich food the best cell is ribosome-heavy; on a poor food like ethanol it shifts protein into enzymes.</p>
    <p>Stress protection is the third claimant. When yeast meets stress, the "environmental stress response" (Gasch et al., 2000) switches on ~300 protective genes and switches off ~600 growth genes, mostly ribosome biogenesis. Fast growth and robustness trade off.</p>
    <p><b>In the game:</b> λ = min(κ<sub>t</sub>(φ<sub>R</sub> − 0.05), κ<sub>n</sub>·φ<sub>E</sub>). Real cells tune the split themselves through TORC1, PKA, Sch9, Sfp1 and Msn2/4 — you play that regulator.</p>` },
  { id: 'c_crabtree', title: 'The Crabtree effect', html: `<p>Baker's yeast ferments glucose to ethanol even when oxygen is plentiful, as long as sugar is abundant. Respiration would give roughly 8–10× more ATP per glucose (yeast lacks complex I, so it makes ~16–20 ATP by respiration rather than the textbook ~30), yet the colony "wastes" most of the sugar's energy as ethanol. This is the <b>Crabtree effect</b>, named after Herbert Crabtree, who saw glucose suppress respiration in tumour tissue in 1929.</p>
    <p>Why? Fermentation makes ATP <i>faster</i> per unit of protein invested — the enzymes are cheap compared with a whole respiratory chain — so it supports faster growth (a proteome-allocation argument). It also turns the sugar into ethanol that many competitors tolerate poorly, and that yeast can eat later: the "<b>make–accumulate–consume</b>" strategy. The trait evolved step by step in the ancestors of <i>S. cerevisiae</i>, roughly 100–150 million years ago and before the yeast whole-genome duplication (Hagman et al., 2013) — around the time flowering, fruit-bearing plants spread.</p>
    <p>A similar choice — fast glycolysis despite oxygen — is made by many cancer cells and by fast-growing immune cells (the Warburg effect).</p>` },
  { id: 'c_gradients', title: 'Life inside a colony', html: `<p>A colony is not a well-mixed flask. Every nutrient must diffuse up from the agar through layers of cells that are all eating it, and oxygen diffuses down from the air. The result is a set of gradients:</p>
    <ul><li>The <b>rim</b>, sitting on fresh agar, keeps dividing and fermenting.</li><li>The <b>centre</b> and the <b>top</b> run short of glucose first, switch to respiration and eventually stop dividing.</li>
    <li>Ethanol, CO₂ and other products diffuse out and form a halo around the colony.</li></ul>
    <p>Over days, cells in different places become different: studies of aging yeast colonies describe upper and lower layers with distinct metabolism and fates (e.g. Čáp et al., 2012). Colonies of wild strains can even form wrinkled, structured "biofilm-like" shapes held together by the adhesin Flo11.</p>` },
  { id: 'c_heat', title: 'Heat shock and bet hedging', html: `<p>Lab yeast grow best around 30 °C and slow sharply near 37–40 °C. A sudden temperature jump unfolds proteins. Two transcription factors respond:</p>
    <ul><li><b>Hsf1</b> is normally held in check by the chaperone Hsp70. When unfolded proteins soak up Hsp70, Hsf1 is freed and induces <i>HSP104</i>, <i>SSA4</i>, <i>HSP82</i> and other chaperone genes.</li>
    <li><b>Msn2/Msn4</b> move into the nucleus and induce the general stress response: trehalose synthesis, Hsp12, Hsp26, catalase.</li></ul>
    <p>Hsp104 pulls proteins out of aggregates so they can refold; it is essential for <b>induced thermotolerance</b> — after a mild heat shock, yeast survive a severe one much better (Sanchez & Lindquist, 1990).</p>
    <p>Even without warning, some cells are ready. In microcolonies, individual cells vary in growth rate, and the slow-growing ones carrying more of the trehalose-synthase subunit Tsl1 survive heat best (Levy, Ziv & Siegal, 2012). This is <b>bet hedging</b>: a population spreads its risk by keeping a few cautious cells around.</p>` },
  { id: 'c_competition', title: 'Microbial competition on a plate', html: `<p>Air carries bacterial spores, mould spores and yeasts; any of them can land on an open plate. On shared agar, competitors race for the same sugar.</p>
    <p><i>Bacillus subtilis</i> is a classic contaminant: a soil bacterium that divides every 20–40 minutes in rich medium and, when starved, packs its genome into a tough <b>endospore</b> that survives heat, drying and UV for years.</p>
    <p>Yeast fight chemically. Pma1 pumps protons out, and fermentation releases CO₂ and small amounts of organic acids, so actively fermenting yeast acidify their surroundings. Many bacteria, including most <i>Bacillus</i> strains, grow poorly below about pH 5. In fruit, where whole populations ferment, the accumulated ethanol is a second weapon.</p>
    <p><b>In the game</b> the competition is simplified and exaggerated: the bacteria only take glucose and are only stopped by acidity.</p>` },
  { id: 'c_diauxic', title: 'The diauxic shift', html: `<p>When glucose runs out, a fermenting yeast population faces a pile of its own ethanol — a perfectly good food, if the cell can switch its metabolism around. That switch is the <b>diauxic shift</b>, and it reprograms hundreds of genes (DeRisi, Iyer & Brown, 1997, one of the first genome-wide expression studies).</p>
    <ol><li><b>Sensing:</b> as glucose falls, the kinase <b>Snf1</b> (yeast AMPK) is phosphorylated by Sak1, Tos3 or Elm1. It phosphorylates the repressor <b>Mig1</b>, which leaves the nucleus.</li>
    <li><b>Ethanol uptake:</b> the activator <b>Adr1</b> induces <i>ADH2</i> (ethanol → acetaldehyde) and <i>ACS1</i> (acetate → acetyl-CoA), plus peroxisome genes.</li>
    <li><b>Building sugars from C2:</b> <b>Cat8</b> and Sip4 induce the glyoxylate cycle (<i>ICL1</i>, <i>MLS1</i>), which saves carbon that the TCA cycle would lose as CO₂, and gluconeogenesis (<i>PCK1</i>, <i>FBP1</i>), which makes glucose-6-phosphate for cell walls, nucleotides and storage.</li>
    <li><b>Respiration:</b> the Hap2/3/4/5 complex, through its regulated subunit <b>Hap4</b>, boosts TCA-cycle and respiratory-chain genes; mitochondria proliferate.</li></ol>
    <p>Meanwhile ribosome-biogenesis genes are switched down. Growth resumes, but slowly — doubling times of several hours — and usually adds only one or two more doublings.</p>` },
  { id: 'c_quiescence', title: 'Stationary phase and quiescence', html: `<p>When carbon runs out, cells do not simply stop — they prepare for a long wait, starting already at the diauxic shift. The growth kinases TORC1, PKA and Sch9 fall silent, which releases the kinase <b>Rim15</b>. Rim15 activates the transcription factors <b>Msn2/Msn4</b> and <b>Gis1</b>, which switch on:</p>
    <ul><li><b>Trehalose</b> (Tps1, Tps2) — a sugar that protects membranes and proteins against drying and heat;</li><li><b>Glycogen</b> (Gsy2, glycogenin Glg1) — an energy store;</li>
    <li>chaperones, antioxidant enzymes, a thicker cell wall, and autophagy to recycle unneeded parts.</li></ul>
    <p>The result is <b>quiescence</b> (G0): unbudded, dense, stress-resistant cells with low metabolism. In stationary cultures, quiescent cells — mostly daughters — can be separated by their high density from non-quiescent cells, which age faster and lose viability (Allen et al., 2006). Quiescent yeast can survive for months and restart within hours when fed.</p>
    <p>How long cells survive in this non-dividing state is called <b>chronological lifespan</b>, a widely used model of the ageing of non-dividing cells such as neurons.</p>` },
  { id: 'c_ageing', title: 'Replicative ageing', html: `<p>Yeast was the first organism in which ageing of single cells was measured directly: Mortimer and Johnston (1959) removed each daughter with a needle and counted how many buds a mother made. Lab strains manage ~25 on average; the mother grows larger, her cycle slows, and she stops.</p>
    <p>Why do mothers age while daughters start fresh? Damage is kept in the mother:</p>
    <ul><li><b>Extrachromosomal rDNA circles (ERCs)</b> pop out of the repetitive rDNA locus, copy themselves every S phase and stay in the mother's nucleus (Sinclair & Guarente, 1997).</li>
    <li><b>Oxidised and aggregated proteins</b> are retained in the mother; this needs Sir2 (Aguilaniu et al., 2003) and Hsp104 (Erjavec et al., 2007).</li></ul>
    <p>The sirtuin <b>Sir2</b> silences the rDNA and limits ERC formation: an extra copy extends lifespan by ~30 % (Kaeberlein, McVey & Guarente, 1999). Yet in a growing colony ageing hardly matters: half of all cells are newborn daughters, a quarter have one scar, an eighth two… a 25-scar cell is one in tens of millions.</p>` },
];
})();
