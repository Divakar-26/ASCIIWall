/* Florence — golden hour over the city: Brunelleschi's ribbed octagonal dome and lantern, the drum and
 * tribunes, Giotto's polychrome bell tower, the nave, terracotta rooftops, the Arno with its bridges,
 * hazy Tuscan hills with cypresses. Your cursor moves the sun; swallows follow you; tap to ring the bells. */
(function () {
  const NB = 18;
  window.AsciiWall.registerScene({
    id: "florence",
    name: "Florence",
    blurb: "Florence at golden hour: Brunelleschi's dome, Giotto's bell tower, terracotta rooftops and the Arno, with Tuscan hills behind. Move your cursor to move the sun. Swallows follow you, and a tap rings the bells.",
    tags: ["renaissance", "3d", "city", "interactive"],
    style: "glyph",
    ramp: "dense",
    bg: "#0a0604",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.7,
    underlay: 0.5,
    edges: 0.55,
    shimmer: 0.02,
    init() {
      return {
        birds: Array.from({ length: NB }, () => ({ x: (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random() * 0.2, vx: 0, vy: 0, ph: Math.random() * 6, seed: Math.random() * 10 })),
        az: 2.45, el: 0.14, t: 0, bell: 99,
      };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), m = api.mouse, D = api.data;
      st.t += dt; st.bell += dt;
      if (api.clicks.length) st.bell = 0;
      const taz = m.present ? 2.1 + (m.px / api.aspect + 0.5) * 1.9 : 2.45;
      const tel = m.present ? 0.03 + (m.py + 0.5) * 0.4 : 0.14;
      st.az += (taz - st.az) * Math.min(1, dt * 1.2);
      st.el += (tel - st.el) * Math.min(1, dt * 1.2);
      st.birds.forEach((b, i) => {
        // circle the lantern, or loop around the cursor
        const cx = m.present ? m.px : 0.02, cy = m.present ? m.py : 0.27;
        const R = 0.08 + 0.1 * ((i * 0.37) % 1);
        const a = st.t * (0.6 + 0.25 * ((i * 0.61) % 1)) * (i % 2 ? 1 : -1) + b.seed;
        let ax = (cx + Math.cos(a) * R * 1.6 - b.x) * 2.2, ay = (cy + Math.sin(a) * R - b.y) * 2.2;
        if (st.bell < 0.1) { const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy) + 0.01; b.vx += dx / d * 0.8; b.vy += dy / d * 0.8; }
        b.vx = (b.vx + ax * dt) * Math.exp(-dt * 1.3); b.vy = (b.vy + ay * dt) * Math.exp(-dt * 1.3);
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.ph += dt * (9 + Math.hypot(b.vx, b.vy) * 20);
        D[i * 4] = b.x; D[i * 4 + 1] = b.y; D[i * 4 + 2] = Math.atan2(b.vy, b.vx); D[i * 4 + 3] = b.ph;
      });
      D[80] = st.az; D[81] = st.el; D[82] = st.bell; D[83] = m.px * m.on;
    },
    frag: /* glsl */ `
    float sdBox3(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
    float oct(vec2 q){ q = abs(q); return max(max(q.x, q.y), (q.x + q.y)*0.70710678); }
    vec2 U(vec2 a, vec2 b){ return a.x < b.x ? a : b; }
    vec3 SUN;

    // ids: 1 dome tiles, 2 white marble, 3 polychrome marble, 4 city walls, 5 roof tiles, 6 ground, 7 water, 8 bridge stone
    vec2 map(vec3 p){
      vec2 r = vec2(p.y, 6.0);
      // the Arno across the foreground
      if (abs(p.z + 1.75) < 0.28) r = vec2(p.y + 0.04, 7.0);
      // bridges (Ponte Vecchio-ish with shops on top)
      for (int i=0; i<2; i++){
        float bx = i == 0 ? -0.9 : 1.3;
        vec3 q = p - vec3(bx, 0.0, -1.75);
        float deck = sdBox3(q - vec3(0.0, 0.07, 0.0), vec3(0.11, 0.035, 0.32));
        float arches = length(vec2(q.z - (fract(q.z*3.0/1.0 + 0.5) - 0.5)/3.0*0.0, 0.0));
        float arch = length(vec2(fract(q.z*1.6 + 0.5) - 0.5, q.y*1.6)) - 0.22;
        deck = max(deck, -arch);
        if (i == 0) deck = min(deck, sdBox3(q - vec3(0.0, 0.14, 0.0), vec3(0.1, 0.05, 0.28)));
        r = U(r, vec2(deck, 8.0));
      }
      // cathedral complex
      vec3 c = p;
      float drum = max(oct(c.xz) - 0.45, abs(c.y - 0.5) - 0.12);
      float base = max(oct(c.xz) - 0.5, c.y - 0.38);
      // ribbed pointed dome
      float y0 = 0.62, H = 0.58;
      float u = clamp((c.y - y0)/H, 0.0, 1.0);
      float rr = 0.46*pow(1.0 - u, 0.55)*(1.0 - 0.18*u);
      float o = oct(c.xz);
      float dome = max((o - rr)*0.6, y0 - c.y);
      dome = max(dome, c.y - y0 - H);
      float lantern = max(oct(c.xz) - 0.065, abs(c.y - (y0 + H + 0.05)) - 0.07);
      lantern = min(lantern, max(length(c.xz) - 0.05*(1.0 - (c.y - y0 - H - 0.12)/0.14), abs(c.y - (y0 + H + 0.19)) - 0.07));
      lantern = min(lantern, length(c - vec3(0.0, y0 + H + 0.28, 0.0)) - 0.018);
      r = U(r, vec2(dome, 1.0));
      r = U(r, vec2(min(drum, lantern), 2.0));
      r = U(r, vec2(base, 3.0));
      // tribunes (apses) with small half domes
      for (int i=0; i<3; i++){
        vec2 ap = i == 0 ? vec2(0.62, 0.0) : (i == 1 ? vec2(0.0, 0.62) : vec2(0.0, -0.62));
        vec3 q = c - vec3(ap.x, 0.0, ap.y);
        float trib = max(oct(q.xz) - 0.22, c.y - 0.3);
        trib = min(trib, max(length(q - vec3(0.0, 0.3, 0.0)) - 0.2, 0.3 - c.y));
        r = U(r, vec2(trib, 3.0));
      }
      // nave toward the facade (west, -x) with a gabled roof
      vec3 nq = c - vec3(-1.15, 0.0, 0.0);
      float nave = sdBox3(nq - vec3(0.0, 0.25, 0.0), vec3(0.75, 0.25, 0.24));
      float roof = max(sdBox3(nq - vec3(0.0, 0.5, 0.0), vec3(0.75, 0.12, 0.25)), (nq.y - 0.5) + abs(nq.z)*0.55 - 0.1);
      r = U(r, vec2(nave, 3.0));
      r = U(r, vec2(roof, 5.0));
      // Giotto's campanile
      vec3 tq = c - vec3(-1.75, 0.0, -0.5);
      float tower = sdBox3(tq - vec3(0.0, 0.85, 0.0), vec3(0.09, 0.85, 0.09));
      tower = min(tower, sdBox3(tq - vec3(0.0, 1.72, 0.0), vec3(0.105, 0.025, 0.105)));
      r = U(r, vec2(tower, 3.0));
      // the city: a grid of houses with pitched roofs
      vec2 cs = vec2(0.24);
      vec2 id = floor(p.xz/cs);
      vec2 lc = p.xz - (id + 0.5)*cs;
      vec2 hh = hash22(id);
      vec2 wc = (id + 0.5)*cs;
      bool keep = !(abs(wc.x + 0.6) < 1.35 && abs(wc.y) < 0.82) && abs(wc.y + 1.75) > 0.38 && length(wc) < 4.2 + 2.0*hash11(floor(atan(wc.y, wc.x)*6.0)) && wc.y > -2.2;
      if (keep && hh.x > 0.08) {
        float hgt = 0.1 + 0.22*hh.y*hh.y;
        vec3 hp = vec3(lc.x, p.y, lc.y);
        vec2 half_ = vec2(0.1 - 0.02*hh.x, 0.1 - 0.015*fract(hh.y*7.0));
        float house = sdBox3(hp - vec3(0.0, hgt*0.5, 0.0), vec3(half_.x, hgt*0.5, half_.y));
        bool alongX = fract(hh.x*13.0) > 0.5;
        float slope = alongX ? abs(hp.z) : abs(hp.x);
        float rf = max(sdBox3(hp - vec3(0.0, hgt + 0.035, 0.0), vec3(half_.x + 0.01, 0.035, half_.y + 0.01)), (hp.y - hgt) + slope*0.5 - 0.05);
        r = U(r, vec2(house, 4.0));
        r = U(r, vec2(rf, 5.0));
      }
      // conservative step inside the repeated grid
      r.x = min(r.x, max(0.02, 0.5*cs.x - max(abs(lc.x), abs(lc.y)) + 0.01) + (keep ? 0.0 : 0.05));
      return r;
    }
    vec3 nrm(vec3 p){
      const vec2 k = vec2(1.0, -1.0); const float e = 0.0015;
      return normalize(k.xyy*map(p + k.xyy*e).x + k.yyx*map(p + k.yyx*e).x + k.yxy*map(p + k.yxy*e).x + k.xxx*map(p + k.xxx*e).x);
    }
    float shadow(vec3 ro, vec3 rd){
      float res = 1.0, t = 0.02;
      for (int i=0; i<32; i++){
        float h = map(ro + rd*t).x;
        res = min(res, 10.0*h/t);
        t += clamp(h, 0.02, 0.25);
        if (res < 0.02 || t > 5.0) break;
      }
      return clamp(res, 0.0, 1.0);
    }
    vec3 sky(vec3 d){
      float sd = max(dot(d, SUN), 0.0);
      float lowSun = smoothstep(0.4, 0.0, SUN.y);
      vec3 c = mix(vec3(0.95,0.62,0.35), vec3(0.32,0.42,0.62), smoothstep(-0.02, 0.45, d.y));
      c = mix(c, mix(c, vec3(0.9,0.42,0.25), 0.6), lowSun*smoothstep(0.3, 0.0, d.y));
      c += vec3(1.0,0.75,0.45)*pow(sd, 8.0)*0.6 + vec3(1.0,0.9,0.7)*pow(sd, 400.0)*2.0;
      // clouds lit from below by the low sun
      vec2 cp = d.xz/(d.y + 0.15)*1.2 + vec2(uTime*0.01, 0.0);
      float cl = smoothstep(0.5, 0.75, fbm(cp*1.5))*smoothstep(0.02, 0.2, d.y);
      c = mix(c, mix(vec3(0.95,0.55,0.4), vec3(1.0,0.85,0.7), pow(sd, 3.0)), cl*0.7);
      return c;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float az = uData[20].x, el = uData[20].y, bell = uData[20].z, look = uData[20].w;
      SUN = normalize(vec3(sin(az), el, cos(az)));
      vec3 ro = vec3(0.9 + look*0.1, 1.45, -4.7);
      vec3 ta = vec3(-0.35, 0.72, 0.4);
      vec3 fw = normalize(ta - ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.55 + rt*p.x + up*p.y);
      vec3 sunCol = mix(vec3(1.0,0.55,0.3), vec3(1.0,0.86,0.66), smoothstep(0.0, 0.35, SUN.y))*2.0;

      vec3 col = sky(rd);
      // distant hills with cypresses just above the horizon
      float az2 = atan(rd.x, rd.z);
      float hz = 0.012 + 0.06*fbm3(vec2(az2*5.0, 3.0)) + 0.01*noise(vec2(az2*40.0, 0.0));
      if (rd.y < hz) {
        vec3 hill = mix(vec3(0.2,0.24,0.17), vec3(0.42,0.4,0.33), smoothstep(hz - 0.05, hz, rd.y));
        hill *= 0.85 + 0.25*noise(vec2(az2*200.0, rd.y*300.0));
        float ci = floor(az2*120.0);
        float cyp = step(0.72, hash11(ci))*step(rd.y, hz + 0.018*hash11(ci + 3.0))*step(abs(fract(az2*120.0) - 0.5), 0.2*(1.0 - (rd.y - hz + 0.02)/0.04));
        hill = mix(hill, vec3(0.1,0.13,0.08), cyp);
        col = mix(hill, sky(vec3(rd.x, 0.02, rd.z)), 0.35);
      }
      // far fields where the ray leaves the march range (analytic ground)
      if (rd.y < 0.0) {
        float gt = -ro.y/rd.y;
        vec2 gp = ro.xz + rd.xz*gt;
        float fld = noise(floor(gp*2.0)*1.7);
        vec3 fields = mix(vec3(0.3,0.34,0.16), vec3(0.5,0.44,0.22), fld)*(0.8 + 0.3*noise(gp*20.0));
        fields *= mix(vec3(0.5,0.55,0.65), vec3(1.0,0.9,0.75), clamp(SUN.y*3.0, 0.0, 1.0));
        col = mix(fields, sky(vec3(rd.x, 0.03, rd.z))*0.9, (1.0 - exp(-max(gt - 3.0, 0.0)*0.09))*0.8);
      }

      float tt = 0.0; vec2 h = vec2(1.0, 0.0); bool hit = false;
      for (int i=0; i<140; i++){
        h = map(ro + rd*tt);
        if (h.x < 0.0008*tt) { hit = true; break; }
        tt += h.x*0.85;
        if (tt > 12.0) break;
      }
      if (hit && rd.y < 0.3) {
        vec3 pos = ro + rd*tt;
        vec3 n = nrm(pos);
        float dif = max(dot(n, SUN), 0.0);
        float sh = dif > 0.0 ? shadow(pos + n*0.004, SUN) : 0.0;
        float id = h.y;
        vec3 base;
        float spec = 0.0;
        if (id < 1.5) {
          // dome: terracotta tiles with white marble ribs at the corners and a lantern ring
          float a = atan(pos.z, pos.x);
          float rib = smoothstep(0.035, 0.02, abs(fract((a - 0.3927)/0.7854 + 0.5) - 0.5));
          float rows = smoothstep(0.75, 1.0, abs(sin(pos.y*190.0)));
          base = mix(vec3(0.72,0.3,0.15), vec3(0.6,0.24,0.12), noise(pos.xz*60.0 + pos.y*20.0));
          base *= 1.0 - rows*0.25;
          base = mix(base, vec3(0.92,0.88,0.8), rib);
          base = mix(base, vec3(0.92,0.88,0.8), smoothstep(0.012, 0.0, abs(pos.y - 0.66)));
          spec = 0.2;
        } else if (id < 2.5) {
          // drum: white with green panels and round windows
          float a = atan(pos.z, pos.x);
          float face = fract(a/0.7854 + 0.5);
          base = vec3(0.9,0.86,0.78);
          base = mix(base, vec3(0.2,0.35,0.28), step(abs(face - 0.5), 0.4)*step(abs(pos.y - 0.5), 0.09)*0.6);
          base = mix(base, vec3(0.08,0.06,0.05), smoothstep(0.035, 0.03, length(vec2((face - 0.5)*0.35, pos.y - 0.5))));
        } else if (id < 3.5) {
          // polychrome marble: white with green and pink panel lines
          vec2 g = vec2(pos.x + pos.z, pos.y)*vec2(14.0, 20.0);
          float lines = smoothstep(0.9, 1.0, abs(sin(g.x)))*0.5 + smoothstep(0.92, 1.0, abs(sin(g.y)));
          base = mix(vec3(0.92,0.88,0.82), vec3(0.22,0.38,0.3), clamp(lines, 0.0, 1.0)*0.7);
          base = mix(base, vec3(0.85,0.55,0.5), step(0.6, noise(floor(g)*0.5))*0.35);
        } else if (id < 4.5) {
          // stucco walls (ochre / cream / rose), shuttered windows
          float hv = hash21(floor(pos.xz/0.24));
          base = hv < 0.3 ? vec3(0.9,0.76,0.5) : hv < 0.55 ? vec3(0.93,0.86,0.7) : hv < 0.8 ? vec3(0.86,0.6,0.45) : vec3(0.8,0.72,0.55);
          vec2 w = vec2((abs(n.x) > 0.5 ? pos.z : pos.x)*28.0, pos.y*30.0);
          float win = step(0.62, fract(w.x))*step(fract(w.x), 0.88)*step(0.35, fract(w.y))*step(fract(w.y), 0.8)*step(0.04, pos.y);
          base = mix(base, mix(vec3(0.12,0.2,0.14), vec3(0.06,0.05,0.04), step(0.5, hash21(floor(w)))), win);
          base *= 0.85 + 0.2*noise(pos.xy*50.0);
        } else if (id < 5.5) {
          // roof tiles
          float rows = smoothstep(0.6, 1.0, abs(sin((pos.x + pos.z)*180.0)));
          base = mix(vec3(0.66,0.3,0.16), vec3(0.5,0.22,0.12), noise(pos.xz*25.0))*(1.0 - rows*0.25);
        } else if (id < 6.5) {
          float fld = noise(floor(pos.xz*2.5)*1.7);
          base = mix(vec3(0.32,0.36,0.16), vec3(0.5,0.45,0.22), fld);
          float olive = step(0.55, noise(pos.xz*30.0))*step(0.4, fld);
          base = mix(base, vec3(0.16,0.22,0.12), olive*0.8);
          if (length(pos.xz) < 4.5) base = vec3(0.45,0.4,0.3)*(0.8 + 0.3*noise(pos.xz*8.0));
        } else if (id < 7.5) {
          // the river reflects the sky
          vec3 rf = reflect(rd, vec3(0.0, 1.0, 0.0) + vec3(0.03*sin(pos.x*40.0 + t), 0.0, 0.02*sin(pos.z*60.0 - t*1.3)));
          base = mix(vec3(0.12,0.16,0.12), sky(rf), 0.65);
          dif = 1.0; sh = 1.0;
        } else {
          base = vec3(0.7,0.6,0.45)*(0.8 + 0.3*noise(pos.xy*40.0));
        }
        vec3 amb = mix(vec3(0.18,0.2,0.28), vec3(0.3,0.24,0.2), n.y*0.5 + 0.5);
        vec3 c = id > 6.5 && id < 7.5 ? base : base*(amb*0.6 + sunCol*dif*sh);
        c += sunCol*spec*pow(max(dot(reflect(-SUN, n), -rd), 0.0), 20.0)*sh;
        // aerial perspective
        float fog = (1.0 - exp(-max(tt - 3.0, 0.0)*0.09))*0.8;
        col = mix(c, sky(vec3(rd.x, 0.03, rd.z))*0.9, fog);
      }

      // swallows
      for (int i=0; i<18; i++){
        vec4 b = uData[i];
        vec2 dir = vec2(cos(b.z), sin(b.z));
        vec2 per = vec2(-dir.y, dir.x);
        float flap = 0.5 + 0.5*sin(b.w);
        float s = 0.012;
        vec2 tipA = b.xy + per*s - dir*s*(0.3 + 0.5*flap) + vec2(0.0, s*0.4*flap);
        vec2 tipB = b.xy - per*s - dir*s*(0.3 + 0.5*flap) + vec2(0.0, s*0.4*flap);
        float d = min(sdSeg(p, b.xy, tipA), sdSeg(p, b.xy, tipB));
        d = min(d, sdSeg(p, b.xy, b.xy - dir*s*0.9));
        col = mix(col, vec3(0.06,0.05,0.06), smoothstep(0.0028, 0.0012, d));
      }
      // bells: a warm pulse of light from the tower
      if (bell < 3.0) col += vec3(1.0,0.8,0.5)*0.12*exp(-bell*1.2)*(0.5 + 0.5*sin(bell*18.0));
      col = pow(col, vec3(1.25))*1.15;
      float dsky = (hit && rd.y < 0.3) ? 1.0 : 0.5;
      return shade(col, pow(clamp(luma(col)*1.2, 0.0, 1.0), 0.9)*dsky);
    }
    `,
  });
})();
