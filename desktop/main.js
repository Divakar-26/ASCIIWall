/* ASCIIWall desktop — tray app that runs scenes as a live wallpaper on every display.
 *
 *  Linux (X11) / macOS : real desktop-layer windows (type: "desktop"), below icons & apps.
 *  Windows             : Electron can't reach the desktop layer without native code, so we
 *                        point you to Lively Wallpaper, which hosts web/ as an interactive wallpaper.
 *  All platforms       : the global cursor position is streamed to the wallpaper, so it still
 *                        reacts when other things (desktop icons) sit on top of it.
 */
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, dialog, shell, powerMonitor, globalShortcut } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

const WEB = path.join(__dirname, "..", "web");
const INDEX = path.join(WEB, "index.html");
const PRELOAD = path.join(__dirname, "preload.js");
const ICON = path.join(WEB, "icons", "icon-192.png");
const SMOKE = process.argv.includes("--smoke");
const SAFE = process.argv.includes("--safe");            // never start the wallpaper this run, and forget it
const FORCE = process.argv.includes("--force-wallpaper"); // skip the GNOME/Wayland guard below
// GNOME on Wayland runs us through XWayland, and Mutter does not honour "desktop"-type X11 windows there:
// the wallpaper becomes an ordinary full-screen window ON TOP of everything, and since it is not focusable
// you cannot click past it. So on that setup we refuse to create it.
const GNOME_WAYLAND = process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland"
  && /gnome|ubuntu|unity/i.test(process.env.XDG_CURRENT_DESKTOP || "");

if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.commandLine.appendSwitch("ignore-gpu-blocklist");
// Wayland compositors don't let ordinary apps draw on the desktop layer; X11 (incl. XWayland) does.
if (process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland" && !process.argv.includes("--wayland")) {
  app.commandLine.appendSwitch("ozone-platform", "x11");
}

// ── persisted state ──────────────────────────────────────────
const CFG = () => path.join(app.getPath("userData"), "state.json");
let state = { scene: "koi", settings: {}, wallpaper: true };
function loadState() { try { state = Object.assign(state, JSON.parse(fs.readFileSync(CFG(), "utf8"))); } catch (e) { /* first run */ } }
function saveState() { try { fs.mkdirSync(path.dirname(CFG()), { recursive: true }); fs.writeFileSync(CFG(), JSON.stringify(state, null, 2)); } catch (e) { console.error(e); } }
const uiState = () => ({ scene: state.scene, settings: state.settings });

let tray = null, libraryWin = null, wallWins = [], cursorTimer = null, lastCursor = "";

// Chromium's X11 layer fails to register the DESKTOP window-type atom ("Add _NET_WM_WINDOW_TYPE_DESKTOP to
// kAtomsToCache"), so the hint never reaches the window manager and the wallpaper is a NORMAL window that covers
// everything. We set the property ourselves with xprop BEFORE the window is shown, and read it back to be sure.
// If that can't be confirmed we show nothing at all.
function setDesktopType(w) {
  try {
    const id = "0x" + w.getNativeWindowHandle().readUInt32LE(0).toString(16);
    spawnSync("xprop", ["-id", id, "-f", "_NET_WM_WINDOW_TYPE", "32a", "-set", "_NET_WM_WINDOW_TYPE", "_NET_WM_WINDOW_TYPE_DESKTOP"], { stdio: "ignore" });
    const out = spawnSync("xprop", ["-id", id, "_NET_WM_WINDOW_TYPE"], { encoding: "utf8" }).stdout || "";
    return /_NET_WM_WINDOW_TYPE_DESKTOP/.test(out);
  } catch (e) { return false; }
}
async function desktopTypeFailed() {
  await dialog.showMessageBox({
    type: "info", title: "Wallpaper not started",
    message: "Couldn't put the wallpaper on the desktop layer",
    detail: "Nothing was drawn on your screen. Make sure xprop is installed:\n\n    sudo apt install x11-utils\n\nThen try again, or use: npm run safe",
    buttons: ["OK"],
  });
}

