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
}
console.log(`✓ ${login}: ${D.repos.length} repos, ${D.stars}★, streak ${S.cur} (longest ${S.longest})${args.demo ? " (demo)" : ""}`);
files.forEach((f) => console.log("  " + f));
