/* Koi Pond — detailed koi (kohaku, sanke, showa, ogon, asagi, tancho, chagoi, kujaku) with scales,
 * translucent rayed fins, whiskers, caustic light and shadows, over a pebble floor with weeds;
 * lily pads, lotus and petals on the surface.
 * Hover: koi come to look. Tap: drop food, they race for it. Fast swipe: they bolt. */
(function () {
  const AW = window.AsciiWall;
  const N = 8, SEGS = 10, MAXFOOD = 8, MAXB = 0.2;

  AW.registerScene({
    id: "koi",
    name: "Koi Pond",
    blurb: "Eight kinds of koi glide over a pebble floor beneath lily pads and lotus. They come to look at your cursor. Tap to drop food and they'll race for it; swipe fast and they bolt.",
    tags: ["water", "calm", "interactive"],
    style: "glyph",
    ramp: "koi",
    bg: "#04110f",
    cell: 5,
    aspect: 1.6,
    ss: 2,
    glow: 0.4,
    underlay: 0.5,
    edges: 0.45,
    shimmer: 0.03,
    trailDecay: 0.97,
    ripple: { damp: 0.978, strength: 0.7, radius: 0.016, drop: 1.6 },

    init(api) {
      const A = api.aspect;
      const pals = [0, 1, 2, 3, 4, 5, 6, 7];
      const fish = pals.map((pal) => {
        const size = 0.25 + Math.random() * 0.15;
        const x = (Math.random() - 0.5) * A * 0.75, y = (Math.random() - 0.5) * 0.7;
        const ang = Math.random() * Math.PI * 2;
        const spine = Array.from({ length: SEGS }, (_, k) => ({ x: x - (Math.cos(ang) * size * k) / 9, y: y - (Math.sin(ang) * size * k) / 9 }));
        return { x, y, ang, spd: 0.05, size, pal, seed: Math.random(), depth: Math.random() * 0.6, spine, phase: Math.random() * 6, boost: 0, fx: 0, fy: 0 };
      });
      fish.sort((a, b) => b.depth - a.depth); // deepest drawn first
      return { fish, food: [], t: Math.random() * 100 };
    },

    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data, eng = api.engine;
      st.t += dt;
      // tap: drop a few pellets
      for (const c of api.clicks) {
        for (let k = 0; k < 4 && st.food.length < MAXFOOD; k++) {
          st.food.push({ x: c.px + (Math.random() - 0.5) * 0.05, y: c.py + (Math.random() - 0.5) * 0.05, life: 1, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02, bob: Math.random() * 6 });
        }
      }
      for (const p of st.food) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.vy *= 0.99; p.life -= dt / 40; p.bob += dt; }
      st.food = st.food.filter((p) => p.life > 0);

      // a fast swipe near the fish startles them
      const scare = m.present && m.speed > 1.6;

      st.fish.forEach((f) => {
        let sx = Math.cos(f.ang), sy = Math.sin(f.ang);
        const wa = f.ang + Math.sin(st.t * 0.37 + f.seed * 10) * 1.2 + Math.sin(st.t * 0.11 + f.seed * 31) * 0.8;
        sx += Math.cos(wa) * 0.7; sy += Math.sin(wa) * 0.7;
        const mx = A / 2 - 0.12, my = 0.5 - 0.12;
        if (f.x > mx) sx -= (f.x - mx) * 14; if (f.x < -mx) sx += (-mx - f.x) * 14;
        if (f.y > my) sy -= (f.y - my) * 14; if (f.y < -my) sy += (-my - f.y) * 14;
        for (const g of st.fish) {
          if (g === f) continue;
          const dx = f.x - g.x, dy = f.y - g.y, d = Math.hypot(dx, dy) + 1e-4;
          const r = (f.size + g.size) * 0.42;
          if (d < r) { sx += (dx / d) * (1 - d / r) * 2.0; sy += (dy / d) * (1 - d / r) * 2.0; }
        }
        let curious = 0, hungry = 0;
        // food: head for the nearest pellet, eat it on contact
        let best = null, bd = 0.8;
        for (const p of st.food) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; best = p; } }
        if (best) {
          const dx = best.x - f.x, dy = best.y - f.y, d = bd + 1e-4;
          sx += (dx / d) * 3.5; sy += (dy / d) * 3.5; hungry = 1;
          if (d < f.size * 0.09) {
            best.life = 0;
            if (eng && eng.dropQueue) eng.dropQueue.push({ x: best.x / A + 0.5, y: best.y + 0.5 });
          }
        } else if (m.present) {
          const dx = m.px - f.x, dy = m.py - f.y, d = Math.hypot(dx, dy) + 1e-4;
          if (d < 0.55 && d > 0.07) { const w = (1 - d / 0.55) * 2.0 * m.on; sx += (dx / d) * w; sy += (dy / d) * w; curious = 1 - d / 0.55; }
          else if (d <= 0.07) { sx -= (dx / d) * 1.2; sy -= (dy / d) * 1.2; curious = 1; }
        }
        if (scare) {
          const d = Math.hypot(f.x - m.px, f.y - m.py);
          if (d < 0.3) { f.boost = Math.max(f.boost, 1 - d / 0.4); f.fx = m.px; f.fy = m.py; }
        }
        if (f.boost > 0.01) {
          const dx = f.x - f.fx, dy = f.y - f.fy, d = Math.hypot(dx, dy) + 1e-4;
          sx += (dx / d) * 6 * f.boost; sy += (dy / d) * 6 * f.boost;
        }
        const desired = Math.atan2(sy, sx);
        let diff = desired - f.ang;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const maxTurn = (1.0 + f.boost * 2.2 + hungry * 0.8) * dt;
        f.ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
        const target = 0.05 + 0.02 * Math.sin(st.t * 0.5 + f.seed * 7) + f.boost * 0.45 + hungry * 0.06 - curious * 0.025;
        f.spd += (target - f.spd) * Math.min(1, dt * 2.5);
        f.boost *= Math.exp(-dt * 1.6);
        f.x += Math.cos(f.ang) * f.spd * dt;
        f.y += Math.sin(f.ang) * f.spd * dt;
        f.phase += dt * (2.2 + f.spd * 45);
        const s = f.spine;
        s[0].x = f.x; s[0].y = f.y;
        const seg = f.size / 9;
        // follow-the-leader with a bend limit at every joint, so the body can curve but never fold
        // back through itself (9 joints x MAXB keeps the whole fish under ~a U-turn).
        let prevA = f.ang + Math.PI;                    // direction from the head back toward the tail
        for (let k = 1; k < SEGS; k++) {
          let a = Math.atan2(s[k].y - s[k - 1].y, s[k].x - s[k - 1].x);
          const d = Math.atan2(Math.sin(a - prevA), Math.cos(a - prevA));
          a = prevA + Math.max(-MAXB, Math.min(MAXB, d));
          s[k].x = s[k - 1].x + Math.cos(a) * seg;
          s[k].y = s[k - 1].y + Math.sin(a) * seg;
          prevA = a;
        }
      });
      // upload: shallowest drawn last; the displayed spine gets a travelling swim wave
      st.fish.forEach((f, i) => {
        const s = f.spine, base = i * 24;
        for (let k = 0; k < SEGS; k++) {
          const a = s[Math.max(0, k - 1)], b = s[Math.min(SEGS - 1, k + 1)];
          const tx = a.x - b.x, ty = a.y - b.y, tl = Math.hypot(tx, ty) + 1e-6;
          const amp = f.size * 0.026 * Math.pow(k / 9, 1.6) + f.size * 0.004;
          const w = Math.sin(f.phase - k * 0.55) * amp;
          D[base + k * 2] = s[k].x + (-ty / tl) * w;
          D[base + k * 2 + 1] = s[k].y + (tx / tl) * w;
        }
        D[base + 20] = f.size; D[base + 21] = f.pal; D[base + 22] = f.seed; D[base + 23] = f.depth;
      });
      for (let k = 0; k < MAXFOOD; k++) {
        const p = st.food[k], o = 192 + k * 4;
        D[o] = p ? p.x : 0; D[o + 1] = p ? p.y : 0; D[o + 2] = p ? Math.min(1, p.life * 4) : 0; D[o + 3] = p ? p.bob : 0;
      }
    },

    frag: /* glsl */ `
    vec2 sp(int f, int i){ vec4 v = uData[f*6 + i/2]; return (i%2==0) ? v.xy : v.zw; }

    float bodyW(float t){
      float head = sqrt(clamp(t/0.13, 0.0, 1.0));
      float tail = 1.0 - 0.74*smoothstep(0.34, 0.98, t);
      return head*tail*0.16;
    }

    float caustic(vec2 p, float t){
      vec2 i = p; float c = 1.0; float inten = 0.005;
      for (int n=0; n<4; n++){
        float tt = t*(1.0 - (3.5/float(n+1)));
        i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
        c += 1.0/length(vec2(p.x/(sin(i.x + tt)/inten), p.y/(cos(i.y + tt)/inten)));
      }
      c /= 4.0;
      c = clamp(1.17 - pow(c, 1.4), 0.0, 1.0);
      return pow(c, 7.0);
    }

    vec3 WHITE = vec3(0.96,0.94,0.89), RED = vec3(0.9,0.2,0.07), ORANGE = vec3(1.0,0.52,0.12),
         BLACK = vec3(0.04,0.04,0.06), GOLD = vec3(1.0,0.76,0.28), BLUE = vec3(0.42,0.55,0.68), BRONZE = vec3(0.55,0.36,0.2);

    // pattern in body coords: t along (0 snout..1 tail), v across (-1..1), seed
    vec3 koiColor(int pal, float t, float v, float seed, out float metal, out float retic){
      metal = 0.0; retic = 0.0;
      float n  = noise(vec2(t*5.5 + seed*13.0, v*1.3 + seed*7.0));
      float n2 = noise(vec2(t*9.0 - seed*5.0, v*2.2 + 3.0));
      float n3 = noise(vec2(t*16.0 + seed*3.0, v*3.5 - seed));
      if (pal == 0) return mix(WHITE, RED, smoothstep(0.47, 0.53, n + 0.15*smoothstep(0.25, 0.0, t)));                      // kohaku
      if (pal == 1) { vec3 c = mix(WHITE, RED, smoothstep(0.48, 0.54, n)); return mix(c, BLACK, smoothstep(0.7, 0.74, n3)*step(0.18, t)); } // sanke
      if (pal == 2) { vec3 c = mix(BLACK, RED, smoothstep(0.5, 0.56, n)); return mix(c, WHITE, smoothstep(0.58, 0.64, n2)); }          // showa
      if (pal == 3) { metal = 1.0; return mix(GOLD, vec3(1.0,0.92,0.62), n*0.6); }                                          // ogon
      if (pal == 4) { retic = 1.0; vec3 c = mix(BLUE, BLUE*0.75, n2); return mix(c, ORANGE, smoothstep(0.62, 0.9, abs(v)) + smoothstep(0.1, 0.0, t)*0.0); } // asagi
      if (pal == 5) return mix(WHITE, RED, 1.0 - smoothstep(0.075, 0.095, length(vec2((t - 0.11)*1.2, v*0.13))));          // tancho
      if (pal == 6) { retic = 1.0; metal = 0.4; return mix(BRONZE, BRONZE*1.3, n); }                                       // chagoi
      metal = 0.8; retic = 0.6; return mix(vec3(0.9,0.9,0.92), ORANGE, smoothstep(0.5, 0.58, n));                           // kujaku
    }

    vec3 finTint(int pal){
      if (pal == 3) return vec3(1.0,0.85,0.5);
      if (pal == 4 || pal == 6) return vec3(1.0,0.6,0.3);
      if (pal == 2) return vec3(0.35,0.3,0.35);
      return vec3(0.95,0.92,0.9);
    }

    // composite one koi over 'col'. 'shadow' accumulates the floor shadow.
    void koi(int f, vec2 p, inout vec3 col, inout float dens, inout float shadow, float caus){
      vec4 info = uData[f*6+5];
      float size = info.x;
      if (size <= 0.0) return;
      vec2 head = sp(f, 0), mid = sp(f, 5);
      // shadow on the floor (offset down-right)
      vec2 ps = p - vec2(0.022, -0.03)*(1.0 + info.w);
      if (length(ps - mid) < size*0.9) {
        for (int i=0; i<10; i+=2){ float t = float(i)/9.0; shadow = max(shadow, 1.0 - smoothstep(0.0, bodyW(t)*size*1.7, length(ps - sp(f,i)))); }
      }
      if (length(p - mid) > size*0.95) return;
      int pal = int(info.y + 0.5);
      float seed = info.z;
      vec3 ftint = finTint(pal);
      float aa = 1.2/uGrid.y;

      // closest point on the spine
      float best = 1e9, bt = 0.0, bv = 0.0; vec2 bperp = vec2(0.0), bdir = vec2(1.0, 0.0);
      for (int i=0; i<9; i++){
        vec2 a = sp(f,i), b = sp(f,i+1);
        vec2 ba = b - a; float L = max(length(ba), 1e-5);
        float h = clamp(dot(p - a, ba)/(L*L), 0.0, 1.0);
        vec2 q = a + ba*h;
        float t = (float(i) + h)/9.0;
        float w = bodyW(t)*size;
        vec2 dir = ba/L;
        float dd = length(p - q) - w;
        if (dd < best) { best = dd; bt = t; bperp = vec2(-dir.y, dir.x); bdir = dir; bv = dot(p - q, bperp)/max(w, 1e-4); }
      }

      // ── tail fin (translucent, flowing, forked, rayed)
      vec2 e = sp(f,9), e0 = sp(f,7);
      vec2 d = normalize(e - e0);
      d = rot(sin(uTime*2.6 + seed*20.0)*0.22)*d;
      vec2 tv = p - e;
      float ta = dot(tv, d), tb = dot(tv, vec2(-d.y, d.x));
      float L = size*0.27;
      tb += sin(ta/size*16.0 - uTime*4.5 - seed*9.0)*ta*0.22;
      float hw = ta*0.95 + size*0.02;
      float edge = L*(0.66 + 0.4*smoothstep(0.0, 1.0, abs(tb)/(L*0.85)));
      float tail = step(-0.005*size, ta)*smoothstep(hw + aa, hw - aa, abs(tb))*smoothstep(edge + aa, edge - aa, ta);
      if (tail > 0.0) {
        float ang = atan(tb, ta + size*0.05);
        float rays = smoothstep(0.75, 1.0, abs(sin(ang*13.0)));
        float rim = smoothstep(edge*0.8, edge, ta);
        vec3 fc = mix(ftint, ftint*0.55, rays*0.5) + rim*0.15;
        float a = tail*(0.62 - 0.25*ta/L);
        col = mix(col, fc*(0.85 + caus*0.4), a);
        dens = mix(dens, 0.45, a);
      }

      // ── pectoral fins (fans that row slowly)
      vec2 h0 = sp(f,0), h1 = sp(f,1), h2 = sp(f,2);
      vec2 hd = normalize(h0 - h2);
      vec2 hp = vec2(-hd.y, hd.x);
      for (int s=-1; s<=1; s+=2){
        float fs = float(s);
        float flap = 0.95 + 0.35*sin(uTime*2.2 + seed*7.0 + fs*0.8);
        vec2 root = sp(f,2) + hp*fs*bodyW(0.22)*size*0.75;
        vec2 fd = normalize(hp*fs*cos(flap) - hd*sin(flap));
        vec2 lq = p - root;
        vec2 l2 = vec2(dot(lq, fd), dot(lq, vec2(-fd.y, fd.x)));
        float FL = size*0.17;
        float shape = length(vec2(l2.x, l2.y*1.5))/FL;
        float inside = step(0.0, l2.x)*smoothstep(1.0 + aa/FL, 1.0 - aa/FL, shape)*step(abs(l2.y), l2.x*0.75 + FL*0.12);
        if (inside > 0.0) {
          float ang = atan(l2.y, l2.x);
          float rays = smoothstep(0.7, 1.0, abs(sin(ang*16.0)));
          vec3 fc = mix(ftint, ftint*0.6, rays*0.5) + smoothstep(0.75, 1.0, shape)*0.12;
          float a = inside*0.6;
          col = mix(col, fc*(0.85 + caus*0.4), a);
          dens = mix(dens, 0.45, a);
        }
      }

      // ── body
      if (best < aa) {
        float cover = smoothstep(aa, -aa, best);
        float metal, retic;
        vec3 c = koiColor(pal, bt, bv, seed, metal, retic);
        // scales: staggered rows of crescents
        float sc = size*0.022;
        vec2 su = vec2(bt*size/sc, bv*bodyW(bt)*size/sc);
        su.x += 0.5*mod(floor(su.y), 2.0);
        vec2 sf = fract(su) - vec2(0.3, 0.5);
        float scale = smoothstep(0.42, 0.5, length(sf))*step(0.12, bt);
        c *= 1.0 - scale*(0.08 + retic*0.3);
        if (retic > 0.0) c = mix(c, c*1.25 + 0.05, (1.0 - scale)*retic*0.3*(1.0 - smoothstep(0.5, 0.9, abs(bv))));
        // dorsal fin along the back
        float dorsal = smoothstep(0.16, 0.05, abs(bv))*smoothstep(0.26, 0.32, bt)*smoothstep(0.66, 0.6, bt);
        c = mix(c, c*0.62 + ftint*0.08, dorsal*(0.6 + 0.4*smoothstep(0.7, 1.0, abs(sin(bt*120.0)))));
        // head: a little smoother and paler, gill line
        float gill = smoothstep(0.012, 0.0, abs(bt - 0.16 - 0.04*bv*bv))*smoothstep(1.0, 0.4, abs(bv));
        c *= 1.0 - gill*0.25;
        // 3D shading: rounded back, light from the upper left, specular ridge
        vec3 n = normalize(vec3(bperp*bv*0.95, sqrt(max(1.0 - bv*bv, 0.02))));
        vec3 Ld = normalize(vec3(-0.45, 0.55, 0.75));
        float diff = clamp(dot(n, Ld), 0.0, 1.0);
        float spec = pow(clamp(dot(reflect(-Ld, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 18.0 + metal*20.0);
        c *= 0.38 + 0.75*diff;
        c += vec3(1.0,0.97,0.9)*spec*(0.35 + metal*0.9);
        c += c*caus*0.55;                                                    // dappled light
        c *= 1.0 - 0.25*smoothstep(0.75, 1.0, abs(bv));                       // darker flanks
        // eyes
        float er = max(size*0.016, 0.7/uGrid.y);
        for (int s=-1; s<=1; s+=2){
          vec2 ep = h0 - hd*size*0.055 + hp*float(s)*bodyW(0.06)*size*0.72;
          float ed = length(p - ep);
          if (ed < er) c = mix(vec3(0.02), vec3(0.85), smoothstep(er*0.5, er*0.2, length(p - ep - vec2(-0.3, 0.3)*er)));
        }
        col = mix(col, c, cover);
        dens = mix(dens, clamp(0.5 + luma(c)*0.5, 0.45, 1.0), cover);
      }
      // ── whiskers (barbels)
      for (int s=-1; s<=1; s+=2){
        float fs = float(s);
        vec2 b0 = h0 - hd*size*0.01 + hp*fs*size*0.012;
        vec2 b1 = b0 + hd*size*0.025 + hp*fs*size*(0.03 + 0.008*sin(uTime*3.0 + fs + seed*5.0));
        float bd = sdSeg(p, b0, b1);
        if (bd < size*0.0045) { col = mix(col, ftint*0.8, 0.8); }
      }
      // depth: deeper fish sink into the green water
      // (applied by the caller via the 'depth' parameter in the alpha blend above would need layering; keep cheap)
    }

    vec4 lily(vec2 p, vec2 c, float r, float seed, bool flower, inout float shadowOut){
      vec2 q = rot(uTime*0.025*(seed - 0.5) + seed*6.0)*(p - c);
      float d = length(q);
      float a = atan(q.y, q.x);
      float rr = r*(1.0 + 0.012*sin(uTime*0.7 + seed*10.0) + 0.03*sin(a*5.0 + seed*20.0)*0.3);
      // shadow cast on the floor
      if (length(p - c - vec2(0.02, -0.028)) < rr) shadowOut = max(shadowOut, 0.6);
      if (d > rr) return vec4(0.0);
      if (abs(a) < 0.24 && d > rr*0.06) return vec4(0.0);   // notch
      vec3 g = mix(vec3(0.12,0.38,0.12), vec3(0.34,0.62,0.2), smoothstep(rr, 0.0, d)*0.7 + 0.3*noise(q*40.0));
      float vein = smoothstep(0.07, 0.0, abs(sin(a*9.0 + d/rr*0.6)))*step(rr*0.12, d);
      g = mix(g, vec3(0.55,0.75,0.35), vein*0.45);
      float rim = smoothstep(rr*0.86, rr, d);
      g = mix(g, vec3(0.5,0.22,0.15), rim*0.55);                       // reddish curled rim
      g += vec3(0.5,0.55,0.4)*pow(max(0.0, 1.0 - length(q/rr - vec2(-0.35, 0.35))*1.6), 3.0)*0.5; // sheen
      for (int i=0; i<3; i++){                                          // water droplets
        vec2 dp = vec2(hash11(seed*9.0 + float(i)) - 0.5, hash11(seed*5.0 + float(i)*3.0) - 0.5)*rr*1.1;
        float dd = length(q - dp);
        if (dd < rr*0.06) g = mix(g*0.7, vec3(0.95), smoothstep(rr*0.035, 0.0, length(q - dp - vec2(-0.3, 0.3)*rr*0.04)));
      }
      if (flower) {
        float pr = rr*0.5;
        vec2 fq = q*1.0;
        float fd = length(fq);
        float fa = atan(fq.y, fq.x);
        // two rings of petals, outer pink with darker tips, inner paler
        float outer = pr*(0.55 + 0.45*pow(abs(cos(fa*4.0)), 0.6));
        float inner = pr*0.68*(0.55 + 0.45*pow(abs(cos(fa*4.0 + 0.78)), 0.6));
        if (fd < outer) {
          vec3 pc = mix(vec3(1.0,0.86,0.9), vec3(0.92,0.36,0.58), smoothstep(outer*0.3, outer, fd));
          if (fd < inner) pc = mix(vec3(1.0,0.95,0.95), vec3(0.98,0.6,0.75), smoothstep(inner*0.2, inner, fd));
          float vein2 = smoothstep(0.1, 0.0, abs(sin(fa*16.0)))*0.15;
          pc *= 1.0 - vein2;
          if (fd < pr*0.17) pc = mix(vec3(1.0,0.82,0.25), vec3(0.85,0.6,0.1), step(0.5, hash21(floor(fq*400.0))));
          return vec4(pc, 0.95);
        }
      }
      return vec4(g, 0.7);
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec2 g = rippleGrad(uv);
      float h = ripple(uv);
      vec2 pr = p + g*0.012;                        // refraction of everything below the surface
      float caus = clamp(caustic(mod(pr*2.6*TAU, TAU) - 250.0, t*0.35 + 23.0), 0.0, 1.0);

      // ── pond floor: pebbles in sand, seen through green water
      vec2 fp = pr*16.0;
      vec2 fi = floor(fp);
      float md = 9.0, md2 = 9.0; vec2 mid = vec2(0.0);
      for (int j=-1; j<=1; j++) for (int k=-1; k<=1; k++){
        vec2 o = vec2(float(j), float(k));
        vec2 r = o + hash22(fi + o)*0.8 + 0.1 - fract(fp);
        float d = dot(r, r);
        if (d < md) { md2 = md; md = d; mid = fi + o; } else if (d < md2) md2 = d;
      }
      float gap = sqrt(md2) - sqrt(md);
      float hs = hash21(mid);
      vec3 stone = hs < 0.3 ? vec3(0.42,0.38,0.32) : hs < 0.55 ? vec3(0.32,0.3,0.28) : hs < 0.75 ? vec3(0.48,0.34,0.24) : vec3(0.25,0.27,0.24);
      stone *= 0.75 + 0.35*smoothstep(0.0, 0.6, gap) + 0.2*noise(fp*3.0);
      vec3 sand = vec3(0.32,0.29,0.2)*(0.8 + 0.3*noise(fp*5.0));
      vec3 floorC = mix(sand, stone, smoothstep(0.05, 0.16, gap)*step(0.25, hash21(mid + 3.0)));
      // swaying weeds
      float weed = 0.0;
      for (int i=0; i<5; i++){
        float fi2 = float(i);
        vec2 wc = vec2((hash11(fi2*3.3) - 0.5)*A*0.9, (hash11(fi2*7.1) - 0.5)*0.85);
        vec2 wq = pr - wc;
        float ang = atan(wq.y, wq.x);
        float blades = pow(abs(sin(ang*5.0 + sin(t*0.6 + fi2 + length(wq)*20.0)*0.6)), 6.0);
        weed = max(weed, blades*smoothstep(0.1, 0.0, length(wq)));
      }
      floorC = mix(floorC, vec3(0.16,0.4,0.12)*(0.8 + 0.4*caus), weed);
      vec3 water = vec3(0.03,0.2,0.2);
      vec3 col = mix(floorC*0.55, water, 0.45);
      col += vec3(0.9,0.95,0.7)*caus*0.35;
      float dens = 0.18 + 0.12*caus + 0.1*weed;

      // ── koi (back to front)
      float shadow = 0.0;
      vec3 under = col;
      for (int f=0; f<8; f++){
        vec3 before = col;
        float d0 = dens;
        koi(f, pr, col, dens, shadow, caus);
        // deeper fish are tinted toward the water
        float depth = uData[f*6+5].w;
        col = mix(col, mix(col, water*1.4 + col*0.35, depth*0.6), step(0.001, length(col - before)));
      }
      // floor shadows only darken where no fish is drawn on top
      if (dens < 0.36) col *= 1.0 - shadow*0.4;

      // ── surface: lily pads, lotus, petals, food, glints
      vec2 lp = p + g*0.004;
      float lshadow = 0.0;
      vec4 L;
      vec2 drift = vec2(sin(t*0.031), cos(t*0.023))*0.02;
      L = lily(lp, vec2(-0.2*A, 0.16) + drift*1.10, 0.085, 0.1, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.27*A, 0.07) + drift*1.60, 0.05, 0.6, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.12*A, 0.24) + drift*1.33, 0.045, 0.33, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(-0.31*A, 0.2) + drift*1.77, 0.035, 0.77, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.24*A, -0.14) + drift*1.90, 0.09, 0.9, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.33*A, -0.05) + drift*1.20, 0.05, 0.2, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.17*A, -0.25) + drift*1.40, 0.055, 0.4, false, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      L = lily(lp, vec2(0.3*A, -0.25) + drift*1.70, 0.04, 0.7, true, lshadow); if (L.a > 0.0) { col = L.rgb; dens = L.a; }
      if (lshadow > 0.0 && dens < 0.6) col *= 1.0 - lshadow*0.45;

      // drifting cherry petals
      for (int i=0; i<12; i++){
        float fi3 = float(i);
        vec2 pp = vec2(hash11(fi3*3.1), hash11(fi3*7.7));
        pp += vec2(t*0.005*(0.5 + hash11(fi3)), t*0.003*(hash11(fi3 + 2.0) - 0.5));
        vec2 pc = (fract(pp) - 0.5)*vec2(A*1.05, 1.05) + 0.01*vec2(sin(t*0.5 + fi3), cos(t*0.4 + fi3*2.0));
        vec2 q = rot(t*0.2 + fi3)*(lp - pc);
        float pd = length(q*vec2(1.0, 1.7));
        if (pd < 0.009) { col = mix(vec3(1.0,0.78,0.85), vec3(0.95,0.5,0.66), smoothstep(0.0, 0.009, pd)); dens = 0.6; }
      }
      // food pellets
      for (int i=0; i<8; i++){
        vec4 fd = uData[48 + i];
        if (fd.z <= 0.0) continue;
        vec2 q = lp - fd.xy - vec2(0.0, 0.002*sin(fd.w*3.0));
        float d = length(q);
        float r = 0.0085;
        if (d < r) { col = mix(vec3(0.55,0.32,0.14), vec3(0.95,0.75,0.45), smoothstep(r, 0.0, length(q - vec2(-0.003, 0.003))))*fd.z + col*(1.0 - fd.z); dens = 0.75; }
        col += vec3(0.5,0.6,0.55)*smoothstep(0.0025, 0.0, abs(d - r*1.8 - 0.004*sin(fd.w*2.0)))*fd.z*0.4;
      }
      // sun glints on ripples + soft sky sheen
      float glint = pow(clamp(dot(normalize(vec3(-g*6.0, 1.0)), normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0), 60.0);
      col += vec3(1.0,0.95,0.8)*glint*0.9;
      col += vec3(0.3,0.45,0.4)*clamp(abs(h)*0.25, 0.0, 0.25);
      col += vec3(0.08,0.1,0.06)*smoothstep(0.3, -0.6, p.y + p.x*0.3);  // warm light falloff
      return shade(col, clamp(dens + glint*0.3, 0.0, 1.0));
    }
    `,
  });
})();