// ── X11: force "below everything" ────────────────────────────
// Electron's type:"desktop" hint is ignored by some window managers (GNOME/Mutter included), which leaves
// the wallpaper covering every app. wmctrl asks the window manager directly to keep it below all windows.
function haveWmctrl() { return !spawnSync("wmctrl", ["-m"], { stdio: "ignore" }).error; }
function pinBelow(w) {
  if (w.isDestroyed()) return;
  let xid;
  try { xid = w.getNativeWindowHandle().readUInt32LE(0); } catch (e) { return; }
  try {
    spawn("wmctrl", ["-i", "-r", "0x" + xid.toString(16), "-b", "add,below,sticky,skip_taskbar,skip_pager"], { stdio: "ignore" }).on("error", () => {});
  } catch (e) { /* ignore */ }
}
async function needWmctrl() {
  await dialog.showMessageBox({
    type: "info", title: "One small tool is missing",
    message: "Install wmctrl so the wallpaper can stay behind your windows",
    detail: "Open a terminal and run:\n\n    sudo apt install wmctrl\n\nThen start ASCIIWall again. (Nothing was drawn on your desktop.)",
    buttons: ["OK"],
  });
}

// ── wallpaper windows ────────────────────────────────────────
function startWallpaper() {
  stopWallpaper();
  if (process.platform === "win32") return windowsHelp();
  if (GNOME_WAYLAND && !FORCE) { state.wallpaper = false; saveState(); refreshTray(); return gnomeWaylandHelp(); }
  for (const d of screen.getAllDisplays()) {
    const b = d.bounds;
    const w = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height,
      type: process.platform === "linux" ? undefined : "desktop", frame: false, show: false, skipTaskbar: true, resizable: false, movable: false,
      minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false,
      // Linux: focusable:false makes Electron bypass the window manager entirely (override-redirect), which pins the
      // window ABOVE everything on all workspaces. That was the "everything is covered" bug.
      focusable: process.platform === "linux",
      enableLargerThanScreen: true, backgroundColor: "#07080c",
      webPreferences: { preload: PRELOAD, backgroundThrottling: false, contextIsolation: true },
    });
    if (process.platform === "linux" && !setDesktopType(w)) {
      stopWallpaper(); w.destroy(); state.wallpaper = false; saveState(); refreshTray(); desktopTypeFailed(); return;
    }
    w.displayBounds = b;
    w.loadFile(INDEX, { query: { mode: "wallpaper" } });
    w.once("ready-to-show", () => {
      w.setBounds(b); w.showInactive();
      if (process.platform === "linux") {
        w.setVisibleOnAllWorkspaces(true);
        for (const ms of [0, 300, 1200, 3000]) setTimeout(() => pinBelow(w), ms);
      }
    });
    if (process.platform === "darwin") w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    w.on("closed", () => { wallWins = wallWins.filter((x) => x !== w); });
    wallWins.push(w);
  }
  // stream the global cursor so the wallpaper reacts even underneath icons / other windows
  cursorTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    const key = p.x + "," + p.y;
    if (key === lastCursor) return;
    lastCursor = key;
    for (const w of wallWins) {
      const b = w.displayBounds;
      const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      if (!w.isDestroyed()) w.webContents.send("cursor", { x: (p.x - b.x) / b.width, y: 1 - (p.y - b.y) / b.height, inside });
    }
  }, 33);
  state.wallpaper = true; saveState(); refreshTray();
}

function stopWallpaper() {
  clearInterval(cursorTimer);
  for (const w of wallWins) if (!w.isDestroyed()) w.destroy();
  wallWins = [];
}

function setWallpaper(on) {
  if (on) startWallpaper(); else { stopWallpaper(); state.wallpaper = false; saveState(); refreshTray(); }
  return wallWins.length > 0;
}

