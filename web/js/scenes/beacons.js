/* The Beacons — a chain of signal fires on a range of snowy peaks above a sea of cloud at dusk.
 * Tap to light the first beacon; the fire leaps from summit to summit into the distance.
 * The cursor pans the view a little. Lights again on its own every so often. */
(function () {
  const NB = 7;
  window.AsciiWall.registerScene({
    id: "beacons",
    name: "The Beacons",
    blurb: "Snowy peaks above a sea of moonlit cloud at dusk, with a pale citadel below. Tap and the beacons light one after another, peak to peak into the distance.",
    tags: ["epic", "3d", "mountains", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#04050a",
    cell: 5,
    aspect: 1.8,
    glow: 1.1,
    underlay: 0.8,
    edges: 0.2,
    shimmer: 0.02,
    init() { return { start: 2.0, t: 0, lx: 0, ly: 0 }; },
    update(st, api) {
      const dt = api.dt, m = api.mouse;
      st.t += dt;
      if (api.clicks.length) st.start = st.t + 0.4;               // relight the chain
      if (st.t - st.start > 55) st.start = st.t + 6;              // and again on its own
      const D = api.data;
      for (let i = 0; i < NB; i++) {
        const lit = st.t - (st.start + i * 2.4);                   // each beacon catches 2.4 s after the last
        D[i] = lit > 0 ? Math.min(1, lit / 1.2) : 0;               // 0 dark .. 1 roaring
      }
      st.lx += ((m.present ? m.px * 0.35 : 0) - st.lx) * Math.min(1, dt * 1.5);
      st.ly += ((m.present ? m.py * 0.2 : 0) - st.ly) * Math.min(1, dt * 1.5);
      D[8] = st.lx; D[9] = st.ly;
    },
    frag: /* glsl */ `
    // ── terrain ───────────────────────────────────────────────
    float ridgeX(float z){ return 1.4*sin(z*0.11) + 0.05*z; }
    vec2 beaconXZ(int i){ float z = 3.0 + float(i)*4.6; return vec2(ridgeX(z) + (i % 2 == 0 ? 0.35 : -0.35), z); }

    float ridged(vec2 p){
      float a = 0.5, s = 0.0, w = 1.0;
      mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i=0; i<6; i++){
        float n = 1.0 - abs(noise(p)*2.0 - 1.0);
        n *= n;
        s += a*n*w;
        w = clamp(n*1.6, 0.0, 1.0);
        p = m*p*2.05 + vec2(3.1, 1.7);
        a *= 0.5;
      }
      return s;
    }
    float terrain(vec2 p){
      float dr = p.x - ridgeX(p.y);
      float range = 3.5*exp(-dr*dr*0.075) + 0.6*exp(-dr*dr*0.015);
      float h = range*(0.38 + 1.0*ridged(p*0.32)) - 0.3;
      vec2 cs = p - vec2(-3.4, 4.2); h += 1.9*exp(-dot(cs, cs)*0.22);
      // summits for the beacons
      for (int i=0; i<7; i++){
        vec2 b = beaconXZ(i);
        vec2 d = p - b;
        h += 1.1*exp(-dot(d, d)*1.4);
      }
      return h;
    }
    float terrainLo(vec2 p){                                       // cheaper version for marching far away
      float dr = p.x - ridgeX(p.y);
      float range = 3.5*exp(-dr*dr*0.075) + 0.6*exp(-dr*dr*0.015);
      float a = 0.5, s = 0.0, w = 1.0; vec2 q = p*0.32;
      mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i=0; i<4; i++){ float n = 1.0 - abs(noise(q)*2.0 - 1.0); n *= n; s += a*n*w; w = clamp(n*1.6, 0.0, 1.0); q = m*q*2.05 + vec2(3.1, 1.7); a *= 0.5; }
      float h = range*(0.38 + 1.0*s) - 0.3;
      vec2 cs = p - vec2(-3.4, 4.2); h += 1.9*exp(-dot(cs, cs)*0.22);
      for (int i=0; i<7; i++){ vec2 d = p - beaconXZ(i); h += 1.1*exp(-dot(d, d)*1.4); }
      return h;
    }
    vec3 tNormal(vec2 p, float t){
      float e = 0.004 + 0.0015*t;
      return normalize(vec3(terrain(p - vec2(e, 0.0)) - terrain(p + vec2(e, 0.0)), 2.0*e, terrain(p - vec2(0.0, e)) - terrain(p + vec2(0.0, e))));
    }

    const float CLOUD = 0.55;           // top of the cloud sea
    vec3 MOON;

    vec3 sky(vec3 d){
      float h = d.y;
      vec3 c = mix(vec3(0.85,0.42,0.22), vec3(0.36,0.26,0.42), smoothstep(-0.01, 0.05, h));
      c = mix(c, vec3(0.1,0.13,0.28), smoothstep(0.04, 0.22, h));
      c = mix(c, vec3(0.02,0.03,0.08), smoothstep(0.25, 0.8, h));
      // the last light lingers low in the west (+x)
      c += vec3(0.9,0.4,0.2)*pow(max(0.0, d.x*0.7 + 0.3), 3.0)*smoothstep(0.12, 0.0, h)*0.5;
      // stars
      vec2 sg = vec2(atan(d.x, d.z), asin(clamp(h, -1.0, 1.0)))*vec2(160.0, 160.0);
      vec2 si = floor(sg);
      float st = step(0.991, hash21(si))*smoothstep(0.45, 0.0, length(fract(sg) - 0.5 - (hash22(si) - 0.5)*0.4));
      c += vec3(0.8,0.85,1.0)*st*smoothstep(0.08, 0.4, h)*(0.5 + 0.5*sin(uTime*2.0 + hash21(si)*40.0));
      // moon with a soft halo
      float md = dot(d, MOON);
      c += vec3(0.6,0.65,0.8)*pow(max(md, 0.0), 60.0)*0.5;
      if (md > 0.99935) c = vec3(0.95,0.94,0.88)*(0.85 + 0.15*noise(d.xy*900.0));
      // thin high cloud
      vec2 cp = d.xz/(h + 0.2)*1.4 + vec2(uTime*0.004, 0.0);
      float cl = smoothstep(0.55, 0.8, fbm3(cp))*smoothstep(0.03, 0.25, h);
      c = mix(c, vec3(0.32,0.28,0.4) + vec3(0.25,0.22,0.2)*pow(max(md, 0.0), 8.0), cl*0.45);
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float lit[7];
      lit[0] = uData[0].x; lit[1] = uData[0].y; lit[2] = uData[0].z; lit[3] = uData[0].w;
      lit[4] = uData[1].x; lit[5] = uData[1].y; lit[6] = uData[1].z;
      vec2 look = uData[2].xy;
      MOON = normalize(vec3(-0.55, 0.32, 0.75));
      vec3 moonCol = vec3(0.42,0.5,0.75);

      vec3 ro = vec3(-7.5 + sin(t*0.02)*0.2, 3.6, -3.0);
      vec3 ta = vec3(0.5 + look.x*4.0, 1.2 + look.y*2.5, 13.0);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.6 + rt*p.x + up*p.y);

      vec3 col = sky(rd);
      // ── march the terrain
      float tt = 0.05, hitT = -1.0;
      for (int i=0; i<240; i++){
        vec3 pos = ro + rd*tt;
        float h = (tt < 12.0) ? terrain(pos.xz) : terrainLo(pos.xz);
        float d = pos.y - h;
        if (d < 0.0015*tt) { hitT = tt; break; }
        if (pos.y > 4.5 && rd.y > 0.0) break;
        tt += max(d*0.3, 0.002*tt);
        if (tt > 60.0) break;
      }
      // where does the ray meet the top of the cloud sea?
      float tc = rd.y < 0.0 ? (CLOUD - ro.y)/rd.y : -1.0;

      // beacon world positions (for lighting and drawing)
      vec3 bp[7];
      for (int i=0; i<7; i++){ vec2 b = beaconXZ(i); bp[i] = vec3(b.x, terrain(b) + 0.06, b.y); }
      // light from the fires at a point
      #define FIRELIGHT(P, N) { for (int k=0; k<7; k++){ if (lit[k] <= 0.0) continue; vec3 lv = bp[k] - P; float dl = length(lv); float fl = lit[k]*(0.85 + 0.15*noise(vec2(t*8.0, float(k)*3.0))); fire += vec3(1.0,0.5,0.18)*fl*max(dot(N, lv/dl), 0.0)*1.6/(1.0 + dl*dl*3.5); } }

      if (hitT > 0.0 && (tc < 0.0 || hitT < tc)) {
        vec3 pos = ro + rd*hitT;
        vec3 n = tNormal(pos.xz, hitT);
        // snow on gentle slopes and high ground, dark rock on cliffs
        float slope = n.y;
        float snow = smoothstep(0.55, 0.75, slope + 0.15*noise(pos.xz*12.0) + (pos.y - 1.2)*0.12);
        vec3 rock = mix(vec3(0.09,0.09,0.11), vec3(0.18,0.17,0.19), noise(pos.xz*20.0 + pos.y*5.0));
        vec3 alb = mix(rock, vec3(0.86,0.9,0.98), snow);
        float dif = max(dot(n, MOON), 0.0);
        // cheap self-shadow toward the moon
        float sh = 1.0;
        for (int k=1; k<10; k++){ vec3 sp = pos + MOON*float(k)*0.18; if (sp.y < terrainLo(sp.xz)) { sh = 0.25; break; } }
        vec3 fire = vec3(0.0);
        FIRELIGHT(pos, n)
        vec3 c = alb*(moonCol*dif*sh*1.1 + vec3(0.06,0.06,0.1) + vec3(0.25,0.12,0.12)*max(n.x, 0.0)*0.4) + alb*fire;
        c += vec3(0.6,0.7,1.0)*pow(max(dot(reflect(rd, n), MOON), 0.0), 30.0)*snow*sh*0.4;   // glints on snow
        float fog = 1.0 - exp(-hitT*0.045);
        col = mix(c, mix(vec3(0.1,0.12,0.22), sky(vec3(rd.x, 0.02, rd.z)), 0.3), fog);
      } else if (tc > 0.0) {
        // the sea of cloud: lumpy tops lit by the moon and, near the peaks, by the fires
        vec3 cpz = ro + rd*tc;
        vec2 q = cpz.xz*0.45 + vec2(t*0.02, t*0.01);
        float dens = fbm(q) + 0.5*fbm(q*2.7 + 5.0);
        float nTop = fbm(q + vec2(0.06, 0.0)) - fbm(q - vec2(0.06, 0.0));
        float ml = clamp(0.55 + nTop*3.0*dot(normalize(vec2(MOON.x, MOON.z)), vec2(1.0, 0.0)) + dens*0.3, 0.15, 1.0);
        vec3 c = vec3(0.36,0.42,0.6)*ml + vec3(0.05,0.06,0.1);
        vec3 fire = vec3(0.0);
        FIRELIGHT(cpz, vec3(0.0, 1.0, 0.0))
        c += vec3(0.9,0.75,0.7)*fire*0.7;
        float gaps = smoothstep(0.55, 0.8, dens);
        float fog = 1.0 - exp(-tc*0.035);
        c = mix(c, mix(vec3(0.16,0.17,0.3), sky(vec3(rd.x, 0.01, rd.z)), 0.45), fog);
        col = mix(vec3(0.02,0.025,0.05), c, gaps*0.85 + 0.15);
      }

      // ── the citadel: a pale walled city on the nearest spur, windows glowing
      {
        vec3 cpos = vec3(-3.9, 0.0, 3.6); cpos.y = terrain(cpos.xz) - 0.25;
        vec3 v = cpos - ro; float vz = dot(v, fw);
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.6;
        vec2 q = (p - sp)*vz/2.2;
        // tiers of walls stepping up to a tower
        float tier = 0.0;
        for (int i=0; i<4; i++){ float fi = float(i); float w = 0.32 - fi*0.07; float y0 = fi*0.06; if (abs(q.x) < w && q.y > y0 - 0.02 && q.y < y0 + 0.055) tier = 1.0 + fi; }
        bool tower = abs(q.x - 0.02) < 0.018 && q.y > 0.0 && q.y < 0.42;
        if ((tier > 0.0 || tower) && (hitT < 0.0 || vz < hitT + 0.6)) {
          float side = smoothstep(-0.3, 0.3, -q.x + 0.1);
          vec3 stone = vec3(0.86,0.85,0.82)*(0.3 + 0.7*side)*vec3(0.62,0.66,0.82);
          float ledge = smoothstep(0.006, 0.0, abs(fract((q.y + 0.02)/0.06) - 0.92)*0.06);           // tier ledges
          stone = mix(stone, vec3(0.22,0.24,0.32), ledge*0.7);
          float roofs = step(0.6, hash21(floor(q*vec2(60.0, 30.0))))*step(0.7, fract(q.y*30.0));
          stone = mix(stone, vec3(0.16,0.17,0.24), roofs*0.6);
          float win = step(0.72, hash21(floor(q*vec2(160.0, 90.0))))*step(0.3, fract(q.y*90.0))*step(fract(q.x*160.0), 0.6)*(tier > 0.0 ? 1.0 : 0.6);
          stone = mix(stone, vec3(1.0,0.75,0.4)*(0.8 + 0.2*sin(t*3.0 + q.x*100.0)), win);
          if (tower && q.y > 0.4) stone = vec3(0.95,0.95,1.0);
          col = stone;
        }
      }

      // ── the beacons: fire, glow, smoke, embers
      for (int i=0; i<7; i++){
        vec3 v = bp[i] - ro;
        float vz = dot(v, fw);
        if (vz < 0.2) continue;
        bool visible = hitT < 0.0 || hitT > length(v) - 0.25;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.6;
        float sc = 1.0/vz;                         // screen units per world unit (x1.6)
        vec2 q = (p - sp)/(sc*1.6);                // back to world-ish units around the beacon
        float L = lit[i];
        // the unlit pyre: a dark cone of timber
        if (visible && q.y > -0.01 && q.y < 0.07 && abs(q.x) < 0.045*(1.0 - q.y/0.075)) col = mix(col, vec3(0.08,0.05,0.03), 0.9);
        if (L <= 0.0) continue;
        float fl = 0.85 + 0.15*noise(vec2(t*9.0, float(i)*7.0));
        // flame: a flickering tongue shape built from noise
        vec2 fq = q - vec2(0.0, 0.05);
        float hgt = 0.55*L*fl;
        float yy = clamp(fq.y/hgt, 0.0, 1.0);
        float n = fbm3(vec2(fq.x*18.0, fq.y*9.0 - t*5.0 + float(i)*4.0));
        float w = 0.11*(1.0 - yy)*(0.6 + 0.6*n)*L;
        float flame = smoothstep(w, w*0.3, abs(fq.x + (n - 0.5)*0.05*yy))*step(0.0, fq.y)*step(fq.y, hgt);
        if (visible && flame > 0.0) {
          vec3 fc = mix(vec3(1.0,0.35,0.05), vec3(1.0,0.92,0.6), (1.0 - yy)*flame);
          col = mix(col, fc*1.4, flame);
        }
        // glow halo (visible even when the summit is just behind a ridge)
        float gd = length(q - vec2(0.0, 0.2));
        col += vec3(1.0,0.5,0.18)*L*(exp(-gd*gd*25.0)*1.1 + exp(-gd*2.2)*0.28)*(visible ? 1.0 : 0.45)*fl;
        // smoke column drifting east with the wind
        vec2 sq = q - vec2(0.0, 0.5);
        float rise = max(sq.y, 0.0);
        float sx = sq.x - rise*rise*0.6 - rise*0.35;
        float smoke = smoothstep(0.06 + rise*0.25, 0.0, abs(sx + (fbm3(vec2(rise*6.0 - t*0.8, float(i)))-0.5)*0.15))*smoothstep(1.6, 0.2, rise)*step(0.0, sq.y);
        smoke *= smoothstep(0.35, 0.65, fbm3(vec2(sx*10.0, rise*5.0 - t*1.2)))*L;
        col = mix(col, vec3(0.2,0.16,0.16) + vec3(0.5,0.25,0.1)*exp(-rise*2.0), smoke*0.55);
        // embers
        for (int k=0; k<8; k++){
          float fk = float(k);
          float ph = fract(t*0.35 + hash11(fk + float(i)*13.0));
          vec2 ep = vec2((hash11(fk*3.7 + float(i)) - 0.5)*0.15 + ph*ph*0.4, 0.1 + ph*0.9);
          float ed = length((q - ep)*sc*1.6*REF*1.5);
          col += vec3(1.0,0.55,0.2)*exp(-ed*ed*1.5)*(1.0 - ph)*L*(visible ? 1.0 : 0.0);
        }
      }

      // drifting snow in front of everything
      for (int L2=0; L2<2; L2++){
        float fl2 = float(L2);
        vec2 sq = p*(18.0 + fl2*14.0) + vec2(t*(0.6 + fl2*0.4), t*(1.3 + fl2*0.6));
        sq.x += sin(sq.y*0.4 + fl2)*0.8;
        vec2 si = floor(sq);
        float fl3 = step(0.96, hash21(si + fl2*17.0))*smoothstep(0.3, 0.0, length(fract(sq) - 0.5 - (hash22(si) - 0.5)*0.5));
        col += vec3(0.75,0.8,0.95)*fl3*(0.35 - fl2*0.12);
      }
      bool land = hitT > 0.0 && (tc < 0.0 || hitT < tc);
      col = pow(col, vec3(1.35))*1.6;                                   // more contrast: dark rock, bright snow
      float dd = pow(clamp(luma(col)*1.6, 0.0, 1.0), 1.1);
      dd *= land ? 1.0 : (tc > 0.0 ? 0.6 : 0.4);                        // sparse glyphs in sky and cloud
      return shade(col, dd);
    }
    `,
  });
})();
