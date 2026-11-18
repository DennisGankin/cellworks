/* LEVEL 1 — one budding yeast cell (Saccharomyces cerevisiae) goes through one cell cycle.
   All coordinates are micrometres in a cell-local frame (cell centre = 0,0; bud grows to the right). */
(function () {
'use strict';
const { U, D } = CG, TAU = U.TAU;
const R = 2.5;                                   // mother radius: real haploid yeast are ~4–6 µm across
const NUC = { x: .7, y: -.8, r: .9 };            // nucleus ≈ 2 µm across
const VAC = { x: .45, y: .95, r: .75 };
const LANE = { x1: -2.0, y1: -.15, x2: -1.0, y2: -.4 };
const GLY = ['Hxk2', 'Pgi1', 'Pfk1', 'Fba1', 'Tpi1', 'Tdh3', 'Pgk1', 'Gpm1', 'Eno2', 'Cdc19'];
const NADMAX = 8, BIO_START = 36, BIO_DIV = 86, GLYC_NEED = 6;
const RIBO_POS = [[-.6, .3], [-.2, 0], [-.75, .85], [-1.05, .45]];
let g, S, st = {};

const pm = (deg, rr) => { const a = U.deg(deg); return { lx: Math.cos(a) * (rr || R), ly: Math.sin(a) * (rr || R), ang: a }; };
const lv = id => g.shop.level(id);
const res = id => g.res.get(id);
const nadh = () => NADMAX - res('nad');
const mm = (c, km) => c / (c + km);
const mitoCap = () => S.lowGlc ? lv('HAP4') : 1;          // high glucose represses respiration again (Mig1)
const inCell = (x, y) => Math.hypot(x, y) < (R - .4) * S.k;
const W = (lx, ly) => ({ x: lx * S.k, y: ly * S.k });
function bud() {                                  // bud geometry in the local frame
  if (S.phase === 'G1') return null;
  const f = U.clamp((res('bio') - BIO_START) / (BIO_DIV - BIO_START), 0, 1), r = .32 + 1.5 * Math.max(S.budVis, 0) * (.15 + .85 * f);
  return { r, x: R + r - .28 + S.sep * .55 };
}
function neck() { const b = bud(); if (!b) return { x: R, h: .3 }; const bx = R + b.r - .28; const xn = (R * R - b.r * b.r + bx * bx) / (2 * bx); return { x: xn, h: Math.sqrt(Math.max(.01, R * R - xn * xn)) }; }

/* ---------- generic "machine" behaviour: jobs with a duration, manual click or automatic ---------- */
function proc(s, cfg) {
  s.jobs = []; s.cfg = cfg;
  s.tryStart = manual => {
    if (s.jobs.length >= cfg.cap()) { if (manual) g.floatText(s.x, s.y - .3, 'Busy…', '#cbd5e1'); return false; }
    const no = cfg.can();
    if (no !== true) { if (manual) { g.floatText(s.x, s.y - .3, no, '#ff9a9a'); CG.sfx('bad'); } return false; }
    const job = { t: 0, dur: cfg.time() }; cfg.start(job); s.jobs.push(job); return true;
  };
  /* once a machine runs by itself, a click gives a short, real regulatory boost (cfg.boost) */
  const B = cfg.boost; s.boostT = 0; s.boostCd = 0;
  s.onClick = () => {
    if (B && cfg.auto()) {
      if (s.boostCd > 0) { g.floatText(s.x, s.y - .3, s.boostT > 0 ? 'Boost active' : 'Recovering…', '#cbd5e1'); return; }
      s.boostT = B.dur; s.boostCd = B.dur + B.cd; g.floatText(s.x, s.y - .35, B.text, '#ffe14d'); g.ring(s.x, s.y, '#ffe14d', .1, .8, .6); CG.sfx('good'); S.stats.boost = (S.stats.boost || 0) + 1; return;
    }
    s.tryStart(true);
  };
  s.ready = () => cfg.auto() ? !!B && s.boostCd <= 0 && (!B.when || B.when()) : s.jobs.length < cfg.cap() && cfg.can() === true;
  s.update = (_, __, dt) => {
    s.boostT = Math.max(0, s.boostT - dt); s.boostCd = Math.max(0, s.boostCd - dt);
    const rate = (cfg.rate ? cfg.rate() : 1) * (s.boostT > 0 ? B.mult : 1);
    for (const j of s.jobs) { j.t += dt * rate; if (cfg.tick) cfg.tick(j); if (j.t >= j.dur) { j.done = true; cfg.finish(j); } }
    s.jobs = s.jobs.filter(j => !j.done);
    if (cfg.auto()) { s.autoT = (s.autoT || 0) - dt; if (s.autoT <= 0 && (!cfg.autoCan || cfg.autoCan())) { s.tryStart(false); s.autoT = .12; } }
    if (!cfg.noRing) s.progress = s.jobs.length ? s.jobs[0].t / s.jobs[0].dur : null;
  };
}
function mk(o) { const s = g.addStation(o); st[o.id] = s; return s; }

/* ---------- molecules ---------- */
function fly(draw, from, to, dur, cb, opt) {
  const t = g.token({ x: from.x, y: from.y, draw });
  t.to(to, dur, opt); if (cb) t.then(cb); t.die(); return t;
}
const dGlu = (c, t) => D.glucose(c, t.x, t.y, .075, t.age * 2);
const dPyr = (c, t) => D.pyruvate(c, t.x, t.y, .07, t.age * 3);
const dATP = (c, t) => D.atp(c, t.x, t.y, .06);
const dAA = (c, t) => D.aa(c, t.x, t.y, .05);
function atpPop(s, n, key) { key = key || s; const quiet = key._ft && g.t - key._ft < .9; if (!quiet) key._ft = g.t; g.res.add('atp', n, quiet ? null : { x: s.x, y: s.y - .25 }); S.stats.atp += n; if (quiet) return; for (let i = 0; i < Math.min(n, 4); i++) { const t = g.token({ x: s.x + U.rand(-.1, .1), y: s.y, draw: dATP }); t.to(s.x + U.rand(-.5, .5), s.y + U.rand(-.5, .1), .7).fade(.3).die(); } }

function spawnMis(x, y) {
  const t = g.token({ x, y, r: .13, clickR: .2, name: 'Misfolded protein', tip: 'click: tag with ubiquitin → proteasome', seed: U.rand(9),
    draw: (c, t) => { D.protein(c, t.x, t.y, .11, '#d0d0d0', t.seed, true); if (t.sent) { for (let i = 0; i < 3; i++) D.circle(c, t.x + .12 + i * .06, t.y - .12 - i * .05, .035, '#ff7ad1'); } },
    wander: { speed: .22, bound: inCell, home: () => ({ x: 0, y: 0 }) }, onClick: sendToProt });
  S.mis.push(t); g.learn('y_qc');
  if (!S.seenMis) { S.seenMis = true; g.toast('A protein <b>misfolded</b>. Click it to tag it with ubiquitin and send it to the proteasome.', 'bad'); }
}
function sendToProt(t) {
  if (t.sent) return; t.sent = true; t.onClick = null; t.wander = null; S.mis = S.mis.filter(m => m !== t);
  g.floatText(t.x, t.y - .15, 'ubiquitin tag', '#ff7ad1');
  t.to(st.prot, null, { speed: 1.8 }).then(() => { S.protQ++; }).die();
}
function refold(t) {
  S.mis = S.mis.filter(m => m !== t); t.onClick = null; t.wander = null; t.draw = (c, t) => { D.protein(c, t.x, t.y, .1, '#7ee787', t.seed); };
  g.floatText(t.x, t.y - .15, 'refolded', '#7ee787'); g.ring(t.x, t.y, '#ffd166', .05, .3, .5);
  if (res('bio') < g.res.cap('bio')) g.res.add('bio', 1);
  t.wait(.5).fade(.5).die();
}
function cascade(from, names, col, done) {
  const to = W(NUC.x, NUC.y), n = names.length;
  const tk = g.token({ x: from.x, y: from.y, draw: (c, t) => D.kinase(c, t.x, t.y, .13, col, true) });
  names.forEach((nm, i) => {
    const p = (i + 1) / n;
    tk.to(U.lerp(from.x, to.x, p) + (i < n - 1 ? U.rand(-.12, .12) : 0), U.lerp(from.y, to.y, p) + (i < n - 1 ? U.rand(-.12, .12) : 0), .5)
      .then(t => { g.floatText(t.x, t.y - .18, nm, col); g.ring(t.x, t.y, col, .05, .35, .5); CG.sfx('pop'); }).wait(.3);
  });
  tk.then(done).fade(.3).die();
}

/* ---------- gene expression pipeline: transcription → export → translation → delivery ---------- */
function express(_, it) { S.txQ.push(it); g.learn('y_dogma'); }
function deliver(it, from) {
  const dest = it.dest === 'ribo' ? S.ribos[Math.min(3, it.level + it.pending - 1)].st : st[it.dest];
  const col = it.col || '#7ee787';
  const done = () => { g.shop.grant(it.id); S.stats.genes++; g.burst(dest.x, dest.y, col, 14); g.ring(dest.x, dest.y, col, .1, .7, .7); g.floatText(dest.x, dest.y - .35, it.gene + ' in place', col); CG.sfx('good'); };
  if (it.via) {                                  // transcription factors / ribosomal proteins act in the nucleus first
    const t = g.token({ x: from.x, y: from.y, seed: U.rand(9), draw: (c, t) => D.protein(c, t.x, t.y, .11, col, t.seed) });
    t.to(st.nuc, 1).then(tt => { g.floatText(tt.x, tt.y - .5, it.via, col); g.ring(tt.x, tt.y, col, .1, .6, .6); }).wait(1.1).to(dest, 1.1).then(done).die();
  } else if (it.er) {                            // membrane protein: ER → COPII vesicle → Golgi → secretory vesicle → plasma membrane
    g.learn('y_secretory');
    const t = g.token({ x: from.x, y: from.y, draw: (c, t) => D.vesicle(c, t.x, t.y, .1, '#f2d58a', col) });
    t.to(st.golgi, .9).then(tt => g.floatText(tt.x, tt.y - .2, 'Golgi: sorted', '#e0b040')).wait(.6).to(dest, 1.1).then(done).die();
  } else {
    const t = g.token({ x: from.x, y: from.y, seed: U.rand(9), draw: (c, t) => D.protein(c, t.x, t.y, .11, col, t.seed) });
    t.to(dest, 1.1).then(done).die();
  }
}
function updExpression(dt) {
  if (!S.tx && S.txQ.length) S.tx = { it: S.txQ.shift(), t: 0, dur: 2.2 };
  if (S.tx) {
    S.tx.t += dt;
    if (S.tx.t >= S.tx.dur) {
      const it = S.tx.it, n = W(NUC.x, NUC.y), npc = W(NUC.x + Math.cos(U.deg(150)) * NUC.r, NUC.y + Math.sin(U.deg(150)) * NUC.r);
      const tk = g.token({ x: n.x, y: n.y, name: it.gene + ' mRNA', draw: (c, t) => D.mrna(c, t.x, t.y, .34, '#f0a8ff', t.age * 5) });
      tk.to(npc, .7).then(t => { g.floatText(t.x, t.y - .15, 'mRNA export', '#f0a8ff'); S.mrna.push({ it, tk: t }); });
      S.tx = null;
    }
  }
  for (const m of S.mrna.slice()) {              // hand waiting mRNAs to a free ribosome (ER-bound for membrane proteins)
    if (m.it.er) {
      if (!S.erJob) { S.erJob = { it: m.it, t: -.7, dur: m.it.tl || 3.5 }; m.tk.to(st.er, .7).die(); S.mrna.splice(S.mrna.indexOf(m), 1); }
    } else {
      const rb = S.ribos.find(r => !r.st.hidden && !r.job);
      if (rb) { rb.job = { type: 'gene', it: m.it, t: -.7, dur: m.it.tl || 3.5 }; m.tk.to(rb.st, .7).die(); S.mrna.splice(S.mrna.indexOf(m), 1); }
    }
  }
  if (S.erJob) { S.erJob.t += dt; if (S.erJob.t >= S.erJob.dur) { deliver(S.erJob.it, st.er); S.erJob = null; } }
  st.er.progress = S.erJob && S.erJob.t > 0 ? S.erJob.t / S.erJob.dur : null;
}

/* ---------- ribosomes ---------- */
function misP() { return (S.heat ? .34 : .07) * Math.pow(.5, lv('SSA')); }
function growthBlock() {
  if (S.osmo && S.glycerol < GLYC_NEED) return 'Hog1 has paused growth until the cell regains volume';
  if (res('bio') >= g.res.cap('bio')) return S.phase === 'G1' ? 'Critical size reached — pass START (click the nucleus)' : 'Bud is full size — time for mitosis';
  if (res('atp') < 4) return 'Needs 4 ATP per amino acid';
  if (res('aa') < 1) return 'No amino acids — import some';
  return true;
}
function startBio(rb, manual) {
  if (rb.job) { if (manual) g.floatText(rb.st.x, rb.st.y - .25, 'Translating…', '#cbd5e1'); return; }
  const no = growthBlock();
  if (no !== true) { if (manual) { g.floatText(rb.st.x, rb.st.y - .25, no, '#ff9a9a'); CG.sfx('bad'); } return; }
  g.res.spend({ atp: 4, aa: 1 }); rb.job = { type: 'bio', t: 0, dur: 3 };
  if (manual) g.floatText(rb.st.x, rb.st.y - .25, '−4 ATP  −1 aa', '#ffd9a0');
}
function updRibos(dt) {
  const slow = (S.mis.length >= 6 ? .5 : 1) * (S.lowGlc ? .4 : 1), auto = lv('RIBI') >= 2 && S.grow;
  S.ribos.forEach((rb, i) => {
    rb.st.hidden = i >= lv('RIBI');
    if (rb.st.hidden) return;
    if (rb.job) {
      rb.job.t += dt * slow;
      if (rb.job.t >= rb.job.dur) {
        const j = rb.job; rb.job = null;
        if (j.type === 'gene') deliver(j.it, rb.st);
        else if (Math.random() < misP()) spawnMis(rb.st.x, rb.st.y);
        else {
          g.res.add('bio', 1); S.stats.bio++;
          const b = bud(), tgt = b && res('bio') > BIO_START ? W(b.x + U.rand(-.5, .5) * b.r, U.rand(-.5, .5) * b.r) : (() => { const a = U.rand(TAU), r = U.rand(.4, 2); return W(Math.cos(a) * r, Math.sin(a) * r); })();
          const t = g.token({ x: rb.st.x, y: rb.st.y - .2, seed: U.rand(9), draw: (c, t) => D.protein(c, t.x, t.y, .085, '#8fd3ff', t.seed) });
          t.to(tgt, 1.2).fade(.6).die();
          if (S.stats.bio === 1) g.floatText(rb.st.x, rb.st.y - .3, '+1 biomass', '#8fd3ff');
        }
      }
    } else if (auto && !S.mrna.some(m => !m.it.er) && res('atp') >= 12) startBio(rb, false);
    rb.st.progress = rb.job && rb.job.t > 0 ? rb.job.t / rb.job.dur : null;
  });
}

/* ---------- events ---------- */
function startDrought() {
  if (S.droughtDone) return; S.droughtDone = true; S.lowGlc = true; S.Gset = 4;
  g.banner({ title: 'Glucose is running out', text: 'The culture has eaten most of the sugar (110 mM → ~4 mM). Hxt1 barely works at this concentration, and starving cells throttle translation: growth slows until you adapt.', kind: 'stress', dur: 8 });
  g.after(3, () => {
    const n = W(NUC.x, NUC.y);
    g.floatText(n.x, n.y - .5, 'Snf1 kinase active → Mig1 leaves the nucleus', '#ffcf5c');
    const t = g.token({ x: n.x, y: n.y, draw: (c, t) => { D.protein(c, t.x, t.y, .1, '#ff8f8f', 4); D.circle(c, t.x + .1, t.y - .1, .04, '#ffe14d'); } });
    t.to(W(-.3, -1.4), 1.2).fade(.8).die();
    S.sig.snf1 = true; g.learn('y_signal'); g.learn('y_respire');
    g.toast('Glucose repression lifted: <i>HXT7</i> and <i>HAP4</i> can now be expressed.', 'good');
  });
}
function endDrought() {
  S.lowGlc = false; S.Gset = 100; st.hxt7.hidden = true;
  g.banner({ title: 'Fresh medium!', text: 'Glucose is back at 2 % (110 mM). Mig1 returns to the nucleus: Hxt7 is pulled from the membrane and digested in the vacuole, the mitochondrial network shrinks back, and the cell ferments again (Crabtree effect).', kind: 'good' });
}
function startHeat() {
  if (S.heatDone) return; S.heatDone = true; S.heat = true;
  g.banner({ title: 'Heat shock: 30 °C → 39 °C', text: 'Proteins unfold and misfold. Unfolded proteins soak up Hsp70, which frees the transcription factor Hsf1.', kind: 'stress', dur: 8 });
  g.after(2.5, () => { S.sig.hsf1 = true; g.learn('y_qc'); g.toast('Hsf1 is active: chaperone genes <i>SSA1 · HSP104</i> can now be expressed.', 'good'); });
  g.obj.addSide({ id: 'heat', text: 'Heat shock: express chaperones', hint: 'Genome → <i>SSA1 · HSP104</i>. Meanwhile click misfolded proteins to send them to the proteasome.', check: () => lv('SSA') >= 1 });
  g.after(75, () => { S.heat = false; g.banner({ title: 'Back to 30 °C', text: 'The heat shock is over. Chaperones made now stay around and protect against the next one (acquired thermotolerance).', kind: 'good' }); });
}
function startOsmo() {
  if (S.osmoDone) return; S.osmoDone = true; S.osmo = true;
  g.banner({ title: 'Osmotic shock!', text: 'Salt in the medium pulls water out. The cell shrinks within seconds and growth stops.', kind: 'stress', dur: 8 });
  g.learn('y_hog');
  g.obj.addSide({ id: 'osmo', text: 'Osmotic shock: restore cell volume', hint: '1) Click the <b>Sln1</b> osmosensor to relay the signal. 2) Genome → <i>GPD1</i>. 3) Gpd1 turns glucose into glycerol until the cell re-inflates.',
    progress: () => [Math.min(S.glycerol, GLYC_NEED), GLYC_NEED], check: () => S.glycerol >= GLYC_NEED,
    onDone: () => { S.osmo = false; g.banner({ title: 'Volume restored', text: 'Glycerol inside now balances the salt outside, water flows back in and growth resumes.', kind: 'good' }); } });
}

/* ---------- cell-cycle actions on the nucleus ---------- */
function nucAction() {
  if (S.phase === 'G1' && res('bio') >= BIO_START && S.allowStart) return 'start';
  if (S.phase === 'G2' && res('bio') >= BIO_DIV && !S.osmo) return 'ana';
  return null;
}
function doNuc() {
  const a = nucAction(), n = st.nuc;
  if (a === 'start') {
    S.phase = 'S'; g.res.cap('bio', BIO_DIV); S.budVis = 0; g.learn('y_cycle'); g.focus(1.0, 0, g.W < 560 ? 1.3 : 1.08);
    g.banner({ title: 'START — committed to divide', text: 'Cln3–Cdk1 phosphorylates Whi5, Whi5 leaves the nucleus, SBF switches on CLN1/2. A bud emerges and DNA replication begins.', kind: 'good', dur: 8 });
    for (let i = 0; i < 5; i++) { const t = g.token({ x: n.x + U.rand(-.3, .3), y: n.y + U.rand(-.3, .3), draw: (c, t) => D.circle(c, t.x, t.y, .06, '#ff6b6b') }); t.to(n.x + U.rand(-1.6, -.9), n.y + U.rand(.4, 1.3), 1.2).fade(1).die(); }
    g.floatText(n.x, n.y - .6, 'Whi5 exported', '#ff6b6b');
  } else if (a === 'ana') {
    S.phase = 'M'; g.learn('y_mitosis');
    g.banner({ title: 'Anaphase', text: 'APC/C–Cdc20 destroys securin (Pds1). Separase (Esp1) cuts cohesin and the spindle pulls sister chromatids apart — inside an intact nuclear envelope.', kind: 'good', dur: 8 });
  }
}

/* =========================================================================================== */
CG.registerLevel({
  id: 'yeast', title: 'One Yeast Cell', organism: 'Saccharomyces cerevisiae — baker\'s yeast', color: '#f2d58a',
  blurb: 'Import sugar, make ATP, express genes, build proteins — and steer a single cell through one complete division cycle.',
  learn: 'Glycolysis · fermentation vs respiration · transcription & translation · protein quality control · stress signalling · the cell cycle',
  world: { x: -4.4, y: -3.5, w: 10.6, h: 7 }, maxZoom: 5,
  scaleNote: 'cell drawn to scale · molecules enlarged',
  shopTitle: 'Genome', shopSub: 'Upgrades are <b>genes</b>. Each purchase is transcribed in the nucleus, exported, translated on a ribosome and shipped to its workplace.',
  intro: `<p>You are the control system of a single yeast cell, about <b>5 µm</b> across, floating in sugary broth at 30 °C.
    Your goal is what every microbe wants: <b>grow and divide</b>.</p>
    <ul><li><b>Click machines</b> (proteins) when they show a yellow marker to make them do their job.</li>
    <li><b>ATP</b> is your money. You earn it by breaking down glucose and spend it on everything else.</li>
    <li>Open the <b>Genome</b> panel to express genes: more copies of a protein make a step run by itself.</li>
    <li>Click anything to read what it really is. The 📖 codex collects what you learn.</li></ul>
    <p style="color:#93a4bf;font-size:13px">One token ≈ a few million real molecules, and a real cycle takes ~90 minutes instead of a few. Stoichiometry (ATP per glucose, ATP per amino acid, NADH balance) is kept real.</p>`,

  phase() {
    const p = { G1: 'G1 — growing', S: 'S — replicating DNA, bud emerging', G2: 'G2 — bud growing', M: 'M — anaphase', T: 'Telophase', C: 'Cytokinesis', done: 'Two cells' }[S.phase];
    return p + (S.heat ? ' · 39 °C' : '') + (S.osmo ? ' · hyperosmotic' : '') + (S.lowGlc ? ' · low glucose' : '');
  },
  clock() {
    const b = res('bio'); let m;
    if (S.phase === 'G1') m = 38 * Math.min(1, b / BIO_START); else if (S.phase === 'S') m = 38 + 25 * S.dna; else if (S.phase === 'G2') m = 63 + 17 * U.clamp((b - BIO_START) / (BIO_DIV - BIO_START), 0, 1);
    else if (S.phase === 'M') m = 80 + 5 * S.ana; else if (S.phase === 'T') m = 85; else m = 85 + 5 * S.cyto;
    return 'cell-cycle clock ≈ ' + Math.round(m) + ' / 90 min';
  },

  setup(game) {
    g = game; S = g.S; st = {};
    Object.assign(S, { k: .86, size: .86, osmK: 1, Gset: 100, phase: 'G1', gluc: 0, glucFly: 0, pyr: 0, eth: 0, glycerol: 0, mis: [], protQ: 0, dna: 0, dnaT: 0, ana: 0, cyto: 0, sep: 0, budVis: 0,
      grow: true, heat: false, osmo: false, lowGlc: false, temp: 30, sig: { glc: false, snf1: false, hsf1: false, hog: false }, stats: { glyc: 0, ferm: 0, resp: 0, bio: 0, imp: 0, genes: 0, atp: 0 },
      txQ: [], tx: null, mrna: [], ribos: [], erJob: null, medium: [], heatT: 0, capT: 0, chapT: 0, drain: 0, akT: 0, pmaT: 0 });
    g.res.def('atp', { name: 'ATP', v: 16, cap: 100, color: '#ffe14d', desc: 'Adenosine triphosphate — the cell\'s energy currency. A yeast cell holds ~3 mM ATP (tens of millions of molecules) and turns the whole pool over within seconds.' })
      .def('aa', { name: 'Amino acids', short: 'aa', v: 8, cap: 30, color: '#ff8ad8', desc: 'The 20 building blocks of proteins. Imported from the medium by H⁺-symport permeases (or made from glucose and ammonium).' })
      .def('nad', { name: 'NAD⁺ (free)', short: 'NAD⁺', v: NADMAX, cap: NADMAX, color: '#6ec6ff', desc: 'Glycolysis hands electrons to NAD⁺, turning it into NADH. The pool is small, so NADH must be re-oxidised — by fermentation or by the respiratory chain — or glycolysis stops.' })
      .def('bio', { name: 'Biomass', short: 'biomass', v: 0, cap: BIO_START, color: '#8fd3ff', desc: 'New proteins, ribosomes, membranes and wall. A yeast cell is ~50 million protein molecules; it must roughly double everything before it can divide.' })
      .def('glc', { name: 'Glucose outside', short: 'glc', v: 100, cap: 100, color: '#7CFC8A', fmt: v => Math.round(v * 1.1) + ' mM', desc: 'Glucose concentration in the medium. Standard lab medium has 2 % glucose ≈ 110 mM.' });

    /* ---- anchors that follow cell size ---- */
    S.anc = { laneIn: { lx: LANE.x1, ly: LANE.y1 }, laneOut: { lx: LANE.x2, ly: LANE.y2 }, pyr: { lx: -.72, ly: -.45 }, glu: { lx: -2.0, ly: .1 } };

    /* ---- membrane proteins ---- */
    const H1 = pm(180);
    mk({ id: 'hxt1', name: 'Hxt1 glucose transporter', short: 'Hxt1', lx: H1.lx, ly: H1.ly, r: .3,
      draw(c, s) { const n = lv('HXT1'); for (let i = 0; i < n; i++) { const a = U.deg(180 + (i - (n - 1) / 2) * 8); D.transporter(c, Math.cos(a) * R * S.k, Math.sin(a) * R * S.k, a, .27, '#58d68d', s.jobs.length > i); } },
      info: { title: 'Hxt1 — hexose transporter', sub: 'Plasma membrane · facilitated diffusion', body: 'A 12-helix carrier that alternately opens to the outside and the inside, letting glucose move down its concentration gradient into the cell. It uses <b>no ATP</b>: the gradient exists because hexokinase immediately phosphorylates incoming glucose.',
        facts: ['Low affinity, high capacity: K<sub>m</sub> ≈ 100 mM, so it only works well when sugar is plentiful.', 'Yeast has about 20 hexose-transporter-like genes (HXT1–17, GAL2, SNF3, RGT2) and switches between them as sugar levels change.', 'A fermenting cell takes up tens of millions of glucose molecules per second.'],
        game: 'Real transporters never need a click — uptake rate here follows real Michaelis–Menten kinetics once you have several copies.',
        live: () => [['Uptake rate', Math.round(mm(res('glc'), 90) * 100) + ' % of V<sub>max</sub>'], ['Transporters', lv('HXT1')]] } });
    proc(st.hxt1, { cap: () => lv('HXT1'), time: () => 1.15, rate: () => mm(res('glc'), 90), auto: () => lv('HXT1') >= 2,
      can: () => S.gluc + S.glucFly + st.hxt1.jobs.length + st.hxt7.jobs.length >= 6 ? 'Cytosol is full of glucose — run glycolysis' : true,
      start() {}, finish() { importGlc(st.hxt1); } });
    const H7 = pm(200);
    mk({ id: 'hxt7', name: 'Hxt7 high-affinity transporter', short: 'Hxt7', lx: H7.lx, ly: H7.ly, r: .28, hidden: true,
      draw(c, s) { const n = lv('HXT7'); for (let i = 0; i < n; i++) { const a = U.deg(200 + (i - (n - 1) / 2) * 8); D.transporter(c, Math.cos(a) * R * S.k, Math.sin(a) * R * S.k, a, .25, '#b8f26a', s.jobs.length > i); } },
      info: { title: 'Hxt7 — high-affinity transporter', sub: 'Plasma membrane · only made when glucose is scarce', body: 'Same job as Hxt1, but it grabs glucose even at very low concentrations. Its gene is repressed while sugar is abundant and switched on when Snf1 kinase removes the repressor Mig1.',
        facts: ['K<sub>m</sub> ≈ 1–2 mM — 50–100× tighter than Hxt1.', 'When glucose returns, Hxt7 is pulled off the membrane and digested in the vacuole.'],
        live: () => [['Uptake rate', Math.round(mm(res('glc'), 1.3) * 100) + ' % of V<sub>max</sub>']] } });
    proc(st.hxt7, { cap: () => S.lowGlc ? lv('HXT7') : 0, time: () => 2.0, rate: () => mm(res('glc'), 1.3), auto: () => true,
      can: () => S.gluc + S.glucFly + st.hxt1.jobs.length + st.hxt7.jobs.length >= 6 ? 'Cytosol is full of glucose' : true, start() {}, finish() { importGlc(st.hxt7); } });
    function importGlc(s) {
      S.glucFly++; S.stats.imp++; g.learn('y_glyco');
      const a = Math.atan2(s.y, s.x), t = g.token({ x: s.x + Math.cos(a) * .45, y: s.y + Math.sin(a) * .45, draw: dGlu });
      t.to(s, .3).to(S.anc.glu, .45).then(() => { S.glucFly--; S.gluc++; }).die();
    }

    const SN = pm(160);
    mk({ id: 'snf3', name: 'Snf3 / Rgt2 glucose sensors', short: 'Snf3/Rgt2', lx: SN.lx, ly: SN.ly, r: .28,
      draw(c, s) { D.receptor(c, s.x, s.y, SN.ang, .3, '#ffd166', !S.sig.glc && S.allowSig); },
      ready: () => S.allowSig && !S.sig.glc && !S.sigBusy,
      onClick(s) {
        if (S.sig.glc || !S.allowSig || S.sigBusy) return; S.sigBusy = true;
        cascade(s, ['Yck1 (at the membrane) marks Mth1 / Std1', 'Mth1 / Std1 degraded', 'Rgt1 repressor off'], '#ffd166', () => { S.sig.glc = true; g.learn('y_signal'); g.toast('Signal reached the nucleus: <i>HXT</i> genes are unlocked.', 'good'); });
      },
      info: { title: 'Snf3 & Rgt2 — glucose sensors', sub: 'Plasma membrane · signalling, not transport', body: 'They look like transporters but have lost the ability to carry sugar. Instead, glucose binding makes them signal through casein kinase Yck1: the co-repressors Mth1 and Std1 are destroyed, the repressor Rgt1 lets go of DNA, and <i>HXT</i> transporter genes switch on.',
        facts: ['Rgt2 senses high glucose (turns on <i>HXT1</i>); Snf3 senses low glucose (turns on <i>HXT2/4</i>).', 'The cell thereby matches its transporters to the sugar actually available.'] } });
    const AP = pm(130);
    mk({ id: 'aap', name: 'Amino-acid permeases (Agp1, Bap2)', short: 'aa permease', lx: AP.lx, ly: AP.ly, r: .28,
      draw(c, s) { D.transporter(c, s.x, s.y, AP.ang, .27, '#ff8ad8', s.jobs.length > 0); },
      info: { title: 'Amino-acid permeases', sub: 'Plasma membrane · H⁺ symport', body: 'Each amino acid enters together with a proton. The proton gradient that drives this is built by the Pma1 pump — so importing amino acids indirectly costs ATP.',
        facts: ['Yeast has ~18 amino-acid permeases; Agp1 and Bap2 are induced when amino acids are detected outside (SPS sensor).', 'In nitrogen-poor media the cell switches to the scavenger permease Gap1.', 'Importing an amino acid (~1 ATP) is far cheaper than building one from glucose and ammonium.'],
        game: 'The ATP cost is charged on import rather than at Pma1.' } });
    proc(st.aap, { cap: () => lv('AAP'), time: () => 1.3, auto: () => lv('AAP') >= 2, autoCan: () => res('aa') <= g.res.cap('aa') - 2 && res('atp') >= 8,
      can: () => res('aa') >= g.res.cap('aa') ? 'Amino-acid pool is full' : res('atp') < 2 ? 'Needs 2 ATP (to restore the H⁺ gradient)' : true,
      start() { g.res.add('atp', -2); }, finish() { const s = st.aap; for (let i = 0; i < 2; i++) fly(dAA, { x: s.x * 1.15 + U.rand(-.1, .1), y: s.y * 1.15 }, { x: s.x * .8 + U.rand(-.15, .15), y: s.y * .8 }, .5); g.res.add('aa', 2, { x: s.x * .85, y: s.y * .85 }); } });
    const PM1 = pm(100);
    mk({ id: 'pma1', name: 'Pma1 proton pump', short: 'Pma1', lx: PM1.lx, ly: PM1.ly, r: .25,
      draw(c, s) { D.pump(c, s.x, s.y, PM1.ang, .27, '#ff9d5c'); },
      info: { title: 'Pma1 — H⁺-ATPase', sub: 'Plasma membrane · P-type pump', body: 'Pumps protons out of the cell, one per ATP. The resulting proton gradient and membrane voltage power nutrient import and keep the cytosol near pH 7 while the medium turns acidic.',
        facts: ['The most abundant plasma-membrane protein in yeast.', 'Consumes at least a fifth of all the ATP a growing cell makes.', 'Essential: without it the cell cannot take up nutrients.'],
        game: 'Shown as the steady "housekeeping" ATP drain.', live: () => [['Housekeeping drain', '0.1 ATP / s']] } });
    const SL = pm(250);
    mk({ id: 'sln1', name: 'Sln1 osmosensor', short: 'Sln1', lx: SL.lx, ly: SL.ly, r: .28,
      draw(c, s) { D.receptor(c, s.x, s.y, SL.ang, .3, '#9ad0ff', S.osmo && !S.sig.hog); },
      ready: () => S.osmo && !S.sig.hog && !S.hogBusy,
      onClick(s) {
        if (!S.osmo || S.sig.hog || S.hogBusy) return; S.hogBusy = true;
        cascade(s, ['Sln1 off → Ssk1 unphosphorylated', 'Ssk2 / Ssk22 (MAPKKK)', 'Pbs2 (MAPKK)', 'Hog1-P (MAPK)'], '#9ad0ff', () => { S.sig.hog = true; g.toast('Hog1 entered the nucleus: <i>GPD1</i> can be expressed.', 'good'); });
      },
      info: { title: 'Sln1 — osmosensor', sub: 'Plasma membrane · two-component histidine kinase', body: 'Sln1 feels membrane tension (turgor). When salt or sugar outside pulls water out and turgor drops, Sln1 stops phosphorylating Ypd1 and Ssk1; unphosphorylated Ssk1 then activates the kinase cascade Ssk2/Ssk22 → Pbs2 → Hog1 (a second sensor branch via Sho1 also feeds Pbs2). Phosphorylated Hog1 enters the nucleus within about a minute and turns on glycerol production.',
        facts: ['A relative of bacterial two-component sensors — rare in eukaryotes, absent in animals.', 'Hog1 is the yeast counterpart of human p38 stress kinase.'] } });
    const WL = pm(62, R + .1);
    mk({ id: 'wall', name: 'Cell wall', short: 'cell wall', lx: WL.lx, ly: WL.ly, r: .2, draw() {},
      info: { title: 'Cell wall', sub: '~100–200 nm thick · β-glucan, mannoprotein, chitin', body: 'A stiff, porous sugar mesh outside the plasma membrane. It resists the cell\'s internal turgor pressure and gives yeast its shape. Small nutrients pass freely; the plasma membrane underneath is the real barrier.',
        facts: ['Makes up 15–30 % of the cell\'s dry weight.', 'Every division leaves a chitin-rich <b>bud scar</b> on the mother; a mother typically manages ~20–30 divisions. The scars count them but are not what kills her.'] } });

    /* ---- cytosolic metabolism ---- */
    mk({ id: 'gly', name: 'Glycolysis (10 enzymes)', short: 'Glycolysis', lx: (LANE.x1 + LANE.x2) / 2, ly: (LANE.y1 + LANE.y2) / 2, r: .5, labelDy: 16,
      draw(c, s) {
        const a = W(LANE.x1, LANE.y1), b = W(LANE.x2, LANE.y2);
        c.strokeStyle = 'rgba(124,252,138,.18)'; c.lineWidth = .2 * S.k; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        for (let i = 0; i < 10; i++) {
          const p = i / 9, x = U.lerp(a.x, b.x, p), y = U.lerp(a.y, b.y, p), act = s.jobs.some(j => Math.abs(j.t / j.dur - p) < .07);
          D.ellipse(c, x, y, .05, .075, .3, act ? '#eaffea' : (i === 0 || i === 2 ? '#e59866' : i === 6 || i === 9 ? '#ffe14d' : '#58b98a'), 'rgba(0,0,0,.4)', g.px);
          if (g.cam.z > 1.7) g.label(GLY[i], x, y + (i % 2 ? .16 : -.16), { size: 9, color: '#bfe8cf' });
        }
        if (s.boostT > 0) { c.strokeStyle = 'rgba(255,225,77,.35)'; c.lineWidth = .32 * S.k; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
        for (const j of s.jobs) { const p = j.t / j.dur, x = U.lerp(a.x, b.x, p), y = U.lerp(a.y, b.y, p); if (p < .38) D.glucose(c, x, y, .075, 0); else { D.pyruvate(c, x, y - .07, .06, p * 6); D.pyruvate(c, x, y + .07, .06, p * 6 + 1); } }
        const gp = S.anc.glu; for (let i = 0; i < S.gluc; i++) D.glucose(c, gp.x + (i % 3) * .15, gp.y + (i / 3 | 0) * .15, .065, 0);
        const pp = S.anc.pyr; for (let i = 0; i < S.pyr; i++) D.pyruvate(c, pp.x + (i % 4) * .13, pp.y + (i / 4 | 0) * .13, .06, .5);
      },
      badge: () => S.gluc || '',
      info: { title: 'Glycolysis', sub: 'Cytosol · 10 enzymes · glucose → 2 pyruvate', body: 'An ancient, near-universal energy pathway. Two ATP are <b>invested</b> first (hexokinase Hxk2, phosphofructokinase Pfk1), the 6-carbon sugar is split in two (aldolase Fba1), and then each half pays back two ATP (Pgk1, pyruvate kinase Cdc19). Along the way Tdh3 (GAPDH) loads electrons onto NAD⁺.',
        facts: ['Net: <b>+2 ATP, +2 NADH, 2 pyruvate</b> per glucose.', 'Order: ' + GLY.join(' → '), 'Glycolytic enzymes are among the most abundant proteins in yeast — Tdh3 alone is present at around a million copies per cell.', 'Needs free NAD⁺: if NADH is not recycled, the pathway stalls at Tdh3.', 'The pace-setter is Pfk1. It is switched on allosterically by <b>fructose-2,6-bisphosphate</b> and AMP, and inhibited by ATP — so the pathway speeds up exactly when energy is needed.'],
        game: 'Zoom in to see the names of all ten enzymes. Once glycolysis runs by itself, clicking it gives a short fructose-2,6-bisphosphate boost — in a real cell that signal is set by the cell, not by a click.',
        live: () => [['Glucose waiting', S.gluc], ['Pyruvate waiting', S.pyr], ['NADH / NAD⁺', nadh() + ' / ' + res('nad')]] } });
    proc(st.gly, { noRing: true, boost: { mult: 2, dur: 6, cd: 7, text: 'Fructose-2,6-bisphosphate → Pfk1 ×2', when: () => S.gluc > 0 || st.gly.jobs.length > 0 }, cap: () => lv('GLY'), time: () => [0, 2.4, 2.0, 1.6, 1.3][lv('GLY')], auto: () => lv('GLY') >= 2,
      autoCan: () => !(S.osmo && lv('GPD1') && S.glycerol < GLYC_NEED && !st.gpd.jobs.length) || S.gluc >= 2,   // Hog1 diverts flux to glycerol first
      can: () => S.gluc < 1 ? 'No glucose here yet — import some' : res('atp') < 2 ? 'Needs 2 ATP to prime the sugar' : res('nad') < 2 ? 'No NAD⁺ left — ferment or respire pyruvate!' : S.pyr + st.gly.jobs.length * 2 > 6 ? 'Pyruvate is piling up — use it' : true,
      start(j) { S.gluc--; g.res.add('atp', -2); g.res.add('nad', -2); j.paid = 0; if (!lv('GLY') || lv('GLY') < 2) g.floatText(st.gly.x - .4, st.gly.y - .25, '−2 ATP (investment)', '#ff9a9a'); },
      tick(j) { const p = j.t / j.dur, a = W(LANE.x1, LANE.y1), b = W(LANE.x2, LANE.y2); if (p >= .66 && j.paid < 1) { j.paid = 1; atpPop({ x: U.lerp(a.x, b.x, .66), y: U.lerp(a.y, b.y, .66) }, 2, st.gly); } },
      finish(j) { atpPop(S.anc.laneOut, 2); S.pyr += 2; S.stats.glyc++; if (S.stats.glyc === 1) g.floatText(S.anc.pyr.x, S.anc.pyr.y + .3, '2 pyruvate + 2 NADH', '#ffb347'); } });

    mk({ id: 'ferm', name: 'Fermentation: Pdc1 + Adh1', short: 'Pdc1·Adh1', lx: -1.35, ly: 1.25, r: .32,
      draw(c, s) { D.protein(c, s.x - .12, s.y, .14, '#c79bff', 2); D.protein(c, s.x + .14, s.y + .02, .14, '#9b8cff', 5); if (lv('ADH')) {} },
      badge: () => S.pyr || '',
      info: { title: 'Alcoholic fermentation', sub: 'Cytosol · pyruvate → CO₂ + ethanol', body: 'Pyruvate decarboxylase (Pdc1) clips off CO₂, leaving acetaldehyde; alcohol dehydrogenase (Adh1) then reduces it to ethanol using NADH. It makes <b>no ATP at all</b> — its whole purpose is to turn NADH back into NAD⁺ so glycolysis can keep running.',
        facts: ['Yeast ferments even when oxygen is available, as long as sugar is abundant — the <b>Crabtree effect</b>. Fast but wasteful: 2 ATP per glucose instead of ~16.', 'The CO₂ raises bread; the ethanol is beer and wine, and poisons competing microbes.', 'Ethanol and CO₂ simply diffuse out through the membrane.'],
        live: () => [['Pyruvate waiting', S.pyr], ['Ethanol released', S.eth]] } });
    proc(st.ferm, { cap: () => Math.max(2, lv('PDC')), time: () => [0, .9, .7, .5][lv('PDC')], auto: () => lv('PDC') >= 2,
      autoCan: () => !(lv('HAP4') >= 2 && st.mito.jobs.length < mitoCap()) || S.pyr >= 3 || res('nad') < 2,
      can: () => S.pyr < 1 ? 'No pyruvate — run glycolysis first' : nadh() < 1 ? 'No NADH to oxidise' : true,
      start() { S.pyr--; fly(dPyr, S.anc.pyr, st.ferm, .35); },
      finish() {
        const s = st.ferm; g.res.add('nad', 1); S.eth++; S.stats.ferm++; g.learn('y_ferment');
        if (lv('PDC') < 2) g.floatText(s.x, s.y - .3, '+1 NAD⁺', '#6ec6ff');
        const a = Math.atan2(s.y, s.x) + U.rand(-.2, .2), out = { x: Math.cos(a) * 3.6, y: Math.sin(a) * 3.6 };
        const t1 = g.token({ x: s.x, y: s.y, draw: (c, t) => D.bubble(c, t.x, t.y, .07) }); t1.to(out, 2.2).fade(.5).die();
        const t2 = g.token({ x: s.x, y: s.y + .1, draw: (c, t) => D.circle(c, t.x, t.y, .045, '#e6c9ff', '#6b4a8a', g.px) }); t2.to({ x: out.x * .9, y: out.y * .9 + .4 }, 2.6).fade(.5).die();
      } });
    st.ferm.onClick = () => { if (st.ferm.tryStart(true)) st.ferm.tryStart(false); };   // one click handles both pyruvates from a glucose

    mk({ id: 'mito', name: 'Mitochondrion: respiration', short: 'Mitochondrion', lx: -.76, ly: -1.63, r: .38,
      draw(c, s) {
        const on = s.jobs.length > 0; s.spin = (s.spin || 0) + (on ? g.dt * 14 : 0);
        if (on) D.glow(c, s.x, s.y, s.boostT > 0 ? .8 : .5, s.boostT > 0 ? '#ffe14d' : '#ff9d5c', .45);
        c.strokeStyle = on ? '#ffe9c9' : '#ffc9a8'; c.lineWidth = 2 * g.px; c.beginPath(); c.arc(s.x - .14, s.y, .11, s.spin * .4, s.spin * .4 + 5); c.stroke();   // TCA cycle
        D.atpSynthase(c, s.x + .12, s.y, -Math.PI / 2 + .5, .16, s.spin);
      },
      badge: () => lv('HAP4') >= 2 ? '' : (S.pyr || ''),
      info: () => ({ title: 'Mitochondrion', sub: 'Tubular network under the cell surface · respiration', body: 'Pyruvate enters through the carrier Mpc1/Mpc3, is burned to CO₂ by pyruvate dehydrogenase and the <b>TCA cycle</b>, and the electrons harvested (NADH, FADH₂) run down the respiratory chain to oxygen. The chain pumps protons, and the proton flow back through the turbine <b>ATP synthase</b> makes ATP.',
        facts: ['About <b>16 ATP per glucose</b> in yeast, as measured in living cells (2 from glycolysis + ~14 here), versus 2 by fermentation alone.', 'Baker\'s yeast has <b>no proton-pumping Complex I</b>; simple NADH dehydrogenases (Ndi1 inside, Nde1 facing the cytosol) feed the chain instead — one reason the yield is lower than the ~30 ATP of human cells.', 'ATP synthase spins at over 100 revolutions per second, 3 ATP per turn.', 'Mitochondria keep their own small genome (~86 kb in yeast) from their bacterial ancestor.', 'High glucose <b>represses</b> respiratory genes via Mig1: the cell prefers speed over efficiency.'],
        game: 'One pyruvate token → 7 ATP, including the cytosolic NADH that Nde1 re-oxidises. Once respiration runs by itself, a click gives a short boost: real mitochondria speed up when ADP rises (respiratory control).',
        live: () => [['Capacity', mitoCap() + ' pyruvate at a time' + (!S.lowGlc && lv('HAP4') > 1 ? ' (glucose-repressed)' : '')], ['Pyruvate respired', S.stats.resp]] }) });
    proc(st.mito, { boost: { mult: 2, dur: 6, cd: 7, text: 'ADP surge → respiration ×2', when: () => st.mito.jobs.length > 0 }, cap: mitoCap, time: () => S.lowGlc ? [0, 5, 4, 3.2][lv('HAP4')] : 5, auto: () => lv('HAP4') >= 2,
      can: () => S.pyr < 1 ? 'No pyruvate — run glycolysis first' : true,
      start() { S.pyr--; fly(dPyr, S.anc.pyr, st.mito, .5); g.learn('y_respire'); },
      finish() { atpPop(st.mito, 7); if (nadh() > 0) g.res.add('nad', 1); S.stats.resp++; fly((c, t) => D.bubble(c, t.x, t.y, .06), st.mito, { x: st.mito.x - .6, y: st.mito.y - 1.6 }, 2).a = .8; } });

    mk({ id: 'gpd', name: 'Gpd1 → glycerol', short: 'Gpd1', lx: -1.55, ly: -1.05, r: .3, hidden: true,
      draw(c, s) { D.protein(c, s.x, s.y, .16, '#9ad0ff', 3); },
      badge: () => S.glycerol ? S.glycerol + ' glycerol' : '',
      info: { title: 'Gpd1 — glycerol-3-phosphate dehydrogenase', sub: 'Cytosol · osmolyte production', body: 'Diverts the glycolytic intermediate DHAP to glycerol-3-phosphate (using NADH); the phosphatase Gpp1/2 then releases <b>glycerol</b>. Glycerol is a harmless "compatible solute": piling it up inside balances the salt outside, so water returns and the cell re-inflates. The glycerol channel Fps1 closes to keep it in.',
        facts: ['Adaptation takes a real yeast cell roughly 15–60 minutes depending on the severity of the shock.', 'Glycerol can reach molar concentrations inside the cell.'] } });
    proc(st.gpd, { cap: () => 1, time: () => 1.6, auto: () => S.osmo && S.glycerol < GLYC_NEED,
      can: () => lv('GPD1') < 1 ? 'Not expressed' : !S.osmo || S.glycerol >= GLYC_NEED ? 'No osmotic stress — glycerol not needed' : S.gluc < 1 ? 'Needs glucose' : res('atp') < 2 ? 'Needs 2 ATP' : true,
      start() { S.gluc--; g.res.add('atp', -2); }, finish() { S.glycerol += 2; g.floatText(st.gpd.x, st.gpd.y - .3, '+2 glycerol', '#9ad0ff'); g.res.add('nad', Math.min(2, nadh())); } });

    /* ---- ribosomes ---- */
    RIBO_POS.forEach((p, i) => {
      const s = g.addStation({ id: 'ribo' + i, name: 'Ribosome', noLabel: i > 0, lx: p[0], ly: p[1], r: .2, hidden: i > 0,
        draw(c, s) { const rb = S.ribos[i]; D.ribosome(c, s.x, s.y, .15, !!rb.job, rb.job ? Math.max(0, rb.job.t / rb.job.dur) : 0); if (rb.job && rb.job.type === 'gene' && rb.job.t > 0) g.label(rb.job.it.gene, s.x, s.y - .42, { size: 9, color: '#f0a8ff', italic: true }); },
        ready: () => !S.ribos[i].job && !(lv('RIBI') >= 2 && S.grow) && growthBlock() === true && (res('atp') >= 9 || !S.stats.bio),   // marker only when there is ATP to spare
        onClick: () => startBio(S.ribos[i], true),
        info: { title: 'Ribosome', sub: 'Cytosol · 80S · 4 rRNAs + 79 proteins', body: 'Reads an mRNA three letters at a time and links the matching amino acids into a protein chain. Ribosomes make everything else — including more ribosomes — so <b>how fast a cell grows is set largely by how many ribosomes it has</b>.',
          facts: ['Each peptide bond costs <b>4 ATP equivalents</b>: 2 to load the amino acid onto its tRNA, 2 GTP to place it and move on.', 'Speed: roughly 5–10 amino acids per second.', 'A fast-growing yeast cell contains ~200,000 ribosomes and assembles about 2,000 new ones every minute.', 'Making protein is the single biggest energy expense of a growing cell.'],
          game: 'One ribosome here stands for tens of thousands. One "biomass protein" = 1 amino-acid token + 4 ATP.',
          live: () => [['Misfolding risk', Math.round(misP() * 100) + ' %'], ['Speed', S.mis.length >= 6 ? '50 % (aggregates!)' : S.lowGlc ? '40 % (glucose starvation)' : '100 %']] } });
      S.ribos.push({ st: s, job: null });
    });

    /* ---- nucleus ---- */
    mk({ id: 'nuc', name: 'Nucleus', short: 'Nucleus', lx: NUC.x, ly: NUC.y, r: NUC.r, labelDy: -(NUC.r * 60), noLabel: true,
      draw: drawNucleus, ready: () => !!nucAction(), onClick: doNuc,
      info: () => ({ title: 'Nucleus', sub: '~2 µm across · 16 chromosomes · ~6,000 genes', body: 'Holds the genome: 12 million base pairs of DNA wrapped around histones. RNA polymerase II copies genes into mRNA, which leaves through <b>nuclear pore complexes</b>; the dense crescent on one side is the <b>nucleolus</b>, the ribosome factory. In yeast the nuclear envelope never breaks down — even mitosis happens inside it.',
        facts: ['RNA polymerase II writes ~20–30 nucleotides per second; a typical gene takes about a minute.', 'About 150 nuclear pores, each a ~50 MDa ring built from ~30 different nucleoporins.', 'A typical yeast mRNA survives only minutes before it is degraded — so gene expression can change quickly.', 'DNA replication starts from ~400 origins and takes 20–30 minutes.'],
        live: () => [['Phase', S.phase], ['Genome replicated', Math.round(S.dna * 100) + ' %'], ['Whi5 concentration', S.phase === 'G1' ? Math.round(100 * BIO_START / (BIO_START + res('bio') * 1.2)) + ' % (diluting)' : 'out of nucleus'], ['Transcribing', S.tx ? S.tx.it.gene : '—']] }) });
    mk({ id: 'neck', name: 'Bud neck', short: 'Bud neck', lx: R, ly: 0, r: .35, hidden: true, draw() {},
      ready: () => S.phase === 'T', onClick() { if (S.phase === 'T') { S.phase = 'C'; g.banner({ title: 'Cytokinesis', text: 'The mitotic-exit network releases Cdc14. The Myo1 actomyosin ring contracts at the septin collar while Chs2 lays down a chitin septum behind it.', kind: 'good', dur: 7 }); } },
      info: { title: 'Bud neck', sub: 'Septin collar · actomyosin ring · septum', body: 'A ring of septin filaments (Cdc3, Cdc10, Cdc11, Cdc12) assembles at the future bud site just before the bud emerges and then marks the neck. At the end of mitosis a contractile ring of actin and myosin II (Myo1) pinches the membrane while chitin synthase Chs2 builds the primary septum. The daughter then secretes chitinase (Cts1) to cut herself free.',
        facts: ['The mother keeps a chitin <b>bud scar</b>; the daughter gets a fainter birth scar.', 'Division is asymmetric: the daughter is smaller and must grow longer in G1 before her own START.'] } });

    /* ---- organelles (information + pipeline waypoints) ---- */
    mk({ id: 'er', name: 'Endoplasmic reticulum', short: 'ER', lx: 1.62, ly: -1.26, r: .28,
      draw(c, s) { D.ribosome(c, s.x, s.y, .12, !!S.erJob, S.erJob ? Math.max(0, S.erJob.t / S.erJob.dur) : 0); if (S.erJob && S.erJob.t > 0) g.label(S.erJob.it.gene, s.x, s.y - .38, { size: 9, color: '#f0a8ff', italic: true }); },
      info: { title: 'Endoplasmic reticulum (ER)', sub: 'Continuous with the nuclear envelope · membrane & secreted proteins', body: 'Proteins destined for membranes, the vacuole, the wall or the outside are made by ribosomes docked on the ER. The signal-recognition particle (SRP) brings the ribosome to the <b>Sec61</b> channel, and the growing chain is threaded into the ER membrane, folded and glycosylated. COPII-coated vesicles then carry it to the Golgi.',
        facts: ['In yeast most ER lies flat against the plasma membrane ("cortical ER") plus the nuclear envelope.', 'Roughly a third of all proteins enter the secretory pathway.', 'The ER is also where most membrane lipids are made.'] } });
    mk({ id: 'golgi', name: 'Golgi', short: 'Golgi', lx: 1.9, ly: 0, r: .28, draw() {},
      info: { title: 'Golgi apparatus', sub: 'Sorting and sugar-modification station', body: 'Cargo from the ER passes through Golgi cisternae where its sugar chains are extended and it is sorted to the plasma membrane, the vacuole or back to the ER. Secretory vesicles then travel along actin cables, pulled by the myosin Myo2, to the growing bud.',
        facts: ['Unlike the neat stacks of animal cells, the Golgi of <i>S. cerevisiae</i> is a few dozen separate cisternae scattered through the cytoplasm.', 'Each cisterna matures over ~1–2 minutes, changing from "early" to "late" identity.'] } });
    mk({ id: 'vac', name: 'Vacuole', short: 'Vacuole', lx: VAC.x, ly: VAC.y, r: VAC.r * .8, noLabel: true, draw() {},
      info: { title: 'Vacuole', sub: 'Acidic (pH ~5–6) · storage and recycling', body: 'The yeast equivalent of the lysosome. The V-ATPase pumps protons in, hydrolases inside digest whatever is delivered, and the lumen stores amino acids (especially arginine), phosphate and ions. During starvation, <b>autophagy</b> delivers bulk cytoplasm here to be recycled.',
        facts: ['Can occupy a quarter of the cell\'s volume or more.', 'The growth-control kinase <b>TORC1</b> sits on the vacuole membrane, where it senses amino-acid supply.'] } });
    mk({ id: 'torc', name: 'TORC1 growth switch', short: 'TORC1', lx: VAC.x + Math.cos(U.deg(160)) * VAC.r, ly: VAC.y + Math.sin(U.deg(160)) * VAC.r, r: .2, hidden: true,
      draw(c, s) { D.kinase(c, s.x, s.y, .13, S.grow ? '#7ee787' : '#7a8699', S.grow); },
      badge: () => S.grow ? 'growth ON' : 'growth OFF', onClick() { S.grow = !S.grow; g.floatText(st.torc.x, st.torc.y - .3, S.grow ? 'TORC1 on: ribosomes translate' : 'TORC1 off: saving ATP', S.grow ? '#7ee787' : '#cbd5e1'); },
      info: { title: 'TORC1 — target of rapamycin complex 1', sub: 'Vacuole membrane · master growth regulator', body: 'When amino acids are plentiful, TORC1 is active: it drives ribosome production and translation. When nutrients run out — or when the drug rapamycin is added — it switches off, growth stops and autophagy starts.',
        facts: ['TOR was discovered in yeast (1991) and is conserved in every eukaryote; human mTORC1 does the same job on the lysosome.'],
        game: '<b>Click to toggle automatic growth.</b> Switch it off when you want to save ATP for an expensive gene.' } });
    mk({ id: 'prot', name: '26S proteasome', short: 'Proteasome', lx: 1.65, ly: 1.05, r: .28,
      draw(c, s) { D.proteasome(c, s.x, s.y, .2, .4, s.jobs.length > 0); },
      badge: () => S.protQ || '',
      info: { title: '26S proteasome', sub: 'Cytosol & nucleus · protein shredder', body: 'A barrel (20S core: four stacked rings of seven subunits) capped by 19S regulatory particles. Proteins tagged with a chain of <b>ubiquitin</b> are recognised by the cap, unfolded by its ATP-driven motor and threaded into the barrel, where they are cut into short peptides that are recycled into amino acids.',
        facts: ['A yeast cell has roughly 15,000–30,000 proteasomes.', 'Ubiquitin tagging needs three enzymes in sequence (E1 → E2 → E3); E3 ligases such as Ubr1 and San1 pick out misfolded proteins.', 'The transcription factor Rpn4 turns on all proteasome genes — and is itself destroyed by the proteasome, a neat feedback loop.'],
        live: () => [['Queue', S.protQ], ['Free misfolded proteins', S.mis.length]] } });
    st.aap.ready = () => lv('AAP') < 2 && !st.aap.jobs.length && st.aap.cfg.can() === true && res('atp') >= 7 && res('aa') <= 4;
    proc(st.prot, { cap: () => 1, time: () => lv('RPN4') >= 2 ? .8 : 1.3, auto: () => true,
      can: () => S.protQ < 1 ? 'Nothing tagged for degradation — click a misfolded protein' : res('atp') < 1 ? 'Needs 1 ATP' : true,
      start() { S.protQ--; g.res.add('atp', -1); }, finish() { g.res.add('aa', 1, { x: st.prot.x, y: st.prot.y - .3 }); } });
    st.prot.ready = () => false;
    mk({ id: 'chap', name: 'Chaperones Hsp70 + Hsp104', short: 'Chaperones', lx: -.35, ly: 1.85, r: .25, hidden: true,
      draw(c, s) { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + g.t * .6; D.circle(c, s.x + Math.cos(a) * .11, s.y + Math.sin(a) * .11, .055, '#ffd166', '#7a5c00', g.px); } },
      info: { title: 'Chaperones: Hsp70 (Ssa1) and Hsp104', sub: 'Cytosol · protein folding and rescue', body: 'Hsp70 clamps onto exposed greasy stretches of unfolded proteins and, by cycles of ATP binding and hydrolysis, gives them another chance to fold. <b>Hsp104</b> is a six-membered ring that threads proteins out of aggregates so Hsp70 can refold them.',
        facts: ['Hsp104 can dissolve aggregates that would otherwise be permanent; animals have lost this enzyme.', 'Free Hsp70 normally holds the heat-shock factor <b>Hsf1</b> inactive. Unfolded proteins pull Hsp70 away, Hsf1 is released and makes more chaperones — a self-correcting thermostat.'] } });

    /* ---- genes ---- */
    const cost = (a, b) => l => ({ atp: a[l], aa: b[l] });
    const auto = (first, more) => l => l === 2 ? first : more;
    g.shop.add({ id: 'HXT1', gene: 'HXT1', title: 'Hexose transporter Hxt1', group: 'Sugar & energy', max: 4, level: 1, er: true, dest: 'hxt1', col: '#58d68d', cost: cost([0, 0, 6, 14, 22], [0, 0, 1, 3, 4]),
      req: () => S.sig.glc ? true : 'Needs the glucose signal (Snf3/Rgt2 sensor)', desc: auto('More copies in the membrane: glucose now flows in <b>by itself</b>.', '+1 transporter: faster uptake.'), onBuy: express });
    g.shop.add({ id: 'GLY', gene: 'PFK1 · TDH3 · CDC19', title: 'Glycolytic enzymes', group: 'Sugar & energy', max: 4, level: 1, dest: 'gly', col: '#58b98a', cost: cost([0, 0, 7, 18, 28], [0, 0, 1, 4, 6]),
      desc: auto('Enough enzyme that glycolysis runs <b>by itself</b>, two sugars at a time.', 'Higher flux: more sugars at once, each faster.'), onBuy: express });
    g.shop.add({ id: 'PDC', gene: 'PDC1 · ADH1', title: 'Fermentation enzymes', group: 'Sugar & energy', max: 3, level: 1, dest: 'ferm', col: '#c79bff', cost: cost([0, 0, 6, 16], [0, 0, 1, 3]),
      desc: auto('Excess pyruvate is fermented <b>automatically</b>, keeping NAD⁺ available.', 'Faster overflow fermentation.'), onBuy: express });
    g.shop.add({ id: 'HXT7', gene: 'HXT7', title: 'High-affinity transporter', group: 'Sugar & energy', max: 2, level: 0, er: true, dest: 'hxt7', col: '#b8f26a', cost: cost([0, 6, 12], [0, 2, 3]),
      req: () => S.lowGlc && S.sig.snf1 ? true : 'Repressed while glucose is high (Mig1)', desc: l => l === 1 ? 'Catches glucose even at 1 mM. Automatic.' : '+1 transporter.', onBuy: express, onGrant: () => { st.hxt7.hidden = false; } });
    g.shop.add({ id: 'HAP4', gene: 'HAP4', title: 'Respiration master switch', group: 'Sugar & energy', max: 3, level: 1, dest: 'mito', col: '#ff9d5c', via: 'Hap4 joins Hap2/3/5 on DNA → respiratory genes ON', cost: cost([0, 0, 14, 26], [0, 0, 3, 5]),
      req: () => S.lowGlc && S.sig.snf1 ? true : 'Repressed while glucose is high (Mig1)', desc: auto('The transcription factor Hap4 switches on dozens of respiratory genes: the mitochondrial network grows and burns pyruvate <b>automatically</b> (7 ATP each).', 'Bigger network: +1 pyruvate at a time, faster.'), onBuy: express });
    g.shop.add({ id: 'AAP', gene: 'AGP1 · BAP2', title: 'Amino-acid permeases', group: 'Building', max: 3, level: 1, er: true, dest: 'aap', col: '#ff8ad8', cost: cost([0, 0, 8, 14], [0, 0, 1, 2]),
      desc: auto('Imports amino acids <b>automatically</b> whenever the pool has room.', 'Faster import.'), onBuy: express });
    g.shop.add({ id: 'RIBI', gene: 'RPL · RPS (+ rRNA)', title: 'Ribosome biogenesis', group: 'Building', max: 4, level: 1, dest: 'ribo', col: '#d9c7a3', via: 'r-proteins + rRNA (Pol I) assembled in the nucleolus', tl: 5, cost: cost([0, 0, 16, 28, 40], [0, 0, 4, 6, 8]),
      desc: auto('+1 ribosome, and TORC1 keeps them translating <b>automatically</b> (toggle at the vacuole).', '+1 ribosome: faster growth. Ribosomes are the most expensive thing a cell builds.'), onBuy: express,
      onGrant: (_, l) => { if (l >= 2 && st.torc.hidden) { st.torc.hidden = false; g.toast('Ribosomes now translate on their own while ATP ≥ 12. Click <b>TORC1</b> on the vacuole to pause growth and save ATP.'); } } });
    g.shop.add({ id: 'RPN4', gene: 'RPN4', title: 'Proteasome boost', group: 'Quality control', max: 2, level: 1, dest: 'prot', col: '#8fa8ff', via: 'Rpn4 binds PACE elements → proteasome genes ON', cost: cost([0, 0, 10], [0, 0, 3]),
      desc: () => 'The transcription factor Rpn4 switches on proteasome genes: misfolded proteins are tagged and removed <b>automatically</b>.', onBuy: express });
    g.shop.add({ id: 'SSA', gene: 'SSA1 · HSP104', title: 'Chaperones', group: 'Quality control', max: 2, level: 0, dest: 'chap', col: '#ffd166', cost: cost([0, 10, 18], [0, 3, 4]),
      req: () => S.sig.hsf1 ? true : 'Induced by Hsf1 during heat shock', desc: l => l === 1 ? 'Halves misfolding and refolds damaged proteins (1 ATP each) instead of destroying them.' : 'Twice as many chaperones.', onBuy: express, onGrant: () => { st.chap.hidden = false; } });
    g.shop.add({ id: 'GPD1', gene: 'GPD1', title: 'Glycerol synthesis', group: 'Quality control', max: 1, level: 0, dest: 'gpd', col: '#9ad0ff', cost: () => ({ atp: 8, aa: 2 }),
      req: () => S.sig.hog ? true : 'Induced by Hog1 during osmotic stress', desc: () => 'Makes the osmolyte glycerol from glucose so the cell can re-inflate.', onBuy: express, onGrant: () => { st.gpd.hidden = false; } });

    /* ---- objectives ---- */
    g.obj.set([
      { text: 'Import glucose', why: 'Click the green <b>Hxt1</b> transporter on the left edge of the cell.', hint: 'Sugar is the cell\'s food. Click <b>Hxt1</b> in the membrane to let a glucose molecule in.', target: 'hxt1', check: () => S.stats.imp >= 1 },
      { text: 'Run glycolysis', why: 'Click the chain of ten enzymes. It costs 2 ATP up front and returns 4.', hint: 'Click the <b>glycolysis</b> enzyme chain to split the glucose: −2 ATP, then +4 ATP, 2 NADH and 2 pyruvate.', target: 'gly', check: () => S.stats.glyc >= 1 },
      { text: 'Recycle NADH: ferment both pyruvates', why: 'Click <b>Pdc1·Adh1</b>. Without free NAD⁺ glycolysis stops.', hint: 'Glycolysis used up NAD⁺. Click <b>Pdc1·Adh1</b> to ferment both pyruvates into ethanol + CO₂ and get the NAD⁺ back.', target: 'ferm', check: () => S.stats.ferm >= 2, progress: () => [Math.min(2, S.stats.ferm), 2] },
      { text: 'Build a protein', why: 'Click the <b>ribosome</b>: 4 ATP + 1 amino acid → biomass.', hint: 'Growth means making protein. Click the <b>ribosome</b> (needs 4 ATP and an amino acid). Short on ATP? Import and split more glucose.', target: 'ribo0', check: () => S.stats.bio >= 1 || res('bio') >= 1 },
      { text: 'Relay the glucose signal', why: 'Click the yellow <b>Snf3/Rgt2</b> sensor so the nucleus learns that sugar is plentiful.', hint: 'The cell cannot "see" sugar unless a sensor tells the nucleus. Click <b>Snf3/Rgt2</b> and watch the signal travel.', target: 'snf3', onStart: () => { S.allowSig = true; }, check: () => S.sig.glc },
      { text: 'Express <i>HXT1</i>', why: 'In the <b>Genome</b> panel (right). Watch: transcription → mRNA export → translation at the ER → Golgi → membrane.', hint: 'Open <b>Genome</b> on the right and express <i>HXT1</i> (6 ATP, 1 aa). Keep clicking glycolysis to earn the ATP.', target: 'shop:HXT1', check: () => lv('HXT1') >= 2 },
      { text: 'Automate glycolysis and fermentation', why: 'Express <i>PFK1·TDH3·CDC19</i> and <i>PDC1·ADH1</i>.', hint: 'Make enough enzyme copies and the pathway runs on its own — and a click on an automated pathway then gives it a short boost. You can also click the <b>mitochondrion</b>: slower, but 7 ATP per pyruvate.', check: () => lv('GLY') >= 2 && lv('PDC') >= 2, progress: () => [(lv('GLY') >= 2) + (lv('PDC') >= 2), 2] },
      { text: 'Grow to 10 biomass', why: 'Keep ribosomes busy; import amino acids at the pink permease. Upgrade what limits you.', hint: 'Ribosomes need amino acids: click the pink <b>permease</b> at the bottom-left. <i>RPL·RPS</i> adds ribosomes and automates growth.', check: () => res('bio') >= 10, progress: () => [Math.floor(res('bio')), 10] },
      { text: 'Survive the sugar drought', why: 'Express <i>HXT7</i> (high-affinity uptake) and <i>HAP4</i> (respiration: 8× more ATP per sugar).', hint: 'Glucose is almost gone. Express <i>HXT7</i> to catch the last sugar and <i>HAP4</i> to burn it completely in the mitochondria.', onStart: startDrought,
        check: () => lv('HXT7') >= 1 && lv('HAP4') >= 2, progress: () => [(lv('HXT7') >= 1) + (lv('HAP4') >= 2), 2], onDone: () => g.after(25, endDrought) },
      { text: 'Reach critical size (' + BIO_START + ' biomass)', why: 'In a leading model, growth dilutes the inhibitor Whi5 in the nucleus.', hint: 'Grow! A cell may only commit to division once it is big enough.', check: () => res('bio') >= BIO_START, progress: () => [Math.floor(res('bio')), BIO_START] },
      { text: 'Pass START: click the nucleus', why: 'The point of no return of the cell cycle.', hint: 'The cell is big enough. Click the <b>nucleus</b> to pass START.', target: 'nuc', onStart: () => { S.allowStart = true; }, check: () => S.phase !== 'G1' },
      { text: 'Replicate the genome', why: 'All 16 chromosomes are copied at once from ~400 origins. It costs ATP for dNTPs — and trouble is coming.', hint: 'DNA polymerases are copying the genome. Keep ATP above zero and keep growing the bud.', onStart: () => g.after(7, startHeat), check: () => S.dna >= 1, progress: () => [Math.round(S.dna * 100), 100] },
      { text: 'Grow the bud to full size (' + BIO_DIV + ' biomass)', why: 'Most new material is now delivered into the bud along actin cables.', hint: 'Most of what the cell makes now goes into the bud. Keep growing.', check: () => res('bio') >= BIO_DIV, progress: () => [Math.floor(res('bio')), BIO_DIV] },
      { text: 'Trigger anaphase: click the nucleus', why: 'All chromosomes are attached to the spindle; APC/C can fire.', hint: 'DNA is copied and the bud is big. Click the <b>nucleus</b> to start anaphase.', target: 'nuc', check: () => S.phase === 'T' || S.phase === 'C' || S.phase === 'done' },
      { text: 'Divide: click the bud neck', why: 'Contract the actomyosin ring and build the septum.', hint: 'Two nuclei, one cell. Click the <b>bud neck</b> to pinch it in two.', target: 'neck', onStart: () => { st.neck.hidden = false; }, check: () => S.phase === 'done' },
    ]);

    /* ---- medium particles ---- */
    for (let i = 0; i < 70; i++) S.medium.push({ x: U.rand(-4.6, 6.4), y: U.rand(-3.7, 3.7), vx: U.rand(-.1, .1), vy: U.rand(-.1, .1), k: i < 46 ? 0 : i < 60 ? 1 : 2, a: U.rand(TAU) });
    g.learn('y_numbers');
    g.cam.x = .1; g.cam.y = 0; if (g.W < 560) { g.cam.x = 0; g.cam.z = 1.65; } else g.cam.z = 1.3;      // phones: fill the narrow canvas with the mother cell
  },

  update(_, dt) {
    const b = res('bio');
    /* size & positions */
    S.size = U.approach(S.size, .86 + .14 * Math.min(1, b / BIO_START), dt * .05);
    const osmT = S.osmo ? .84 + .16 * Math.min(1, S.glycerol / GLYC_NEED) : 1;
    S.osmK = U.approach(S.osmK, osmT, dt * (osmT < S.osmK ? .25 : .05));
    S.k = S.size * S.osmK;
    for (const s of g.stations) if (s.lx !== undefined) { s.x = s.lx * S.k; s.y = s.ly * S.k; }
    for (const k in S.anc) { S.anc[k].x = S.anc[k].lx * S.k; S.anc[k].y = S.anc[k].ly * S.k; }
    const nk = neck(); st.neck.x = nk.x * S.k; st.neck.y = 0;
    S.temp = U.approach(S.temp, S.heat ? 39 : 30, dt * 3);
    g.res.set('glc', U.approach(res('glc'), S.Gset, dt * (S.Gset < res('glc') ? 6 : 14)));

    /* housekeeping ATP drain (Pma1 etc.) and adenylate-kinase rescue */
    if (res('atp') > 4) g.res.add('atp', -.1 * dt);
    if (res('atp') < 2) {
      S.akT += dt; if (S.akT > 2.5) { S.akT = 0; g.res.add('atp', 1); if (!S.akSeen) { S.akSeen = true; g.toast('Energy crisis! Adenylate kinase (Adk1) squeezes a last ATP out of two ADP: 2 ADP → ATP + AMP.', 'bad'); } }
    }
    S.pmaT += dt; if (S.pmaT > 1.6) { S.pmaT = 0; const s = st.pma1, a = Math.atan2(s.y, s.x); const t = g.token({ x: s.x, y: s.y, draw: (c, t) => D.circle(c, t.x, t.y, .035, '#ff6b6b') }); t.to(s.x + Math.cos(a) * .7 + U.rand(-.2, .2), s.y + Math.sin(a) * .7, 1, { linear: true }).fade(.3).die(); }

    updExpression(dt); updRibos(dt);

    /* protein quality control */
    if (S.heat) { S.heatT += dt; if (S.heatT > 4.2) { S.heatT = 0; if (b > 3) { g.res.add('bio', -1); const a = U.rand(TAU), r = U.rand(.3, 1.9) * S.k; spawnMis(Math.cos(a) * r, Math.sin(a) * r); } } }
    if (lv('RPN4') >= 2) { S.capT += dt; if (S.capT > 1.4 && S.mis.length) { S.capT = 0; sendToProt(S.mis[0]); } }
    if (lv('SSA') >= 1) { S.chapT += dt; if (S.chapT > 3.2 / lv('SSA') && S.mis.length && res('atp') >= 1) { S.chapT = 0; g.res.add('atp', -1); refold(S.mis[S.mis.length - 1]); } }
    if (S.mis.length >= 6 && !S.aggSeen) { S.aggSeen = true; g.toast('Misfolded proteins are clumping into <b>aggregates</b> — ribosomes slow to 50 %. Clear them!', 'bad'); }

    /* cell cycle */
    if (S.phase !== 'G1') S.budVis = Math.min(1, S.budVis + dt * .25);
    if (S.phase === 'S') {
      S.dnaT += dt;
      if (S.dnaT > 2.3 && res('atp') >= 2) { S.dnaT = 0; g.res.add('atp', -1); S.dna = Math.min(1, S.dna + 1 / 16); const n = st.nuc; g.floatText(n.x + U.rand(-.3, .3), n.y, Math.round(S.dna * 100) + ' % of genome copied', '#c4b5fd'); }
      if (S.dna >= 1) { S.phase = 'G2'; g.toast('S phase complete: every chromosome now has two sister chromatids, glued together by cohesin.', 'good'); }
    }
    if ((S.phase === 'S' || S.phase === 'G2') && b >= BIO_START + (BIO_DIV - BIO_START) * .45) startOsmo();
    if (S.phase === 'M') { S.ana = Math.min(1, S.ana + dt / 6); if (S.ana >= 1) S.phase = 'T'; }
    if (S.phase === 'C') {
      S.cyto = Math.min(1, S.cyto + dt / 5);
      if (S.cyto >= 1) { S.phase = 'done'; g.after(2.2, finish); }
    }
    if (S.phase === 'done') S.sep = Math.min(1, S.sep + dt * .5);
    st.nuc.progress = S.phase === 'S' ? S.dna : null; st.nuc.ringColor = '#c4b5fd';

    /* medium */
    for (const m of S.medium) {
      m.x += m.vx * dt; m.y += m.vy * dt; m.a += dt * .5;
      if (m.x < -4.7) m.x = 6.5; if (m.x > 6.5) m.x = -4.7; if (m.y < -3.8) m.y = 3.8; if (m.y > 3.8) m.y = -3.8;
    }
  },

  drawBack(c) {
    const k = S.k, b = bud();
    /* medium: glucose (green hexagons), amino acids (pink), salt during osmotic shock */
    const nG = Math.round(46 * res('glc') / 100);
    let gi = 0;
    for (const m of S.medium) {
      const inM = Math.hypot(m.x, m.y) < (R + .35) * k, inB = b && Math.hypot(m.x - b.x * k, m.y) < (b.r + .3) * k;
      if (inM || inB) continue;
      if (m.k === 0) { if (gi++ < nG) D.glucose(c, m.x, m.y, .06, m.a); }
      else if (m.k === 1) D.aa(c, m.x, m.y, .04);
      else if (S.osmo) D.circle(c, m.x, m.y, .05, '#cfe8ff');
    }
    if (S.osmo) { c.fillStyle = 'rgba(160,200,255,.07)'; c.fillRect(-6, -5, 14, 10); for (let i = 0; i < 60; i++) D.circle(c, ((i * 7.13 + g.t * .05) % 11) - 4.6, ((i * 3.77) % 7.4) - 3.7, .03, 'rgba(207,232,255,.7)'); }
    if (S.temp > 30.5) { c.fillStyle = `rgba(255,90,40,${(S.temp - 30) / 9 * .1})`; c.fillRect(-6, -5, 14, 10); }

    c.save(); c.scale(k, k);
    const circ = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
    /* cell wall → plasma membrane → cytosol (mother and bud drawn as a union) */
    c.fillStyle = 'rgba(214,178,116,.5)'; circ(0, 0, R + .17); if (b) circ(b.x, 0, b.r + .15);
    c.fillStyle = '#f2d58a'; circ(0, 0, R + .035); if (b) circ(b.x, 0, b.r + .035);
    const gr = c.createRadialGradient(-.6, -.6, .2, 0, 0, R + (b ? b.r * 2 : 0));
    gr.addColorStop(0, '#235a6e'); gr.addColorStop(1, '#16404f');
    c.fillStyle = gr; circ(0, 0, R - .035); if (b) circ(b.x, 0, b.r - .035);
    /* crowded cytosol texture */
    c.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 90; i++) { const a = i * 2.399, r = Math.sqrt(i / 90) * (R - .25); c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, .035, 0, TAU); c.fill(); }

    /* cortical ER (teal) + tubule to the nuclear envelope */
    c.strokeStyle = 'rgba(79,214,180,.75)'; c.lineWidth = .08; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, R - .22, U.deg(296), U.deg(346)); c.stroke();
    c.beginPath(); c.arc(0, 0, R - .2, U.deg(20), U.deg(48)); c.stroke();
    c.beginPath(); c.moveTo(NUC.x + .75, NUC.y - .5); c.quadraticCurveTo(1.7, -1.2, 1.75, -1.42); c.stroke();
    /* mitochondrial network grows with HAP4 */
    const hl = mitoCap(), heat = st.mito.jobs.length > 0;
    D.mitoArc(c, 0, 0, 1.8, U.deg(hl >= 2 ? 208 : 222), U.deg(hl >= 2 ? 292 : 266), .3, heat);
    if (hl >= 2) D.mitoArc(c, 0, 0, 2.08, U.deg(58), U.deg(96), .26, heat);
    if (hl >= 3) { D.mitoArc(c, 0, 0, 2.1, U.deg(140), U.deg(172), .24, heat); D.mitoArc(c, -1.2, -1.2, .55, U.deg(20), U.deg(110), .2, heat); }
    /* Golgi: scattered single cisternae (not stacked in S. cerevisiae) */
    c.strokeStyle = '#e0b040'; c.lineWidth = .07;
    [[1.9, 0, .2], [2.05, .28, -.3], [1.72, -.3, .5], [1.6, .32, 0]].forEach(p => { c.beginPath(); c.arc(p[0], p[1] + .25, .28, -Math.PI / 2 - .5 + p[2], -Math.PI / 2 + .5 + p[2]); c.stroke(); });
    /* vacuole */
    const vg = c.createRadialGradient(VAC.x - .25, VAC.y - .25, .05, VAC.x, VAC.y, VAC.r);
    vg.addColorStop(0, 'rgba(120,200,235,.55)'); vg.addColorStop(1, 'rgba(40,110,150,.55)');
    c.fillStyle = vg; circ(VAC.x, VAC.y, VAC.r); c.strokeStyle = '#8ad8f5'; c.lineWidth = .04; c.beginPath(); c.arc(VAC.x, VAC.y, VAC.r, 0, TAU); c.stroke();
    /* lipid droplets & a peroxisome (decor, real organelles) */
    D.circle(c, -1.7, .75, .1, '#f5e6a8', '#a8964e', .015); D.circle(c, -1.55, .9, .07, '#f5e6a8', '#a8964e', .015); D.circle(c, .2, -1.95, .12, '#9be0b0', '#3d7a50', .015);
    /* old bud scar on the wall */
    c.strokeStyle = 'rgba(255,240,200,.5)'; c.lineWidth = .04; c.beginPath(); c.ellipse(Math.cos(U.deg(40)) * (R + .1), Math.sin(U.deg(40)) * (R + .1), .28, .09, U.deg(40) + Math.PI / 2, 0, TAU); c.stroke();
    /* actin cables guiding vesicles into the bud */
    if (b && S.phase !== 'done') { c.strokeStyle = 'rgba(255,120,120,.25)'; c.lineWidth = .025; for (const y of [-.25, 0, .25]) { c.beginPath(); c.moveTo(.9, y * 3 + .6); c.quadraticCurveTo(2.0, y, b.x, y * b.r); c.stroke(); } }
    /* septin ring / septum */
    if (b && S.phase !== 'done') {
      const n = neck();
      c.strokeStyle = '#b6f09c'; c.lineWidth = .06; for (const sg of [-1, 1]) { c.beginPath(); c.arc(n.x, sg * n.h, .07, 0, TAU); c.stroke(); }
      if (S.cyto > 0) { const h = n.h * (1 - S.cyto); c.strokeStyle = '#f2d58a'; c.lineWidth = .07; for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(n.x, sg * n.h); c.lineTo(n.x, sg * h); c.stroke(); } c.strokeStyle = '#ff7a7a'; c.lineWidth = .05; c.beginPath(); c.moveTo(n.x, -h); c.lineTo(n.x, h); c.stroke(); }
    }
    if (S.phase === 'done') { c.strokeStyle = 'rgba(255,240,200,.8)'; c.lineWidth = .05; c.beginPath(); c.ellipse(R + .1, 0, .09, .33, 0, 0, TAU); c.stroke(); }
    c.restore();

    /* labels */
    g.label('Vacuole', VAC.x * k, (VAC.y + .25) * k, { color: '#bfe9fb', alpha: .8 });
    if (g.showLabels) {
      g.label('glucose medium', -3.7, -3.15, { color: '#7CFC8Aaa', align: 'left' });
      if (b && S.phase !== 'done') g.label('bud', b.x * k, (b.r + .4) * k, { color: '#f2d58a' });
      if (S.phase === 'done') { g.label('daughter', b.x * k, (b.r + .4) * k, { color: '#f2d58a' }); g.label('mother', 0, (R + .4) * k, { color: '#f2d58a' }); }
      g.label('ethanol + CO₂ out', -3.2, 2.6, { color: '#e6c9ffaa', alpha: S.eth ? 1 : 0 });
    }
    if (S.mis.length >= 6) g.label('⚠ protein aggregates: translation slowed', 0, -(R + .45) * k, { color: '#ff8f8f', bold: true });
  },
});

