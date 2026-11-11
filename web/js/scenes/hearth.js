/* Hearth — a campfire under the pines. Your cursor is the wind; tap for a shower of sparks. */
(function () {
  window.AsciiWall.registerScene({
    id: "hearth",
    name: "Hearth",
    blurb: "A small campfire under the pines. Your cursor acts as the wind, and a click sends up a shower of sparks.",
    tags: ["fire", "night", "cozy", "interactive"],
    style: "glyph",
    ramp: "fire",
    bg: "#090605",
    cell: 6,
    aspect: 1.55,
    glow: 1.25,
    shimmer: 0.1,
    init() { return { wind: 0, burst: 99, bx: 0, t: 0 }; },
    update(st, api) {
      const dt = api.dt, m = api.mouse;
      st.t += dt;
      const breeze = Math.sin(st.t * 0.3) * 0.15 + Math.sin(st.t * 0.83) * 0.08;
      let target = breeze;
      if (m.present) target += Math.max(-1, Math.min(1, m.vx * 0.9)) * m.on + Math.max(-0.4, Math.min(0.4, -m.px * 0.25)) * m.on;
      st.wind += (target - st.wind) * Math.min(1, dt * 1.8);
      st.burst += dt;
      if (api.clicks.length) { st.burst = 0; st.bx = api.clicks[0].px; }
      api.data[0] = st.wind; api.data[1] = st.burst; api.data[2] = st.bx;
    },
    frag: /* glsl */ `
    vec3 fireRamp(float f){
      return vec3(1.0,0.32,0.06)*smoothstep(0.0,0.35,f) + vec3(0.0,0.42,0.12)*smoothstep(0.3,0.7,f) + vec3(0.0,0.2,0.38)*smoothstep(0.65,1.0,f);
    }
    vec4 scene(vec2 uv, vec2 p){
      float t = uTime, A = uAspect;
      float wind = uData[0].x, burst = uData[0].y;
      vec2 F = vec2(0.0, -0.3);
      float lightD = length((p - F - vec2(0.0, 0.08))*vec2(0.8, 1.2));
      float flick = 0.85 + 0.15*noise1(t*6.0) + 0.06*sin(t*17.0);
      vec3 warm = vec3(1.0,0.5,0.18)*flick;

      vec3 c = mix(vec3(0.05,0.045,0.08), vec3(0.06,0.07,0.14), uv.y);
      vec2 sc = floor(uv*uGrid);
      c += step(0.994, hash21(sc))*(0.5+0.5*sin(t*1.3 + hash21(sc+1.0)*30.0))*vec3(0.5,0.5,0.65)*smoothstep(0.0, 0.3, p.y);
      // pines
      for (int L=0; L<2; L++){
        float fl = float(L);
        float w = 0.08 + fl*0.05;
        float id = floor((p.x + fl*0.21)/w);
        float lx = fract((p.x + fl*0.21)/w) - 0.5;
        float h = 0.18 + hash11(id*3.1 + fl)*0.22 + fl*0.06;
        float base = -0.1 - fl*0.04;
        float yy = (p.y - base)/h;
        float width = (1.0 - yy)*0.42*(0.75 + 0.25*abs(sin(yy*14.0)));
        if (yy > 0.0 && yy < 1.0 && abs(lx) < width && hash11(id + fl*7.0) > 0.15) c = mix(vec3(0.03,0.045,0.06), vec3(0.015,0.02,0.025), fl);
      }
      // ground
      if (p.y < -0.12 - 0.02*fbm3(vec2(p.x*3.0, 0.0))) {
        c = vec3(0.05,0.04,0.03)*(0.7 + 0.5*noise(p*vec2(40.0, 70.0)));
        c += warm*0.6*exp(-lightD*3.5);
      }
      c += warm*0.07*exp(-lightD*2.5);

      // stones
      for (int i=0;i<10;i++){
        float a = float(i)/10.0*TAU + 0.3;
        vec2 sp = F + vec2(cos(a)*0.2, sin(a)*0.05 - 0.07);
        float r = 0.026 + 0.008*hash11(float(i));
        float d = length((p - sp)*vec2(1.0, 1.3));
        if (d < r && (sin(a) < 0.2 || p.y < F.y - 0.05)) {
          float lit = clamp(dot(normalize(F - sp), normalize(p - sp + 1e-4)), 0.0, 1.0);
          c = vec3(0.28,0.26,0.25)*(0.45 + 0.4*noise(p*90.0)) + warm*lit*0.55;
        }
      }
      // logs
      float l1 = sdSeg(p, F + vec2(-0.15,-0.08), F + vec2(0.13,-0.02)) - 0.022;
      float l2 = sdSeg(p, F + vec2(-0.12,-0.02), F + vec2(0.15,-0.09)) - 0.022;
      if (min(l1, l2) < 0.0) {
        float crack = smoothstep(0.62, 0.75, noise(p*vec2(70.0, 40.0) + t*0.3));
        c = vec3(0.2,0.11,0.06)*(0.6 + 0.6*noise(p*vec2(120.0, 20.0)));
        c += vec3(1.0,0.35,0.08)*crack*(0.6 + 0.4*sin(t*2.0 + p.x*30.0));
      }
      // flame
      vec2 f = p - F;
      float hgt = clamp(f.y/0.42, 0.0, 1.0);
      f.x -= wind*hgt*hgt*0.18;
      float n = fbm(vec2(f.x*7.0, f.y*4.5 - t*2.4));
      float n2 = noise(vec2(f.x*14.0, f.y*9.0 - t*4.0));
      float width = 0.12*pow(1.0 - hgt, 0.85) + 0.004;
      float inside = width - abs(f.x + (n - 0.5)*0.07*(hgt + 0.25));
      float fire = clamp(inside*11.0 + (n - 0.45)*1.1 + (n2-0.5)*0.4 - hgt*0.75, 0.0, 1.0) * step(-0.03, f.y);
      fire *= flick;
      if (fire > 0.02) c = max(c, fireRamp(fire)*1.1);
      // embers
      for (int i=0; i<34; i++){
        float fi = float(i);
        float rate = 0.18 + 0.2*hash11(fi*1.7);
        float ph = fract(t*rate + hash11(fi*4.1));
        vec2 ep = F + vec2((hash11(fi*2.3)-0.5)*0.12, 0.02);
        ep += vec2(wind*ph*ph*0.5 + sin(ph*9.0 + fi)*0.025, ph*0.75);
        float d = length((p - ep)*REF);
        float b = (1.0 - ph)*(0.6 + 0.4*sin(t*9.0 + fi));
        c += vec3(1.0,0.55,0.15)*exp(-d*d*0.9)*b*1.2;
      }
      // click sparks
      if (burst < 2.5) {
        for (int i=0; i<26; i++){
          float fi = float(i);
          float a = PI*0.5 + (hash11(fi*5.3)-0.5)*2.2;
          float sp = 0.35 + 0.4*hash11(fi*9.1);
          vec2 sv = vec2(cos(a), sin(a))*sp;
          vec2 sp0 = F + vec2(0.0, 0.08);
          vec2 pos = sp0 + sv*burst + vec2(wind*0.2, -0.35)*burst*burst;
          float d = length((p - pos)*REF);
          c += vec3(1.0,0.75,0.35)*exp(-d*d*1.2)*max(0.0, 1.0 - burst/2.5)*1.5;
        }
      }
      return shade(c);
    }
    `,
  });
})();
