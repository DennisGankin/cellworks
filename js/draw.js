/* CG.D — drawing helpers. Everything is in WORLD units (µm) because the canvas is already
   world-transformed when levels draw. D.px = size of one screen pixel in world units, D.t = game time.
   Shapes are schematic cartoons of the real molecules (roughly the right silhouette), enlarged to be visible. */
(function () {
'use strict';
const TAU = Math.PI * 2;
const D = CG.D = { px: .01, t: 0 };

D.circle = function (ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5 * D.px; ctx.stroke(); }
};
D.ellipse = function (ctx, x, y, rx, ry, rot, fill, stroke, lw) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5 * D.px; ctx.stroke(); }
};
D.glow = function (ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.globalAlpha *= alpha == null ? .6 : alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
};
/* lipid bilayer along the current path: call with a function that builds the path */
D.bilayer = function (ctx, pathFn, w, col, core) {
  ctx.beginPath(); pathFn(ctx); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
  ctx.beginPath(); pathFn(ctx); ctx.lineWidth = w * .34; ctx.strokeStyle = core || 'rgba(10,20,35,.55)'; ctx.stroke();
};
D.poly = function (ctx, x, y, r, n, rot, fill, stroke, lw) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = (rot || 0) + i / n * TAU; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2 * D.px; ctx.stroke(); }
};
/* small molecules */
D.glucose = (ctx, x, y, r, a) => D.poly(ctx, x, y, r, 6, a || 0, '#7CFC8A', '#1d6b2a');
D.pyruvate = (ctx, x, y, r, a) => D.poly(ctx, x, y, r, 3, a || 0, '#ffb347', '#8a5300');
D.atp = function (ctx, x, y, r) {            // adenosine + three phosphates
  D.circle(ctx, x - r * .7, y, r * .62, '#ffe14d', '#8a6d00', D.px);
  for (let i = 0; i < 3; i++) D.circle(ctx, x + r * (.15 + i * .55), y, r * .3, '#ff9d2e', '#8a4a00', D.px * .8);
};
D.aa = (ctx, x, y, r) => D.circle(ctx, x, y, r, '#ff8ad8', '#7a2a5f', D.px);
D.ion = function (ctx, x, y, r, col, txt) { D.circle(ctx, x, y, r, col, 'rgba(0,0,0,.4)', D.px); };
D.bubble = function (ctx, x, y, r, col) { D.circle(ctx, x, y, r, 'rgba(255,255,255,.08)', col || 'rgba(220,235,255,.7)', 1.2 * D.px); D.circle(ctx, x - r * .35, y - r * .35, r * .18, 'rgba(255,255,255,.6)'); };

