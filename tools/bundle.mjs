// Concatenate the renderer, every scene and the <ascii-wall> element into one file:
//   node tools/bundle.mjs   →   web/dist/asciiwall.js
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "js");
const order = ["glyphs.js", "engine.js"];
const sceneOrder = ["ring", "beacons", "meadowwalk", "heart", "blackhole", "galaxy", "earth", "knot", "stilllife", "armillary", "florence", "butterflies", "clouds", "torii", "koi", "tide", "meadow", "rain", "hearth", "jelly", "aurora", "garden", "image"];
const found = readdirSync(join(root, "scenes")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
const scenes = [...sceneOrder.filter((s) => found.includes(s)), ...found.filter((s) => !sceneOrder.includes(s))].map((s) => `scenes/${s}.js`);
const files = [...order, ...scenes, "element.js"];

const banner = `/*! ASCIIWall — live, interactive ASCII-art wallpapers. Single-file bundle (${files.length} modules). */\n`;
const body = files.map((f) => `\n/* ── ${f} ── */\n` + readFileSync(join(root, f), "utf8")).join("\n");
mkdirSync(join(root, "..", "dist"), { recursive: true });
const out = join(root, "..", "dist", "asciiwall.js");
writeFileSync(out, banner + body);
console.log(`wrote ${out} (${(Buffer.byteLength(banner + body) / 1024).toFixed(1)} KB) from ${files.join(", ")}`);
