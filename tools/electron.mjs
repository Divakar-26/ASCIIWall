// Launch Electron with a clean environment. (VS Code terminals export ELECTRON_RUN_AS_NODE=1,
// which turns Electron into plain Node and breaks `require("electron")`.)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let bin = "electron";
try { bin = createRequire(import.meta.url)("electron"); } catch { /* fall back to a global install */ }
const child = spawn(bin, [".", ...process.argv.slice(2)], { stdio: "inherit", env, shell: process.platform === "win32" && bin === "electron" });
child.on("exit", (code) => process.exit(code ?? 0));
