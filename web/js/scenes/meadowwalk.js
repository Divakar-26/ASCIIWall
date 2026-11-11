/* Meadow Walk — first person, strolling down a winding path through a wildflower meadow at sunset.
 * Flowers are drawn on ~48 depth layers that slide toward you as you walk (real parallax), with a
 * footstep head-bob. Fireflies and butterflies live in the world. Cursor looks around; hold to stop
 * and stand still; tap for a gust of petals. */
(function () {
  window.AsciiWall.registerScene({
    id: "meadowwalk",
    name: "Meadow Walk",
    blurb: "A first-person stroll down a winding path through wildflowers at sunset, with fireflies and butterflies around you. Look around with your cursor, hold to stop and stand still, and tap for a gust of petals.",
    tags: ["nature", "3d", "cozy", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#0b0806",
    cell: 4.5,
    aspect: 1.8,
    glow: 0.8,
    underlay: 0.7,
    edges: 0.25,
    shimmer: 0.02,
    init() { return { z: 0, yaw: 0, pitch: 0, phase: 0, speed: 0.32, gust: 99 }; },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), m = api.mouse;
      const target = m.down ? 0 : 0.32;
      st.speed += (target - st.speed) * Math.min(1, dt * 2.2);
      st.z += st.speed * dt;
      st.phase += st.speed * dt * 11.0;                       // ~1.8 steps per second at full pace
      const ty = m.present ? (m.px / api.aspect) * 0.9 : Math.sin(st.z * 0.13) * 0.12;
      const tp = m.present ? m.py * 0.45 : 0.0;
      st.yaw += (ty - st.yaw) * Math.min(1, dt * 2.5);
      st.pitch += (tp - st.pitch) * Math.min(1, dt * 2.5);
      st.gust += dt;
      if (api.clicks.length) st.gust = 0;
      const D = api.data;
      D[0] = st.z % 5000; D[1] = st.yaw; D[2] = st.pitch; D[3] = st.phase;
      D[4] = st.speed / 0.32; D[5] = st.gust;
    },
    frag: /* glsl */ `
    const float DZ = 0.11;      // spacing of the depth layers
    const int   NROWS = 52;
    const float CW = 0.085;     // flower column width
    vec3 SUN; vec3 SUNCOL;

    float pathX(float z){ return 0.35*sin(z*0.21) + 0.18*sin(z*0.53 + 1.3); }

    vec3 sky(vec3 d){
      float h = d.y;
      float sd = max(dot(d, SUN), 0.0);
      vec3 c = mix(vec3(1.0,0.62,0.36), vec3(0.98,0.42,0.38), smoothstep(0.0, 0.12, h));
      c = mix(c, vec3(0.52,0.36,0.58), smoothstep(0.08, 0.3, h));
      c = mix(c, vec3(0.16,0.18,0.36), smoothstep(0.25, 0.7, h));
      c += vec3(1.0,0.72,0.4)*pow(sd, 6.0)*0.7 + vec3(1.0,0.92,0.75)*pow(sd, 300.0)*1.6;
      // long streaky clouds lit from below
      vec2 cp = d.xz/(h + 0.12)*vec2(0.6, 1.6) + vec2(uTime*0.006, 0.0);
      float cl = smoothstep(0.48, 0.75, fbm(cp*vec2(1.0, 2.5)))*smoothstep(0.02, 0.12, h)*smoothstep(0.6, 0.2, h);
      vec3 cc = mix(vec3(0.62,0.32,0.42), vec3(1.0,0.72,0.5), pow(sd, 2.0) + 0.3*(1.0 - smoothstep(0.0, 0.2, h)));
      c = mix(c, cc, cl*0.85);
      // first stars high up
      vec2 sg = vec2(atan(d.x, d.z), h)*vec2(120.0, 120.0);
      c += vec3(0.9)*step(0.996, hash21(floor(sg)))*smoothstep(0.35, 0.7, h)*0.6;
      return c;
    }

    // one flower column on a depth layer; returns rgba (premultiplied-ish alpha)
    vec4 flower(vec2 q, float row, float col, float t, float gust){
      vec2 h = hash22(vec2(row, col));
      float kind = hash21(vec2(col*1.7, row*3.1));
      if (h.x < 0.25) return vec4(0.0);
      float cx = (col + 0.2 + h.y*0.6)*CW;
      float ht = 0.1 + 0.26*h.x*h.x;
      // wind: a slow travelling wave plus the tap gust
      float wind = sin(t*1.4 + row*0.7 + col*0.9)*0.012 + sin(t*0.6 + row*0.21)*0.01 + gust*0.05*sin(t*6.0 + col);
      float yy = clamp(q.y/ht, 0.0, 1.0);
      float sx = cx + wind*yy*yy;
      float stem = abs(q.x - sx);
      vec4 r = vec4(0.0);
      if (q.y > 0.0 && q.y < ht && stem < 0.0028) r = vec4(vec3(0.22,0.42,0.14), 1.0);
      // a leaf partway up
      vec2 lq = q - vec2(sx + 0.012*sign(h.y - 0.5), ht*0.35);
      if (length(lq*vec2(1.0, 2.6)) < 0.013) r = vec4(vec3(0.28,0.5,0.16), 1.0);
      vec2 hq = q - vec2(cx + wind, ht);
      if (kind < 0.18) {
        // lavender: a spike of little purple buds
        if (hq.y < 0.012 && hq.y > -0.075) {
          float k = (hq.y + 0.075)/0.087;                         // 0 bottom .. 1 tip
          float seg = fract(hq.y/0.0085);
          float side = mod(floor(hq.y/0.0085), 2.0)*2.0 - 1.0;
          float w = (0.0075 - 0.004*k)*(0.6 + 0.4*sin(seg*PI));
          float bx = hq.x - side*0.0018;
          if (abs(bx) < w) r = vec4(mix(vec3(0.42,0.28,0.7), vec3(0.7,0.55,0.95), seg*0.6 + k*0.3), 1.0);
        }
        return r;
      }
      float R = kind < 0.4 ? 0.024 : (kind < 0.6 ? 0.03 : (kind < 0.75 ? 0.022 : (kind < 0.88 ? 0.028 : 0.014)));
      vec2 pq = hq*vec2(1.0, 1.6);                         // heads seen a little from above
      float d = length(pq), a = atan(pq.y, pq.x);
      float N = kind < 0.4 ? 13.0 : (kind < 0.6 ? 5.0 : (kind < 0.75 ? 8.0 : (kind < 0.88 ? 8.0 : 5.0)));
      float pr = R*(0.55 + 0.45*pow(abs(cos(a*N*0.5)), kind < 0.4 ? 0.35 : 0.8));
      if (d < pr) {
        vec3 pc;
        if (kind < 0.4)      { pc = vec3(0.97,0.96,0.92); if (d < R*0.3) pc = vec3(1.0,0.78,0.15); }               // daisy
        else if (kind < 0.6) { pc = vec3(0.92,0.14,0.08); if (d < R*0.25) pc = vec3(0.06,0.04,0.05); }              // poppy
        else if (kind < 0.75){ pc = vec3(0.3,0.45,0.95);  if (d < R*0.25) pc = vec3(0.2,0.15,0.45); }               // cornflower
        else if (kind < 0.88){ pc = vec3(0.98,0.5,0.72);  if (d < R*0.25) pc = vec3(1.0,0.82,0.3); }                // cosmos
        else                 { pc = vec3(1.0,0.86,0.15); }                                                          // buttercup
        pc *= 0.75 + 0.35*smoothstep(pr, 0.0, d);
        r = vec4(pc, 1.0);
      }
      return r;
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      float camZ = uData[0].x, yaw = uData[0].y, pitch = uData[0].z, ph = uData[0].w;
      float pace = uData[1].x, gust = uData[1].y;
      float g = gust < 3.0 ? exp(-gust*1.2) : 0.0;
      SUN = normalize(vec3(0.35, 0.06, 1.0));
      SUNCOL = vec3(1.0,0.7,0.45);

      // camera: walking along the path with a footstep bob
      float bob = abs(sin(ph))*0.012*pace;
      float sway = sin(ph*0.5)*0.006*pace;
      vec3 ro = vec3(pathX(camZ) + sway, 0.34 + bob, camZ);
      float pathYaw = atan(pathX(camZ + 0.6) - pathX(camZ), 0.6);
      float ya = yaw + pathYaw*0.6;
      vec3 fw = normalize(vec3(sin(ya), -0.12 + pitch*0.6 - bob*0.5, cos(ya)));
      vec3 rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
      vec3 rd = normalize(fw*1.35 + rt*p.x + up*p.y);

      vec3 col = sky(rd);
      // distant hills, three layers of haze
      if (rd.y < 0.12) {
        float az = atan(rd.x, rd.z);
        for (int i=2; i>=0; i--){
          float fi = float(i);
          float hh = 0.01 + 0.03*(1.0 + fi*0.6)*fbm3(vec2(az*(3.0 + fi*2.0) + fi*11.0 + camZ*0.004*(3.0 - fi), fi));
          if (rd.y < hh + (i == 0 ? 0.012 : 0.0)) {
            vec3 hc = i == 2 ? vec3(0.74,0.5,0.55) : (i == 1 ? vec3(0.46,0.34,0.46) : vec3(0.2,0.22,0.16));
            hc *= 0.9 + 0.15*noise(vec2(az*80.0, rd.y*200.0));
            // a line of round tree crowns along the nearest ridge
            if (i == 0) {
              float ti = floor(az*70.0);
              float tr2 = 0.006 + 0.006*hash11(ti);
              vec2 tq = vec2((fract(az*70.0) - 0.5)/70.0*3.0, rd.y - hh);
              bool tree = hash11(ti + 5.0) > 0.35 && length(tq) < tr2;
              if (tree) hc = vec3(0.13,0.15,0.1);
              else if (rd.y >= hh) continue;
            }
            float haze = i == 2 ? 0.45 : (i == 1 ? 0.25 : 0.08);
            col = mix(hc, sky(vec3(rd.x, 0.015, rd.z)), haze);
          }
        }
      }

      // meadow layers, front to back
      vec3 acc = vec3(0.0); float alpha = 0.0;
      float k0 = floor(camZ/DZ) + 1.0;
      float hitT = 1e9;
      for (int i=0; i<NROWS; i++){
        float row = k0 + float(i);
        float zr = row*DZ;
        float tr = (zr - ro.z)/rd.z;
        if (tr <= 0.0) continue;
        vec3 hp = ro + rd*tr;
        if (hp.y > 0.42) { if (rd.y >= 0.0) break; else continue; }
        float fog = 1.0 - exp(-tr*0.16);
        vec4 c = vec4(0.0);
        // off the path: grass blades and flowers
        float px = pathX(zr);
        float onPath = smoothstep(0.17, 0.12, abs(hp.x - px));
        if (hp.y < 0.0) { continue; } else {
          // grass: dense thin blades, shorter at the path edge
          float bw = 0.011;
          float bx = hp.x + sin(t*1.3 + zr*0.8)*0.004*hp.y*10.0;
          float bi = floor(bx/bw);
          float bh = (0.04 + 0.1*hash21(vec2(bi, row)))*(1.0 - onPath*0.85);
          float bf = abs(fract(bx/bw) - 0.5);
          if (hp.y < bh && bf < 0.32*(1.0 - hp.y/bh)) {
            vec3 gc = mix(vec3(0.16,0.3,0.08), vec3(0.45,0.55,0.18), hp.y/bh*hash21(vec2(bi + 3.0, row)));
            c = vec4(gc, 1.0);
          }
          if (onPath < 0.5) {
            float ci = floor(hp.x/CW);
            for (int j=-1; j<=1; j++){
              vec4 f = flower(vec2(hp.x, hp.y), row, ci + float(j), t, g);
              if (f.a > 0.0) c = f;
            }
          }
        }
        if (c.a > 0.0) {
          // backlit by the low sun: rim glow on the side facing the light, darker toward the viewer
          vec3 lit = c.rgb*(0.35 + 0.55*SUNCOL) + c.rgb*SUNCOL*0.35*pow(max(dot(rd, SUN), 0.0), 3.0);
          lit *= 0.7 + 0.5*clamp(hp.y*4.0, 0.0, 1.0);
          lit = mix(lit, sky(vec3(rd.x, 0.03, rd.z))*0.85, fog);
          acc += (1.0 - alpha)*lit*c.a;
          alpha += (1.0 - alpha)*c.a;
          hitT = min(hitT, tr);
          if (alpha > 0.98) break;
        }
      }
      // beyond the last layer: the meadow floor fades into colour-speckled distance
      if (alpha < 0.98 && rd.y < 0.0) {
        float tg = -ro.y/rd.y;
        vec3 gp = ro + rd*tg;
        float near = 1.0 - smoothstep(float(NROWS)*DZ*0.8, float(NROWS)*DZ, tg);
        {
          // the path: packed earth with ruts and pebbles; grass soil either side
          float pd = abs(gp.x - pathX(gp.z));
          float onP = smoothstep(0.17, 0.12, pd);
          vec3 dirt = mix(vec3(0.36,0.27,0.17), vec3(0.46,0.36,0.24), noise(gp.xz*vec2(30.0, 12.0)));
          dirt *= 1.0 - 0.25*smoothstep(0.03, 0.0, abs(pd - 0.07));                       // wheel ruts
          dirt = mix(dirt, vec3(0.55,0.5,0.42), step(0.93, hash21(floor(gp.xz*90.0)))*0.8); // pebbles
          vec3 soil = mix(vec3(0.12,0.17,0.06), vec3(0.22,0.28,0.1), noise(gp.xz*20.0));
          vec3 nearC = mix(soil, dirt, onP)*(0.45 + 0.55*SUNCOL);
          nearC = mix(nearC, sky(vec3(rd.x, 0.03, rd.z))*0.85, 1.0 - exp(-tg*0.16));
          if (near > 0.0) { acc += (1.0 - alpha)*nearC*near; alpha += (1.0 - alpha)*near; }
          hitT = min(hitT, tg);
        }
        if (alpha < 0.999) {
          float sp = hash21(floor(gp.xz*vec2(40.0, 8.0)));
          vec3 gc = mix(vec3(0.24,0.3,0.12), vec3(0.4,0.42,0.16), noise(gp.xz*3.0));
          gc = mix(gc, sp < 0.04 ? vec3(0.95,0.25,0.15) : (sp < 0.08 ? vec3(0.95,0.92,0.85) : (sp < 0.1 ? vec3(0.55,0.4,0.85) : gc)), 0.7);
          gc *= 0.45 + 0.55*SUNCOL;
          gc = mix(gc, sky(vec3(rd.x, 0.03, rd.z))*0.85, 1.0 - exp(-tg*0.16));
          acc += (1.0 - alpha)*gc; alpha = 1.0;
          hitT = min(hitT, tg);
        }
      }
      col = mix(col, acc/max(alpha, 1e-3), alpha);

      // fireflies living in world cells around the path
      for (int i=0; i<14; i++){
        float fi = float(i);
        float cz = floor(camZ/0.5) + floor(fi/2.0) + 1.0;
        vec2 hh = hash22(vec2(cz, fi));
        vec3 fp = vec3(pathX(cz*0.5) + (hh.x - 0.5)*1.4 + 0.08*sin(t*0.7 + fi), 0.12 + 0.25*hh.y + 0.04*sin(t*1.1 + fi*2.0), cz*0.5 + 0.2*sin(t*0.5 + fi));
        vec3 v = fp - ro;
        float vz = dot(v, fw);
        if (vz < 0.1 || vz > hitT + 0.1) continue;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.35;
        float blink = pow(0.5 + 0.5*sin(t*2.3 + fi*4.1), 4.0);
        float d = length(p - sp)*vz;
        col += vec3(1.0,0.9,0.45)*(exp(-d*d*9000.0)*1.4 + exp(-d*d*700.0)*0.25)*blink;
      }
      // butterflies fluttering ahead
      for (int i=0; i<5; i++){
        float fi = float(i);
        float cz = floor(camZ/1.5) + fi*0.6 + 1.0;
        vec3 bp = vec3(pathX(cz*1.5) + 0.4*sin(t*0.35 + fi*2.0) + 0.05*sin(t*2.1 + fi), 0.2 + 0.06*sin(t*0.9 + fi) + 0.02*sin(t*5.0 + fi), cz*1.5 + 0.3*sin(t*0.25 + fi));
        bp.xy += g*vec2(sin(fi*3.0), 0.3)*0.4;
        vec3 v = bp - ro;
        float vz = dot(v, fw);
        if (vz < 0.15 || vz > hitT + 0.05) continue;
        vec2 sp = vec2(dot(v, rt), dot(v, up))/vz*1.35;
        vec2 q = (p - sp)*vz/0.018;
        float flap = abs(sin(t*9.0 + fi*1.7));
        q.x /= 0.25 + 0.75*flap;
        float w = min(length((abs(q) - vec2(0.55, 0.32))*vec2(1.0, 1.3)), length((abs(q) - vec2(0.42, -0.35))*1.5));
        if (w < 0.42 && abs(q.x) > 0.05) {
          vec3 bc = i == 0 ? vec3(1.0,0.6,0.15) : (i == 1 ? vec3(0.5,0.7,1.0) : (i == 2 ? vec3(1.0,0.95,0.8) : (i == 3 ? vec3(1.0,0.5,0.7) : vec3(0.95,0.85,0.2))));
          bc = mix(bc*0.4, bc, smoothstep(0.42, 0.15, w))*(0.6 + 0.6*SUNCOL);
          col = bc;
        }
      }
      // a gust of petals on tap
      if (g > 0.01) {
        for (int i=0; i<40; i++){
          float fi = float(i);
          vec2 pp = vec2(hash11(fi*3.3) - 0.5, hash11(fi*7.9) - 0.6)*vec2(uAspect, 1.0);
          pp += vec2(1.0, 0.25)*(1.0 - g)*(0.6 + hash11(fi))*1.2 + vec2(0.0, 0.05*sin(t*3.0 + fi));
          vec2 q = rot(t*4.0 + fi)*(p - pp);
          if (length(q*vec2(1.0, 2.0)) < 0.007) col = mix(vec3(1.0,0.7,0.8), vec3(1.0,0.95,0.95), hash11(fi*2.2));
        }
      }
      float dsky = alpha > 0.5 ? 1.0 : 0.45;
      float dd = pow(clamp(luma(col)*1.5, 0.0, 1.0), 1.0);
      if (alpha > 0.5) dd = max(dd, 0.34 + 0.1*hash21(floor(uv*uGrid)));
      return shade(col*(alpha > 0.5 ? 1.25 : 1.0), dd*dsky);
    }
    `,
  });
})();
