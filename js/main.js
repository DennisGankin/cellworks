/* menu card illustrations (inline SVG, one per level id) + boot */
(function () {
  const svg = b => `<svg viewBox="0 0 260 132" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${b}</svg>`;
  const dots = (n, col, seed) => { let s = ''; for (let i = 0; i < n; i++) { const x = (i * 97 + seed * 31) % 260, y = (i * 53 + seed * 17) % 132; s += `<circle cx="${x}" cy="${y}" r="${1.2 + (i % 3) * .5}" fill="${col}" opacity="${.25 + (i % 4) * .12}"/>`; } return s; };
  CG.art = {
    yeast: svg(`${dots(26, '#7CFC8A', 1)}
      <g transform="translate(112 68)">
        <circle r="45" fill="#d6b274" opacity=".55"/><circle cx="52" r="25" fill="#d6b274" opacity=".55"/>
        <circle r="41.5" fill="#f2d58a"/><circle cx="52" r="22" fill="#f2d58a"/>
        <circle r="40" fill="#1c4d5f"/><circle cx="52" r="20.5" fill="#1c4d5f"/>
        <path d="M-30 -18 A35 35 0 0 1 2 -34" stroke="#ffab7a" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M-30 -18 A35 35 0 0 1 2 -34" stroke="#9a3f2a" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <circle cx="12" cy="-12" r="16" fill="#3a2f78" stroke="#b3a6f5" stroke-width="1.6"/>
        <path d="M5 -14 q4 -6 8 0 M12 -6 q5 -4 8 2 M4 -6 q3 4 7 1" stroke="#ff9ecf" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        <circle cx="8" cy="18" r="13" fill="#2f86ab" opacity=".75" stroke="#8ad8f5" stroke-width="1"/>
        <g fill="#58d68d"><rect x="-45" y="-6" width="9" height="4" rx="2"/><rect x="-45" y="1" width="9" height="4" rx="2"/></g>
        <g fill="#7CFC8A"><circle cx="-28" cy="3" r="2.6"/><circle cx="-21" cy="1" r="2.6"/><circle cx="-14" cy="-1" r="2.6"/></g>
        <ellipse cx="-12" cy="14" rx="5" ry="4" fill="#d9c7a3"/><ellipse cx="-12" cy="18" rx="4" ry="2.3" fill="#b79b6b"/>
        <circle cx="52" cy="0" r="6" fill="#3a2f78" opacity=".0"/>
      </g>`),
    colony: svg(`${dots(30, '#7CFC8A', 4)}
      <defs><radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2f8ea3"/><stop offset=".55" stop-color="#4a6fb0"/><stop offset="1" stop-color="#9a6de0"/></radialGradient></defs>
      <path d="M130 14 C162 10 196 30 198 62 C202 94 172 122 134 120 C98 122 62 100 64 66 C62 36 96 16 130 14Z" fill="url(#cg)" stroke="#d9c2ff" stroke-width="1.5" opacity=".95"/>
      ${(() => { let s = ''; for (let i = 0; i < 70; i++) { const a = i * 2.4, r = Math.sqrt(i / 70) * 48; s += `<circle cx="${131 + Math.cos(a) * r * 1.25}" cy="${67 + Math.sin(a) * r}" r="${2.2 + (i % 3) * .4}" fill="none" stroke="#f2d58a" stroke-width=".7" opacity=".7"/>`; } return s; })()}
      <path d="M14 118 L14 104 M14 118 L70 118" stroke="#8fa1bd" stroke-width="1.2" fill="none"/><path d="M16 114 C34 113 44 106 52 96 S64 90 68 90" stroke="#ffe14d" stroke-width="1.8" fill="none"/>`),
    macrophage: svg(`${dots(14, '#ff8f8f', 7)}
      <path d="M128 18 C150 8 186 22 196 46 C212 52 222 62 210 74 C214 96 190 118 160 114 C140 126 112 122 100 108 C78 110 58 92 66 72 C52 60 64 40 84 40 C92 24 110 16 128 18Z" fill="#1c4d5f" stroke="#8ad8f5" stroke-width="2"/>
      <path d="M118 52 C138 40 164 50 162 70 C160 86 138 92 126 84 C132 76 130 66 118 62Z" fill="#3a2f78" stroke="#b3a6f5" stroke-width="1.5"/>
      <g fill="#e06a8f" opacity=".9"><circle cx="100" cy="86" r="5"/><circle cx="112" cy="98" r="4"/><circle cx="92" cy="68" r="4"/><circle cx="150" cy="100" r="4.5"/><circle cx="172" cy="88" r="4"/></g>
      <path d="M176 44 q8 6 4 14" stroke="#ffab7a" stroke-width="5" fill="none" stroke-linecap="round"/>
      <g stroke="#06131c" stroke-width=".8">
        <rect x="214" y="58" width="22" height="9" rx="4.5" fill="#9be07a" transform="rotate(-20 225 62)"/>
        <rect x="26" y="36" width="22" height="9" rx="4.5" fill="#9be07a" transform="rotate(30 37 40)"/>
        <rect x="30" y="96" width="22" height="9" rx="4.5" fill="#9be07a" transform="rotate(-12 41 100)"/>
      </g>
      <circle cx="140" cy="36" r="10" fill="#0d2430" stroke="#ffe14d" stroke-width="1.5"/><rect x="133" y="33" width="14" height="6" rx="3" fill="#9be07a"/>`),
    neuron: svg(`${dots(16, '#8ad8f5', 9)}
      <g stroke="#8ad8f5" stroke-width="3" fill="none" stroke-linecap="round">
        <path d="M64 66 C40 50 34 30 20 16 M46 44 C36 46 24 42 14 46 M64 66 C44 78 32 96 16 110 M40 88 C34 96 30 110 34 124 M70 52 C72 34 82 22 86 8 M76 30 C86 26 96 28 104 20"/>
      </g>
      <path d="M64 44 L88 76 L52 86 Z" fill="#1c4d5f" stroke="#8ad8f5" stroke-width="2.5" stroke-linejoin="round"/>
      <circle cx="68" cy="68" r="9" fill="#3a2f78" stroke="#b3a6f5" stroke-width="1.3"/>
      <path d="M86 74 L112 80" stroke="#8ad8f5" stroke-width="3" stroke-linecap="round"/>
      <g stroke="#f4ecd8" stroke-width="7" stroke-linecap="round"><path d="M118 81 L150 86"/><path d="M158 87 L190 90"/><path d="M198 91 L222 92"/></g>
      <circle cx="240" cy="93" r="8" fill="#1c4d5f" stroke="#8ad8f5" stroke-width="2"/>
      <g fill="#ffb347"><circle cx="238" cy="90" r="1.6"/><circle cx="242" cy="94" r="1.6"/><circle cx="237" cy="96" r="1.6"/></g>
      <path d="M96 118 h18 l5 -34 l6 44 l5 -10 h40" stroke="#ffe14d" stroke-width="1.8" fill="none" stroke-linejoin="round" opacity=".9"/>`),
  };
  window.addEventListener('DOMContentLoaded', () => CG.boot());
})();