async function windowsHelp() {
  const r = await dialog.showMessageBox({
    type: "info", title: "ASCIIWall on Windows",
    message: "Use Lively Wallpaper to put ASCIIWall behind your desktop icons",
    detail: "Windows doesn't let regular apps draw on the desktop layer. Lively Wallpaper is free and can host ASCIIWall as an interactive web wallpaper:\n\n1. Install Lively Wallpaper (Microsoft Store or rocksdanister.com/lively).\n2. Drag the ASCIIWall \"web\" folder (or web/wallpaper.html) into Lively.\n\nYou can keep using this app to browse the library and tune settings.",
    buttons: ["Open the web folder", "Get Lively", "Close"],
  });
  if (r.response === 0) shell.openPath(WEB);
  if (r.response === 1) shell.openExternal("https://www.rocksdanister.com/lively/");
  state.wallpaper = false; refreshTray();
}

async function gnomeWaylandHelp() {
  const r = await dialog.showMessageBox({
    type: "info", title: "Live wallpaper is off on this session",
    message: "GNOME on Wayland can't put a wallpaper behind your windows",
    detail: "A desktop-layer window would cover every app and you couldn't click past it, so ASCIIWall did not start it.\n\nOptions:\n• Log out and choose \"Ubuntu on Xorg\" (gear icon on the login screen); the wallpaper works there.\n• Or keep using the library window / browser (npm run serve) in fullscreen.\n\nRecovery any time: npm run safe",
    buttons: ["OK"],
  });
  return r;
}

// ── library window ───────────────────────────────────────────
function openLibrary() {
  if (libraryWin && !libraryWin.isDestroyed()) { libraryWin.show(); libraryWin.focus(); return; }
  libraryWin = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 420, backgroundColor: "#07080c", title: "ASCIIWall",
    icon: ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true },
  });
  libraryWin.loadFile(INDEX, { query: { open: "library" } });
  libraryWin.once("ready-to-show", () => libraryWin.show());
  libraryWin.on("closed", () => { libraryWin = null; });
}

