/* ============================================================================
   CELLWORKS ENGINE  —  shared by every level.  No build step, plain <script>.

   A level is a plain object passed to CG.registerLevel({...}):

     id, title, organism, blurb, learn, color           menu card
     world: {x,y,w,h}                                   world rectangle in MICROMETRES (µm); +y is down
     intro: html                                        shown in a modal before play
     shopTitle, shopSub                                 right-hand panel heading
     codex: [{id,title,html}]                           encyclopedia entries, unlocked with g.learn(id)
     setup(g)                                           create resources, stations, shop items, objectives
     update(g,dt)                                       simulation step (dt = game seconds)
     bg(ctx,g,W,H)            optional                  screen-space background (default: dark gradient)
     drawBack(ctx,g)                                    world-space drawing under stations (the cell itself)
     drawMid(ctx,g)           optional                  world-space, above stations, below tokens
     drawFront(ctx,g)         optional                  world-space, above tokens
     phase(g) -> string                                 small status under the title (e.g. "G1 phase")
     clock(g) -> string                                 "biological time" readout
     onClick(g,wx,wy)         optional                  click on empty world space

   The Game object `g` (one per run):

     g.S                       level-owned state bag
     g.t, g.dt                 game time (s), last step
     g.px                      size of one screen pixel in world units (use for hairlines: ctx.lineWidth = 1.5*g.px)
     g.res                     resources:  def(id,{name,short,color,v,cap,desc,show}), get, set, add(id,n,at?), has(cost), spend(cost), cap(id,v?)
     g.addStation(o)           clickable machine:
                                 {id,name,x,y,r, draw(ctx,st,g), onClick(st,g), update(st,g,dt),
                                  ready(st,g)->bool   (shows a bouncing "click me" marker)
                                  badge(st,g)->text   (small counter), progress (0..1|null, ring), hidden, noLabel,
                                  info: {title,sub,body,facts:[],game,live(g)->[[k,v]]} | (st,g)=>that }
     g.station(id)
     g.token(o)                moving molecule: {x,y,r,color,draw(ctx,t,g),onClick(t,g),wander:{speed,bound(x,y),home}}
                                 chain:  t.to(x,y,dur,{arc,speed,linear}) | t.to(obj,dur)  .wait(s) .then(fn) .fade(s) .die()
     g.shop.add(o)             {id,gene,title,desc|(nextLv)=>str,group,max,cost(lv)->{res:n},req(g)->true|"why locked",
                                 onBuy(g,item)  (optional: run your own animation, then call g.shop.grant(id)),
                                 onGrant(g,level,item)}
     g.shop.level(id), g.shop.grant(id)
     g.obj.set([{text,hint,target,check(g),progress(g)->[cur,max],onStart(g),onDone(g)}])   sequential goals
     g.obj.addSide({id,text,hint,check,progress,onDone}), g.obj.removeSide(id)             event goals
     g.hint(html,target?)      bottom hint bar; target = station id (spotlight + "Click here"; other click markers are hidden meanwhile)
                               or 'shop:<itemId>' (that shop card pulses). Objectives pass their `target` here automatically.
     g.toast(html,kind)        kind: '', 'good', 'bad'
     g.banner({title,text,kind:'stress'|'good'|'',dur})
     g.learn(codexId)          unlock a codex entry (toast)
     g.floatText(x,y,text,color), g.ring(x,y,color,r0,r1,dur), g.burst(x,y,color,n)
     g.label(text,x,y,{size,color,align,bold,alpha})       screen-crisp text at a world position (call during draw)
     g.after(sec,fn), g.every(sec,fn)                      game-time timers
     g.modal({title,html,buttons:[{label,primary,fn}]})    pauses the game while open
     g.win({title,html,stats:[[value,label]]})             level complete
     g.select(station)         show a station in the inspector
     g.focus(x,y,zoom)         move camera
     CG.sfx(name)              'click','good','bad','buy','pop','win','alarm'
     CG.U                      math helpers,  CG.D  drawing helpers (draw.js)
   ========================================================================== */
