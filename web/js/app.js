/* ASCIIWall — app shell: library, settings, dock, clock, wallpaper/embed modes, desktop bridge. */
(async function () {
  const AW = window.AsciiWall;
  const $ = (s) => document.querySelector(s);
  const KEY = "asciiwall:v1";
  const params = new URLSearchParams(location.search);
  const MODE = window.ASCIIWALL_MODE || params.get("mode") || "app"; // app | wallpaper | embed
  const bridge = window.asciiwall || null; // provided by the Electron preload
  document.body.classList.add(MODE);

  const HINTS = {
    ring: "bring your cursor near to wake the script · drag to turn",
    beacons: "tap to light the beacons · move to look along the range",
    meadowwalk: "look around · hold to stand still · tap for a gust",
    stilllife: "your cursor carries the candle",
    armillary: "drag to orbit · tap to spin the rings",
    florence: "move to set the sun · swallows follow · tap for bells",
    heart: "drag to turn · hover quickens it · tap for a hard beat",
    blackhole: "drag to orbit · tap for a flare",
    galaxy: "drag to orbit · tap for a supernova",
    earth: "drag to spin · your cursor is the sun",
    knot: "drag to turn · tap to shift colour",
    butterflies: "they follow you · tap one to shatter it",
    clouds: "part the clouds · tap for lightning",
    torii: "leaves swirl around you · tap the sea",
    koi: "hover to attract · tap to feed · swipe to scare",
    tide: "sweep to leave a wake · tap to splash",
    meadow: "fireflies follow you · flowers lean away",
    rain: "wipe the fogged glass",
    hearth: "move to make wind · tap for sparks",
    jelly: "they drift toward you · tap to nudge",
    aurora: "the aurora follows you · touch the lake",
    garden: "hover a plant to see its week · set your username in tune",
    image: "drop or paste any image",
  };
  const EXTRA_DEFAULTS = { clock: false, cycle: false, githubUser: "" };

  // ── state ──────────────────────────────────────────
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  let saved = load();
  if (bridge && bridge.getState) { try { saved = (await bridge.getState()) || saved; } catch (e) { /* ignore */ } }
  const state = {
    scene: saved.scene || "koi",
    settings: Object.assign({}, AW.DEFAULT_SETTINGS, EXTRA_DEFAULTS, saved.settings || {}),
  };
  if (params.get("scene")) state.scene = params.get("scene");
  for (const k of Object.keys(state.settings)) {
    if (!params.has(k)) continue;
    const v = params.get(k), cur = state.settings[k];
    state.settings[k] = typeof cur === "number" ? parseFloat(v) : typeof cur === "boolean" ? v !== "0" && v !== "false" : v;
  }
  if (params.get("ui") === "0") document.body.classList.add("hide-ui");

  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
    if (bridge && MODE !== "wallpaper" && bridge.setState) bridge.setState(JSON.parse(JSON.stringify(state)));
  };

  AW.githubUser = state.settings.githubUser || "";

  // ── engine ─────────────────────────────────────────
  let engine;
  try {
    engine = new AW.Engine($("#wall"), { scene: state.scene, settings: state.settings });
  } catch (e) {
    console.error(e);
    $("#fallback").hidden = false;
    $("#dock").hidden = true;
    return;
  }
  engine.start();
  window.ASCIIWALL_APP = { engine, state };

  const sceneIndex = () => Math.max(0, AW.scenes.findIndex((s) => s.id === engine.scene.id));
  function go(id) {
    if (!AW.scenes.find((s) => s.id === id)) return;
    state.scene = id;
    engine.setScene(id);
    save();
    renderNow(AW.getScene(id));
    markActive();
  }
  const step = (d) => go(AW.scenes[(sceneIndex() + d + AW.scenes.length) % AW.scenes.length].id);

  function renderNow(sc) {
    $("#sceneName").textContent = sc.name;
    $("#sceneHint").textContent = HINTS[sc.id] || sc.tags.join(" · ");
    $("#imageBtn").hidden = !sc.acceptsImage;
  }
  renderNow(engine.scene);
  engine.on("scene", renderNow);

  function applySettings(partial) {
    Object.assign(state.settings, partial);
    engine.updateSettings(partial);
    syncClock();
  }

  // ── idle / UI visibility ───────────────────────────
  let idleTimer;
  const panelsOpen = () => !$("#library").hidden || !$("#settings").hidden;
  function wake() {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!panelsOpen()) document.body.classList.add("idle"); }, 2800);
  }
  let lastClient = [0, 0];
  window.addEventListener("pointermove", (e) => { lastClient = [e.clientX, e.clientY]; wake(); }, { passive: true });
  window.addEventListener("pointerdown", wake, { passive: true });
  wake();

  // ── dock actions ───────────────────────────────────
  const actions = {
    prev: () => step(-1),
    next: () => step(1),
    library: () => togglePanel("library"),
    settings: () => togglePanel("settings"),
    fullscreen: () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    },
    image: () => $("#file").click(),
    wallpaper: async () => {
      if (!bridge) return;
      const on = await bridge.toggleWallpaper();
      setWallpaperBtn(on);
      toast(on ? "wallpaper is live on your desktop" : "wallpaper stopped");
    },
    close: () => closePanels(),
    reset: () => {
      const def = Object.assign({}, AW.DEFAULT_SETTINGS, EXTRA_DEFAULTS);
      applySettings(def);
      fillSettings();
      save();
    },
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b && actions[b.dataset.act]) { e.preventDefault(); actions[b.dataset.act](); }
  });

  function togglePanel(id) {
    const el = $("#" + id), open = el.hidden;
    closePanels();
    el.hidden = !open;
    if (open && id === "library") buildLibrary();
    if (open && id === "settings") fillSettings();
    wake();
  }
  function closePanels() { $("#library").hidden = true; $("#settings").hidden = true; }

  // ── library ────────────────────────────────────────
  let built = false;
  const thumbs = {};
  function buildLibrary() {
    if (built) { markActive(); return; }
    built = true;
    const grid = $("#grid");
    for (const sc of AW.scenes) {
      const card = document.createElement("button");
      card.className = "card";
      card.dataset.id = sc.id;
      card.innerHTML = `<div class="thumb loading"></div><div class="meta"><div class="title"></div><div class="blurb"></div><div class="tags"></div></div>`;
      card.querySelector(".title").textContent = sc.name;
      card.querySelector(".blurb").textContent = sc.blurb;
      card.querySelector(".tags").innerHTML = sc.tags.map((t) => `<span>${t}</span>`).join("");
      card.addEventListener("click", () => { go(sc.id); closePanels(); });
      grid.appendChild(card);
    }
    markActive();
    makeThumbs();
  }
  function markActive() {
    document.querySelectorAll(".card").forEach((c) => c.classList.toggle("active", c.dataset.id === state.scene));
  }
  async function makeThumbs() {
    const c = document.createElement("canvas");
    let te;
    try {
      te = new AW.Engine(c, { size: [480, 270], preserve: true, interactive: false, cellScale: 0.72, settings: Object.assign({}, state.settings, { interactive: false }) });
    } catch (e) { return; }
    for (const sc of AW.scenes) {
      await new Promise((r) => setTimeout(r, 30));
      try {
        te.setScene(sc.id, { instant: true });
        te.warmup(3, 20);
        te.render();
        thumbs[sc.id] = c.toDataURL("image/jpeg", 0.85);
        const el = document.querySelector(`.card[data-id="${sc.id}"] .thumb`);
        if (el) { el.style.backgroundImage = `url(${thumbs[sc.id]})`; el.classList.remove("loading"); }
      } catch (e) { console.warn("thumb failed", sc.id, e); }
    }
    te.destroy();
  }

  // ── settings ───────────────────────────────────────
  const form = $("#settings");
  const rampSel = form.querySelector('[name="ramp"]');
  rampSel.innerHTML = `<option value="auto">scene default</option>` +
    Object.entries(AW.RAMPS).map(([k, v]) => `<option value="${k}">${k}  ${v.trim().slice(0, 9)}</option>`).join("");
  form.querySelector('[name="tint"]').innerHTML = Object.keys(AW.TINTS).map((k) => `<option value="${k}">${k === "none" ? "natural colour" : k}</option>`).join("");

  function fillSettings() {
    form.querySelectorAll("[name]").forEach((el) => {
      const v = state.settings[el.name];
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v == null ? "" : String(v);
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = Number(v).toFixed(2).replace(/\.?0+$/, "") || "0";
    });
  }
  form.addEventListener("change", (e) => {
    const el = e.target;
    if (el.name !== "githubUser") return;
    const v = el.value.trim().replace(/^@/, "").replace(/^https?:\/\/github\.com\//, "").replace(/\/.*$/, "");
    el.value = v;
    applySettings({ githubUser: v });
    AW.githubUser = v;
    save();
    if (engine.scene.id === "garden" && AW.reloadGarden) AW.reloadGarden();
    else if (v) go("garden");
  });
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.name || el.type === "text") return;
    const cur = state.settings[el.name];
    const v = el.type === "checkbox" ? el.checked : typeof cur === "number" ? parseFloat(el.value) : el.value;
    applySettings({ [el.name]: v });
    const out = el.parentElement.querySelector("output");
    if (out) out.textContent = String(v);
    save();
  });

  // ── clock ──────────────────────────────────────────
  let clockTimer;
  function syncClock() {
    const on = !!state.settings.clock && MODE !== "embed";
    $("#clock").hidden = !on;
    clearInterval(clockTimer);
    if (!on) return;
    const tick = () => {
      const d = new Date();
      $("#clock .time").textContent = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      $("#clock .date").textContent = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  syncClock();

  // ── slow scene cycling ─────────────────────────────
  setInterval(() => { if (state.settings.cycle && !panelsOpen()) step(1); }, 20 * 60 * 1000);

  // ── keyboard ───────────────────────────────────────
  window.addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "arrowright") step(1);
    else if (k === "arrowleft") step(-1);
    else if (k === "l") togglePanel("library");
    else if (k === "s") togglePanel("settings");
    else if (k === "f") actions.fullscreen();
    else if (k === "h") document.body.classList.toggle("hide-ui");
    else if (k === "escape") closePanels();
    else if (k === " ") { engine.running ? engine.stop() : engine.start(); toast(engine.running ? "playing" : "paused"); e.preventDefault(); }
    else return;
    wake();
  });

  // ── images: pick, drop, paste ──────────────────────
  const useImage = (file) => AW.setUserImage(file, engine).then(() => { if (state.scene !== "image") go("image"); toast("your image is now ASCII"); }).catch(() => toast("couldn't read that image"));
  $("#file").addEventListener("change", (e) => { if (e.target.files[0]) useImage(e.target.files[0]); e.target.value = ""; });
  window.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dragging"); });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
  window.addEventListener("drop", (e) => {
    e.preventDefault(); document.body.classList.remove("dragging");
    const f = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (f) useImage(f);
  });
  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) useImage(item.getAsFile());
  });

  // ── tooltip (scenes may expose state.tooltip) ──────
  const tip = $("#tooltip");
  setInterval(() => {
    const t = engine.state && engine.state.tooltip;
    if (!t) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = t.text;
    tip.style.left = lastClient[0] + "px";
    tip.style.top = lastClient[1] + "px";
  }, 80);

  // ── contribution garden caption ────────────────────
  const cap = $("#gardenCap");
  function renderCap(info) {
    info = info || AW.gardenInfo || {};
    if (engine.scene.id !== "garden") { cap.hidden = true; return; }
    cap.hidden = false;
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    if (info.loading) cap.innerHTML = `<b>@${esc(info.user)}</b>growing your garden…`;
    else if (info.error) cap.innerHTML = `<b>demo garden</b><span class="warn">@${esc(info.user)}: ${esc(info.error)}</span>`;
    else if (info.demo) cap.innerHTML = `<b>demo garden</b>these flowers are made up. add your GitHub username to grow yours<br><button class="act" data-act="settings">add username</button>`;
    else cap.innerHTML = `<b>@${esc(info.user || "you")}</b>${Number(info.total || 0).toLocaleString()} contributions in the last year · one plant per week`;
  }
  window.addEventListener("asciiwall:garden", (e) => renderCap(e.detail));
  engine.on("scene", () => renderCap());
  renderCap();

  // ── toast ──────────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2200);
  }

  // ── desktop bridge (Electron) ──────────────────────
  function setWallpaperBtn(on) { const b = $("#wallpaperBtn"); b.textContent = on ? "wallpaper: on" : "set wallpaper"; b.classList.toggle("on", !!on); }
  function applyRemote(s) {
    if (!s) return;
    if (s.settings) { applySettings(s.settings); }
    if (s.scene && s.scene !== engine.scene.id) { state.scene = s.scene; engine.setScene(s.scene); }
  }
  if (bridge) {
    if (MODE !== "wallpaper") {
      $("#wallpaperBtn").hidden = false;
      bridge.isWallpaperOn && bridge.isWallpaperOn().then(setWallpaperBtn);
    }
    bridge.onState && bridge.onState(applyRemote);
    bridge.onCursor && bridge.onCursor((c) => engine.pointer(c.x, c.y, c.inside));
    bridge.onClick && bridge.onClick((c) => engine.click(c.x, c.y));
  }
  // sync between browser tabs / a wallpaper host on the same origin
  window.addEventListener("storage", (e) => { if (e.key === KEY && MODE === "wallpaper") { try { applyRemote(JSON.parse(e.newValue)); } catch (err) {} } });

  if (params.get("open") === "library" || params.get("open") === "settings") togglePanel(params.get("open"));

  // ── PWA ────────────────────────────────────────────
  if ("serviceWorker" in navigator && /^https?:/.test(location.protocol) && MODE === "app" && !bridge) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