// ── tray ─────────────────────────────────────────────────────
function refreshTray() {
  if (!tray) return;
  const scenes = [
    ["ring", "The Ring"],
    ["beacons", "The Beacons"],
    ["meadowwalk", "Meadow Walk"],
    ["heart", "Beating Heart"],
    ["blackhole", "Black Hole"],
    ["galaxy", "Spiral Galaxy"],
    ["earth", "Earthrise"],
    ["knot", "Torus Knot"],
    ["stilllife", "Still Life"],
    ["armillary", "Armillary Sphere"],
    ["florence", "Florence"],
    ["butterflies", "Butterflies"],
    ["clouds", "Cloudscape"],
    ["torii", "Torii Path"],
    ["koi", "Koi Pond"],
    ["tide", "Moonlit Tide"],
    ["meadow", "Firefly Meadow"],
    ["rain", "Rainy Window"],
    ["hearth", "Hearth"],
    ["jelly", "Jellyfish Drift"],
    ["aurora", "Aurora Cabin"],
    ["garden", "Contribution Garden"],
    ["image", "Living Image"],
  ];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open library…", click: openLibrary },
    { type: "separator" },
    ...scenes.map(([id, label]) => ({ label, type: "radio", checked: state.scene === id, click: () => setScene(id) })),
    { type: "separator" },
    { label: "Live wallpaper", type: "checkbox", checked: wallWins.length > 0, click: (i) => setWallpaper(i.checked) },
    { label: "Interactive", type: "checkbox", checked: state.settings.interactive !== false, click: (i) => setSettings({ interactive: i.checked }) },
    { label: "Battery saver (24 fps)", type: "checkbox", checked: state.settings.fps === 24, click: (i) => setSettings({ fps: i.checked ? 24 : 60 }) },
    { label: "Start at login", type: "checkbox", checked: getAutostart(), click: (i) => setAutostart(i.checked) },
    { type: "separator" },
    { label: "Quit ASCIIWall", click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function broadcast(except) {
  const s = uiState();
  for (const w of [...wallWins, libraryWin]) if (w && !w.isDestroyed() && w.webContents !== except) w.webContents.send("state", s);
}
function setScene(id) { state.scene = id; saveState(); broadcast(); refreshTray(); }
function setSettings(p) { state.settings = Object.assign({}, state.settings, p); saveState(); broadcast(); refreshTray(); }

// ── autostart ────────────────────────────────────────────────
const linuxAutostart = path.join(os.homedir(), ".config", "autostart", "asciiwall.desktop");
function getAutostart() {
  if (process.platform === "linux") return fs.existsSync(linuxAutostart);
  return app.getLoginItemSettings().openAtLogin;
}
function setAutostart(on) {
  if (process.platform === "linux") {
    if (!on) { try { fs.unlinkSync(linuxAutostart); } catch (e) {} return; }
    const exec = app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${path.join(__dirname, "..")}"`;
    fs.mkdirSync(path.dirname(linuxAutostart), { recursive: true });
    fs.writeFileSync(linuxAutostart, `[Desktop Entry]\nType=Application\nName=ASCIIWall\nComment=Live ASCII wallpaper\nExec=${exec}\nIcon=${ICON}\nX-GNOME-Autostart-enabled=true\n`);
  } else app.setLoginItemSettings({ openAtLogin: on });
}

// ── IPC ──────────────────────────────────────────────────────
ipcMain.handle("state:get", () => uiState());
ipcMain.on("state:set", (e, s) => {
  if (!s) return;
  state.scene = s.scene || state.scene;
  state.settings = s.settings || state.settings;
  saveState();
  broadcast(e.sender);
  refreshTray();
});
ipcMain.handle("wallpaper:toggle", () => setWallpaper(wallWins.length === 0));
ipcMain.handle("wallpaper:status", () => wallWins.length > 0);

// ── boot ─────────────────────────────────────────────────────
app.whenReady().then(async () => {
  loadState();
  if (SMOKE) return smokeTest();
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 22, height: 22 }));
  tray.setToolTip("ASCIIWall");
  tray.on("click", openLibrary);
  refreshTray();
  if (SAFE) { state.wallpaper = false; saveState(); }
  const wantLibrary = SAFE || process.argv.includes("--library") || !state.wallpaper || process.platform === "win32";
  if (state.wallpaper && !SAFE && !process.argv.includes("--no-wallpaper")) startWallpaper();
  // escape hatches that work even when the wallpaper window is in the way
  try {
    globalShortcut.register("CommandOrControl+Alt+W", () => setWallpaper(wallWins.length === 0));
    globalShortcut.register("CommandOrControl+Alt+Q", () => { app.isQuitting = true; app.quit(); });
  } catch (e) { console.error(e); }
  if (wantLibrary) openLibrary();
  const relayout = () => { if (wallWins.length) startWallpaper(); };
  screen.on("display-added", relayout);
  screen.on("display-removed", relayout);
  screen.on("display-metrics-changed", relayout);
  powerMonitor.on("on-battery", () => broadcastFps(30));
  powerMonitor.on("on-ac", () => broadcastFps(state.settings.fps || 60));
});
function broadcastFps(fps) { for (const w of wallWins) if (!w.isDestroyed()) w.webContents.send("state", { settings: Object.assign({}, state.settings, { fps }) }); }

app.on("second-instance", (_e, argv) => {
  if (argv.includes("--safe") || argv.includes("--stop-wallpaper")) setWallpaper(false);
  openLibrary();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => { /* keep living in the tray */ });

// Headless self-check: load the app hidden, confirm the engine booted, print the result.
async function smokeTest() {
  const w = new BrowserWindow({ show: false, width: 800, height: 450, webPreferences: { preload: PRELOAD, contextIsolation: true } });
  await w.loadFile(INDEX, { query: { mode: "wallpaper" } });
  await new Promise((r) => setTimeout(r, 2500));
  const res = await w.webContents.executeJavaScript(`(() => { const a = window.ASCIIWALL_APP; return a ? { ok: true, scene: a.engine.scene.id, cols: a.engine.cols, rows: a.engine.rows, bridge: !!window.asciiwall, scenes: AsciiWall.scenes.length } : { ok: false, fallback: !document.getElementById('fallback').hidden }; })()`);
  console.log("SMOKE", JSON.stringify(res));
  app.exit(res.ok ? 0 : 1);
}