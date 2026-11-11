#!/usr/bin/env node
/* ASCIIWall · Contribution Garden generator
 *
 *   node github/garden.mjs --user <login> [--token <gh token>] [--demo]
 *                          [--out web/data] [--svg-out assets] [--link <url>]
 *
 * Writes:
 *   <out>/contributions.json      → feeds the live, interactive "garden" scene (GitHub Pages)
 *   <svg-out>/garden.svg          → animated ASCII garden for a README (dark)
 *   <svg-out>/garden-light.svg    → same, for light mode
 *
 * GitHub READMEs render SVG as an <img>: CSS animation works, scripts and hover don't. So the SVG is
 * the "ambient" widget and links (from your README) to the interactive page on GitHub Pages.
 * Data comes from the GraphQL API when a token is given (GITHUB_TOKEN in Actions works), else from
 * the public contributions calendar. No dependencies; Node 18+.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const IS_MAIN = process.argv[1] && fileURLToPath(import.meta.url) === (await import("node:path")).resolve(process.argv[1]);

// ── args ──────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const k = a.slice(2), v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) args[k] = true; else { args[k] = v; i++; }
}
const user = args.user || process.env.GITHUB_REPOSITORY_OWNER;
const token = args.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const outDir = args.out || "web/data";
const svgDir = args["svg-out"] || "assets";
if (IS_MAIN && !user && !args.demo) { console.error("usage: node github/garden.mjs --user <login> [--token T] [--demo] [--out dir] [--svg-out dir]"); process.exit(2); }

// ── data ──────────────────────────────────────────────────────
export async function fromGraphQL(login, tok) {
  const query = `query($login:String!){ user(login:$login){ contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount weekday } } } } } }`;
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${tok}`, "content-type": "application/json", "user-agent": "asciiwall-garden" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error("GraphQL: " + JSON.stringify(j.errors || j));
  const cal = j.data.user.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.map((w) => {
    const days = Array(7).fill(0);
    w.contributionDays.forEach((d) => { days[d.weekday] = d.contributionCount; });
    return days;
  });
  const first = cal.weeks[0].contributionDays[0];
  return { total: cal.totalContributions, start: sundayOf(first.date, first.weekday), weeks };
}

export async function fromPublicCalendar(login) {
  const r = await fetch(`https://github.com/users/${encodeURIComponent(login)}/contributions`, { headers: { "user-agent": "asciiwall-garden" } });
  if (!r.ok) throw new Error(`calendar fetch failed: HTTP ${r.status}`);
  const html = await r.text();
  const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];
  const cells = [];
  for (const m of html.matchAll(/<td\b[^>]*ContributionCalendar-day[^>]*>/g)) {
    const tag = m[0];
    const id = attr(tag, "id"), date = attr(tag, "data-date"), level = Number(attr(tag, "data-level") || 0);
    const pos = id && id.match(/(\d+)-(\d+)$/);
    if (date && pos) cells.push({ id, date, level, weekday: Number(pos[1]), week: Number(pos[2]) });
  }
  if (!cells.length) throw new Error("couldn't find the contribution calendar in the page (GitHub may have changed its markup) — pass --token instead");
  const counts = {};
  for (const m of html.matchAll(/<tool-tip\b[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = m[2].match(/^\s*(\d[\d,]*|No) contribution/);
    if (n) counts[m[1]] = n[1] === "No" ? 0 : Number(n[1].replace(/,/g, ""));
  }
  const nWeeks = Math.max(...cells.map((c) => c.week)) + 1;
  const weeks = Array.from({ length: nWeeks }, () => Array(7).fill(0));
  let total = 0;
  for (const c of cells) {
    const n = counts[c.id] ?? c.level * 2; // fall back to level if counts are hidden
    weeks[c.week][c.weekday] = n;
    total += n;
  }
  const first = cells.reduce((a, b) => (a.date < b.date ? a : b));
  return { total, start: sundayOf(first.date, first.weekday), weeks };
}

export function demoData(seed) {
  const rnd = rng(seed);
  const weeks = [];
  for (let w = 0; w < 53; w++) {
    const busy = 0.5 + 0.5 * Math.sin(w / 6 + 1) + (rnd() - 0.5) * 0.6;
    weeks.push(Array.from({ length: 7 }, (_, d) => {
      const p = Math.max(0, busy) * (d === 0 || d === 6 ? 0.35 : 0.85);
      return rnd() < p ? Math.round(rnd() * 9 * (0.5 + busy)) + 1 : 0;
    }));
  }
  const start = new Date(); start.setDate(start.getDate() - 52 * 7 - start.getDay());
  return { total: weeks.flat().reduce((a, b) => a + b, 0), start: start.toISOString().slice(0, 10), weeks, demo: true };
}

function sundayOf(date, weekday) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - weekday);
  return d.toISOString().slice(0, 10);
}
function rng(seedStr) {
  let h = 1779033703 ^ String(seedStr).length;
  for (const ch of String(seedStr)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

// ── svg ───────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: ["#0b0c12", "#17142a"], text: "#e9e3d6", dim: "#8c877c", star: "#c9c6d8", stem: "#4f8a4a", leaf: "#74b062",
    bloom: ["#9fd39a", "#f38ab3", "#ff9f5a", "#ffd877"], heart: "#ffe08a", ground: "#4a3a2c", grass: "#5f8f48",
    firefly: "#ffe89a", moon: "#f3e6c0", glow: 0.55,
  },
  light: {
    bg: ["#fbf7ef", "#eee4d3"], text: "#3d362c", dim: "#8a7f6c", star: "#c9b48e", stem: "#4f7d45", leaf: "#5f9a4f",
    bloom: ["#7fb27a", "#d95f92", "#e3732f", "#c8920f"], heart: "#b8860b", ground: "#b5a084", grass: "#6f9a54",
    firefly: "#d9962c", moon: "#e2b866", glow: 0.35,
  },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r1 = (n) => Math.round(n * 10) / 10;

function renderSVG(data, theme, { login, link }) {
  const T = THEMES[theme];
  const rnd = rng(login + theme);
  const W = 880, H = 300, G = 248;              // canvas + ground line
  const weeks = data.weeks.slice(-53);
  const flat = weeks.flat().filter((n) => n > 0).sort((a, b) => a - b);
  const q = (f) => (flat.length ? flat[Math.min(flat.length - 1, Math.floor(f * flat.length))] : 1);
  const qs = [q(0.25), q(0.5), q(0.75)];
  const level = (n) => (n <= 0 ? 0 : n <= qs[0] ? 1 : n <= qs[1] ? 2 : n <= qs[2] ? 3 : 4);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.reduce((a, b) => a + b, 0)));
  const x0 = 40, dx = (W - 80) / 53;
  const out = [];

  // stars
  const stars = [];
  for (let i = 0; i < 46; i++) {
    const x = r1(20 + rnd() * (W - 40)), y = r1(16 + rnd() * 120);
    if (x > 600 && x < 720 && y < 90) continue; // keep the moon clear
    stars.push(`<text class="s" x="${x}" y="${y}" style="animation-delay:-${r1(rnd() * 6)}s">${rnd() < 0.8 ? "·" : rnd() < 0.5 ? "+" : "*"}</text>`);
  }
  out.push(`<g fill="${T.star}" font-size="10">${stars.join("")}</g>`);

  // moon (ASCII disc + soft halo)
  const moonRows = ["  .@@@.  ", " @@@@@@@ ", "@@@@@@@@%", "@@@@@@@%%", " @@@@@%% ", "  '@%%'  "];
  out.push(`<circle cx="672" cy="56" r="30" fill="${T.moon}" opacity="${T.glow * 0.35}" filter="url(#blur)"/>`);
  out.push(`<g fill="${T.moon}" font-size="9" font-weight="700">` + moonRows.map((row, i) => {
    const xs = [], chars = [];
    [...row].forEach((ch, j) => { if (ch !== " ") { xs.push(r1(645 + j * 6.2)); chars.push(esc(ch)); } });
    return `<text x="${xs.join(" ")}" y="${36 + i * 8.5}">${chars.join("")}</text>`;
  }).join("") + `</g>`);

  // drifting wind
  for (let i = 0; i < 3; i++) out.push(`<text class="w" y="${80 + i * 34}" fill="${T.dim}" font-size="11" style="animation-duration:${38 + i * 9}s;animation-delay:-${i * 13}s">~ ~</text>`);

  // plants
  const plants = [];
  weeks.forEach((days, w) => {
    const total = days.reduce((a, b) => a + b, 0);
    const x = r1(x0 + (w + 0.5) * dx);
    const parts = [];
    if (total === 0) {
      parts.push(`<text x="${x}" y="${G - 2}" fill="${T.grass}">${rnd() < 0.5 ? "," : "."}</text>`);
    } else {
      const h = 16 + 132 * Math.sqrt(total / maxWeek);
      const n = Math.max(1, Math.round(h / 9));
      const ys = Array.from({ length: n }, (_, i) => r1(G - 3 - i * 9));
      parts.push(`<text x="${Array(n).fill(x).join(" ")}" y="${ys.join(" ")}" fill="${T.stem}">${"|".repeat(n)}</text>`);
      if (h > 30) parts.push(`<text x="${r1(x - 5)} ${r1(x + 5)}" y="${r1(G - h * 0.25)} ${r1(G - h * 0.42)}" fill="${T.leaf}">\\/</text>`);
      days.forEach((c, d) => {
        const lv = level(c);
        if (!lv) return;
        const by = r1(G - 6 - h * (0.3 + 0.7 * (d + 1) / 7));
        const bx = r1(x + (d % 2 ? 4.5 : -4.5));
        const ch = [".", "o", "*", "@"][lv - 1];
        parts.push(`<text class="b${lv}" x="${bx}" y="${by}" fill="${T.bloom[lv - 1]}" style="animation-delay:-${r1(rnd() * 4)}s">${ch}</text>`);
      });
    }
    plants.push(`<g class="p" style="animation-delay:-${r1(w * 0.19)}s"><title>${total} contribution${total === 1 ? "" : "s"}</title>${parts.join("")}</g>`);
  });
  out.push(`<g font-size="12" font-weight="700">${plants.join("")}</g>`);

  // ground
  const groundChars = [];
  for (let x = 24; x < W - 24; x += 6.6) {
    const r = rnd();
    groundChars.push([r1(x), r < 0.55 ? "_" : r < 0.75 ? "." : r < 0.9 ? "," : "'"]);
  }
  out.push(`<text x="${groundChars.map((g) => g[0]).join(" ")}" y="${G + 4}" fill="${T.ground}" font-size="11">${groundChars.map((g) => esc(g[1])).join("")}</text>`);
  const tufts = groundChars.filter(() => rnd() < 0.25);
  out.push(`<text x="${tufts.map((g) => g[0]).join(" ")}" y="${G + 14}" fill="${T.ground}" font-size="10" opacity=".7">${tufts.map(() => ".").join("")}</text>`);

  // fireflies
  const flies = [];
  for (let i = 0; i < 7; i++) {
    const x = r1(60 + rnd() * (W - 120)), y = r1(120 + rnd() * 110);
    flies.push(`<g class="f f${i % 4}" style="animation-delay:-${r1(rnd() * 20)}s"><text class="blink" x="${x}" y="${y}" style="animation-delay:-${r1(rnd() * 3)}s">•</text></g>`);
  }
  out.push(`<g fill="${T.firefly}" font-size="11" filter="url(#soft)">${flies.join("")}</g>`);

  // labels
  const title = login === "you" ? "your garden" : `${login}${/s$/i.test(login) ? "'" : "'s"} garden`;
  const sub = `${data.total.toLocaleString("en-US")} contributions · last 12 months${data.demo ? " · demo data" : ""}`;
  out.push(`<text x="40" y="38" fill="${T.text}" font-family="Iowan Old Style, Palatino, Georgia, serif" font-size="20">${esc(title)}</text>`);
  out.push(`<text x="40" y="56" fill="${T.dim}" font-size="10.5">${esc(sub)}</text>`);
  out.push(`<text x="${W - 40}" y="${H - 14}" fill="${T.dim}" font-size="9.5" text-anchor="end" opacity=".8">${link ? "click to wander in ↗" : "asciiwall"}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}: ${esc(sub)}">
<title>${esc(title)}</title>
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.bg[0]}"/><stop offset="1" stop-color="${T.bg[1]}"/></linearGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
  <filter id="soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<style>
  text { font-family: "JetBrains Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace; }
  .p { transform-box: fill-box; transform-origin: 50% 100%; animation: sway 7s ease-in-out infinite; }
  .p:hover text { filter: brightness(1.5); }
  @keyframes sway { 0%, 100% { transform: rotate(-2.6deg); } 50% { transform: rotate(2.6deg); } }
  .b4 { animation: pulse 3.4s ease-in-out infinite; }
  .b3 { animation: pulse 5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  .s { animation: tw 5s ease-in-out infinite; }
  @keyframes tw { 0%, 100% { opacity: .9; } 50% { opacity: .15; } }
  .w { animation: wind linear infinite; opacity: .35; }
  @keyframes wind { from { transform: translateX(-60px); } to { transform: translateX(${W + 40}px); } }
  .f { animation: 22s ease-in-out infinite; }
  .f0 { animation-name: f0; } .f1 { animation-name: f1; } .f2 { animation-name: f2; } .f3 { animation-name: f3; }
  @keyframes f0 { 0%,100% { transform: translate(0,0); } 25% { transform: translate(40px,-22px); } 50% { transform: translate(70px,6px); } 75% { transform: translate(24px,18px); } }
  @keyframes f1 { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-36px,14px); } 50% { transform: translate(-60px,-16px); } 75% { transform: translate(-18px,-30px); } }
  @keyframes f2 { 0%,100% { transform: translate(0,0); } 33% { transform: translate(28px,24px); } 66% { transform: translate(-30px,10px); } }
  @keyframes f3 { 0%,100% { transform: translate(0,0); } 33% { transform: translate(-24px,-26px); } 66% { transform: translate(34px,-12px); } }
  .blink { animation: blink 3s ease-in-out infinite; }
  @keyframes blink { 0%, 100% { opacity: .15; } 45%, 60% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect width="${W}" height="${H}" rx="14" fill="url(#sky)"/>
${out.join("\n")}
</svg>`;
}

// ── main ──────────────────────────────────────────────────────
if (IS_MAIN) {
const login = user || "you";
let data;
try {
  if (args.demo) data = demoData(login);
  else if (token) data = await fromGraphQL(login, token);
  else data = await fromPublicCalendar(login);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
data = { user: login, ...data, generated: new Date().toISOString() };

mkdirSync(outDir, { recursive: true });
mkdirSync(svgDir, { recursive: true });
writeFileSync(join(outDir, "contributions.json"), JSON.stringify(data));
writeFileSync(join(svgDir, "garden.svg"), renderSVG(data, "dark", { login, link: args.link }));
writeFileSync(join(svgDir, "garden-light.svg"), renderSVG(data, "light", { login, link: args.link }));
console.log(`✓ ${login}: ${data.total} contributions over ${data.weeks.length} weeks${data.demo ? " (demo)" : ""}`);
console.log(`  ${join(outDir, "contributions.json")}\n  ${join(svgDir, "garden.svg")}\n  ${join(svgDir, "garden-light.svg")}`);
}