/* ---------- nucleus drawing (interphase, replication, closed mitosis) ---------- */
function drawNucleus(c, s) {
  const k = S.k, r = NUC.r * k, b = bud();
  const body = (x, y, rr) => {
    const gr = c.createRadialGradient(x - rr * .3, y - rr * .3, rr * .1, x, y, rr); gr.addColorStop(0, '#4b3f8f'); gr.addColorStop(1, '#2d2560');
    D.circle(c, x, y, rr, gr); D.bilayer(c, cc => cc.arc(x, y, rr, 0, TAU), .07 * k, '#b3a6f5');
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .2; D.circle(c, x + Math.cos(a) * rr, y + Math.sin(a) * rr, .035 * k, '#efeaff'); }   // nuclear pores
  };
  const chromatin = (x, y, rr, n, col) => { c.strokeStyle = col; c.lineWidth = .05 * k; for (let i = 0; i < n; i++) { const a = i * 2.4 + 1, d = rr * (.25 + .5 * ((i * 37 % 10) / 10)); c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, .1 * k, a, a + 2.6); c.stroke(); } };
  if (S.ana > 0 && b) {
    const p = U.ease(S.ana), bx = b.x * k, ex = U.lerp(s.x, bx, p), ey = U.lerp(s.y, 0, p);
    if (S.phase === 'M') {                              // elongating nucleus squeezing through the neck
      c.strokeStyle = '#b3a6f5'; c.lineWidth = r * (1.6 - 1.1 * p); c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = '#2d2560'; c.lineWidth = r * (1.6 - 1.1 * p) - .12 * k; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(ex, ey); c.stroke();
    }
    body(s.x, s.y, r * (1 - .18 * p)); body(ex, ey, r * (1 - .28 * p));
    if (S.phase === 'M') { c.strokeStyle = '#9af7c0'; c.lineWidth = .035 * k; c.beginPath(); c.moveTo(s.x - r * .5, s.y - r * .1); c.lineTo(ex + r * .4, ey); c.stroke(); g.label('spindle', (s.x + ex) / 2, (s.y + ey) / 2 - .25, { size: 10, color: '#9af7c0' }); }
    chromatin(s.x, s.y, r * .7, 8, '#ff9ecf'); chromatin(ex, ey, r * .6, 8, '#ff9ecf');
    D.circle(c, s.x - r * .75, s.y - r * .15, .06 * k, '#9af7c0'); D.circle(c, ex + r * .6, ey, .06 * k, '#9af7c0');
    g.label('Nucleus', s.x, s.y + r + .16, { color: '#d5cffb' });
    return;
  }
  body(s.x, s.y, r);
  /* nucleolus: dense crescent against the envelope (ribosome factory) */
  c.save(); c.beginPath(); c.arc(s.x, s.y, r * .93, 0, TAU); c.clip(); D.circle(c, s.x + r * .55, s.y - r * .62, r * .62, 'rgba(126,104,220,.85)'); c.restore();
  chromatin(s.x - r * .1, s.y + r * .1, r * .75, S.dna > 0 ? 9 + Math.round(S.dna * 9) : 9, S.dna > 0 ? '#ff9ecf' : '#e58cc0');
  /* spindle pole body (two after duplication) */
  const sa = Math.atan2(-s.y, R * k - s.x); D.circle(c, s.x + Math.cos(sa) * r, s.y + Math.sin(sa) * r, .055 * k, '#9af7c0', '#1f6b45', g.px);
  if (S.phase === 'G2' || S.phase === 'S') D.circle(c, s.x + Math.cos(sa + .5) * r, s.y + Math.sin(sa + .5) * r, .055 * k, '#9af7c0', '#1f6b45', g.px);
  /* Whi5 (red dots) is diluted as the cell grows */
  if (S.phase === 'G1') { const n = Math.max(1, Math.round(7 * (1 - res('bio') / (BIO_START * 1.25)))); for (let i = 0; i < n; i++) { const a = i * 2.1 + g.t * .3; D.circle(c, s.x + Math.cos(a) * r * .5 - r * .15, s.y + Math.sin(a * 1.3) * r * .45 + r * .15, .045 * k, '#ff6b6b'); } }
  /* transcription: Pol II runs along a gene, mRNA grows behind it */
  if (S.tx) {
    const p = S.tx.t / S.tx.dur, x1 = s.x - r * .6, x2 = s.x + r * .25, y = s.y + r * .42;
    c.strokeStyle = '#ffffffaa'; c.lineWidth = .03 * k; c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
    const px = U.lerp(x1, x2, p);
    c.strokeStyle = '#f0a8ff'; c.lineWidth = 2 * g.px; c.beginPath(); for (let i = 0; i <= 8; i++) { const q = i / 8, xx = px - q * p * r * .5, yy = y - .06 - q * p * r * .35 + Math.sin(q * 9 + g.t * 6) * .02; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
    D.ellipse(c, px, y, .09 * k, .07 * k, 0, '#ffb86b', '#7a4a00', g.px);
    g.label(S.tx.it.gene, (x1 + x2) / 2, y + .17, { size: 9, color: '#f0a8ff', italic: true });
    g.label('RNA Pol II', px, y - r * .55, { size: 9, color: '#ffb86b', alpha: .9 });
  }
  g.label('Nucleus', s.x, s.y - r - .14, { color: '#d5cffb' });
  if (g.cam.z > 1.5) g.label('nucleolus', s.x + r * .42, s.y - r * .55, { size: 9, color: '#d5cffb' });
}

