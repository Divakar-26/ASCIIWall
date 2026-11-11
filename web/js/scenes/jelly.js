/* Jellyfish Drift — bioluminescent jellies pulse upward through light rays and marine snow. */
(function () {
  const N = 6;
  window.AsciiWall.registerScene({
    id: "jelly",
    name: "Jellyfish Drift",
    blurb: "Glowing jellyfish pulse up through shafts of light and drifting marine snow. They follow your cursor slowly and drift away from a tap.",
    tags: ["ocean", "calm", "interactive"],
    style: "glyph",
    ramp: "soft",
    bg: "#03070d",
    cell: 6,
    aspect: 1.55,
    glow: 1.3,
    shimmer: 0.08,
    ripple: { damp: 0.97, strength: 0.6, radius: 0.03 },
    init(api) {
      const A = api.aspect;
      const jellies = Array.from({ length: N }, (_, i) => ({
        x: ((i + 0.5) / N - 0.5) * A * 0.9 + (Math.random() - 0.5) * 0.1,
        y: Math.random() - 0.5, size: 0.06 + Math.random() * 0.06,
        hue: [0.92, 0.55, 0.78, 0.48, 0.0, 0.62][i], ph: Math.random(), vx: 0, vy: 0, tilt: 0,
      }));
      return { jellies };
    },
    update(st, api) {
      const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
      st.jellies.forEach((j, i) => {
        j.ph += dt * (0.45 + j.size * 2);
        const pulse = Math.pow(Math.max(0, Math.sin(j.ph * Math.PI * 2)), 2);
        j.vy += (pulse * 0.12 - 0.012) * dt * (0.6 / (j.size * 10));
        let ax = Math.sin(j.ph * 0.37 + i) * 0.004;
        if (m.present) {
          const dx = m.px - j.x, dy = m.py - j.y, d = Math.hypot(dx, dy) + 1e-3;
          if (d < 0.5) { ax += (dx / d) * 0.02 * m.on * (1 - d / 0.5); j.vy += (dy / d) * 0.012 * m.on * (1 - d / 0.5) * dt; }
        }
        for (const c of api.clicks) {
          const dx = j.x - c.px, dy = j.y - c.py, d = Math.hypot(dx, dy) + 1e-3;
          if (d < 0.35) { j.vx += (dx / d) * 0.15 * (1 - d / 0.35); j.vy += (dy / d) * 0.15 * (1 - d / 0.35); }
        }
        j.vx = (j.vx + ax * dt) * Math.exp(-dt * 0.8);
        j.vy *= Math.exp(-dt * 1.2);
        j.x += j.vx * dt; j.y += j.vy * dt;
        j.tilt += (Math.max(-0.5, Math.min(0.5, -j.vx * 8)) - j.tilt) * dt * 2;
        if (j.y > 0.5 + j.size * 2) { j.y = -0.5 - j.size * 3; j.x = (Math.random() - 0.5) * A * 0.85; }
        if (j.y < -0.5 - j.size * 4) j.y = -0.5 - j.size * 3;
        const lim = A / 2;
        if (j.x > lim) j.x -= A; if (j.x < -lim) j.x += A;
        D[i * 4] = j.x; D[i * 4 + 1] = j.y; D[i * 4 + 2] = j.size; D[i * 4 + 3] = j.ph;
        D[32 + i * 4] = j.hue; D[33 + i * 4] = j.tilt;
      });
    },
    frag: /* glsl */ `
    vec3 hueCol(float h){ return 0.55 + 0.45*cos(TAU*(h + vec3(0.0, 0.33, 0.67))); }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime;
      vec3 c = mix(vec3(0.01,0.025,0.05), vec3(0.03,0.09,0.15), smoothstep(-0.5, 0.6, p.y));
      // light shafts
      float ray = pow(noise(vec2(p.x*5.0 + p.y*1.6, t*0.08)), 3.0) + pow(noise(vec2(p.x*9.0 - p.y*2.0 + 4.0, t*0.11)), 4.0)*0.6;
      c += vec3(0.1,0.22,0.28)*ray*smoothstep(-0.4, 0.5, p.y)*0.8;
      // marine snow
      vec2 sg = (p + vec2(sin(t*0.1)*0.02, t*0.012))*vec2(REF*0.4);
      vec2 si = floor(sg);
      float sn = step(0.985, hash21(si))*smoothstep(0.5, 0.0, length(fract(sg)-0.5));
      c += vec3(0.4,0.5,0.55)*sn*0.5;

      for (int i=0; i<6; i++){
        vec4 J = uData[i];
        vec4 K = uData[8+i];
        float sz = J.z;
        vec2 q = rot(K.y)*(p - J.xy)/sz;
        if (q.y > 1.4 || q.y < -4.5 || abs(q.x) > 2.0) continue;
        float pulse = pow(max(0.0, sin(J.w*TAU)), 2.0);
        float bw = 1.0 - 0.18*pulse, bh = 0.75 + 0.12*pulse;
        vec3 hc = hueCol(K.x);
        // tentacles
        for (int k=0; k<6; k++){
          float fk = float(k);
          float x0 = (-0.75 + 0.3*fk)*bw;
          float yy = -q.y;
          float sway = sin(yy*2.4 - t*1.6 + fk*1.7 + J.w*3.0)*0.18*yy*0.4;
          float len = 2.8 + hash11(fk + float(i)*7.0)*1.4;
          if (yy > 0.0 && yy < len && abs(q.x - x0 - sway) < 0.045) c = max(c, hc*0.55*(1.0 - yy/len));
        }
        // oral arms
        for (int k=-1; k<=1; k+=2){
          float yy = -q.y;
          float ax = float(k)*0.12 + sin(yy*3.0 - t*1.2 + float(k))*0.12;
          float w = 0.11*(1.0 - yy/2.2) + 0.03*sin(yy*20.0);
          if (yy > 0.0 && yy < 2.2 && abs(q.x - ax) < w) c = max(c, mix(hc, vec3(1.0), 0.3)*0.75);
        }
        // bell
        vec2 b = vec2(q.x/bw, q.y/bh);
        float r = length(b);
        if (q.y > -0.08 && r < 1.0) {
          float rim = smoothstep(0.65, 1.0, r);
          float organ = smoothstep(0.12, 0.0, abs(length(b - vec2(0.0, 0.25)) - 0.28))*0.6;
          float stripes = 0.5 + 0.5*sin(atan(b.y, b.x)*14.0);
          vec3 bc = hc*(0.35 + 0.35*stripes*rim + rim*0.6) + vec3(1.0)*organ*0.35;
          c = mix(c, bc, 0.85);
        }
        // frill
        if (q.y < 0.0 && q.y > -0.18 && abs(q.x) < bw*(1.0 + 0.05*sin(q.x*30.0 + t*4.0))) c = max(c, hc*0.8);
        // glow halo
        c += hc*0.06*exp(-dot(q - vec2(0.0, 0.3), q - vec2(0.0, 0.3))*0.8);
      }
      return shade(c);
    }
    `,
  });
})();
