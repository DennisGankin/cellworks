#!/usr/bin/env node
/* Headless smoke test:  node tools/smoke.js <levelId> [maxGameSeconds=1500] [--slow]
   Stubs the DOM + canvas, runs the level with a simple bot (clicks every ready station, every clickable token,
   buys every affordable shop item, then calls level.testBot(g) if the level defines one) and reports whether
   the level can be completed, when each objective was reached, and any exception (update AND render are run).
   --slow makes the bot act only every 1.2 s instead of every 0.3 s.
   --human does ONE action (a click or a purchase) every 0.9 s — use this to judge pacing for a real player. */
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const id = process.argv[2] || 'yeast', maxT = +process.argv[3] || 1500, slow = process.argv.includes('--slow');
const human = process.argv.includes('--human');   // one single action every 0.9 s, like a person tapping: the best proxy for real pacing
function fake() {
  const f = function () { return fake(); };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return undefined;
      if (k === 'width' || k === 'height') return 1000;
      if (k === 'children') return [];
      if (k === 'length') return 0;
      if (k === 'getBoundingClientRect') return () => ({ width: 1000, height: 700, left: 0, top: 0 });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'tagName') return 'DIV';
      if (Object.prototype.hasOwnProperty.call(t, k) && k !== 'name' && k !== 'prototype') return t[k];
      return t[k] = fake();
    },
    set(t, k, v) { try { t[k] = v; } catch (e) {} return true; },
  });
}
global.window = global; global.document = fake(); global.location = { search: '' };
global.localStorage = { getItem: () => null, setItem() {} };
global.requestAnimationFrame = () => 0; global.cancelAnimationFrame = () => {};
global.confirm = () => true; global.devicePixelRatio = 1;
window.addEventListener = () => {};
for (const f of ['js/engine.js', 'js/draw.js', `js/levels/${id}.js`]) {
  // eslint-disable-next-line no-eval
  (0, eval)(fs.readFileSync(path.join(root, f), 'utf8'));
}
CG.save.data.muted = true;
const lv = CG.levels.find(l => l.id === id);
if (!lv) { console.error('level not registered:', id); process.exit(2); }
const g = CG.game = new CG.Game(lv); g._modal = false;
let last = -1, steps = 0, acts = 0, idle = 0; const every = slow ? 30 : 8;
try {
  while (g.t < maxT && !g.over) {
    g._modal = false; g._update(0.04); steps++;
    if (steps % 5 === 0) g._render(0.04);
    if (steps % 25 === 0) g._uiTick();
    if (human) {
      if (steps % 22 === 0) {
        const toks = g.tokens.filter(t => t.onClick), rdy = g.stations.filter(s => !s.hidden && s.ready && s.ready(s, g) && s.onClick);
        const buy = g.shop.items.filter(it => it.level + it.pending < it.max && it.req(g) === true && g.res.has(it.cost(it.level + it.pending + 1)));
        acts++;
        if (toks.length && Math.random() < .6) { const t = toks[Math.random() * toks.length | 0]; t.onClick(t, g); }
        else if (rdy.length && (!buy.length || Math.random() < .7)) { const s = rdy[Math.random() * rdy.length | 0]; s.onClick(s, g); }
        else if (buy.length) g.shop.buy(buy[Math.random() * buy.length | 0].id);
        else { idle++; if (lv.testBot) lv.testBot(g); }
      }
    } else if (steps % every === 0) {
      for (const s of g.stations) if (!s.hidden && s.ready && s.ready(s, g) && s.onClick) s.onClick(s, g);
      for (const t of g.tokens.slice()) if (t.onClick) t.onClick(t, g);
      for (const it of g.shop.items) g.shop.buy(it.id);
      if (lv.testBot) lv.testBot(g);
    }
    if (g.obj.i !== last) {
      last = g.obj.i; const o = g.obj.cur();
      console.log(String(Math.round(g.t)).padStart(5) + 's  step ' + (g.obj.i + 1) + '/' + g.obj.list.length + '  ' + (o ? o.text.replace(/<[^>]+>/g, '') : 'ALL DONE') +
        '   [' + g.res.order.map(r => r + '=' + Math.round(g.res.get(r))).join(' ') + ']');
    }
  }
} catch (e) { console.error('EXCEPTION at t=' + g.t.toFixed(1) + 's\n' + e.stack); process.exit(1); }
console.log(g.over ? `\nWON at ${Math.round(g.t)} game-seconds` : `\nNOT completed after ${Math.round(g.t)} game-seconds — stuck at step ${g.obj.i + 1}: ${g.obj.cur() ? g.obj.cur().text : ''}`);
if (human) console.log(`human bot: ${acts} decisions, ${Math.round(100 * idle / Math.max(1, acts))} % with nothing to click`);
console.log('shop:', g.shop.items.map(i => i.id + ':' + i.level).join(' '));
process.exit(g.over ? 0 : 3);