function finish() {
  g.hint(null);
  g.learn('y_cycle'); g.learn('y_mitosis');
  const s = S.stats, tot = s.ferm + s.resp || 1;
  g.win({ title: 'One cell became two', html: `<p>Your yeast grew to critical size, passed START, copied its 16 chromosomes, survived stress, pulled its genome apart inside an intact nucleus and pinched off a daughter.
    A real cell does all of this in about <b>90 minutes</b> — and both cells now start again.</p><p>Next: let them keep dividing and see what happens to a whole population.</p>`,
    stats: [[s.imp, 'glucose imported'], [Math.round(s.atp), 'ATP made'], [Math.round(100 * s.resp / tot) + ' %', 'pyruvate respired'], [s.ferm, 'ethanol released'], [s.bio, 'proteins built'], [s.genes, 'genes expressed'], [U.mmss(g.t), 'play time']] });
}

/* ---------- codex ---------- */
CG.levels[CG.levels.length - 1].codex = [
  { id: 'y_numbers', title: 'Yeast by the numbers', html: `<p><i>Saccharomyces cerevisiae</i> is a single-celled fungus and the best-understood eukaryotic cell on Earth.</p>
    <ul><li>Size: 4–6 µm across, volume ~40–80 femtolitres (a human red blood cell is ~90 fL).</li><li>Genome: 12 million base pairs, 16 chromosomes, ~6,000 genes — the first eukaryote sequenced (1996).</li>
    <li>About 50 million protein molecules, 200,000 ribosomes, ~15,000–60,000 mRNAs (estimates vary).</li><li>Doubling time: ~90 minutes at 30 °C in rich glucose medium.</li>
    <li>ATP: ~3 mM in the cytosol; the pool is turned over every few seconds.</li></ul>
    <p><b>What the game changes:</b> one token stands for millions of molecules; machines wait for your click until you make enough copies; a 90-minute cycle is compressed into minutes. Stoichiometry (2 ATP net from glycolysis, 4 ATP per amino acid added, NADH balance, ~16 ATP per glucose respired) is real, as are the locations and names of every protein.</p>` },
  { id: 'y_glyco', title: 'Glycolysis', html: `<p>Ten enzymes in the cytosol convert one glucose (6 carbons) into two pyruvate (3 carbons each).</p>
    <ol><li><b>Investment:</b> hexokinase and phosphofructokinase each spend one ATP to add a phosphate. This traps the sugar in the cell and destabilises it.</li>
    <li><b>Split:</b> aldolase cuts fructose-1,6-bisphosphate into two 3-carbon sugars.</li>
    <li><b>Payoff:</b> GAPDH (Tdh3) oxidises each half, handing electrons to NAD⁺ (→ NADH); phosphoglycerate kinase and pyruvate kinase then make 2 ATP per half.</li></ol>
    <p>Net: <b>2 ATP + 2 NADH</b>. The catch is the NADH — the cell only has a small NAD⁺ pool, so NADH must be re-oxidised continuously. How it does that (fermentation or respiration) is the central choice of energy metabolism.</p>` },
  { id: 'y_ferment', title: 'Fermentation and the Crabtree effect', html: `<p>Fermentation regenerates NAD⁺ without oxygen: pyruvate → acetaldehyde + CO₂ (Pdc1), then acetaldehyde + NADH → ethanol + NAD⁺ (Adh1).</p>
    <p>Surprisingly, baker's yeast ferments even with plenty of oxygen whenever glucose is abundant — the <b>Crabtree effect</b>. Respiration gives ~8× more ATP per glucose, but fermentation gives ATP <i>faster</i> per unit of protein invested, and the ethanol poisons competitors. Later, when the sugar is gone, yeast takes the ethanol back up and respires it (the "diauxic shift").</p>
    <p>The same logic — fast, wasteful glycolysis despite oxygen — appears in many cancer cells, where it is called the Warburg effect.</p>` },
  { id: 'y_respire', title: 'Respiration in mitochondria', html: `<p>Mitochondria descend from a bacterium engulfed ~2 billion years ago. They still have two membranes and their own DNA.</p>
    <p>Pyruvate is imported (Mpc1/Mpc3), converted to acetyl-CoA, and oxidised to CO₂ in the TCA cycle. The electrons travel along the inner-membrane respiratory chain — in yeast: NADH dehydrogenase Ndi1 → ubiquinone → Complex III → cytochrome c → Complex IV → O₂ — pumping protons out of the matrix. The <b>ATP synthase</b> lets protons back in through a rotor; each turn makes three ATP.</p>
    <p>Yeast lacks the proton-pumping Complex I that mammals have, so it gets ~16 ATP per glucose rather than ~30.</p>
    <p>While glucose is high, the repressor <b>Mig1</b> keeps respiratory genes off. When glucose falls, the energy sensor <b>Snf1</b> (yeast's AMPK) phosphorylates Mig1, which leaves the nucleus; the activator <b>Hap4</b> then switches on the respiratory programme.</p>` },
  { id: 'y_dogma', title: 'From gene to protein', html: `<p>Every upgrade in this game follows the real route of gene expression:</p>
    <ol><li><b>Transcription</b> — RNA polymerase II copies one DNA strand into messenger RNA (~20–30 nucleotides/s). The mRNA gets a 5′ cap and a poly-A tail.</li>
    <li><b>Export</b> — the mRNA leaves through a nuclear pore, escorted by the export receptor Mex67–Mtr2.</li>
    <li><b>Translation</b> — a ribosome reads codons and joins amino acids (~5–10 per second, 4 ATP equivalents each).</li>
    <li><b>Folding and targeting</b> — chaperones help the chain fold; address signals in its sequence send it to the right compartment.</li></ol>
    <p>Regulation happens mostly at step 1: transcription factors (Rgt1, Mig1, Hap4, Hsf1, Hog1 targets…) decide which genes are read. That is why signalling pathways in this level end in the nucleus.</p>` },
  { id: 'y_secretory', title: 'The secretory pathway', html: `<p>Membrane proteins such as the Hxt transporters cannot simply float to the cell surface. Their ribosome is docked on the <b>ER</b> by the signal-recognition particle; the chain is threaded into the membrane through the Sec61 channel. COPII vesicles carry it to the <b>Golgi</b>, where sugars are trimmed and added, and secretory vesicles then ride along actin cables (motor: Myo2) to fuse with the plasma membrane, guided by the exocyst complex.</p>
    <p>The genes of this pathway (<i>SEC1</i>–<i>SEC23</i>…) were discovered in yeast by Randy Schekman — Nobel Prize 2013.</p>` },
  { id: 'y_signal', title: 'Sensing sugar', html: `<p>Yeast adjusts its metabolism to the sugar supply through two opposing systems:</p>
    <ul><li><b>Snf3/Rgt2 → Rgt1:</b> transporter-like sensors in the membrane detect glucose outside and, via the kinase Yck1, trigger destruction of the co-repressors Mth1/Std1, switching on the right <i>HXT</i> transporter genes.</li>
    <li><b>Snf1 → Mig1:</b> when glucose is scarce, Snf1 kinase (the yeast version of AMPK, the energy gauge of all eukaryotes) becomes active and phosphorylates the repressor Mig1, which is exported from the nucleus. Genes for high-affinity transporters, respiration and alternative carbon sources are released.</li></ul>
    <p>Uptake itself follows Michaelis–Menten kinetics: rate = V<sub>max</sub>·[S]/(K<sub>m</sub>+[S]). Hxt1 (K<sub>m</sub> ≈ 100 mM) is nearly idle at 4 mM glucose; Hxt7 (K<sub>m</sub> ≈ 1–2 mM) still runs at ~75 %.</p>` },
  { id: 'y_qc', title: 'Protein quality control', html: `<p>A protein only works when folded into its exact shape. Heat, errors and crowding make some chains misfold, exposing greasy patches that stick together into toxic aggregates.</p>
    <ul><li><b>Chaperones</b> (Hsp70/Ssa1, Hsp90, Hsp104) bind such patches and use ATP to give the chain another try.</li>
    <li><b>Ubiquitin–proteasome system:</b> hopeless cases receive a chain of ubiquitin and are shredded by the 26S proteasome into reusable amino acids.</li>
    <li><b>Heat-shock response:</b> Hsf1 is normally held inactive by Hsp70. When unfolded proteins occupy the Hsp70, Hsf1 is freed and transcribes more chaperones — until there is again enough Hsp70 to shut it off.</li></ul>
    <p>Failures of these systems underlie human diseases of protein aggregation such as Alzheimer's, Parkinson's and Huntington's.</p>` },
  { id: 'y_hog', title: 'Osmotic stress and the HOG pathway', html: `<p>If the outside suddenly becomes saltier, water leaves the cell by osmosis: it shrinks, turgor collapses and growth stops. The <b>High Osmolarity Glycerol</b> pathway fixes this:</p>
    <p>Sln1 (turgor sensor) → Ypd1 → Ssk1 → Ssk2/Ssk22 (MAPKKK) → Pbs2 (MAPKK) → <b>Hog1</b> (MAPK).</p>
    <p>Hog1 closes the glycerol channel Fps1, pauses the cell cycle, and enters the nucleus to induce <i>GPD1</i>. Glycerol accumulates until inside and outside are balanced; then the pathway switches itself off. Three-tiered MAP-kinase cascades like this one are used by all eukaryotes; Hog1's human counterpart is p38.</p>` },
  { id: 'y_cycle', title: 'START and the cell cycle', html: `<p>The cycle has four phases: G1 (growth), S (DNA synthesis), G2 and M (mitosis). It is driven by one cyclin-dependent kinase, <b>Cdk1 (Cdc28)</b>, partnered with different cyclins over time.</p>
    <p><b>START:</b> in G1 the inhibitor Whi5 blocks the transcription factor SBF. A leading model holds that the amount of Whi5 is fixed at birth, so as the cell grows its concentration falls; once Cln3–Cdk1 gains the upper hand, Whi5 is phosphorylated and exported, SBF turns on <i>CLN1/2</i>, and positive feedback makes the decision irreversible. Budding, spindle-pole duplication and DNA replication then begin together.</p>
    <p><b>S phase:</b> ~400 replication origins fire; ribonucleotide reductase supplies dNTPs. Sister chromatids stay glued by cohesin rings.</p>
    <p>Leland Hartwell found the <i>CDC</i> genes in yeast; with Paul Nurse and Tim Hunt he received the 2001 Nobel Prize.</p>` },
  { id: 'y_mitosis', title: 'Closed mitosis and cytokinesis', html: `<p>Yeast never dissolves its nuclear envelope. The <b>spindle pole bodies</b> sit in the envelope and build the spindle <i>inside</i> the nucleus; each of the 32 kinetochores is held by a single microtubule.</p>
    <p>When every chromosome is attached, the spindle-assembly checkpoint releases <b>APC/C–Cdc20</b>. It ubiquitinates securin (Pds1); freed separase (Esp1) cuts the cohesin subunit Scc1, and sisters fly apart as the nucleus stretches through the bud neck.</p>
    <p>The mitotic-exit network then releases the phosphatase Cdc14, Cdk1 activity collapses, and the actomyosin ring (Myo1) closes while Chs2 builds a chitin septum. The daughter digests the septum with chitinase (Cts1) and floats free; the mother keeps a bud scar. Mothers typically manage ~20–30 divisions (replicative ageing); the scars count them, but ageing is driven by things the mother retains — rDNA circles, protein aggregates, a less acidic vacuole — so the daughter is born young.</p>` },
];
})();