(function () {
'use strict';
const TAU = Math.PI * 2;
const U = {
  TAU,
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  rand: (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a),
  pick: a => a[Math.random() * a.length | 0],
  ease: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  pol: (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r],
  deg: d => d * Math.PI / 180,
  approach: (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step),
  compact: n => n >= 1e9 ? +(n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? +(n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(n),
  mmss: s => { s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); },
};
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const CG = window.CG = { U, levels: [], game: null, registerLevel(l) { this.levels.push(l); } };

/* ---------------- persistence ---------------- */
const SAVE_KEY = 'cellworks.v1';
CG.save = {
  data: { done: {}, codex: {}, muted: false, unlockAll: false },
  load() { try { Object.assign(this.data, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {} },
  store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {} },
};

/* ---------------- sound ---------------- */
let AC = null;
const SFX = {
  click: [[520], .05, 'triangle', .05], good: [[660, 880], .09, 'sine', .07], bad: [[170], .12, 'sawtooth', .04],
  buy: [[440, 660, 880], .07, 'triangle', .06], pop: [[900], .03, 'sine', .04], win: [[523, 659, 784, 1047], .15, 'triangle', .08],
  alarm: [[330, 260, 330, 260], .13, 'square', .035],
};
CG.sfx = function (name) {
  if (CG.save.data.muted) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const [notes, d, type, vol] = SFX[name] || SFX.click;
    notes.forEach((f, i) => {
      const o = AC.createOscillator(), gn = AC.createGain(), t0 = AC.currentTime + i * d;
      o.type = type; o.frequency.value = f;
      gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(.0001, t0 + d * 1.6);
      o.connect(gn).connect(AC.destination); o.start(t0); o.stop(t0 + d * 1.7);
    });
  } catch (e) {}
};

/* ---------------- token (moving molecule) ---------------- */
class Token {
  constructor(g, o) {
    this.g = g; this.x = 0; this.y = 0; this.r = .06; this.a = 1; this.rot = 0; this.q = []; this.dead = false; this.age = 0; this.color = '#fff';
    Object.assign(this, o);
  }
  to(a, b, c, d) {
    let tgt, dur, opt;
    if (typeof a === 'object') { tgt = a; dur = b; opt = c; } else { tgt = { x: a, y: b }; dur = c; opt = d; }
    this.q.push({ k: 'm', tgt, dur: dur == null ? .6 : dur, opt: opt || {} }); return this;
  }
  wait(d) { this.q.push({ k: 'w', dur: d }); return this; }
  then(fn) { this.q.push({ k: 'f', fn }); return this; }
  fade(d = .4) { this.q.push({ k: 'a', dur: d }); return this; }
  die() { return this.then(() => { this.dead = true; }); }
  stop() { this.q.length = 0; return this; }
  update(dt) {
    this.age += dt;
    let guard = 0;
    while (this.q[0] && this.q[0].k === 'f' && guard++ < 20) { const s = this.q.shift(); s.fn(this); }
    const s = this.q[0];
    if (!s) { if (this.wander) this._wander(dt); return; }
    if (s.t === undefined) {
      s.t = 0; s.x0 = this.x; s.y0 = this.y; s.a0 = this.a;
      if (s.k === 'm' && s.opt.speed) s.dur = Math.max(.05, U.dist(this.x, this.y, s.tgt.x, s.tgt.y) / s.opt.speed);
    }
    s.t += dt;
    const p = Math.min(1, s.t / Math.max(1e-6, s.dur));
    if (s.k === 'm') {
      const e = s.opt.linear ? p : U.ease(p);
      this.x = U.lerp(s.x0, s.tgt.x, e); this.y = U.lerp(s.y0, s.tgt.y, e);
      if (s.opt.arc) this.y -= Math.sin(p * Math.PI) * s.opt.arc;
    } else if (s.k === 'a') this.a = s.a0 * (1 - p);
    if (p >= 1) this.q.shift();
  }
  _wander(dt) {
    const w = this.wander, sp = w.speed || .2;
    if (this.vx === undefined) { const a = U.rand(TAU); this.vx = Math.cos(a); this.vy = Math.sin(a); }
    const a = U.rand(-1, 1) * 6 * dt, c = Math.cos(a), s = Math.sin(a);
    const vx = this.vx * c - this.vy * s; this.vy = this.vx * s + this.vy * c; this.vx = vx;
    const nx = this.x + this.vx * sp * dt, ny = this.y + this.vy * sp * dt;
    if (!w.bound || w.bound(nx, ny, this)) { this.x = nx; this.y = ny; }
    else {
      const h = typeof w.home === 'function' ? w.home(this) : w.home;
      if (h) { const d = Math.hypot(h.x - this.x, h.y - this.y) || 1; this.vx = (h.x - this.x) / d; this.vy = (h.y - this.y) / d; this.x += this.vx * sp * dt; this.y += this.vy * sp * dt; }
      else { this.vx = -this.vx; this.vy = -this.vy; }
    }
  }
}

/* ---------------- resources ---------------- */
class Res {
  constructor(g) { this.g = g; this.d = {}; this.order = []; }
  def(id, o) { this.d[id] = Object.assign({ id, name: id, short: o.name || id, v: 0, cap: Infinity, color: '#fff', show: true, desc: '' }, o); this.order.push(id); this.g._dirtyRes = true; return this; }
  get(id) { return this.d[id].v; }
  set(id, v) { const r = this.d[id]; r.v = U.clamp(v, 0, r.cap); }
  add(id, n, at) {
    const r = this.d[id], b = r.v; r.v = U.clamp(r.v + n, 0, r.cap);
    if (Math.abs(n) >= .5) r.flash = n > 0 ? 'up' : 'down';
    if (at) this.g.floatText(at.x, at.y, (n > 0 ? '+' : '−') + Math.abs(n) + ' ' + r.short, n > 0 ? r.color : '#ff9a9a');
    return r.v - b;
  }
  has(cost) { for (const k in cost) if (this.d[k].v < cost[k] - 1e-9) return false; return true; }
  lack(cost) { for (const k in cost) if (this.d[k].v < cost[k] - 1e-9) return this.d[k].short; return null; }
  spend(cost) { if (!this.has(cost)) return false; for (const k in cost) this.add(k, -cost[k]); return true; }
  cap(id, v) { if (v !== undefined) { this.d[id].cap = v; this.g._dirtyRes = true; } return this.d[id].cap; }
}

/* ---------------- shop (gene expression / upgrades) ---------------- */
class Shop {
  constructor(g) { this.g = g; this.items = []; this.by = {}; }
  add(o) {
    const it = Object.assign({ gene: '', title: '', desc: '', group: '', max: 1, level: 0, pending: 0, cost: () => ({}), req: () => true }, o);
    this.items.push(it); this.by[it.id] = it; return it;
  }
  level(id) { return this.by[id] ? this.by[id].level : 0; }
  buy(id) {
    const g = this.g, it = this.by[id];
    if (!it || it.level + it.pending >= it.max) return false;
    const rq = it.req(g);
    if (rq !== true) { g.toast('🔒 ' + rq, 'bad'); CG.sfx('bad'); return false; }
    const c = it.cost(it.level + it.pending + 1);
    if (!g.res.has(c)) { g.toast('Not enough ' + g.res.lack(c), 'bad'); CG.sfx('bad'); return false; }
    g.res.spend(c); it.pending++; CG.sfx('buy');
    if (it.onBuy) it.onBuy(g, it); else this.grant(id);
    return true;
  }
  grant(id) {
    const it = this.by[id]; it.pending = Math.max(0, it.pending - 1); it.level++;
    if (it.onGrant) it.onGrant(this.g, it.level, it);
  }
}

/* ---------------- objectives ---------------- */
class Objectives {
  constructor(g) { this.g = g; this.list = []; this.i = 0; this.side = []; }
  set(arr) { this.list = arr; this.i = 0; this._enter(); }
  cur() { return this.list[this.i]; }
  _enter() { const o = this.cur(), g = this.g; g._dirtyObj = true; if (!o) return; if (o.onStart) o.onStart(g); g.hint(o.hint || null, o.target); }
  addSide(o) { if (this.side.find(s => s.id === o.id)) return; this.side.push(o); this.g._dirtyObj = true; }
  removeSide(id) { this.side = this.side.filter(s => s.id !== id); this.g._dirtyObj = true; }
  update() {
    const g = this.g, o = this.cur();
    if (o && o.check(g)) {
      o.done = true; CG.sfx('good'); g.toast('✔ ' + o.text, 'good');
      if (o.onDone) o.onDone(g);
      this.i++; this._enter();
    }
    for (const s of this.side.slice()) if (s.check(g)) { CG.sfx('good'); g.toast('✔ ' + s.text, 'good'); this.removeSide(s.id); if (s.onDone) s.onDone(g); }
  }
}

/* ---------------- the game ---------------- */
class Game {
  constructor(level) {
    this.level = level; this.t = 0; this.dt = 0; this.speed = 1; this.paused = false; this.over = false; this.stopped = false;
    this.S = {}; this.stations = []; this.stById = {}; this.tokens = []; this.fx = []; this.floats = []; this.labels = []; this.timers = [];
    this.world = Object.assign({ x: -5, y: -4, w: 10, h: 8 }, level.world);
    this.cam = { x: this.world.x + this.world.w / 2, y: this.world.y + this.world.h / 2, z: 1 };
    this.camTo = null;
    this.res = new Res(this); this.shop = new Shop(this); this.obj = new Objectives(this);
    this.sel = null; this.hover = null; this.hintTarget = null; this.showLabels = true; this.px = .01;
    this.canvas = $('#stage'); this.ctx = this.canvas.getContext('2d');
    this.W = 100; this.H = 100; this.dpr = 1; this._uiT = 0; this._modal = false;
    this._bindUI();
    this.resize();
    $('#hud-name').textContent = level.title;
    $('#shop-title').textContent = level.shopTitle || 'Genome';
    $('#shop-sub').innerHTML = level.shopSub || '';
    $('#toasts').innerHTML = ''; $('#banner').innerHTML = ''; $('#hint').innerHTML = '';
    level.setup(this);
    this._renderInspector();
    if (level.intro) {
      this.modal({ title: level.title, lead: level.organism, html: level.intro, buttons: [{ label: 'Start', primary: true }] });
    }
    this._last = performance.now();
    this._raf = requestAnimationFrame(t => this._frame(t));
  }

  /* ---- public helpers ---- */
  addStation(o) {
    const st = Object.assign({ x: 0, y: 0, r: .3, name: '', hidden: false, progress: null }, o);
    this.stations.push(st); if (st.id) this.stById[st.id] = st; return st;
  }
  station(id) { return this.stById[id]; }
  token(o) { const t = new Token(this, o); this.tokens.push(t); return t; }
  after(sec, fn) { const tm = { t: sec, fn }; this.timers.push(tm); return tm; }
  every(sec, fn) { const tm = { t: sec, fn, rep: sec }; this.timers.push(tm); return tm; }
  floatText(x, y, text, color) { this.floats.push({ x: x + U.rand(-.04, .04), y, text, color: color || '#fff', t: 0 }); }
  ring(x, y, color, r0 = .1, r1 = .6, dur = .6) { this.fx.push({ k: 'ring', x, y, color, r0, r1, dur, t: 0 }); }
  burst(x, y, color, n = 8, sp = .8) { for (let i = 0; i < n; i++) { const a = U.rand(TAU), v = U.rand(.3, 1) * sp; this.fx.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, dur: U.rand(.4, .8), t: 0 }); } }
  label(text, x, y, o) { this.labels.push(Object.assign({ text, x, y }, o)); }
  w2s(x, y) { return [(x - this.cam.x) * this.scale + this.W / 2, (y - this.cam.y) * this.scale + this.H / 2]; }
  s2w(sx, sy) { return [(sx - this.W / 2) / this.scale + this.cam.x, (sy - this.H / 2) / this.scale + this.cam.y]; }
  focus(x, y, z) { this.camTo = { x, y, z: z || this.cam.z }; }
  select(st) { this.sel = st; this._renderInspector(); }
  hint(html, target) { $('#hint').innerHTML = html || ''; this.hintTarget = target || null; }
  toast(html, kind, onClick) {
    const t = el('div', 'toast ' + (kind || ''), html); $('#toasts').appendChild(t);
    if (onClick) t.onclick = onClick;
    while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
    setTimeout(() => t.remove(), 4200);
  }
  banner(o) {
    const b = el('div', 'ban ' + (o.kind || ''), `<b>${o.title}</b><span>${o.text || ''}</span>`); $('#banner').appendChild(b);
    if (o.kind === 'stress') CG.sfx('alarm');
    setTimeout(() => b.remove(), (o.dur || 6) * 1000);
  }
  learn(id) {
    const d = CG.save.data; if (d.codex[id]) return; const e = CG.codexEntry(id); if (!e) return;
    d.codex[id] = true; CG.save.store();
    this.toast('📖 New codex entry: <b>' + e.title + '</b>', 'codex', () => CG.openCodex(id));
  }
  modal(o) {
    this._modal = true;
    CG.modal(o, () => { this._modal = false; this._last = performance.now(); });
  }
  win(o) {
    if (this.over) return; this.over = true; CG.sfx('win');
    CG.save.data.done[this.level.id] = true; CG.save.store();
    const idx = CG.levels.indexOf(this.level), next = CG.levels[idx + 1];
    const stats = (o.stats || []).map(s => `<div><b>${s[0]}</b><span>${s[1]}</span></div>`).join('');
    const btns = [{ label: 'Keep watching', fn: () => {} }, { label: 'Menu', fn: () => CG.showMenu() }];
    if (next) btns.push({ label: 'Next: ' + next.title + ' →', primary: true, fn: () => CG.start(next.id) });
    this.modal({ title: o.title || 'Level complete!', html: (o.html || '') + (stats ? `<div class="stats">${stats}</div>` : ''), buttons: btns });
  }
  stop() { this.stopped = true; cancelAnimationFrame(this._raf); this._unbind(); }

  /* ---- loop ---- */
  get scale() { return Math.min(this.W / this.world.w, this.H / this.world.h) * this.cam.z; }
  resize() {
    const r = this.canvas.getBoundingClientRect(); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(50, r.width); this.H = Math.max(50, r.height);
    this.canvas.width = this.W * this.dpr; this.canvas.height = this.H * this.dpr;
  }
  _frame(now) {
    if (this.stopped) return;
    this._raf = requestAnimationFrame(t => this._frame(t));
    const real = Math.min(.25, (now - this._last) / 1000); this._last = now;
    const r = this.canvas.getBoundingClientRect();
    if (Math.abs(r.width - this.W) > 1 || Math.abs(r.height - this.H) > 1) this.resize();
    if (!this.paused && !this._modal) {
      let left = real * this.speed;
      while (left > 1e-6) { const dt = Math.min(.04, left); left -= dt; this._update(dt); }
    }
    if (this.camTo) {
      const c = this.cam, k = Math.min(1, real * 4);
      c.x = U.lerp(c.x, this.camTo.x, k); c.y = U.lerp(c.y, this.camTo.y, k); c.z = U.lerp(c.z, this.camTo.z, k);
      if (Math.abs(c.x - this.camTo.x) + Math.abs(c.y - this.camTo.y) < .001 * this.world.w && Math.abs(c.z - this.camTo.z) < .005) this.camTo = null;
    }
    this._render(real);
    this._uiT -= real; if (this._uiT <= 0) { this._uiT = .15; this._uiTick(); }
  }
  _update(dt) {
    this.t += dt; this.dt = dt;
    for (const tm of this.timers) { tm.t -= dt; if (tm.t <= 0) { tm.fn(this); if (tm.rep) tm.t += tm.rep; else tm.dead = true; } }
    this.timers = this.timers.filter(t => !t.dead);
    if (this.level.update) this.level.update(this, dt);
    for (const st of this.stations) if (st.update) st.update(st, this, dt);
    for (const t of this.tokens) t.update(dt);
    this.tokens = this.tokens.filter(t => !t.dead);
    for (const f of this.fx) { f.t += dt; if (f.k === 'p') { f.x += f.vx * dt; f.y += f.vy * dt; } }
    this.fx = this.fx.filter(f => f.t < f.dur);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter(f => f.t < 1.3);
    if (!this.over) this.obj.update();
  }

  /* ---- render ---- */
  _render(real) {
    const ctx = this.ctx, W = this.W, H = this.H, g = this, lv = this.level;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (lv.bg) lv.bg(ctx, g, W, H);
    else { const gr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * .7); gr.addColorStop(0, '#12283c'); gr.addColorStop(1, '#0a1522'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
    const sc = this.scale; this.px = 1 / sc; CG.D.px = this.px; CG.D.t = this.t;
    this.labels.length = 0;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sc, sc); ctx.translate(-this.cam.x, -this.cam.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (lv.drawBack) lv.drawBack(ctx, g);
    for (const st of this.stations) if (!st.hidden && st.draw) st.draw(ctx, st, g);
    if (lv.drawMid) lv.drawMid(ctx, g);
    for (const t of this.tokens) {
      ctx.globalAlpha = U.clamp(t.a, 0, 1);
      if (t.draw) t.draw(ctx, t, g); else { ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (lv.drawFront) lv.drawFront(ctx, g);
    for (const f of this.fx) {
      const p = f.t / f.dur;
      if (f.k === 'ring') { ctx.globalAlpha = 1 - p; ctx.strokeStyle = f.color; ctx.lineWidth = 2.5 * this.px; ctx.beginPath(); ctx.arc(f.x, f.y, U.lerp(f.r0, f.r1, U.ease(p)), 0, TAU); ctx.stroke(); }
      else { ctx.globalAlpha = 1 - p; ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, 2.2 * this.px, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    { const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .78); vg.addColorStop(0, 'rgba(3,8,16,0)'); vg.addColorStop(1, 'rgba(3,8,16,.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H); }
    /* screen-space overlays */
    const T = performance.now() / 1000;
    const tgt = !this.over && this.hintTarget && this.stById[this.hintTarget] && !this.stById[this.hintTarget].hidden ? this.stById[this.hintTarget] : null;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const st of this.stations) {
      if (st.hidden) continue;
      const [sx, sy] = this.w2s(st.x, st.y), rr = Math.max(st.r * sc, 14);
      if (sx < -80 || sy < -80 || sx > W + 80 || sy > H + 80) continue;
      const hov = this.hover === st, sel = this.sel === st;
      if (st.progress != null) {
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,10,20,.55)'; ctx.beginPath(); ctx.arc(sx, sy, rr + 5, 0, TAU); ctx.stroke();
        ctx.strokeStyle = st.ringColor || '#5eead4'; ctx.beginPath(); ctx.arc(sx, sy, rr + 5, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(st.progress, 0, 1)); ctx.stroke();
      }
      if (hov || sel) { ctx.lineWidth = 1.5; ctx.strokeStyle = sel ? '#ffffffaa' : '#ffffff66'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(sx, sy, rr + 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      const rdy = !this.over && !tgt && st.ready && st.ready(st, g);      // during a guided step only the target is marked
      if (rdy) {
        const pu = (T * 1.4) % 1;
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,225,77,${1 - pu})`; ctx.beginPath(); ctx.arc(sx, sy, rr + 4 + pu * 12, 0, TAU); ctx.stroke();
        const by = sy - rr - 16 - Math.abs(Math.sin(T * 4)) * 6;
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(sx - 7, by - 8); ctx.lineTo(sx + 7, by - 8); ctx.lineTo(sx, by + 2); ctx.closePath(); ctx.fill();
      }
      if (st.badge) {
        const b = st.badge(st, g);
        if (b != null && b !== '' && b !== 0) {
          ctx.font = '700 11px system-ui'; const tw = ctx.measureText(b).width + 10, bx = sx + rr * .75 + 6, by2 = sy - rr * .75 - 4;
          ctx.fillStyle = '#0b1626e6'; ctx.strokeStyle = st.badgeColor || '#5eead4'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.roundRect(bx - tw / 2, by2 - 8, tw, 16, 8); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.fillText(b, bx, by2 + .5);
        }
      }
      if (!st.noLabel && st.name && (this.showLabels || hov || sel)) {
        ctx.font = (hov || sel ? '700 ' : '600 ') + '11px system-ui';
        const ly = sy + rr + (st.labelDy || 11);
        ctx.lineWidth = 3; ctx.strokeStyle = '#06101cd0'; ctx.strokeText(st.short || st.name, sx, ly);
        ctx.fillStyle = hov || sel ? '#fff' : '#d5e2f5cc'; ctx.fillText(st.short || st.name, sx, ly);
      }
    }
    for (const l of this.labels) {
      const [sx, sy] = this.w2s(l.x, l.y);
      ctx.globalAlpha = l.alpha == null ? 1 : l.alpha;
      ctx.font = (l.bold ? '700 ' : (l.italic ? 'italic ' : '') + '500 ') + (l.size || 11) + 'px system-ui'; ctx.textAlign = l.align || 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = '#06101cc0'; ctx.strokeText(l.text, sx, sy);
      ctx.fillStyle = l.color || '#cfe0f5'; ctx.fillText(l.text, sx, sy);
    }
    ctx.globalAlpha = 1; ctx.textAlign = 'center';
    for (const f of this.floats) {
      const [sx, sy] = this.w2s(f.x, f.y), p = f.t / 1.3;
      ctx.globalAlpha = 1 - p * p; ctx.font = '700 13px system-ui';
      ctx.lineWidth = 3; ctx.strokeStyle = '#06101cd0'; ctx.strokeText(f.text, sx, sy - p * 34);
      ctx.fillStyle = f.color; ctx.fillText(f.text, sx, sy - p * 34);
    }
    ctx.globalAlpha = 1;
    if (tgt) {                                    // guided step: spotlight + arrow + "Click here" on the one thing to click
      const [sx, sy] = this.w2s(tgt.x, tgt.y), rr = Math.max(tgt.r * sc, 16) + 12, pu = (T * 1.2) % 1, b = Math.abs(Math.sin(T * 4.5)) * 9;
      const on = sx > 20 && sy > 20 && sx < W - 20 && sy < H - 20, word = (this.coarse ? 'Tap' : 'Click') + ' here';
      if (on) {
        ctx.fillStyle = 'rgba(3,8,16,.3)'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(sx, sy, rr + 10, 0, TAU, true); ctx.fill('evenodd');
        ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,225,77,${1 - pu})`; ctx.beginPath(); ctx.arc(sx, sy, rr + pu * 22, 0, TAU); ctx.stroke();
        const up = sy - rr - 62 > 8, dir = up ? -1 : 1, ay = sy + dir * (rr + 8 + b);       // arrow above the target (below if no room)
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(sx, ay); ctx.lineTo(sx - 11, ay + dir * 16); ctx.lineTo(sx + 11, ay + dir * 16); ctx.closePath(); ctx.fill();
        ctx.font = '800 13px ui-rounded,system-ui'; const tw = ctx.measureText(word).width + 22, lx = U.clamp(sx, tw / 2 + 6, W - tw / 2 - 6), ly = ay + dir * 31;
        ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly - 13, tw, 26, 13); ctx.fill();
        ctx.fillStyle = '#1a1400'; ctx.textAlign = 'center'; ctx.fillText(word, lx, ly + 1);
      } else {                                    // target is off-screen: arrow on the edge pointing to it
        const cx = U.clamp(sx, 34, W - 34), cy = U.clamp(sy, 34, H - 34), a = Math.atan2(sy - cy, sx - cx);
        ctx.save(); ctx.translate(cx + Math.cos(a) * b * .6, cy + Math.sin(a) * b * .6); ctx.rotate(a);
        ctx.fillStyle = '#ffe14d'; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -12); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.font = '800 12px ui-rounded,system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#06101cd0';
        const tx = U.clamp(cx - Math.cos(a) * 44, 50, W - 50), ty = U.clamp(cy - Math.sin(a) * 30, 16, H - 16);
        ctx.strokeText('this way', tx, ty); ctx.fillText('this way', tx, ty);
      }
    }
    this._scaleBar(ctx);
  }
  _scaleBar(ctx) {
    const sc = this.scale, steps = [.01, .02, .05, .1, .2, .5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    let um = steps[0]; for (const s of steps) { if (s * sc <= 150) um = s; }
    const len = um * sc, x = 16, y = this.H - 18;
    const txt = um < 1 ? Math.round(um * 1000) + ' nm' : um >= 1000 ? um / 1000 + ' mm' : um + ' µm';
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5); ctx.stroke();
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffffffcc'; ctx.fillText(txt, x + len + 7, y - 2);
    if (this.level.scaleNote && this.W >= 560) { ctx.fillStyle = '#93a4bf99'; ctx.font = '11px system-ui'; ctx.textAlign = 'right'; ctx.fillText(this.level.scaleNote, this.W - 14, this.H - 12); ctx.textAlign = 'left'; }
  }

  /* ---- input ---- */
  _pick(wx, wy) {
    const minR = (this.coarse ? 24 : 16) * this.px;
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.onClick && U.dist(wx, wy, t.x, t.y) <= Math.max(t.clickR || t.r, minR)) return { tok: t };
    }
    let best = null, bd = 9;
    for (const st of this.stations) {   // smallest station under the cursor wins; ties -> nearest centre
      if (st.hidden || st.noPick) continue;
      const hr = Math.max(st.r, minR), d = U.dist(wx, wy, st.x, st.y) / hr;
      if (d > 1) continue;
      if (!best || st.r < best.r * .8 || (st.r <= best.r * 1.25 && d < bd)) { best = st; bd = d; }
    }
    return best ? { st: best } : null;
  }
  _bindUI() {
    const c = this.canvas, g = this; let down = null, pinch = null; const pts = new Map();
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    this._h = {
      down: e => {
        const [x, y] = pos(e); pts.set(e.pointerId, [x, y]); try { c.setPointerCapture(e.pointerId); } catch (err) {}
        if (pts.size === 1) down = { x, y, cx: g.cam.x, cy: g.cam.y, moved: false };
        else if (pts.size === 2) {                     // two fingers: pinch-zoom + pan
          const [a, b] = [...pts.values()], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, w = g.s2w(mx, my);
          down = null; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z: g.cam.z, wx: w[0], wy: w[1] }; g.camTo = null;
        }
      },
      move: e => {
        const [x, y] = pos(e);
        if (pts.has(e.pointerId)) pts.set(e.pointerId, [x, y]);
        if (pinch && pts.size >= 2) {
          const [a, b] = [...pts.values()], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          g.cam.z = U.clamp(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, .6, g.level.maxZoom || 6);
          const w = g.s2w(mx, my); g.cam.x += pinch.wx - w[0]; g.cam.y += pinch.wy - w[1]; g._clampCam(); return;
        }
        if (down) {
          if (Math.hypot(x - down.x, y - down.y) > 6) down.moved = true;
          if (down.moved) { g.cam.x = down.cx - (x - down.x) / g.scale; g.cam.y = down.cy - (y - down.y) / g.scale; g.camTo = null; g._clampCam(); c.style.cursor = 'grabbing'; }
          return;
        }
        if (e.pointerType === 'touch') return;
        const [wx, wy] = g.s2w(x, y), p = g._pick(wx, wy), tip = $('#tip');
        g.hover = p && p.st || null;
        c.style.cursor = p ? 'pointer' : 'default';
        const name = p && (p.st ? p.st.name : p.tok.name);
        if (name) { tip.style.display = 'block'; tip.innerHTML = name + (p.st && p.st.tip ? ' <small>· ' + p.st.tip + '</small>' : p.tok && p.tok.tip ? ' <small>· ' + p.tok.tip + '</small>' : ''); tip.style.left = Math.min(x + 14, g.W - 200) + 'px'; tip.style.top = (y + 16) + 'px'; }
        else tip.style.display = 'none';
      },
      up: e => {
        pts.delete(e.pointerId);
        if (pinch) { if (pts.size < 2) pinch = null; down = null; return; }
        const d = down; down = null; c.style.cursor = 'default';
        if (e.type === 'pointercancel') return;
        if (!d || d.moved || g._modal) return;
        const [wx, wy] = g.s2w(d.x, d.y), p = g._pick(wx, wy);
        if (p && p.tok) { CG.sfx('click'); p.tok.onClick(p.tok, g); }
        else if (p && p.st) { CG.sfx('click'); g.select(p.st); if (p.st.onClick && !g.over) p.st.onClick(p.st, g); }
        else if (g.level.onClick) g.level.onClick(g, wx, wy);
      },
      wheel: e => {
        e.preventDefault(); const [x, y] = pos(e), [wx, wy] = g.s2w(x, y);
        g.cam.z = U.clamp(g.cam.z * Math.exp(-e.deltaY * .0015), .6, g.level.maxZoom || 6); g.camTo = null;
        const [wx2, wy2] = g.s2w(x, y); g.cam.x += wx - wx2; g.cam.y += wy - wy2; g._clampCam();
      },
      leave: () => { g.hover = null; $('#tip').style.display = 'none'; },
      key: e => {
        if (g._modal || e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); g.setSpeed(g.paused ? (g._prevSpeed || 1) : 0); }
        else if (e.key === '1') g.setSpeed(1); else if (e.key === '2') g.setSpeed(2); else if (e.key === '3' || e.key === '4') g.setSpeed(4);
        else if (e.key === 'l' || e.key === 'L') g.toggleLabels();
      },
    };
    c.addEventListener('pointerdown', this._h.down); c.addEventListener('pointermove', this._h.move); c.addEventListener('pointerup', this._h.up); c.addEventListener('pointercancel', this._h.up);
    c.addEventListener('wheel', this._h.wheel, { passive: false }); c.addEventListener('pointerleave', this._h.leave);
    window.addEventListener('keydown', this._h.key);
    document.querySelectorAll('#speed button').forEach(b => b.onclick = () => g.setSpeed(+b.dataset.s));
    $('#btn-labels').onclick = () => g.toggleLabels(); $('#btn-labels').classList.add('on');
    $('#btn-view').onclick = () => g.focus(g.world.x + g.world.w / 2, g.world.y + g.world.h / 2, 1);
    $('#shop').onclick = e => { const b = e.target.closest('.gene'); if (b) { g.shop.buy(b.dataset.id); g._uiTick(); } };
    $('#hud-res').onclick = e => { const r = e.target.closest('.res'); if (r) { const d = g.res.d[r.dataset.id]; g.sel = { info: { title: d.name, sub: 'Resource', body: d.desc || '' } }; g._renderInspector(); } };
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => CG.setTab(document.body.dataset.tab === b.dataset.tab ? '' : b.dataset.tab));
    const gt = $('#tabs [data-tab="genome"]'); if (gt) gt.textContent = this.level.shopTitle || 'Genome';
    this.setSpeed(1);
  }
  _unbind() {
    const c = this.canvas, h = this._h;
    c.removeEventListener('pointerdown', h.down); c.removeEventListener('pointermove', h.move); c.removeEventListener('pointerup', h.up); c.removeEventListener('pointercancel', h.up);
    c.removeEventListener('wheel', h.wheel); c.removeEventListener('pointerleave', h.leave); window.removeEventListener('keydown', h.key);
  }
  _clampCam() { const w = this.world, c = this.cam; c.x = U.clamp(c.x, w.x, w.x + w.w); c.y = U.clamp(c.y, w.y, w.y + w.h); }
  setSpeed(s) {
    if (s === 0) { this._prevSpeed = this.speed; this.paused = true; } else { this.paused = false; this.speed = s; }
    document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', this.paused ? b.dataset.s === '0' : +b.dataset.s === this.speed));
  }
  toggleLabels() { this.showLabels = !this.showLabels; $('#btn-labels').classList.toggle('on', this.showLabels); }

  /* ---- DOM HUD ---- */
  _uiTick() {
    const g = this, lv = this.level, box = $('#hud-res');
    if (this._dirtyRes) {
      this._dirtyRes = false; box.innerHTML = '';
      for (const id of this.res.order) {
        const r = this.res.d[id]; if (!r.show) continue;
        const e = el('div', 'res', `<div class="nm"><span class="dot" style="background:${r.color}"></span>${r.name}</div><span class="val"></span><span class="cap"></span><div class="bar"><i style="background:${r.color}"></i></div>`);
        e.dataset.id = id; e.title = (r.desc || '').replace(/<[^>]+>/g, ''); box.appendChild(e);
      }
    }
    for (const e of box.children) {
      const r = this.res.d[e.dataset.id];
      const txt = r.fmt ? r.fmt(r.v) : String(Math.floor(r.v + 1e-6));
      e.querySelector('.val').textContent = txt;
      e.querySelector('.cap').textContent = isFinite(r.cap) && !r.fmt ? ' / ' + r.cap : '';
      e.querySelector('.bar i').style.width = (isFinite(r.cap) ? U.clamp(r.v / r.cap, 0, 1) * 100 : 0) + '%';
      if (r.flash) { e.classList.remove('up', 'down'); void e.offsetWidth; e.classList.add(r.flash); r.flash = null; }
    }
    $('#hud-phase').textContent = lv.phase ? lv.phase(g) : '';
    $('#hud-clock').textContent = lv.clock ? lv.clock(g) : '';
    /* shop */
    let sig = '';
    const view = this.shop.items.map(it => {
      const lvl = it.level + it.pending, max = lvl >= it.max, rq = max ? true : it.req(g), c = max ? {} : it.cost(lvl + 1);
      const state = max ? (it.pending ? 'busy' : 'max') : rq !== true ? 'locked' : g.res.has(c) ? 'ok' : 'poor';
      const lackSig = Object.keys(c).map(k => g.res.d[k].v >= c[k] ? 1 : 0).join('');
      sig += it.id + it.level + '.' + it.pending + state + lackSig + (rq !== true ? rq : '') + (it.hidden && it.hidden(g) ? 'h' : '') + '|';
      return { it, lvl, max, rq, c, state };
    });
    if (sig !== this._shopSig) {
      this._shopSig = sig; const sh = $('#shop'); sh.innerHTML = ''; let grp = null;
      for (const v of view) {
        const it = v.it; if (it.hidden && it.hidden(g)) continue;
        if (it.group !== grp) { grp = it.group; if (grp) sh.appendChild(el('div', 'grp', grp)); }
        const pips = it.max > 1 ? '●'.repeat(it.level) + '◐'.repeat(it.pending) + '○'.repeat(Math.max(0, it.max - v.lvl)) : (it.level ? '●' : it.pending ? '◐' : '○');
        const desc = typeof it.desc === 'function' ? it.desc(Math.min(it.max, v.lvl + 1), it) : it.desc;
        let cost;
        if (v.max) cost = it.pending ? '<span>⏳ being expressed…</span>' : '<span>✓ fully expressed</span>';
        else if (v.rq !== true) cost = '<span>🔒 ' + v.rq + '</span>';
        else cost = Object.keys(v.c).map(k => `<span class="c ${g.res.d[k].v >= v.c[k] ? '' : 'no'}" style="color:${g.res.d[k].v >= v.c[k] ? g.res.d[k].color : ''}">${CG.U.compact(v.c[k])} ${g.res.d[k].short}</span>`).join('') + (it.pending ? '<span>⏳</span>' : '');
        const b = el('button', 'gene ' + v.state + (it.pending ? ' busy' : ''), `<div class="g-top"><span class="g-name">${it.gene}</span><span class="g-lv">${pips}</span></div><div class="g-title">${it.title}</div><div class="g-desc">${desc}</div><div class="g-cost">${cost}</div>`);
        b.dataset.id = it.id; sh.appendChild(b);
      }
    }
    { const sid = !this.over && typeof this.hintTarget === 'string' && this.hintTarget.indexOf('shop:') === 0 ? this.hintTarget.slice(5) : null;
      document.querySelectorAll('#shop .gene').forEach(b => b.classList.toggle('target', b.dataset.id === sid));
      const tb = $('#tabs [data-tab="genome"]'); if (tb) tb.classList.toggle('ping', !!sid && document.body.dataset.tab !== 'genome'); }
    /* objectives */
    const o = this.obj, cur = o.cur();
    const prog = x => { if (!x || !x.progress) return ''; const [a, b] = x.progress(g); return a + '/' + b; };
    const osig = o.i + '|' + o.side.map(s => s.id).join(',');
    if (this._dirtyObj || osig !== this._objSig) {
      this._dirtyObj = false; this._objSig = osig;
      const box2 = $('#objectives'); box2.innerHTML = '<h4>Objectives</h4>';
      for (const s of o.side) box2.appendChild(el('div', 'obj side', `<div class="t">⚠ ${s.text}</div>${s.hint ? `<div class="h">${s.hint}</div>` : ''}<div class="pb"><i data-side="${s.id}"></i></div>`));
      if (o.list.length) box2.appendChild(el('div', 'objcount', `<span>${cur ? `Step ${o.i + 1} of ${o.list.length}` : 'All steps complete'}</span><span class="steps">${o.list.map((_, k) => `<i class="${k < o.i ? 'd' : k === o.i ? 'c' : ''}"></i>`).join('')}</span>`));
      if (cur) box2.appendChild(el('div', 'obj cur', `<div class="t">${cur.text}</div>${cur.why ? `<div class="h">${cur.why}</div>` : ''}<div class="pb"><i data-cur="1"></i></div>`));
      o.list.slice(o.i + 1, o.i + 3).forEach(n => box2.appendChild(el('div', 'obj next', `<div class="t">${n.text}</div>`)));
    }
    const setBar = (node, x) => { if (!node) return; if (!x || !x.progress) { node.parentNode.style.display = 'none'; return; } const [a, b] = x.progress(g); node.style.width = U.clamp(a / b, 0, 1) * 100 + '%'; };
    setBar($('#objectives [data-cur]'), cur);
    for (const s of o.side) setBar($(`#objectives [data-side="${s.id}"]`), s);
    /* live inspector */
    const lt = $('#insp-live');
    if (lt && this.sel) { const info = this._info(this.sel); if (info && info.live) lt.innerHTML = info.live(g).map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join(''); }
  }
  _info(st) { return typeof st.info === 'function' ? st.info(st, this) : st.info; }
  _renderInspector() {
    const box = $('#inspector'), st = this.sel, info = st && this._info(st);
    if (!info) { box.innerHTML = '<h4>Inspector</h4><div class="empty">Click any part of the cell to learn what it really is and what it does.<br><br>Drag to pan · scroll to zoom · <kbd>space</kbd> pause · <kbd>L</kbd> labels</div>'; return; }
    box.innerHTML = `<h4>Inspector</h4><p class="ttl">${info.title || st.name}</p><div class="sub">${info.sub || ''}</div>` +
      (info.body ? `<p>${info.body}</p>` : '') +
      (info.live ? `<div class="hd">Right now</div><table id="insp-live"></table>` : '') +
      (info.facts && info.facts.length ? `<div class="hd">Real numbers</div><ul>${info.facts.map(f => `<li>${f}</li>`).join('')}</ul>` : '') +
      (info.game ? `<div class="gamenote"><b>Game simplification:</b> ${info.game}</div>` : '');
    this._uiTick();
  }
}
CG.Game = Game;