/* membrane transporter / channel: two lobes spanning the bilayer. `ang` = outward normal. */
D.transporter = function (ctx, x, y, ang, s, col, open, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const gap = open ? s * .2 : s * .07;
  ctx.fillStyle = col; ctx.strokeStyle = dark || 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.2 * D.px;
  for (const sg of [-1, 1]) { ctx.beginPath(); ctx.roundRect(-s * .55, sg * gap + (sg < 0 ? -s * .38 : 0), s * 1.1, s * .38, s * .17); ctx.fill(); ctx.stroke(); }
  ctx.restore();
};
/* single-pass receptor / sensor: stalk through the membrane with an outside ligand-binding head */
D.receptor = function (ctx, x, y, ang, s, col, active) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = col; ctx.lineWidth = s * .2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * .7, 0); ctx.lineTo(s * .45, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * .45, 0); ctx.lineTo(s * .85, -s * .32); ctx.moveTo(s * .45, 0); ctx.lineTo(s * .85, s * .32); ctx.stroke();
  D.circle(ctx, -s * .75, 0, s * .22, active ? '#fff3a0' : col, 'rgba(0,0,0,.4)', D.px);
  if (active) D.glow(ctx, 0, 0, s * 1.3, '#ffe14d', .5);
  ctx.restore();
};
/* P-type / generic pump: a bulky body with a cytosolic knob */
D.pump = function (ctx, x, y, ang, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.2 * D.px;
  ctx.beginPath(); ctx.roundRect(-s * .5, -s * .32, s, s * .64, s * .2); ctx.fill(); ctx.stroke();
  D.circle(ctx, -s * .7, 0, s * .36, col, 'rgba(0,0,0,.45)', 1.2 * D.px);
  ctx.restore();
};
/* ribosome: large + small subunit; optional mRNA thread and nascent chain */
D.ribosome = function (ctx, x, y, s, busy, prog) {
  if (busy) {
    ctx.strokeStyle = '#f0a8ff'; ctx.lineWidth = 2 * D.px; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const px = x - s * 1.5 + i / 12 * s * 3, py = y + s * .32 + Math.sin(i * 1.3 + D.t * 6) * s * .1; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  D.ellipse(ctx, x, y - s * .2, s * .75, s * .6, 0, '#d9c7a3', '#6b5732', 1.2 * D.px);
  D.ellipse(ctx, x, y + s * .42, s * .62, s * .34, 0, '#b79b6b', '#6b5732', 1.2 * D.px);
  if (busy && prog > 0) {
    ctx.strokeStyle = '#7ee787'; ctx.lineWidth = 2.4 * D.px; ctx.beginPath(); const n = Math.max(2, Math.round(prog * 10));
    for (let i = 0; i <= n; i++) { const px = x + Math.sin(i * 1.9) * s * .22, py = y - s * .8 - i * s * .13; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
};
/* 26S proteasome: 20S barrel (4 stacked rings) + 19S caps */
D.proteasome = function (ctx, x, y, s, rot, active) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  ctx.lineWidth = 1.2 * D.px; ctx.strokeStyle = 'rgba(0,0,0,.5)';
  const cols = ['#8fa8ff', '#6f86e8', '#6f86e8', '#8fa8ff'];
  for (let i = 0; i < 4; i++) { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.roundRect(-s * .42, -s * .56 + i * s * .28, s * .84, s * .27, s * .09); ctx.fill(); ctx.stroke(); }
  for (const sg of [-1, 1]) { ctx.fillStyle = '#c9a0ff'; ctx.beginPath(); ctx.ellipse(0, sg * s * .78, s * .46, s * .24, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
  if (active) D.glow(ctx, 0, 0, s * 1.2, '#c9a0ff', .5);
  ctx.restore();
};
/* folded protein = compact blob; misfolded = tangled line with exposed (red) hydrophobic patches */
D.protein = function (ctx, x, y, s, col, seed, mis) {
  seed = seed || 1;
  if (mis) {
    ctx.strokeStyle = col; ctx.lineWidth = s * .28; ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = seed * 3.1 + i * 2.4, r = s * (.35 + .65 * ((Math.sin(seed * 7 + i * 5.3) + 1) / 2)); const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = seed + i * 2.1; D.circle(ctx, x + Math.cos(a) * s * .55, y + Math.sin(a) * s * .55, s * .2, '#ff5d5d'); }
    return;
  }
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = D.px;
  for (let i = 0; i < 3; i++) { const a = seed * 2 + i * 2.1; ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * .32, y + Math.sin(a) * s * .32, s * .55, 0, TAU); ctx.fill(); }
};
/* wavy single strand (mRNA) */
D.mrna = function (ctx, x, y, len, col, phase) {
  ctx.strokeStyle = col || '#f0a8ff'; ctx.lineWidth = 2.2 * D.px; ctx.beginPath();
  for (let i = 0; i <= 14; i++) { const px = x - len / 2 + i / 14 * len, py = y + Math.sin(i * 1.1 + (phase || 0)) * len * .13; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke();
  D.circle(ctx, x - len / 2, y, len * .07, '#fff');        // 5' cap
};
D.vesicle = function (ctx, x, y, r, col, cargo) {
  D.circle(ctx, x, y, r, 'rgba(255,255,255,.08)', col || '#f2d58a', 2.2 * D.px);
  if (cargo) D.circle(ctx, x, y, r * .45, cargo);
};
/* F1Fo ATP synthase, lollipop sticking out of a membrane; ang = direction of the F1 head */
D.atpSynthase = function (ctx, x, y, ang, s, spin) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#ffb36b'; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = D.px;
  ctx.beginPath(); ctx.roundRect(-s * .25, -s * .3, s * .5, s * .6, s * .1); ctx.fill(); ctx.stroke();   // Fo ring in membrane
  ctx.fillRect(s * .22, -s * .07, s * .4, s * .14);                                                      // stalk
  for (let i = 0; i < 3; i++) { const a = (spin || 0) + i * TAU / 3; D.circle(ctx, s * .95 + Math.cos(a) * s * .17, Math.sin(a) * s * .17, s * .26, i % 2 ? '#ffd08a' : '#ff9d5c', 'rgba(0,0,0,.4)', D.px); }
  ctx.restore();
};
/* arrow along a line (for pathway diagrams) */
D.arrow = function (ctx, x1, y1, x2, y2, col, w) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = (w || 2 * D.px) * 3.5;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w || 2 * D.px;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a - .5) * h, y2 - Math.sin(a - .5) * h); ctx.lineTo(x2 - Math.cos(a + .5) * h, y2 - Math.sin(a + .5) * h); ctx.closePath(); ctx.fill();
};
/* mitochondrial tubule along an arc centred on (cx,cy): outer membrane + inner membrane + cristae ticks */
D.mitoArc = function (ctx, cx, cy, r, a1, a2, w, heat) {
  const path = c => c.arc(cx, cy, r, a1, a2);
  ctx.lineCap = 'round';
  ctx.beginPath(); path(ctx); ctx.lineWidth = w; ctx.strokeStyle = '#ffab7a'; ctx.stroke();
  ctx.beginPath(); path(ctx); ctx.lineWidth = w * .78; ctx.strokeStyle = heat ? '#c9502f' : '#9a3f2a'; ctx.stroke();
  ctx.strokeStyle = '#ffb38a'; ctx.lineWidth = 1.3 * D.px; ctx.lineCap = 'butt';
  const n = Math.max(2, Math.round(Math.abs(a2 - a1) * r / (w * .55)));
  for (let i = 1; i < n; i++) {
    const a = a1 + (a2 - a1) * i / n, s = i % 2 ? 1 : -1, c = Math.cos(a), sn = Math.sin(a);
    ctx.beginPath(); ctx.moveTo(cx + c * (r + s * w * .36), cy + sn * (r + s * w * .36)); ctx.lineTo(cx + c * (r - s * w * .12), cy + sn * (r - s * w * .12)); ctx.stroke();
  }
  ctx.lineCap = 'round';
};
/* generic kinase / signalling protein token */
D.kinase = function (ctx, x, y, s, col, phos) {
  D.ellipse(ctx, x, y - s * .25, s * .5, s * .38, 0, col, 'rgba(0,0,0,.4)', D.px);
  D.ellipse(ctx, x, y + s * .3, s * .62, s * .45, 0, col, 'rgba(0,0,0,.4)', D.px);
  if (phos) D.circle(ctx, x + s * .6, y - s * .45, s * .26, '#ffe14d', '#7a5c00', D.px);
};
})();
