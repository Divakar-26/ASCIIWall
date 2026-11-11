/* Firefly Meadow — night flowers in binary glyphs; fireflies gather around your cursor. */
(function () {
  const AW = window.AsciiWall;
  const NF = 16;

  AW.fireflySwarm = function (n) {
    return Array.from({ length: n }, () => ({
      x: (Math.random() - 0.5) * 1.6, y: Math.random() * 0.7 - 0.35,
      vx: 0, vy: 0, ph: Math.random() * 10, orbit: 0.08 + Math.random() * 0.22, dir: Math.random() < 0.5 ? -1 : 1, seed: Math.random() * 100,
    }));
  };
  AW.updateFireflies = function (flies, api, t, offset, yRange = [-0.4, 0.42]) {
    const dt = Math.min(api.dt, 0.05), A = api.aspect, m = api.mouse, D = api.data;
    flies.forEach((f, i) => {
      let ax = Math.sin(t * 0.7 + f.seed) * 0.08 + Math.sin(t * 0.23 + f.seed * 3) * 0.06;
      let ay = Math.cos(t * 0.6 + f.seed * 2) * 0.06;
      if (m.present) {
        const dx = m.px - f.x, dy = m.py - f.y, d = Math.hypot(dx, dy) + 1e-4;
        const tx = m.px + Math.cos(t * 0.8 * f.dir + f.seed) * f.orbit - f.x;
        const ty = m.py + Math.sin(t * 0.8 * f.dir + f.seed) * f.orbit * 0.8 - f.y;
        const w = m.on * Math.min(1, 0.25 / (d + 0.2));
        ax += tx * 1.2 * w; ay += ty * 1.2 * w;
      }
      const lim = A / 2 - 0.03;
      if (f.x > lim) ax -= 0.4; if (f.x < -lim) ax += 0.4;
      if (f.y > yRange[1]) ay -= 0.4; if (f.y < yRange[0]) ay += 0.4;
      f.vx = (f.vx + ax * dt) * Math.exp(-dt * 1.4);
      f.vy = (f.vy + ay * dt) * Math.exp(-dt * 1.4);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.ph += dt;
      const b = Math.pow(0.5 + 0.5 * Math.sin(f.ph * 1.7 + f.seed), 3);
      const o = (offset + i) * 4;
      D[o] = f.x; D[o + 1] = f.y; D[o + 2] = 0.25 + b; D[o + 3] = 1;
    });
  };

  AW.registerScene({
    id: "meadow",
    name: "Firefly Meadow",
    blurb: "Wildflowers at night, drawn in zeros and ones. Fireflies gather around your cursor and the flowers lean away as it passes.",
    tags: ["night", "nature", "interactive"],
    style: "glyph",
    ramp: "binary",
    bg: "#0b0a09",
    cell: 6,
    aspect: 1.55,
    glow: 1.1,
    shimmer: 0.03,
    ss: 2,
    edges: 0.35,
    init() { return { flies: AW.fireflySwarm(NF), t: 0 }; },
    update(st, api) { st.t += api.dt; AW.updateFireflies(st.flies, api, st.t, 0); },
    frag: /* glsl */ `
    vec3 petalColor(float r){
      vec3 c[7] = vec3[7](vec3(0.62,0.42,0.95), vec3(0.98,0.48,0.55), vec3(1.0,0.8,0.3), vec3(0.45,0.62,1.0),
                          vec3(0.95,0.93,0.88), vec3(1.0,0.6,0.3), vec3(0.4,0.82,0.72));
      return c[int(r*6.999)];
    }

    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      vec3 c = mix(vec3(0.015,0.015,0.03), vec3(0.05,0.045,0.07), uv.y);
      vec2 sc = floor(uv*uGrid);
      float st = step(0.993, hash21(sc)) * (0.4 + 0.6*sin(t*1.5 + hash21(sc+3.0)*40.0)) * smoothstep(0.0, 0.35, p.y);
      c += max(st, 0.0)*vec3(0.55,0.55,0.7);
      float haze = exp(-length((p - vec2(0.05,-0.6))*vec2(0.8,1.5))*2.0);
      c += vec3(0.3,0.19,0.09)*haze*0.55;

      for (int L=0; L<4; L++){
        float fl = float(L), k = fl/3.0;
        float gy = 0.1 - 0.165*fl;
        float sx = 0.075 + 0.05*fl;
        float atten = mix(0.5, 1.0, k);
        // bushes
        float bush = gy + 0.05*(1.0+fl*0.4)*(fbm3(vec2(p.x*(4.0-fl*0.6) + fl*13.0, fl*3.1))*1.8 - 0.3);
        if (p.y < bush) {
          float leaf = noise(p*(70.0 - fl*10.0) + fl*7.0);
          vec3 g = mix(vec3(0.07,0.17,0.09), vec3(0.2,0.38,0.17), leaf*leaf*1.4);
          g *= smoothstep(-0.7, bush, p.y)*0.8 + 0.25;
          c = g*atten + vec3(0.2,0.12,0.05)*haze*0.35;
        }
        // flowers
        float id = floor(p.x/sx);
        for (int j=-1; j<=1; j++){
          float cid = id + float(j);
          vec2 r = hash22(vec2(cid, fl*17.0));
          if (r.x < 0.15) continue;
          float bx = (cid + 0.5 + (r.y-0.5)*0.6)*sx;
          float sh = (0.06 + 0.11*r.x)*(0.75 + fl*0.22);
          vec2 base = vec2(bx, gy - 0.03);
          vec2 head = vec2(bx, gy + sh);
          float sway = sin(t*(0.55 + r.y*0.4) + cid*1.3 + fl)*0.012*(1.0 + fl*0.3);
          vec2 dm = head - uMouseP;
          float push = uMouseOn*exp(-dot(dm,dm)/0.012)*sign(dm.x + 1e-4)*0.05;
          head.x += sway + push;
          float stem = sdSeg(p, base, head);
          float sw_ = 0.0016*(1.0+fl*0.6); float aa = 1.0/uGrid.y;
          if (p.y > bush - 0.03) c = mix(c, vec3(0.22,0.45,0.2)*atten, smoothstep(sw_ + aa, sw_ - aa*0.5, stem));
          float R = (0.026 + 0.016*r.y)*(0.8 + fl*0.4);
          vec2 q = p - head; q.y *= 1.7;
          q = rot(sway*3.0 + push*4.0)*q;
          float d = length(q), a = atan(q.y, q.x);
          float N = 7.0 + floor(r.x*6.0);
          float pr = R*(0.5 + 0.5*pow(abs(cos(a*N*0.5)), 0.6));
          float cov = smoothstep(pr + aa, pr - aa, d);
          if (cov > 0.0) {
            vec3 pc = petalColor(hash21(vec2(cid, fl+3.0)));
            pc *= 0.65 + 0.45*smoothstep(R, R*0.2, d);
            pc = mix(pc, vec3(1.0,0.78,0.28)*0.9, smoothstep(R*0.3 + aa, R*0.3 - aa, d));
            c = mix(c, pc*atten, cov);
          }
        }
      }
      // fireflies
      for (int i=0; i<16; i++){
        vec4 f = uData[i];
        if (f.w < 0.5) continue;
        vec2 d = (p - f.xy)*REF;
        float g = exp(-dot(d,d)*0.5)*f.z;
        float halo = exp(-dot(d,d)*0.08)*f.z;
        c += vec3(1.0,0.9,0.45)*g*1.2 + vec3(0.45,0.4,0.12)*halo*0.12;
      }
      return shade(c);
    }
    `,
  });
})();
