#!/usr/bin/env node
/* ASCIIWall · GitHub README widgets (animated, CSS-only SVG — safe for README <img>)
 *
 *   node github/widgets.mjs --user <login> [--token T] [--demo] [--out assets] [--contrib web/data/contributions.json]
 *
 * Writes into <out>/ (each also as *-light.svg):
 *   sky.svg        night-sky stats card: every repo is a star, sized by its stargazers
 *   languages.svg  top languages as growing ASCII block bars
 *   streak.svg     a campfire that grows with your current contribution streak
 *   tide.svg       the last 26 weeks of contributions as a rolling ASCII sea
 *   pond.svg       live koi pond: koi swim, flex and turn; more fish the more you contribute
 *
 * Daily data for streak/tide comes from the contributions.json written by github/garden.mjs
 * (run that first); repos/stars/languages come from the REST API. No dependencies; Node 18+.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; }
}
const login = args.user || process.env.GITHUB_REPOSITORY_OWNER || "you";
const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const outDir = args.out || "assets";
const contribPath = args.contrib || "web/data/contributions.json";

// ── data ──────────────────────────────────────────────────────
function rng(seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (const ch of String(seedStr)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

async function gh(path) {
  const headers = { "user-agent": "asciiwall-widgets", accept: "application/vnd.github+json" };
  if (token) headers.authorization = `bearer ${token}`;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) throw new Error(`GitHub API ${path}: HTTP ${r.status}`);
  return r.json();
}

async function liveData() {
  const user = await gh(`/users/${encodeURIComponent(login)}`);
  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/users/${encodeURIComponent(login)}/repos?per_page=100&page=${page}&type=owner&sort=pushed`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  const own = repos.filter((r) => !r.fork);
  const langs = {};
  for (const r of own) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1 + Math.log2(1 + (r.size || 0)) * 0.15;
  return {
    name: user.name || login, followers: user.followers, publicRepos: user.public_repos,
    stars: own.reduce((a, r) => a + r.stargazers_count, 0),
    repos: own.map((r) => ({ name: r.name, stars: r.stargazers_count })),
    langs,
  };
}

function demoData() {
  const rnd = rng(login + "demo");
  const repos = Array.from({ length: 34 }, (_, i) => ({ name: `project-${i}`, stars: Math.floor(Math.pow(rnd(), 3) * 120) }));
  return {
    name: login, followers: 87, publicRepos: repos.length, stars: repos.reduce((a, r) => a + r.stars, 0), repos,
    langs: { TypeScript: 14, Python: 9, Rust: 5, GLSL: 3, Go: 2, Shell: 1.5 },
  };
}

function contributions(demo) {
  if (existsSync(contribPath)) {
    try { const d = JSON.parse(readFileSync(contribPath, "utf8")); if (d.weeks) return d; } catch {}
  }
  const rnd = rng(login + "c");
  const weeks = Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, () => (rnd() < 0.62 + 0.25 * Math.sin(w / 5) ? Math.floor(rnd() * 9) + 1 : 0)));
  return { weeks, demo: true };
}

function streaks(weeks) {
  const days = weeks.flat();
  // the last entries may be in the future (partial week) — trim trailing zeros after today only if needed
  let cur = 0, longest = 0, run = 0;
  for (const n of days) { run = n > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (days[i] === 0) i--;                      // today may not have a contribution yet
  while (i >= 0 && days[i] > 0) { cur++; i--; }
  return { cur, longest, total: days.reduce((a, b) => a + b, 0) };
}

// ── theming ───────────────────────────────────────────────────
const THEMES = {
  dark: { bg: ["#0b0c12", "#171427"], text: "#e9e3d6", dim: "#8c877c", faint: "#3a3646", star: "#e8e4f0", accent: "#f2c27b", fire: ["#ff5a1f", "#ffb347", "#ffe8a3"], sea: ["#1e3a6e", "#3f74c4", "#9cc6ff", "#eaf4ff"] },
  light: { bg: ["#fbf7ef", "#efe6d6"], text: "#3d362c", dim: "#857a66", faint: "#d8cdb8", star: "#5b4a8a", accent: "#b06d1c", fire: ["#d8431a", "#e98a1c", "#c79a00"], sea: ["#7aa2d6", "#3f74c4", "#1e4a8c", "#0d2b5c"] },
};
const MONO = `"JetBrains Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace`;
const SERIF = `"Iowan Old Style",Palatino,Georgia,serif`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => Math.round(n * 10) / 10;
const k = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

function frame(W, H, T, title, body, style = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.bg[0]}"/><stop offset="1" stop-color="${T.bg[1]}"/></linearGradient>
  <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <linearGradient id="glint" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<style>
  text { font-family: ${MONO}; }
  .serif { font-family: ${SERIF}; }
  ${style}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
${body}
</svg>`;
}

// ── 1. night sky stats card ───────────────────────────────────
function skySVG(D, theme) {
  const T = THEMES[theme], W = 495, H = 195, rnd = rng(login + "sky");
  const out = [];
  // background dust
  const dust = [];
  for (let i = 0; i < 70; i++) dust.push(`<text x="${r1(rnd() * W)}" y="${r1(10 + rnd() * (H - 20))}" fill="${T.faint}" font-size="8">.</text>`);
  out.push(dust.join(""));
  // a star per repo in the right half, brighter = more stars; link the brightest as a constellation
  const repos = [...D.repos].sort((a, b) => b.stars - a.stars).slice(0, 60);
  const max = Math.max(1, ...repos.map((r) => r.stars));
  const pts = repos.map((r) => ({ r, x: r1(255 + rnd() * 215), y: r1(28 + rnd() * 140) }));
  const top = pts.slice(0, Math.min(6, pts.length)).sort((a, b) => a.x - b.x);
  if (top.length > 1) out.push(`<polyline points="${top.map((p) => `${p.x},${p.y - 3}`).join(" ")}" fill="none" stroke="${T.dim}" stroke-width="0.6" stroke-dasharray="2 3" opacity=".6"/>`);
  for (const p of pts) {
    const s = p.r.stars / max;
    const ch = s > 0.6 ? "✦" : s > 0.25 ? "*" : s > 0.05 ? "+" : "·";
    const size = 8 + s * 12;
    out.push(`<text class="tw" x="${p.x}" y="${p.y}" font-size="${r1(size)}" fill="${T.star}" text-anchor="middle" style="animation-delay:-${r1(rnd() * 6)}s;animation-duration:${r1(3 + rnd() * 4)}s"${s > 0.25 ? ' filter="url(#soft)"' : ""}><title>${esc(p.r.name)} · ${p.r.stars}★</title>${ch}</text>`);
  }
  // shooting star
  out.push(`<g class="shoot"><line x1="0" y1="0" x2="34" y2="10" stroke="${T.star}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/></g>`);
  // text block
  out.push(`<text x="24" y="40" class="serif" font-size="20" fill="${T.text}">${esc(D.name)}</text>`);
  out.push(`<text x="24" y="58" font-size="10" fill="${T.dim}">every star here is one of my repos</text>`);
  const rows = [["★", "stars earned", k(D.stars)], ["◇", "repositories", k(D.publicRepos)], ["☺", "followers", k(D.followers)], ["∴", "contributions", k(D.total)]];
  rows.forEach(([ic, label, val], i) => {
    const y = 88 + i * 22;
    out.push(`<text x="24" y="${y}" font-size="12" fill="${T.accent}">${ic}</text><text x="42" y="${y}" font-size="12" fill="${T.dim}">${label}</text><text x="210" y="${y}" font-size="12" fill="${T.text}" text-anchor="end">${esc(val)}</text>`);
    out.push(`<text x="${42 + label.length * 7.3 + 4}" y="${y}" font-size="12" fill="${T.faint}">${".".repeat(Math.max(0, Math.floor((210 - 42 - label.length * 7.3 - 30) / 7.3)))}</text>`);
  });
  const style = `
  .tw { animation: tw 4s ease-in-out infinite; }
  @keyframes tw { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
  .shoot { animation: shoot 9s linear infinite; opacity: 0; }
  @keyframes shoot { 0%,88% { transform: translate(260px,20px); opacity: 0; } 90% { opacity: 1; } 100% { transform: translate(480px,90px); opacity: 0; } }
`;
  return frame(W, H, T, `${D.name}'s GitHub night sky`, out.join("\n"), style);
}

// ── 2. languages ──────────────────────────────────────────────
function languagesSVG(D, theme) {
  const T = THEMES[theme], W = 495;
  const entries = Object.entries(D.langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
  const H = 62 + entries.length * 24;
  const colors = theme === "dark" ? ["#f2c27b", "#e8836b", "#9fd39a", "#8fb8ff", "#c79bf2", "#f3a6c8"] : ["#b06d1c", "#c0452a", "#3f8a3a", "#2f63b0", "#7a4bb0", "#b04a7a"];
  const out = [`<text x="24" y="36" class="serif" font-size="18" fill="${T.text}">languages</text>`, `<text x="${W - 24}" y="36" font-size="10" fill="${T.dim}" text-anchor="end">by repository</text>`];
  const barX = 140, barW = 270, cells = 34, cw = barW / cells;
  entries.forEach(([name, v], i) => {
    const y = 66 + i * 24, pct = v / sum, n = Math.max(1, Math.round(pct * cells));
    out.push(`<text x="24" y="${y}" font-size="12" fill="${T.text}">${esc(name.length > 14 ? name.slice(0, 13) + "…" : name)}</text>`);
    out.push(`<text x="${barX}" y="${y}" font-size="12" fill="${T.faint}">${"░".repeat(cells)}</text>`);
    const full = "█".repeat(Math.max(0, n - 2)) + (n > 1 ? "▓" : "") + "▒";
    out.push(`<text x="${barX}" y="${y}" font-size="12" fill="${colors[i]}">${full}</text>`);
    out.push(`<rect class="glint" x="${barX}" y="${y - 10}" width="18" height="12" fill="url(#glint)" style="animation-delay:${r1(i * 0.35)}s"/>`);
    out.push(`<text x="${W - 24}" y="${y}" font-size="12" fill="${T.dim}" text-anchor="end">${(pct * 100).toFixed(1)}%</text>`);
  });
  const style = `
  .glint { animation: glint 4.5s ease-in-out infinite; opacity: 0; }
  @keyframes glint { 0% { transform: translateX(0); opacity: 0; } 10% { opacity: .9; } 55% { transform: translateX(${barW - 18}px); opacity: .9; } 65%,100% { transform: translateX(${barW - 18}px); opacity: 0; } }`;
  return frame(W, H, T, "top languages", out.join("\n"), style);
}

// ── 3. streak campfire ────────────────────────────────────────
function streakSVG(S, theme) {
  const T = THEMES[theme], W = 495, H = 195, rnd = rng(login + "fire");
  const level = Math.min(1, S.cur / 30);                 // a month-long streak = full bonfire
  const rows = Math.round(6 + level * 5);
  const cx = 380, base = 152;
  const chars = ["'", "^", "*", "%", "#", "@"];
  // three flicker frames, cycled with opacity keyframes
  const frames = [0, 1, 2].map((f) => {
    const parts = [];
    for (let r = 0; r < rows; r++) {
      const width = Math.max(1, Math.round((rows - r) * 1.25 * (0.75 + 0.25 * rnd())));
      for (let c = -width; c <= width; c++) {
        if (rnd() < 0.18 + r * 0.05) continue;
        const heat = 1 - (Math.abs(c) / (width + 1)) * 0.6 - r / rows * 0.5;
        const ch = chars[Math.max(0, Math.min(5, Math.floor(heat * 6 - (r === rows - 1 ? 2 : 0))))];
        const col = heat > 0.75 ? T.fire[2] : heat > 0.5 ? T.fire[1] : T.fire[0];
        parts.push(`<text x="${r1(cx + c * 7 + (rnd() - 0.5) * 2)}" y="${r1(base - r * 11)}" fill="${col}">${esc(ch)}</text>`);
      }
    }
    return `<g class="f f${f}">${parts.join("")}</g>`;
  });
  const out = [];
  out.push(`<ellipse cx="${cx}" cy="${base - rows * 5}" rx="${70 + level * 40}" ry="${50 + level * 30}" fill="${T.fire[1]}" opacity="${theme === "dark" ? 0.18 : 0.12}" filter="url(#blur)"/>`);
  out.push(`<g font-size="12" font-weight="700">${frames.join("")}</g>`);
  // logs and stones
  out.push(`<text x="${cx}" y="${base + 13}" font-size="12" fill="${theme === "dark" ? "#7a5236" : "#6b4a2e"}" text-anchor="middle">=/==\\\\=</text>`);
  out.push(`<text x="${cx}" y="${base + 24}" font-size="12" fill="${T.dim}" text-anchor="middle">(o)(O)(o)(O)(o)</text>`);
  // embers
  for (let i = 0; i < 9; i++) out.push(`<text class="em" x="${r1(cx - 30 + rnd() * 60)}" y="${base - rows * 11}" font-size="9" fill="${T.fire[1]}" style="animation-delay:-${r1(rnd() * 4)}s;animation-duration:${r1(2.5 + rnd() * 2)}s">.</text>`);
  out.push(`<text x="24" y="40" class="serif" font-size="18" fill="${T.text}">campfire</text>`);
  out.push(`<text x="24" y="58" font-size="10" fill="${T.dim}">it grows with my streak</text>`);
  out.push(`<text x="24" y="112" class="serif" font-size="46" fill="${T.accent}">${S.cur}</text>`);
  out.push(`<text x="${24 + String(S.cur).length * 24 + 10}" y="112" font-size="12" fill="${T.dim}">day${S.cur === 1 ? "" : "s"} in a row</text>`);
  out.push(`<text x="24" y="146" font-size="11" fill="${T.dim}">longest  <tspan fill="${T.text}">${S.longest}</tspan> days</text>`);
  out.push(`<text x="24" y="164" font-size="11" fill="${T.dim}">this year <tspan fill="${T.text}">${k(S.total)}</tspan> contributions</text>`);
  const style = `
  .f { opacity: 0; animation: fl .6s steps(1) infinite; }
  .f0 { animation-delay: 0s; } .f1 { animation-delay: .2s; } .f2 { animation-delay: .4s; }
  @keyframes fl { 0% { opacity: 1; } 33.3% { opacity: 0; } }
  .em { animation: em 3s linear infinite; }
  @keyframes em { from { transform: translate(0,0); opacity: 1; } to { transform: translate(14px,-70px); opacity: 0; } }`;
  return frame(W, H, T, `${S.cur}-day contribution streak`, out.join("\n"), style);
}

// ── 4. activity tide ──────────────────────────────────────────
function tideSVG(weeks, theme) {
  const T = THEMES[theme], W = 495, H = 170;
  const wk = weeks.slice(-26).map((d) => d.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...wk);
  const cols = 52, cw = (W - 48) / cols, rowsN = 9, rh = 10, base = H - 22;
  // two copies side by side scrolled together for a seamless loop
  const layer = (offset) => {
    const parts = [];
    for (let c = 0; c < cols; c++) {
      const w = wk[Math.floor(c / 2)] ?? 0;
      const level = (w / max) * rowsN;
      for (let r = 0; r < rowsN; r++) {
        const fill = level - r;
        if (fill <= 0 && r > 0) break;
        const crest = fill > 0 && fill < 1.2;
        const ch = r === 0 && fill <= 0 ? "_" : crest ? (c % 2 ? "~" : "^") : fill > 3 ? "≈" : "~";
        const col = crest ? T.sea[3] : T.sea[Math.min(2, Math.floor((r / rowsN) * 3))];
        parts.push(`<text x="${r1(offset + 24 + c * cw)}" y="${base - r * rh}" fill="${col}">${ch}</text>`);
      }
    }
    return parts.join("");
  };
  const out = [];
  out.push(`<text x="24" y="34" class="serif" font-size="18" fill="${T.text}">tide</text>`);
  out.push(`<text x="${W - 24}" y="34" font-size="10" fill="${T.dim}" text-anchor="end">26 weeks of contributions · peak ${max}/week</text>`);
  out.push(`<g font-size="11" font-weight="700"><g class="bob">${layer(0)}</g></g>`);
  // moon reflection glitter
  for (let i = 0; i < 6; i++) out.push(`<text class="gl" x="${380 + i * 9}" y="${base - 2 - (i % 3) * 6}" font-size="9" fill="${T.sea[3]}" style="animation-delay:-${i * 0.4}s">·</text>`);
  out.push(`<text x="404" y="64" font-size="18" fill="${T.sea[3]}" opacity=".85">◐</text>`);
  const style = `
  .bob { animation: bob 5s ease-in-out infinite; }
  @keyframes bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
  .gl { animation: gl 2.4s ease-in-out infinite; }
  @keyframes gl { 0%,100% { opacity: .2; } 50% { opacity: 1; } }`;
  return frame(W, H, T, "26 weeks of contributions as a tide", out.join("\n"), style);
}

// ── 5. koi pond (live fish, SMIL-animated) ────────────────────
// Each koi is a rigid-ish vector body that flexes between three poses while it follows a smooth closed
// loop (animateMotion rotate="auto"), so it turns gracefully and can never fold through itself.
function pondSVG(weeks, theme, link) {
  const W = 880, H = 300, rnd = rng(login + "pond" + theme);
  const dark = theme === "dark";
  const recent = weeks.slice(-5).flat().reduce((a, b) => a + b, 0);
  const nFish = Math.max(3, Math.min(9, 3 + Math.round(Math.sqrt(recent) / 2)));
  const water = dark ? ["#0a2a2c", "#06181c"] : ["#5f9ea0", "#2f6f73"];
  const VARIETIES = [
    { name: "kohaku", base: "#f6f2ea", spots: ["#e2401c"] },
    { name: "ogon", base: "#f4c24a", spots: [] , metal: true },
    { name: "showa", base: "#1a1a1f", spots: ["#e2401c", "#f6f2ea"] },
    { name: "sanke", base: "#f6f2ea", spots: ["#e2401c", "#1a1a1f"] },
    { name: "tancho", base: "#f6f2ea", spots: [], cap: "#e2401c" },
    { name: "asagi", base: "#7f9bb3", spots: ["#ef7f3a"], belly: true },
    { name: "chagoi", base: "#9a6a42", spots: [] },
    { name: "kujaku", base: "#e9edf0", spots: ["#f08a2e"], metal: true },
    { name: "kohaku", base: "#f6f2ea", spots: ["#d93a18"] },
  ];
  // body outline (head at +x), three flex poses with identical command structure
  const body = (b) => {
    const t1 = 8 * b, t2 = 16 * b;
    return `M 34 0 C 34 -9 22 -13 8 -12 C -6 ${-11 + t1 * 0.2} -18 ${-7 + t1 * 0.5} -30 ${-3 + t2 * 0.6} ` +
           `L -30 ${3 + t2 * 0.6} C -18 ${7 + t1 * 0.5} -6 ${11 + t1 * 0.2} 8 12 C 22 13 34 9 34 0 Z`;
  };
  const tail = (b) => { const y = 16 * b * 0.6; return `M -29 ${-2 + y} C -40 ${-12 + y * 1.4} -50 ${-16 + y * 1.8} -56 ${-13 + y * 2} C -50 ${-4 + y * 1.8} -50 ${4 + y * 1.8} -56 ${13 + y * 2} C -50 ${16 + y * 1.8} -40 ${12 + y * 1.4} -29 ${2 + y} Z`; };
  const out = [];
  const defs = [];
  // caustics: blurred light blobs drifting
  const caus = [];
  for (let i = 0; i < 14; i++) {
    const x = r1(rnd() * W), y = r1(rnd() * H), r = r1(30 + rnd() * 60);
    caus.push(`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r1(r * 0.5)}" fill="${dark ? "#2f8c84" : "#c9f1e6"}" opacity="${dark ? 0.16 : 0.22}"><animate attributeName="cx" values="${x};${r1(x + 40 - rnd() * 80)};${x}" dur="${r1(14 + rnd() * 12)}s" repeatCount="indefinite"/><animate attributeName="opacity" values="${dark ? ".08;.2;.08" : ".12;.3;.12"}" dur="${r1(6 + rnd() * 6)}s" repeatCount="indefinite"/></ellipse>`);
  }
  out.push(`<g filter="url(#blur)">${caus.join("")}</g>`);
  // pebble floor hint
  const peb = [];
  for (let i = 0; i < 90; i++) peb.push(`<ellipse cx="${r1(rnd() * W)}" cy="${r1(rnd() * H)}" rx="${r1(4 + rnd() * 9)}" ry="${r1(3 + rnd() * 6)}" fill="${dark ? "#0f3134" : "#4f8b8d"}" opacity=".55"/>`);
  out.push(`<g>${peb.join("")}</g>`);
  // ASCII ripples drifting across the surface
  const rip = [];
  for (let r = 0; r < 9; r++) {
    const y = 30 + r * 31 + rnd() * 8;
    let line = "";
    for (let c = 0; c < 70; c++) line += rnd() < 0.18 ? (rnd() < 0.5 ? "~" : "-") : (rnd() < 0.12 ? "." : " ");
    rip.push(`<text x="0" y="${r1(y)}" font-size="12" fill="${dark ? "#4fb3a8" : "#e6fff8"}" opacity=".35" xml:space="preserve">${line}<animateTransform attributeName="transform" type="translate" values="0 0;${r % 2 ? 14 : -14} 0;0 0" dur="${r1(7 + rnd() * 5)}s" repeatCount="indefinite"/></text>`);
  }
  out.push(`<g>${rip.join("")}</g>`);

  // fish
  for (let i = 0; i < nFish; i++) {
    const v = VARIETIES[i % VARIETIES.length];
    const sc = r1(0.8 + rnd() * 0.55);
    // a smooth closed loop: Lissajous-ish, sampled and drawn as a Catmull-Rom → cubic path
    const cx = 110 + rnd() * (W - 220), cy = 80 + rnd() * (H - 160);
    const ax = 120 + rnd() * 220, ay = 50 + rnd() * 50, ph = rnd() * 6.28, k = 1 + Math.floor(rnd() * 2);
    const pts = [];
    const N = 16;
    for (let j = 0; j < N; j++) {
      const t = (j / N) * Math.PI * 2;
      let x = cx + ax * Math.cos(t + ph) + 25 * Math.sin(t * 3 + i);
      let y = cy + ay * Math.sin(k * t + ph * 0.7) + 15 * Math.cos(t * 2 + i);
      x = Math.max(50, Math.min(W - 50, x)); y = Math.max(40, Math.min(H - 40, y));
      pts.push([x, y]);
    }
    let d = `M ${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let j = 0; j < N; j++) {
      const p0 = pts[(j - 1 + N) % N], p1 = pts[j], p2 = pts[(j + 1) % N], p3 = pts[(j + 2) % N];
      d += ` C ${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
    }
    const dur = r1(28 + rnd() * 26);
    const wag = r1(0.9 + rnd() * 0.5);
    const id = `k${i}`;
    defs.push(`<clipPath id="${id}c"><path d="${body(0)}"><animate attributeName="d" values="${body(-0.5)};${body(0.5)};${body(-0.5)}" dur="${wag}s" repeatCount="indefinite"/></path></clipPath>`);
    const spots = [];
    v.spots.forEach((col, si) => {
      for (let q = 0; q < 3; q++) spots.push(`<ellipse cx="${r1(-18 + rnd() * 44)}" cy="${r1((rnd() - 0.5) * 16)}" rx="${r1(6 + rnd() * 9)}" ry="${r1(4 + rnd() * 6)}" fill="${col}" opacity="${si === 0 ? 0.95 : 0.9}"/>`);
    });
    if (v.cap) spots.push(`<circle cx="22" cy="0" r="6.5" fill="${v.cap}"/>`);
    if (v.belly) spots.push(`<rect x="-30" y="7" width="64" height="8" fill="#ef7f3a" opacity=".8"/><rect x="-30" y="-15" width="64" height="8" fill="#ef7f3a" opacity=".8"/>`);
    const scales = v.name === "asagi" || v.name === "chagoi" || v.metal
      ? `<g opacity=".25" stroke="${dark ? "#000" : "#333"}" stroke-width=".6" fill="none">${Array.from({ length: 6 }, (_, c) => `<path d="M ${-20 + c * 8} -10 q 4 5 0 10 q 4 5 0 10"/>`).join("")}</g>` : "";
    const finCol = v.metal ? "#ffe2a0" : (v.name === "showa" ? "#3a3438" : "#eef0f2");
    out.push(`<g opacity="${r1(0.88 + rnd() * 0.12)}">
  <animateMotion dur="${dur}s" repeatCount="indefinite" rotate="auto" path="${d}"/>
  <g transform="scale(${sc})">
    <ellipse cx="6" cy="10" rx="34" ry="11" fill="#000" opacity=".22" transform="translate(6 10)"/>
    <path d="${tail(0)}" fill="${finCol}" opacity=".7"><animate attributeName="d" values="${tail(-0.5)};${tail(0.5)};${tail(-0.5)}" dur="${wag}s" repeatCount="indefinite"/></path>
    <g><path d="M 10 -10 C 4 -26 -6 -26 -4 -12 Z" fill="${finCol}" opacity=".6"><animateTransform attributeName="transform" type="rotate" values="-12 8 -10;14 8 -10;-12 8 -10" dur="${r1(wag * 1.7)}s" repeatCount="indefinite"/></path>
       <path d="M 10 10 C 4 26 -6 26 -4 12 Z" fill="${finCol}" opacity=".6"><animateTransform attributeName="transform" type="rotate" values="12 8 10;-14 8 10;12 8 10" dur="${r1(wag * 1.7)}s" repeatCount="indefinite"/></path></g>
    <g clip-path="url(#${id}c)">
      <rect x="-40" y="-20" width="80" height="40" fill="${v.base}"/>
      ${spots.join("")}${scales}
      <rect x="-40" y="-20" width="80" height="40" fill="url(#bodyShade)"/>
    </g>
    <circle cx="27" cy="-5.5" r="1.7" fill="#111"/><circle cx="27" cy="5.5" r="1.7" fill="#111"/>
    <path d="M 33 -2 q 5 -1 7 -5 M 33 2 q 5 1 7 5" stroke="${finCol}" stroke-width=".8" fill="none" opacity=".7"/>
  </g>
</g>`);
  }

  // lily pads with lotus, bobbing
  const pads = [[130, 70, 34], [180, 100, 20], [720, 210, 38], [770, 175, 22], [660, 250, 18], [420, 40, 16]];
  pads.forEach(([x, y, r], i) => {
    const notch = r1(rnd() * 360);
    const flower = i === 0 || i === 2;
    out.push(`<g transform="translate(${x} ${y})"><g><animateTransform attributeName="transform" type="rotate" values="${notch};${r1(notch + 6)};${notch}" dur="${r1(9 + rnd() * 6)}s" repeatCount="indefinite"/>
  <path d="M 0 0 L ${r} -4 A ${r} ${r} 0 1 0 ${r} 4 Z" fill="${dark ? "#2e6b2a" : "#4f9a42"}" stroke="${dark ? "#4a8a3a" : "#3c7a33"}" stroke-width="1"/>
  ${Array.from({ length: 7 }, (_, k2) => `<line x1="0" y1="0" x2="${r1(Math.cos(0.5 + k2 * 0.8) * r * 0.9)}" y2="${r1(Math.sin(0.5 + k2 * 0.8) * r * 0.9)}" stroke="${dark ? "#3f8a38" : "#6db85c"}" stroke-width=".7"/>`).join("")}
  </g>${flower ? `<g>${Array.from({ length: 8 }, (_, k2) => `<ellipse cx="0" cy="-9" rx="4.5" ry="10" fill="${k2 % 2 ? "#f7b3cc" : "#ef8fb3"}" transform="rotate(${k2 * 45})"/>`).join("")}${Array.from({ length: 6 }, (_, k2) => `<ellipse cx="0" cy="-6" rx="3" ry="6.5" fill="#fde2ec" transform="rotate(${k2 * 60 + 22})"/>`).join("")}<circle r="3.4" fill="#f6c945"/></g>` : ""}</g>`);
  });
  // drifting petals
  for (let i = 0; i < 7; i++) {
    const y = r1(30 + rnd() * (H - 60));
    out.push(`<ellipse cx="0" cy="${y}" rx="3.5" ry="2" fill="#f5b7c9" opacity=".9"><animate attributeName="cx" values="-10;${W + 10}" dur="${r1(60 + rnd() * 50)}s" begin="-${r1(rnd() * 60)}s" repeatCount="indefinite"/></ellipse>`);
  }
  // caption
  out.push(`<text x="20" y="${H - 16}" class="serif" font-size="15" fill="${dark ? "#e9e3d6" : "#fff"}" opacity=".9">pond</text>`);
  out.push(`<text x="64" y="${H - 16}" font-size="10" fill="${dark ? "#8fb3ad" : "#eafff9"}" opacity=".9">${nFish} koi · ${recent} contribution${recent === 1 ? "" : "s"} in the last 5 weeks${link ? " · click to feed them ↗" : ""}</text>`);

  const T = { bg: water };
  return frame(W, H, T, `koi pond: ${nFish} koi`, `<defs>${defs.join("")}
  <linearGradient id="bodyShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
  <radialGradient id="vig" cx=".5" cy=".5" r=".7"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? ".55" : ".3"}"/></radialGradient>
</defs>
${out.join("\n")}
<rect width="${W}" height="${H}" rx="14" fill="url(#vig)"/>`);
}

// ── main ──────────────────────────────────────────────────────
let D;
try { D = args.demo ? demoData() : await liveData(); }
catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
const C = contributions(args.demo);
const S = streaks(C.weeks);
D.total = S.total;
mkdirSync(outDir, { recursive: true });
const files = [];
for (const theme of ["dark", "light"]) {
  const sfx = theme === "light" ? "-light" : "";
  const put = (name, svg) => { const f = join(outDir, `${name}${sfx}.svg`); writeFileSync(f, svg); files.push(f); };
  put("sky", skySVG(D, theme));
  put("languages", languagesSVG(D, theme));
  put("streak", streakSVG(S, theme));
  put("tide", tideSVG(C.weeks, theme));
  put("pond", pondSVG(C.weeks, theme, args.link));
}
console.log(`✓ ${login}: ${D.repos.length} repos, ${D.stars}★, streak ${S.cur} (longest ${S.longest})${args.demo ? " (demo)" : ""}`);
files.forEach((f) => console.log("  " + f));
