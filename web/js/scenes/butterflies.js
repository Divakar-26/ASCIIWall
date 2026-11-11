/* Butterflies — pink butterflies trailing glitter. They follow your cursor; touch one and it
 * shatters into sparkles, then gathers itself back together. */
(function () {
  const N = 5;
  window.AsciiWall.registerScene({
    id: "butterflies",
    name: "Butterflies",
    blurb: "Pink butterflies trailing glitter in the dark. They follow your cursor, and if you tap one it bursts into sparkles and then pieces itself back together.",
    tags: ["dreamy", "interactive"],
    style: "glyph",
    ramp: "sparkle",
    bg: "#050307",
    cell: 5,
    aspect: 1.7,
    glow: 0.9,
    underlay: 0.35,
    edges: 0.3,
    shimmer: 0.12,
    init(api) {
      const A = api.aspect;
      return {
        bs: Array.from({ length: N }, (_, i) => ({
          x: (Math.random() - 0.5) * A * 0.8, y: (Math.random() - 0.5) * 0.7, vx: 0, vy: 0, h: 0,
          ph: Math.random() * 6, size: 0.11 + Math.random() * 0.06, hue: i % 3, burst: 99, seed: Math.random() * 100,
        })),
        t: 0,
      };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
      st.t += dt;
      st.bs.forEach((b, i) => {
        for (const c of api.clicks) if (Math.hypot(c.px - b.x, c.py - b.y) < b.size * 1.6 && b.burst > 3) b.burst = 0;
        b.burst += dt;
        let ax = Math.sin(st.t * 0.5 + b.seed) * 0.15 + Math.sin(st.t * 1.3 + b.seed * 2) * 0.08;
        let ay = Math.cos(st.t * 0.45 + b.seed * 3) * 0.12;
        if (m.present) {
          const tx = m.px + Math.cos(st.t * 0.6 + i * 1.26) * 0.3, ty = m.py + Math.sin(st.t * 0.5 + i * 1.26) * 0.2;
          ax += (tx - b.x) * 0.9 * m.on; ay += (ty - b.y) * 0.9 * m.on;
        }
        for (const o of st.bs) {
          if (o === b) continue;
          const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) + 1e-4, r = (b.size + o.size) * 1.3;
          if (d < r) { ax += (dx / d) * (1 - d / r) * 2.5; ay += (dy / d) * (1 - d / r) * 2.5; }
        }
        const lim = A / 2 - 0.08;
        if (b.x > lim) ax -= 0.6; if (b.x < -lim) ax += 0.6; if (b.y > 0.4) ay -= 0.6; if (b.y < -0.4) ay += 0.6;
        b.vx = (b.vx + ax * dt) * Math.exp(-dt * 1.2); b.vy = (b.vy + ay * dt) * Math.exp(-dt * 1.2);
        b.x += b.vx * dt; b.y += b.vy * dt;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 0.005) {
          const target = Math.atan2(b.vy, b.vx) - Math.PI / 2;           // body points along the flight
          const diff = Math.atan2(Math.sin(target - b.h), Math.cos(target - b.h));
          b.h += diff * Math.min(1, dt * 3);
        }
        b.ph += dt * (7 + sp * 30);
        D[i * 4] = b.x; D[i * 4 + 1] = b.y; D[i * 4 + 2] = b.size; D[i * 4 + 3] = b.ph;
        D[32 + i * 4] = b.h; D[33 + i * 4] = b.hue; D[34 + i * 4] = b.burst; D[35 + i * 4] = b.seed;
        D[64 + i * 4] = b.vx; D[65 + i * 4] = b.vy;
      });
    },
    frag: /* glsl */ `
    // wing silhouette in polar form around the body root; returns radius ratio (<1 inside)
    float wing(vec2 q, out float ang){
      ang = atan(q.y, q.x);
      float rr;
      if (ang > 0.0) rr = 1.08*pow(sin(clamp(ang*1.9 + 0.12, 0.0, PI)), 0.55)*(1.0 + 0.12*sin(ang*9.0)*smoothstep(0.4, 1.2, ang));
      else           rr = 0.74*pow(sin(clamp(-ang*2.1 + 0.15, 0.0, PI)), 0.6)*(1.0 + 0.25*smoothstep(-0.9, -1.3, ang));
      return length(q)/max(rr, 1e-3);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec3 col = vec3(0.02,0.01,0.025);
      col += vec3(0.25,0.08,0.18)*smoothstep(0.62, 0.9, fbm3(p*2.5 + t*0.02))*0.25;     // pink haze
      for (int i=0; i<5; i++){
        vec4 B = uData[i]; vec4 K = uData[8+i]; vec2 V = uData[16+i].xy;
        float burst = K.z;
        float sz = B.z;
        // glitter trail
        for (int k=0; k<10; k++){
          float fk = float(k);
          vec2 tp = B.xy - V*fk*0.35 + 0.03*vec2(hash11(fk + K.w) - 0.5, hash11(fk*2.0 + K.w) - 0.5)*fk*0.3;
          tp.y -= fk*0.004;
          float tw = 0.5 + 0.5*sin(t*9.0 + fk*2.3 + K.w);
          float dd = length((p - tp)*REF);
          col += vec3(1.0,0.85,0.95)*exp(-dd*dd*2.5)*tw*(1.0 - fk/10.0)*0.9;
        }
        if (burst < 3.0) {
          // shattered: sparkles fly out then gather back
          float out_ = burst < 1.2 ? burst/1.2 : max(0.0, 1.0 - (burst - 1.2)/1.8);
          for (int k=0; k<26; k++){
            float fk = float(k);
            vec2 h = vec2(hash11(fk*3.1 + K.w), hash11(fk*7.7 + K.w)) - 0.5;
            vec2 sp = B.xy + h*sz*1.6 + normalize(h + 1e-3)*out_*0.22*(0.5 + hash11(fk));
            float dd = length((p - sp)*REF);
            col += mix(vec3(1.0,0.5,0.75), vec3(1.0), hash11(fk))*exp(-dd*dd*1.5)*(0.6 + 0.4*sin(t*12.0 + fk));
          }
          if (burst < 1.8) continue;
        }
        vec2 q = rot(-K.x)*(p - B.xy)/sz;
        float flap = abs(cos(B.w));
        float ws = 0.2 + 0.8*flap;
        float side = sign(q.x);
        vec2 wq = vec2(abs(q.x)/ws, q.y);
        float ang;
        float w = wing(wq, ang);
        float form = burst < 3.0 ? smoothstep(1.8, 3.0, burst) : 1.0;
        if (w < form) {
          vec3 pink = K.y < 0.5 ? vec3(1.0,0.42,0.7) : (K.y < 1.5 ? vec3(0.92,0.5,0.95) : vec3(1.0,0.55,0.5));
          vec3 c = mix(vec3(0.45,0.06,0.3), pink*1.15, smoothstep(0.05, 0.55, w));
          c = mix(c, vec3(1.0,0.9,0.96), smoothstep(0.62, 0.86, w));
          float vein = smoothstep(0.1, 0.0, abs(sin(ang*7.0 + w*0.8)))*smoothstep(0.12, 0.3, w)*step(w, 0.9);
          c = mix(c, vec3(0.15,0.02,0.1), vein*0.75);
          c = mix(c, vec3(0.12,0.02,0.08), smoothstep(0.9, 0.96, w));                         // black rim
          float spots = smoothstep(0.35, 0.0, abs(fract(ang*5.0) - 0.5))*smoothstep(0.92, 0.97, w);
          c = mix(c, vec3(1.0), spots);                                                         // white rim spots
          vec2 eye = wq - vec2(0.55, 0.42);
          float er = length(eye);
          if (er < 0.13) c = er < 0.06 ? vec3(0.1,0.02,0.08) : vec3(1.0,0.92,0.6);              // eyespot
          c *= 0.7 + 0.4*flap;
          col = c;
        }
        // body + antennae
        if (length(q/vec2(0.06, 0.32)) < 1.0) col = vec3(0.2,0.08,0.15);
        if (q.y > 0.25 && q.y < 0.6 && abs(abs(q.x) - (q.y - 0.25)*0.5) < 0.02) col = vec3(0.35,0.15,0.25);
      }
      return shade(col);
    }
    `,
  });
})();