/* ---------------- modal / codex / menu ---------------- */
CG.modal = function (o, onClose) {
  const m = $('#modal'), box = m.querySelector('.box');
  box.innerHTML = `<h2>${o.title || ''}</h2>${o.lead ? `<p class="lead"><i>${o.lead}</i></p>` : ''}<div class="mbody">${o.html || ''}</div><div class="btns"></div>`;
  const btns = box.querySelector('.btns');
  (o.buttons || [{ label: 'OK', primary: true }]).forEach(b => {
    const e = el('button', b.primary ? 'primary' : '', b.label);
    e.onclick = () => { m.classList.add('hidden'); if (onClose) onClose(); if (b.fn) b.fn(); };
    btns.appendChild(e);
  });
  m.classList.remove('hidden'); box.scrollTop = 0;
  return box;
};
CG.setTab = function (t) { document.body.dataset.tab = t; document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); };
CG.codexEntry = function (id) { for (const l of CG.levels) for (const e of (l.codex || [])) if (e.id === id) return e; return null; };
CG.openCodex = function (openId) {
  const known = CG.save.data.codex, g = CG.game;
  let nav = '', first = openId;
  for (const l of CG.levels) {
    if (!(l.codex || []).length) continue;
    nav += `<div class="lv">${l.title}</div>`;
    for (const e of l.codex) { const k = known[e.id]; if (k && !first) first = e.id; nav += `<a class="${k ? '' : 'lock'}" data-id="${k ? e.id : ''}">${k ? e.title : '??? (not yet discovered)'}</a>`; }
  }
  if (g) g._modal = true;
  const box = CG.modal({ title: '📖 Codex', lead: 'What you have discovered so far. Entries unlock as you play.', html: `<div class="cx-list"><div class="cx-nav">${nav}</div><div class="cx-body"></div></div>`, buttons: [{ label: 'Close', primary: true }] },
    () => { if (g) { g._modal = false; g._last = performance.now(); } });
  const show = id => { const e = CG.codexEntry(id); box.querySelector('.cx-body').innerHTML = e ? `<h3 style="margin-top:0">${e.title}</h3>${e.html}` : '<p>Play a level to start filling the codex.</p>'; box.querySelectorAll('.cx-nav a').forEach(a => a.classList.toggle('on', a.dataset.id === id)); };
  box.querySelector('.cx-nav').onclick = e => { const a = e.target.closest('a'); if (a && a.dataset.id) show(a.dataset.id); };
  show(first);
};
CG.showMenu = function () {
  if (CG.game) { CG.game.stop(); CG.game = null; }
  $('#modal').classList.add('hidden'); $('#game').classList.add('hidden'); $('#menu').classList.remove('hidden');
  const box = $('#level-cards'); box.innerHTML = '';
  const d = CG.save.data;
  CG.levels.forEach((l, i) => {
    const locked = !d.unlockAll && i > 0 && !d.done[CG.levels[i - 1].id];
    const c = el('div', 'card' + (locked ? ' locked' : ''), `<div class="art">${(CG.art && CG.art[l.id]) || ''}</div><div class="num">Level ${i + 1}</div><h2>${l.title}</h2><div class="org">${l.organism || ''}</div><p>${l.blurb || ''}</p><div class="learn">${l.learn || ''}</div><button class="go">${locked ? '🔒 Finish level ' + i + ' first' : 'Play'}</button>${d.done[l.id] ? '<div class="done">✔ completed</div>' : ''}`);
    c.style.setProperty('--c', l.color || '#5eead4');
    c.querySelector('.go').onclick = () => { if (!locked) CG.start(l.id); };
    box.appendChild(c);
  });
};
CG.start = function (id) {
  const lv = CG.levels.find(l => l.id === id); if (!lv) return;
  if (CG.game) CG.game.stop();
  $('#menu').classList.add('hidden'); $('#modal').classList.add('hidden'); $('#game').classList.remove('hidden');
  CG.game = new Game(lv);
};
CG.boot = function () {
  CG.save.load(); CG.setTab('goals');
  if (/[?&]unlock/.test(location.search)) CG.save.data.unlockAll = true;
  $('#btn-menu').onclick = () => { const g = CG.game; if (!g || g.over) return CG.showMenu(); g._modal = true; CG.modal({ title: 'Leave this level?', html: '<p>Progress in the current level will be lost.</p>', buttons: [{ label: 'Stay' }, { label: 'Back to menu', primary: true, fn: () => CG.showMenu() }] }, () => { g._modal = false; g._last = performance.now(); }); };
  $('#btn-codex').onclick = () => CG.openCodex(); $('#btn-codex-menu').onclick = () => CG.openCodex();
  const mute = $('#btn-mute'); const setM = () => mute.textContent = CG.save.data.muted ? '🔇' : '🔊'; setM();
  mute.onclick = () => { CG.save.data.muted = !CG.save.data.muted; CG.save.store(); setM(); };
  $('#btn-unlock').onclick = () => { CG.save.data.unlockAll = true; CG.save.store(); CG.showMenu(); };
  $('#btn-reset').onclick = () => { if (confirm('Erase completed levels and codex entries?')) { CG.save.data = { done: {}, codex: {}, muted: false, unlockAll: false }; CG.save.store(); CG.showMenu(); } };
  window.addEventListener('resize', () => CG.game && CG.game.resize());
  CG.showMenu();
  const m = /[?&]level=(\w+)/.exec(location.search); if (m) CG.start(m[1]);
  /* dev aid:  ?level=yeast&demo=120[&zoom=2&cx=0&cy=0]  skips the intro and fast-forwards N game-seconds with a simple bot (used for screenshots) */
  const dm = /[?&]demo=(\d+)/.exec(location.search);
  if (dm && CG.game) {
    const g = CG.game, q = k => { const r = new RegExp('[?&]' + k + '=(-?[\\d.]+)').exec(location.search); return r ? +r[1] : null; };
    $('#modal').classList.add('hidden'); g._modal = false;
    for (let i = 0; i < +dm[1] * 25 && !g.over; i++) {
      g._modal = false; g._update(.04);
      if (i % 8 === 0 && !/[?&]nobot/.test(location.search)) { for (const s of g.stations) if (!s.hidden && s.ready && s.ready(s, g) && s.onClick) s.onClick(s, g); for (const t of g.tokens.slice()) if (t.onClick) t.onClick(t, g); for (const it of g.shop.items) g.shop.buy(it.id); if (g.level.testBot) g.level.testBot(g); }
    }
    $('#modal').classList.add('hidden'); g._modal = false; $('#toasts').innerHTML = ''; $('#banner').innerHTML = '';
    if (q('zoom')) { g.camTo = null; g.cam.z = q('zoom'); } if (q('cx') !== null) { g.camTo = null; g.cam.x = q('cx'); } if (q('cy') !== null) { g.camTo = null; g.cam.y = q('cy'); }
    g.setSpeed(0);
  }
};
})();
