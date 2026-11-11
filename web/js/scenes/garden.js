/* Contribution Garden — a year of GitHub contributions grown as a night garden.
 * Data: data/contributions.json (written by github/garden.mjs), else a demo year. */
(function () {
  const AW = window.AsciiWall;
  AW.gardenDataUrl = AW.gardenDataUrl || "data/contributions.json";

  // fireflies are shared with Firefly Meadow; define them here too so this scene stands alone
  if (!AW.fireflySwarm) {
    AW.fireflySwarm = (n) => Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 1.6, y: Math.random() * 0.7 - 0.35, vx: 0, vy: 0, ph: Math.random() * 10, orbit: 0.08 + Math.random() * 0.22, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 100 }));
    AW.updateFireflies = function (flies, api, t, offset, yRange = [-0.4, 0.42]) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
      flies.forEach((f, i) => {
        let ax = Math.sin(t * 0.7 + f.seed) * 0.08, ay = Math.cos(t * 0.6 + f.seed * 2) * 0.06;
        if (m.present) { const tx = m.px + Math.cos(t * 0.8 * f.dir + f.seed) * f.orbit - f.x, ty = m.py + Math.sin(t * 0.8 * f.dir + f.seed) * f.orbit * 0.8 - f.y; const w = m.on * Math.min(1, 0.25 / (Math.hypot(m.px - f.x, m.py - f.y) + 0.2)); ax += tx * 1.2 * w; ay += ty * 1.2 * w; }
        if (f.x > A / 2 - 0.03) ax -= 0.4; if (f.x < -A / 2 + 0.03) ax += 0.4; if (f.y > yRange[1]) ay -= 0.4; if (f.y < yRange[0]) ay += 0.4;
        f.vx = (f.vx + ax * dt) * Math.exp(-dt * 1.4); f.vy = (f.vy + ay * dt) * Math.exp(-dt * 1.4);
        f.x += f.vx * dt; f.y += f.vy * dt; f.ph += dt;
        const o = (offset + i) * 4; D[o] = f.x; D[o + 1] = f.y; D[o + 2] = 0.25 + Math.pow(0.5 + 0.5 * Math.sin(f.ph * 1.7 + f.seed), 3); D[o + 3] = 1;
      });
    };
  }

  // Where the data comes from, in order: the local server's live GitHub lookup for AW.githubUser,
  // then data/contributions.json (written by the GitHub Action), then a clearly-labelled demo year.
  function emitInfo(info) { AW.gardenInfo = info; window.dispatchEvent(new CustomEvent("asciiwall:garden", { detail: info })); }
  AW.loadGarden = function (apply) {
    const user = (AW.githubUser || "").trim();
    const fromJson = () => fetch(AW.gardenDataUrl).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && d.weeks && !d.demo) { apply(d); emitInfo({ user: d.user, total: total(d), source: "file" }); return true; }
      return false;
    }).catch(() => false);
    if (typeof fetch !== "function") return;
    if (user) {
      emitInfo({ user, loading: true });
      fetch(`/api/contributions?user=${encodeURIComponent(user)}`)
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (ok && j.weeks) { apply(j); emitInfo({ user: j.user, total: total(j), source: "live" }); }
          else throw new Error(j.error || "lookup failed");
        })
        .catch((e) => { fromJson().then((got) => { if (!got) emitInfo({ user, error: /bad username/.test(e.message) ? "that isn't a valid GitHub username" : "couldn't reach GitHub from here — run `npm run serve`", demo: true }); }); });
    } else {
      fromJson().then((got) => { if (!got) emitInfo({ demo: true }); });
    }
  };
  const total = (d) => d.total ?? d.weeks.flat().reduce((a, b) => a + b, 0);

  function demoYear() {
    const weeks = [];
    const start = new Date(); start.setDate(start.getDate() - 52 * 7 - start.getDay());
    let streak = 0;
    for (let w = 0; w < 53; w++) {
      const days = [];
      const busy = 0.5 + 0.5 * Math.sin(w / 6) + (Math.random() - 0.5) * 0.6;
      for (let d = 0; d < 7; d++) {
        const weekend = d === 0 || d === 6;
        streak = Math.random() < 0.15 ? 0 : streak + 1;
        const p = Math.max(0, busy) * (weekend ? 0.35 : 0.85);
        days.push(Math.random() < p ? Math.round(Math.random() * 9 * (0.5 + busy)) + 1 : 0);
      }
      weeks.push(days);
    }
    return { user: "you", demo: true, start: start.toISOString().slice(0, 10), weeks };
  }

  function toTexture(data) {
    const W = 53, H = 7;
    const buf = new Uint8Array(W * H * 4);
    const weeks = data.weeks.slice(-W);
    const flat = weeks.flat().filter((n) => n > 0).sort((a, b) => a - b);
    const q = (f) => flat.length ? flat[Math.min(flat.length - 1, Math.floor(f * flat.length))] : 1;
    const qs = [q(0.25), q(0.5), q(0.75)];
    const max = flat.length ? flat[flat.length - 1] : 1;
    weeks.forEach((days, w) => days.forEach((n, d) => {
      const lvl = n <= 0 ? 0 : n <= qs[0] ? 1 : n <= qs[1] ? 2 : n <= qs[2] ? 3 : 4;
      const i = (d * W + w) * 4;
      buf[i] = Math.round((lvl / 4) * 255);
      buf[i + 1] = Math.round(Math.min(1, n / max) * 255);
      buf[i + 3] = 255;
    }));
    return { width: W, height: H, data: buf, nearest: true };
  }

  AW.registerScene({
    id: "garden",
    name: "Contribution Garden",
    blurb: "A year of your GitHub contributions, grown as a night garden. Each week is a plant and each active day is a flower on it. Hover over a plant to see that week.",
    tags: ["github", "night", "interactive"],
    style: "glyph",
    ramp: "binary",
    bg: "#07080a",
    cell: 6,
    aspect: 1.6,
    glow: 1.1,
    shimmer: 0.03,
    ss: 2,
    edges: 0.35,
    init(api) {
      const st = { flies: AW.fireflySwarm(10), t: 0, data: AW.gardenData || null, tooltip: null };
      const apply = (d) => { st.data = d; AW.gardenData = d; api.setTexture(toTexture(d)); };
      AW.reloadGarden = () => AW.loadGarden(apply);
      if (st.data && !st.data.demo) { apply(st.data); emitInfo(AW.gardenInfo || { user: st.data.user, total: total(st.data) }); }
      else { apply(demoYear()); emitInfo({ demo: true }); }
      AW.loadGarden(apply);
      return st;
    },
    update(st, api) {
      st.t += api.dt;
      AW.updateFireflies(st.flies, api, st.t, 16, [-0.1, 0.45]);
      const m = api.mouse, A = api.aspect;
      st.tooltip = null;
      if (m.present && st.data) {
        const margin = 0.06 * A, dx = (A - 2 * margin) / 53;
        const w = Math.floor((m.px + A / 2 - margin) / dx);
        const weeks = st.data.weeks.slice(-53);
        if (w >= 0 && w < weeks.length && m.py < 0.25 && m.py > -0.42) {
          const total = weeks[w].reduce((a, b) => a + b, 0);
          let label = `week ${w + 1}`;
          if (st.data.start) {
            const d = new Date(st.data.start); d.setDate(d.getDate() + w * 7);
            label = "week of " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          }
          st.tooltip = { x: m.x, y: m.y, text: `${total} contribution${total === 1 ? "" : "s"} · ${label}` };
          api.data[120] = w;
        } else api.data[120] = -10;
      } else api.data[120] = -10;
    },
    frag: /* glsl */ `
    vec3 bloomCol(float lvl, float seed){
      vec3 a[4] = vec3[4](vec3(0.55,0.8,0.5), vec3(0.98,0.55,0.7), vec3(1.0,0.62,0.32), vec3(1.0,0.9,0.55));
      vec3 c = a[int(clamp(lvl*4.0 - 0.5, 0.0, 3.0))];
      return mix(c, vec3(0.65,0.55,1.0), step(0.8, seed)*0.6);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec3 c = mix(vec3(0.02,0.02,0.035), vec3(0.04,0.045,0.08), uv.y);
      vec2 sc = floor(uv*uGrid);
      c += step(0.994, hash21(sc))*(0.5+0.5*sin(t*1.4 + hash21(sc+5.0)*40.0))*vec3(0.55,0.55,0.7)*smoothstep(0.0, 0.3, p.y);
      // moon
      vec2 mp = p - vec2(0.36*A, 0.33);
      if (length(mp) < 0.05) c = vec3(0.85,0.82,0.7)*(0.75 + 0.25*noise(mp*60.0));
      c += vec3(0.25,0.24,0.2)*exp(-length(mp)*9.0)*0.5;

      float ground = -0.3;
      float margin = 0.06*A, dx = (A - 2.0*margin)/53.0;
      float hover = uData[30].x;
      float wi = floor((p.x + A*0.5 - margin)/dx);
      for (int k=-1; k<=1; k++){
        float w = wi + float(k);
        if (w < 0.0 || w > 52.0) continue;
        float sum = 0.0;
        for (int d=0; d<7; d++) sum += texelFetch(uTex, ivec2(int(w), d), 0).r;
        float hgt = 0.03 + 0.42*sqrt(sum/7.0);
        float bx = -A*0.5 + margin + (w + 0.5)*dx;
        float hl = 1.0 - min(abs(w - hover), 1.0);
        float sway = sin(t*0.8 + w*0.22)*0.01*(hgt*4.0);
        vec2 dm = vec2(bx, ground + hgt*0.7) - uMouseP;
        sway += uMouseOn*exp(-dot(dm,dm)/0.006)*sign(dm.x + 1e-4)*0.025;
        float yy = clamp((p.y - ground)/hgt, 0.0, 1.0);
        float sx = bx + sway*yy*yy;
        float aa = 1.0/uGrid.y; float sw_ = max(0.0022, 0.55/uGrid.y);
        if (p.y > ground - 0.01 && p.y < ground + hgt) c = mix(c, mix(vec3(0.18,0.4,0.18), vec3(0.4,0.75,0.35), hl), smoothstep(sw_ + aa, sw_ - aa*0.5, abs(p.x - sx)));
        // leaves
        for (int l=0; l<2; l++){
          float fl = float(l);
          float ly = ground + hgt*(0.18 + fl*0.22);
          if (hgt < 0.08 && l == 1) break;
          float side = fl < 0.5 ? -1.0 : 1.0;
          vec2 lc = vec2(bx + sway*pow((ly-ground)/hgt, 2.0) + side*dx*0.28, ly + 0.006);
          vec2 lq = rot(side*0.6)*(p - lc);
          if (length(lq/vec2(dx*0.32, dx*0.12)) < 1.0) c = vec3(0.2,0.45,0.2)*(0.8 + 0.4*hl);
        }
        // blossoms: one per active day
        for (int d=0; d<7; d++){
          vec4 tx = texelFetch(uTex, ivec2(int(w), d), 0);
          if (tx.r < 0.01) continue;
          float fd = float(d);
          float by = ground + hgt*(0.35 + 0.65*(fd + 1.0)/7.0);
          float bxy = bx + sway*pow((by-ground)/hgt, 2.0) + (mod(fd, 2.0) - 0.5)*dx*0.5;
          float R = dx*(0.2 + tx.r*0.32);
          vec2 q = p - vec2(bxy, by); q.y *= 1.3;
          float a = atan(q.y, q.x);
          float pr = R*(0.6 + 0.4*abs(cos(a*2.5 + w)));
          float cov = smoothstep(pr + aa, pr - aa, length(q));
          if (cov > 0.0) {
            vec3 bc = bloomCol(tx.r, hash21(vec2(w, fd)));
            bc *= 0.7 + 0.4*smoothstep(pr, 0.0, length(q)) + hl*0.35;
            bc = mix(bc, vec3(1.0,0.85,0.4), smoothstep(R*0.3 + aa, R*0.3 - aa, length(q)));
            c = mix(c, bc, cov);
          }
        }
      }
      // ground
      if (p.y < ground) {
        c = vec3(0.05,0.07,0.04)*(0.6 + 0.6*noise(p*vec2(90.0, 40.0)));
        if (p.y > ground - 0.015) c += vec3(0.08,0.16,0.07)*step(0.45, noise(p*vec2(200.0, 20.0)));
      }
      // fireflies
      for (int i=16; i<26; i++){
        vec4 f = uData[i];
        if (f.w < 0.5) continue;
        vec2 d = (p - f.xy)*REF;
        c += vec3(1.0,0.9,0.45)*exp(-dot(d,d)*2.2)*f.z*1.1 + vec3(0.4,0.36,0.1)*exp(-dot(d,d)*0.4)*f.z*0.06;
      }
      return shade(c);
    }
    `,
  });
})();
