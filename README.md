# Cellworks

A browser tycoon game set inside living cells. Every station is a real protein at its real location; cells are drawn to scale.

## Play

Open `index.html` in a browser (no build step, no dependencies), or serve the folder:

```bash
python3 -m http.server 8765
```

then visit <http://localhost:8765>. Add `?unlock` to the URL to open all levels.

## Levels

1. **One Yeast Cell** – glycolysis, fermentation vs respiration, gene expression, protein quality control, stress signalling, one full cell cycle.
2. **A Yeast Colony** – exponential growth, proteome allocation, Crabtree effect, diauxic shift, quiescence.
3. **A Human Macrophage** – phagocytosis, respiratory burst, NF-κB signalling, cytokines, antigen presentation.
4. **A Neuron** – synaptic input, action potential, saltatory conduction, transmitter release, axonal transport, LTP.

## Code

- `js/engine.js` – shared engine; the header comment documents the level API.
- `js/draw.js` – drawing helpers (world units are micrometres).
- `js/levels/*.js` – one self-contained file per level.
- `tools/smoke.js` – headless playthrough: `node tools/smoke.js yeast` (also `colony`, `macrophage`, `neuron`; add `--slow`).
- `tools/shot.sh` – headless Chrome screenshot of a fast-forwarded level, e.g. `tools/shot.sh "level=yeast&demo=120" out.png`.
